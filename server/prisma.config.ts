import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { defineConfig } from 'prisma/config';
// npm runs database commands in server/. Load the shared root environment
// explicitly; exported environment values retain precedence in CI/deployment.
dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });
export default defineConfig({ schema: 'prisma/schema.prisma' });
