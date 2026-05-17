
import { prisma } from '../src/lib/prisma';
import fs from 'fs';

async function main() {
  const stakeholders = await prisma.deedStakeholder.findMany({
    include: {
      deed: {
        include: {
          client: true
        }
      }
    }
  });
  fs.writeFileSync('scratch/stakeholders.json', JSON.stringify(stakeholders, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
