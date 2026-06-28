import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const createTicketSchema = z.object({
  title: z.string().min(1, 'Judul wajib diisi'),
  description: z.string().min(1, 'Deskripsi wajib diisi'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  category: z.enum(['COMPLAINT', 'COMPLIANCE', 'INQUIRY', 'TECHNICAL']).default('TECHNICAL'),
});

const updateTicketSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  category: z.enum(['COMPLAINT', 'COMPLIANCE', 'INQUIRY', 'TECHNICAL']).optional(),
});

const ticketsRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // GET all tickets for tenant (with pagination and filters)
  fastify.get('/', async (request, reply) => {
    const tenantId = request.tenantId;
    if (!tenantId) return reply.sendError('Tenant ID wajib disertakan', 400);

    const { page = '1', limit = '10', search = '', status, priority, category } = request.query as {
      page?: string;
      limit?: string;
      search?: string;
      status?: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
      priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
      category?: 'COMPLAINT' | 'COMPLIANCE' | 'INQUIRY' | 'TECHNICAL';
    };

    const p = parseInt(page);
    const l = parseInt(limit);
    const skip = (p - 1) * l;

    try {
      const where: any = {
        tenantId,
        deletedAt: null,
        ...(status ? { status } : {}),
        ...(priority ? { priority } : {}),
        ...(category ? { category } : {}),
        ...(search
          ? {
              OR: [
                { title: { contains: search } },
                { description: { contains: search } },
              ],
            }
          : {}),
      };

      const [tickets, total] = await prisma.$transaction([
        prisma.ticket.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: l,
        }),
        prisma.ticket.count({ where }),
      ]);

      return reply.sendSuccess({
        data: tickets,
        pagination: {
          total,
          page: p,
          limit: l,
          totalPages: Math.ceil(total / l),
        },
      });
    } catch (error) {
      request.log.error(error);
      return reply.sendError('Gagal mengambil daftar tiket bantuan', 500);
    }
  });

  // POST create new ticket
  fastify.post('/', async (request, reply) => {
    const tenantId = request.tenantId;
    if (!tenantId) return reply.sendError('Tenant ID wajib disertakan', 400);

    const result = createTicketSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(422).send({
        success: false,
        message: 'Data tidak valid',
        errors: result.error.format(),
      });
    }

    try {
      const ticket = await prisma.ticket.create({
        data: {
          tenantId,
          title: result.data.title,
          description: result.data.description,
          priority: result.data.priority,
          category: result.data.category,
        },
      });
      return reply.sendSuccess(ticket, 'Berhasil menambahkan tiket bantuan');
    } catch (error) {
      request.log.error(error);
      return reply.sendError('Gagal menambahkan tiket bantuan', 500);
    }
  });

  // PATCH update ticket status/details
  fastify.patch('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenantId = request.tenantId;
    if (!tenantId) return reply.sendError('Tenant ID wajib disertakan', 400);

    const result = updateTicketSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(422).send({
        success: false,
        message: 'Data tidak valid',
        errors: result.error.format(),
      });
    }

    try {
      // check ownership
      const existing = await prisma.ticket.findFirst({
        where: { id, tenantId, deletedAt: null },
      });
      if (!existing) {
        return reply.sendError('Tiket tidak ditemukan', 404);
      }

      const ticket = await prisma.ticket.update({
        where: { id },
        data: result.data,
      });
      return reply.sendSuccess(ticket, 'Berhasil memperbarui tiket bantuan');
    } catch (error) {
      request.log.error(error);
      return reply.sendError('Gagal memperbarui tiket bantuan', 500);
    }
  });

  // DELETE ticket (soft delete)
  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenantId = request.tenantId;
    if (!tenantId) return reply.sendError('Tenant ID wajib disertakan', 400);

    try {
      // check ownership
      const existing = await prisma.ticket.findFirst({
        where: { id, tenantId, deletedAt: null },
      });
      if (!existing) {
        return reply.sendError('Tiket tidak ditemukan', 404);
      }

      await prisma.ticket.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
      return reply.sendSuccess(null, 'Berhasil menghapus tiket bantuan');
    } catch (error) {
      request.log.error(error);
      return reply.sendError('Gagal menghapus tiket bantuan', 500);
    }
  });
};

export default ticketsRoutes;
