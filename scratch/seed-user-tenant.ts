import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import bcrypt from 'bcryptjs';
import 'dotenv/config';

const rawUrl = process.env.DATABASE_URL || '';
const connectionString = rawUrl.trim().replace(/^mysql:\/\//, 'mariadb://');
const adapter = new PrismaMariaDb(connectionString);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Upserting Tenant...");
  const tenant = await prisma.tenant.upsert({
    where: { id: "cmo5pfwzw0007fypxangt02sa" },
    update: {
      name: "Diko Bagda",
      subdomain: "n2",
      status: "ACTIVE",
    },
    create: {
      id: "cmo5pfwzw0007fypxangt02sa",
      name: "Diko Bagda",
      subdomain: "n2",
      status: "ACTIVE",
      subscription: "PROFESSIONAL",
    }
  });
  console.log("Tenant upserted:", tenant);

  console.log("Upserting Users...");
  const hashedPassword = await bcrypt.hash('password123', 10);
  
  // Upsert the user from the JWT (cmo5pfx1i0008fypx80yrlqtk)
  const user1 = await prisma.user.upsert({
    where: { id: "cmo5pfx1i0008fypx80yrlqtk" },
    update: {
      name: "Diko Bagda",
      email: "notaris.dikobagda@gmail.com",
      role: "NOTARIS",
    },
    create: {
      id: "cmo5pfx1i0008fypx80yrlqtk",
      name: "Diko Bagda",
      email: "notaris.dikobagda@gmail.com",
      role: "NOTARIS",
      password: hashedPassword,
      tenantId: "cmo5pfwzw0007fypxangt02sa",
    }
  });
  console.log("User 1 (from JWT) upserted:", user1);

  // Also keep the other one just in case
  const user2 = await prisma.user.upsert({
    where: { id: "cmo5pfwzx0008fypxsot85i1j" },
    update: {
      name: "Diko Bagda",
      email: "notaris.dikobagda.alt@gmail.com", // use unique email for alt user
      role: "NOTARIS",
    },
    create: {
      id: "cmo5pfwzx0008fypxsot85i1j",
      name: "Diko Bagda",
      email: "notaris.dikobagda.alt@gmail.com",
      role: "NOTARIS",
      password: hashedPassword,
      tenantId: "cmo5pfwzw0007fypxangt02sa",
    }
  });
  console.log("User 2 (from Hostinger dump) upserted:", user2);

  await prisma.$disconnect();
}

main().catch(console.error);
