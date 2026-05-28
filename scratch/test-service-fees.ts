import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import 'dotenv/config';

const rawUrl = process.env.DATABASE_URL || '';
const connectionString = rawUrl.trim().replace(/^mysql:\/\//, 'mariadb://');
const adapter = new PrismaMariaDb(connectionString);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Querying ServiceFeeMaster...");
  try {
    const fees = await prisma.serviceFeeMaster.findMany({
      where: { tenantId: "cmo5pfwzw0007fypxangt02sa" }
    });
    console.log("Fees found:", fees);
  } catch (error) {
    console.error("Query failed with error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
