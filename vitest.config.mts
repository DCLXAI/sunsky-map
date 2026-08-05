import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        // Only the pure logic is covered. Component and route tests would need a
        // DOM and a database; those are a separate piece of work.
        include: ["src/**/*.test.ts"],
        environment: "node",
    },
    resolve: {
        alias: {
            "@": path.resolve(import.meta.dirname, "./src"),
        },
    },
});
