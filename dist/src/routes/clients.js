"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = require("@/lib/prisma");
const gcs_1 = require("../lib/gcs");
const zod_1 = require("zod");
const clientSchema = zod_1.z.object({
    name: zod_1.z.string().min(1, 'Nama klien wajib diisi'),
    nik: zod_1.z.string().min(16, 'NIK minimal 16 karakter').max(16),
    npwp: zod_1.z.string().optional().or(zod_1.z.literal('')),
    pob: zod_1.z.string().optional().or(zod_1.z.literal('')),
    dob: zod_1.z.string().optional().or(zod_1.z.literal('')),
    address: zod_1.z.string().min(1, 'Alamat wajib diisi'),
    phone: zod_1.z.string().min(1, 'Nomor WhatsApp wajib diisi'),
    email: zod_1.z.string().email('Email tidak valid').min(1, 'Email wajib diisi'),
    ktpPath: zod_1.z.string().optional().or(zod_1.z.literal('')),
    npwpPath: zod_1.z.string().optional().or(zod_1.z.literal('')),
});
const clientRoutes = async (fastify) => {
    // GET all clients for the current tenant
    fastify.get('/', async (request, reply) => {
        const { tenantId, search } = request.query;
        if (!tenantId)
            return reply.sendError('Tenant ID wajib disertakan');
        const clients = await prisma_1.prisma.client.findMany({
            where: {
                tenantId,
                deletedAt: null,
                OR: search ? [
                    { name: { contains: search } },
                    { nik: { contains: search } }
                ] : undefined
            },
            orderBy: { name: 'asc' },
            take: 20, // Limit for suggestions
        });
        return reply.sendSuccess(clients);
    });
    // GET a single client by ID
    fastify.get('/:id', async (request, reply) => {
        const rawId = request.params.id;
        const rawTenantId = request.query.tenantId;
        if (!rawId || !rawTenantId) {
            return reply.sendError('ID dan Tenant ID wajib disertakan');
        }
        const id = rawId.trim();
        const tenantId = rawTenantId.trim();
        // 1. Dapatkan data apa adanya dulu menggunakan findUnique (Primary Key)
        // Note: Kita bypass filter deletedAt/tenantId di level query untuk kemudahan debug
        const client = await prisma_1.prisma.client.findUnique({
            where: { id }
        });
        // 2. Jika secara fisik tidak ada di DB
        if (!client) {
            return reply.sendError(`Klien dengan ID ${id} tidak terdaftar di sistem`, 404);
        }
        // 3. Cek kepemilikan Tenant (Data Isolation)
        if (client.tenantId !== tenantId) {
            return reply.sendError(`Klien ditemukan, tapi bukan milik kantor Anda`, 403);
        }
        // 4. Cek apakah sudah terhapus (Soft Delete)
        if (client.deletedAt !== null) {
            return reply.sendError('Klien ini sudah dihapus dari sistem', 410);
        }
        // 5. Generate signed URLs for previews
        const [ktpUrl, npwpUrl] = await Promise.all([
            client.ktpPath ? (0, gcs_1.getSignedReadUrl)(client.ktpPath) : null,
            client.npwpPath ? (0, gcs_1.getSignedReadUrl)(client.npwpPath) : null
        ]);
        // Explicitly construct the response object to preserve virtual fields
        const clientData = {
            ...client,
            ktpUrl: ktpUrl || null,
            npwpUrl: npwpUrl || null
        };
        return reply.sendSuccess(clientData);
    });
    // POST create new client (Quick registration)
    fastify.post('/', async (request, reply) => {
        const { tenantId } = request.query;
        const result = clientSchema.safeParse(request.body);
        if (!result.success) {
            return reply.code(422).send({
                success: false,
                message: 'Data tidak valid',
                errors: result.error.format(),
            });
        }
        if (!tenantId)
            return reply.sendError('Tenant ID wajib disertakan');
        try {
            const client = await prisma_1.prisma.client.create({
                data: {
                    ...result.data,
                    tenantId,
                    npwp: result.data.npwp || null,
                    pob: result.data.pob || null,
                    dob: result.data.dob || null,
                    ktpPath: result.data.ktpPath || null,
                    npwpPath: result.data.npwpPath || null,
                },
            });
            // Log Audit
            await fastify.logAudit({
                tenantId,
                action: 'CREATE_CLIENT',
                resource: 'Client',
                resourceId: client.id,
                payload: result.data,
            });
            return reply.sendSuccess(client, 'Klien baru berhasil didaftarkan');
        }
        catch (error) {
            if (error.code === 'P2002') {
                return reply.sendError('NIK sudah terdaftar di sistem');
            }
            throw error;
        }
    });
    // PATCH update client
    fastify.patch('/:id', async (request, reply) => {
        const { id } = request.params;
        const { tenantId } = request.query;
        const result = clientSchema.partial().safeParse(request.body);
        if (!result.success) {
            return reply.code(422).send({
                success: false,
                message: 'Data tidak valid',
                errors: result.error.format(),
            });
        }
        if (!tenantId)
            return reply.sendError('Tenant ID wajib disertakan');
        try {
            const existingClient = await prisma_1.prisma.client.findFirst({
                where: { id, tenantId, deletedAt: null }
            });
            if (!existingClient) {
                return reply.sendError('Klien tidak ditemukan', 404);
            }
            const updatedClient = await prisma_1.prisma.client.update({
                where: { id },
                data: {
                    ...result.data,
                    npwp: result.data.npwp !== undefined ? (result.data.npwp || null) : undefined,
                    pob: result.data.pob !== undefined ? (result.data.pob || null) : undefined,
                    dob: result.data.dob !== undefined ? (result.data.dob || null) : undefined,
                    ktpPath: result.data.ktpPath !== undefined ? (result.data.ktpPath || null) : undefined,
                    npwpPath: result.data.npwpPath !== undefined ? (result.data.npwpPath || null) : undefined,
                },
            });
            // Log Audit
            await fastify.logAudit({
                tenantId,
                action: 'UPDATE_CLIENT',
                resource: 'Client',
                resourceId: id,
                payload: result.data,
            });
            return reply.sendSuccess(updatedClient, 'Data klien berhasil diperbarui');
        }
        catch (error) {
            if (error.code === 'P2002') {
                return reply.sendError('NIK sudah digunakan oleh klien lain');
            }
            throw error;
        }
    });
    // DELETE a client (Soft delete)
    fastify.delete('/:id', async (request, reply) => {
        const { id } = request.params;
        const { tenantId } = request.query;
        if (!tenantId)
            return reply.sendError('Tenant ID wajib disertakan');
        try {
            const client = await prisma_1.prisma.client.findFirst({
                where: { id, tenantId, deletedAt: null }
            });
            if (!client) {
                return reply.sendError('Klien tidak ditemukan atau sudah dihapus', 404);
            }
            // Soft delete using prisma.client.delete() which triggers the extension logic
            await prisma_1.prisma.client.delete({
                where: { id }
            });
            // Log Audit
            await fastify.logAudit({
                tenantId,
                action: 'DELETE_CLIENT',
                resource: 'Client',
                resourceId: id,
                payload: { name: client.name, nik: client.nik },
            });
            return reply.sendSuccess(null, 'Klien berhasil dihapus');
        }
        catch (error) {
            console.error('Delete client error:', error);
            return reply.sendError('Gagal menghapus klien');
        }
    });
};
exports.default = clientRoutes;
//# sourceMappingURL=clients.js.map