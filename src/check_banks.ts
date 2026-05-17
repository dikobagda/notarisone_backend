import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const banks = await prisma.bankAccount.findMany();
  console.log(JSON.stringify(banks, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
