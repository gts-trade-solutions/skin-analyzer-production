import { PrismaClient } from "@prisma/client";

// Reuse a single PrismaClient across hot-reloads in dev to avoid exhausting
// the connection pool.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/**
 * True when DATABASE_URL points at a real database (not the dev/example
 * placeholder). Lets the analyze route run locally without a live MySQL while
 * persisting for real in production.
 */
export function isDbConfigured(): boolean {
  const url = process.env.DATABASE_URL;
  if (!url) return false;
  return !url.startsWith("mysql://user:password@");
}
