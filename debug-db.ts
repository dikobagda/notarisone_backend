
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, phone: true }
  });
  console.log('Users:', JSON.stringify(users, null, 2));

  const invites = await prisma.tenantTeams.findMany();
  console.log('Invites:', JSON.stringify(invites, null, 2));
}

main().finally(() => prisma.$disconnect());
