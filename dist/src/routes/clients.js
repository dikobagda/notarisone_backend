"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = require("../lib/prisma");
const gcs_1 = require("../lib/gcs");
const zod_1 = require("zod");
const clientSchema = zod_1.z.object({
    name: zod_1.z.string().min(1, 'Nama klien wajib diisi'),
    title: zod_1.z.string().optional().or(zod_1.z.literal('')),
    gender: zod_1.z.string().optional().or(zod_1.z.literal('')),
    maritalStatus: zod_1.z.string().optional().or(zod_1.z.literal('')),
    pekerjaan: zod_1.z.string().optional().or(zod_1.z.literal('')),
    nik: zod_1.z.string().min(16, 'NIK minimal 16 karakter').max(16),
    npwp: zod_1.z.string().optional().or(zod_1.z.literal('')),
    pob: zod_1.z.string().optional().or(zod_1.z.literal('')),
    dob: zod_1.z.string().optional().or(zod_1.z.literal('')),
    address: zod_1.z.string().optional().or(zod_1.z.literal('')),
    street: zod_1.z.string().optional().or(zod_1.z.literal('')),
    rt: zod_1.z.string().optional().or(zod_1.z.literal('')),
    rw: zod_1.z.string().optional().or(zod_1.z.literal('')),
    kelurahan: zod_1.z.string().optional().or(zod_1.z.literal('')),
    kecamatan: zod_1.z.string().optional().or(zod_1.z.literal('')),
    kota: zod_1.z.string().optional().or(zod_1.z.literal('')),
    provinsi: zod_1.z.string().optional().or(zod_1.z.literal('')),
    phone: zod_1.z.string().min(1, 'Nomor WhatsApp wajib diisi'),
    email: zod_1.z.string().email('Email tidak valid').min(1, 'Email wajib diisi'),
    ktpPath: zod_1.z.string().optional().or(zod_1.z.literal('')),
    npwpPath: zod_1.z.string().optional().or(zod_1.z.literal('')),
    profilingData: zod_1.z.object({
        serviceCategory: zod_1.z.enum(['AKTA', 'PPAT', 'NON_AKTA']),
        documents: zod_1.z.record(zod_1.z.string(), zod_1.z.object({
            provided: zod_1.z.boolean(),
            url: zod_1.z.string().optional().nullable(),
        })),
        additionalJobs: zod_1.z.string().optional(),
        estimatedCost: zod_1.z.number().optional(),
    }).optional(),
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
            include: {
                stakeholderInDeeds: {
                    select: { id: true, name: true, role: true }
                }
            },
            orderBy: { name: 'asc' },
            take: 50, // Increased limit for search/suggestions
        });
        return reply.sendSuccess(clients);
    });
    // POST upload document
    fastify.post('/upload', async (request, reply) => {
        const { tenantId } = request.query;
        if (!tenantId)
            return reply.sendError('Tenant ID wajib disertakan', 400);
        const data = await request.file();
        if (!data)
            return reply.sendError('File tidak ditemukan', 400);
        try {
            const buffer = await data.toBuffer();
            const filename = data.filename.replace(/[^a-zA-Z0-9.-]/g, '_');
            const path = `clients/${tenantId}/documents/${Date.now()}-${filename}`;
            const gsPath = await (0, gcs_1.uploadToGcs)(buffer, path, data.mimetype);
            return reply.sendSuccess({ path: gsPath }, 'File berhasil diunggah');
        }
        catch (error) {
            console.error('Upload document error:', error);
            return reply.sendError('Gagal mengunggah dokumen', 500);
        }
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
            where: { id },
            include: {
                stakeholderInDeeds: {
                    select: { id: true, name: true, role: true, ktpPath: true }
                },
                serviceRequests: {
                    orderBy: { createdAt: 'desc' }
                }
            }
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
        const serviceRequestsWithUrls = await Promise.all(client.serviceRequests.map(async (req) => {
            if (!req.documents)
                return req;
            const docs = req.documents;
            const signedDocs = {};
            for (const key in docs) {
                const docData = docs[key];
                if (typeof docData === 'object' && docData !== null && docData.url) {
                    try {
                        const signedUrl = await (0, gcs_1.getSignedReadUrl)(docData.url);
                        signedDocs[key] = { ...docData, signedUrl };
                    }
                    catch (e) {
                        signedDocs[key] = docData;
                    }
                }
                else {
                    signedDocs[key] = docData;
                }
            }
            return {
                ...req,
                documents: signedDocs
            };
        }));
        // Explicitly construct the response object to preserve virtual fields
        const clientData = {
            ...client,
            serviceRequests: serviceRequestsWithUrls,
            ktpUrl: ktpUrl || null,
            npwpUrl: npwpUrl || null,
            // Mapping stakeholders as children for the UI
            relatedParties: client.stakeholderInDeeds
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
            const { profilingData, ...clientData } = result.data;
            let client;
            if (profilingData) {
                client = await prisma_1.prisma.$transaction(async (tx) => {
                    const newClient = await tx.client.create({
                        data: {
                            ...clientData,
                            tenantId,
                            title: clientData.title || null,
                            gender: clientData.gender || null,
                            maritalStatus: clientData.maritalStatus || null,
                            pekerjaan: clientData.pekerjaan || null,
                            npwp: clientData.npwp || null,
                            pob: clientData.pob || null,
                            dob: clientData.dob || null,
                            street: clientData.street || null,
                            rt: clientData.rt || null,
                            rw: clientData.rw || null,
                            kelurahan: clientData.kelurahan || null,
                            kecamatan: clientData.kecamatan || null,
                            kota: clientData.kota || null,
                            provinsi: clientData.provinsi || null,
                            ktpPath: clientData.ktpPath || null,
                            npwpPath: clientData.npwpPath || null,
                        },
                    });
                    await tx.serviceRequest.create({
                        data: {
                            tenantId,
                            clientId: newClient.id,
                            serviceCategory: profilingData.serviceCategory,
                            documents: profilingData.documents,
                            additionalJobs: profilingData.additionalJobs || null,
                            estimatedCost: profilingData.estimatedCost || null,
                        }
                    });
                    return newClient;
                });
            }
            else {
                client = await prisma_1.prisma.client.create({
                    data: {
                        ...clientData,
                        tenantId,
                        title: clientData.title || null,
                        gender: clientData.gender || null,
                        maritalStatus: clientData.maritalStatus || null,
                        pekerjaan: clientData.pekerjaan || null,
                        npwp: clientData.npwp || null,
                        pob: clientData.pob || null,
                        dob: clientData.dob || null,
                        street: clientData.street || null,
                        rt: clientData.rt || null,
                        rw: clientData.rw || null,
                        kelurahan: clientData.kelurahan || null,
                        kecamatan: clientData.kecamatan || null,
                        kota: clientData.kota || null,
                        provinsi: clientData.provinsi || null,
                        ktpPath: clientData.ktpPath || null,
                        npwpPath: clientData.npwpPath || null,
                    },
                });
            }
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
                return reply.sendError('NIK sudah terdaftar di kantor ini');
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
                    title: result.data.title !== undefined ? (result.data.title || null) : undefined,
                    gender: result.data.gender !== undefined ? (result.data.gender || null) : undefined,
                    maritalStatus: result.data.maritalStatus !== undefined ? (result.data.maritalStatus || null) : undefined,
                    pekerjaan: result.data.pekerjaan !== undefined ? (result.data.pekerjaan || null) : undefined,
                    npwp: result.data.npwp !== undefined ? (result.data.npwp || null) : undefined,
                    pob: result.data.pob !== undefined ? (result.data.pob || null) : undefined,
                    dob: result.data.dob !== undefined ? (result.data.dob || null) : undefined,
                    street: result.data.street !== undefined ? (result.data.street || null) : undefined,
                    rt: result.data.rt !== undefined ? (result.data.rt || null) : undefined,
                    rw: result.data.rw !== undefined ? (result.data.rw || null) : undefined,
                    kelurahan: result.data.kelurahan !== undefined ? (result.data.kelurahan || null) : undefined,
                    kecamatan: result.data.kecamatan !== undefined ? (result.data.kecamatan || null) : undefined,
                    kota: result.data.kota !== undefined ? (result.data.kota || null) : undefined,
                    provinsi: result.data.provinsi !== undefined ? (result.data.provinsi || null) : undefined,
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