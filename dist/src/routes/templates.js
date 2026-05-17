"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = require("@/lib/prisma");
const templateRoutes = async (fastify) => {
    // GET all templates
    fastify.get('/', async (request, reply) => {
        const { type } = request.query;
        const templates = await prisma_1.prisma.deedTemplate.findMany({
            where: type ? { type: type } : {},
            orderBy: { title: 'asc' },
        });
        return reply.sendSuccess(templates);
    });
    // GET template with data injection
    fastify.get('/:id/preview', async (request, reply) => {
        const { id } = request.params;
        const { clientId } = request.query;
        const template = await prisma_1.prisma.deedTemplate.findUnique({
            where: { id },
        });
        if (!template) {
            return reply.sendError('Template tidak ditemukan');
        }
        let injectedContent = template.content;
        if (clientId) {
            const client = await prisma_1.prisma.client.findUnique({
                where: { id: clientId },
            });
            if (client) {
                // Simple Placeholder Injection Logic
                const replacements = {
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
exports.default = templateRoutes;
//# sourceMappingURL=templates.js.map