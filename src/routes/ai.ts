import { FastifyInstance } from 'fastify';
import { prisma } from '@/lib/prisma';

export default async function aiRoutes(fastify: FastifyInstance) {
  fastify.get('/context', async (request, reply) => {
    // The authPlugin already attached tenantId to the request for protected routes
    const tenantId = request.tenantId;

    if (!tenantId) {
      return reply.code(400).send({ success: false, message: 'Tenant ID required' });
    }

    try {
      // 1. Periksa setelan global (SystemSetting)
      const globalSetting = await prisma.systemSetting.findUnique({
        where: { id: 'SYSTEM' }
      });
      if (globalSetting && globalSetting.aiAgentActive === false) {
        return reply.code(400).send({ success: false, message: 'Asisten AI Penagraha dinonaktifkan secara global oleh platform.' });
      }

      // 2. Periksa setelan lokal (Tenant)
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { aiEnabled: true }
      });
      if (tenant && tenant.aiEnabled === false) {
        return reply.code(400).send({ success: false, message: 'Asisten AI Penagraha dinonaktifkan untuk kantor Anda.' });
      }

      // Fetch data specifically for this tenant
      const [recentDeeds, recentClients, upcomingAppointments, tenantInfo] = await Promise.all([
        prisma.deed.findMany({
          where: { tenantId },
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: { title: true, type: true, status: true, deedNumber: true, createdAt: true },
        }),
        prisma.client.findMany({
          where: { tenantId },
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: { name: true, email: true, phone: true },
        }),
        prisma.appointment.findMany({
          where: { 
            tenantId, 
            startTime: { gte: new Date() } 
          },
          orderBy: { startTime: 'asc' },
          take: 5,
          select: { title: true, startTime: true, status: true },
        }),
        prisma.tenant.findUnique({
          where: { id: tenantId },
          select: { name: true, subscription: true }
        })
      ]);

      return reply.send({
        success: true,
        data: {
          tenant: tenantInfo,
          deeds: recentDeeds,
          clients: recentClients,
          appointments: upcomingAppointments,
        }
      });
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ success: false, message: 'Internal Server Error' });
    }
  });

  fastify.post('/query', async (request, reply) => {
    const tenantId = request.tenantId;

    if (!tenantId) {
      return reply.code(400).send({ success: false, message: 'Tenant ID required' });
    }

    try {
      // 1. Check global settings
      const globalSetting = await prisma.systemSetting.findUnique({
        where: { id: 'SYSTEM' }
      });
      if (globalSetting && globalSetting.aiAgentActive === false) {
        return reply.code(400).send({ success: false, message: 'Asisten AI Penagraha dinonaktifkan secara global oleh platform.' });
      }

      // 2. Check local tenant setting
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { aiEnabled: true }
      });
      if (tenant && tenant.aiEnabled === false) {
        return reply.code(400).send({ success: false, message: 'Asisten AI Penagraha dinonaktifkan untuk kantor Anda.' });
      }

      const { entity, filters = {}, limit = 10, offset = 0 } = request.body as any;

      if (!entity) {
        return reply.code(400).send({ success: false, message: 'Entity is required' });
      }

      // STATS
      if (entity === 'stats') {
        const [deedsCount, clientsCount, appointmentsCount, invoicesCount, waarmerkingsCount] = await Promise.all([
          prisma.deed.count({ where: { tenantId, deletedAt: null } }),
          prisma.client.count({ where: { tenantId, deletedAt: null } }),
          prisma.appointment.count({ where: { tenantId, deletedAt: null } }),
          prisma.invoice.count({ where: { tenantId } }),
          prisma.waarmerking.count({ where: { tenantId, deletedAt: null } }),
        ]);

        const deedsByStatus = await prisma.deed.groupBy({
          by: ['status'],
          where: { tenantId, deletedAt: null },
          _count: true,
        });

        const invoicesByStatus = await prisma.invoice.groupBy({
          by: ['status'],
          where: { tenantId },
          _count: true,
          _sum: {
            totalAmount: true,
          },
        });

        const appointmentsByStatus = await prisma.appointment.groupBy({
          by: ['status'],
          where: { tenantId, deletedAt: null },
          _count: true,
        });

        const upcomingAppointmentsCount = await prisma.appointment.count({
          where: {
            tenantId,
            deletedAt: null,
            startTime: { gte: new Date() },
          },
        });

        return reply.send({
          success: true,
          data: {
            counts: {
              deeds: deedsCount,
              clients: clientsCount,
              appointments: appointmentsCount,
              upcomingAppointments: upcomingAppointmentsCount,
              invoices: invoicesCount,
              waarmerkings: waarmerkingsCount,
            },
            deedsByStatus: deedsByStatus.map((g: any) => ({ status: g.status, count: g._count })),
            invoicesSummary: invoicesByStatus.map((g: any) => ({
              status: g.status,
              count: g._count,
              totalAmount: Number(g._sum.totalAmount || 0),
            })),
            appointmentsSummary: appointmentsByStatus.map((g: any) => ({ status: g.status, count: g._count })),
          },
        });
      }

      // CLIENTS
      if (entity === 'clients') {
        const { q, nik, email, phone } = filters;
        const where: any = { tenantId, deletedAt: null };

        if (nik) {
          where.nik = { contains: nik };
        }
        if (email) {
          where.email = { contains: email };
        }
        if (phone) {
          where.phone = { contains: phone };
        }
        if (q) {
          where.OR = [
            { name: { contains: q } },
            { email: { contains: q } },
            { phone: { contains: q } },
            { nik: { contains: q } },
            { address: { contains: q } },
            { kota: { contains: q } },
          ];
        }

        const clients = await prisma.client.findMany({
          where,
          take: Math.min(limit, 50),
          skip: offset,
          orderBy: { createdAt: 'desc' },
        });

        return reply.send({ success: true, data: clients });
      }

      // DEEDS
      if (entity === 'deeds') {
        const { q, status, type, clientId, startDate, endDate } = filters;
        const where: any = { tenantId, deletedAt: null };

        if (status) {
          where.status = status;
        }
        if (type) {
          where.type = type;
        }
        if (clientId) {
          where.clientId = clientId;
        }
        if (startDate || endDate) {
          where.createdAt = {};
          if (startDate) where.createdAt.gte = new Date(startDate);
          if (endDate) where.createdAt.lte = new Date(endDate);
        }
        if (q) {
          where.OR = [
            { title: { contains: q } },
            { deedNumber: { contains: q } },
            { client: { name: { contains: q } } },
          ];
        }

        const deeds = await prisma.deed.findMany({
          where,
          take: Math.min(limit, 50),
          skip: offset,
          orderBy: { createdAt: 'desc' },
          include: {
            client: {
              select: { id: true, name: true, phone: true, email: true }
            },
            createdBy: {
              select: { id: true, name: true }
            }
          }
        });

        return reply.send({ success: true, data: deeds });
      }

      // APPOINTMENTS
      if (entity === 'appointments') {
        const { status, type, startDate, endDate, q } = filters;
        const where: any = { tenantId, deletedAt: null };

        if (status) {
          where.status = status;
        }
        if (type) {
          where.type = type;
        }
        if (startDate || endDate) {
          where.startTime = {};
          if (startDate) where.startTime.gte = new Date(startDate);
          if (endDate) where.startTime.lte = new Date(endDate);
        }
        if (q) {
          where.OR = [
            { title: { contains: q } },
            { description: { contains: q } },
            { client: { name: { contains: q } } },
          ];
        }

        const appointments = await prisma.appointment.findMany({
          where,
          take: Math.min(limit, 50),
          skip: offset,
          orderBy: { startTime: 'asc' },
          include: {
            client: {
              select: { id: true, name: true, phone: true }
            },
            assignedTo: {
              select: { id: true, name: true }
            },
            deed: {
              select: { id: true, title: true, deedNumber: true }
            }
          }
        });

        return reply.send({ success: true, data: appointments });
      }

      // INVOICES
      if (entity === 'invoices') {
        const { status, q, startDate, endDate } = filters;
        const where: any = { tenantId };

        if (status) {
          where.status = status;
        }
        if (startDate || endDate) {
          where.createdAt = {};
          if (startDate) where.createdAt.gte = new Date(startDate);
          if (endDate) where.createdAt.lte = new Date(endDate);
        }
        if (q) {
          where.OR = [
            { invoiceNumber: { contains: q } },
            { client: { name: { contains: q } } },
          ];
        }

        const invoices = await prisma.invoice.findMany({
          where,
          take: Math.min(limit, 50),
          skip: offset,
          orderBy: { createdAt: 'desc' },
          include: {
            client: {
              select: { id: true, name: true }
            },
            deed: {
              select: { id: true, title: true, deedNumber: true }
            },
            payments: {
              where: { status: 'SUCCESS' },
              select: { amount: true, method: true, paymentDate: true }
            }
          }
        });

        return reply.send({ success: true, data: invoices });
      }

      // WAARMERKINGS
      if (entity === 'waarmerkings') {
        const { status, q, startDate, endDate } = filters;
        const where: any = { tenantId, deletedAt: null };

        if (status) {
          where.status = status;
        }
        if (startDate || endDate) {
          where.tanggalDaftar = {};
          if (startDate) where.tanggalDaftar.gte = new Date(startDate);
          if (endDate) where.tanggalDaftar.lte = new Date(endDate);
        }
        if (q) {
          where.OR = [
            { nomorDaftar: { contains: q } },
            { pemohon: { contains: q } },
            { perihal: { contains: q } }
          ];
        }

        const waarmerkings = await prisma.waarmerking.findMany({
          where,
          take: Math.min(limit, 50),
          skip: offset,
          orderBy: { tanggalDaftar: 'desc' },
          include: {
            client: {
              select: { id: true, name: true }
            }
          }
        });

        return reply.send({ success: true, data: waarmerkings });
      }

      // SERVICE REQUESTS
      if (entity === 'serviceRequests') {
        const { status, q, category } = filters;
        const where: any = { tenantId };

        if (status) {
          where.status = status;
        }
        if (category) {
          where.serviceCategory = category;
        }
        if (q) {
          where.OR = [
            { clientName: { contains: q } },
            { clientPhone: { contains: q } },
            { description: { contains: q } }
          ];
        }

        const serviceRequests = await prisma.serviceRequest.findMany({
          where,
          take: Math.min(limit, 50),
          skip: offset,
          orderBy: { createdAt: 'desc' },
          include: {
            client: {
              select: { id: true, name: true }
            }
          }
        });

        return reply.send({ success: true, data: serviceRequests });
      }

      return reply.code(400).send({ success: false, message: `Unsupported entity: ${entity}` });
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ success: false, message: 'Internal Server Error' });
    }
  });
}
