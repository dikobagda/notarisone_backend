import 'dotenv/config';

// 1. BigInt JSON Serialization Fix (MUST BE TOP LEVEL)
(BigInt.prototype as any).toJSON = function () {
  return Number(this);
};

import Fastify, { FastifyReply } from 'fastify';
import auditPlugin from './plugins/audit';
import clientRoutes from './routes/clients';
import deedRoutes from './routes/deeds';
import repertoriumRoutes from './routes/repertorium';
import adminRoutes from './routes/admin';
import billingRoutes from './routes/billing';
import templateRoutes from './routes/templates';
import { authApiRoutes } from './routes/auth';
import ocrRoutes from './routes/ocr';
import auditRoutes from './routes/audit';
import authPlugin from './plugins/auth';
import teamRoutes from './routes/team';
import tenantRoutes from './routes/tenant';
import tenantTeamRoutes from './routes/tenant-teams';
import { profileRoutes } from './routes/profile';
import appointmentRoutes from './routes/appointments';
import googleRoutes from './routes/google';
import subscriptionRoutes from './routes/subscription';
import gdocsRoutes from './routes/gdocs';
import notificationRoutes from './routes/notifications';
import multipart from '@fastify/multipart';
import cors from '@fastify/cors';
import { prisma } from './lib/prisma';

declare module 'fastify' {
  interface FastifyReply {
    sendSuccess(data: any, message?: string): FastifyReply;
    sendError(message: string, code?: number): FastifyReply;
  }
}

const server = Fastify({
  logger: true,
  ignoreTrailingSlash: true,
});

// Register Plugins
server.register(auditPlugin);
server.register(authPlugin);
server.register(cors, {
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
});
server.register(multipart, {
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  }
});

// Standard JSON Response Utility
server.decorateReply('sendSuccess', function (data: any, message = 'Operasi berhasil') {
  return this.send({
    success: true,
    data,
    message,
  });
});

server.decorateReply('sendError', function (message: string, code = 400) {
  return this.code(code).send({
    success: false,
    message,
  });
});

// Register Routes
server.register(clientRoutes, { prefix: '/api/clients' });
server.register(deedRoutes, { prefix: '/api/deeds' });
server.register(repertoriumRoutes, { prefix: '/api/repertorium' });
server.register(adminRoutes, { prefix: '/api/admin' });
server.register(billingRoutes, { prefix: '/api/billing' });
server.register(templateRoutes, { prefix: '/api/templates' });
server.register(authApiRoutes, { prefix: '/api/backauth' });
server.register(ocrRoutes, { prefix: '/api/ocr' });
server.register(auditRoutes, { prefix: '/api/audit' });
server.register(teamRoutes, { prefix: '/api/team' });
server.register(tenantRoutes, { prefix: '/api/tenant' });
server.register(tenantTeamRoutes, { prefix: '/api/tenant-teams' });
server.register(profileRoutes, { prefix: '/api/profile' });
server.register(appointmentRoutes, { prefix: '/api/appointments' });
server.register(googleRoutes, { prefix: '/api/google' });
server.register(subscriptionRoutes, { prefix: '/api/subscription' });
server.register(gdocsRoutes, { prefix: '/api/gdocs' });
server.register(notificationRoutes, { prefix: '/api/notifications' });

// Health Check
server.get('/', async (request, reply) => {
  return { 
    message: 'Welcome to NotarisOne Backend API',
    status: 'Running',
    documentation: '/health'
  };
});

server.get('/health', async (request, reply) => {
  return { status: 'OK', timestamp: new Date().toISOString() };
});

// Basic Error Handler
server.setErrorHandler((error: any, request, reply) => {
  // Log full error for debugging
  console.error(`[CRITICAL ERROR] ${request.method} ${request.url}:`, error);
  server.log.error(error);
  
  if (error.validation) {
    reply.status(422).send({
      success: false,
      message: 'Data tidak valid',
      errors: error.validation,
    });
    return;
  }

  // Handle BigInt serialization error specifically if possible
  const message = error.message?.includes('BigInt') 
    ? 'Gagal memproses data numerik besar (BigInt). Hubungi pengembang.'
    : 'Terjadi kesalahan sistem internal';

  reply.status(500).send({
    success: false,
    message,
  });
});

const start = async () => {
  try {
    const port = process.env.PORT ? parseInt(process.env.PORT) : 3001;
    await server.listen({ port, host: '0.0.0.0' });
    console.log(`Server NotarisOne backend berjalan di port ${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
