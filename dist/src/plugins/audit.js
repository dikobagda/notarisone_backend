"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_plugin_1 = __importDefault(require("fastify-plugin"));
const prisma_1 = require("@/lib/prisma");
const auditPlugin = async (fastify) => {
    fastify.decorate('logAudit', async (data) => {
        try {
            await prisma_1.prisma.auditLog.create({
                data: {
                    tenantId: data.tenantId,
                    userId: data.userId,
                    action: data.action,
                    resource: data.resource,
                    resourceId: data.resourceId,
                    payload: data.payload,
                    ipAddress: '', // Will be updated if req is available
                },
            });
        }
        catch (error) {
            fastify.log.error(error, 'Audit Log Error:');
        }
    });
};
exports.default = (0, fastify_plugin_1.default)(auditPlugin);
//# sourceMappingURL=audit.js.map