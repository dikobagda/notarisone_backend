import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { softDeleteExtension } from './soft-delete';

const globalForPrisma = global as unknown as { prisma: any };

const adapter = new PrismaMariaDb(process.env.DATABASE_URL || '');

const basePrisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    adapter,
    log: ['query', 'error', 'warn'],
  });

export const prisma = basePrisma.$extends(softDeleteExtension);

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = basePrisma;
