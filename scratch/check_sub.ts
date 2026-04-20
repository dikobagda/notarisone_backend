import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: 'dikobagda@gmail.com' },
    include: { tenant: true }
  });

  if (!user) {
    console.log('User not found');
  } else {
    console.log('User:', user.name);
    console.log('Tenant:', user.tenant.name);
    console.log('Subscription:', user.tenant.subscription);
    console.log('Last Payment ID:', user.tenant.lastPaymentId);
    console.log('Subscription Expires At:', user.tenant.subscriptionExpiresAt);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
