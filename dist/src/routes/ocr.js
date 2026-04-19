"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vision_1 = require("../lib/vision");
const ocrRoutes = async (fastify) => {
    fastify.post('/ktp', async (request, reply) => {
        const data = await request.file();
        if (!data) {
            return reply.sendError('File KTP tidak ditemukan');
        }
        try {
            const buffer = await data.toBuffer();
            const extractedData = await (0, vision_1.extractKtpData)(buffer);
            return reply.sendSuccess(extractedData, 'Data KTP berhasil diekstrak');
        }
        catch (error) {
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
            const extractedData = await (0, vision_1.extractNpwpData)(buffer);
            return reply.sendSuccess(extractedData, 'Data NPWP berhasil diekstrak');
        }
        catch (error) {
            fastify.log.error(error);
            return reply.sendError('Gagal memproses OCR NPWP: ' + error.message);
        }
    });
};
exports.default = ocrRoutes;
//# sourceMappingURL=ocr.js.map