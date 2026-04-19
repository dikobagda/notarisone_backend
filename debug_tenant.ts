import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const tenantId = 'cmo5awrjt00003ppxz2wmoxbk';
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId }
  });

  if (!tenant) {
    console.log('Tenant not found');
  } else {
    console.log('--- Tenant Status ---');
    console.log('ID           :', tenant.id);
    console.log('Name         :', tenant.name);
    console.log('Sub          :', tenant.subscription);
    console.log('Expires      :', tenant.subscriptionExpiresAt);
    console.log('Last Payment :', tenant.lastPaymentId);
    console.log('---------------------');
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
