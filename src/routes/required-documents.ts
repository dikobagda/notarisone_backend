import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { prisma } from '../lib/prisma';
import { z } from 'zod';

const docSchema = z.object({
  name: z.string().min(1, 'Nama dokumen wajib diisi'),
  description: z.string().optional().nullable(),
  category: z.enum(['ALL', 'AKTA', 'PPAT', 'NON_AKTA']),
  isRequired: z.boolean().default(true),
});

const requiredDocumentsRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // GET all required documents for a tenant
  fastify.get('/', async (request, reply) => {
    const { tenantId, page = '1', limit = '10', search = '', category = '' } = request.query as { 
      tenantId: string; 
      page?: string; 
      limit?: string; 
      search?: string;
      category?: string;
    };
    
    if (!tenantId) return reply.sendError('Tenant ID wajib disertakan', 400);

    const p = parseInt(page);
    const l = parseInt(limit);
    const skip = (p - 1) * l;

    try {
      // Dynamic Auto-Seeding: If this tenant has 0 documents in the master list, seed the defaults.
      const tenantDocCount = await prisma.requiredDocumentMaster.count({
        where: { tenantId }
      });

      if (tenantDocCount === 0) {
        const tenantExists = await prisma.tenant.findUnique({
          where: { id: tenantId }
        });
        
        if (tenantExists) {
          const defaultDocs = [
            { name: 'KTP', description: 'Kartu Tanda Penduduk Pemohon', category: 'ALL', isRequired: true },
            { name: 'KK', description: 'Kartu Keluarga Pemohon', category: 'ALL', isRequired: true },
            { name: 'NPWP', description: 'Nomor Pokok Wajib Pajak Pemohon', category: 'ALL', isRequired: true },
            { name: 'Sertifikat', description: 'Sertifikat Tanah (Asli)', category: 'PPAT', isRequired: true },
            { name: 'PBB', description: 'Pajak Bumi dan Bangunan (Tahun Terakhir)', category: 'PPAT', isRequired: true },
          ];

          await prisma.requiredDocumentMaster.createMany({
            data: defaultDocs.map(doc => ({
              tenantId,
              name: doc.name,
              description: doc.description,
              category: doc.category,
              isRequired: doc.isRequired,
            }))
          });
        }
      }

      const where: any = {
        tenantId,
        ...(search ? { name: { contains: search } } : {}),
      };

      // If a specific category is requested, filter it. 
      // If the client requests 'AKTA', we return ALL + AKTA documents.
      if (category) {
        if (category === 'ALL') {
          where.category = 'ALL';
        } else {
          where.category = { in: ['ALL', category] };
        }
      }


      const [docs, total] = await prisma.$transaction([
        prisma.requiredDocumentMaster.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: isNaN(skip) ? undefined : skip,
          take: isNaN(l) ? undefined : l,
        }),
        prisma.requiredDocumentMaster.count({ where })
      ]);

      return reply.sendSuccess({
        data: docs,
        pagination: {
          total,
          page: p,
          limit: l,
          totalPages: Math.ceil(total / l)
        }
      });
    } catch (error) {
      request.log.error(error);
      return reply.sendError('Gagal mengambil daftar dokumen persyaratan', 500);
    }
  });

  // POST create a new required document
  fastify.post('/', async (request, reply) => {
    const { tenantId } = request.query as { tenantId: string };
    if (!tenantId) return reply.sendError('Tenant ID wajib disertakan', 400);

    const result = docSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(422).send({
        success: false,
        message: 'Data tidak valid',
        errors: result.error.format(),
      });
    }

    try {
      const doc = await prisma.requiredDocumentMaster.create({
        data: {
          tenantId,
          name: result.data.name,
          description: result.data.description,
          category: result.data.category,
          isRequired: result.data.isRequired,
        }
      });
      return reply.sendSuccess(doc, 'Berhasil menambahkan dokumen persyaratan');
    } catch (error) {
      request.log.error(error);
      return reply.sendError('Gagal menambahkan dokumen persyaratan', 500);
    }
  });

  // PUT update a required document
  fastify.put('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { tenantId } = request.query as { tenantId: string };
    if (!tenantId) return reply.sendError('Tenant ID wajib disertakan', 400);

    const result = docSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(422).send({
        success: false,
        message: 'Data tidak valid',
        errors: result.error.format(),
      });
    }

    try {
      // check ownership
      const existing = await prisma.requiredDocumentMaster.findUnique({ where: { id } });
      if (!existing || existing.tenantId !== tenantId) {
         return reply.sendError('Dokumen tidak ditemukan', 404);
      }

      const doc = await prisma.requiredDocumentMaster.update({
        where: { id },
        data: {
          name: result.data.name,
          description: result.data.description,
          category: result.data.category,
          isRequired: result.data.isRequired,
        }
      });
      return reply.sendSuccess(doc, 'Berhasil mengubah dokumen persyaratan');
    } catch (error) {
      request.log.error(error);
      return reply.sendError('Gagal mengubah dokumen persyaratan', 500);
    }
  });

  // DELETE a required document
  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { tenantId } = request.query as { tenantId: string };
    if (!tenantId) return reply.sendError('Tenant ID wajib disertakan', 400);

    try {
      // check ownership
      const existing = await prisma.requiredDocumentMaster.findUnique({ where: { id } });
      if (!existing || existing.tenantId !== tenantId) {
         return reply.sendError('Dokumen tidak ditemukan', 404);
      }

      await prisma.requiredDocumentMaster.delete({ where: { id } });
      return reply.sendSuccess(null, 'Berhasil menghapus dokumen persyaratan');
    } catch (error) {
      request.log.error(error);
      return reply.sendError('Gagal menghapus dokumen persyaratan', 500);
    }
  });
};

export default requiredDocumentsRoutes;
