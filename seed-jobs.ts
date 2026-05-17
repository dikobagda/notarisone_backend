import * as dotenv from 'dotenv';
dotenv.config();
import { prisma } from './src/lib/prisma';

const MOCK_JOBS = [
  { name: 'Pembuatan Rekening Bank', price: 500000 },
  { name: 'Pendaftaran NIB', price: 1000000 },
  { name: 'Pengurusan SKDP', price: 1500000 },
  { name: 'Validasi Pajak', price: 500000 },
  { name: 'Balik Nama PBB', price: 750000 },
];

async function main() {
  const tenants = await prisma.tenant.findMany();
  for (const tenant of tenants) {
    console.log(`Seeding for tenant: ${tenant.name} (${tenant.id})`);
    
    // check if already seeded
    const count = await prisma.additionalJobMaster.count({
      where: { tenantId: tenant.id }
    });

    if (count > 0) {
       console.log(`- Already has ${count} jobs, skipping.`);
       continue;
    }

    for (const job of MOCK_JOBS) {
      await prisma.additionalJobMaster.create({
        data: {
          tenantId: tenant.id,
          name: job.name,
          price: job.price
        }
      });
    }
  }
  console.log('Seeding completed!');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
