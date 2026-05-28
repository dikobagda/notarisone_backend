const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { id: 'SYSTEM' }
    });
    console.log("Current Database SYSTEM Settings:", JSON.stringify({
      ...setting,
      logoUrl: setting?.logoUrl ? (setting.logoUrl.startsWith("data:") ? setting.logoUrl.substring(0, 100) + "... (Base64)" : setting.logoUrl) : null
    }, null, 2));
  } catch (error) {
    console.error("Error reading database system settings:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
