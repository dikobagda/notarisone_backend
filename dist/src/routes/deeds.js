"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = require("../lib/prisma");
const gcs_1 = require("../lib/gcs");
const zod_1 = require("zod");
const email_1 = require("../lib/email");
const notification_service_1 = require("../services/notification-service");
const google_calendar_1 = require("../lib/google-calendar");
const date_fns_1 = require("date-fns");
const stakeholderSchema = zod_1.z.object({
    name: zod_1.z.string().min(1, 'Nama stakeholder wajib diisi'),
    role: zod_1.z.string().min(1, 'Peran stakeholder wajib diisi'),
    clientId: zod_1.z.string().optional(),
});
const deedSchema = zod_1.z.object({
    title: zod_1.z.string().min(1, 'Judul akta wajib diisi'),
    type: zod_1.z.string().min(1, 'Jenis akta wajib diisi'),
    clientId: zod_1.z.string().min(1, 'Klien wajib dipilih'),
    createdById: zod_1.z.string().min(1, 'Pembuat wajib diisi'),
    targetFinalization: zod_1.z.string().optional().or(zod_1.z.literal('')),
    ppatData: zod_1.z.object({
        nop: zod_1.z.string().optional(),
        luasTanah: zod_1.z.number().optional(),
        luasBangunan: zod_1.z.number().optional(),
        lokasiAlamat: zod_1.z.string().optional(),
        latitude: zod_1.z.number().optional(),
        longitude: zod_1.z.number().optional(),
    }).optional()
});
const deedRoutes = async (fastify) => {
    // GET all deeds
    fastify.get('/', async (request, reply) => {
        const { tenantId } = request.query;
        if (!tenantId)
            return reply.sendError('Tenant ID wajib disertakan');
        try {
            const deeds = await prisma_1.prisma.deed.findMany({
                where: { tenantId, deletedAt: null },
                include: { client: true, createdBy: true, stakeholders: true, ppatData: true },
                orderBy: { createdAt: 'desc' },
            });
            console.log(`[DEBUG] Found ${deeds.length} deeds for tenant ${tenantId}`);
            // FOOLPROOF: Recursive BigInt to Number conversion before sending
            const safeDeeds = JSON.parse(JSON.stringify(deeds, (key, value) => typeof value === 'bigint' ? Number(value) : value));
            return reply.sendSuccess(safeDeeds);
        }
        catch (error) {
            console.error("[DEBUG] Error fetching deeds in route:", error);
            return reply.sendError('Gagal memuat daftar akta. Cek log server untuk detail.');
        }
    });
    // GET Preview URL for GCS objects
    fastify.get('/files/preview', async (request, reply) => {
        const { gsPath } = request.query;
        if (!gsPath)
            return reply.sendError('gsPath wajib disertakan');
        const { getSignedReadUrl } = require('../lib/gcs');
        const url = await getSignedReadUrl(gsPath);
        if (!url)
            return reply.sendError('Gagal membuat URL pratinjau');
        return reply.sendSuccess({ url });
    });
    // GET Next Suggested Deed Number
    fastify.get('/next-number', async (request, reply) => {
        const { tenantId } = request.query;
        if (!tenantId)
            return reply.sendError('Tenant ID wajib disertakan');
        const year = new Date().getFullYear();
        const latestEntry = await prisma_1.prisma.protocolEntry.findFirst({
            where: {
                tenantId,
                date: {
                    gte: new Date(`${year}-01-01`),
                    lte: new Date(`${year}-12-31`)
                }
            },
            orderBy: { repertoriumNumber: 'desc' }
        });
        let nextSeq = 1;
        if (latestEntry) {
            // Try to parse number from "001/IV/2026" or just "1"
            const match = latestEntry.repertoriumNumber.match(/^(\d+)/);
            if (match) {
                nextSeq = parseInt(match[1]) + 1;
            }
        }
        const romanMonths = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
        const currentMonth = romanMonths[new Date().getMonth()];
        const suggestedNumber = `${String(nextSeq).padStart(3, '0')}/${currentMonth}/${year}`;
        return reply.sendSuccess({
            sequence: nextSeq,
            suggestedNumber
        });
    });
    // PATCH update deed metadata
    fastify.patch('/:id', async (request, reply) => {
        const { id } = request.params;
        const { tenantId } = request.query;
        const body = deedSchema.partial().safeParse(request.body);
        if (!body.success) {
            return reply.code(422).send({ success: false, errors: body.error.format() });
        }
        if (!tenantId)
            return reply.sendError('Tenant ID wajib disertakan');
        try {
            const existingDeed = await prisma_1.prisma.deed.findFirst({
                where: { id, tenantId, deletedAt: null }
            });
            if (!existingDeed) {
                return reply.sendError('Akta tidak ditemukan', 404);
            }
            if (existingDeed.status === 'FINAL') {
                return reply.sendError('Akta yang sudah FINAL tidak dapat diubah kembali', 403);
            }
            const updatedDeed = await prisma_1.prisma.deed.update({
                where: { id },
                data: {
                    title: body.data.title,
                    type: body.data.type,
                    targetFinalization: body.data.targetFinalization ? new Date(body.data.targetFinalization) : undefined,
                },
            });
            // Log Audit
            await fastify.logAudit({
                tenantId,
                action: 'UPDATE_DEED',
                resource: 'Deed',
                resourceId: id,
                payload: {
                    old: { title: existingDeed.title, type: existingDeed.type },
                    new: { title: updatedDeed.title, type: updatedDeed.type }
                },
            });
            return reply.sendSuccess(updatedDeed, 'Data akta berhasil diperbarui');
        }
        catch (error) {
            request.log.error(error);
            return reply.sendError('Gagal memperbarui akta');
        }
    });
    // GET single deed by ID
    fastify.get('/:id', async (request, reply) => {
        const { id } = request.params;
        const { tenantId } = request.query;
        if (!tenantId)
            return reply.sendError('Tenant ID wajib disertakan');
        const deed = await prisma_1.prisma.deed.findFirst({
            where: { id, tenantId, deletedAt: null },
            include: {
                client: true,
                createdBy: true,
                stakeholders: true,
                ppatData: true,
                versions: { orderBy: { versionNumber: 'desc' } }
            },
        });
        if (!deed)
            return reply.sendError('Akta tidak ditemukan', 404);
        return reply.sendSuccess(deed);
    });
    // POST create new deed (Multipart)
    fastify.post('/', async (request, reply) => {
        const { tenantId } = request.query;
        if (!tenantId)
            return reply.sendError('Tenant ID wajib disertakan');
        const parts = request.parts();
        let metadata = null;
        let stakeholdersData = [];
        let draftFile = null;
        const stakeholderFiles = new Map();
        for await (const part of parts) {
            if (part.type === 'file') {
                if (part.fieldname === 'draft') {
                    draftFile = { buffer: await part.toBuffer(), filename: part.filename, mimetype: part.mimetype };
                }
                else if (part.fieldname.startsWith('ktp_') || part.fieldname.startsWith('npwp_')) {
                    stakeholderFiles.set(part.fieldname, { buffer: await part.toBuffer(), filename: part.filename, mimetype: part.mimetype });
                }
            }
            else {
                if (part.fieldname === 'metadata')
                    metadata = JSON.parse(part.value);
                if (part.fieldname === 'stakeholders')
                    stakeholdersData = JSON.parse(part.value);
            }
        }
        const val = deedSchema.safeParse(metadata);
        if (!val.success)
            return reply.code(422).send({ success: false, errors: val.error.format() });
        try {
            const deed = await prisma_1.prisma.deed.create({
                data: {
                    title: val.data.title,
                    type: val.data.type,
                    clientId: val.data.clientId,
                    createdById: val.data.createdById,
                    tenantId,
                    status: 'DRAFT',
                    targetFinalization: val.data.targetFinalization ? new Date(val.data.targetFinalization) : null,
                    ...(val.data.ppatData && {
                        ppatData: {
                            create: val.data.ppatData
                        }
                    })
                }
            });
            // Notify tenant about new deed
            await notification_service_1.NotificationService.notifyTenant({
                tenantId,
                title: 'Akta Baru Dibuat',
                description: `Draf akta "${val.data.title}" telah berhasil dibuat.`,
                type: 'SUCCESS',
                actionUrl: `/dashboard/deeds/${deed.id}`,
                excludeUserId: val.data.createdById
            });
            // Handle Main Draft Upload
            if (draftFile) {
                const draftPath = `deeds/${deed.id}/draft/${Date.now()}_${draftFile.filename}`;
                const gsPath = await (0, gcs_1.uploadToGcs)(draftFile.buffer, draftPath, draftFile.mimetype);
                await prisma_1.prisma.deedVersion.create({
                    data: {
                        deedId: deed.id,
                        versionNumber: 1,
                        gcsPath: gsPath,
                        fileSize: draftFile.buffer.length
                    }
                });
            }
            // Handle Stakeholders & their files
            if (stakeholdersData.length > 0) {
                for (const [idx, s] of stakeholdersData.entries()) {
                    const ktpPart = stakeholderFiles.get(`ktp_${idx}`);
                    const npwpPart = stakeholderFiles.get(`npwp_${idx}`);
                    let ktpPath = null;
                    let npwpPath = null;
                    if (ktpPart) {
                        const path = `deeds/${deed.id}/stakeholders/${s.name.replace(/\s+/g, '_')}/ktp_${Date.now()}_${ktpPart.filename}`;
                        ktpPath = await (0, gcs_1.uploadToGcs)(ktpPart.buffer, path, ktpPart.mimetype);
                    }
                    if (npwpPart) {
                        const path = `deeds/${deed.id}/stakeholders/${s.name.replace(/\s+/g, '_')}/npwp_${Date.now()}_${npwpPart.filename}`;
                        npwpPath = await (0, gcs_1.uploadToGcs)(npwpPart.buffer, path, npwpPart.mimetype);
                    }
                    await prisma_1.prisma.deedStakeholder.create({
                        data: {
                            deedId: deed.id,
                            name: s.name,
                            role: s.role,
                            clientId: s.clientId,
                            ktpPath,
                            ktpSize: ktpPart ? ktpPart.buffer.length : 0,
                            npwpPath,
                            npwpSize: npwpPart ? npwpPart.buffer.length : 0
                        }
                    });
                }
            }
            // Log Audit
            await fastify.logAudit({
                tenantId,
                userId: val.data.createdById,
                action: 'CREATE_DEED',
                resource: 'Deed',
                resourceId: deed.id,
                payload: { title: val.data.title, type: val.data.type, stakeholders: stakeholdersData.length },
            });
            // Send Email Notification to Client asynchronously
            const client = await prisma_1.prisma.client.findFirst({ where: { id: val.data.clientId } });
            if (client?.email) {
                (0, email_1.sendDeedNotification)(client.email, 'DRAFT_CREATED', {
                    clientName: client.name,
                    deedTitle: val.data.title,
                    deedType: val.data.type
                }).catch(err => console.error('[EMAIL] Background error:', err));
            }
            // --- AUTOMATED APPOINTMENT CREATION ---
            try {
                let apptStartTime;
                if (deed.targetFinalization) {
                    // Use target date at 10:00 AM
                    apptStartTime = (0, date_fns_1.setMinutes)((0, date_fns_1.setHours)(new Date(deed.targetFinalization), 10), 0);
                }
                else {
                    // Default: 7 days from now at 10:00 AM
                    apptStartTime = (0, date_fns_1.setMinutes)((0, date_fns_1.setHours)((0, date_fns_1.addDays)(new Date(), 7), 10), 0);
                }
                const apptEndTime = (0, date_fns_1.addHours)(apptStartTime, 1);
                const appointment = await prisma_1.prisma.appointment.create({
                    data: {
                        tenantId,
                        deedId: deed.id,
                        clientId: deed.clientId,
                        userId: deed.createdById, // Assign to creator
                        title: `Penandatanganan Akta: ${deed.title}`,
                        type: 'SIGNING',
                        startTime: apptStartTime,
                        endTime: apptEndTime,
                        location: 'Kantor Notaris',
                        description: `Jadwal otomatis dibuat untuk akta baru: ${deed.title}. Silakan sesuaikan waktu jika diperlukan.`,
                        status: 'PENDING'
                    }
                });
                // Background Sync to Google Calendar
                if (deed.createdById) {
                    google_calendar_1.GoogleCalendarService.syncAppointment(deed.createdById, appointment.id).catch(err => request.log.error('[GOOGLE_SYNC] Auto-schedule error:', err));
                }
            }
            catch (apptErr) {
                request.log.error(apptErr, '[AUTO_APPT] Failed to create automated appointment');
                // We don't fail the deed creation if appointment fails
            }
            // --------------------------------------
            return reply.sendSuccess(deed, 'Akta dan dokumen berhasil disimpan');
        }
        catch (error) {
            request.log.error(error);
            return reply.sendError('Gagal memproses akta');
        }
    });
    // GET upload URL (kept for potential direct client-side uploads later)
    fastify.get('/:id/upload-url', async (request, reply) => {
        const { id } = request.params;
        const { fileName, contentType } = request.query;
        const url = await (0, gcs_1.generateUploadUrl)(`deeds/${id}/${fileName}`, contentType);
        return reply.sendSuccess({ url });
    });
    // POST add new document to a deed (Draft, Final Scan, or Attachment)
    fastify.post('/:id/documents', async (request, reply) => {
        const { id } = request.params;
        const { tenantId } = request.query;
        if (!tenantId)
            return reply.sendError('Tenant ID wajib disertakan');
        console.log(`[UPLOAD] Processing documents for deed ${id}, tenantId: ${tenantId}`);
        const parts = request.parts();
        let type = null;
        let filePart = null;
        let deedNumber = null;
        let stakeholderId = null;
        for await (const part of parts) {
            if (part.type === 'file') {
                filePart = { buffer: await part.toBuffer(), filename: part.filename, mimetype: part.mimetype };
            }
            else {
                const fieldname = part.fieldname.trim();
                const value = part.value?.trim();
                if (fieldname === 'type')
                    type = value;
                if (fieldname === 'deedNumber')
                    deedNumber = value;
                if (fieldname === 'stakeholderId')
                    stakeholderId = value;
            }
        }
        const normalizedType = type?.toLowerCase();
        console.log(`[UPLOAD] Processing - DeedId: ${id}, Type: "${type}", Normalized: "${normalizedType}", DeedNumber: "${deedNumber}", GotFile: ${!!filePart}`);
        if (!filePart || !normalizedType) {
            return reply.code(400).send({ success: false, message: 'File dan tipe dokumen wajib disertakan' });
        }
        try {
            const deed = await prisma_1.prisma.deed.findFirst({
                where: { id, tenantId, deletedAt: null }
            });
            if (!deed)
                return reply.sendError('Akta tidak ditemukan', 404);
            if (deed.status === 'FINAL' && normalizedType === 'draft') {
                return reply.sendError('Tidak dapat menambahkan draf pada akta yang sudah FINAL', 403);
            }
            const filePath = `deeds/${id}/${normalizedType}/${Date.now()}_${filePart.filename.replace(/\s+/g, '_')}`;
            const gsPath = await (0, gcs_1.uploadToGcs)(filePart.buffer, filePath, filePart.mimetype);
            let actionLog = 'UPLOAD_DEED_DOCUMENT';
            if (normalizedType === 'stakeholder_ktp' || normalizedType === 'stakeholder_npwp') {
                console.log(`[UPLOAD] Routing to STAKEHOLDER path`);
                if (!stakeholderId)
                    return reply.sendError('Stakeholder ID wajib disertakan untuk tipe ini');
                const updateData = {};
                if (normalizedType === 'stakeholder_ktp') {
                    updateData.ktpPath = gsPath;
                    updateData.ktpSize = BigInt(filePart.buffer.length);
                }
                else {
                    updateData.npwpPath = gsPath;
                    updateData.npwpSize = BigInt(filePart.buffer.length);
                }
                await prisma_1.prisma.deedStakeholder.update({
                    where: { id: stakeholderId },
                    data: updateData
                });
                actionLog = normalizedType === 'stakeholder_ktp' ? 'UPLOAD_STAKEHOLDER_KTP' : 'UPLOAD_STAKEHOLDER_NPWP';
            }
            else if (normalizedType === 'draft') {
                console.log(`[UPLOAD] Routing to DRAFT path`);
                const v = await prisma_1.prisma.deedVersion.count({ where: { deedId: id } });
                await prisma_1.prisma.deedVersion.create({
                    data: {
                        deedId: id,
                        versionNumber: v + 1,
                        gcsPath: gsPath,
                        fileSize: BigInt(filePart.buffer.length)
                    }
                });
                actionLog = 'UPLOAD_DEED_DRAFT';
            }
            else if (normalizedType === 'scan') {
                console.log(`[UPLOAD] Routing to SCAN path`);
                const updateData = {
                    scanPath: gsPath,
                    scanSize: BigInt(filePart.buffer.length)
                };
                if (deedNumber && deedNumber.trim() !== "" && deed.status !== 'FINAL') {
                    console.log(`[UPLOAD] Finalizing deed with number: ${deedNumber}`);
                    updateData.deedNumber = deedNumber;
                    updateData.status = 'FINAL';
                }
                await prisma_1.prisma.deed.update({
                    where: { id },
                    data: updateData
                });
                if (updateData.status === 'FINAL') {
                    await prisma_1.prisma.protocolEntry.create({
                        data: {
                            tenantId,
                            deedId: id,
                            repertoriumNumber: deedNumber,
                            description: `Finalisasi Akta Otomatis: ${deed.title}`
                        }
                    });
                    actionLog = 'FINALIZE_DEED';
                    const client = await prisma_1.prisma.client.findFirst({ where: { id: deed.clientId } });
                    if (client?.email) {
                        (0, email_1.sendDeedNotification)(client.email, 'DEED_FINALIZED', {
                            clientName: client.name,
                            deedTitle: deed.title,
                            deedType: deed.type,
                            deedNumber: deedNumber
                        }).catch(err => console.error('[EMAIL] Background error:', err));
                    }
                }
                else {
                    actionLog = 'UPLOAD_DEED_SCAN';
                }
            }
            else {
                // Explicitly handle as attachment if type matches 'attachment' or is unknown
                console.log(`[UPLOAD] Routing to ATTACHMENT fallback path. Received type: ${normalizedType}`);
                let attachments = [];
                if (deed.attachments) {
                    attachments = typeof deed.attachments === 'string' ? JSON.parse(deed.attachments) : deed.attachments;
                }
                if (!Array.isArray(attachments))
                    attachments = [];
                attachments.push({
                    id: Math.random().toString().substring(2, 10),
                    name: filePart.filename,
                    path: gsPath,
                    size: filePart.buffer.length,
                    uploadedAt: new Date().toISOString()
                });
                await prisma_1.prisma.deed.update({
                    where: { id },
                    data: { attachments: attachments }
                });
                actionLog = 'UPLOAD_DEED_ATTACHMENT';
            }
            await fastify.logAudit({
                tenantId,
                userId: request.userId,
                action: actionLog,
                resource: 'Deed',
                resourceId: id,
                payload: {
                    filename: filePart.filename,
                    type: normalizedType,
                    stakeholderId,
                    title: deed.title,
                    deedNumber: deedNumber || deed.deedNumber
                },
            });
            return reply.sendSuccess({ gcsPath: gsPath, debugType: normalizedType, actionLog }, 'Dokumen berhasil diunggah');
        }
        catch (error) {
            request.log.error(error);
            return reply.sendError(`Gagal mengunggah dokumen: ${error.message || 'Terjadi kesalahan sistem'}`);
        }
    });
    // POST finalize
    fastify.post('/:id/finalize', async (request, reply) => {
        const { id } = request.params;
        const { deedNumber } = request.body;
        const tenantId = request.body.tenantId || request.query.tenantId;
        if (!tenantId)
            return reply.sendError('Tenant ID wajib disertakan');
        if (!deedNumber)
            return reply.sendError('Nomor Akta wajib diisi');
        try {
            const deed = await prisma_1.prisma.deed.update({
                where: { id },
                data: {
                    deedNumber,
                    status: 'FINAL'
                }
            });
            await prisma_1.prisma.protocolEntry.create({
                data: {
                    tenantId,
                    deedId: id,
                    repertoriumNumber: deedNumber,
                    description: `Finalisasi Akta: ${deed.title}`
                }
            });
            // Send Email Notification
            const client = await prisma_1.prisma.client.findFirst({ where: { id: deed.clientId } });
            if (client?.email) {
                (0, email_1.sendDeedNotification)(client.email, 'DEED_FINALIZED', {
                    clientName: client.name,
                    deedTitle: deed.title,
                    deedType: deed.type,
                    deedNumber: deedNumber
                }).catch(err => console.error('[EMAIL] Background error:', err));
            }
            // Log Audit
            await fastify.logAudit({
                tenantId,
                userId: request.userId,
                action: 'FINALIZE_DEED',
                resource: 'Deed',
                resourceId: id,
                payload: { title: deed.title, deedNumber }
            });
            return reply.sendSuccess(deed, 'Akta berhasil difinalisasi dan nomor akta diterbitkan');
        }
        catch (error) {
            if (error.code === 'P2002') {
                return reply.sendError('Nomor akta sudah digunakan di akta lain', 409);
            }
            request.log.error(error);
            return reply.sendError('Gagal melakukan finalisasi akta');
        }
    });
    // POST add new stakeholder to existing deed
    fastify.post('/:id/stakeholders', async (request, reply) => {
        const { id } = request.params;
        const { tenantId } = request.query;
        const body = stakeholderSchema.safeParse(request.body);
        if (!body.success) {
            return reply.code(422).send({ success: false, errors: body.error.format() });
        }
        if (!tenantId)
            return reply.sendError('Tenant ID wajib disertakan');
        try {
            const deed = await prisma_1.prisma.deed.findFirst({
                where: { id, tenantId, deletedAt: null }
            });
            if (!deed)
                return reply.sendError('Akta tidak ditemukan', 404);
            if (deed.status === 'FINAL')
                return reply.sendError('Tidak dapat menambah pihak pada akta yang sudah FINAL', 403);
            const stakeholder = await prisma_1.prisma.deedStakeholder.create({
                data: {
                    deedId: id,
                    name: body.data.name,
                    role: body.data.role,
                    clientId: body.data.clientId,
                }
            });
            // Log Audit
            await fastify.logAudit({
                tenantId,
                userId: request.userId,
                action: 'UPDATE_DEED_STAKEHOLDERS',
                resource: 'Deed',
                resourceId: id,
                payload: { name: stakeholder.name, role: stakeholder.role },
            });
            return reply.sendSuccess(stakeholder, 'Pihak terkait berhasil ditambahkan');
        }
        catch (error) {
            request.log.error(error);
            return reply.sendError('Gagal menambahkan pihak terkait');
        }
    });
};
exports.default = deedRoutes;
//# sourceMappingURL=deeds.js.map