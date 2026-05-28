import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const serviceFeeUpdateSchema = z.object({
  fees: z.array(z.object({
    category: z.enum(['NOTARIAL', 'PPAT', 'WAARMARKING', 'LEGALISASI']),
    price: z.number().min(0, 'Biaya tidak boleh negatif'),
  })),
});

const DEFAULT_FEES = [
  { category: 'NOTARIAL', price: 5000000 },
  { category: 'PPAT', price: 7500000 },
  { category: 'WAARMARKING', price: 1000000 },
  { category: 'LEGALISASI', price: 1000000 }
];

const serviceFeeRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // GET all fees for tenant (with default fallback)
  fastify.get('/', async (request, reply) => {
    const { tenantId } = request.query as { tenantId: string };
    if (!tenantId) return reply.sendError('Tenant ID wajib disertakan', 400);

    try {
      const savedFees = await prisma.serviceFeeMaster.findMany({
        where: { tenantId }
      });

      const mergedFees = DEFAULT_FEES.map(def => {
        const saved = savedFees.find(sf => sf.category === def.category);
        return {
          category: def.category,
          price: saved ? Number(saved.price) : def.price,
          isCustom: !!saved,
        };
      });

      return reply.sendSuccess(mergedFees);
    } catch (error) {
      request.log.error(error);
      return reply.sendError('Gagal mengambil daftar biaya layanan', 500);
    }
  });

  // PUT update or create fees for tenant
  fastify.put('/', async (request, reply) => {
    const { tenantId } = request.query as { tenantId: string };
    if (!tenantId) return reply.sendError('Tenant ID wajib disertakan', 400);

    const result = serviceFeeUpdateSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(422).send({
        success: false,
        message: 'Data tidak valid',
        errors: result.error.format(),
      });
    }

    try {
      const results = [];
      for (const item of result.data.fees) {
        const existing = await prisma.serviceFeeMaster.findFirst({
          where: { tenantId, category: item.category }
        });

        if (existing) {
          const updated = await prisma.serviceFeeMaster.update({
            where: { id: existing.id },
            data: { price: item.price }
          });
          results.push(updated);
        } else {
          const created = await prisma.serviceFeeMaster.create({
            data: {
              tenantId,
              category: item.category,
              price: item.price
            }
          });
          results.push(created);
        }
      }

      return reply.sendSuccess(results, 'Berhasil memperbarui biaya layanan');
    } catch (error) {
      request.log.error(error);
      return reply.sendError('Gagal memperbarui biaya layanan', 500);
    }
  });
};

export default serviceFeeRoutes;
