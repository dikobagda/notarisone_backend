import { FastifyPluginAsync } from 'fastify';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { GoogleCalendarService } from '@/lib/google-calendar';

const appointmentRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/appointments - List appointments
  fastify.get('/', async (request, reply) => {
    const { tenantId, from, to } = request.query as { tenantId: string, from?: string, to?: string };
    if (!tenantId) return reply.sendError('Tenant ID wajib disertakan');

    try {
      const where: any = { tenantId, deletedAt: null };
      
      if (from || to) {
        where.startTime = {};
        if (from) where.startTime.gte = new Date(`${from}T00:00:00.000Z`);
        if (to) where.startTime.lte = new Date(`${to}T23:59:59.999Z`);
      }

      const appointments = await prisma.appointment.findMany({
        where,
        include: {
          client: { select: { id: true, name: true, email: true } },
          deed: { select: { id: true, title: true, type: true, status: true } },
          assignedTo: { select: { id: true, name: true } }
        },
        orderBy: { startTime: 'asc' }
      });

      return reply.sendSuccess(appointments);
    } catch (error) {
      request.log.error(error);
      return reply.sendError('Gagal memuat jadwal');
    }
  });

  // GET /api/appointments/:id - Get single appointment
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { tenantId } = request.query as { tenantId: string };
    if (!tenantId) return reply.sendError('Tenant ID wajib disertakan');

    try {
      const appointment = await prisma.appointment.findFirst({
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
    } catch (error) {
      request.log.error(error);
      return reply.sendError('Gagal memuat jadwal');
    }
  });

  // POST /api/appointments - Create appointment
  fastify.post('/', async (request, reply) => {
    const { tenantId } = request.query as { tenantId: string };
    if (!tenantId) return reply.sendError('Tenant ID wajib disertakan');

    const schema = z.object({
      title: z.string().min(1, 'Judul wajib diisi'),
      startTime: z.string().refine(val => !isNaN(Date.parse(val)), 'Waktu mulai tidak valid'),
      endTime: z.string().refine(val => !isNaN(Date.parse(val)), 'Waktu selesai tidak valid'),
      type: z.enum(['SIGNING', 'CONSULTATION', 'FIELD_SURVEY', 'BPN_COORDINATION', 'OTHER']),
      deedId: z.string().optional(),
      clientId: z.string().optional(),
      userId: z.string().optional(),
      location: z.string().optional(),
      description: z.string().optional()
    });

    const body = schema.safeParse(request.body);
    if (!body.success) return reply.sendError(body.error.issues[0].message);

    try {
      const currentUserId = (request as any).userId;
      const appointment = await prisma.appointment.create({
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

      // Background Sync to Google Calendar
      if (currentUserId) {
        GoogleCalendarService.syncAppointment(currentUserId, appointment.id).catch(err => 
          request.log.error('Google Sync Error:', err)
        );
      }

      return reply.sendSuccess(appointment, 'Jadwal berhasil dibuat');
    } catch (error) {
      request.log.error(error);
      return reply.sendError('Gagal membuat jadwal');
    }
  });

  // PATCH /api/appointments/:id - Update appointment
  fastify.patch('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { tenantId } = request.query as { tenantId: string };
    if (!tenantId) return reply.sendError('Tenant ID wajib disertakan');

    const schema = z.object({
      title: z.string().optional(),
      startTime: z.string().optional(),
      endTime: z.string().optional(),
      status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED']).optional(),
      type: z.enum(['SIGNING', 'CONSULTATION', 'FIELD_SURVEY', 'BPN_COORDINATION', 'OTHER']).optional(),
      deedId: z.string().optional(),
      clientId: z.string().optional(),
      userId: z.string().optional(),
      location: z.string().optional(),
      description: z.string().optional()
    });

    const body = schema.safeParse(request.body);
    if (!body.success) return reply.sendError(body.error.issues[0].message);

    try {
      const currentUserId = (request as any).userId;
      const data: any = { ...body.data };
      if (body.data.startTime) data.startTime = new Date(body.data.startTime);
      if (body.data.endTime) data.endTime = new Date(body.data.endTime);

      const appointment = await prisma.appointment.update({
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
        GoogleCalendarService.syncAppointment(currentUserId, appointment.id).catch(err => 
          request.log.error('Google Sync Error:', err)
        );
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
    } catch (error) {
      request.log.error(error);
      return reply.sendError('Gagal memperbarui jadwal');
    }
  });

  // DELETE /api/appointments/:id - Soft delete
  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { tenantId } = request.query as { tenantId: string };
    if (!tenantId) return reply.sendError('Tenant ID wajib disertakan');

    try {
      const currentUserId = (request as any).userId;
      const appointment = await prisma.appointment.update({
        where: { id, tenantId },
        data: { deletedAt: new Date() }
      });

      // Background Sync to Google Calendar (to delete the event)
      if (currentUserId) {
        GoogleCalendarService.syncAppointment(currentUserId, appointment.id).catch(err => 
          request.log.error('Google Sync Error:', err)
        );
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
    } catch (error) {
      request.log.error(error);
      return reply.sendError('Gagal menghapus jadwal');
    }
  });
};

export default appointmentRoutes;
