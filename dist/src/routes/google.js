"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = require("@/lib/prisma");
const zod_1 = require("zod");
const googleRoutes = async (fastify) => {
    // POST /api/google/save-tokens - Save Google OAuth tokens for a user
    fastify.post('/save-tokens', async (request, reply) => {
        const schema = zod_1.z.object({
            email: zod_1.z.string().email(),
            accessToken: zod_1.z.string(),
            refreshToken: zod_1.z.string().optional(),
            expiresAt: zod_1.z.string().nullable(),
        });
        const body = schema.safeParse(request.body);
        if (!body.success)
            return reply.sendError(body.error.issues[0].message);
        try {
            const { email, accessToken, refreshToken, expiresAt } = body.data;
            // Find user by email
            const user = await prisma_1.prisma.user.findUnique({
                where: { email },
            });
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
};
exports.default = googleRoutes;
//# sourceMappingURL=google.js.map