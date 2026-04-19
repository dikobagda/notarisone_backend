import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { prisma } from '@/lib/prisma';

declare module 'fastify' {
  interface FastifyInstance {
    logAudit: (data: {
      tenantId: string;
      userId?: string;
      action: string;
      resource: string;
      resourceId?: string;
      payload?: any;
    }) => Promise<void>;
  }
}

const auditPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate('logAudit', async (data) => {
    try {
      await prisma.auditLog.create({
        data: {
          tenantId: data.tenantId,
          userId: data.userId,
          action: data.action,
          resource: data.resource,
          resourceId: data.resourceId,
          payload: data.payload,
          ipAddress: '', // Will be updated if req is available
        },
      });
    } catch (error) {
      fastify.log.error(error as any, 'Audit Log Error:');
    }
  });
};

export default fp(auditPlugin);
