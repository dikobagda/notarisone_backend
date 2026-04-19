"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = billingRoutes;
const zod_1 = require("zod");
const prisma_1 = require("@/lib/prisma");
async function billingRoutes(fastify) {
    // GET all invoices for current tenant
    fastify.get('/invoices', async (request, reply) => {
        const tenantId = request.headers['x-tenant-id'];
        const invoices = await prisma_1.prisma.invoice.findMany({
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
        const tenantId = request.headers['x-tenant-id'];
        const schema = zod_1.z.object({
            clientId: zod_1.z.string(),
            deedId: zod_1.z.string().optional(),
            dueDate: zod_1.z.string().optional(),
            items: zod_1.z.array(zod_1.z.object({
                description: zod_1.z.string(),
                amount: zod_1.z.number(),
                isTaxable: zod_1.z.boolean(),
            })),
        });
        const body = schema.parse(request.body);
        // Calculate totals & taxes
        const subtotal = body.items.reduce((sum, item) => sum + item.amount, 0);
        const taxAmount = body.items
            .filter(i => i.isTaxable)
            .reduce((sum, item) => sum + (item.amount * 0.11), 0); // PPN 11%
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
            const totalPaid = (invoice?.payments.reduce((sum, pay) => sum + Number(pay.amount), 0) || 0) + body.amount;
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
//# sourceMappingURL=billing.js.map