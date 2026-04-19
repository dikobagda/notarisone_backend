import { FastifyPluginAsync } from 'fastify';
import { prisma } from '@/lib/prisma';

const auditRoutes: FastifyPluginAsync = async (fastify) => {
  // GET audit logs for the current tenant (optionally filtered by resourceId)
  fastify.get('/', async (request, reply) => {
    const { tenantId, limit, resourceId } = request.query as { tenantId: string, limit?: string, resourceId?: string };
    
    if (!tenantId) return reply.sendError('Tenant ID wajib disertakan');

    const take = limit ? parseInt(limit) : 50;

    try {
      const logs = await prisma.auditLog.findMany({
        where: { 
          tenantId,
          ...(resourceId ? { resourceId } : {}),
        },
        include: {
          user: {
            select: { id: true, name: true, role: true }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: take
      });

      return reply.sendSuccess(logs);
    } catch (error) {
      request.log.error(error);
      return reply.sendError('Gagal memuat log aktivitas');
    }
  });
};

export default auditRoutes;
