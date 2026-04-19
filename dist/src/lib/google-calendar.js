"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoogleCalendarService = void 0;
const googleapis_1 = require("googleapis");
const prisma_1 = require("./prisma");
const oauth2Client = new googleapis_1.google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI);
class GoogleCalendarService {
    static async getAuthenticatedClient(userId) {
        const user = await prisma_1.prisma.user.findUnique({
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
                await prisma_1.prisma.user.update({
                    where: { id: userId },
                    data: {
                        googleAccessToken: credentials.access_token,
                        googleRefreshToken: credentials.refresh_token || user.googleRefreshToken, // Refresh token might not be returned if still valid
                        googleTokenExpiry: credentials.expiry_date ? new Date(credentials.expiry_date) : null,
                    },
                });
            }
            catch (error) {
                console.error('Error refreshing Google token:', error);
                return null;
            }
        }
        return googleapis_1.google.calendar({ version: 'v3', auth: oauth2Client });
    }
    static async syncAppointment(userId, appointmentId) {
        const calendar = await this.getAuthenticatedClient(userId);
        if (!calendar)
            return;
        const appointment = await prisma_1.prisma.appointment.findUnique({
            where: { id: appointmentId },
            include: {
                deed: true,
                client: true,
            },
        });
        if (!appointment)
            return;
        // Handle soft deletion
        if (appointment.deletedAt && appointment.googleEventId) {
            try {
                await calendar.events.delete({
                    calendarId: 'primary',
                    eventId: appointment.googleEventId,
                });
                await prisma_1.prisma.appointment.update({
                    where: { id: appointmentId },
                    data: { googleEventId: null },
                });
                return;
            }
            catch (error) {
                console.error('Error deleting Google event:', error);
                return;
            }
        }
        if (appointment.deletedAt)
            return;
        const event = {
            summary: `[NotarisOne] ${appointment.title}`,
            location: appointment.location || '',
            description: `${appointment.description || ''}\n\nClient: ${appointment.client?.name || 'N/A'}\nAkta: ${appointment.deed?.title || 'N/A'}\nLink: http://localhost:3000/dashboard/jadwal`,
            start: {
                dateTime: appointment.startTime.toISOString(),
                timeZone: 'Asia/Jakarta',
            },
            end: {
                dateTime: appointment.endTime.toISOString(),
                timeZone: 'Asia/Jakarta',
            },
        };
        try {
            if (appointment.googleEventId) {
                // Update existing event
                const res = await calendar.events.update({
                    calendarId: 'primary',
                    eventId: appointment.googleEventId,
                    requestBody: event,
                });
                console.log('Event updated: %s', res.data.htmlLink);
                return res.data;
            }
            else {
                // Create new event
                const res = await calendar.events.insert({
                    calendarId: 'primary',
                    requestBody: event,
                });
                // Store the Google Event ID
                await prisma_1.prisma.appointment.update({
                    where: { id: appointmentId },
                    data: { googleEventId: res.data.id },
                });
                console.log('Event created: %s', res.data.htmlLink);
                return res.data;
            }
        }
        catch (error) {
            console.error('Error syncing to Google Calendar:', error);
        }
    }
    static async deleteAppointment(userId, googleEventId) {
        const calendar = await this.getAuthenticatedClient(userId);
        if (!calendar)
            return;
        try {
            await calendar.events.delete({
                calendarId: 'primary',
                eventId: googleEventId,
            });
        }
        catch (error) {
            console.error('Error deleting Google event:', error);
        }
    }
}
exports.GoogleCalendarService = GoogleCalendarService;
//# sourceMappingURL=google-calendar.js.map