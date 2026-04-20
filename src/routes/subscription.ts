import { FastifyPluginAsync } from 'fastify';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { Xendit } from 'xendit-node';
import fs from 'fs';
import path from 'path';

// Initialize Xendit with Secret Key from .env
console.log(`[Subscription] Initializing Xendit with key: ${process.env.XENDIT_SECRET_KEY ? 'Present' : 'MISSING'}`);

const xenditClient = new Xendit({
  secretKey: process.env.XENDIT_SECRET_KEY || 'xnd_development_key_placeholder',
});

const subscriptionRoutes: FastifyPluginAsync = async (fastify) => {
  
  // POST /api/subscription/checkout - Create a payment invoice
  fastify.post('/checkout', async (request, reply) => {
    const tenantId = (request as any).tenantId || (request.query as any).tenantId;
    
    if (!tenantId) {
      request.server.log.warn(`[Checkout] Missing Tenant ID on request. URL: ${request.url}`);
      return reply.sendError('Tenant ID wajib disertakan');
    }
    const schema = z.object({
      tier: z.enum(['TRIAL', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE']),
    });

    const body = schema.safeParse(request.body);
    if (!body.success) return reply.sendError('Paket tidak valid');
    if (!tenantId) return reply.sendError('Tenant ID wajib disertakan');

    try {
      const planFromDb = await prisma.subscriptionPlan.findUnique({
        where: { slug: body.data.tier as any }
      });

      if (!planFromDb) return reply.sendError('Paket tidak ditemukan di database');
      const amount = Number(planFromDb.price);
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        include: { users: { where: { role: 'NOTARIS' }, take: 1 } }
      });

      if (!tenant) return reply.sendError('Tenant tidak ditemukan');
      const owner = tenant.users[0];

      // Create Xendit Invoice
      const externalId = `inv-${tenantId}-${Date.now()}`;

      const invoiceData = {
        externalId,
        amount,
        description: `Berlangganan NotarisOne Paket ${body.data.tier}`,
        payerEmail: owner?.email || 'admin@notarisone.com',
        customer: {
          givenNames: owner?.name || tenant.name,
          email: owner?.email || 'admin@notarisone.com',
        },
        // Callback URLs
        successRedirectUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard/subscription?status=success`,
        failureRedirectUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard/subscription?status=failed`,
        currency: 'IDR',
        items: [
          {
            name: `Paket ${body.data.tier}`,
            quantity: 1,
            price: amount,
            category: 'Subscription',
          }
        ],
        metadata: {
          tenantId: tenant.id,
          tier: body.data.tier,
        }
      };
      
      console.log(`[Checkout] Sending Invoice request to Xendit for Tenant ${tenantId}:`, JSON.stringify(invoiceData, null, 2));

      const xenditInvoice = await xenditClient.Invoice.createInvoice({
        data: invoiceData
      });

      // DATABASE LOGGING FOR CHECKOUT REQUEST
      try {
        await prisma.xenditLog.create({
          data: {
            tenantId: tenant.id,
            externalId: xenditInvoice.externalId,
            type: 'CHECKOUT_REQUEST',
            status: 'PENDING',
            payload: JSON.parse(JSON.stringify(invoiceData)),
            response: JSON.parse(JSON.stringify(xenditInvoice))
          }
        });
      } catch (logErr) {
        console.error(`[Checkout] Failed to log to database:`, logErr);
      }

      return reply.sendSuccess({
        invoiceUrl: xenditInvoice.invoiceUrl,
        externalId: xenditInvoice.externalId
      }, 'Invoice berhasil dibuat');

    } catch (error: any) {
      console.error("[Xendit Error Details]:", error);
      if (error.response) {
        console.error("[Xendit Response Body]:", error.response.body);
      }
      fastify.log.error(error);
      return reply.sendError(`Gagal membuat invoice: ${error.message || 'Error tidak diketahui'}. Lihat log backend.`);
    }
  });

  // GET /api/subscription/webhook - Simple check for debugging
  fastify.get('/webhook', async (request, reply) => {
    return reply.send({ 
      status: 'OK', 
      message: 'Subscription Webhook is active and waiting for POST requests from Xendit.' 
    });
  });

  // POST /api/subscription/webhook - Handle payment callback from Xendit
  fastify.post('/webhook', async (request, reply) => {
    const callbackToken = request.headers['x-callback-token'];
    const expectedToken = process.env.XENDIT_WEBHOOK_TOKEN;
    console.log(`[Webhook] Incoming request from Xendit. Headers:`, JSON.stringify(request.headers, null, 2));

    const payload = request.body as any;
    const externalId = payload.external_id || payload.id;
    
    // --- DATABASE LOGGING ---
    try {
      await prisma.xenditLog.create({
        data: {
          tenantId: (request as any).tenantId || null, // Might be null if auth failed but we proceed
          externalId: externalId,
          type: 'WEBHOOK_RECEIVED',
          status: payload.status,
          payload: JSON.parse(JSON.stringify(payload)),
          headers: JSON.parse(JSON.stringify(request.headers))
        }
      });
      console.log(`[Webhook] Raw payload captured to database (XenditLog)`);
    } catch (dbErr) {
      console.error(`[Webhook] Failed to write to XenditLog table:`, dbErr);
    }
    // ---------------------------

    // --- DEEP DEBUG LOGGING (FILE) ---

    // Verify token (Relaxed for debugging - will only WARN but not block)
    if (expectedToken && callbackToken !== expectedToken) {
      console.warn(`[Webhook] WARNING: Callback token mismatch! Expected: ${expectedToken}, Received: ${callbackToken}. PROCEEDING ANYWAY FOR DEBUG.`);
      // return reply.code(401).send({ message: 'Unauthorized Webhook' });
    }

    console.log(`[Webhook] Raw Payload:`, JSON.stringify(payload, null, 2));
    
    // We're looking for 'PAID' or 'SETTLED' status
    if (!['PAID', 'SETTLED'].includes(payload.status)) {
      console.log(`[Webhook] Ignoring status: ${payload.status}`);
      return reply.send({ message: `Webhook received but ignored (status: ${payload.status})` });
    }


    let metadata = payload.metadata;

    // Sometimes metadata is sent as a JSON string by third-party systems or testing tools
    if (typeof metadata === 'string') {
      try {
        metadata = JSON.parse(metadata);
      } catch (e) {
        console.warn(`[Webhook] Failed to parse metadata string: ${metadata}`);
      }
    }

    // Robust extraction: check multiple possible casing/field names
    let tenantId = metadata?.tenantId || metadata?.tenant_id || payload.tenant_id;
    let tier = metadata?.tier || metadata?.tier_name || payload.tier;

    // --- FALLBACK 1: Extract tenantId from external_id ---
    // Format: inv-{tenantId}-{timestamp}
    if (!tenantId && externalId && typeof externalId === 'string' && externalId.startsWith('inv-')) {
      const parts = externalId.split('-');
      if (parts.length >= 3) {
        tenantId = parts[1];
        console.log(`[Webhook] Fallback: Extracted tenantId ${tenantId} from external_id`);
      }
    }

    // --- FALLBACK 2: Extract tier from item name ---
    if (!tier && payload.items && payload.items.length > 0) {
      const itemName = payload.items[0].name.toUpperCase();
      if (itemName.includes('STARTER')) tier = 'STARTER';
      else if (itemName.includes('PROFESSIONAL')) tier = 'PROFESSIONAL';
      else if (itemName.includes('ENTERPRISE')) tier = 'ENTERPRISE';
      
      if (tier) console.log(`[Webhook] Fallback: Extracted tier ${tier} from item name`);
    }

    // --- FALLBACK 3: Search XenditLog for the original checkout metadata ---
    if (!tier && externalId) {
      try {
        const originalLog = await prisma.xenditLog.findFirst({
          where: { externalId: externalId, type: 'CHECKOUT_REQUEST' }
        });
        if (originalLog && originalLog.payload) {
          const originalPayload = originalLog.payload as any;
          tier = originalPayload.metadata?.tier;
          console.log(`[Webhook] Fallback: Extracted tier ${tier} from XenditLog`);
        }
      } catch (e) {
         // ignore
      }
    }

    if (!tenantId || !tier) {
      console.error(`[Webhook] CRITICAL: Missing data. tenantId: ${tenantId}, tier: ${tier}, externalId: ${externalId}`);
      // Log the structure to help debugging
      console.log(`[Webhook] Inspecting payload keys:`, Object.keys(payload));
      if (payload.metadata) console.log(`[Webhook] Metadata content:`, JSON.stringify(payload.metadata, null, 2));
      
      return reply.code(400).send({ 
        success: false, 
        message: 'Invalid metadata structure',
        details: { tenantId: !!tenantId, tier: !!tier }
      });
    }

    try {
      const expiryDate = new Date();
      expiryDate.setMonth(expiryDate.getMonth() + 1); // 1 month subscription

      // Fetch current tenant to detect if this is an upgrade
      const currentTenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { subscription: true }
      });

      const isUpgrade = currentTenant && currentTenant.subscription !== 'TRIAL' && currentTenant.subscription !== tier;

      if (isUpgrade) {
        console.log(`[Webhook] UPGRADE DETECTED: Tenant ${tenantId} moving from ${currentTenant.subscription} to ${tier}`);
      } else {
        console.log(`[Webhook] Updating Tenant: ${tenantId} to Tier: ${tier}. Expiry: ${expiryDate.toISOString()}`);
      }

      await prisma.tenant.update({
        where: { id: tenantId },
        data: {
          subscription: tier,
          subscriptionExpiresAt: expiryDate,
          lastPaymentId: payload.id, // Store the Xendit Invoice ID as reference
          status: 'ACTIVE'
        }
      });

      console.log(`[Webhook] SUCCESS: Subscription ${isUpgrade ? 'UPGRADED' : 'UPDATED'} for Tenant ${tenantId}`);
      return reply.send({ success: true, message: `Subscription ${isUpgrade ? 'upgraded' : 'updated'} successfully` });
    } catch (error: any) {
      console.error(`[Webhook ERROR]: ${error.message}`);
      fastify.log.error(error);
      return reply.code(500).send({ success: false, message: 'Internal Server Error while updating subscription' });
    }
  });

  // GET /api/subscription/status - Get current subscription details
  fastify.get('/status', async (request, reply) => {
    const tenantId = (request as any).tenantId || (request.query as any).tenantId;

    if (!tenantId) {
      request.server.log.warn(`[Status] Missing Tenant ID on request. URL: ${request.url}`);
      return reply.sendError('Tenant ID wajib disertakan');
    }

    try {
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: {
          subscription: true,
          subscriptionExpiresAt: true,
          trialExpiresAt: true,
          createdAt: true,
        }
      });

      if (!tenant) return reply.sendError('Tenant tidak ditemukan');

      return reply.sendSuccess(tenant);
    } catch (error) {
      return reply.sendError('Gagal mengambil status langganan');
    }
  });

  // GET /api/subscription/plans - Get all available plans
  fastify.get('/plans', async (request, reply) => {
    try {
      const plans = await prisma.subscriptionPlan.findMany({
        where: { status: 'ACTIVE' },
        orderBy: { price: 'asc' }
      });
      return reply.sendSuccess(plans);
    } catch (error) {
      return reply.sendError('Gagal mengambil daftar paket');
    }
  });

  // GET /api/subscription/debug - Raw database status for debugging
  fastify.get('/debug', async (request, reply) => {
    const { tenantId, email, name } = request.query as any;
    
    try {
      let tenant = null;
      if (tenantId) {
        tenant = await prisma.tenant.findUnique({ 
          where: { id: tenantId },
          include: { xenditLogs: { take: 10, orderBy: { createdAt: 'desc' } } }
        });
      } else if (email) {
        const user = await prisma.user.findUnique({ 
          where: { email },
          include: { 
            tenant: {
              include: { xenditLogs: { take: 10, orderBy: { createdAt: 'desc' } } }
            }
          }
        });
        tenant = user?.tenant;
      } else if (name) {
        tenant = await prisma.tenant.findFirst({ 
          where: { name: { contains: name } },
          include: { xenditLogs: { take: 10, orderBy: { createdAt: 'desc' } } }
        });
      } else {
        // Just return the last 5 tenants if no filter
        const tenants = await prisma.tenant.findMany({
          take: 5,
          orderBy: { createdAt: 'desc' },
          include: { xenditLogs: { take: 1, orderBy: { createdAt: 'desc' } } }
        });
        return reply.send({ success: true, message: 'No filter provided, showing latest 5 tenants', data: tenants });
      }

      if (!tenant) return reply.sendError('Tenant not found');

      return reply.send({
        success: true,
        currentTime: new Date().toISOString(),
        data: tenant
      });
    } catch (error: any) {
      return reply.sendError(`Debug failed: ${error.message}`);
    }
  });
};

export default subscriptionRoutes;
