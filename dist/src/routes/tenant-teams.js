"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = require("@/lib/prisma");
const zod_1 = require("zod");
const crypto_1 = __importDefault(require("crypto"));
const email_1 = require("@/lib/email");
const tenantTeamRoutes = async (fastify) => {
    // GET /api/tenant-teams - List pending invitations
    fastify.get('/', async (request, reply) => {
        const { tenantId } = request.query;
        if (!tenantId)
            return reply.sendError('Tenant ID wajib disertakan');
        try {
            const invites = await prisma_1.prisma.tenantTeams.findMany({
                where: { tenantId, acceptedAt: null, expiresAt: { gt: new Date() } },
                orderBy: { createdAt: 'desc' }
            });
            return reply.sendSuccess(invites);
        }
        catch (error) {
            request.log.error(error);
            return reply.sendError('Gagal memuat daftar undangan');
        }
    });
    // POST /api/tenant-teams/invite - Send email invitation
    fastify.post('/invite', async (request, reply) => {
        const inviteSchema = zod_1.z.object({
            email: zod_1.z.string().email('Email tidak valid'),
            phone: zod_1.z.string().optional(),
            role: zod_1.z.enum(['NOTARIS', 'PEGAWAI', 'KLIEN']).default('PEGAWAI'),
        });
        const body = inviteSchema.safeParse(request.body);
        console.log('[DEBUG] Invite Request Body:', JSON.stringify(request.body, null, 2));
        if (!body.success)
            return reply.sendError(body.error.issues[0].message);
        const { tenantId } = request.query;
        if (!tenantId)
            return reply.sendError('Tenant ID wajib disertakan');
        try {
            // Check if user already exists
            const existingUser = await prisma_1.prisma.user.findUnique({ where: { email: body.data.email } });
            if (existingUser)
                return reply.sendError('Email sudah terdaftar sebagai pengguna sistem');
            // Check if there is an active invite already
            const existingInvite = await prisma_1.prisma.tenantTeams.findFirst({
                where: { email: body.data.email, tenantId, acceptedAt: null, expiresAt: { gt: new Date() } }
            });
            if (existingInvite)
                return reply.sendError('Undangan aktif sudah dikirim ke email ini');
            const token = crypto_1.default.randomBytes(32).toString('hex');
            const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 48); // 48 hours
            const tenant = await prisma_1.prisma.tenant.findUnique({ where: { id: tenantId } });
            if (!tenant)
                return reply.sendError('Kantor tidak ditemukan');
            const invite = await prisma_1.prisma.tenantTeams.create({
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
            await (0, email_1.sendDeedNotification)(body.data.email, 'TEAM_INVITATION', {
                token,
                kantorName: tenant.name,
                role: body.data.role
            });
            // Log activity
            await fastify.logAudit({
                tenantId,
                userId: request.userId,
                action: 'INVITE_MEMBER',
                resource: 'TenantTeam',
                resourceId: invite.id,
                payload: { email: body.data.email, phone: body.data.phone, role: body.data.role }
            });
            return reply.sendSuccess(invite, 'Undangan berhasil dikirim');
        }
        catch (error) {
            request.log.error(error);
            return reply.sendError('Gagal mengirim undangan');
        }
    });
    // DELETE /api/tenant-teams/:id - Revoke invitation
    fastify.delete('/:id', async (request, reply) => {
        const { id } = request.params;
        const { tenantId } = request.query;
        if (!tenantId)
            return reply.sendError('Tenant ID wajib disertakan');
        try {
            const invite = await prisma_1.prisma.tenantTeams.findFirst({ where: { id, tenantId } });
            if (!invite)
                return reply.sendError('Undangan tidak ditemukan');
            await prisma_1.prisma.tenantTeams.delete({ where: { id } });
            // Log activity
            await fastify.logAudit({
                tenantId,
                userId: request.userId,
                action: 'REVOKE_INVITE',
                resource: 'TenantTeam',
                resourceId: id,
                payload: { email: invite.email }
            });
            return reply.sendSuccess(null, 'Undangan berhasil dibatalkan');
        }
        catch (error) {
            request.log.error(error);
            return reply.sendError('Gagal membatalkan undangan');
        }
    });
    // POST /api/tenant-teams/resend/:id - Resend invitation email
    fastify.post('/resend/:id', async (request, reply) => {
        const { id } = request.params;
        const { tenantId } = request.query;
        if (!tenantId)
            return reply.sendError('Tenant ID wajib disertakan');
        try {
            const invite = await prisma_1.prisma.tenantTeams.findFirst({
                where: { id, tenantId },
                include: { tenant: true }
            });
            if (!invite)
                return reply.sendError('Undangan tidak ditemukan');
            if (invite.acceptedAt)
                return reply.sendError('Undangan sudah diterima, tidak bisa dikirim ulang');
            // Regenerate token and refresh expiry
            const token = crypto_1.default.randomBytes(32).toString('hex');
            const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 48); // 48 hours more
            await prisma_1.prisma.tenantTeams.update({
                where: { id },
                data: { token, expiresAt, updatedAt: new Date() }
            });
            // Send Email
            await (0, email_1.sendDeedNotification)(invite.email, 'TEAM_INVITATION', {
                token,
                kantorName: invite.tenant.name,
                role: invite.role
            });
            // Log activity
            await fastify.logAudit({
                tenantId,
                userId: request.userId,
                action: 'RESEND_INVITE',
                resource: 'TenantTeam',
                resourceId: id,
                payload: { email: invite.email }
            });
            return reply.sendSuccess(null, 'Undangan berhasil dikirim ulang');
        }
        catch (error) {
            request.log.error(error);
            return reply.sendError('Gagal mengirim ulang undangan');
        }
    });
};
exports.default = tenantTeamRoutes;
//# sourceMappingURL=tenant-teams.js.map