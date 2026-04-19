import { FastifyPluginAsync } from 'fastify';
import { prisma } from '@/lib/prisma';
import { getSignedReadUrl } from '../lib/gcs';
import { z } from 'zod';

const clientSchema = z.object({
  name: z.string().min(1, 'Nama klien wajib diisi'),
  nik: z.string().min(16, 'NIK minimal 16 karakter').max(16),
  npwp: z.string().optional().or(z.literal('')),
  pob: z.string().optional().or(z.literal('')),
  dob: z.string().optional().or(z.literal('')),
  address: z.string().min(1, 'Alamat wajib diisi'),
  phone: z.string().min(1, 'Nomor WhatsApp wajib diisi'),
  email: z.string().email('Email tidak valid').min(1, 'Email wajib diisi'),
  ktpPath: z.string().optional().or(z.literal('')),
  npwpPath: z.string().optional().or(z.literal('')),
});

const clientRoutes: FastifyPluginAsync = async (fastify) => {
  // GET all clients for the current tenant
  fastify.get('/', async (request, reply) => {
    const { tenantId, search } = request.query as { tenantId: string, search?: string };
    
    if (!tenantId) return reply.sendError('Tenant ID wajib disertakan');

    const clients = await prisma.client.findMany({
      where: { 
        tenantId,
        deletedAt: null,
        OR: search ? [
          { name: { contains: search } },
          { nik: { contains: search } }
        ] : undefined
      },
      orderBy: { name: 'asc' },
      take: 20, // Limit for suggestions
    });

    return reply.sendSuccess(clients);
  });

  // GET a single client by ID
  fastify.get('/:id', async (request, reply) => {
    const rawId = (request.params as any).id;
    const rawTenantId = (request.query as any).tenantId;

    if (!rawId || !rawTenantId) {
      return reply.sendError('ID dan Tenant ID wajib disertakan');
    }

    const id = rawId.trim();
    const tenantId = rawTenantId.trim();

    // 1. Dapatkan data apa adanya dulu menggunakan findUnique (Primary Key)
    // Note: Kita bypass filter deletedAt/tenantId di level query untuk kemudahan debug
    const client = await prisma.client.findUnique({
      where: { id }
    });

    // 2. Jika secara fisik tidak ada di DB
    if (!client) {
      return reply.sendError(`Klien dengan ID ${id} tidak terdaftar di sistem`, 404);
    }

    // 3. Cek kepemilikan Tenant (Data Isolation)
    if (client.tenantId !== tenantId) {
      return reply.sendError(`Klien ditemukan, tapi bukan milik kantor Anda`, 403);
    }

    // 4. Cek apakah sudah terhapus (Soft Delete)
    if (client.deletedAt !== null) {
      return reply.sendError('Klien ini sudah dihapus dari sistem', 410);
    }

    // 5. Generate signed URLs for previews
    const [ktpUrl, npwpUrl] = await Promise.all([
      client.ktpPath ? getSignedReadUrl(client.ktpPath) : null,
      client.npwpPath ? getSignedReadUrl(client.npwpPath) : null
    ]);

    // Explicitly construct the response object to preserve virtual fields
    const clientData = {
      ...client,
      ktpUrl: ktpUrl || null,
      npwpUrl: npwpUrl || null
    };

    return reply.sendSuccess(clientData);
  });

  // POST create new client (Quick registration)
  fastify.post('/', async (request, reply) => {
    const { tenantId } = request.query as { tenantId: string };
    const result = clientSchema.safeParse(request.body);

    if (!result.success) {
      return reply.code(422).send({
        success: false,
        message: 'Data tidak valid',
        errors: result.error.format(),
      });
    }

    if (!tenantId) return reply.sendError('Tenant ID wajib disertakan');

    try {
      const client = await prisma.client.create({
        data: {
          ...result.data,
          tenantId,
          npwp: result.data.npwp || null,
          pob: result.data.pob || null,
          dob: result.data.dob || null,
          ktpPath: result.data.ktpPath || null,
          npwpPath: result.data.npwpPath || null,
        },
      });

      // Log Audit
      await fastify.logAudit({
        tenantId,
        action: 'CREATE_CLIENT',
        resource: 'Client',
        resourceId: client.id,
        payload: result.data,
      });

      return reply.sendSuccess(client, 'Klien baru berhasil didaftarkan');
    } catch (error: any) {
      if (error.code === 'P2002') {
        return reply.sendError('NIK sudah terdaftar di sistem');
      }
      throw error;
    }
  });

  // PATCH update client
  fastify.patch('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { tenantId } = request.query as { tenantId: string };
    const result = clientSchema.partial().safeParse(request.body);

    if (!result.success) {
      return reply.code(422).send({
        success: false,
        message: 'Data tidak valid',
        errors: result.error.format(),
      });
    }

    if (!tenantId) return reply.sendError('Tenant ID wajib disertakan');

    try {
      const existingClient = await prisma.client.findFirst({
        where: { id, tenantId, deletedAt: null }
      });

      if (!existingClient) {
        return reply.sendError('Klien tidak ditemukan', 404);
      }

      const updatedClient = await prisma.client.update({
        where: { id },
        data: {
          ...result.data,
          npwp: result.data.npwp !== undefined ? (result.data.npwp || null) : undefined,
          pob: result.data.pob !== undefined ? (result.data.pob || null) : undefined,
          dob: result.data.dob !== undefined ? (result.data.dob || null) : undefined,
          ktpPath: result.data.ktpPath !== undefined ? (result.data.ktpPath || null) : undefined,
          npwpPath: result.data.npwpPath !== undefined ? (result.data.npwpPath || null) : undefined,
        },
      });

      // Log Audit
      await fastify.logAudit({
        tenantId,
        action: 'UPDATE_CLIENT',
        resource: 'Client',
        resourceId: id,
        payload: result.data,
      });

      return reply.sendSuccess(updatedClient, 'Data klien berhasil diperbarui');
    } catch (error: any) {
      if (error.code === 'P2002') {
        return reply.sendError('NIK sudah digunakan oleh klien lain');
      }
      throw error;
    }
  });

  // DELETE a client (Soft delete)
  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { tenantId } = request.query as { tenantId: string };

    if (!tenantId) return reply.sendError('Tenant ID wajib disertakan');

    try {
      const client = await prisma.client.findFirst({
        where: { id, tenantId, deletedAt: null }
      });

      if (!client) {
        return reply.sendError('Klien tidak ditemukan atau sudah dihapus', 404);
      }

      // Soft delete using prisma.client.delete() which triggers the extension logic
      await prisma.client.delete({
        where: { id }
      });

      // Log Audit
      await fastify.logAudit({
        tenantId,
        action: 'DELETE_CLIENT',
        resource: 'Client',
        resourceId: id,
        payload: { name: client.name, nik: client.nik },
      });

      return reply.sendSuccess(null, 'Klien berhasil dihapus');
    } catch (error) {
      console.error('Delete client error:', error);
      return reply.sendError('Gagal menghapus klien');
    }
  });
};

export default clientRoutes;
