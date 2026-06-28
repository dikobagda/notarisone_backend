"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = billingRoutes;
const zod_1 = require("zod");
const prisma_1 = require("../lib/prisma");
async function billingRoutes(fastify) {
    // GET all invoices for current tenant
    fastify.get('/invoices', async (request, reply) => {
        const tenantId = request.headers['x-tenant-id'] || request.query.tenantId;
        const invoices = await prisma_1.prisma.invoice.findMany({
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
        const tenantId = request.headers['x-tenant-id'];
        const schema = zod_1.z.object({
            clientId: zod_1.z.string(),
            deedId: zod_1.z.string().optional(),
            dueDate: zod_1.z.string().optional(),
            items: zod_1.z.array(zod_1.z.object({
                description: zod_1.z.string(),
                amount: zod_1.z.number(),
                isTaxable: zod_1.z.boolean(),
                taxType: zod_1.z.string().optional(),
                taxRate: zod_1.z.number().optional(),
            })),
        });
        const body = schema.parse(request.body);
        // Calculate totals & taxes
        const subtotal = body.items.reduce((sum, item) => sum + item.amount, 0);
        const taxAmount = body.items.reduce((sum, item) => {
            const rate = item.taxRate !== undefined ? item.taxRate : (item.isTaxable ? 0.11 : 0.0);
            return sum + (item.amount * rate);
        }, 0);
        const totalAmount = subtotal + taxAmount;
        const invoice = await prisma_1.prisma.invoice.create({
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
                        taxType: item.taxType || (item.isTaxable ? 'PPN' : 'NONE'),
                        taxRate: item.taxRate !== undefined ? item.taxRate : (item.isTaxable ? 0.11 : 0.0),
                    })),
                },
            },
        });
        return { success: true, data: invoice };
    });
    // POST Record Payment
    fastify.post('/payments', async (request, reply) => {
        const schema = zod_1.z.object({
            invoiceId: zod_1.z.string(),
            amount: zod_1.z.number(),
            method: zod_1.z.enum(['CASH', 'TRANSFER', 'GATEWAY']),
        });
        const body = schema.parse(request.body);
        const payment = await prisma_1.prisma.$transaction(async (tx) => {
            // ✅ Fetch invoice BEFORE creating payment to avoid double-counting
            const invoice = await tx.invoice.findUnique({
                where: { id: body.invoiceId },
                include: { payments: true },
            });
            if (!invoice)
                throw new Error('Invoice tidak ditemukan');
            const previousPaid = invoice.payments.reduce((sum, pay) => sum + Number(pay.amount), 0);
            const totalAmount = Number(invoice.totalAmount);
            const remaining = totalAmount - previousPaid;
            // Allow a small floating-point tolerance (1 rupiah)
            if (body.amount > remaining + 1) {
                throw new Error(`Pembayaran melebihi sisa tagihan. Sisa: ${remaining}`);
            }
            // Clamp to exact remaining to avoid floating-point overshoot
            const actualAmount = Math.min(body.amount, remaining);
            const p = await tx.payment.create({
                data: {
                    invoiceId: body.invoiceId,
                    amount: actualAmount,
                    method: body.method,
                    status: 'SUCCESS',
                },
            });
            const totalPaid = previousPaid + actualAmount;
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
        const { id } = request.params;
        const tenantId = request.headers['x-tenant-id'];
        const invoice = await prisma_1.prisma.invoice.findFirst({
            where: { id, tenantId },
            include: {
                client: true,
                deed: true,
                items: true,
                payments: true
            },
        });
        if (!invoice)
            return reply.code(404).send({ success: false, message: 'Invoice tidak ditemukan' });
        return { success: true, data: invoice };
    });
    // PATCH Update Invoice
    fastify.patch('/invoices/:id', async (request, reply) => {
        const { id } = request.params;
        const tenantId = request.headers['x-tenant-id'];
        const schema = zod_1.z.object({
            clientId: zod_1.z.string().optional(),
            deedId: zod_1.z.string().optional().nullable(),
            dueDate: zod_1.z.string().optional().nullable(),
            items: zod_1.z.array(zod_1.z.object({
                description: zod_1.z.string(),
                amount: zod_1.z.number(),
                isTaxable: zod_1.z.boolean(),
                taxType: zod_1.z.string().optional(),
                taxRate: zod_1.z.number().optional(),
            })).optional(),
        });
        const body = schema.parse(request.body);
        // Initial check
        const existing = await prisma_1.prisma.invoice.findFirst({ where: { id, tenantId } });
        if (!existing)
            return reply.code(404).send({ success: false, message: 'Invoice tidak ditemukan' });
        const result = await prisma_1.prisma.$transaction(async (tx) => {
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
                        taxType: item.taxType || (item.isTaxable ? 'PPN' : 'NONE'),
                        taxRate: item.taxRate !== undefined ? item.taxRate : (item.isTaxable ? 0.11 : 0.0),
                    })),
                });
                // Recalculate
                subtotal = body.items.reduce((sum, item) => sum + item.amount, 0);
                taxAmount = body.items.reduce((sum, item) => {
                    const rate = item.taxRate !== undefined ? item.taxRate : (item.isTaxable ? 0.11 : 0.0);
                    return sum + (item.amount * rate);
                }, 0);
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
        const { id } = request.params;
        const tenantId = request.headers['x-tenant-id'];
        const existing = await prisma_1.prisma.invoice.findFirst({ where: { id, tenantId } });
        if (!existing)
            return reply.code(404).send({ success: false, message: 'Invoice tidak ditemukan' });
        await prisma_1.prisma.invoice.delete({ where: { id } });
        return { success: true, message: 'Invoice berhasil dihapus' };
    });
}
//# sourceMappingURL=billing.js.map