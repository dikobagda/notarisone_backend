
import { prisma } from '../src/lib/prisma';

async function main() {
  const mira = await prisma.client.findFirst({
    where: { name: { contains: 'Mira Setiawan' } },
    include: {
      subClients: true,
      serviceRequests: true,
      deeds: {
        include: {
          stakeholders: {
            include: {
              client: true
            }
          }
        }
      }
    }
  });

  if (!mira) {
    console.log("Mira Setiawan not found");
    return;
  }

  console.log(`Found Mira Setiawan (ID: ${mira.id})`);
  
  // Find other clients with similar names or likely candidates
  const candidates = await prisma.client.findMany({
    where: {
      OR: [
        { name: { contains: 'Budiman' } },
        { name: { contains: 'Poniman' } },
        { name: { contains: 'Dasiman' } }
      ]
    }
  });

  console.log(`Potential candidates found: ${candidates.length}`);
  for (const c of candidates) {
    console.log(`- ${c.name} (ID: ${c.id}, ParentID: ${c.parentId})`);
    if (!c.parentId) {
      console.log(`  Linking ${c.name} to Mira Setiawan...`);
      await prisma.client.update({
        where: { id: c.id },
        data: { parentId: mira.id }
      });
      console.log(`  Linked!`);
    }
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
