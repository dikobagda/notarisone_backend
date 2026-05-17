import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const jobSchema = z.object({
  name: z.string().min(1, 'Nama wajib diisi'),
  price: z.number().min(0, 'Biaya tidak boleh negatif'),
});

const additionalJobsRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // GET all jobs for tenant (with pagination)
  fastify.get('/', async (request, reply) => {
    console.log("GET /api/additional-jobs query:", request.query);
    const { tenantId, page = '1', limit = '10', search = '' } = request.query as { 
      tenantId: string, 
      page?: string, 
      limit?: string, 
      search?: string 
    };
    
    if (!tenantId) return reply.sendError('Tenant ID wajib disertakan', 400);

    const p = parseInt(page);
    const l = parseInt(limit);
    const skip = (p - 1) * l;

    try {
      const where = {
        tenantId,
        ...(search ? { name: { contains: search } } : {})
      };

      const [jobs, total] = await prisma.$transaction([
        prisma.additionalJobMaster.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: l
        }),
        prisma.additionalJobMaster.count({ where })
      ]);

      return reply.sendSuccess({
        data: jobs,
        pagination: {
          total,
          page: p,
          limit: l,
          totalPages: Math.ceil(total / l)
        }
      });
    } catch (error) {
      request.log.error(error);
      return reply.sendError('Gagal mengambil daftar pekerjaan tambahan', 500);
    }
  });

  // POST create new job
  fastify.post('/', async (request, reply) => {
    const { tenantId } = request.query as { tenantId: string };
    if (!tenantId) return reply.sendError('Tenant ID wajib disertakan', 400);

    const result = jobSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(422).send({
        success: false,
        message: 'Data tidak valid',
        errors: result.error.format(),
      });
    }

    try {
      const job = await prisma.additionalJobMaster.create({
        data: {
          tenantId,
          name: result.data.name,
          price: result.data.price
        }
      });
      return reply.sendSuccess(job, 'Berhasil menambahkan pekerjaan tambahan');
    } catch (error) {
      request.log.error(error);
      return reply.sendError('Gagal menambahkan pekerjaan tambahan', 500);
    }
  });

  // PUT update job
  fastify.put('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { tenantId } = request.query as { tenantId: string };
    if (!tenantId) return reply.sendError('Tenant ID wajib disertakan', 400);

    const result = jobSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(422).send({
        success: false,
        message: 'Data tidak valid',
        errors: result.error.format(),
      });
    }

    try {
      // check ownership
      const existing = await prisma.additionalJobMaster.findUnique({ where: { id } });
      if (!existing || existing.tenantId !== tenantId) {
         return reply.sendError('Pekerjaan tidak ditemukan', 404);
      }

      const job = await prisma.additionalJobMaster.update({
        where: { id },
        data: {
          name: result.data.name,
          price: result.data.price
        }
      });
      return reply.sendSuccess(job, 'Berhasil mengubah pekerjaan tambahan');
    } catch (error) {
      request.log.error(error);
      return reply.sendError('Gagal mengubah pekerjaan tambahan', 500);
    }
  });

  // DELETE job
  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { tenantId } = request.query as { tenantId: string };
    if (!tenantId) return reply.sendError('Tenant ID wajib disertakan', 400);

    try {
      // check ownership
      const existing = await prisma.additionalJobMaster.findUnique({ where: { id } });
      if (!existing || existing.tenantId !== tenantId) {
         return reply.sendError('Pekerjaan tidak ditemukan', 404);
      }

      await prisma.additionalJobMaster.delete({ where: { id } });
      return reply.sendSuccess(null, 'Berhasil menghapus pekerjaan tambahan');
    } catch (error) {
      request.log.error(error);
      return reply.sendError('Gagal menghapus pekerjaan tambahan', 500);
    }
  });
};

export default additionalJobsRoutes;
