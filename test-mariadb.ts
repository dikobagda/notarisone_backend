import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import 'dotenv/config';

try {
  const connectionString = (process.env.DATABASE_URL || '').replace(/^mysql:\/\//, 'mariadb://');
  console.log("Connection string:", connectionString);
  const adapter = new PrismaMariaDb(connectionString);
  console.log("Adapter created successfully");
} catch(e) {
  console.error("Adapter error:", e);
}
