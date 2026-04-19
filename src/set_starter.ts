import 'dotenv/config';
import { prisma } from './lib/prisma';

async function main() {
  const email = 'dikobagda@gmail.com';
  console.log(`Setting ${email} to STARTER...`);
  
  const user = await prisma.user.findUnique({
    where: { email },
    include: { tenant: true }
  });

  if (!user) {
    console.error('User not found');
    return;
  }

  const expiry = new Date();
  expiry.setMonth(expiry.getDate() + 30); // 30 days trial

  await prisma.tenant.update({
    where: { id: user.tenantId },
    data: {
      subscription: 'STARTER' as any,
      subscriptionExpiresAt: expiry,
      status: 'ACTIVE' as any
    }
  });

  console.log('Successfully updated tenant to STARTER');
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
