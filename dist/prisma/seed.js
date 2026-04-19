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
    console.log('Seeding database...');
    // 0. Create Super Admin
    const admin = await prisma.adminUser.upsert({
        where: { email: 'admin@notarisone.id' },
        update: {},
        create: {
            email: 'admin@notarisone.id',
            password: 'password123', // In prod, this must be hashed
            name: 'Super Admin NotarisOne',
            role: 'SUPERADMIN',
        },
    });
    console.log(`Created admin user: ${admin.email}`);
    // 1. Create Tenant
    const tenant = await prisma.tenant.upsert({
        where: { subdomain: 'ahmad' },
        update: {},
        create: {
            name: 'Kantor Notaris Ahmad, S.H., M.Kn.',
            subdomain: 'ahmad',
            address: 'Jl. Jenderal Sudirman No. 123, Jakarta Selatan',
            subscription: 'ENTERPRISE',
        },
    });
    console.log(`Created tenant: ${tenant.name} (${tenant.id})`);
    // 2. Create User
    const hashedPassword = await bcryptjs_1.default.hash('ahmad123', 10);
    const user = await prisma.user.upsert({
        where: { email: 'ahmad@notarisone.com' },
        update: {},
        create: {
            email: 'ahmad@notarisone.com',
            name: 'Ahmad Muzaki',
            role: 'NOTARIS',
            tenantId: tenant.id,
            password: hashedPassword,
        },
    });
    console.log(`Created user: ${user.name}`);
    // 3. Create initial clients
    const client1 = await prisma.client.create({
        data: {
            name: 'Budi Santoso',
            nik: '3171012345678901',
            email: 'budi.santoso@email.com',
            phone: '08123456789',
            address: 'Jl. Melati No. 5, Jakarta',
            tenantId: tenant.id,
        },
    });
    const client2 = await prisma.client.create({
        data: {
            name: 'Siti Aminah',
            nik: '3271012345678902',
            email: 'siti.aminah@email.com',
            phone: '08129876543',
            address: 'Jl. Mawar No. 10, Bandung',
            tenantId: tenant.id,
        },
    });
    console.log('Created initial clients');
    // 4. Create a sample Deed (Akta)
    await prisma.deed.create({
        data: {
            title: 'Akta Pendirian PT Maju Jaya',
            type: 'PENDIRIAN_PT',
            status: 'DRAFT',
            tenant: { connect: { id: tenant.id } },
            client: { connect: { id: client1.id } },
            createdBy: { connect: { id: user.id } },
        },
    });
    console.log('Created sample deed');
    console.log('Seeding completed successfully.');
}
main()
    .catch((e) => {
    console.error(e);
    process.exit(1);
})
    .finally(async () => {
    // Adapter handle cleanup internally but good to close client
    await prisma.$disconnect();
});
//# sourceMappingURL=seed.js.map