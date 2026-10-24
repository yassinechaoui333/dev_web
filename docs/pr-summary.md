# Profile, permissions and administration foundation

The repository now provides the shared platform and Yassine's account/administration module. Visitors can view a presentation and register/sign in; members can manage their profiles; active admins can manage account roles/status and review global counts, dataset metadata and audit activity.

PostgreSQL stores hashed session tokens and scrypt password hashes. All mutations enforce the agreed origin/header checks. Privilege-bearing fields are rejected on self-service inputs; admin changes revoke sessions and recheck permissions transactionally. Shared resource helpers preserve dataset ownership and read-only dashboard scope.

The foundation includes the shared schema, initial migration, safe fictional seed, npm workspace, CI and finalized team contracts. Data import, analytics and dashboards remain reserved for their owners. No published teammate contract was silently changed; the initial draft was finalized before foundation-v1 publication, as documented in contract-changelog.md.

Validation: both production builds and nine automated checks pass against PostgreSQL 16. Browser checks pass for the visitor/auth/profile/admin flow, mobile layout and member access denial. See integration-summary.md for exact setup, checkpoints, test coverage and limitations.

Setup: Node 22.12+, PostgreSQL 16 or Docker Compose; copy .env.example, npm ci, generate/migrate/seed, then npm run dev. No external service credentials are required. Docker was not available in this environment; real PostgreSQL was used directly for verification.
