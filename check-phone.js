const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('--- USERS ---');
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, phone: true }
  });
  console.log(JSON.stringify(users, null, 2));

  console.log('--- INVITES ---');
  const invites = await prisma.tenantTeams.findMany({
    select: { id: true, email: true, phone: true, acceptedAt: true }
  });
  console.log(JSON.stringify(invites, null, 2));

  console.log('--- RECENT AUDIT LOGS ---');
  const logs = await prisma.auditLog.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    select: { action: true, payload: true, createdAt: true }
  });
  console.log(JSON.stringify(logs, null, 2));
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
