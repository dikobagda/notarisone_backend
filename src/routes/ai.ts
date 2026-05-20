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
}
