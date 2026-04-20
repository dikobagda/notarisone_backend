import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const versions = await prisma.deedVersion.findMany({ 
    orderBy: { createdAt: 'desc' }, 
    take: 5 
  });
  console.log("Recent versions:");
  versions.forEach(v => {
    console.log(`Deed: ${v.deedId}, V: ${v.versionNumber}, GcsPath: ${v.gcsPath}, DriveId: ${v.googleDriveFileId}`);
  });
}
main().catch(console.error).finally(() => prisma.$disconnect());
