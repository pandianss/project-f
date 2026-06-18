# Deploying the Fasal Mitra AI backend (public HTTPS)

The mobile app needs the API on a **public HTTPS URL** before it works for real
users / Play reviewers. This guide uses the committed `Dockerfile`. Any host that
runs a Docker container + managed PostgreSQL **with PostGIS** works.

## What you need
- A managed **PostgreSQL with the PostGIS extension** (migration `001_init.sql`
  runs `CREATE EXTENSION IF NOT EXISTS postgis` — the extension must be available).
- The container env var **`DATABASE_URL`** pointing at it (TLS is auto-enabled in
  production; the pool sets `ssl` when `NODE_ENV=production` or `sslmode=require`).
- The platform provides **`PORT`**; the server already binds `0.0.0.0:$PORT`.
- On boot the container runs **migrations then starts** (`npm run start:prod`).

Health check path: **`/health`** → `{"status":"ok"}`.

---

## Option A — Render (simple)
1. **Database:** New → PostgreSQL. After it's up, connect and run `CREATE EXTENSION IF NOT EXISTS postgis;`
   (Render Postgres includes PostGIS). Copy the **Internal Database URL**.
2. **Web Service:** New → Web Service → connect this GitHub repo →
   - Root directory: `backend`
   - Runtime: **Docker**
   - Env vars: `DATABASE_URL` = the URL from step 1, `NODE_ENV` = `production`.
   - Health check path: `/health`.
3. Deploy. Your API is at `https://<service>.onrender.com`.

## Option B — Railway
1. New Project → **Deploy PostgreSQL**. In its data tab run `CREATE EXTENSION IF NOT EXISTS postgis;`
2. New Service → **Deploy from GitHub repo**, set root to `backend` (Dockerfile auto-detected).
3. Variables: `DATABASE_URL` (reference the Postgres plugin var), `NODE_ENV=production`.
4. Generate a public domain → `https://<svc>.up.railway.app`.

## Option C — Fly.io
```bash
cd backend
fly launch --no-deploy            # creates fly.toml; set internal_port = 3001
fly postgres create               # managed PG; then enable postgis:
fly postgres connect -a <pg-app>  # psql> CREATE EXTENSION IF NOT EXISTS postgis;
fly secrets set DATABASE_URL="postgres://...sslmode=require" NODE_ENV=production
fly deploy
```
Set `internal_port = 3001` (or read `PORT`) and a health check on `/health`.

> Note on PostGIS: Supabase, Render, Railway, Neon and Fly Postgres all support
> the PostGIS extension. If your provider doesn't, use a PostGIS-enabled image or
> a different DB. Do **not** point at the local Docker DB from production.

---

## After the API is live
1. Smoke test: `curl https://<your-api>/health` → `{"status":"ok"}`.
2. Build the app against it:
   ```bash
   cd mobile
   flutter build appbundle --release --dart-define=API_BASE_URL=https://<your-api>
   ```
   (Without the flag, the app falls back to the emulator dev URL `http://10.0.2.2:3001`.)
3. Upload the new `.aab` to Play Console.

## Production hardening checklist (before public launch)
- [ ] Restrict CORS to known origins (currently `origin: true`).
- [ ] Real OTP/auth (registration is currently unauthenticated).
- [ ] Rate limiting on public endpoints (`@fastify/rate-limit` is installed).
- [ ] Backups on the managed DB; least-privilege DB user.
- [ ] Data-deletion endpoint to honor the Play data-safety declaration.
- [ ] Secrets via the platform's secret store (never commit `.env`).
