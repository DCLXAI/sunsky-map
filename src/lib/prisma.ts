import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Prisma 7 talks to Postgres through a driver adapter instead of the schema `url`.
export const prisma =
    globalForPrisma.prisma ??
    new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

// Reuse the client across HMR reloads in dev so we don't exhaust the connection pool.
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
