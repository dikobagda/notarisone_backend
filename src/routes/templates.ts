import { FastifyPluginAsync } from 'fastify';
import { prisma } from '@/lib/prisma';

const templateRoutes: FastifyPluginAsync = async (fastify) => {
  // GET all templates
  fastify.get('/', async (request, reply) => {
    const { type } = request.query as { type?: string };
    
    const templates = await prisma.deedTemplate.findMany({
      where: type ? { type: type as any } : {},
      orderBy: { title: 'asc' },
    });

    return reply.sendSuccess(templates);
  });

  // GET template with data injection
  fastify.get('/:id/preview', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { clientId } = request.query as { clientId?: string };

    const template = await prisma.deedTemplate.findUnique({
      where: { id },
    });

    if (!template) {
      return reply.sendError('Template tidak ditemukan');
    }

    let injectedContent = template.content;

    if (clientId) {
      const client = await prisma.client.findUnique({
        where: { id: clientId },
      });

      if (client) {
        // Simple Placeholder Injection Logic
        const replacements: Record<string, string> = {
          '[[NAMA_KLIEN]]': client.name,
          '[[NIK_KLIEN]]': client.nik,
          '[[ALAMAT_KLIEN]]': client.address,
          '[[TANGGAL_SEKARANG]]': new Date().toLocaleDateString('id-ID', { 
            day: 'numeric', 
            month: 'long', 
            year: 'numeric' 
          }),
        };

        Object.entries(replacements).forEach(([key, value]) => {
          injectedContent = injectedContent.split(key).join(value);
        });
      }
    }

    return reply.sendSuccess({
      ...template,
      injectedContent,
    });
  });
};

export default templateRoutes;
