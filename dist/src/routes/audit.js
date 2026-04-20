"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = require("../lib/prisma");
const auditRoutes = async (fastify) => {
    // GET audit logs for the current tenant (optionally filtered by resourceId)
    fastify.get('/', async (request, reply) => {
        const { tenantId, limit, resourceId } = request.query;
        if (!tenantId)
            return reply.sendError('Tenant ID wajib disertakan');
        const take = limit ? parseInt(limit) : 50;
        try {
            const logs = await prisma_1.prisma.auditLog.findMany({
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
        }
        catch (error) {
            request.log.error(error);
            return reply.sendError('Gagal memuat log aktivitas');
        }
    });
};
exports.default = auditRoutes;
//# sourceMappingURL=audit.js.map