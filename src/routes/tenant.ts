import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { prisma } from '@/lib/prisma';
import { 
  startOfMonth, 
  endOfMonth, 
  subMonths, 
  startOfWeek, 
  endOfWeek,
  startOfDay,
  endOfDay
} from 'date-fns';

const PLAN_LIMITS: Record<string, number> = {
  STARTER: 5 * 1024 * 1024 * 1024, // 5GB in bytes
  PROFESSIONAL: 50 * 1024 * 1024 * 1024, // 50GB
  ENTERPRISE: 500 * 1024 * 1024 * 1024, // 500GB
};

const tenantRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // GET dashboard stats
  fastify.get('/stats', async (request, reply) => {
    let tenantId = (request as any).tenantId || (request.query as any).tenantId;
    
    // Strict tenantId check
    if (typeof tenantId !== 'string' || tenantId.trim() === '') {
       return reply.sendError('Tenant ID wajib disertakan atau tidak valid');
    }
    
    tenantId = tenantId.trim();

    const now = new Date();
    const thisMonthStart = startOfMonth(now);
    const thisMonthEnd = endOfMonth(now);
    const lastMonthStart = startOfMonth(subMonths(now, 1));
    const lastMonthEnd = endOfMonth(subMonths(now, 1));
    const thisWeekStart = startOfWeek(now, { weekStartsOn: 1 }); // Monday
    const thisWeekEnd = endOfWeek(now, { weekStartsOn: 1 });
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);

    try {
      // 1. Total Deeds & Growth
      const totalDeeds = await prisma.deed.count({ where: { tenantId, deletedAt: null } });
      const deedsThisMonth = await prisma.deed.count({ 
        where: { tenantId, createdAt: { gte: thisMonthStart, lte: thisMonthEnd }, deletedAt: null } 
      });
      const deedsLastMonth = await prisma.deed.count({ 
        where: { tenantId, createdAt: { gte: lastMonthStart, lte: lastMonthEnd }, deletedAt: null } 
      });

      let deedsGrowth = "0%";
      if (deedsLastMonth > 0) {
        deedsGrowth = `${(((deedsThisMonth - deedsLastMonth) / deedsLastMonth) * 100).toFixed(1)}%`;
        if (!deedsGrowth.startsWith('-')) deedsGrowth = `+${deedsGrowth}`;
      } else if (deedsThisMonth > 0) {
        deedsGrowth = "+100%";
      }

      // 2. New Clients & Growth
      const clientsThisMonth = await prisma.client.count({ 
        where: { tenantId, createdAt: { gte: thisMonthStart, lte: thisMonthEnd }, deletedAt: null } 
      });
      const clientsLastMonth = await prisma.client.count({ 
        where: { tenantId, createdAt: { gte: lastMonthStart, lte: lastMonthEnd }, deletedAt: null } 
      });
      const clientsGrowth = clientsThisMonth - clientsLastMonth;
      const clientsGrowthText = clientsGrowth >= 0 ? `+${clientsGrowth}` : `${clientsGrowth}`;

      // 3. Revenue & Growth (Invoices created this month)
      const revenueThisMonth = await prisma.invoice.aggregate({
        _sum: { totalAmount: true },
        where: { tenantId, createdAt: { gte: thisMonthStart, lte: thisMonthEnd } }
      });
      const revenueLastMonth = await prisma.invoice.aggregate({
        _sum: { totalAmount: true },
        where: { tenantId, createdAt: { gte: lastMonthStart, lte: lastMonthEnd } }
      });

      const revThis = Number(revenueThisMonth._sum.totalAmount || 0);
      const revLast = Number(revenueLastMonth._sum.totalAmount || 0);

      let revenueGrowth = "0%";
      if (revLast > 0) {
        revenueGrowth = `${(((revThis - revLast) / revLast) * 100).toFixed(1)}%`;
        if (!revenueGrowth.startsWith('-')) revenueGrowth = `+${revenueGrowth}`;
      } else if (revThis > 0) {
        revenueGrowth = "+100%";
      }

      // 4. Appointments (Weekly and Today)
      const rawAppointmentsCount = await prisma.appointment.count({ where: { tenantId } });
      const appointmentsThisWeek = await prisma.appointment.count({
        where: { tenantId, startTime: { gte: thisWeekStart, lte: thisWeekEnd }, deletedAt: null }
      });
      const appointmentsToday = await prisma.appointment.count({
        where: { tenantId, startTime: { gte: todayStart, lte: todayEnd }, deletedAt: null }
      });


      return reply.sendSuccess({
        deeds: {
          total: totalDeeds,
          growth: deedsGrowth
        },
        clients: {
          total: clientsThisMonth,
          growth: clientsGrowthText
        },
        revenue: {
          total: revThis,
          growth: revenueGrowth
        },
        appointments: {
          totalWeekly: appointmentsThisWeek,
          today: appointmentsToday
        }
      });
    } catch (error) {
      request.log.error(error);
      return reply.sendError('Gagal mengambil statistik dashboard');
    }
  });

  // GET storage usage info
  fastify.get('/storage-usage', async (request, reply) => {
    // Priority to request.tenantId from auth plugin, fallback to query
    const tenantId = (request as any).tenantId || (request.query as any).tenantId;
    
    if (!tenantId) {
      request.log.warn('Storage Usage: Tenant ID missing');
      return reply.sendError('Tenant ID wajib disertakan');
    }

    try {
      request.log.info(`Calculating storage usage for tenant: ${tenantId}`);

      // 1. Get Tenant Plan
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { subscription: true }
      });

      if (!tenant) {
        request.log.error(`Storage Usage: Tenant ${tenantId} not found in DB`);
        return reply.sendError('Tenant tidak ditemukan', 404);
      }

      // 2. Aggregate Version sizes
      const versionSum = await prisma.deedVersion.aggregate({
        _sum: { fileSize: true },
        where: { deed: { tenantId } }
      });

      // 3. Aggregate Stakeholder document sizes
      const stakeholderSum = await prisma.deedStakeholder.aggregate({
        _sum: { ktpSize: true, npwpSize: true },
        where: { deed: { tenantId } }
      });

      // 4. Aggregate Final Scan & Attachments sizes (from Deed)
      const deeds = await prisma.deed.findMany({
        where: { tenantId },
        select: { scanSize: true, attachments: true }
      });

      let scanTotal = 0n;
      let attachmentsTotal = 0n;

      for (const deed of deeds) {
        scanTotal += deed.scanSize || 0n;
        
        if (deed.attachments) {
          try {
            const atts = typeof deed.attachments === 'string' 
              ? JSON.parse(deed.attachments) 
              : deed.attachments;
            
            if (Array.isArray(atts)) {
              atts.forEach((a: any) => {
                if (a.size != null) {
                  try {
                    attachmentsTotal += BigInt(a.size);
                  } catch (e) {
                    // Skip invalid sizes
                  }
                }
              });
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      }

      const totalUsedBytes = 
        (versionSum._sum.fileSize || 0n) + 
        (stakeholderSum._sum.ktpSize || 0n) + 
        (stakeholderSum._sum.npwpSize || 0n) + 
        scanTotal + 
        attachmentsTotal;

      const limitBytes = PLAN_LIMITS[tenant.subscription] || PLAN_LIMITS.STARTER;
      const percentage = (Number(totalUsedBytes) / limitBytes) * 100;

      return reply.sendSuccess({
        plan: tenant.subscription,
        usedBytes: Number(totalUsedBytes),
        limitBytes: limitBytes,
        percentage: Math.min(percentage, 100).toFixed(2),
        breakdown: {
          drafts: Number(versionSum._sum.fileSize || 0n),
          identities: Number((stakeholderSum._sum.ktpSize || 0n) + (stakeholderSum._sum.npwpSize || 0n)),
          finalScans: Number(scanTotal),
          attachments: Number(attachmentsTotal)
        }
      });
    } catch (error) {
      request.log.error(error, 'Storage Usage Calculation Error:');
      return reply.sendError('Gagal menghitung penggunaan penyimpanan');
    }
  });
};

export default tenantRoutes;
