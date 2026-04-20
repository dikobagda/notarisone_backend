import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient({ datasources: { db: { url: "mysql://root:fufufafa@127.0.0.1:3306/notarisone" } } }); // Use local db just to check if it's there? Wait, the user was testing with Hostinger DB! Let's query Hostinger DB!
async function main() {
  const version = await prisma.deedVersion.findFirst({ orderBy: { createdAt: 'desc' } });
  console.log(JSON.stringify(version, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
