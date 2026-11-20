# PulseDesk

**Centro de notificaciones de escritorio para webhooks.** Conecta tus servicios (CI, monitorización, pagos, formularios, tu propio servidor…) mediante webhooks y recibe avisos en el escritorio, con historial, calendario, repetición hasta marcar como visto y reparto a grupos de personas.

Funciona **sin servidor** (la app de escritorio recibe los webhooks y los guarda en SQLite) o **con servidor** (backend en Go + PostgreSQL, con cuentas, roles, grupos y avisos en tiempo real por SSE).

[![Licencia: MIT](https://img.shields.io/badge/licencia-MIT-blue.svg)](LICENSE)
![Tauri 2](https://img.shields.io/badge/Tauri-2-24C8DB)
![React 19](https://img.shields.io/badge/React-19-61DAFB)
![Go](https://img.shields.io/badge/Go-1.26-00ADD8)

---

## Índice

- [Características](#características)
- [Arquitectura](#arquitectura)
- [Requisitos](#requisitos)
- [Puesta en marcha](#puesta-en-marcha)
- [Configuración](#configuración)
- [Enviar avisos](#enviar-avisos)
- [Conexiones configurables](#conexiones-configurables)
- [Roles y grupos](#roles-y-grupos)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Scripts](#scripts)
- [Tests](#tests)
- [Seguridad](#seguridad)
- [Contribuir](#contribuir)
- [Licencia](#licencia)

---

## Características

- **Avisos de escritorio** en una ventana propia (esquina inferior derecha), con sonido según el tipo (éxito, alerta, error, calendario, info). Siguen funcionando con la app minimizada en la bandeja.
- **Inicio con Windows**: la app instalada arranca sola al encender el equipo y se queda en la bandeja, recibiendo avisos sin necesidad de abrirla. Se activa en el primer arranque y se puede desactivar en **Ajustes → Iniciar con Windows**.
- **Conexiones configurables**: una URL por servicio (`/webhook/<id>`), cada una con:
  - su propio **secreto**, que se puede regenerar;
  - **activar / pausar**;
  - **aviso emergente** y **sonido** por separado;
  - **repetir el aviso** cada N minutos hasta marcarlo como visto;
  - **diseño del aviso**: cinco estilos (Clásico, Compacto, Destacado, Sólido y Minimal), color e icono propios o según el tipo, tiempo en pantalla (de 4 s a «hasta cerrarlo») y mostrar u ocultar el origen y la hora;
  - **mapeo de campos**: qué parte del JSON es el título, el mensaje, el tipo, la fecha… con rutas (`pull_request.title`) o plantillas (`PR #{{number}}: {{pull_request.title}}`) y vista previa en vivo;
  - plantillas de partida (GitHub, Stripe, Agenda).
- **Detección automática** para payloads sin configurar: `title`, `message`, `type`/`level`/`status`, `date`, `time`, `source`, `category`…
- **Historial** con filtros, lectura y borrado múltiple.
- **Calendario**: los webhooks con fecha se agendan solos y avisan a su hora.
- **Modo local (sin servidor)** en la app de escritorio: todo en SQLite. Al iniciar sesión, «Sincronizar» lo sube al servidor.
- **Modo servidor**: cuentas (correo y contraseña o Google), roles `user` / `boss` / `admin`, grupos y envío de notificaciones a varios usuarios a la vez.
- Tema claro / oscuro y color de acento personalizable.

## Arquitectura

```mermaid
flowchart LR
    S[Servicio externo<br/>GitHub, Stripe, CI…] -- "POST /webhook/&lt;id&gt;" --> T
    S -- "POST /webhook/&lt;id&gt;" --> B

    subgraph Escritorio["App de escritorio (Tauri)"]
        T[Servidor HTTP Rust<br/>puerto 3690] --> DB[(SQLite)]
        T --> P[Ventana de avisos]
        T --> UI[Interfaz React]
    end

    subgraph Servidor["Backend (opcional)"]
        B[notiback<br/>Go + Gin] --> PG[(PostgreSQL)]
    end

    B -- "SSE /api/events" --> UI
    UI -- "API REST" --> B
```

| Parte             | Tecnología                                                                                             | Carpeta                   |
| ----------------- | ------------------------------------------------------------------------------------------------------ | ------------------------- |
| Interfaz          | React 19, TypeScript, Vite, Tailwind CSS 4                                                             | [`src/`](src)             |
| App de escritorio | Tauri 2 (Rust): bandeja, ventana de avisos, servidor HTTP local, SQLite, programación de recordatorios | [`src-tauri/`](src-tauri) |
| Backend           | Go, Gin, pgx, PostgreSQL, SSE                                                                          | [`backend/`](backend)     |

**Modos de funcionamiento**

|                                                    | Sin sesión (local)                                                   | Con sesión (servidor)                                      |
| -------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------- |
| Dónde se guardan conexiones, historial y calendario | SQLite en el equipo (app de escritorio) o `localStorage` (navegador) | PostgreSQL                                                 |
| URL de los webhooks                                | `http://<IP-del-equipo>:3690/webhook/<id>`                           | `<API_URL>/webhook/<id>`                                   |
| Recibe webhooks                                    | Mientras la app está abierta o en la bandeja                         | Siempre (el servidor los guarda y los entrega al conectar) |
| Cuentas, roles y grupos                            | —                                                                    | Sí                                                         |

> En el navegador sin sesión no hay nada que reciba HTTP: las conexiones solo están disponibles en la app de escritorio o con sesión.

## Requisitos

| Herramienta                              | Versión                                                                                           | Para                        |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------- |
| [Node.js](https://nodejs.org)            | 22 o superior                                                                                     | Interfaz                    |
| [pnpm](https://pnpm.io)                  | 12.5.1 (fijada en `package.json`)                                                                 | Dependencias de la interfaz |
| [Rust](https://rustup.rs)                | 1.90 o superior                                                                                   | App de escritorio           |
| Requisitos de Tauri                      | [ver guía](https://v2.tauri.app/start/prerequisites/) (en Windows: WebView2 y Build Tools de C++) | App de escritorio           |
| [Go](https://go.dev)                     | 1.26 o superior                                                                                   | Backend                     |
| [PostgreSQL](https://www.postgresql.org) | 13 o superior                                                                                     | Backend                     |

El backend es opcional: la app de escritorio funciona sola.

## Puesta en marcha

```bash
git clone https://github.com/jarccy/noticket.git
cd noticket
pnpm install
```

### Opción A · Solo la app de escritorio (sin servidor)

```bash
pnpm tauri dev
```

La primera compilación tarda unos minutos (Rust y SQLite). Al abrirse, ve a **Conexiones → Nueva conexión** y usa la URL y el secreto que aparecen. Para enviarle avisos, mira [Enviar avisos](#enviar-avisos).

Para generar el instalador:

```bash
pnpm tauri build
```

### Opción B · Con servidor (web o escritorio)

1. **Base de datos.** Crea la base:

   ```bash
   createdb -U postgres dbnoticket
   ```

2. **Backend.** Configura y arranca. Las migraciones se aplican solas al iniciar:

   ```bash
   cd backend
   cp .env.example .env      # en Windows: copy .env.example .env
   # edita DATABASE_URL (y ADMIN_EMAILS si quieres un admin)
   go run ./cmd/server
   ```

   Queda escuchando en `http://localhost:8080`.

3. **Interfaz.** En otra terminal, desde la raíz:

   ```bash
   pnpm dev                  # navegador: http://localhost:5173
   # o
   pnpm tauri dev            # app de escritorio
   ```

4. Regístrate o inicia sesión y crea tu primera conexión en la pestaña **Conexiones**.

<details>
<summary><b>Problema conocido: «pnpm no se reconoce como un comando» en Windows</b></summary>

Si tu pnpm global es anterior a la 12, puede descargar pnpm 12.5.1 sin ejecutar su script de instalación, y queda un ejecutable incompleto. Solución: actualiza el pnpm global (`npm i -g pnpm@12`), o ejecuta `node install.js` dentro de `%LOCALAPPDATA%\pnpm\.tools\pnpm\12.5.1\node_modules\pnpm`.

</details>

## Configuración

### Interfaz

| Variable       | Por defecto             | Descripción     |
| -------------- | ----------------------- | --------------- |
| `VITE_API_URL` | `http://localhost:8080` | URL del backend |

### Backend (`backend/.env`)

| Variable                                                            | Por defecto                                                              | Descripción                                                                                   |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                      | `postgres://postgres:postgres@localhost:5432/dbnoticket?sslmode=disable` | Conexión a PostgreSQL                                                                         |
| `PORT`                                                              | `8080`                                                                   | Puerto HTTP                                                                                   |
| `FRONTEND_URL`                                                      | `http://localhost:5173`                                                  | URL de la interfaz (redirecciones de login y enlaces de correo)                               |
| `CORS_ORIGINS`                                                      | `FRONTEND_URL`                                                           | Orígenes permitidos, separados por coma                                                       |
| `PUBLIC_URL`                                                        | `http://localhost:PORT`                                                  | URL pública del backend (callback de Google)                                                  |
| `ADMIN_EMAILS`                                                      | —                                                                        | Correos que serán admin. Solo se aplica a cuentas con el correo verificado (login con Google) |
| `TRUSTED_PROXIES`                                                   | —                                                                        | IPs o CIDR de proxies inversos de confianza. Vacío = no se confía en `X-Forwarded-For`        |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`                          | —                                                                        | Login con Google (opcional)                                                                   |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | —                                                                        | Correo de «restablecer contraseña». Sin SMTP, el enlace se imprime en el log                  |
| `GIN_MODE`                                                          | `debug`                                                                  | `debug` o `release`                                                                           |

Todos los endpoints de la API, las tablas y el modelo de borrado lógico están documentados en [`backend/README.md`](backend/README.md).

## Enviar avisos

Un aviso es cualquier `POST` con un cuerpo JSON a la dirección de una **conexión**. Cada conexión tiene su URL y su **secreto**; los encontrarás en **Conexiones → (tu conexión) → Conexión**, donde también hay un ejemplo con `curl` listo para copiar y un botón **Probar**.

El secreto se puede enviar de tres formas:

| Forma | Ejemplo |
| --- | --- |
| Cabecera dedicada (recomendada) | `x-webhook-secret: whs_...` |
| Cabecera de autorización | `Authorization: Bearer whs_...` |
| En la URL, para servicios que no permiten cabeceras | `.../webhook/ep_XXXX?secret=whs_...` |

### ¿Qué dirección uso?

| Desde dónde envías | Dirección | Requisitos |
| --- | --- | --- |
| El mismo equipo donde está PulseDesk | `http://localhost:3690/webhook/<id>` | La app abierta o en la bandeja |
| Otra PC o dispositivo de la misma red | `http://<IP-del-equipo>:3690/webhook/<id>` (opción **«Desde la red»**) | Puerto 3690 permitido en el firewall |
| Internet (otra ciudad, GitHub, Stripe, tu web publicada…) | La de un túnel, o la del servidor si usas el backend | Ver [Desde internet](#desde-internet) |
| Con sesión iniciada | `<API_URL>/webhook/<id>`, la que muestra la app | El backend en marcha |

> **Con sesión iniciada** las conexiones viven en el servidor: el puerto 3690 de la app las rechaza (`409`) y hay que usar la URL del backend.

### Desde el mismo equipo

PowerShell:

```powershell
Invoke-RestMethod -Method Post -Uri "http://localhost:3690/webhook/ep_XXXXXXXX" `
  -Headers @{ "x-webhook-secret" = "whs_XXXXXXXX" } `
  -ContentType "application/json" `
  -Body '{"title":"Despliegue completado","message":"v2.3.1 en producción","type":"success"}'
```

curl (en PowerShell escribe `curl.exe`; `curl` a secas es otro comando):

```bash
curl -X POST http://localhost:3690/webhook/ep_XXXXXXXX \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: whs_XXXXXXXX" \
  -d '{"title":"Despliegue completado","message":"v2.3.1 en producción","type":"success"}'
```

Si todo va bien responde `{"status":"success","message":"Webhook recibido",...}` y el aviso aparece en pantalla.

### Desde otra PC de la misma red

1. En la conexión, elige **«Desde la red»**: la URL lleva la IP de tu equipo, por ejemplo `http://192.168.1.50:3690/webhook/ep_XXXXXXXX`.
2. Permite el puerto 3690 en el firewall del equipo que tiene PulseDesk. Si Windows no lo preguntó, en PowerShell **como administrador**:

   ```powershell
   New-NetFirewallRule -DisplayName "PulseDesk 3690" -Direction Inbound -Protocol TCP -LocalPort 3690 -Action Allow -Profile Private
   ```

   La red debe estar marcada como **Privada** (Configuración → Red e Internet → propiedades de la red).
3. Envía desde la otra PC con el mismo comando, cambiando `localhost` por la IP.

La IP puede cambiar si el router la reasigna: si deja de funcionar, vuelve a copiar la URL o fija la IP del equipo en el router.

### Desde una app web

Envía el aviso **desde el servidor de tu app**, no desde el navegador: si el secreto está en el JavaScript de la página, cualquiera que la abra puede verlo y enviarte avisos. Ejemplo en Node.js:

```js
await fetch('http://192.168.1.50:3690/webhook/ep_XXXXXXXX', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-webhook-secret': process.env.PULSEDESK_SECRET,
  },
  body: JSON.stringify({ title: 'Nuevo pedido', message: 'Pedido #1234 por 49 €', type: 'success' }),
})
```

Desde el navegador también funciona (el servidor de la app permite CORS), con tres limitaciones:

- El secreto queda a la vista: úsalo solo en herramientas internas.
- Una web en `https` no puede llamar a una dirección `http://192.168…` (el navegador lo bloquea por contenido mixto).
- Chrome y Edge pueden pedir permiso para acceder a dispositivos de la red local.

### Desde internet

La IP local de tu equipo (`192.168…`) no es accesible desde fuera. Dos opciones:

- **Un túnel** hacia el puerto 3690, por ejemplo con [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/):

  ```bash
  cloudflared tunnel --url http://localhost:3690
  ```

  Te da una dirección pública (`https://algo.trycloudflare.com`): usa `https://algo.trycloudflare.com/webhook/ep_XXXXXXXX` con el mismo secreto. Funciona mientras el túnel y PulseDesk estén abiertos, y con un túnel rápido como este la dirección cambia cada vez que lo arrancas.
- **El backend en un servidor público.** Con sesión, cada conexión tiene una URL fija (`https://tu-servidor.com/webhook/ep_…`) que recibe aunque tu equipo esté apagado; la app recibe los avisos al conectarse.

### Respuestas y errores frecuentes

| Respuesta | Significa | Qué hacer |
| --- | --- | --- |
| `200` | Aviso recibido | — |
| `400` | El cuerpo no es un JSON válido | Revisa las comillas del JSON |
| `401` | Falta el secreto o es incorrecto | Copia de nuevo el secreto de la conexión (pudo regenerarse) |
| `404` | La conexión no existe | Revisa el id de la URL, o si se eliminó |
| `409` | Enviaste al puerto 3690 con la sesión iniciada | Usa la URL del servidor que muestra la app |
| `423` | La conexión está pausada | Actívala con el interruptor de su cabecera |
| No responde | La app está cerrada, el firewall bloquea o la IP cambió | Abre PulseDesk, revisa el firewall y la IP |

### Campos que se detectan automáticamente

| Campo del aviso | Se busca en                                                                                                                                                                                     |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Título          | `title`, `subject`, `event` (o `"Evento: <action>"`)                                                                                                                                            |
| Mensaje         | `message`, `description`, `text`, `content`, `details`, `summary`                                                                                                                               |
| Tipo            | `type`, `level`, `status`, `severity`. Si contiene `succ`/`ok`/`pass` → éxito; `warn`/`alert` → alerta; `err`/`fail`/`crit` → error; `cal`/`meet`/`event` o hay fecha → calendario; si no, info |
| Fecha / hora    | `date` (`YYYY-MM-DD`), `time` (`HH:mm`). Con fecha se agenda en el calendario                                                                                                                   |
| Origen          | `source`, `sender`, `app` (o el nombre de la conexión)                                                                                                                                            |
| Categoría       | `category`                                                                                                                                                                                      |

Con sesión, un usuario `boss` o `admin` puede incluir `"groupIds": [...]` en el payload para repartir el aviso a sus grupos.

## Conexiones configurables

Desde la pestaña **Conexiones** cada servicio tiene su propia configuración (en el código y la API se llaman *endpoints*). El **mapeo de campos** acepta:

- **Una ruta** del JSON: claves separadas por puntos, con índices numéricos para listas (`commits.0.message`).
- **Una plantilla** con `{{ruta}}`: `{{repository.full_name}}: {{pull_request.title}}`.

Si un campo no está mapeado, o la ruta no existe en el payload recibido, se usa la detección automática. El tipo mapeado pasa por la misma detección (`failure` → error, `succeeded` → éxito).

Las mismas reglas se aplican en los tres sitios donde se interpreta un payload, que deben mantenerse sincronizados:

- [`backend/internal/webhook/parser.go`](backend/internal/webhook/parser.go): servidor;
- [`src-tauri/src/webhook.rs`](src-tauri/src/webhook.rs): app de escritorio sin sesión;
- [`src/lib/webhook-parser.ts`](src/lib/webhook-parser.ts): vista previa y modo navegador.

**Repetir aviso**: si está activo, un aviso no visto vuelve a aparecer cada N minutos (de 1 a 1440) hasta que se pulsa **«Visto»** en el aviso o se marca como leído en el historial. En la app de escritorio las repeticiones las programa Rust, así que funcionan aunque la ventana esté oculta.

## Roles y grupos

Solo con servidor.

| Rol     | Puede                                                                                           |
| ------- | ----------------------------------------------------------------------------------------------- |
| `user`  | Gestionar sus conexiones, historial, calendario y ajustes; recibir lo que le envían             |
| `boss`  | Lo anterior, y además crear grupos, gestionar sus miembros y enviarles notificaciones           |
| `admin` | Todo: ver los datos de todos (`?scope=all`), enviar a cualquier grupo o usuario y cambiar roles |

## Estructura del proyecto

```
.
├── src/                      # Interfaz React
│   ├── components/
│   │   ├── endpoints/        # Pestaña Conexiones (lista, detalle, mapeo, repetición)
│   │   ├── webhooks/         # Historial y simulador
│   │   ├── calendar/         # Calendario
│   │   ├── groups/           # Grupos y usuarios (boss/admin)
│   │   ├── notify/           # Ventana de avisos (segunda ventana de Tauri)
│   │   ├── settings/         # Configuración
│   │   └── ui/               # Componentes base
│   ├── context/              # Estado global (AppContext, AuthContext)
│   ├── lib/                  # Parser de webhooks, recordatorios, repeticiones…
│   └── services/             # API REST, almacenamiento local (SQLite / localStorage)
├── src-tauri/                # App de escritorio (Rust)
│   └── src/
│       ├── lib.rs            # Ventanas, bandeja, comandos
│       ├── webhook.rs        # Servidor HTTP en el puerto 3690 y parser
│       ├── db.rs             # SQLite del modo local
│       ├── reminders.rs      # Recordatorios del calendario
│       └── repeats.rs        # Avisos que se repiten hasta marcarlos como vistos
├── backend/                  # Servidor (Go)
│   ├── cmd/server/           # Punto de entrada
│   └── internal/
│       ├── api/              # Rutas HTTP
│       ├── store/            # Acceso a PostgreSQL
│       ├── db/migrations/    # Migraciones SQL (se aplican al arrancar)
│       ├── webhook/          # Parser y mapeo de campos
│       ├── auth/             # Contraseñas, tokens, Google, correo
│       └── sse/              # Tiempo real
└── vite-webhook-plugin.ts    # En `pnpm dev`, reenvía el puerto 3690 al backend
```

## Scripts

| Comando                               | Descripción                                      |
| ------------------------------------- | ------------------------------------------------ |
| `pnpm dev`                            | Interfaz en el navegador (http://localhost:5173) |
| `pnpm build`                          | Comprueba los tipos y genera `dist/`             |
| `pnpm lint`                           | Lint con oxlint                                  |
| `pnpm tauri dev`                      | App de escritorio en desarrollo                  |
| `pnpm tauri build`                    | Instalador de la app de escritorio               |
| `go run ./cmd/server` (en `backend/`) | Backend                                          |

## Tests

```bash
# Backend: parser y mapeo, autenticación
cd backend && go test ./...

# App de escritorio: mapeo, SQLite y programación de repeticiones
cd src-tauri && cargo test

# Interfaz: tipos y lint
pnpm build && pnpm lint
```

## Seguridad

Resumen del modelo de seguridad:

- **Avisos**: cada conexión exige su secreto, comparado en tiempo constante. El `/webhook` genérico de la app de escritorio solo acepta sin secreto a programas del propio equipo; peticiones de otros equipos, de túneles o de páginas web (con cabecera `Origin`) necesitan el secreto local.
- **Cuentas**: contraseñas con bcrypt; tokens de sesión aleatorios de 32 bytes guardados solo como hash SHA-256 y con caducidad; límites de intentos por IP y por correo; login con Google mediante PKCE.
- **Datos**: consultas SQL parametrizadas; cada usuario solo accede a sus datos (salvo los admin con `?scope=all`); borrado lógico.
- **Escritorio**: CSP restrictiva en producción.

Los secretos de los webhooks se guardan en claro (en PostgreSQL o SQLite) para poder mostrarlos en la interfaz. Protege el acceso a la base de datos y al equipo.

**Reportar una vulnerabilidad:** no abras un issue público. Usa [«Report a vulnerability»](https://github.com/jarccy/noticket/security/advisories/new) en la pestaña _Security_ del repositorio, con los pasos para reproducirla. Intentaremos responder en un plazo razonable y te daremos crédito en la corrección, si lo deseas.

## Contribuir

¡Las contribuciones son bienvenidas!

1. Abre un _issue_ para comentar el cambio antes de empezar si es grande.
2. Haz un fork, crea una rama (`git checkout -b feat/mi-cambio`) y haz commits pequeños. El historial usa el prefijo `feat:` / `fix:` ([Conventional Commits](https://www.conventionalcommits.org/es/)).
3. Antes de abrir el _pull request_, comprueba que pasan:

   ```bash
   pnpm build && pnpm lint
   cd backend && gofmt -l . && go vet ./... && go test ./...
   cd src-tauri && cargo test
   ```

4. Pautas:
   - La interfaz y los mensajes están en **español**.
   - Si cambias cómo se interpreta un payload, actualiza **los tres parsers** (Go, Rust y TypeScript) y sus tests.
   - Los cambios de base de datos van en una migración nueva (`backend/internal/db/migrations/00N_*.sql`); no edites las ya publicadas. En SQLite, sube `SCHEMA_VERSION` en `src-tauri/src/db.rs`.
   - Nada de secretos en el repositorio: usa `backend/.env` (ignorado por git).

## Licencia

[MIT](LICENSE) © 2026 Jarcy
