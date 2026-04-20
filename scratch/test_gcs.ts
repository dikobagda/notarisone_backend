import { Storage } from '@google-cloud/storage';
import path from 'path';

const KEY_PATH = path.join(process.cwd(), 'google-service-account.json');
const storage = new Storage({ keyFilename: KEY_PATH });
const bucketName = 'notarisone-dev'; // The default if there's no env

async function testConnection() {
  try {
    const [files] = await storage.bucket(bucketName).getFiles({ maxResults: 1 });
    console.log("Bucket access successful. First file:", files.length > 0 ? files[0].name : "No files");
  } catch (err: any) {
    console.error("Bucket access failed:", err.message);
  }
}

testConnection();
