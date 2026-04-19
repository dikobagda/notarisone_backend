"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const adapter_mariadb_1 = require("@prisma/adapter-mariadb");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
require("dotenv/config");
const adapter = new adapter_mariadb_1.PrismaMariaDb(process.env.DATABASE_URL || '');
const prisma = new client_1.PrismaClient({ adapter });
async function main() {
    console.log('Seeding authentication data...');
    // 1. Create a Default Tenant
    const tenant = await prisma.tenant.upsert({
        where: { id: 'default-tenant-id' },
        update: {},
        create: {
            id: 'default-tenant-id',
            name: 'Kantor Notaris Test',
            address: 'Jl. Merdeka No. 1, Jakarta',
            status: 'TRIAL',
            subscription: 'STARTER',
        },
    });
    // 2. Create a Notary User
    const hashedPassword = await bcryptjs_1.default.hash('notaris123', 10);
    const user = await prisma.user.upsert({
        where: { email: 'notaris@test.com' },
        update: {
            password: hashedPassword,
        },
        create: {
            email: 'notaris@test.com',
            password: hashedPassword,
            name: 'Budi Notaris',
            role: 'NOTARIS',
            tenantId: tenant.id,
        },
    });
    console.log('Seed data created successfully!');
    console.log('User: notaris@test.com');
    console.log('Pass: notaris123');
}
main()
    .catch((e) => {
    console.error(e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=seed-auth.js.map