const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const tid = "cmo3jby2w0000kkpx5d3cz7bs";
    const count = await prisma.deed.count({ where: { tenantId: tid } });
    console.log(`Deeds for tenant ${tid}:`, count);
    
    if (count > 0) {
       const first = await prisma.deed.findFirst({ where: { tenantId: tid } });
       console.log('Sample Deed:', JSON.stringify(first, (k,v) => typeof v === 'bigint' ? v.toString() : v, 2));
    }
    
    const allCount = await prisma.deed.count();
    console.log('Total deeds in DB:', allCount);

  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
