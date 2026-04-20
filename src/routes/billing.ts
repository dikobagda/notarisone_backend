import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';

export default async function billingRoutes(fastify: FastifyInstance) {
  
  // GET all invoices for current tenant
  fastify.get('/invoices', async (request, reply) => {
    const tenantId = request.headers['x-tenant-id'] as string;
    
    const invoices = await prisma.invoice.findMany({
      where: { tenantId },
      include: {
        client: true,
        deed: true,
        items: true,
        payments: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    
    return { success: true, data: invoices };
  });

  // POST Create Invoice
  fastify.post('/invoices', async (request, reply) => {
    const tenantId = request.headers['x-tenant-id'] as string;
    
    const schema = z.object({
      clientId: z.string(),
      deedId: z.string().optional(),
      dueDate: z.string().optional(),
      items: z.array(z.object({
        description: z.string(),
        amount: z.number(),
        isTaxable: z.boolean(),
      })),
    });

    const body = schema.parse(request.body);
    
    // Calculate totals & taxes
    const subtotal = body.items.reduce((sum, item) => sum + item.amount, 0);
    const taxAmount = body.items
      .filter(i => i.isTaxable)
      .reduce((sum, item) => sum + (item.amount * 0.11), 0); // PPN 11%
    const totalAmount = subtotal + taxAmount;

    const invoice = await prisma.invoice.create({
      data: {
        tenantId,
        clientId: body.clientId,
        deedId: body.deedId,
        invoiceNumber: `INV/${new Date().getFullYear()}/${Math.floor(Math.random() * 1000)}`,
        subtotal,
        taxAmount,
        totalAmount,
        status: 'UNPAID',
        items: {
          create: body.items.map(item => ({
            description: item.description,
            unitPrice: item.amount,
            taxable: item.isTaxable,
          })),
        },
      },
    });

    return { success: true, data: invoice };
  });

  // POST Record Payment
  fastify.post('/payments', async (request, reply) => {
    const schema = z.object({
      invoiceId: z.string(),
      amount: z.number(),
      method: z.enum(['CASH', 'TRANSFER', 'GATEWAY']),
    });

    const body = schema.parse(request.body);

    const payment = await prisma.$transaction(async (tx: any) => {
      const p = await tx.payment.create({
        data: {
          invoiceId: body.invoiceId,
          amount: body.amount,
          method: body.method,
          status: 'SUCCESS',
        },
      });

      // Update invoice status based on total paid
      const invoice = await tx.invoice.findUnique({
        where: { id: body.invoiceId },
        include: { payments: true },
      });

      const previousPaid = invoice?.payments.reduce((sum: number, pay: any) => sum + Number(pay.amount), 0) || 0;
      const totalAmount = Number(invoice?.totalAmount || 0);
      
      if (previousPaid + body.amount > totalAmount) {
        throw new Error(`Pembayaran melebihi sisa tagihan. Sisa: ${totalAmount - previousPaid}`);
      }

      const totalPaid = previousPaid + body.amount;
      const newStatus = totalPaid >= totalAmount ? 'PAID' : 'PARTIAL';
      
      await tx.invoice.update({
        where: { id: body.invoiceId },
        data: { status: newStatus },
      });

      return p;
    });

    return { success: true, data: payment };
  });

  // GET Single Invoice
  fastify.get('/invoices/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenantId = request.headers['x-tenant-id'] as string;

    const invoice = await prisma.invoice.findFirst({
      where: { id, tenantId },
      include: {
        client: true,
        deed: true,
        items: true,
        payments: true
      },
    });

    if (!invoice) return reply.code(404).send({ success: false, message: 'Invoice tidak ditemukan' });
    return { success: true, data: invoice };
  });

  // PATCH Update Invoice
  fastify.patch('/invoices/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenantId = request.headers['x-tenant-id'] as string;

    const schema = z.object({
      clientId: z.string().optional(),
      deedId: z.string().optional().nullable(),
      dueDate: z.string().optional().nullable(),
      items: z.array(z.object({
        description: z.string(),
        amount: z.number(),
        isTaxable: z.boolean(),
      })).optional(),
    });

    const body = schema.parse(request.body);

    // Initial check
    const existing = await prisma.invoice.findFirst({ where: { id, tenantId } });
    if (!existing) return reply.code(404).send({ success: false, message: 'Invoice tidak ditemukan' });

    const result = await prisma.$transaction(async (tx: any) => {
      let subtotal = Number(existing.subtotal);
      let taxAmount = Number(existing.taxAmount);
      let totalAmount = Number(existing.totalAmount);

      if (body.items) {
        // Remove old items
        await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });

        // Create new items
        await tx.invoiceItem.createMany({
          data: body.items.map(item => ({
            invoiceId: id,
            description: item.description,
            unitPrice: item.amount,
            taxable: item.isTaxable,
          })),
        });

        // Recalculate
        subtotal = body.items.reduce((sum, item) => sum + item.amount, 0);
        taxAmount = body.items
          .filter(i => i.isTaxable)
          .reduce((sum, item) => sum + (item.amount * 0.11), 0);
        totalAmount = subtotal + taxAmount;
      }

      return await tx.invoice.update({
        where: { id },
        data: {
          clientId: body.clientId ?? undefined,
          deedId: body.deedId,
          subtotal,
          taxAmount,
          totalAmount,
        },
        include: { items: true }
      });
    });

    return { success: true, data: result };
  });

  // DELETE Invoice
  fastify.delete('/invoices/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenantId = request.headers['x-tenant-id'] as string;

    const existing = await prisma.invoice.findFirst({ where: { id, tenantId } });
    if (!existing) return reply.code(404).send({ success: false, message: 'Invoice tidak ditemukan' });

    await prisma.invoice.delete({ where: { id } });
    return { success: true, message: 'Invoice berhasil dihapus' };
  });
}
