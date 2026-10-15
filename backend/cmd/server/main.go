package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"

	"notiback/internal/api"
	"notiback/internal/config"
	"notiback/internal/db"
	"notiback/internal/sse"
	"notiback/internal/store"
)

func main() {
	cfg := config.Load()
	if mode := os.Getenv("GIN_MODE"); mode != "" {
		gin.SetMode(mode) // .env se carga después del init de gin
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()

	if err := db.Migrate(ctx, pool); err != nil {
		log.Fatalf("migraciones: %v", err)
	}
	log.Println("base de datos lista (migraciones aplicadas)")

	st := store.New(pool)
	if n, err := st.PromoteAdmins(ctx, cfg.AdminEmails); err != nil {
		log.Fatalf("ADMIN_EMAILS: %v", err)
	} else if n > 0 {
		log.Printf("%d usuario(s) promovidos a admin por ADMIN_EMAILS", n)
	}

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           api.New(st, sse.NewHub(), cfg).Router(),
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		log.Printf("Noticket backend escuchando en http://localhost:%s (POST /webhook)", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatal(err)
		}
	}()

	<-ctx.Done()
	log.Println("apagando servidor...")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	srv.Shutdown(shutdownCtx)
}
