import { prisma } from '../lib/prisma';
import { NotificationType } from '@prisma/client';

export class NotificationService {
  /**
   * Create a notification for a specific user
   */
  static async notifyUser(params: {
    tenantId: string;
    userId: string;
    title: string;
    description: string;
    type?: NotificationType;
    actionUrl?: string;
  }) {
    try {
      const notification = await prisma.notification.create({
        data: {
          tenantId: params.tenantId,
          userId: params.userId,
          title: params.title,
          description: params.description,
          type: params.type || 'INFO',
          actionUrl: params.actionUrl,
        },
      });
      return notification;
    } catch (error) {
      console.error('[NotificationService] Failed to create notification:', error);
      return null;
    }
  }

  /**
   * Create notifications for all users in a tenant
   */
  static async notifyTenant(params: {
    tenantId: string;
    title: string;
    description: string;
    type?: NotificationType;
    actionUrl?: string;
    excludeUserId?: string;
  }) {
    try {
      // Get all active users in the tenant
      const users = await prisma.user.findMany({
        where: { 
          tenantId: params.tenantId,
          id: params.excludeUserId ? { not: params.excludeUserId } : undefined,
          deletedAt: null
        },
        select: { id: true }
      });

      if (users.length === 0) return [];

      // Create notifications in bulk (Prisma doesn't support createMany with relations easily, but this is fine)
      const notifications = await Promise.all(
        users.map((user: { id: string }) => 
          prisma.notification.create({
            data: {
              tenantId: params.tenantId,
              userId: user.id,
              title: params.title,
              description: params.description,
              type: params.type || 'INFO',
              actionUrl: params.actionUrl,
            }
          })
        )
      );

      return notifications;
    } catch (error) {
      console.error('[NotificationService] Failed to create tenant notifications:', error);
      return [];
    }
  }
}
