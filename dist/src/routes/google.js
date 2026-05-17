"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = require("@/lib/prisma");
const zod_1 = require("zod");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const writeLog = (msg) => {
    const logPath = path_1.default.join(process.cwd(), 'debug.log');
    const timestamp = new Date().toISOString();
    fs_1.default.appendFileSync(logPath, `[${timestamp}] ${msg}\n`);
};
const googleRoutes = async (fastify) => {
    // POST /api/google/save-tokens - Save Google OAuth tokens for a user
    fastify.post('/save-tokens', async (request, reply) => {
        writeLog(`>>> Incoming /save-tokens request: ${JSON.stringify(request.body)}`);
        const schema = zod_1.z.object({
            email: zod_1.z.string().email(),
            userId: zod_1.z.string().optional(),
            accessToken: zod_1.z.string(),
            refreshToken: zod_1.z.string().optional(),
            expiresAt: zod_1.z.string().nullable(),
        });
        const body = schema.safeParse(request.body);
        if (!body.success)
            return reply.sendError(body.error.issues[0].message);
        try {
            const { email, userId, accessToken, refreshToken, expiresAt } = body.data;
            console.log(`[GOOGLE SAVE-TOKENS] Incoming request: userId=${userId}, email=${email}, hasAccessToken=${!!accessToken}, hasRefreshToken=${!!refreshToken}`);
            // Find user by userId (priority) or email
            let user = null;
            if (userId) {
                user = await prisma_1.prisma.user.findUnique({ where: { id: userId } });
                if (user)
                    console.log(`[GOOGLE SAVE-TOKENS] Found user by ID: ${userId}`);
            }
            if (!user) {
                user = await prisma_1.prisma.user.findUnique({ where: { email } });
            }
            if (!user) {
                return reply.sendError('User tidak ditemukan');
            }
            // Update user with tokens
            const updateData = {
                googleAccessToken: accessToken,
                googleTokenExpiry: expiresAt ? new Date(expiresAt) : null,
            };
            // Only update refresh token if provided (NextAuth only sends it on first login or if prompt=consent is used)
            if (refreshToken) {
                updateData.googleRefreshToken = refreshToken;
            }
            await prisma_1.prisma.user.update({
                where: { id: user.id },
                data: updateData,
            });
            return reply.sendSuccess(null, 'Token Google berhasil disimpan');
        }
        catch (error) {
            request.log.error(error);
            return reply.sendError('Gagal menyimpan token Google');
        }
    });
    // GET /api/google/status - Check if Google integration is active
    fastify.get('/status', async (request, reply) => {
        const userId = request.userId;
        if (!userId)
            return reply.sendError('Unauthorized', 401);
        try {
            const user = await prisma_1.prisma.user.findUnique({
                where: { id: userId },
                select: {
                    googleAccessToken: true,
                    googleRefreshToken: true,
                    email: true
                }
            });
            const isConnected = !!(user?.googleAccessToken && user?.googleRefreshToken);
            return reply.sendSuccess({
                isConnected,
                email: isConnected ? user?.email : null
            });
        }
        catch (error) {
            request.log.error(error);
            return reply.sendError('Gagal mengambil status integrasi');
        }
    });
    // DELETE /api/google/disconnect - Remove Google integration
    fastify.delete('/disconnect', async (request, reply) => {
        const userId = request.userId;
        if (!userId)
            return reply.sendError('Unauthorized', 401);
        try {
            await prisma_1.prisma.user.update({
                where: { id: userId },
                data: {
                    googleAccessToken: null,
                    googleRefreshToken: null,
                    googleTokenExpiry: null
                }
            });
            return reply.sendSuccess(null, 'Integrasi Google berhasil diputuskan');
        }
        catch (error) {
            request.log.error(error);
            return reply.sendError('Gagal memutuskan integrasi');
        }
    });
};
exports.default = googleRoutes;
//# sourceMappingURL=google.js.map