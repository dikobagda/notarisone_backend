import { Storage } from '@google-cloud/storage';
import path from 'path';

import { getGoogleCredentials } from './google-auth';

const authOptions = getGoogleCredentials();
const storage = new Storage(authOptions || {});

if (!authOptions) {
  console.error('[GCS] Warning: No Google Cloud credentials found. Storage operations will fail.');
}

const bucketName = process.env.GCS_BUCKET_NAME || 'penagraha-dev';

export const uploadToGcs = async (buffer: Buffer, fileName: string, contentType: string): Promise<string> => {
  const file = storage.bucket(bucketName).file(fileName);

  await file.save(buffer, {
    metadata: { contentType },
    resumable: false
  });

  return `gs://${bucketName}/${fileName}`;
};

export const generateUploadUrl = async (fileName: string, contentType: string) => {
  const options = {
    version: 'v4' as const,
    action: 'write' as const,
    expires: Date.now() + 15 * 60 * 1000, // 15 minutes
    contentType,
  };

  try {
    const [url] = await storage
      .bucket(bucketName)
      .file(fileName)
      .getSignedUrl(options);

    return url;
  } catch (error) {
    console.error('Error generating signed URL:', error);
    return null;
  }
};

/**
 * Generates a signed URL for reading a private GCS object.
 * Expects path format: gs://bucket-name/path/to/file.jpg
 */
export const getSignedReadUrl = async (gsPath: string): Promise<string | null> => {
  if (!gsPath || !gsPath.startsWith('gs://')) return null;

  try {
    const parts = gsPath.replace('gs://', '').split('/');
    const bName = parts[0];
    const fName = parts.slice(1).join('/');

    const options = {
      version: 'v4' as const,
      action: 'read' as const,
      expires: Date.now() + 15 * 60 * 1000, // 15 minutes
    };

    const [url] = await storage.bucket(bName).file(fName).getSignedUrl(options);
    return url;
  } catch (error: any) {
    console.error(`[GCS ERROR] GCS Signing Failed for ${gsPath}:`, error.message);
    return null;
  }
};

/**
 * Downloads a file from GCS and returns its Buffer.
 */
export const downloadFromGcs = async (gsPath: string): Promise<Buffer | null> => {
  if (!gsPath || !gsPath.startsWith('gs://')) {
    throw new Error(`Invalid gsPath format: ${gsPath}`);
  }

  try {
    const parts = gsPath.replace('gs://', '').split('/');
    const bName = parts[0];
    const fName = parts.slice(1).join('/');

    const [buffer] = await storage.bucket(bName).file(fName).download();
    return buffer;
  } catch (error: any) {
    console.error(`[GCS ERROR] GCS Download Failed for ${gsPath}:`, error.message);
    throw new Error(`GCS Download Failed: ${error.message}`);
  }
};
