import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma';

export default async function notificationRoutes(fastify: FastifyInstance) {
  // GET /api/notifications
  fastify.get('/', async (request, reply) => {
    const userId = request.userId;
    const tenantId = request.tenantId;

    if (!userId || !tenantId) return reply.sendError('Unauthorized', 401);

    try {
      const notifications = await prisma.notification.findMany({
        where: {
          tenantId,
          userId, // We can scale this later to allow tenant-wide notifications where userId is null
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 50, // Limit to 50 most recent notifications for now
      });

      return reply.sendSuccess({ notifications });
    } catch (error: any) {
      request.log.error(error);
      return reply.sendError('Failed to fetch notifications', 500);
    }
  });

  // PATCH /api/notifications/read-all
  fastify.patch('/read-all', async (request, reply) => {
    const userId = request.userId;
    const tenantId = request.tenantId;

    if (!userId || !tenantId) return reply.sendError('Unauthorized', 401);

    try {
      await prisma.notification.updateMany({
        where: {
          tenantId,
          userId,
          isRead: false,
        },
        data: {
          isRead: true,
        },
      });

      return reply.sendSuccess(null, 'All notifications marked as read');
    } catch (error: any) {
      request.log.error(error);
      return reply.sendError('Failed to mark notifications as read', 500);
    }
  });

  // PATCH /api/notifications/:id/read
  fastify.patch('/:id/read', async (request, reply) => {
    const userId = request.userId;
    const tenantId = request.tenantId;
    const { id } = request.params as { id: string };

    if (!userId || !tenantId) return reply.sendError('Unauthorized', 401);

    try {
      const notification = await prisma.notification.findUnique({
        where: { id },
      });

      if (!notification || notification.tenantId !== tenantId || notification.userId !== userId) {
        return reply.sendError('Notification not found', 404);
      }

      const updated = await prisma.notification.update({
        where: { id },
        data: { isRead: true },
      });

      return reply.sendSuccess({ notification: updated });
    } catch (error: any) {
      request.log.error(error);
      return reply.sendError('Failed to mark notification as read', 500);
    }
  });
}
