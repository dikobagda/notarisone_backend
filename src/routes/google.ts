import { FastifyPluginAsync } from 'fastify';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';

const writeLog = (msg: string) => {
  const logPath = path.join(process.cwd(), 'debug.log');
  const timestamp = new Date().toISOString();
  fs.appendFileSync(logPath, `[${timestamp}] ${msg}\n`);
};

const googleRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/google/save-tokens - Save Google OAuth tokens for a user
  fastify.post('/save-tokens', async (request, reply) => {
    writeLog(`>>> Incoming /save-tokens request: ${JSON.stringify(request.body)}`);
    const schema = z.object({
      email: z.string().email(),
      userId: z.string().optional(),
      accessToken: z.string(),
      refreshToken: z.string().optional(),
      expiresAt: z.string().nullable(),
    });

    const body = schema.safeParse(request.body);
    if (!body.success) return reply.sendError(body.error.issues[0].message);

    try {
      const { email, userId, accessToken, refreshToken, expiresAt } = body.data;
      console.log(`[GOOGLE SAVE-TOKENS] Incoming request: userId=${userId}, email=${email}, hasAccessToken=${!!accessToken}, hasRefreshToken=${!!refreshToken}`);

      // Find user by userId (priority) or email
      let user = null;
      if (userId) {
        user = await prisma.user.findUnique({ where: { id: userId } });
        if (user) console.log(`[GOOGLE SAVE-TOKENS] Found user by ID: ${userId}`);
      }
      
      if (!user) {
        user = await prisma.user.findUnique({ where: { email } });
      }

      if (!user) {
        return reply.sendError('User tidak ditemukan');
      }

      // Update user with tokens
      const updateData: any = {
        googleAccessToken: accessToken,
        googleTokenExpiry: expiresAt ? new Date(expiresAt) : null,
      };

      // Only update refresh token if provided (NextAuth only sends it on first login or if prompt=consent is used)
      if (refreshToken) {
        updateData.googleRefreshToken = refreshToken;
      }

      await prisma.user.update({
        where: { id: user.id },
        data: updateData,
      });

      return reply.sendSuccess(null, 'Token Google berhasil disimpan');
    } catch (error) {
      request.log.error(error);
      return reply.sendError('Gagal menyimpan token Google');
    }
  });

  // GET /api/google/status - Check if Google integration is active
  fastify.get('/status', async (request, reply) => {
    const userId = request.userId;
    if (!userId) return reply.sendError('Unauthorized', 401);

    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          googleAccessToken: true,
          googleRefreshToken: true,
          email: true
        }
      });

      const isConnected = !!(user?.googleAccessToken && user?.googleRefreshToken);
      
      return reply.sendSuccess({
        isConnected,
        email: isConnected ? user?.email : null
      });
    } catch (error) {
      request.log.error(error);
      return reply.sendError('Gagal mengambil status integrasi');
    }
  });

  // DELETE /api/google/disconnect - Remove Google integration
  fastify.delete('/disconnect', async (request, reply) => {
    const userId = request.userId;
    if (!userId) return reply.sendError('Unauthorized', 401);

    try {
      await prisma.user.update({
        where: { id: userId },
        data: {
          googleAccessToken: null,
          googleRefreshToken: null,
          googleTokenExpiry: null
        }
      });

      return reply.sendSuccess(null, 'Integrasi Google berhasil diputuskan');
    } catch (error) {
      request.log.error(error);
      return reply.sendError('Gagal memutuskan integrasi');
    }
  });
};

export default googleRoutes;
