import { FastifyPluginAsync } from 'fastify';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import crypto from 'crypto';
import { sendDeedNotification } from '@/lib/email';

const tenantTeamRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/tenant-teams - List pending invitations
  fastify.get('/', async (request, reply) => {
    const { tenantId } = request.query as { tenantId: string };
    if (!tenantId) return reply.sendError('Tenant ID wajib disertakan');

    try {
      const invites = await prisma.tenantTeams.findMany({
        where: { tenantId, acceptedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' }
      });
      return reply.sendSuccess(invites);
    } catch (error) {
      request.log.error(error);
      return reply.sendError('Gagal memuat daftar undangan');
    }
  });

  // POST /api/tenant-teams/invite - Send email invitation
  fastify.post('/invite', async (request, reply) => {
    const inviteSchema = z.object({
      email: z.string().email('Email tidak valid'),
      phone: z.string().optional(),
      role: z.enum(['NOTARIS', 'PEGAWAI', 'KLIEN']).default('PEGAWAI'),
    });

    const body = inviteSchema.safeParse(request.body);
    console.log('[DEBUG] Invite Request Body:', JSON.stringify(request.body, null, 2));
    if (!body.success) return reply.sendError(body.error.issues[0].message);

    const { tenantId } = request.query as { tenantId: string };
    if (!tenantId) return reply.sendError('Tenant ID wajib disertakan');

    try {
      // Check if user already exists
      const existingUser = await prisma.user.findUnique({ where: { email: body.data.email } });
      if (existingUser) return reply.sendError('Email sudah terdaftar sebagai pengguna sistem');

      // Check if there is an active invite already
      const existingInvite = await prisma.tenantTeams.findFirst({
        where: { email: body.data.email, tenantId, acceptedAt: null, expiresAt: { gt: new Date() } }
      });

      if (existingInvite) return reply.sendError('Undangan aktif sudah dikirim ke email ini');

      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 48); // 48 hours

      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) return reply.sendError('Kantor tidak ditemukan');

      const invite = await prisma.tenantTeams.create({
        data: {
          tenantId,
          email: body.data.email,
          phone: body.data.phone,
          role: body.data.role,
          token,
          expiresAt
        }
      });

      // Send Email
      await sendDeedNotification(body.data.email, 'TEAM_INVITATION', {
        token,
        kantorName: tenant.name,
        role: body.data.role
      });

      // Log activity
      await fastify.logAudit({
        tenantId,
        userId: (request as any).userId,
        action: 'INVITE_MEMBER',
        resource: 'TenantTeam',
        resourceId: invite.id,
        payload: { email: body.data.email, phone: body.data.phone, role: body.data.role }
      });

      return reply.sendSuccess(invite, 'Undangan berhasil dikirim');
    } catch (error) {
      request.log.error(error);
      return reply.sendError('Gagal mengirim undangan');
    }
  });

  // DELETE /api/tenant-teams/:id - Revoke invitation
  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { tenantId } = request.query as { tenantId: string };
    if (!tenantId) return reply.sendError('Tenant ID wajib disertakan');

    try {
      const invite = await prisma.tenantTeams.findFirst({ where: { id, tenantId } });
      if (!invite) return reply.sendError('Undangan tidak ditemukan');

      await prisma.tenantTeams.delete({ where: { id } });

      // Log activity
      await fastify.logAudit({
        tenantId,
        userId: (request as any).userId,
        action: 'REVOKE_INVITE',
        resource: 'TenantTeam',
        resourceId: id,
        payload: { email: invite.email }
      });

      return reply.sendSuccess(null, 'Undangan berhasil dibatalkan');
    } catch (error) {
      request.log.error(error);
      return reply.sendError('Gagal membatalkan undangan');
    }
  });

  // POST /api/tenant-teams/resend/:id - Resend invitation email
  fastify.post('/resend/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { tenantId } = request.query as { tenantId: string };
    if (!tenantId) return reply.sendError('Tenant ID wajib disertakan');

    try {
      const invite = await prisma.tenantTeams.findFirst({ 
        where: { id, tenantId },
        include: { tenant: true }
      });

      if (!invite) return reply.sendError('Undangan tidak ditemukan');
      if (invite.acceptedAt) return reply.sendError('Undangan sudah diterima, tidak bisa dikirim ulang');

      // Regenerate token and refresh expiry
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 48); // 48 hours more

      await prisma.tenantTeams.update({
        where: { id },
        data: { token, expiresAt, updatedAt: new Date() }
      });

      // Send Email
      await sendDeedNotification(invite.email, 'TEAM_INVITATION', {
        token,
        kantorName: invite.tenant.name,
        role: invite.role
      });

      // Log activity
      await fastify.logAudit({
        tenantId,
        userId: (request as any).userId,
        action: 'RESEND_INVITE',
        resource: 'TenantTeam',
        resourceId: id,
        payload: { email: invite.email }
      });

      return reply.sendSuccess(null, 'Undangan berhasil dikirim ulang');
    } catch (error) {
      request.log.error(error);
      return reply.sendError('Gagal mengirim ulang undangan');
    }
  });
};

export default tenantTeamRoutes;
