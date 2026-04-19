import { PrismaClient } from '@prisma/client';
import { GoogleCalendarService } from './src/lib/google-calendar';

const prisma = new PrismaClient();

async function testSync() {
  const user = await prisma.user.findFirst({
    where: { email: 'dikobagda@gmail.com' } // Change according to user's email if possible
  });

  if (!user) {
    console.log('User not found');
    return;
  }

  console.log('User found:', user.email);
  console.log('Has access token:', !!user.googleAccessToken);
  console.log('Has refresh token:', !!user.googleRefreshToken);

  const appointment = await prisma.appointment.findFirst({
    where: { assignedToId: user.id },
    orderBy: { createdAt: 'desc' }
  });

  if (!appointment) {
    console.log('No appointment found for user');
    return;
  }

  console.log('Attempting to sync appointment:', appointment.id);

  try {
    const calendarClient = await (GoogleCalendarService as any).getAuthenticatedClient(user.id);
    if (!calendarClient) {
      console.log('Failed to get calendar client (tokens missing or refresh failed)');
      return;
    }

    const event = {
      summary: `[TEST] ${appointment.title}`,
      start: {
        dateTime: appointment.startTime.toISOString(),
        timeZone: 'Asia/Jakarta',
      },
      end: {
        dateTime: appointment.endTime.toISOString(),
        timeZone: 'Asia/Jakarta',
      },
    };

    console.log('Inserting event:', JSON.stringify(event, null, 2));

    const res = await calendarClient.events.insert({
      calendarId: 'primary',
      requestBody: event,
    });

    console.log('Event created successfully:', res.data.htmlLink);
  } catch (error: any) {
    console.error('Error during Google Calendar sync:', error.message);
    if (error.response) {
      console.error('Google API Error Response:', error.response.data);
    }
  } finally {
    await prisma.$disconnect();
  }
}

testSync();
