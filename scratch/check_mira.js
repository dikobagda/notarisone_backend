
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

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
  console.log(`Sub-clients count: ${mira.subClients.length}`);
  
  const stakeholders = mira.deeds.flatMap(d => d.stakeholders);
  console.log(`Stakeholders in Mira's deeds: ${stakeholders.length}`);
  stakeholders.forEach(s => {
    console.log(`- ${s.name} (Role: ${s.role}, Client linked: ${s.clientId ? 'Yes' : 'No'})`);
  });

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
  candidates.forEach(c => {
    console.log(`- ${c.name} (ID: ${c.id}, ParentID: ${c.parentId})`);
  });
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
