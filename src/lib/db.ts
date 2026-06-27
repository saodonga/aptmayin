import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

// Reuse the same PrismaClient instance across HMR reloads in dev mode.
// Without this, each hot-reload creates a new instance and exhausts the
// Neon serverless connection pool (limit: 10 connections by default).
export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;
