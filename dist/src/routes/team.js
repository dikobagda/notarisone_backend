"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = require("@/lib/prisma");
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
    // PATCH /api/team/:userId/role - Change user role
    fastify.patch('/:userId/role', async (request, reply) => {
        const { userId } = request.params;
        const { tenantId } = request.query;
        const schema = zod_1.z.object({ role: zod_1.z.enum(['NOTARIS', 'PEGAWAI', 'KLIEN']) });
        const body = schema.safeParse(request.body);
        if (!body.success)
            return reply.sendError('Role tidak valid');
        try {
            const user = await prisma_1.prisma.user.findFirst({
                where: { id: userId, tenantId }
            });
            if (!user)
                return reply.sendError('Pengguna tidak ditemukan');
            await prisma_1.prisma.user.update({
                where: { id: userId },
                data: { role: body.data.role }
            });
            return reply.sendSuccess(null, 'Role berhasil diperbarui');
        }
        catch (error) {
            request.log.error(error);
            return reply.sendError('Gagal memperbarui role');
        }
    });
};
exports.default = teamRoutes;
//# sourceMappingURL=team.js.map