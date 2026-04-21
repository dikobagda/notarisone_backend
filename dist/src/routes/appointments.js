"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = require("../lib/prisma");
const zod_1 = require("zod");
const google_calendar_1 = require("../lib/google-calendar");
const notification_service_1 = require("../services/notification-service");
const appointmentRoutes = async (fastify) => {
    // GET /api/appointments - List appointments
    fastify.get('/', async (request, reply) => {
        const { tenantId, from, to } = request.query;
        if (!tenantId)
            return reply.sendError('Tenant ID wajib disertakan');
        try {
            const where = { tenantId, deletedAt: null };
            if (from || to) {
                where.startTime = {};
                if (from)
                    where.startTime.gte = new Date(`${from}T00:00:00.000Z`);
                if (to)
                    where.startTime.lte = new Date(`${to}T23:59:59.999Z`);
            }
            const appointments = await prisma_1.prisma.appointment.findMany({
                where,
                include: {
                    client: { select: { id: true, name: true, email: true } },
                    deed: { select: { id: true, title: true, type: true, status: true } },
                    assignedTo: { select: { id: true, name: true } }
                },
                orderBy: { startTime: 'asc' }
            });
            return reply.sendSuccess(appointments);
        }
        catch (error) {
            request.log.error(error);
            return reply.sendError('Gagal memuat jadwal');
        }
    });
    // GET /api/appointments/:id - Get single appointment
    fastify.get('/:id', async (request, reply) => {
        const { id } = request.params;
        const { tenantId } = request.query;
        if (!tenantId)
            return reply.sendError('Tenant ID wajib disertakan');
        try {
            const appointment = await prisma_1.prisma.appointment.findFirst({
                where: { id, tenantId, deletedAt: null },
                include: {
                    client: true,
                    deed: true,
                    assignedTo: true
                }
            });
            if (!appointment) {
                return reply.code(404).sendError('Jadwal tidak ditemukan');
            }
            return reply.sendSuccess(appointment);
        }
        catch (error) {
            request.log.error(error);
            return reply.sendError('Gagal memuat jadwal');
        }
    });
    // POST /api/appointments - Create appointment
    fastify.post('/', async (request, reply) => {
        const { tenantId } = request.query;
        if (!tenantId)
            return reply.sendError('Tenant ID wajib disertakan');
        const schema = zod_1.z.object({
            title: zod_1.z.string().min(1, 'Judul wajib diisi'),
            startTime: zod_1.z.string().refine(val => !isNaN(Date.parse(val)), 'Waktu mulai tidak valid'),
            endTime: zod_1.z.string().refine(val => !isNaN(Date.parse(val)), 'Waktu selesai tidak valid'),
            type: zod_1.z.enum(['SIGNING', 'CONSULTATION', 'FIELD_SURVEY', 'BPN_COORDINATION', 'OTHER']),
            deedId: zod_1.z.string().optional(),
            clientId: zod_1.z.string().optional(),
            userId: zod_1.z.string().optional(),
            location: zod_1.z.string().optional(),
            description: zod_1.z.string().optional()
        });
        const body = schema.safeParse(request.body);
        if (!body.success)
            return reply.sendError(body.error.issues[0].message);
        try {
            const currentUserId = request.userId;
            const appointment = await prisma_1.prisma.appointment.create({
                data: {
                    ...body.data,
                    tenantId,
                    startTime: new Date(body.data.startTime),
                    endTime: new Date(body.data.endTime),
                },
                include: {
                    client: true,
                    deed: true,
                    assignedTo: true
                }
            });
            // Audit Log
            await fastify.logAudit({
                tenantId,
                userId: currentUserId,
                action: 'CREATE_APPOINTMENT',
                resource: 'Appointment',
                resourceId: appointment.id,
                payload: body.data
            });
            // Notify tenant about new appointment
            const startTimeStr = new Date(body.data.startTime).toLocaleString('id-ID', {
                dateStyle: 'medium',
                timeStyle: 'short'
            });
            await notification_service_1.NotificationService.notifyTenant({
                tenantId,
                title: 'Janji Temu Baru',
                description: `Janji temu "${body.data.title}" telah dijadwalkan pada ${startTimeStr}.`,
                type: 'INFO',
                actionUrl: `/dashboard/appointments`,
                excludeUserId: currentUserId
            });
            // Background Sync to Google Calendar
            if (currentUserId) {
                google_calendar_1.GoogleCalendarService.syncAppointment(currentUserId, appointment.id).catch(err => request.log.error('Google Sync Error:', err));
            }
            return reply.sendSuccess(appointment, 'Jadwal berhasil dibuat');
        }
        catch (error) {
            request.log.error(error);
            return reply.sendError('Gagal membuat jadwal');
        }
    });
    // PATCH /api/appointments/:id - Update appointment
    fastify.patch('/:id', async (request, reply) => {
        const { id } = request.params;
        const { tenantId } = request.query;
        if (!tenantId)
            return reply.sendError('Tenant ID wajib disertakan');
        const schema = zod_1.z.object({
            title: zod_1.z.string().optional(),
            startTime: zod_1.z.string().optional(),
            endTime: zod_1.z.string().optional(),
            status: zod_1.z.enum(['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED']).optional(),
            type: zod_1.z.enum(['SIGNING', 'CONSULTATION', 'FIELD_SURVEY', 'BPN_COORDINATION', 'OTHER']).optional(),
            deedId: zod_1.z.string().optional(),
            clientId: zod_1.z.string().optional(),
            userId: zod_1.z.string().optional(),
            location: zod_1.z.string().optional(),
            description: zod_1.z.string().optional()
        });
        const body = schema.safeParse(request.body);
        if (!body.success)
            return reply.sendError(body.error.issues[0].message);
        try {
            const currentUserId = request.userId;
            const data = { ...body.data };
            if (body.data.startTime)
                data.startTime = new Date(body.data.startTime);
            if (body.data.endTime)
                data.endTime = new Date(body.data.endTime);
            const appointment = await prisma_1.prisma.appointment.update({
                where: { id, tenantId },
                data,
                include: {
                    client: true,
                    deed: true,
                    assignedTo: true
                }
            });
            // Background Sync to Google Calendar
            if (currentUserId) {
                google_calendar_1.GoogleCalendarService.syncAppointment(currentUserId, appointment.id).catch(err => request.log.error('Google Sync Error:', err));
            }
            // Audit Log
            await fastify.logAudit({
                tenantId,
                userId: currentUserId,
                action: 'UPDATE_APPOINTMENT',
                resource: 'Appointment',
                resourceId: appointment.id,
                payload: { id: appointment.id, title: appointment.title }
            });
            return reply.sendSuccess(appointment, 'Jadwal berhasil diperbarui');
        }
        catch (error) {
            request.log.error(error);
            return reply.sendError('Gagal memperbarui jadwal');
        }
    });
    // DELETE /api/appointments/:id - Soft delete
    fastify.delete('/:id', async (request, reply) => {
        const { id } = request.params;
        const { tenantId } = request.query;
        if (!tenantId)
            return reply.sendError('Tenant ID wajib disertakan');
        try {
            const currentUserId = request.userId;
            const appointment = await prisma_1.prisma.appointment.update({
                where: { id, tenantId },
                data: { deletedAt: new Date() }
            });
            // Background Sync to Google Calendar (to delete the event)
            if (currentUserId) {
                google_calendar_1.GoogleCalendarService.syncAppointment(currentUserId, appointment.id).catch(err => request.log.error('Google Sync Error:', err));
            }
            // Audit Log
            await fastify.logAudit({
                tenantId,
                userId: currentUserId,
                action: 'DELETE_APPOINTMENT',
                resource: 'Appointment',
                resourceId: appointment.id,
                payload: { id: appointment.id, title: appointment.title }
            });
            return reply.sendSuccess(null, 'Jadwal berhasil dihapus');
        }
        catch (error) {
            request.log.error(error);
            return reply.sendError('Gagal menghapus jadwal');
        }
    });
};
exports.default = appointmentRoutes;
//# sourceMappingURL=appointments.js.map