# Architecture and local setup

One npm workspace repository:
- client/: React 19, Vite 7, TypeScript, React Router 7; src/features/{auth,admin,datasets,analytics,dashboards}; shared API client in src/shared.
- server/: Node.js 22.12+, Express 5, TypeScript, Prisma 6.19, PostgreSQL 16; src/modules matches feature folders, src/shared holds security/access/errors/validation.
- server/prisma/: shared schema, committed SQL migrations, fictional seed.
- docs/: versioned integration contracts. Abdelali uses Recharts 3 (dependency supplied) for all charts.

## Run locally (Linux, macOS, or WSL)
Install Node 22.12+ with npm and Docker with Compose. In the repository root:
```sh
cp .env.example .env
npm ci
docker compose up -d --wait db
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```
Open http://localhost:5173. API listens at http://localhost:3001.
Separate terminals: npm run dev -w server and npm run dev -w client.
Verify: npm run build and npm test. Health: curl http://localhost:3001/api/health.
Windows PowerShell uses Copy-Item .env.example .env. Execute npm within the repository's native filesystem (WSL for a WSL checkout).
For an existing PostgreSQL installation, set DATABASE_URL and omit Docker.
Prisma commands run in server/; prisma.config.ts explicitly loads the root .env; runtime and seed load the same root file. Never commit .env.
Seed accounts: yassine@example.test / DevAdmin123! (ADMIN); member@example.test / DevMember123! (USER).
Passwords come from SEED_ADMIN_PASSWORD and SEED_USER_PASSWORD. Change them outside local development.
Seed reruns do not reset passwords or privileges. The sample dataset belongs to the member and is GBP; net revenue is 32.7500.
Seed is disabled in production.

## Authentication and authorization
Registration accepts only name/email/password and always creates USER. Scrypt hashes use random salts. Login issues a fresh 256-bit token; only SHA-256(token) is stored in Session. Cookies are HttpOnly, SameSite=Lax, path=/ and Secure with a __Host- name in production. Session lifetime defaults to 24 hours; no sliding expiry. Login/register replace the current browser session. Logout deletes the server record and clears the cookie. Expired/inactive accounts cannot authenticate; role is read from the database on every request.
All mutations, including login and logout, require Origin matching APP_ORIGIN and X-Requested-With: SalesPlatform. The frontend supplies these through same-origin fetch and Vite's /api proxy. No cross-origin CORS access is enabled. Do not configure wildcard origins.
Use authenticate then requireAdmin for administration. Use requireDatasetAccess for dataset/analytics access and requireDashboardAccess for dashboards; see data-contract.md. Access failures do not disclose another user's resource.
Auth attempts are limited to 30 per IP per 15 minutes per server process. Before multiple-instance deployment, use a shared rate-limit store. Do not trust forwarded IP headers unless a controlled proxy is configured.

## Errors and deployment
Every error has error.code/message/requestId and optional validation details. Responses set X-Request-Id and no-store. Server logs unexpected errors; clients get a generic message.
GET /api/health checks database availability and returns 503 when unavailable.
The current deployment model uses separate client assets and API behind one origin; /api must route to Express. TLS is required for production. Set APP_ORIGIN and NODE_ENV=production. An HTTPS reverse proxy may forward traffic to Express; cookie secure flags are explicit.
Run migrations before starting the server. Schedule deletion of expired sessions as an operational maintenance task. Account email verification, password recovery, MFA, distributed rate limiting and deployment automation are outside this MVP.

## Frontend routes and account writes
Visitor presentation: /. Login: /login. Registration: /register. Protected workspace: /app. Feature integrations should use /app/datasets, /app/analytics and /app/dashboards; coordinate mounting in client/src/main.tsx with Yassine. Profile and admin routes are /app/profile and /app/admin.

Account security changes and session creation use one PostgreSQL transaction advisory lock. Password verification begins outside the lock; login rechecks the unchanged hash and active status inside it. This prevents old-password login races with password changes. Transactional audit records contain no secrets. The global lock favors correctness at MVP traffic levels; revisit its granularity before high-volume deployment.

The API binds HOST=127.0.0.1 by default. Set HOST=0.0.0.0 only when container/network deployment requires it. The Vite development proxy and APP_ORIGIN keep browser/API requests on one origin.
