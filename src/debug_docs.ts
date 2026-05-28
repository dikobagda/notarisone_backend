import 'dotenv/config';
import { prisma } from './lib/prisma';

async function main() {
  console.log("=== DEBUG DOCK === ");
  const tenants = await prisma.tenant.findMany();
  console.log("Total tenants:", tenants.length);
  for (const tenant of tenants) {
    const docCount = await prisma.requiredDocumentMaster.count({
      where: { tenantId: tenant.id }
    });
    console.log(`Tenant: ${tenant.name} (${tenant.id}) has ${docCount} documents.`);
    if (docCount > 0) {
      const docs = await prisma.requiredDocumentMaster.findMany({
        where: { tenantId: tenant.id }
      });
      console.log("Documents:", docs.map((d: any) => ({ id: d.id, name: d.name, category: d.category, isRequired: d.isRequired })));
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
