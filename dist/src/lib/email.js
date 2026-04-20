"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendDeedNotification = sendDeedNotification;
const nodemailer_1 = __importDefault(require("nodemailer"));
const transporter = nodemailer_1.default.createTransport({
    host: process.env.SMTP_HOST || 'localhost',
    port: parseInt(process.env.SMTP_PORT || '1025'),
    secure: false, // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});
async function sendDeedNotification(to, template, context) {
    let subject = '';
    let html = '';
    const { clientName, deedTitle, deedType, deedNumber, notaryName = 'NotarisOne System' } = context;
    if (template === 'DRAFT_CREATED') {
        subject = `[NotarisOne] Draf Akta Baru: ${deedTitle}`;
        html = `
      <div style="font-family: sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: auto; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
        <h2 style="color: #4f46e5; border-bottom: 2px solid #f3f4f6; pb: 10px;">Pemberitahuan Draf Akta Baru</h2>
        <p>Halo <strong>${clientName}</strong>,</p>
        <p>Kami informasikan bahwa draf akta baru telah berhasil dibuat dalam sistem kami:</p>
        <div style="background: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <table style="width: 100%;">
            <tr><td style="color: #6b7280; width: 120px;">Judul Akta:</td><td style="font-weight: bold;">${deedTitle}</td></tr>
            <tr><td style="color: #6b7280;">Jenis Akta:</td><td style="font-weight: bold;">${deedType}</td></tr>
            <tr><td style="color: #6b7280;">Status:</td><td><span style="background: #e0e7ff; color: #4338ca; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: bold;">DRAF</span></td></tr>
          </table>
        </div>
        <p>Draf ini sedang dalam tahap peninjauan. Jika diperlukan informasi tambahan atau tanda tangan, tim kami akan segera menghubungi Anda kembali.</p>
        <p style="margin-top: 30px; font-size: 12px; color: #9ca3af; border-top: 1px solid #eee; pt: 10px;">
          Terima kasih,<br/>
          <strong>${notaryName}</strong>
        </p>
      </div>
    `;
    }
    else if (template === 'DEED_FINALIZED') {
        subject = `[NotarisOne] Akta Berhasil Difinalisasi: ${deedNumber}`;
        html = `
      <div style="font-family: sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: auto; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
        <h2 style="color: #059669; border-bottom: 2px solid #f3f4f6; pb: 10px;">Akta Telah Final & Selesai</h2>
        <p>Halo <strong>${clientName}</strong>,</p>
        <p>Selamat! Akta Anda telah berhasil diselesaikan dan nomor akta telah diterbitkan secara resmi:</p>
        <div style="background: #f0fdf4; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #dcfce7;">
          <table style="width: 100%;">
            <tr><td style="color: #6b7280; width: 120px;">Nomor Akta:</td><td style="font-weight: bold; color: #059669; font-size: 1.1em;">${deedNumber}</td></tr>
            <tr><td style="color: #6b7280;">Judul Akta:</td><td style="font-weight: bold;">${deedTitle}</td></tr>
            <tr><td style="color: #6b7280;">Jenis Akta:</td><td style="font-weight: bold;">${deedType}</td></tr>
          </table>
        </div>
        <p>Anda kini dapat mengambil salinan akta resmi di kantor kami atau menghubungi staf kami untuk informasi pengiriman dokumen fisik.</p>
        <p style="margin-top: 30px; font-size: 12px; color: #9ca3af; border-top: 1px solid #eee; pt: 10px;">
          Terima kasih telah mempercayakan dokumen hukum Anda kepada kami.<br/><br/>
          Salam hangat,<br/>
          <strong>${notaryName}</strong>
        </p>
      </div>
    `;
    }
    else if (template === 'TEAM_INVITATION') {
        const inviteUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/join?token=${context.token}`;
        subject = `[NotarisOne] Undangan Bergabung: ${context.kantorName}`;
        html = `
      <div style="font-family: sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: auto; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
        <h2 style="color: #4f46e5; border-bottom: 2px solid #f3f4f6; pb: 10px;">Undangan Anggota Tim Baru</h2>
        <p>Halo,</p>
        <p>Anda telah diundang untuk bergabung dengan <strong>${context.kantorName}</strong> di platform NotarisOne sebagai <strong>${context.role}</strong>.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${inviteUrl}" style="background: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
            Terima Undangan & Buat Akun
          </a>
        </div>
        <p style="font-size: 13px; color: #6b7280;">Jika tombol di atas tidak berfungsi, salin dan tempel link berikut di browser Anda:</p>
        <p style="font-size: 13px; color: #4f46e5; word-break: break-all;">${inviteUrl}</p>
        <p style="margin-top: 30px; font-size: 12px; color: #9ca3af; border-top: 1px solid #eee; pt: 10px;">
          Link ini berlaku selama 48 jam.<br/>
          Terima kasih,<br/>
          <strong>Tim NotarisOne</strong>
        </p>
      </div>
    `;
    }
    try {
        const info = await transporter.sendMail({
            from: process.env.SMTP_FROM || '"NotarisOne" <noreply@notarisone.com>',
            to,
            subject,
            html,
        });
        console.log(`[EMAIL] Success - Sent ${template} to ${to}. MessageId: ${info.messageId}`);
        return { success: true, messageId: info.messageId };
    }
    catch (error) {
        console.error(`[EMAIL] Error - Failed to send ${template} to ${to}:`, error);
        return { success: false, error };
    }
}
//# sourceMappingURL=email.js.map