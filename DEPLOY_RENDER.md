# 🚀 Deploying Whatomate on Render

This guide explains how to host Whatomate on [Render](https://render.com) using the separated `backend/` and `frontend/` architecture.

---

## 📁 Repository Architecture

```
Project 2/
├── backend/                  # Go Backend Service
│   ├── cmd/whatomate/        # Main entrypoint
│   ├── internal/             # Handlers, database, models, queue, audio
│   ├── pkg/                  # WhatsApp Cloud API SDK
│   ├── test/                 # Test suites & fixtures
│   ├── config.example.toml   # Configuration template
│   ├── config.toml           # Local development config
│   ├── Dockerfile            # Production Docker container
│   ├── Makefile              # Backend build targets
│   ├── go.mod & go.sum       # Go module dependencies
├── frontend/                 # React Frontend Client (Vite SPA)
│   ├── src/                  # React views, components, stores, services
│   ├── public/               # Static assets & icons
│   ├── package.json          # Frontend dependencies & scripts
│   ├── vite.config.ts        # Vite configuration & proxy
│   ├── index.html            # HTML entrypoint
├── render.yaml               # Render Blueprint (Infrastructure as Code)
├── Dockerfile                # Unified all-in-one production Dockerfile
├── docker-compose.yml        # Local development compose file
├── Makefile                  # Root orchestration Makefile
└── package.json              # Monorepo root scripts
```

---

## ⚡ Option 1: Automatic 1-Click Deploy with Render Blueprint (`render.yaml`)

Render Blueprints provision all services, databases, and environment variables automatically.

1. **Push your repository** to GitHub or GitLab.
2. Log in to [dashboard.render.com](https://dashboard.render.com).
3. Click **New +** > **Blueprint**.
4. Connect your Whatomate Git repository.
5. Render will automatically read [`render.yaml`](./render.yaml) and configure:
   - **PostgreSQL Database** (`whatomate-db`)
   - **Backend Web Service** (`whatomate-backend`)
   - **Frontend Static Site** (`whatomate-frontend`) with SPA rewrites
6. Click **Apply**. Render will build and deploy both services!

---

## 🛠 Option 2: Manual Setup on Render Dashboard

If you prefer to configure each service individually on Render:

### Step 1: Create a PostgreSQL Database
1. In Render Dashboard, click **New +** > **PostgreSQL**.
2. Name: `whatomate-db`.
3. Plan: **Free** (or Starter for production).
4. Click **Create Database**.
5. Copy the **Internal Database URL** for Step 2.

---

### Step 2: Deploy Backend Web Service
1. In Render Dashboard, click **New +** > **Web Service**.
2. Select your repository.
3. Configure the service settings:
   - **Name:** `whatomate-backend`
   - **Root Directory:** `backend`
   - **Runtime:** `Go` (or `Docker` using `backend/Dockerfile`)
   - **Build Command:** `go build -ldflags="-s -w" -o whatomate ./cmd/whatomate`
   - **Start Command:** `./whatomate server -config config.toml -migrate`
4. In **Environment Variables**, add:
   | Variable | Value | Description |
   | :--- | :--- | :--- |
   | `PORT` | `8080` | Render port |
   | `WHATOMATE_SERVER__PORT` | `8080` | Server listen port |
   | `WHATOMATE_SERVER__HOST` | `0.0.0.0` | Bind to all interfaces |
   | `WHATOMATE_APP__ENVIRONMENT` | `production` | Production mode |
   | `WHATOMATE_DATABASE__URL` | `postgresql://...` | Connection URL from Step 1 |
   | `WHATOMATE_REDIS__URL` | `redis://...` | Redis URL (e.g. from Upstash or Render) |
   | `WHATOMATE_JWT__SECRET` | *(click Generate)* | 64-char random secret |
   | `WHATOMATE_COOKIE__SECURE` | `true` | Secure cookies over HTTPS |
   | `WHATOMATE_COOKIE__SAME_SITE` | `None` | Cross-site cookie support |
   | `WHATOMATE_DEFAULT_ADMIN__EMAIL` | `admin@login.com` | Default admin email |
   | `WHATOMATE_DEFAULT_ADMIN__PASSWORD`| `admin123` | Default admin password |
   | `WHATOMATE_RATE_LIMIT__TRUST_PROXY`| `true` | Required behind Render reverse proxy |
5. Click **Create Web Service**. Note your backend URL (e.g. `https://whatomate-backend.onrender.com`).

---

### Step 3: Deploy Frontend Static Site
1. In Render Dashboard, click **New +** > **Static Site**.
2. Select your repository.
3. Configure the frontend settings:
   - **Name:** `whatomate-frontend`
   - **Root Directory:** `frontend`
   - **Build Command:** `npm install && npm run build`
   - **Publish Directory:** `dist`
4. In **Environment Variables**, add:
   | Variable | Value |
   | :--- | :--- |
   | `VITE_API_URL` | `https://whatomate-backend.onrender.com/api` |
5. In **Redirects / Rewrites**, add the following rules:
   - **Rule 1 (API Proxy):**
     - Type: `Rewrite`
     - Source: `/api/*`
     - Destination: `https://whatomate-backend.onrender.com/api/*`
   - **Rule 2 (SPA Routing):**
     - Type: `Rewrite`
     - Source: `/*`
     - Destination: `/index.html`
6. Click **Create Static Site**.

---

## 🐳 Option 3: Unified Single-Container Docker Deployment

Whatomate also includes a unified multi-stage [`Dockerfile`](./Dockerfile) that builds the frontend and embeds it directly into the Go binary.

1. In Render Dashboard, click **New +** > **Web Service**.
2. Select **Docker** runtime.
3. Root Directory: `.` (leave empty for repo root).
4. Render will execute `Dockerfile`, compiling the React frontend into `dist`, embedding it into the Go binary, installing Piper TTS and audio codecs, and serving both frontend and backend on port 8080!

---

## 💻 Local Development with New Layout

From repository root:

```bash
# Start frontend dev server (port 3000)
npm run dev:frontend

# Start backend dev server (port 8080)
npm run dev:backend

# Or build both
npm run build
```
