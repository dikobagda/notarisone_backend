import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const deedTypeSchema = z.object({
  name: z.string().min(1, 'Nama jenis akta wajib diisi'),
  category: z.enum(['NOTARY', 'PPAT']),
  code: z.string().min(1, 'Kode/Singkatan wajib diisi'),
});

const DEFAULT_DEED_TYPES = [
  // NOTARY
  { name: "Pendirian Perseroan Terbatas (PT)", category: "NOTARY", code: "PENDIRIAN_PT" },
  { name: "Pendirian CV / Firma", category: "NOTARY", code: "PENDIRIAN_CV" },
  { name: "Pendirian Yayasan", category: "NOTARY", code: "PENDIRIAN_YAYASAN" },
  { name: "Pendirian Perkumpulan", category: "NOTARY", code: "PENDIRIAN_PERKUMPULAN" },
  { name: "Perubahan Anggaran Dasar", category: "NOTARY", code: "AD_PERUBAHAN" },
  { name: "Perjanjian Sewa Menyewa", category: "NOTARY", code: "SEWA_MENYUWA" },
  { name: "Perjanjian Kerjasama (Joint Venture)", category: "NOTARY", code: "KERJASAMA" },
  { name: "Perjanjian Kredit", category: "NOTARY", code: "KREDIT" },
  { name: "Akta Jual Beli Saham", category: "NOTARY", code: "JUAL_BELI" },
  { name: "Akta Wasiat", category: "NOTARY", code: "WASIAT" },
  { name: "Akta Kuasa Menjual", category: "NOTARY", code: "KUASA_MENJUAL" },
  { name: "Pengikatan Jual Beli (PPJB)", category: "NOTARY", code: "PPJB" },
  { name: "Berita Acara Rapat (RUPS)", category: "NOTARY", code: "RUPS" },
  { name: "Surat Kuasa Membebankan Hak Tanggungan (SKMHT)", category: "NOTARY", code: "SKMHT" },
  { name: "Hibah", category: "NOTARY", code: "HIBAH" },
  { name: "Lainnya", category: "NOTARY", code: "LAINNYA" },
  // PPAT
  { name: "Akta Jual Beli (AJB)", category: "PPAT", code: "AJB" },
  { name: "Akta Hibah", category: "PPAT", code: "HIBAH" },
  { name: "Akta Tukar Menukar", category: "PPAT", code: "TUKAR_MENUKAR" },
  { name: "Akta Pemasukan Ke Dalam Perusahaan (Inbreng)", category: "PPAT", code: "INBRENG" },
  { name: "Akta Pembagian Hak Bersama (APHB)", category: "PPAT", code: "APHB" },
  { name: "Akta Pemberian Hak Tanggungan (APHT)", category: "PPAT", code: "APHT" },
  { name: "Akta Pemberian Hak Tanggungan Novasi (APHT-Novasi)", category: "PPAT", code: "APHT_NOVASI" },
  { name: "Surat Kuasa Membebankan Hak Tanggungan (SKMHT)", category: "PPAT", code: "SKMHT" },
  { name: "Akta Pemberian Hak Guna Bangunan (HGB)", category: "PPAT", code: "HGB" },
  { name: "Akta Pemberian Hak Guna Usaha (HGU)", category: "PPAT", code: "HGU" },
  { name: "Akta Pemberian Hak Pakai (HP)", category: "PPAT", code: "HP" },
];

const deedTypesRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // GET all deed types for tenant (with auto-seeding if empty)
  fastify.get('/', async (request, reply) => {
    const { tenantId, category, search = '' } = request.query as {
      tenantId: string;
      category?: 'NOTARY' | 'PPAT';
      search?: string;
    };

    if (!tenantId) return reply.sendError('Tenant ID wajib disertakan', 400);

    try {
      // Check if this tenant has any registered deed types
      const count = await prisma.deedTypeMaster.count({
        where: { tenantId }
      });

      // Auto-seed defaults if zero entries exist
      if (count === 0) {
        const payload = DEFAULT_DEED_TYPES.map(type => ({
          tenantId,
          name: type.name,
          category: type.category,
          code: type.code,
        }));
        await prisma.deedTypeMaster.createMany({
          data: payload
        });
      }

      const where = {
        tenantId,
        ...(category ? { category } : {}),
        ...(search ? {
          OR: [
            { name: { contains: search } },
            { code: { contains: search } }
          ]
        } : {})
      };

      const deedTypes = await prisma.deedTypeMaster.findMany({
        where,
        orderBy: { name: 'asc' }
      });

      return reply.sendSuccess(deedTypes);
    } catch (error) {
      request.log.error(error);
      return reply.sendError('Gagal mengambil daftar master jenis akta', 500);
    }
  });

  // POST create new deed type
  fastify.post('/', async (request, reply) => {
    const { tenantId } = request.query as { tenantId: string };
    if (!tenantId) return reply.sendError('Tenant ID wajib disertakan', 400);

    const result = deedTypeSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(422).send({
        success: false,
        message: 'Data tidak valid',
        errors: result.error.format(),
      });
    }

    try {
      const codeUpper = result.data.code.trim().toUpperCase().replace(/\s+/g, '_');
      
      const deedType = await prisma.deedTypeMaster.create({
        data: {
          tenantId,
          name: result.data.name,
          category: result.data.category,
          code: codeUpper,
        }
      });
      return reply.sendSuccess(deedType, 'Berhasil menambahkan master jenis akta');
    } catch (error) {
      request.log.error(error);
      return reply.sendError('Gagal menambahkan master jenis akta', 500);
    }
  });

  // PUT update deed type
  fastify.put('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { tenantId } = request.query as { tenantId: string };
    if (!tenantId) return reply.sendError('Tenant ID wajib disertakan', 400);

    const result = deedTypeSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(422).send({
        success: false,
        message: 'Data tidak valid',
        errors: result.error.format(),
      });
    }

    try {
      const existing = await prisma.deedTypeMaster.findUnique({ where: { id } });
      if (!existing || existing.tenantId !== tenantId) {
        return reply.sendError('Master jenis akta tidak ditemukan', 404);
      }

      const codeUpper = result.data.code.trim().toUpperCase().replace(/\s+/g, '_');

      const deedType = await prisma.deedTypeMaster.update({
        where: { id },
        data: {
          name: result.data.name,
          category: result.data.category,
          code: codeUpper,
        }
      });
      return reply.sendSuccess(deedType, 'Berhasil memperbarui master jenis akta');
    } catch (error) {
      request.log.error(error);
      return reply.sendError('Gagal memperbarui master jenis akta', 500);
    }
  });

  // DELETE deed type
  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { tenantId } = request.query as { tenantId: string };
    if (!tenantId) return reply.sendError('Tenant ID wajib disertakan', 400);

    try {
      const existing = await prisma.deedTypeMaster.findUnique({ where: { id } });
      if (!existing || existing.tenantId !== tenantId) {
        return reply.sendError('Master jenis akta tidak ditemukan', 404);
      }

      await prisma.deedTypeMaster.delete({ where: { id } });
      return reply.sendSuccess(null, 'Berhasil menghapus master jenis akta');
    } catch (error) {
      request.log.error(error);
      return reply.sendError('Gagal menghapus master jenis akta', 500);
    }
  });
};

export default deedTypesRoutes;
