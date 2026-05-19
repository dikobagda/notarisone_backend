import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import 'dotenv/config';

async function run() {
  const connectionString = (process.env.DATABASE_URL || '').replace(/^mysql:\/\//, 'mariadb://');
  const adapter = new PrismaMariaDb(connectionString);
  const prisma = new PrismaClient({ adapter });

  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        tenantId: true,
        allowedMenus: true
      }
    });
    console.log("Current Users in DB:");
    console.log(JSON.stringify(users, null, 2));
  } catch (e) {
    console.error("Failed:", e);
  } finally {
    await prisma.$disconnect();
  }
}

run();
