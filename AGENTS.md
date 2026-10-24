# Sales & Data Quality Platform — AI collaboration rules

Read this file, docs/architecture.md, docs/api-contract.yaml, docs/data-contract.md and docs/team-status.md before editing. Inspect git status and preserve other developers' changes.

## Ownership
- Yassine: shared foundation, auth/admin feature folders, shared middleware, configuration and documentation. Work on feature/auth-admin after foundation integration.
- Ahmed: server/src/modules/datasets and client/src/features/datasets.
- Taha: server/src/modules/analytics and client/src/features/analytics.
- Abdelali: server/src/modules/dashboards and client/src/features/dashboards.
- Do not implement another owner's features. Contract-compatible development fixtures must be clearly labelled, never presented as live results.
- Coordinate changes to root configuration, shared UI/middleware, API contracts, npm lockfile and Prisma schema with Yassine. Propose the exact compatibility impact before changing a published contract. Add migrations; never edit an applied migration.
- Branch from the verified foundation tag foundation-v1 after Yassine integrates that checkpoint into main. Teammates use feature/datasets, feature/analytics, feature/dashboards. Do not merge or overwrite another feature branch automatically.
- Use npm workspaces and the single root package-lock.json. Node 22.12+ and PostgreSQL 16. Use Recharts 3 for all charts.
- REST lives under /api. Validate input, use shared error/pagination conventions, authenticate first, check resource access on every endpoint. UUID validation before Prisma calls.
- Never trust client-supplied role, ownerId, actorId or userId for ownership. Use the authenticated session user. Admin privileges do not grant dataset content access.
- Cookie sessions are server-managed, with only a random opaque token in the cookie and its hash in PostgreSQL. No browser token storage. All mutations must pass the origin/header guard.
- Decimal values travel as strings. Follow documented time, returns and currency semantics exactly.
- Keep API docs and team status accurate in the same change. Reserved endpoints are not implemented until their owner ships them.
- Run npm run build and npm test with a migrated development/test database. Tests create/delete isolated test accounts; never use a production database.
- Commit coherent changes and include checks and limitations in the handoff. No secrets or real customer data.
