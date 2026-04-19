"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.softDeleteExtension = void 0;
const client_1 = require("@prisma/client");
// Models that have a deletedAt field support soft-delete.
// Models NOT in this list will be excluded from the auto-filter.
const SOFT_DELETE_MODELS = new Set([
    'Tenant',
    'User',
    'Client',
    'Deed',
    'Appointment',
]);
exports.softDeleteExtension = client_1.Prisma.defineExtension((client) => {
    return client.$extends({
        query: {
            $allModels: {
                async delete({ model, args }) {
                    if (!SOFT_DELETE_MODELS.has(model)) {
                        return client[model].delete(args);
                    }
                    return client[model].update({
                        ...args,
                        data: { deletedAt: new Date() },
                    });
                },
                async deleteMany({ model, args }) {
                    if (!SOFT_DELETE_MODELS.has(model)) {
                        return client[model].deleteMany(args);
                    }
                    return client[model].updateMany({
                        ...args,
                        data: { deletedAt: new Date() },
                    });
                },
                async findFirst({ model, args, query }) {
                    if (SOFT_DELETE_MODELS.has(model)) {
                        args.where = { ...args.where, deletedAt: null };
                    }
                    return query(args);
                },
                async findMany({ model, args, query }) {
                    if (SOFT_DELETE_MODELS.has(model)) {
                        args.where = { ...args.where, deletedAt: null };
                    }
                    return query(args);
                },
            },
        },
    });
});
//# sourceMappingURL=soft-delete.js.map