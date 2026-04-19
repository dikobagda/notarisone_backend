import { FastifyPluginAsync } from 'fastify';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import bcrypt from 'bcryptjs';

export const profileRoutes: FastifyPluginAsync = async (fastify) => {
  
  // GET /api/profile - Fetch profile data
  fastify.get('/', async (request, reply) => {
    const userId = request.userId;
    if (!userId) return reply.sendError('Unauthorized', 401);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { tenant: true }
    });

    if (!user) return reply.sendError('User tidak ditemukan', 404);

    return reply.sendSuccess({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        role: user.role,
      },
      tenant: {
        id: user.tenant.id,
        name: user.tenant.name,
        address: user.tenant.address,
        subscription: user.tenant.subscription,
      }
    });
  });

  // PATCH /api/profile - Update basic profile
  fastify.patch('/', async (request, reply) => {
    const userId = request.userId;
    if (!userId) return reply.sendError('Unauthorized', 401);

    const schema = z.object({
      name: z.string().min(2, 'Nama minimal 2 karakter').optional(),
      email: z.string().email('Email tidak valid').optional(),
      phone: z.string().optional(),
    });

    const body = schema.safeParse(request.body);
    console.log('[DEBUG] Update Profile Request Body:', JSON.stringify(request.body, null, 2));
    if (!body.success) {
      return reply.sendError(body.error.issues[0].message);
    }

    // Check if email taken by others
    if (body.data.email) {
      const existing = await prisma.user.findUnique({
        where: { email: body.data.email }
      });
      if (existing && existing.id !== userId) {
        return reply.sendError('Email sudah digunakan oleh akun lain');
      }
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        name: body.data.name,
        email: body.data.email,
        phone: body.data.phone,
      }
    });

    // Audit Log
    await fastify.logAudit({
      tenantId: request.tenantId,
      userId: request.userId,
      action: 'UPDATE_PROFILE',
      resource: 'User',
      resourceId: updated.id,
      payload: { name: body.data.name, email: body.data.email, phone: body.data.phone }
    });

    return reply.sendSuccess(updated, 'Profil berhasil diperbarui');
  });

  // PATCH /api/profile/password - Change password
  fastify.patch('/password', async (request, reply) => {
    const userId = request.userId;
    if (!userId) return reply.sendError('Unauthorized', 401);

    const schema = z.object({
      currentPassword: z.string().min(1, 'Password saat ini wajib diisi'),
      newPassword: z.string().min(8, 'Password baru minimal 8 karakter'),
    });

    const body = schema.safeParse(request.body);
    if (!body.success) {
      return reply.sendError(body.error.issues[0].message);
    }

    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) return reply.sendError('User tidak ditemukan', 404);

    const validPassword = await bcrypt.compare(body.data.currentPassword, user.password);
    if (!validPassword) {
      return reply.sendError('Password saat ini salah');
    }

    const hashedPassword = await bcrypt.hash(body.data.newPassword, 10);

    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword }
    });

    // Audit Log
    await fastify.logAudit({
      tenantId: request.tenantId,
      userId: request.userId,
      action: 'UPDATE_PASSWORD',
      resource: 'User',
      resourceId: user.id
    });

    return reply.sendSuccess(null, 'Password berhasil diperbarui');
  });

  // PATCH /api/profile/tenant - Update Tenant info (Notaris Only)
  fastify.patch('/tenant', async (request, reply) => {
    const userId = request.userId;
    const tenantId = request.tenantId;
    const role = request.role;

    if (!userId || !tenantId) return reply.sendError('Unauthorized', 401);
    if (role !== 'NOTARIS') {
      return reply.sendError('Hanya Notaris (Pemilik) yang dapat mengubah info kantor', 403);
    }

    const schema = z.object({
      name: z.string().min(2, 'Nama kantor minimal 2 karakter').optional(),
      address: z.string().optional(),
    });

    const body = schema.safeParse(request.body);
    if (!body.success) {
      return reply.sendError(body.error.issues[0].message);
    }

    const updated = await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        name: body.data.name,
        address: body.data.address,
      }
    });

    // Audit Log
    await fastify.logAudit({
      tenantId: request.tenantId,
      userId: request.userId,
      action: 'UPDATE_TENANT',
      resource: 'Tenant',
      resourceId: updated.id,
      payload: body.data
    });

    return reply.sendSuccess(updated, 'Info kantor berhasil diperbarui');
  });
};

export default profileRoutes;
