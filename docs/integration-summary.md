# Yassine integration handoff

## Foundation checkpoint
Use tag foundation-v1.1 to resolve the exact foundation commit: `git rev-parse foundation-v1.1`. The initial foundation-v1 commit is 2c7dd318ae683397af59b3dae5d03340ef4d91f1; v1.1 fixes explicit root .env loading for Prisma commands. Local main starts at this checkpoint. Authentication, shared schema/migration, fictional seed, public presentation, protected shell, access helpers and initial team contracts are included. Admin/profile operations remain reserved in this checkpoint and follow in feature/auth-admin.

Verified against a fresh standalone PostgreSQL 16 database: committed migration applies; fictional seed can run twice; client/server production builds pass; login, logout, unauthorized current-user access, session expiry, CSRF, role-injection rejection, password hashing and shared filters pass automated checks.

## Local setup
See architecture.md for exact standard Docker/Node 22 setup commands. Local verification uses temporary Node 22.21.1 and PostgreSQL 16.14 under /tmp/sdq-tools, bound to 127.0.0.1:55432; these tools are not repository dependencies and do not survive environment resets. DATABASE_URL is overridden for verification. The committed .env.example uses the normal Docker port 5432.

Development accounts: yassine@example.test / DevAdmin123! (ADMIN), member@example.test / DevMember123! (USER). These credentials are fictional development values; seeding refuses production and never resets existing accounts.

## Boundaries
Ahmed/Taha/Abdelali runtime modules remain unimplemented; API operations marked x-status: reserved currently return the standard 404. Read AGENTS.md and the finalized contracts before starting a branch. Root schema/config/lockfile/routing/API changes coordinate through Yassine.

## Operational limitations
MVP excludes email verification, password recovery, MFA, production deployment and a shared rate-limit store. TLS and a single frontend/API origin are required for production. An operational job should periodically delete expired sessions. This handoff does not claim the entire group's CSV-to-dashboard flow is implemented.
