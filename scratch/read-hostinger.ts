import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

const url = "mysql://u735438262_notarisone:Notarisone1@srv1761.hstgr.io:3306/u735438262_notarisone?allowPublicKeyRetrieval=true";
const connectionString = url.replace(/^mysql:\/\//, 'mariadb://');

async function main() {
  const adapter = new PrismaMariaDb(connectionString);
  const prisma = new PrismaClient({ adapter });

  console.log("Connecting to Hostinger DB...");
  const tenants = await prisma.tenant.findMany({
    select: { id: true, name: true, subdomain: true, status: true }
  });
  console.log("Tenants:", JSON.stringify(tenants, null, 2));

  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, tenantId: true }
  });
  console.log("Users:", JSON.stringify(users, null, 2));

  await prisma.$disconnect();
}

main().catch(console.error);
