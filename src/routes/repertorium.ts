import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const repertoriumRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Get monthly repertorium entries
  fastify.get('/monthly', {
    schema: {
      querystring: {
        type: 'object',
        required: ['month', 'year', 'tenantId'],
        properties: {
          month: { type: 'number', minimum: 1, maximum: 12 },
          year: { type: 'number', minimum: 2020 },
          tenantId: { type: 'string' },
        },
      },
    },
    handler: async (request, reply) => {
      const { month, year, tenantId } = request.query as any;

      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0, 23, 59, 59);

      const entries = await prisma.protocolEntry.findMany({
        where: {
          tenantId,
          date: {
            gte: startDate,
            lte: endDate,
          },
        },
        include: {
          deed: {
            include: {
              client: true,
            },
          },
        },
        orderBy: {
          repertoriumNumber: 'asc',
        },
      });

      return entries;
    },
  });

  // Create manual repertorium entry (if needed, usually automated upon deed finalization)
  fastify.post('/', {
    handler: async (request, reply) => {
      // Logic for adding manual entry
      return { success: true };
    },
  });
};

export default repertoriumRoutes;
