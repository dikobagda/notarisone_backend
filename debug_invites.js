const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const invites = await prisma.tenantTeams.findMany();
  console.log(JSON.stringify(invites, null, 2));
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
