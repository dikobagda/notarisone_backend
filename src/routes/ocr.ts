import { FastifyPluginAsync } from 'fastify';
import { extractKtpData, extractNpwpData } from '../lib/vision';

const ocrRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/ktp', async (request, reply) => {
    const data = await request.file();
    
    if (!data) {
      return reply.sendError('File KTP tidak ditemukan');
    }

    try {
      const buffer = await data.toBuffer();
      const extractedData = await extractKtpData(buffer);
      
      return reply.sendSuccess(extractedData, 'Data KTP berhasil diekstrak');
    } catch (error: any) {
      fastify.log.error(error);
      return reply.sendError('Gagal memproses OCR KTP: ' + error.message);
    }
  });

  fastify.post('/npwp', async (request, reply) => {
    const data = await request.file();
    
    if (!data) {
      return reply.sendError('File NPWP tidak ditemukan');
    }

    try {
      const buffer = await data.toBuffer();
      const extractedData = await extractNpwpData(buffer);
      
      return reply.sendSuccess(extractedData, 'Data NPWP berhasil diekstrak');
    } catch (error: any) {
      fastify.log.error(error);
      return reply.sendError('Gagal memproses OCR NPWP: ' + error.message);
    }
  });
};

export default ocrRoutes;
