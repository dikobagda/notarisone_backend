"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_plugin_1 = __importDefault(require("fastify-plugin"));
const prisma_1 = require("@/lib/prisma");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const JWT_SECRET = process.env.NEXTAUTH_SECRET || "notarisone_local_secret_key";
const authPlugin = async (fastify) => {
    // Initialize custom request properties
    fastify.decorateRequest('tenantId', '');
    fastify.decorateRequest('userId', '');
    fastify.decorateRequest('role', '');
    fastify.addHook('preHandler', async (request, reply) => {
        // 1. Skip auth for public routes and auth routes
        if (request.url === '/health' ||
            request.url.startsWith('/public') ||
            request.url.startsWith('/api/auth') ||
            request.url.startsWith('/api/ocr') ||
            request.url.startsWith('/api/backauth') ||
            request.url.startsWith('/api/subscription/plans') ||
            request.url.startsWith('/api/subscription/webhook') ||
            request.url.startsWith('/api/google/save-tokens')) {
            return;
        }
        const authHeader = request.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return reply.code(401).send({ error: 'Missing or invalid Authorization header' });
        }
        const token = authHeader.split(' ')[1];
        try {
            // 2. Verify NextAuth or Local Login JWT
            const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
            // 3. User verification against local database
            const userId = decoded.sub;
            const user = await prisma_1.prisma.user.findUnique({
                where: { id: userId }
            });
            if (!user) {
                return reply.code(403).send({ error: 'User tidak ditemukan' });
            }
            // 4. Attach session data to request
            request.tenantId = user.tenantId;
            request.userId = user.id;
            request.role = user.role;
        }
        catch (err) {
            request.server.log.error('JWT Verification failed', err);
            return reply.code(401).send({ error: 'Invalid Token' });
        }
    });
};
exports.default = (0, fastify_plugin_1.default)(authPlugin);
//# sourceMappingURL=auth.js.map