import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const version = await prisma.deedVersion.findFirst({ orderBy: { createdAt: 'desc' } });
  console.log(version);
}
main().catch(console.error).finally(() => prisma.$disconnect());
