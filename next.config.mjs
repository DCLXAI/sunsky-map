import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
    // Pin the workspace root so Turbopack doesn't walk up into a parent
    // directory that happens to contain a lockfile.
    turbopack: {
        root: projectRoot,
    },
};

export default nextConfig;
