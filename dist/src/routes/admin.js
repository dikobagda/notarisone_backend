"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = require("../lib/prisma");
const zod_1 = require("zod");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const JWT_SECRET = process.env.NEXTAUTH_SECRET || "penagraha_local_secret_key";
const tenantStatusSchema = zod_1.z.object({
    status: zod_1.z.enum(['ACTIVE', 'SUSPENDED', 'TRIAL']),
});
const adminRoutes = async (fastify) => {
    // Middleware: Verify JWT and check AdminUser table
    fastify.addHook('preHandler', async (request, reply) => {
        const authHeader = request.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return reply.code(401).send({ success: false, message: 'Authorization header diperlukan' });
        }
        const token = authHeader.split(' ')[1];
        try {
            const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
            // Must be SUPERADMIN or STAFF role from AdminUser
            if (!decoded || (decoded.role !== 'SUPERADMIN' && decoded.role !== 'STAFF')) {
                return reply.code(403).send({ success: false, message: 'Akses ditolak. Anda bukan Administrator penagraha.' });
            }
            // Verify admin still exists in database
            const admin = await prisma_1.prisma.adminUser.findUnique({ where: { id: decoded.sub } });
            if (!admin) {
                return reply.code(403).send({ success: false, message: 'Akun admin tidak ditemukan.' });
            }
            if (admin.isLocked) {
                return reply.code(403).send({ success: false, message: 'Akun admin Anda telah dinonaktifkan.' });
            }
        }
        catch (err) {
            return reply.code(401).send({ success: false, message: 'Token tidak valid.' });
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
    // GET single tenant details (Platform Monitor)
    fastify.get('/tenants/:id', async (request, reply) => {
        const { id } = request.params;
        try {
            const tenant = await prisma_1.prisma.tenant.findUnique({
                where: { id },
                include: {
                    users: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            role: true,
                            isLocked: true,
                            createdAt: true,
                        },
                        orderBy: { role: 'asc' },
                    },
                    _count: {
                        select: {
                            users: true,
                            deeds: true,
                        },
                    },
                },
            });
            if (!tenant) {
                return reply.code(404).send({ success: false, message: 'Tenant tidak ditemukan' });
            }
            return reply.sendSuccess(tenant);
        }
        catch (error) {
            return reply.sendError('Gagal mengambil data detail tenant');
        }
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
    // ─── Internal Admin User Management Endpoints ───
    // 1. GET /users - List all internal admin users
    fastify.get('/users', async (request, reply) => {
        try {
            const admins = await prisma_1.prisma.adminUser.findMany({
                select: {
                    id: true,
                    email: true,
                    name: true,
                    role: true,
                    isLocked: true,
                    createdAt: true,
                    updatedAt: true,
                },
                orderBy: { createdAt: 'desc' },
            });
            return reply.sendSuccess(admins);
        }
        catch (error) {
            fastify.log.error(error);
            return reply.sendError('Gagal mengambil data user internal');
        }
    });
    // 2. POST /users - Create a new internal admin user
    fastify.post('/users', async (request, reply) => {
        const createUserSchema = zod_1.z.object({
            name: zod_1.z.string().min(2),
            email: zod_1.z.string().email(),
            role: zod_1.z.enum(['SUPERADMIN', 'STAFF']),
            password: zod_1.z.string().min(6).optional(),
        });
        const parseResult = createUserSchema.safeParse(request.body);
        if (!parseResult.success) {
            return reply.code(422).send({
                success: false,
                message: 'Data user tidak valid',
                errors: parseResult.error.format(),
            });
        }
        const { name, email, role, password } = parseResult.data;
        try {
            // Check duplicate email
            const existing = await prisma_1.prisma.adminUser.findUnique({ where: { email } });
            if (existing) {
                return reply.code(409).send({
                    success: false,
                    message: 'Alamat email sudah digunakan',
                });
            }
            // Default temporary password if none provided
            const rawPassword = password || 'admin123';
            const hashedPassword = await bcryptjs_1.default.hash(rawPassword, 10);
            const newAdmin = await prisma_1.prisma.adminUser.create({
                data: {
                    name,
                    email,
                    role,
                    password: hashedPassword,
                },
                select: {
                    id: true,
                    email: true,
                    name: true,
                    role: true,
                    isLocked: true,
                    createdAt: true,
                }
            });
            // Audit Log
            await fastify.logAudit({
                tenantId: 'SYSTEM',
                action: 'CREATE_INTERNAL_USER',
                resource: 'AdminUser',
                resourceId: newAdmin.id,
                payload: { name, email, role },
            });
            return reply.code(201).sendSuccess(newAdmin, 'User internal berhasil dibuat');
        }
        catch (error) {
            fastify.log.error(error);
            return reply.sendError('Gagal membuat user internal');
        }
    });
    // 3. PUT /users/:id/toggle-lock - Toggle block status of an internal admin user
    fastify.put('/users/:id/toggle-lock', async (request, reply) => {
        const { id } = request.params;
        const authHeader = request.headers.authorization;
        const token = authHeader.split(' ')[1];
        let currentAdminId = '';
        try {
            const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
            currentAdminId = decoded.sub;
        }
        catch (err) {
            // should already be validated by preHandler
        }
        if (id === currentAdminId) {
            return reply.code(400).send({
                success: false,
                message: 'Anda tidak dapat mengunci akun Anda sendiri',
            });
        }
        try {
            const admin = await prisma_1.prisma.adminUser.findUnique({ where: { id } });
            if (!admin) {
                return reply.code(404).send({
                    success: false,
                    message: 'User internal tidak ditemukan',
                });
            }
            const updated = await prisma_1.prisma.adminUser.update({
                where: { id },
                data: { isLocked: !admin.isLocked },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    isLocked: true,
                }
            });
            // Audit Log
            await fastify.logAudit({
                tenantId: 'SYSTEM',
                action: updated.isLocked ? 'LOCK_INTERNAL_USER' : 'UNLOCK_INTERNAL_USER',
                resource: 'AdminUser',
                resourceId: updated.id,
                payload: { targetEmail: updated.email },
            });
            return reply.sendSuccess(updated, `Status user internal berhasil diubah menjadi ${updated.isLocked ? 'Non-aktif' : 'Aktif'}`);
        }
        catch (error) {
            fastify.log.error(error);
            return reply.sendError('Gagal mengubah status user internal');
        }
    });
    // 4. DELETE /users/:id - Delete an internal admin user
    fastify.delete('/users/:id', async (request, reply) => {
        const { id } = request.params;
        const authHeader = request.headers.authorization;
        const token = authHeader.split(' ')[1];
        let currentAdminId = '';
        try {
            const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
            currentAdminId = decoded.sub;
        }
        catch (err) {
            // should already be validated by preHandler
        }
        if (id === currentAdminId) {
            return reply.code(400).send({
                success: false,
                message: 'Anda tidak dapat menghapus akun Anda sendiri',
            });
        }
        try {
            const admin = await prisma_1.prisma.adminUser.findUnique({ where: { id } });
            if (!admin) {
                return reply.code(404).send({
                    success: false,
                    message: 'User internal tidak ditemukan',
                });
            }
            await prisma_1.prisma.adminUser.delete({ where: { id } });
            // Audit Log
            await fastify.logAudit({
                tenantId: 'SYSTEM',
                action: 'DELETE_INTERNAL_USER',
                resource: 'AdminUser',
                resourceId: id,
                payload: { deletedEmail: admin.email },
            });
            return reply.sendSuccess(null, 'User internal berhasil dihapus');
        }
        catch (error) {
            fastify.log.error(error);
            return reply.sendError('Gagal menghapus user internal');
        }
    });
};
exports.default = adminRoutes;
//# sourceMappingURL=admin.js.map