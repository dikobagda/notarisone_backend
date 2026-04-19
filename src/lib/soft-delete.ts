import { Prisma } from '@prisma/client';

// Models that have a deletedAt field support soft-delete.
// Models NOT in this list will be excluded from the auto-filter.
const SOFT_DELETE_MODELS = new Set([
  'Tenant',
  'User',
  'Client',
  'Deed',
  'Appointment',
]);

export const softDeleteExtension = Prisma.defineExtension((client) => {
  return client.$extends({
    query: {
      $allModels: {
        async delete({ model, args }) {
          if (!SOFT_DELETE_MODELS.has(model)) {
            return (client as any)[model].delete(args);
          }
          return (client as any)[model].update({
            ...args,
            data: { deletedAt: new Date() },
          });
        },
        async deleteMany({ model, args }) {
          if (!SOFT_DELETE_MODELS.has(model)) {
            return (client as any)[model].deleteMany(args);
          }
          return (client as any)[model].updateMany({
            ...args,
            data: { deletedAt: new Date() },
          });
        },
        async findFirst({ model, args, query }) {
          if (SOFT_DELETE_MODELS.has(model)) {
            args.where = { ...args.where, deletedAt: null } as any;
          }
          return query(args);
        },
        async findMany({ model, args, query }) {
          if (SOFT_DELETE_MODELS.has(model)) {
            args.where = { ...args.where, deletedAt: null } as any;
          }
          return query(args);
        },
      },
    },
  });
});
