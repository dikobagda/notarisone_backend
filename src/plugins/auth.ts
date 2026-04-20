import { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { prisma } from '@/lib/prisma';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.NEXTAUTH_SECRET || "notarisone_local_secret_key";

declare module 'fastify' {
  interface FastifyRequest {
    tenantId: string;
    userId?: string;
    role?: string;
  }
}

const authPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Initialize custom request properties
  fastify.decorateRequest('tenantId', '');
  fastify.decorateRequest('userId', '');
  fastify.decorateRequest('role', '');

  fastify.addHook('preHandler', async (request: FastifyRequest, reply) => {
    // 1. Skip auth for public routes and auth routes
    if (
      request.url === '/health' || 
      request.url.startsWith('/public') || 
      request.url.startsWith('/api/auth') || 
      request.url.startsWith('/api/ocr') ||
      request.url.startsWith('/api/backauth') ||
      request.url.startsWith('/api/subscription/plans') ||
      request.url.startsWith('/api/subscription/webhook') ||
      request.url.startsWith('/api/subscription/debug') ||
      request.url.startsWith('/api/google/save-tokens')
    ) {
      return;
    }

    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Missing or invalid Authorization header' });
    }

    const token = authHeader.split(' ')[1];

    try {
      // 2. Verify NextAuth or Local Login JWT
      const decoded: any = jwt.verify(token, JWT_SECRET);

      // 3. User verification against local database
      const userId = decoded.sub;
      
      const user = await prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user) {
        return reply.code(403).send({ error: 'User tidak ditemukan' });
      }

      // 4. Attach session data to request
      request.tenantId = user.tenantId;
      request.userId = user.id;
      request.role = user.role;
      
    } catch (err: any) {
      request.server.log.error('JWT Verification failed', err);
      return reply.code(401).send({ error: 'Invalid Token' });
    }
  });
};

export default fp(authPlugin);
