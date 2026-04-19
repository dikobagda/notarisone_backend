import { prisma } from './src/lib/prisma';

async function main() {
  const tenantId = 'cmo5awrjt00003ppxz2wmoxbk';
  
  // RAW query to bypass any extensions if needed, but let's try prisma first
  const rawDeedsCount = await prisma.deed.count({ where: { tenantId } });
  const activeDeedsCount = await prisma.deed.count({ where: { tenantId, deletedAt: null } });
  
  console.log(`--- DB DEBUG for ${tenantId} ---`);
  console.log(`Total Deeds (inc deleted): ${rawDeedsCount}`);
  console.log(`Active Deeds: ${activeDeedsCount}`);
  
  if (activeDeedsCount > 0) {
    const latestDeed = await prisma.deed.findFirst({
       where: { tenantId, deletedAt: null },
       orderBy: { createdAt: 'desc' },
       include: { client: true }
    });
    console.log(`Latest active deed: "${latestDeed?.title}" created at ${latestDeed?.createdAt} for client ${latestDeed?.client?.name}`);
  }

  const appointmentsCount = await prisma.appointment.count({ where: { tenantId } });
  const activeAppointmentsCount = await prisma.appointment.count({ where: { tenantId, deletedAt: null } });
  console.log(`Total Appointments: ${appointmentsCount}`);
  console.log(`Active Appointments: ${activeAppointmentsCount}`);

  if (activeAppointmentsCount > 0) {
    const latestApp = await prisma.appointment.findFirst({
      where: { tenantId, deletedAt: null },
      orderBy: { startTime: 'desc' }
    });
    console.log(`Latest appointment: "${latestApp?.title}" at ${latestApp?.startTime}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
