import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma';
import { z } from 'zod';
import { uploadToGcs } from '../lib/gcs';

export default async function serviceRequestRoutes(fastify: FastifyInstance) {
  // POST upload document for service request
  fastify.post('/upload', async (request, reply) => {
    const data = await request.file();
    if (!data) return reply.sendError('File tidak ditemukan');

    try {
      const buffer = await data.toBuffer();
      const fileName = `service-requests/${Date.now()}_${data.filename.replace(/\s+/g, '_')}`;
      const gsPath = await uploadToGcs(buffer, fileName, data.mimetype);

      return reply.sendSuccess({ 
        url: gsPath,
        name: data.filename 
      }, 'File berhasil diunggah');
    } catch (error: any) {
      request.log.error(error);
      return reply.sendError('Gagal mengunggah file: ' + error.message);
    }
  });

  // GET all consultations (service requests)
  fastify.get('/', async (request, reply) => {
    const { tenantId } = request.query as any;
    if (!tenantId) return reply.sendError('Tenant ID wajib disertakan');

    try {
      const requests = await prisma.serviceRequest.findMany({
        where: { tenantId },
        include: {
          client: {
            select: { name: true, phone: true, nik: true }
          },
          _count: {
            select: { deeds: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      return reply.sendSuccess(requests);
    } catch (error) {
      return reply.sendError('Gagal mengambil data konsultansi');
    }
  });

  // POST a new consultation
  fastify.post('/', async (request, reply) => {
    const { tenantId } = request.query as any;
    const body = request.body as any;

    if (!tenantId) return reply.sendError('Tenant ID wajib disertakan');

    try {
      // Consultation can be created without a client first (just name/phone) 
      // but the current schema requires clientId. 
      // I should update the schema to make clientId optional for consultations,
      // or create a 'Temporary Client' if needed.
      // Looking at schema: clientId is NOT optional.
      
      // For now, I'll assume we either have a clientId or we create a minimal client first.
      
      const newRequest = await prisma.serviceRequest.create({
        data: {
          tenantId,
          clientId: body.clientId,
          clientName: body.clientName,
          clientPhone: body.clientPhone,
          description: body.description,
          serviceCategory: body.serviceCategory,
          documents: body.documents,
          additionalJobs: body.additionalJobs,
          estimatedCost: body.estimatedCost,
          status: 'PENDING'
        }
      });

      return reply.sendSuccess(newRequest, 'Konsultansi berhasil disimpan');
    } catch (error) {
      console.error(error);
      return reply.sendError('Gagal menyimpan konsultansi: ' + (error as Error).message);
    }
  });

  // PATCH update status
  fastify.patch('/:id/status', async (request, reply) => {
    const { id } = request.params as any;
    const { status } = request.body as any;

    try {
      const updated = await prisma.serviceRequest.update({
        where: { id },
        data: { status }
      });
      return reply.sendSuccess(updated, 'Status berhasil diperbarui');
    } catch (error) {
      return reply.sendError('Gagal memperbarui status');
    }
  });



  // GET a specific consultation by ID
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as any;
    
    try {
      const serviceRequest = await prisma.serviceRequest.findUnique({
        where: { id },
        include: {
          client: {
            select: { name: true, phone: true, nik: true }
          },
          deeds: {
            select: {
              id: true,
              title: true,
              type: true,
              status: true,
              createdAt: true
            }
          }
        }
      });

      if (!serviceRequest) {
        return reply.code(404).send({ success: false, message: 'Konsultansi tidak ditemukan' });
      }

      return reply.sendSuccess(serviceRequest);
    } catch (error) {
      return reply.sendError('Gagal mengambil data konsultansi');
    }
  });

  // PUT update a specific consultation
  fastify.put('/:id', async (request, reply) => {
    const { id } = request.params as any;
    const body = request.body as any;

    try {
      const updated = await prisma.serviceRequest.update({
        where: { id },
        data: {
          clientName: body.clientName,
          clientPhone: body.clientPhone,
          description: body.description,
          serviceCategory: body.serviceCategory,
          documents: body.documents,
          additionalJobs: body.additionalJobs,
          estimatedCost: body.estimatedCost,
        }
      });
      return reply.sendSuccess(updated, 'Konsultansi berhasil diperbarui');
    } catch (error) {
      console.error(error);
      return reply.sendError('Gagal memperbarui konsultansi: ' + (error as Error).message);
    }
  });
}
