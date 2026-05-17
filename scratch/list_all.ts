
import { prisma } from '../src/lib/prisma';
import fs from 'fs';

async function main() {
  const all = await prisma.client.findMany({
    select: { id: true, name: true, nik: true },
    take: 100
  });
  fs.writeFileSync('scratch/all_clients.json', JSON.stringify(all, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
