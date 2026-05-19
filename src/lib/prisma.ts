import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { softDeleteExtension } from './soft-delete';

const globalForPrisma = global as unknown as { prisma: any };

let basePrisma: any;

if (globalForPrisma.prisma) {
  basePrisma = globalForPrisma.prisma;
} else {
  const rawUrl = process.env.DATABASE_URL || '';
  // Ensure we use mariadb:// for the adapter, and trim any potential whitespace
  const connectionString = rawUrl.trim().replace(/^mysql:\/\//, 'mariadb://');
  
  const adapter = new PrismaMariaDb(connectionString);
  
  basePrisma = new PrismaClient({
    adapter,
    log: ['query', 'error', 'warn'],
  });
  
  if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = basePrisma;
  }
}

export const prisma = basePrisma.$extends(softDeleteExtension);

