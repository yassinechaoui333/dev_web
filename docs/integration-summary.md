# Yassine's completed handoff

## Scope
Completed only the shared foundation, accounts/permissions, profiles and administration. The supplied brief describes the entire group project; Ahmed, Taha and Abdelali implement the reserved data features in their respective folders. See requirements-mapping.md.

## Foundation checkpoint and branches
- Recommended foundation: **5ac57d64b7ac1056ac2ec58944d03285d8301838** — **foundation-v1.1**, local main.
- Initial foundation: 2c7dd318ae683397af59b3dae5d03340ef4d91f1 — foundation-v1.
- The v1.1 fix explicitly loads root .env for Prisma workspace commands and binds development API to localhost.
- Profile/admin commits follow on **feature/auth-admin**. Resolve final delivery with `git log -1 --oneline feature/auth-admin`.
- No remote push was performed. No teammates' feature implementations were added.

## Exact clean-machine setup
Prerequisites: Node 22.12+ with npm, Docker Desktop/Compose with Ubuntu WSL integration enabled, or an existing PostgreSQL 16 instance. From the repository root:

```sh
cp .env.example .env
npm ci
docker compose up -d --wait db
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Open http://localhost:5173. Public presentation is at /, workspace at /app, profile at /app/profile, administration at /app/admin. The API uses http://localhost:3001/api. Windows PowerShell uses `Copy-Item .env.example .env` for the first command. Keep a WSL checkout's npm/Git commands inside WSL.

```sh
npm run build
npm test
curl http://localhost:3001/api/health
```

Tests require a migrated disposable development/test database. They create/delete isolated test users and fixtures; never run against production. CI defines its own PostgreSQL service and safe fictional credentials.

Development logins (from .env.example seed values):
- Admin: **yassine@example.test / DevAdmin123!**
- Member: **member@example.test / DevMember123!**

Seed reruns preserve passwords, account status and roles. The seed refuses NODE_ENV=production. Three fictional sales rows yield GBP net revenue 32.75; fixtures do not implement any teammate's pipeline or calculations.

## Implemented endpoints
- GET /api/health — database readiness, 503 when unavailable.
- POST /api/auth/register, /login, /logout; GET /api/auth/me.
- PATCH /api/auth/profile and /api/auth/password.
- GET /api/admin/summary, /users, /datasets, /activities.
- PATCH /api/admin/users/{userId}.

All protected APIs authenticate a persistent PostgreSQL-backed opaque cookie session. Admin APIs require an active ADMIN. User objects never expose password hashes. Registration/profile payloads reject privilege fields. Email change verifies current password and revokes other sessions; password change revokes every session. Administrative role/status changes revoke target sessions, reject self changes, protect the last active admin, and create transactional audit entries. Account security changes recheck live sessions under a database lock to prevent concurrent privilege/password races. Admin dataset oversight returns metadata and counts; it grants no dataset content access.

The API/data contracts reserve all of Ahmed/Taha/Abdelali's routes, including ingestion reports, analytics and dashboard read-only sharing. Shared access helpers are tested with isolated fixtures; this does not implement dashboards or analytics. Later contract changes require coordination and a migration/version note.

## Changed file groups
- Root: npm workspace, lockfile, .env.example, .nvmrc, Compose, README, AGENTS.md and GitHub CI.
- server/: Prisma schema/migration/config/seed, Express app, auth/admin modules, shared validation/security/access/errors and automated checks.
- client/: Vite/React/Router setup, public/auth/profile screens, admin screens, protected layout, API client and responsive styles.
- docs/: architecture, OpenAPI, data/analytics conventions, contract history, scope mapping, status and this handoff.
- Teammate feature folders contain ownership placeholders only.

## Verification completed
- Fresh migration on PostgreSQL 16; no pending migrations on rerun.
- Fictional seed run repeatedly without duplicate dataset/import rows or reset accounts.
- Root .env loading verified without manually exported DATABASE_URL.
- Client/server production builds pass; nine automated checks pass.
- Auth checks include login/logout, expired sessions, unauthorized current-user access, HttpOnly/SameSite cookies, CSRF rejection and role injection.
- Admin/profile checks include member denial, role/status changes, session revocation, password/email verification, pagination validation, safe audit fields and concurrent demotions/password changes.
- Shared access checks ensure recipients can read only the specific shared dashboard and never access raw datasets or write; revocation applies on subsequent requests. Database ownership constraints also reject mismatched dashboard owners.
- Headless browser: public presentation, admin login, users/datasets/activity tabs (including repeat switching), profile save, mobile layout at 390px, logout and ordinary-user UI/API denial. No browser runtime errors in the completed flow.
- OpenAPI JSON-compatible YAML syntax, schema references and path parameter declarations checked.

This machine used temporary Node 22.21.1 and standalone PostgreSQL 16.14 under /tmp/sdq-tools because the default Node was 18 and Docker WSL integration was unavailable. Verification database bound only to 127.0.0.1:55432. These temporary tools are not project dependencies and may disappear after restart; use the standard setup above on teammates' machines. Docker Compose itself was not run here; migrations/API were tested on real PostgreSQL directly.

## Push and integration (Yassine runs these)
```sh
git push -u origin main
git push -u origin feature/auth-admin
git push origin foundation-v1 foundation-v1.1
```
Create/merge the feature/auth-admin → main pull request. Then teammates branch from origin/main as feature/datasets, feature/analytics and feature/dashboards. They may start from foundation-v1.1 in parallel if needed. No teammate should regenerate authentication or create another database layer.

## Remaining limitations
No unfinished required foundation/Yassine features. Import/exploration/analytics/dashboard runtime features are deliberately reserved for teammates, so the whole group's final workflow is not complete. Account deletion uses deactivation to retain owned data/audit history. The MVP excludes email verification, recovery, MFA, distributed rate limiting and production deployment. Configure TLS/single origin for production and schedule expired-session cleanup. Global account locking favors correctness over high-volume throughput. Final team presentation remains a group deliverable.
