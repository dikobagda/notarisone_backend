import { google } from 'googleapis';
import { prisma } from './prisma';
import stream from 'stream';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

export class GoogleDocsService {
  private static async getAuthenticatedClient(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        googleAccessToken: true,
        googleRefreshToken: true,
        googleTokenExpiry: true,
      },
    });

    if (!user?.googleAccessToken || !user?.googleRefreshToken) {
      return null;
    }

    oauth2Client.setCredentials({
      access_token: user.googleAccessToken,
      refresh_token: user.googleRefreshToken,
      expiry_date: user.googleTokenExpiry?.getTime(),
    });

    // Check if token is expired or expiring soon (within 5 mins)
    const isExpired = user.googleTokenExpiry && user.googleTokenExpiry.getTime() < Date.now() + 300000;

    if (isExpired) {
      try {
        const { credentials } = await oauth2Client.refreshAccessToken();
        await prisma.user.update({
          where: { id: userId },
          data: {
            googleAccessToken: credentials.access_token,
            googleRefreshToken: credentials.refresh_token || user.googleRefreshToken,
            googleTokenExpiry: credentials.expiry_date ? new Date(credentials.expiry_date) : null,
          },
        });
      } catch (error) {
        console.error('Error refreshing Google token:', error);
        return null;
      }
    }

    return google.drive({ version: 'v3', auth: oauth2Client });
  }

  /**
   * Uploads a Buffer (Docx) to Google Drive and converts it into a Google Doc.
   * Returns the drive file ID.
   */
  static async uploadFromBuffer(userId: string, buffer: Buffer, originalFileName: string): Promise<string | null> {
    const drive = await this.getAuthenticatedClient(userId);
    if (!drive) throw new Error("Terjadi masalah pada autentikasi Google. Silakan putus dan hubungkan kembali Integrasi Google di Pengaturan.");

    const bufferStream = new stream.PassThrough();
    bufferStream.end(buffer);

    try {
      const res = await drive.files.create({
        requestBody: {
          name: originalFileName.replace('.docx', ''), // Name without extension
          mimeType: 'application/vnd.google-apps.document', // Convert to Google Docs format
        },
        media: {
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          body: bufferStream,
        },
        fields: 'id, webViewLink'
      });

      console.log(`[GDOCS] Uploaded successfully: ${res.data.id}`);
      return res.data.id || null;
    } catch (e: any) {
      console.error("[GDOCS ERROR] Failed to upload to Google Docs:", e.message);
      throw new Error("Gagal mengunggah ke Google Docs. Pastikan Anda telah memberikan akses Google Drive.");
    }
  }

  /**
   * Downloads a Google Doc as a DOCX Buffer.
   */
  static async exportToDocxBuffer(userId: string, fileId: string): Promise<Buffer | null> {
    const drive = await this.getAuthenticatedClient(userId);
    if (!drive) throw new Error("Terjadi masalah pada autentikasi Google.");

    try {
      const response = await drive.files.export({
        fileId: fileId,
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      }, { responseType: 'stream' });

      return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        response.data.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
        response.data.on('error', (err: any) => reject(err));
        response.data.on('end', () => resolve(Buffer.concat(chunks)));
      });
    } catch (e: any) {
      console.error("[GDOCS ERROR] Failed to export from Google Docs:", e.message);
      throw new Error("Gagal mengunduh file dari Google Docs.");
    }
  }

  /**
   * Generates an editable link for the file
   */
  static async getEditLink(userId: string, fileId: string): Promise<string | null> {
    const drive = await this.getAuthenticatedClient(userId);
    if (!drive) return null;

    try {
      const file = await drive.files.get({
        fileId: fileId,
        fields: 'webViewLink'
      });
      return file.data.webViewLink || null;
    } catch (e) {
      return null;
    }
  }
}
