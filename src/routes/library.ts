import { FastifyPluginAsync } from 'fastify';
import { prisma } from '@/lib/prisma';
import { uploadToGcs, getSignedReadUrl } from '@/lib/gcs';

const libraryRoutes: FastifyPluginAsync = async (fastify) => {
  // GET all library items
  fastify.get('/', async (request, reply) => {
    const tenantId = request.tenantId;
    
    if (!tenantId) {
      return reply.sendError('Akses ditolak', 403);
    }

    const items = await prisma.libraryItem.findMany({
      where: {
        OR: [
          { tenantId: null }, // Global templates
          { tenantId }, // Tenant-specific templates
        ],
        status: 'APPROVED',
      },
      orderBy: { createdAt: 'desc' },
    });

    return reply.sendSuccess(items);
  });

  // GET download link
  fastify.get('/:id/download', async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenantId = request.tenantId;

    if (!tenantId) {
      return reply.sendError('Akses ditolak', 403);
    }

    const item = await prisma.libraryItem.findUnique({
      where: { id },
    });

    if (!item) {
      return reply.sendError('File tidak ditemukan', 404);
    }

    // Security check: Only allow download if it's global or belongs to the user's tenant
    if (item.tenantId !== null && item.tenantId !== tenantId) {
      return reply.sendError('Akses ditolak', 403);
    }

    if (!item.fileUrl) {
      return reply.sendError('URL File tidak valid', 400);
    }

    try {
      const signedUrl = await getSignedReadUrl(item.fileUrl);
      if (!signedUrl) {
        throw new Error('Gagal membuat signed URL');
      }
      return reply.sendSuccess({ url: signedUrl });
    } catch (error) {
      console.error('[Library] Signed URL error:', error);
      return reply.sendError('Gagal mengambil akses file', 500);
    }
  });

  // POST create library item with file upload
  fastify.post('/upload', async (request, reply) => {
    const tenantId = request.tenantId;
    
    if (!tenantId) {
      return reply.sendError('Akses ditolak', 403);
    }

    const data = await request.file();
    if (!data) {
      return reply.sendError('File template tidak ditemukan', 400);
    }

    const title = (data.fields.title as any)?.value as string;
    const description = (data.fields.description as any)?.value as string;
    const category = (data.fields.category as any)?.value as string;

    if (!title || !category) {
      return reply.sendError('Judul dan kategori wajib diisi', 400);
    }

    // Determine file type from mimetype
    const mimeType = data.mimetype;
    let fileType = 'UNKNOWN';
    if (mimeType.includes('pdf')) fileType = 'PDF';
    else if (mimeType.includes('wordprocessingml.document')) fileType = 'DOCX';
    else if (mimeType.includes('msword')) fileType = 'DOC';

    try {
      const buffer = await data.toBuffer();
      const fileName = `library/${tenantId}/${Date.now()}-${data.filename.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      
      const fileUrl = await uploadToGcs(buffer, fileName, mimeType);

      const item = await prisma.libraryItem.create({
        data: {
          title,
          description,
          category,
          fileType,
          fileUrl,
          tenantId, // Save for this tenant only
          status: 'APPROVED', 
        },
      });

      return reply.sendSuccess(item, 'Template berhasil diunggah');
    } catch (error) {
      console.error('[Library Upload] Error:', error);
      return reply.sendError('Gagal mengunggah template', 500);
    }
  });
};

export default libraryRoutes;
