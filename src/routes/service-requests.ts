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
          subCategory: body.subCategory,
          documents: body.documents,
          additionalJobs: body.additionalJobs,
          estimatedCost: body.estimatedCost,
          status: 'PENDING'
        }
      });

      // Audit Log
      await fastify.logAudit({
        tenantId: request.tenantId || tenantId,
        userId: request.userId,
        action: 'CREATE_SERVICE_REQUEST',
        resource: 'ServiceRequest',
        resourceId: newRequest.id,
        payload: {
          clientName: newRequest.clientName,
          clientPhone: newRequest.clientPhone,
          serviceCategory: newRequest.serviceCategory,
          estimatedCost: newRequest.estimatedCost,
          description: newRequest.description
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

      // Audit Log
      await fastify.logAudit({
        tenantId: updated.tenantId,
        userId: request.userId,
        action: 'UPDATE_SERVICE_REQUEST_STATUS',
        resource: 'ServiceRequest',
        resourceId: updated.id,
        payload: {
          clientName: updated.clientName,
          status: updated.status
        }
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
          subCategory: body.subCategory,
          documents: body.documents,
          additionalJobs: body.additionalJobs,
          estimatedCost: body.estimatedCost,
        }
      });

      // Audit Log
      await fastify.logAudit({
        tenantId: updated.tenantId,
        userId: request.userId,
        action: 'UPDATE_SERVICE_REQUEST',
        resource: 'ServiceRequest',
        resourceId: updated.id,
        payload: {
          clientName: updated.clientName,
          clientPhone: updated.clientPhone,
          serviceCategory: updated.serviceCategory,
          estimatedCost: updated.estimatedCost
        }
      });

      return reply.sendSuccess(updated, 'Konsultansi berhasil diperbarui');
    } catch (error) {
      console.error(error);
      return reply.sendError('Gagal memperbarui konsultansi: ' + (error as Error).message);
    }
  });

  // PATCH update handover status
  fastify.patch('/:id/handover', async (request, reply) => {
    const { id } = request.params as any;
    const body = request.body as any;

    try {
      const updateData: any = {};
      
      if (body.documents) {
        updateData.documents = body.documents;
        
        const docs = Object.entries(body.documents);
        const totalDocs = docs.length;
        
        // Recalculate toNotaryStatus
        const receivedDocsCount = docs.filter(([_, val]: [string, any]) => val?.checked).length;
        if (receivedDocsCount === 0) {
          updateData.toNotaryStatus = 'PENDING';
        } else if (receivedDocsCount === totalDocs) {
          updateData.toNotaryStatus = 'RECEIVED';
        } else {
          updateData.toNotaryStatus = 'IN_PROGRESS';
        }

        // Recalculate toClientStatus
        const returnedDocsCount = docs.filter(([_, val]: [string, any]) => val?.returned).length;
        if (returnedDocsCount === 0) {
          updateData.toClientStatus = 'PENDING';
        } else if (returnedDocsCount === totalDocs) {
          updateData.toClientStatus = 'RECEIVED';
        } else {
          updateData.toClientStatus = 'IN_PROGRESS';
        }
      }

      if (body.type === 'CLIENT_TO_NOTARY') {
        if (body.status !== undefined) updateData.toNotaryStatus = body.status;
        if (body.date !== undefined) updateData.toNotaryDate = body.date ? new Date(body.date) : null;
        if (body.proof !== undefined) updateData.toNotaryProof = body.proof;
      } else if (body.type === 'NOTARY_TO_CLIENT') {
        if (body.status !== undefined) updateData.toClientStatus = body.status;
        if (body.date !== undefined) updateData.toClientDate = body.date ? new Date(body.date) : null;
        if (body.proof !== undefined) updateData.toClientProof = body.proof;
      } else if (!body.documents) {
        return reply.sendError('Tipe serah terima tidak valid');
      }

      // If fully received/returned, set fallback dates
      if (body.documents) {
        if (updateData.toNotaryStatus === 'RECEIVED' && !updateData.toNotaryDate) {
          updateData.toNotaryDate = new Date();
        }
        if (updateData.toClientStatus === 'RECEIVED' && !updateData.toClientDate) {
          updateData.toClientDate = new Date();
        }
      }

      const updated = await prisma.serviceRequest.update({
        where: { id },
        data: updateData
      });

      // Audit Log
      await fastify.logAudit({
        tenantId: updated.tenantId,
        userId: request.userId,
        action: 'UPDATE_SERVICE_REQUEST_HANDOVER',
        resource: 'ServiceRequest',
        resourceId: updated.id,
        payload: {
          clientName: updated.clientName,
          type: body.type || 'PROGRESSIVE',
          status: body.status || 'UPDATED',
          date: body.date || new Date().toISOString()
        }
      });

      return reply.sendSuccess(updated, 'Serah terima berhasil diperbarui');
    } catch (error) {
      console.error(error);
      return reply.sendError('Gagal memperbarui data serah terima');
    }
  });
}
