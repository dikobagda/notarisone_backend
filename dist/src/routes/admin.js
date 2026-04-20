"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = require("../lib/prisma");
const zod_1 = require("zod");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const tenantStatusSchema = zod_1.z.object({
    status: zod_1.z.enum(['ACTIVE', 'SUSPENDED', 'TRIAL']),
});
const adminRoutes = async (fastify) => {
    // Middleware for Admin Only
    // In real app, we verify JWT and check if user exists in AdminUser table
    fastify.addHook('preHandler', async (request, reply) => {
        // Mock admin verification for Phase 1.5
        const adminToken = request.headers['x-admin-token'];
        if (adminToken !== 'super-secret-admin-token') {
            return reply.code(403).send({
                success: false,
                message: 'Akses ditolak. Anda bukan Administrator NotarisOne.',
            });
        }
    });
    // GET all tenants (Platform Monitor)
    fastify.get('/tenants', async (request, reply) => {
        const tenants = await prisma_1.prisma.tenant.findMany({
            include: {
                _count: {
                    select: {
                        users: true,
                        deeds: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
        return reply.sendSuccess(tenants);
    });
    // PATCH update tenant status (Activation/Suspension)
    fastify.patch('/tenants/:id/status', async (request, reply) => {
        const { id } = request.params;
        const body = tenantStatusSchema.safeParse(request.body);
        if (!body.success) {
            return reply.code(422).send({
                success: false,
                message: 'Status tidak valid',
            });
        }
        try {
            const tenant = await prisma_1.prisma.tenant.update({
                where: { id },
                data: { status: body.data.status },
            });
            // Audit Log for Platform Action
            await fastify.logAudit({
                tenantId: id,
                action: `SET_STATUS_${body.data.status}`,
                resource: 'Tenant',
                resourceId: id,
                payload: { status: body.data.status, admin: 'System' },
            });
            return reply.sendSuccess(tenant, `Status tenant berhasil diubah ke ${body.data.status}`);
        }
        catch (error) {
            return reply.sendError('Gagal memperbarui status tenant');
        }
    });
    // GET platform stats
    fastify.get('/stats', async (request, reply) => {
        const tenantCount = await prisma_1.prisma.tenant.count();
        const userCount = await prisma_1.prisma.user.count();
        const deedCount = await prisma_1.prisma.deed.count();
        return reply.sendSuccess({
            tenantCount,
            userCount,
            deedCount,
            revenue: 0, // Placeholder
        });
    });
    // POST Manual Onboarding (Tenant + Notary User)
    fastify.post('/tenants/onboard', async (request, reply) => {
        const onboardingSchema = zod_1.z.object({
            officeName: zod_1.z.string().min(3),
            address: zod_1.z.string().optional(),
            notaryName: zod_1.z.string().min(2),
            notaryEmail: zod_1.z.string().email(),
        });
        const body = onboardingSchema.safeParse(request.body);
        if (!body.success) {
            return reply.code(422).send({
                success: false,
                message: 'Data onboarding tidak valid',
                errors: body.error.format(),
            });
        }
        try {
            // Transactional creation
            const result = await prisma_1.prisma.$transaction(async (tx) => {
                // 1. Create Tenant
                const tenant = await tx.tenant.create({
                    data: {
                        name: body.data.officeName,
                        address: body.data.address,
                        status: 'ACTIVE',
                        subscription: 'TRIAL',
                    },
                });
                // 2. Create Primary Notary User
                const hashedPassword = await bcryptjs_1.default.hash('notaris123', 10);
                const user = await tx.user.create({
                    data: {
                        email: body.data.notaryEmail,
                        name: body.data.notaryName,
                        role: 'NOTARIS',
                        tenantId: tenant.id,
                        password: hashedPassword,
                    },
                });
                return { tenant, user };
            });
            // Platform Audit Log
            await fastify.logAudit({
                tenantId: result.tenant.id,
                action: 'MANUAL_ONBOARDING',
                resource: 'Tenant',
                resourceId: result.tenant.id,
                payload: { office: body.data.officeName, email: body.data.notaryEmail },
            });
            return reply.code(201).sendSuccess(result, `Berhasil mendaftarkan ${body.data.officeName}. Undangan email akan dikirim ke ${body.data.notaryEmail}.`);
        }
        catch (error) {
            fastify.log.error(error);
            if (error.code === 'P2002') {
                return reply.sendError('Alamat email sudah terdaftar di platform.', 409);
            }
            return reply.sendError('Gagal melakukan onboarding tenant.');
        }
    });
};
exports.default = adminRoutes;
//# sourceMappingURL=admin.js.map