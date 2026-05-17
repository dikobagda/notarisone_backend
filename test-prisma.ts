import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  try {
    const newRequest = await prisma.serviceRequest.create({
      data: {
        tenantId: 'cmo5pfwzw0007fypxangt02sa',
        clientName: 'Test Name',
        clientPhone: '0812345678',
        serviceCategory: 'NON_AKTA',
        documents: {},
        additionalJobs: '',
        estimatedCost: 1000000,
        status: 'PENDING'
      }
    });
    console.log("Success:", newRequest);
  } catch (error) {
    console.error("Prisma Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}
main();
