import path from "node:path";
import process from "node:process";
import { defineConfig, env } from "prisma/config";

// Prisma 7 no longer auto-loads .env — do it here so CLI commands
// (migrate/generate) work locally. On Vercel the vars are already injected.
try {
    process.loadEnvFile(path.join(process.cwd(), ".env"));
} catch {
    // no local .env — rely on the ambient environment
}

export default defineConfig({
    schema: path.join("prisma", "schema.prisma"),
    migrations: {
        path: path.join("prisma", "migrations"),
    },
    datasource: {
        url: env("DATABASE_URL"),
    },
});
