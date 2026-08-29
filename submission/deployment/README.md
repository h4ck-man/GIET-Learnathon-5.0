# Production Deployment Guide — HostelGrievance

This directory contains containerization and deployment configurations for the hardened HostelGrievance portal.

---

## 1. Quick Start with Docker Compose

To spin up the application in a hardened, containerized environment:

```sh
cd deployment
docker compose up -d --build
```

The application will be accessible at:
- **Web UI & API:** `http://localhost:3000`

---

## 2. Environment Variables

| Variable | Description | Recommended Production Value |
|---|---|---|
| `NODE_ENV` | Environment mode | `production` |
| `HOSTEL_API_PORT` | Port for the backend API | `3001` |
| `HOSTEL_DB_PATH` | Path to persistent SQLite DB | `/app/data/hostel.db` |
| `HOSTEL_UPLOADS_DIR` | Path to persistent uploads directory | `/app/uploads` |
| `ALLOWED_ORIGINS` | Comma-separated list of allowed CORS origins | `https://hostel.giet.edu` |

---

## 3. Database Initialization & Backup

To initialize or reset the database inside the container:

```sh
docker compose exec app npm run db:reset
```

To backup the SQLite database:

```sh
sqlite3 ./data/hostel.db ".backup ./data/backup-$(date +%F).db"
```

---

## 4. Production Hardening Checklist

- [x] TLS / HTTPS termination configured at reverse proxy.
- [x] `NODE_ENV=production` set to activate `Secure` cookies.
- [x] Dedicated non-root application user (`node`) used inside Docker container.
- [x] Filesystem permissions restricted on `data/` and `uploads/`.
- [x] Rate limiting active on authentication routes.
- [x] Defense-in-depth HTTP security headers (nosniff, frame-ancestors, CSP) active.
