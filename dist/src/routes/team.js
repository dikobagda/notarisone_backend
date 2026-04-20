"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = require("../lib/prisma");
const zod_1 = require("zod");
const teamRoutes = async (fastify) => {
    // GET /api/team - List all users for the tenant
    fastify.get('/', async (request, reply) => {
        const { tenantId } = request.query;
        if (!tenantId)
            return reply.sendError('Tenant ID wajib disertakan');
        try {
            const users = await prisma_1.prisma.user.findMany({
                where: { tenantId, deletedAt: null },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    phone: true,
                    role: true,
                    isLocked: true,
                    createdAt: true,
                },
                orderBy: { createdAt: 'desc' }
            });
            return reply.sendSuccess(users);
        }
        catch (error) {
            request.log.error(error);
            return reply.sendError('Gagal memuat daftar anggota tim');
        }
    });
    // DELETE /api/team/:userId - Remove (soft delete) a team member
    fastify.delete('/:userId', async (request, reply) => {
        const { userId } = request.params;
        const { tenantId } = request.query;
        if (!tenantId)
            return reply.sendError('Tenant ID wajib disertakan');
        try {
            // Check if user exists and belongs to the same tenant
            const user = await prisma_1.prisma.user.findFirst({
                where: { id: userId, tenantId }
            });
            if (!user)
                return reply.sendError('Pengguna tidak ditemukan atau bukan anggota tim Anda');
            // Check if trying to delete a Notaris (only one Notaris usually exists, prevent self-deletion if needed)
            // For now, just a basic check
            if (user.role === 'NOTARIS') {
                return reply.sendError('Akun Notaris Utama tidak dapat dihapus');
            }
            await prisma_1.prisma.user.update({
                where: { id: userId },
                data: { deletedAt: new Date() }
            });
            // Log activity
            await fastify.logAudit({
                tenantId,
                userId: request.userId,
                action: 'DELETE_MEMBER',
                resource: 'User',
                resourceId: userId,
                payload: { name: user.name, email: user.email }
            });
            return reply.sendSuccess(null, 'Anggota tim berhasil dihapus');
        }
        catch (error) {
            request.log.error(error);
            return reply.sendError('Gagal menghapus anggota tim');
        }
    });
    // PUT /api/team/:userId - Update user details (phone, role)
    fastify.put('/:userId', async (request, reply) => {
        const { userId } = request.params;
        const { tenantId } = request.query;
        const schema = zod_1.z.object({
            phone: zod_1.z.string().optional().nullable(),
            role: zod_1.z.enum(['NOTARIS', 'PEGAWAI', 'KLIEN']).optional(),
        });
        const body = schema.safeParse(request.body);
        if (!body.success)
            return reply.sendError('Data tidak valid');
        try {
            const user = await prisma_1.prisma.user.findFirst({
                where: { id: userId, tenantId }
            });
            if (!user)
                return reply.sendError('Pengguna tidak ditemukan');
            if (user.role === 'NOTARIS')
                return reply.sendError('Data Office Owner / Notaris Utama tidak dapat dimodifikasi');
            await prisma_1.prisma.user.update({
                where: { id: userId },
                data: {
                    phone: body.data.phone !== undefined ? body.data.phone : undefined,
                    role: body.data.role !== undefined ? body.data.role : undefined,
                }
            });
            return reply.sendSuccess(null, 'Data anggota berhasil diperbarui');
        }
        catch (error) {
            request.log.error(error);
            return reply.sendError('Gagal memperbarui data anggota');
        }
    });
    // PATCH /api/team/:userId/lock - Toggle user lock status
    fastify.patch('/:userId/lock', async (request, reply) => {
        const { userId } = request.params;
        const { tenantId } = request.query;
        const schema = zod_1.z.object({ isLocked: zod_1.z.boolean() });
        const body = schema.safeParse(request.body);
        if (!body.success)
            return reply.sendError('Status lock tidak valid');
        try {
            const user = await prisma_1.prisma.user.findFirst({
                where: { id: userId, tenantId }
            });
            if (!user)
                return reply.sendError('Pengguna tidak ditemukan');
            if (user.role === 'NOTARIS')
                return reply.sendError('Akun Office Owner / Notaris Utama tidak dapat dikunci');
            await prisma_1.prisma.user.update({
                where: { id: userId },
                data: { isLocked: body.data.isLocked }
            });
            return reply.sendSuccess(null, body.data.isLocked ? 'Akses pengguna berhasil dikunci' : 'Akses pengguna berhasil dibuka');
        }
        catch (error) {
            request.log.error(error);
            return reply.sendError('Gagal mengubah status akses pengguna');
        }
    });
};
exports.default = teamRoutes;
//# sourceMappingURL=team.js.map