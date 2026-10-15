package api

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"notiback/internal/models"
	"notiback/internal/store"
)

const maxGroupName = 80

// loadGroup carga el grupo de la ruta y comprueba que el usuario puede verlo (admin,
// dueño o miembro). Con manage = true exige además poder gestionarlo (admin, o el boss dueño).
func (s *Server) loadGroup(c *gin.Context, manage bool) (models.Group, bool) {
	ctx := c.Request.Context()
	user := currentUser(c)
	g, err := s.store.GetGroup(ctx, c.Param("id"))
	if err != nil {
		writeStoreError(c, err)
		return g, false
	}
	isOwner := g.OwnerID == user.ID
	if manage {
		if user.IsAdmin() || (isOwner && user.CanManageGroups()) {
			return g, true
		}
		writeError(c, http.StatusForbidden, "Solo el boss que creó el grupo o un administrador puede modificarlo")
		return g, false
	}
	if user.IsAdmin() || isOwner {
		return g, true
	}
	member, err := s.store.IsGroupMember(ctx, g.ID, user.ID)
	if err != nil {
		writeStoreError(c, err)
		return g, false
	}
	if !member {
		// No se revela que el grupo existe
		writeStoreError(c, store.ErrNotFound)
		return g, false
	}
	return g, true
}

type groupBody struct {
	Name        *string `json:"name"`
	Description *string `json:"description"`
}

func cleanGroupName(name string) (string, string) {
	name = strings.TrimSpace(name)
	switch {
	case name == "":
		return "", "El nombre del grupo es obligatorio"
	case len([]rune(name)) > maxGroupName:
		return "", "El nombre del grupo no puede superar 80 caracteres"
	}
	return name, ""
}

// listGroups: el admin ve todos (?scope=all); el resto, los que creó o a los que pertenece.
func (s *Server) listGroups(c *gin.Context) {
	groups, err := s.store.ListGroups(c.Request.Context(), currentUser(c).ID, scopeAll(c))
	if err != nil {
		writeStoreError(c, err)
		return
	}
	c.JSON(http.StatusOK, groups)
}

func (s *Server) createGroup(c *gin.Context) {
	var body groupBody
	if err := c.ShouldBindJSON(&body); err != nil || body.Name == nil {
		writeError(c, http.StatusBadRequest, "El nombre del grupo es obligatorio")
		return
	}
	name, problem := cleanGroupName(*body.Name)
	if problem != "" {
		writeError(c, http.StatusBadRequest, problem)
		return
	}
	desc := ""
	if body.Description != nil {
		desc = strings.TrimSpace(*body.Description)
	}
	g, err := s.store.CreateGroup(c.Request.Context(), currentUser(c).ID, name, desc)
	if errors.Is(err, store.ErrConflict) {
		writeError(c, http.StatusConflict, "Ya tienes un grupo con ese nombre")
		return
	}
	if err != nil {
		writeStoreError(c, err)
		return
	}
	g.Members = []models.GroupMember{}
	c.JSON(http.StatusCreated, g)
}

// getGroup devuelve el grupo con sus miembros.
func (s *Server) getGroup(c *gin.Context) {
	g, ok := s.loadGroup(c, false)
	if !ok {
		return
	}
	members, err := s.store.GroupMembers(c.Request.Context(), g.ID)
	if err != nil {
		writeStoreError(c, err)
		return
	}
	g.Members = members
	c.JSON(http.StatusOK, g)
}

func (s *Server) updateGroup(c *gin.Context) {
	g, ok := s.loadGroup(c, true)
	if !ok {
		return
	}
	var body groupBody
	if err := c.ShouldBindJSON(&body); err != nil {
		writeError(c, http.StatusBadRequest, "JSON inválido")
		return
	}
	name, desc := g.Name, g.Description
	if body.Name != nil {
		var problem string
		if name, problem = cleanGroupName(*body.Name); problem != "" {
			writeError(c, http.StatusBadRequest, problem)
			return
		}
	}
	if body.Description != nil {
		desc = strings.TrimSpace(*body.Description)
	}
	updated, err := s.store.UpdateGroup(c.Request.Context(), g.ID, name, desc)
	if errors.Is(err, store.ErrConflict) {
		writeError(c, http.StatusConflict, "Ya existe un grupo con ese nombre")
		return
	}
	if err != nil {
		writeStoreError(c, err)
		return
	}
	c.JSON(http.StatusOK, updated)
}

// deleteGroup hace un borrado lógico (status = 'deleted').
func (s *Server) deleteGroup(c *gin.Context) {
	g, ok := s.loadGroup(c, true)
	if !ok {
		return
	}
	if err := s.store.DeleteGroup(c.Request.Context(), g.ID); err != nil {
		writeStoreError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

// addGroupMembers: {"userIds": [...], "emails": [...]}
func (s *Server) addGroupMembers(c *gin.Context) {
	g, ok := s.loadGroup(c, true)
	if !ok {
		return
	}
	var body struct {
		UserIDs []string `json:"userIds"`
		Emails  []string `json:"emails"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || len(body.UserIDs)+len(body.Emails) == 0 {
		writeError(c, http.StatusBadRequest, "Indica userIds o emails")
		return
	}
	if len(body.UserIDs)+len(body.Emails) > 500 {
		writeError(c, http.StatusBadRequest, "Como máximo 500 miembros por petición")
		return
	}
	added, unknown, err := s.store.AddGroupMembers(c.Request.Context(), g.ID, currentUser(c).ID, body.UserIDs, body.Emails)
	if err != nil {
		writeStoreError(c, err)
		return
	}
	members, err := s.store.GroupMembers(c.Request.Context(), g.ID)
	if err != nil {
		writeStoreError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"added": added, "unknownEmails": unknown, "members": members})
}

func (s *Server) removeGroupMember(c *gin.Context) {
	g, ok := s.loadGroup(c, true)
	if !ok {
		return
	}
	if err := s.store.RemoveGroupMember(c.Request.Context(), g.ID, c.Param("userId")); err != nil {
		writeStoreError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

// ---------- Usuarios ----------

// listUsers: GET /api/users?q=&limit=. El admin lista a todos; un boss solo busca
// (mínimo 2 caracteres, hasta 20 resultados) para añadir miembros a sus grupos.
func (s *Server) listUsers(c *gin.Context) {
	user, q := currentUser(c), strings.TrimSpace(c.Query("q"))
	limit := 20
	if user.IsAdmin() {
		limit = 200
		if v, err := strconv.Atoi(c.Query("limit")); err == nil && v > 0 && v <= 1000 {
			limit = v
		}
	} else if len([]rune(q)) < 2 {
		writeError(c, http.StatusBadRequest, "Escribe al menos 2 caracteres para buscar")
		return
	}
	users, err := s.store.ListUsers(c.Request.Context(), q, limit)
	if err != nil {
		writeStoreError(c, err)
		return
	}
	c.JSON(http.StatusOK, users)
}

// updateUser (solo admin): {"userType": "admin" | "boss" | "user"}
func (s *Server) updateUser(c *gin.Context) {
	var body struct {
		UserType models.UserType `json:"userType"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || !body.UserType.Valid() {
		writeError(c, http.StatusBadRequest, "userType debe ser 'admin', 'boss' o 'user'")
		return
	}
	id := c.Param("id")
	if id == currentUser(c).ID && body.UserType != models.UserAdmin {
		writeError(c, http.StatusBadRequest, "No puedes quitarte el rol de administrador a ti mismo")
		return
	}
	u, err := s.store.SetUserType(c.Request.Context(), id, body.UserType)
	if err != nil {
		writeStoreError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"user": u.Public()})
}
