"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
const client_1 = require("@prisma/client");
const adapter_mariadb_1 = require("@prisma/adapter-mariadb");
const soft_delete_1 = require("./soft-delete");
const globalForPrisma = global;
let basePrisma;
if (globalForPrisma.prisma) {
    basePrisma = globalForPrisma.prisma;
}
else {
    const rawUrl = process.env.DATABASE_URL || '';
    // Ensure we use mariadb:// for the adapter, and trim any potential whitespace
    const connectionString = rawUrl.trim().replace(/^mysql:\/\//, 'mariadb://');
    const adapter = new adapter_mariadb_1.PrismaMariaDb(connectionString);
    basePrisma = new client_1.PrismaClient({
        adapter,
        log: ['query', 'error', 'warn'],
    });
    if (process.env.NODE_ENV !== 'production') {
        globalForPrisma.prisma = basePrisma;
    }
}
exports.prisma = basePrisma.$extends(soft_delete_1.softDeleteExtension);
//# sourceMappingURL=prisma.js.map