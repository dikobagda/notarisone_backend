"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSignedReadUrl = exports.generateUploadUrl = exports.uploadToGcs = void 0;
const storage_1 = require("@google-cloud/storage");
const path_1 = __importDefault(require("path"));
const KEY_PATH = path_1.default.resolve(__dirname, '../../gcpkey.json');
// Early check to help user
const fs_1 = __importDefault(require("fs"));
if (!fs_1.default.existsSync(KEY_PATH)) {
    console.error(`[CRITICAL] GCS Key file not found at: ${KEY_PATH}`);
}
const storage = new storage_1.Storage({
    keyFilename: KEY_PATH,
});
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
//# sourceMappingURL=gcs.js.map