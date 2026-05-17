import { prisma } from './src/lib/prisma';

async function main() {
  try {
    const user = await prisma.user.findFirst();
    console.log("Success:", user?.email);
  } catch(e) {
    console.error("Prisma Query Error:", e);
  } finally {
    await prisma.$disconnect();
  }
}
main();
