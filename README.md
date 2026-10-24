# Sales & Data Quality Platform

Collaborative sales analytics MVP: CSV → exploration → analysis → visualization → saving/sharing.

Start with [local setup](docs/architecture.md), [team ownership](AGENTS.md), [API contract](docs/api-contract.yaml), [data conventions](docs/data-contract.md) and [integration status](docs/team-status.md).

Run Node 22.12+ and PostgreSQL 16. Copy .env.example to .env, then:
```sh
npm ci
docker compose up -d --wait db
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```
Open http://localhost:5173. Development admin: yassine@example.test / DevAdmin123!
Development member: member@example.test / DevMember123!
```sh
npm run build
npm test
```
Use an isolated development/test database. Tests never belong against production.

Yassine's scope is complete on **feature/auth-admin**. [Handoff and push commands](docs/integration-summary.md) include the exact foundation checkpoint and checks. Ahmed, Taha and Abdelali's modules remain reserved for them.

Routes: public presentation `/`, workspace `/app`, profile `/app/profile`, administration `/app/admin`.
