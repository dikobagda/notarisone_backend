
import { prisma } from './src/lib/prisma';
import { 
  startOfMonth, 
  endOfMonth, 
  subMonths, 
  startOfWeek, 
  endOfWeek,
  startOfDay,
  endOfDay
} from 'date-fns';

async function testStats(tenantId: string) {
    const now = new Date();
    const thisMonthStart = startOfMonth(now);
    const thisMonthEnd = endOfMonth(now);
    const lastMonthStart = startOfMonth(subMonths(now, 1));
    const lastMonthEnd = endOfMonth(subMonths(now, 1));
    const thisWeekStart = startOfWeek(now, { weekStartsOn: 1 });
    const thisWeekEnd = endOfWeek(now, { weekStartsOn: 1 });
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);

    console.log(`Testing stats for Tenant: ${tenantId}`);
    console.log(`Now: ${now}`);
    console.log(`This Month: ${thisMonthStart} - ${thisMonthEnd}`);
    console.log(`This Week: ${thisWeekStart} - ${thisWeekEnd}`);

    const totalDeeds = await prisma.deed.count({ where: { tenantId, deletedAt: null } });
    const deedsThisMonth = await prisma.deed.count({ 
      where: { tenantId, createdAt: { gte: thisMonthStart, lte: thisMonthEnd }, deletedAt: null } 
    });
    
    console.log(`Total Deeds: ${totalDeeds}`);
    console.log(`Deeds This Month: ${deedsThisMonth}`);

    const appointmentsThisWeek = await prisma.appointment.count({
      where: { tenantId, startTime: { gte: thisWeekStart, lte: thisWeekEnd }, deletedAt: null }
    });
    console.log(`Appointments This Week: ${appointmentsThisWeek}`);
}

testStats('cmo5awrjt00003ppxz2wmoxbk').catch(console.error).finally(() => prisma.$disconnect());
