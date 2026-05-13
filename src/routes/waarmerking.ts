import { FastifyPluginAsync } from 'fastify';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const waarmerkingSchema = z.object({
  pemohon: z.string().min(1, 'Nama pemohon wajib diisi'),
  perihal: z.string().min(1, 'Perihal wajib diisi'),
  keterangan: z.string().optional().or(z.literal('')),
  tanggalDaftar: z.string().optional(),
  jumlahHalaman: z.number().int().min(1).default(1),
  biaya: z.number().optional(),
  status: z.enum(['PENDING', 'SELESAI', 'DIBATALKAN']).default('PENDING'),
  clientId: z.string().optional().or(z.literal('')),
  nomorDaftar: z.string().optional().or(z.literal('')),
});

const waarmerkingRoutes: FastifyPluginAsync = async (fastify) => {
  // GET all waarmerking
  fastify.get('/', async (request, reply) => {
    const { tenantId, search, status, page = '1', limit = '10' } = request.query as {
      tenantId: string;
      search?: string;
      status?: string;
      page?: string;
      limit?: string;
    };

    if (!tenantId) return reply.sendError('Tenant ID wajib disertakan');

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const where: any = {
      tenantId,
      deletedAt: null,
    };

    if (search) {
      where.OR = [
        { pemohon: { contains: search } },
        { perihal: { contains: search } },
        { nomorDaftar: { contains: search } },
      ];
    }

    if (status) {
      where.status = status;
    }

    const [data, total] = await Promise.all([
      prisma.waarmerking.findMany({
        where,
        orderBy: { tanggalDaftar: 'desc' },
        skip,
        take,
        include: {
          client: { select: { id: true, name: true, nik: true } },
        },
      }),
      prisma.waarmerking.count({ where }),
    ]);

    return reply.sendSuccess({ data, total, page: parseInt(page), limit: take });
  });

  // GET single
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { tenantId } = request.query as { tenantId: string };

    if (!tenantId) return reply.sendError('Tenant ID wajib disertakan');

    const record = await prisma.waarmerking.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        client: { select: { id: true, name: true, nik: true, phone: true, address: true } },
      },
    });

    if (!record) return reply.sendError('Data waarmerking tidak ditemukan', 404);

    return reply.sendSuccess(record);
  });

  // POST create
  fastify.post('/', async (request, reply) => {
    const { tenantId } = request.query as { tenantId: string };
    if (!tenantId) return reply.sendError('Tenant ID wajib disertakan');

    const result = waarmerkingSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(422).send({ success: false, message: 'Data tidak valid', errors: result.error.format() });
    }

    // Auto-generate nomor daftar: WM-YYYY-MM-NNN
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const count = await prisma.waarmerking.count({
      where: { tenantId, nomorDaftar: { startsWith: `WM-${ym}` } },
    });
    const nomorDaftar = result.data.nomorDaftar || `WM-${ym}-${String(count + 1).padStart(3, '0')}`;

    const record = await prisma.waarmerking.create({
      data: {
        tenantId,
        nomorDaftar,
        pemohon: result.data.pemohon,
        perihal: result.data.perihal,
        keterangan: result.data.keterangan || null,
        tanggalDaftar: result.data.tanggalDaftar ? new Date(result.data.tanggalDaftar) : new Date(),
        jumlahHalaman: result.data.jumlahHalaman,
        biaya: result.data.biaya ?? null,
        status: result.data.status,
        clientId: result.data.clientId || null,
      },
    });

    await fastify.logAudit({
      tenantId,
      action: 'CREATE_WAARMERKING',
      resource: 'Waarmerking',
      resourceId: record.id,
      payload: result.data,
    });

    return reply.sendSuccess(record, 'Waarmerking berhasil didaftarkan');
  });

  // PATCH update
  fastify.patch('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { tenantId } = request.query as { tenantId: string };
    if (!tenantId) return reply.sendError('Tenant ID wajib disertakan');

    const result = waarmerkingSchema.partial().safeParse(request.body);
    if (!result.success) {
      return reply.code(422).send({ success: false, message: 'Data tidak valid', errors: result.error.format() });
    }

    const existing = await prisma.waarmerking.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!existing) return reply.sendError('Data tidak ditemukan', 404);

    const updated = await prisma.waarmerking.update({
      where: { id },
      data: {
        ...result.data,
        keterangan: result.data.keterangan !== undefined ? (result.data.keterangan || null) : undefined,
        clientId: result.data.clientId !== undefined ? (result.data.clientId || null) : undefined,
        nomorDaftar: result.data.nomorDaftar !== undefined ? (result.data.nomorDaftar || null) : undefined,
        tanggalDaftar: result.data.tanggalDaftar ? new Date(result.data.tanggalDaftar) : undefined,
        biaya: result.data.biaya !== undefined ? result.data.biaya : undefined,
      },
    });

    await fastify.logAudit({
      tenantId,
      action: 'UPDATE_WAARMERKING',
      resource: 'Waarmerking',
      resourceId: id,
      payload: result.data,
    });

    return reply.sendSuccess(updated, 'Waarmerking berhasil diperbarui');
  });

  // DELETE (soft delete)
  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { tenantId } = request.query as { tenantId: string };
    if (!tenantId) return reply.sendError('Tenant ID wajib disertakan');

    const existing = await prisma.waarmerking.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!existing) return reply.sendError('Data tidak ditemukan', 404);

    await prisma.waarmerking.update({ where: { id }, data: { deletedAt: new Date() } });

    await fastify.logAudit({
      tenantId,
      action: 'DELETE_WAARMERKING',
      resource: 'Waarmerking',
      resourceId: id,
      payload: { nomorDaftar: existing.nomorDaftar },
    });

    return reply.sendSuccess(null, 'Waarmerking berhasil dihapus');
  });
};

export default waarmerkingRoutes;
