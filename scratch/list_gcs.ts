import { Storage } from '@google-cloud/storage';
import path from 'path';

const KEY_PATH = path.join(process.cwd(), 'google-service-account.json');
const storage = new Storage({ keyFilename: KEY_PATH });
const bucketName = 'notarisone-dev';

async function listFiles() {
  const [files] = await storage.bucket(bucketName).getFiles({ prefix: 'deeds/' });
  
  if (files.length === 0) {
    console.log("No deed files found in bucket.");
    return;
  }
  
  // Sort by time created descending
  files.sort((a, b) => {
      const aTime = a.metadata.timeCreated ? new Date(a.metadata.timeCreated).getTime() : 0;
      const bTime = b.metadata.timeCreated ? new Date(b.metadata.timeCreated).getTime() : 0;
      return bTime - aTime;
  });
  
  console.log("Latest 3 files:");
  for (let i = 0; i < Math.min(3, files.length); i++) {
     console.log(files[i].name, files[i].metadata.timeCreated);
  }

  // LET'S TRY DOWNLOADING IT
  try {
     console.log("Trying to download the very first one...");
     const [buffer] = await files[0].download();
     console.log("Downloaded successfully! Size:", buffer.length);
  } catch(e: any) {
     console.log("DOWNLOAD ERROR:", e.message);
  }
}

listFiles().catch(console.error);
