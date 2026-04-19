"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
const client_1 = require("@prisma/client");
const adapter_mariadb_1 = require("@prisma/adapter-mariadb");
const soft_delete_1 = require("./soft-delete");
const globalForPrisma = global;
const adapter = new adapter_mariadb_1.PrismaMariaDb(process.env.DATABASE_URL || '');
const basePrisma = globalForPrisma.prisma ||
    new client_1.PrismaClient({
        adapter,
        log: ['query', 'error', 'warn'],
    });
exports.prisma = basePrisma.$extends(soft_delete_1.softDeleteExtension);
if (process.env.NODE_ENV !== 'production')
    globalForPrisma.prisma = basePrisma;
//# sourceMappingURL=prisma.js.map