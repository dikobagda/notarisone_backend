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

      // Update invoice status if fully paid
      const invoice = await tx.invoice.findUnique({
        where: { id: body.invoiceId },
        include: { payments: true },
      });

      const totalPaid = (invoice?.payments.reduce((sum: number, pay: any) => sum + Number(pay.amount), 0) || 0) + body.amount;
      
      if (totalPaid >= Number(invoice?.totalAmount)) {
        await tx.invoice.update({
          where: { id: body.invoiceId },
          data: { status: 'PAID' },
        });
      }

      return p;
    });

    return { success: true, data: payment };
  });
}
