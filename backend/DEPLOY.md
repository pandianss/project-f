# Deploying the Kadir AI backend (public HTTPS)

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

## Option A0 — Render Blueprint (one click, recommended)
The repo ships a `render.yaml` that provisions **both** the Postgres database and the
web service and wires `DATABASE_URL` + a generated `JWT_SECRET` automatically.
1. In Render: **New → Blueprint** → select this GitHub repo → **Apply**.
2. Wait for the DB + service to come up. (Migrations run on boot.)
3. Your API: `https://kadir-api.onrender.com` → test `/health`.
> PostGIS: Render Postgres includes it; migration `001` runs `CREATE EXTENSION postgis`.
> If the first deploy errors on the extension, open the DB shell and run it once manually.

## Option A — Render (manual)
1. **Database:** New → PostgreSQL. After it's up, connect and run `CREATE EXTENSION IF NOT EXISTS postgis;`
   (Render Postgres includes PostGIS). Copy the **Internal Database URL**.
2. **Web Service:** New → Web Service → connect this GitHub repo →
   - Root directory: `backend`
   - Runtime: **Docker**
   - Env vars: `DATABASE_URL` = the URL from step 1, `NODE_ENV` = `production`.
   - Health check path: `/health`.
3. Deploy. Your API is at `https://<service>.onrender.com`.

## Option B — Railway (via GitHub dashboard, no CLI needed) ⭐
The repo includes `backend/railway.json` (build from Dockerfile + `/health` check).
1. https://railway.app → **New Project → Deploy from GitHub repo** → pick `pandianss/project-f`.
2. On the service: **Settings → Root Directory = `backend`** (so it finds the Dockerfile + railway.json).
3. **New → Database → Add PostgreSQL.** Then open the DB → **Data/Query** and run:
   `CREATE EXTENSION IF NOT EXISTS postgis;`
4. On the **API service → Variables**, add:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}` (reference the Postgres service var)
   - `NODE_ENV` = `production`
   - `JWT_SECRET` = a long random string
   - (optional) `ALLOWED_ORIGINS`, `JWT_EXPIRY`, `OTP_TTL_MINUTES`
5. **Settings → Networking → Generate Domain** → you get `https://<svc>.up.railway.app`.
6. It builds + runs migrations on boot. Test: `curl https://<svc>.up.railway.app/health`.

> CLI alternative (needs your login): `npx @railway/cli login` then
> `cd backend && npx @railway/cli up`. The dashboard path above is simpler and
> requires no local CLI/auth.

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
- [x] **Phone-OTP auth + JWT** — `/v1/auth/request-otp` + `/v1/auth/verify-otp`; farmer/field routes require a Bearer token and enforce ownership.
- [x] **CORS restriction** — set `ALLOWED_ORIGINS` (comma-separated) in production.
- [x] **Rate limiting** — `@fastify/rate-limit` (150/min).
- [x] **Data-deletion endpoint** — `DELETE /v1/farmers/:id` (self, cascades all data) for the Play data-safety declaration.
- [ ] Set a strong `JWT_SECRET` (and never reuse the dev default).
- [ ] Wire `sendSms()` in `src/domain/auth.ts` to a real SMS gateway (MSG91/Gupshup/Twilio) and stop returning `dev_code`.
- [ ] Backups on the managed DB; least-privilege DB user.
- [ ] Secrets via the platform's secret store (never commit `.env`).
