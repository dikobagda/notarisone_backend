import { FastifyPluginAsync } from 'fastify';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import crypto from 'crypto';

const JWT_SECRET = process.env.NEXTAUTH_SECRET || "notarisone_local_secret_key";

export const authApiRoutes: FastifyPluginAsync = async (fastify) => {

  // SMTP Transporter — baca dari environment variable
  const transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST || "sandbox.smtp.mailtrap.io",
    port:   Number(process.env.SMTP_PORT) || 2525,
    auth: {
      user: process.env.SMTP_USER || "",
      pass: process.env.SMTP_PASS || "",
    },
  });

  fastify.post('/login', async (request, reply) => {
    const loginSchema = z.object({
      email: z.string().email(),
      password: z.string().min(1),
    });

    const body = loginSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ success: false, message: 'Data tidak valid' });

    const { email, password } = body.data;
    console.log(`[Backend] Permintaan login masuk untuk: ${email}`);

    const user = await prisma.user.findUnique({ 
      where: { email },
      include: { tenant: true }
    });

    if (!user) {
      console.log(`[Backend] Login gagal: User tidak ditemukan`);
      return reply.code(401).send({ success: false, message: 'Email atau password salah' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      console.log(`[Backend] Login gagal: Password salah`);
      return reply.code(401).send({ success: false, message: 'Email atau password salah' });
    }

    if (user.isLocked) {
      console.log(`[Backend] Login gagal: Akun terkunci (${email})`);
      return reply.code(403).send({ success: false, message: 'Akun Anda telah dinonaktifkan sementara. Hubungi admin.' });
    }
    
    console.log(`[Backend] Login sukses untuk: ${email}, Plan: ${user.tenant.subscription}`);

    // Generate stateless Backend JWT
    const token = jwt.sign(
      { sub: user.id, tenantId: user.tenantId, role: user.role, plan: user.tenant.subscription },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return reply.send({
      success: true,
      data: {
        token,
        user: { 
          id: user.id, 
          email: user.email, 
          name: user.name, 
          role: user.role, 
          tenantId: user.tenantId,
          plan: user.tenant.subscription 
        },
        tenant: {
          id: user.tenant.id,
          name: user.tenant.name,
          subscription: user.tenant.subscription
        }
      }
    });
  });

  fastify.post('/forgot-password', async (request, reply) => {
    const schema = z.object({ email: z.string().email() });
    const body = schema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ success: false, message: 'Email tidak valid' });

    const user = await prisma.user.findUnique({ where: { email: body.data.email } });
    
    // Always return success even if not found to prevent email enumeration attacks
    if (!user) return reply.send({ success: true, message: 'Instruksi reset password akan dikirim ke email tersebut.' });

    // Generate Crypto Token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 1000 * 60 * 60); // 1 hour

    await prisma.user.update({
      where: { id: user.id },
      data: { resetToken, resetTokenExpiry }
    });

    // Send Email
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/reset-password?token=${resetToken}`;
    
    try {
      await transporter.sendMail({
        from: '"NotarisOne Security" <security@notarisone.com>',
        to: user.email,
        subject: "Reset Password Anda di NotarisOne",
        html: `
          <h3>Permintaan Reset Password</h3>
          <p>Halo ${user.name}, seseorang telah meminta ganti password untuk akun Anda.</p>
          <p>Klik link di bawah ini untuk mengatur ulang password (berlaku 1 jam):</p>
          <a href="${resetUrl}" style="padding: 10px 15px; background: #2563eb; color: white; text-decoration: none; border-radius: 5px;">Reset Password</a>
          <br/><br/>
          <p>Jika ini bukan Anda, abaikan saja email ini.</p>
        `
      });
      return reply.send({ success: true, message: 'Instruksi reset berhasil dikirim.' });
    } catch(err) {
      request.server.log.error(err);
      return reply.code(500).send({ success: false, message: 'Gagal mengirim email smtp' });
    }
  });

  fastify.post('/reset-password', async (request, reply) => {
    const schema = z.object({
      token: z.string(),
      newPassword: z.string().min(8)
    });
    
    const body = schema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ success: false, message: 'Data tidak lengkap' });

    const user = await prisma.user.findUnique({
      where: { resetToken: body.data.token }
    });

    if (!user || !user.resetTokenExpiry || user.resetTokenExpiry < new Date()) {
      return reply.code(400).send({ success: false, message: 'Token reset tidak valid atau sudah kadaluarsa.' });
    }

    const hashedPassword = await bcrypt.hash(body.data.newPassword, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetToken: null,
        resetTokenExpiry: null
      }
    });

    return reply.send({ success: true, message: 'Password berhasil diubah. Silakan login kembali.' });
  });

  // GET /api/auth/invite-info?token=... - Check token and get office info
  fastify.get('/invite-info', async (request, reply) => {
    const { token } = request.query as { token: string };
    if (!token) return reply.sendError('Token wajib disertakan');

    const invite = await prisma.tenantTeams.findUnique({
      where: { token },
      include: { tenant: true }
    });

    if (!invite) {
      return reply.sendError('Token undangan tidak ditemukan atau link salah');
    }

    const now = new Date();
    // Beri toleransi 5 menit untuk clock drift
    const isExpired = invite.expiresAt.getTime() + (5 * 60 * 1000) < now.getTime();

    if (isExpired) {
      return reply.sendError('Undangan ini sudah kedaluwarsa (berlaku 48 jam)');
    }

    if (invite.acceptedAt) {
      return reply.sendError('Undangan ini sudah pernah digunakan untuk mendaftar');
    }

    console.log(`[DEBUG] Invite VALID for email: ${invite.email} at ${invite.tenant.name}`);

    return reply.sendSuccess({
      email: invite.email,
      role: invite.role,
      kantorName: invite.tenant.name
    });
  });

  fastify.post('/register', async (request, reply) => {
    const registerSchema = z.object({
      // Tenant Info (Optional if token present)
      kantorName: z.string().optional(),
      address: z.string().optional(),
      // Notaris User Info
      name: z.string().min(2, 'Nama minimal 2 karakter'),
      email: z.string().email('Email tidak valid'),
      password: z.string().min(8, 'Password minimal 8 karakter'),
      // Subscription
      plan: z.enum(['TRIAL', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE']).optional(),
      // Invitation
      token: z.string().optional(),
    });

    const body = registerSchema.safeParse(request.body);
    if (!body.success) {
      const firstError = body.error.issues[0]?.message ?? 'Data tidak valid';
      return reply.code(400).send({ success: false, message: firstError });
    }

    const { kantorName, address, name, email, password, plan, token } = body.data;

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return reply.code(409).send({ success: false, message: 'Email sudah terdaftar. Silakan login.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // If token exists, we join an existing tenant
    if (token) {
      const invite = await prisma.tenantTeams.findUnique({
        where: { token },
        include: { tenant: true }
      });

      if (!invite || invite.expiresAt < new Date() || invite.acceptedAt) {
        return reply.sendError('Undangan tidak valid atau sudah kadaluarsa');
      }

      const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const user = await tx.user.create({
          data: {
            name,
            email: invite.email, // Force email from invite
            password: hashedPassword,
            role: invite.role,
            tenantId: invite.tenantId,
          }
        });

        await tx.tenantTeams.update({
          where: { id: invite.id },
          data: { acceptedAt: new Date() }
        });

        return { user, tenant: invite.tenant };
      });

      return reply.code(201).send({
        success: true,
        message: `Berhasil bergabung dengan ${result.tenant.name}!`,
        data: {
          token: jwt.sign({ sub: result.user.id, tenantId: result.tenant.id, role: result.user.role }, JWT_SECRET, { expiresIn: '7d' }),
          user: { id: result.user.id, email: result.user.email, name: result.user.name, role: result.user.role, tenantId: result.tenant.id },
          tenant: { id: result.tenant.id, name: result.tenant.name, subscription: result.tenant.subscription }
        }
      });
    }

    // Normal Registration flow (create new tenant)
    if (!kantorName) return reply.sendError('Nama kantor wajib disertakan untuk pendaftaran baru');

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const trialExpiresAt = new Date();
      trialExpiresAt.setDate(trialExpiresAt.getDate() + 30);

      const tenant = await tx.tenant.create({
        data: {
          name: kantorName,
          address: address || null,
          subscription: plan || 'TRIAL',
          status: 'ACTIVE',
          trialExpiresAt: trialExpiresAt,
        }
      });

      const user = await tx.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          role: 'NOTARIS',
          tenantId: tenant.id,
        }
      });

      return { tenant, user };
    });

    // Generate JWT for immediate login after registration
    const sessionToken = jwt.sign(
      { sub: result.user.id, tenantId: result.tenant.id, role: result.user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log(`[Backend] Registrasi sukses: ${email}, Tenant: ${kantorName}, Plan: ${plan}`);

    // ── RESPOND IMMEDIATELY — jangan tunggu email ──
    reply.code(201).send({
      success: true,
      message: 'Akun berhasil dibuat! Selamat datang di NotarisOne.',
      data: {
        token: sessionToken,
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
          role: result.user.role,
          tenantId: result.tenant.id,
        },
        tenant: {
          id: result.tenant.id,
          name: result.tenant.name,
          subscription: result.tenant.subscription,
        }
      }
    });

    // ── FIRE-AND-FORGET: kirim welcome email di background ──
    setImmediate(async () => {
      try {
        const planLabel: Record<string, string> = {
          TRIAL: 'Free Trial',
          STARTER: 'Starter (Gratis)',
          PROFESSIONAL: 'Professional',
          ENTERPRISE: 'Enterprise',
        };

        await transporter.sendMail({
          from: process.env.SMTP_FROM || '"NotarisOne" <noreply@notarisone.com>',
          to: email,
          subject: `Selamat datang di NotarisOne, ${name}! 🎉`,
          html: `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Selamat Datang di NotarisOne</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0f;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="580" cellpadding="0" cellspacing="0" style="background:#111118;border-radius:16px;border:1px solid rgba(255,255,255,0.08);overflow:hidden;max-width:580px;width:100%;">

          <!-- Header Banner -->
          <tr>
            <td style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:36px 40px;text-align:center;">
              <div style="background:rgba(255,255,255,0.15);display:inline-block;border-radius:12px;padding:10px 18px;margin-bottom:16px;">
                <span style="font-size:24px;font-weight:900;color:#fff;letter-spacing:-0.5px;">N</span>
                <span style="font-size:16px;font-weight:700;color:#fff;margin-left:8px;">NotarisOne</span>
              </div>
              <h1 style="color:#fff;font-size:26px;font-weight:900;margin:0 0 8px;letter-spacing:-0.5px;">
                Selamat Datang! 🎉
              </h1>
              <p style="color:rgba(255,255,255,0.7);font-size:14px;margin:0;">
                Akun Anda telah berhasil dibuat
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">

              <p style="color:rgba(255,255,255,0.85);font-size:15px;line-height:1.7;margin:0 0 20px;">
                Halo, <strong style="color:#fff;">${name}</strong> 👋
              </p>
              <p style="color:rgba(255,255,255,0.6);font-size:14px;line-height:1.7;margin:0 0 28px;">
                Kami dengan bangga menyambut Anda sebagai bagian dari komunitas NotarisOne.
                Platform kami siap membantu Anda mengelola kantor notaris dengan lebih
                efisien, aman, dan profesional.
              </p>

              <!-- Detail Akun -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;margin-bottom:28px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="color:rgba(255,255,255,0.4);font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 16px;">Ringkasan Akun</p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="color:rgba(255,255,255,0.4);font-size:13px;padding:6px 0;width:40%;">Nama Notaris</td>
                        <td style="color:#fff;font-size:13px;font-weight:600;padding:6px 0;">${name}</td>
                      </tr>
                      <tr>
                        <td style="color:rgba(255,255,255,0.4);font-size:13px;padding:6px 0;">Email</td>
                        <td style="color:#fff;font-size:13px;font-weight:600;padding:6px 0;">${email}</td>
                      </tr>
                      <tr>
                        <td style="color:rgba(255,255,255,0.4);font-size:13px;padding:6px 0;">Nama Kantor</td>
                        <td style="color:#fff;font-size:13px;font-weight:600;padding:6px 0;">${kantorName}</td>
                      </tr>
                      <tr>
                        <td style="color:rgba(255,255,255,0.4);font-size:13px;padding:6px 0;">Paket</td>
                        <td style="padding:6px 0;">
                          <span style="background:rgba(99,102,241,0.2);color:#818cf8;font-size:11px;font-weight:700;padding:3px 10px;border-radius:99px;border:1px solid rgba(99,102,241,0.3); text-transform:uppercase;">
                            ${plan ? (planLabel[plan as keyof typeof planLabel] ?? plan) : 'STARTER'}
                          </span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td align="center">
                    <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard"
                       style="display:inline-block;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;font-size:14px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:12px;letter-spacing:0.3px;box-shadow:0 8px 24px rgba(79,70,229,0.35);">
                      Buka Dashboard →
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Tips Section -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:12px;margin-bottom:0;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="color:rgba(255,255,255,0.4);font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 14px;">Langkah Berikutnya</p>
                    <table cellpadding="0" cellspacing="0" width="100%">
                      ${['Lengkapi profil kantor Anda di pengaturan', 'Tambahkan anggota tim (pegawai/staf)', 'Buat akta pertama Anda'].map((tip, i) => `
                      <tr>
                        <td style="padding:5px 0;vertical-align:top;width:28px;">
                          <div style="background:rgba(99,102,241,0.2);color:#818cf8;font-size:11px;font-weight:800;width:20px;height:20px;border-radius:50%;text-align:center;line-height:20px;">${i + 1}</div>
                        </td>
                        <td style="color:rgba(255,255,255,0.55);font-size:13px;padding:5px 0 5px 8px;line-height:1.5;">${tip}</td>
                      </tr>`).join('')}
                    </table>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="border-top:1px solid rgba(255,255,255,0.06);padding:24px 40px;text-align:center;">
              <p style="color:rgba(255,255,255,0.2);font-size:12px;margin:0 0 6px;">
                Email ini dikirim secara otomatis. Jangan membalas pesan ini.
              </p>
              <p style="color:rgba(255,255,255,0.15);font-size:11px;margin:0;">
                &copy; ${new Date().getFullYear()} NotarisOne. Hak cipta dilindungi undang-undang.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
          `,
        });

        console.log(`[Email] Welcome email terkirim ke: ${email}`);
      } catch (emailErr) {
        // Jangan crash — email error tidak boleh mempengaruhi user
        console.error(`[Email] Gagal kirim welcome email ke ${email}:`, emailErr);
      }
    });

  });

};

// Removed default export in favor of named export to fix TS resolution issues
// export default authApiRoutes;
