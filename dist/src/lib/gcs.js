"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadFromGcs = exports.getSignedReadUrl = exports.generateUploadUrl = exports.uploadToGcs = void 0;
const storage_1 = require("@google-cloud/storage");
const google_auth_1 = require("./google-auth");
const authOptions = (0, google_auth_1.getGoogleCredentials)();
const storage = new storage_1.Storage(authOptions || {});
if (!authOptions) {
    console.error('[GCS] Warning: No Google Cloud credentials found. Storage operations will fail.');
}
const bucketName = process.env.GCS_BUCKET_NAME || 'notarisone-dev';
const uploadToGcs = async (buffer, fileName, contentType) => {
    const file = storage.bucket(bucketName).file(fileName);
    await file.save(buffer, {
        metadata: { contentType },
        resumable: false
    });
    return `gs://${bucketName}/${fileName}`;
};
exports.uploadToGcs = uploadToGcs;
const generateUploadUrl = async (fileName, contentType) => {
    const options = {
        version: 'v4',
        action: 'write',
        expires: Date.now() + 15 * 60 * 1000, // 15 minutes
        contentType,
    };
    try {
        const [url] = await storage
            .bucket(bucketName)
            .file(fileName)
            .getSignedUrl(options);
        return url;
    }
    catch (error) {
        console.error('Error generating signed URL:', error);
        return null;
    }
};
exports.generateUploadUrl = generateUploadUrl;
/**
 * Generates a signed URL for reading a private GCS object.
 * Expects path format: gs://bucket-name/path/to/file.jpg
 */
const getSignedReadUrl = async (gsPath) => {
    if (!gsPath || !gsPath.startsWith('gs://'))
        return null;
    try {
        const parts = gsPath.replace('gs://', '').split('/');
        const bName = parts[0];
        const fName = parts.slice(1).join('/');
        const options = {
            version: 'v4',
            action: 'read',
            expires: Date.now() + 15 * 60 * 1000, // 15 minutes
        };
        const [url] = await storage.bucket(bName).file(fName).getSignedUrl(options);
        return url;
    }
    catch (error) {
        console.error(`[GCS ERROR] GCS Signing Failed for ${gsPath}:`, error.message);
        return null;
    }
};
exports.getSignedReadUrl = getSignedReadUrl;
/**
 * Downloads a file from GCS and returns its Buffer.
 */
const downloadFromGcs = async (gsPath) => {
    if (!gsPath || !gsPath.startsWith('gs://')) {
        throw new Error(`Invalid gsPath format: ${gsPath}`);
    }
    try {
        const parts = gsPath.replace('gs://', '').split('/');
        const bName = parts[0];
        const fName = parts.slice(1).join('/');
        const [buffer] = await storage.bucket(bName).file(fName).download();
        return buffer;
    }
    catch (error) {
        console.error(`[GCS ERROR] GCS Download Failed for ${gsPath}:`, error.message);
        throw new Error(`GCS Download Failed: ${error.message}`);
    }
};
exports.downloadFromGcs = downloadFromGcs;
//# sourceMappingURL=gcs.js.map