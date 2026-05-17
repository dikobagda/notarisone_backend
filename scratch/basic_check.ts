
import { prisma } from '../src/lib/prisma';
import fs from 'fs';

async function main() {
  let output = '';
  
  // Try exact match to avoid collation issues with LIKE
  const mira = await prisma.client.findFirst({
    where: { name: 'Mira Setiawan' }
  });
  output += `Mira: ${JSON.stringify(mira, null, 2)}\n`;

  if (mira) {
    const budiman = await prisma.client.findFirst({ where: { name: 'Budiman' } });
    const poniman = await prisma.client.findFirst({ where: { name: 'Poniman' } });
    const dasiman = await prisma.client.findFirst({ where: { name: 'Dasiman' } });
    
    const candidates = [budiman, poniman, dasiman].filter(Boolean);
    output += `Candidates: ${JSON.stringify(candidates.map(c => c.name), null, 2)}\n`;
    
    for (const c of candidates) {
      if (c && !c.parentId) {
         output += `Linking ${c.name} to Mira...\n`;
         await prisma.client.update({
           where: { id: c.id },
           data: { parentId: mira.id }
         });
         output += `Linked ${c.name}!\n`;
      }
    }
  } else {
    output += `Mira Setiawan not found with exact match. Try checking all clients.\n`;
    const all = await prisma.client.findMany({ select: { name: true }, take: 10 });
    output += `First 10 clients: ${JSON.stringify(all, null, 2)}\n`;
  }
  
  fs.writeFileSync('scratch/check_output.txt', output);
  console.log('Done');
}

main().catch(e => {
  fs.writeFileSync('scratch/check_output.txt', e.stack || e.message);
  console.error(e);
}).finally(() => prisma.$disconnect());
