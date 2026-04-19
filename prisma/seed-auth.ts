import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import bcrypt from 'bcryptjs';
import 'dotenv/config';

const adapter = new PrismaMariaDb(process.env.DATABASE_URL || '');
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding authentication data...');

  // 1. Create a Default Tenant
  const tenant = await prisma.tenant.upsert({
    where: { id: 'default-tenant-id' },
    update: {},
    create: {
      id: 'default-tenant-id',
      name: 'Kantor Notaris Test',
      address: 'Jl. Merdeka No. 1, Jakarta',
      status: 'TRIAL',
      subscription: 'STARTER',
    },
  });

  // 2. Create a Notary User
  const hashedPassword = await bcrypt.hash('notaris123', 10);
  
  const user = await prisma.user.upsert({
    where: { email: 'notaris@test.com' },
    update: {
      password: hashedPassword,
    },
    create: {
      email: 'notaris@test.com',
      password: hashedPassword,
      name: 'Budi Notaris',
      role: 'NOTARIS',
      tenantId: tenant.id,
    },
  });

  console.log('Seed data created successfully!');
  console.log('User: notaris@test.com');
  console.log('Pass: notaris123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
