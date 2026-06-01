import { prisma } from '../src/lib/prisma';

async function testConnection() {
  console.log('[TEST-DB] Attempting to connect to database...');
  const start = Date.now();
  try {
    const deedCount = await prisma.deed.count();
    console.log(`[TEST-DB] SUCCESS! Connected successfully in ${Date.now() - start}ms.`);
    console.log(`[TEST-DB] Current total deeds in database: ${deedCount}`);
  } catch (error: any) {
    console.error(`[TEST-DB] FAILED! Connection failed after ${Date.now() - start}ms.`);
    console.error('[TEST-DB] Error details:', error.message || error);
    if (error.cause) {
      console.error('[TEST-DB] Error cause:', error.cause);
    }
  } finally {
    await prisma.$disconnect();
  }
}

testConnection();
