import path from 'path';
import fs from 'fs';

export function getGoogleCredentials() {
  const KEY_PATH = path.join(process.cwd(), 'google-service-account.json');
  
  // 1. Try GCS_CREDENTIALS_BASE64
  if (process.env.GCS_CREDENTIALS_BASE64) {
    try {
      const decoded = Buffer.from(process.env.GCS_CREDENTIALS_BASE64, 'base64').toString('utf-8');
      return { credentials: JSON.parse(decoded) };
    } catch (err) {
      console.error(`[GoogleAuth] Failed to parse GCS_CREDENTIALS_BASE64`);
    }
  }

  // 2. Try GCS_CREDENTIALS_JSON (could be raw JSON or Base64 if misconfigured)
  if (process.env.GCS_CREDENTIALS_JSON) {
    let rawStr = process.env.GCS_CREDENTIALS_JSON.trim();
    
    // Strip quotes if any
    if ((rawStr.startsWith("'") && rawStr.endsWith("'")) || (rawStr.startsWith('"') && rawStr.endsWith('"'))) {
      rawStr = rawStr.slice(1, -1);
    }

    // Check if it's base64 (very likely if it starts with eyJ)
    if (rawStr.startsWith('eyJ')) {
      try {
        const decoded = Buffer.from(rawStr, 'base64').toString('utf-8');
        return { credentials: JSON.parse(decoded) };
      } catch (err) {
        console.error(`[GoogleAuth] Failed to parse GCS_CREDENTIALS_JSON as Base64`);
      }
    }

    // Try as raw JSON
    try {
      // Fix common escape issues
      if (rawStr.startsWith('\\{')) {
        rawStr = rawStr.replace(/\\{/g, '{').replace(/\\}/g, '}').replace(/\\"/g, '"');
      }
      rawStr = rawStr.replace(/\\n/g, '\n');
      
      return { credentials: JSON.parse(rawStr) };
    } catch (err) {
      console.error(`[GoogleAuth] Failed to parse GCS_CREDENTIALS_JSON as raw JSON`);
    }
  }

  // 3. Fallback to file
  if (fs.existsSync(KEY_PATH)) {
    return { keyFilename: KEY_PATH };
  }

  return null;
}
