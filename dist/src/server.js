"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const fastify_1 = __importDefault(require("fastify"));
const audit_1 = __importDefault(require("./plugins/audit"));
const clients_1 = __importDefault(require("./routes/clients"));
const deeds_1 = __importDefault(require("./routes/deeds"));
const repertorium_1 = __importDefault(require("./routes/repertorium"));
const admin_1 = __importDefault(require("./routes/admin"));
const billing_1 = __importDefault(require("./routes/billing"));
const templates_1 = __importDefault(require("./routes/templates"));
const auth_1 = require("./routes/auth");
const ocr_1 = __importDefault(require("./routes/ocr"));
const audit_2 = __importDefault(require("./routes/audit"));
const auth_2 = __importDefault(require("./plugins/auth"));
const team_1 = __importDefault(require("./routes/team"));
const tenant_teams_1 = __importDefault(require("./routes/tenant-teams"));
const profile_1 = require("./routes/profile");
const appointments_1 = __importDefault(require("./routes/appointments"));
const google_1 = __importDefault(require("./routes/google"));
const multipart_1 = __importDefault(require("@fastify/multipart"));
const cors_1 = __importDefault(require("@fastify/cors"));
const server = (0, fastify_1.default)({
    logger: true,
    ignoreTrailingSlash: true,
});
// Register Plugins
server.register(audit_1.default);
server.register(auth_2.default);
server.register(cors_1.default, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
});
server.register(multipart_1.default, {
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
    }
});
// Register Routes
server.register(clients_1.default, { prefix: '/api/clients' });
server.register(deeds_1.default, { prefix: '/api/deeds' });
server.register(repertorium_1.default, { prefix: '/api/repertorium' });
server.register(admin_1.default, { prefix: '/api/admin' });
server.register(billing_1.default, { prefix: '/api/billing' });
server.register(templates_1.default, { prefix: '/api/templates' });
server.register(auth_1.authApiRoutes, { prefix: '/api/backauth' });
server.register(ocr_1.default, { prefix: '/api/ocr' });
server.register(audit_2.default, { prefix: '/api/audit' });
server.register(team_1.default, { prefix: '/api/team' });
server.register(tenant_teams_1.default, { prefix: '/api/tenant-teams' });
server.register(profile_1.profileRoutes, { prefix: '/api/profile' });
server.register(appointments_1.default, { prefix: '/api/appointments' });
server.register(google_1.default, { prefix: '/api/google' });
// Standard JSON Response Utility
server.decorateReply('sendSuccess', function (data, message = 'Operasi berhasil') {
    return this.send({
        success: true,
        data,
        message,
    });
});
server.decorateReply('sendError', function (message, code = 400) {
    return this.code(code).send({
        success: false,
        message,
    });
});
// Health Check
server.get('/health', async (request, reply) => {
    return { status: 'OK', timestamp: new Date().toISOString() };
});
// Basic Error Handler
server.setErrorHandler((error, request, reply) => {
    server.log.error(error);
    if (error.validation) {
        reply.status(422).send({
            success: false,
            message: 'Data tidak valid',
            errors: error.validation,
        });
        return;
    }
    reply.status(500).send({
        success: false,
        message: 'Terjadi kesalahan sistem internal',
    });
});
const start = async () => {
    try {
        const port = process.env.PORT ? parseInt(process.env.PORT) : 3001;
        await server.listen({ port, host: '0.0.0.0' });
        console.log(`Server NotarisOne backend berjalan di port ${port}`);
    }
    catch (err) {
        server.log.error(err);
        process.exit(1);
    }
};
start();
//# sourceMappingURL=server.js.map