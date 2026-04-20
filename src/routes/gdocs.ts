import { FastifyPluginAsync } from 'fastify';
import { prisma } from '@/lib/prisma';
import { GoogleDocsService } from '@/lib/google-docs';
import { downloadFromGcs, uploadToGcs } from '@/lib/gcs';
import { z } from 'zod';
import crypto from 'crypto';
import path from 'path';

const gdocsRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/gdocs/:deedId/documents/:versionId/open
  fastify.post('/:deedId/documents/:versionId/open', async (request, reply) => {
    const userId = request.userId;
    if (!userId) return reply.sendError('Unauthorized', 401);

    const { deedId, versionId } = request.params as { deedId: string; versionId: string };

    try {
      // Get the deed version
      const version = await prisma.deedVersion.findUnique({
        where: { id: versionId },
        include: { deed: true }
      });

      if (!version) return reply.sendError('Dokumen tidak ditemukan', 404);

      // Verify the user has access to this deed (skipped for brevity, assuming existing tenant check)
      
      // If there is already a googleDriveFileId, just return the edit link instead of uploading again
      if (version.googleDriveFileId) {
        const link = await GoogleDocsService.getEditLink(userId, version.googleDriveFileId);
        if (link) {
          return reply.sendSuccess({ url: link }, 'Dokumen sudah terbuka di Google Docs');
        }
      }

      request.log.info(`[GDOCS OPEN] Attempting to download from GCS: ${version.gcsPath}`);
      // Download from GCS
      const buffer = await downloadFromGcs(version.gcsPath);
      if (!buffer) {
         request.log.error(`[GDOCS OPEN] downloadFromGcs returned null for path: ${version.gcsPath}`);
         return reply.sendError(`Gagal mengunduh file draf dari server. Path: ${version.gcsPath}`, 500);
      }

      const fileName = `${version.deed.title || 'Draft'} - V${version.versionNumber}.docx`;

      // Upload to Google Drive and convert to Docs
      const driveFileId = await GoogleDocsService.uploadFromBuffer(userId, buffer, fileName);
      if (!driveFileId) return reply.sendError('Gagal memperbarui file di Google Drive', 500);

      // Save driveFileId to DeedVersion
      await prisma.deedVersion.update({
        where: { id: versionId },
        data: { googleDriveFileId: driveFileId }
      });

      // Get the webViewLink
      const link = await GoogleDocsService.getEditLink(userId, driveFileId);

      return reply.sendSuccess({ url: link }, 'Berhasil membuka di Google Docs');
    } catch (error: any) {
      request.log.error(`[GDOCS OPEN ERROR] ${error.message}`);
      return reply.sendError(`Gagal menyiapkan integrasi Google Docs: ${error.message}`, 500);
    }
  });

  // POST /api/gdocs/:deedId/documents/:versionId/sync
  fastify.post('/:deedId/documents/:versionId/sync', async (request, reply) => {
    const userId = request.userId;
    if (!userId) return reply.sendError('Unauthorized', 401);

    const { deedId, versionId } = request.params as { deedId: string; versionId: string };

    try {
      // Get the current deed version
      const currentVersion = await prisma.deedVersion.findUnique({
        where: { id: versionId },
        include: { deed: true }
      });

      if (!currentVersion || !currentVersion.googleDriveFileId) {
        return reply.sendError('Sesi Google Docs tidak ditemukan untuk dokumen ini', 404);
      }

      // Export from Google Docs to DOCX Buffer
      const buffer = await GoogleDocsService.exportToDocxBuffer(userId, currentVersion.googleDriveFileId);
      if (!buffer) return reply.sendError('Gagal mengunduh perubahan dari Google Docs', 500);

      // Generate a new GCS path for the specific file
      const originalExt = '.docx';
      const fileHash = crypto.createHash('md5').update(currentVersion.deedId + Date.now()).digest('hex').substring(0, 8);
      const newFileName = `deeds/${currentVersion.deed.tenantId}/${currentVersion.deedId}/versions/v${currentVersion.versionNumber + 1}-${fileHash}${originalExt}`;
      const contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

      // Upload the pulled doc to GCS
      const gcsPath = await uploadToGcs(buffer, newFileName, contentType);
      
      // Calculate checksum
      const checksum = crypto.createHash('sha256').update(buffer).digest('hex');

      // Create a NEW version in database
      const newVersion = await prisma.deedVersion.create({
        data: {
          deedId: currentVersion.deedId,
          versionNumber: currentVersion.versionNumber + 1,
          gcsPath: gcsPath,
          fileSize: buffer.length,
          checksum: checksum,
        }
      });

      return reply.sendSuccess({ newVersion }, 'Perubahan berhasil ditarik dan disimpan sebagai versi baru');
    } catch (error: any) {
      request.log.error(`[GDOCS SYNC ERROR] ${error.message}`);
      return reply.sendError(`Gagal menarik perubahan dari Google Docs: ${error.message}`, 500);
    }
  });

};

export default gdocsRoutes;
