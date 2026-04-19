import { ImageAnnotatorClient } from '@google-cloud/vision';
import path from 'path';
import { uploadToGcs } from './gcs';

// Path to service account key
const KEY_PATH = path.join(process.cwd(), 'gcpkey.json');

const visionClient = new ImageAnnotatorClient({
  keyFilename: KEY_PATH,
});

export interface KtpExtraction {
  nik: string;
  name: string;
  pob: string;
  dob: string;
  address: string;
  rawVisionText?: string;
  ktpPath?: string;
}

export interface NpwpExtraction {
  npwp: string;
  name: string;
  rawVisionText?: string;
  npwpPath?: string;
}

/**
 * Enhanced KTP extraction using Google Cloud Vision (Value Pool Elimination Algorithm)
 */
export async function extractKtpData(imageBuffer: Buffer): Promise<KtpExtraction> {
  const [result] = await visionClient.documentTextDetection(imageBuffer);
  const fullTextResult = result.fullTextAnnotation?.text || '';

  if (!fullTextResult) {
    throw new Error('Gagal mengekstrak teks dari gambar');
  }

  const lines = fullTextResult.replace(/\r/g, '').split('\n').map(l => l.trim().toUpperCase()).filter(l => l.length > 0);
  
  // 1. Isolate strict values by stripping all known KTP labels from the beginning of lines
  let values: string[] = [];
  const labelRegex = /^(?:NAMA|TEMPAT\/TGL LAHIR|TEMPAT|TGL|LAHIR|ALAMAT|RT[\s\/]*RW|RT|RW|KEL\/DESA|KELURAHAN|KEL|KECAMATAN|KEC|JENIS KELAMIN|KELAMIN|GOL\.?\s*DARAH|GOL|AGAMA|STATUS PERKAWINAN|STATUS|PEKERJAAN|KEWARGANEGARAAN|WARGA NEGARA|BERLAKU HINGGA|BERLAKU|PROVINSI(.*)|KOTA(.*)|KABUPATEN(.*)|NIK)[\s\:\;]*/i;

  for (let line of lines) {
      // Strip labels
      line = line.replace(labelRegex, '').trim();
      // Strip leading colons that might have been detached from labels
      line = line.replace(/^[\:\;]+/, '').trim();
      
      // If it's a valid remaining string or a standalone RT/RW number like "005"
      if (line.length > 2 || line.match(/^\d{1,3}$/)) {
          // Exclude random KTP title artifacts
          if (!line.includes('KARTU TANDA PENDUDUK') && !line.includes('PENDUDUK KARTU')) {
              values.push(line);
          }
      }
  }

  let nik = '', pob = '', dob = '', rtrw = '', gender = '', religion = '', status = '', job = '', nationality = '', validUntil = '';
  const unclassified: string[] = [];

  // 2. Classify and eliminate known distinct formats
  for (let i = 0; i < values.length; i++) {
      let v = values[i];
      let matched = false;

      // NIK
      if (!nik && v.replace(/\s+/g,'').match(/\d{16}/)) {
          nik = v.replace(/\s+/g,'').match(/\d{16}/)?.[0] || '';
          matched = true;
      }
      // DOB
      else if (!dob && v.match(/(?:([A-Z\s\-]+),\s*)?(\d{2})[\-\/\s]*(\d{2})[\-\/\s]*(\d{4})/)) {
          const m = v.match(/(?:([A-Z\s\-]+),\s*)?(\d{2})[\-\/\s]*(\d{2})[\-\/\s]*(\d{4})/);
          if (m) {
              if (m[1]) pob = m[1].trim();
              dob = `${m[4]}-${m[3]}-${m[2]}`; // ISO YYYY-MM-DD
              matched = true;
          }
      }
      // RT/RW format "005/012" or "005 / 012"
      else if (!rtrw && v.match(/\d{3}[\s\/]+\d{3}/)) {
          rtrw = v;
          matched = true;
      }
      // RT/RW split format (e.g., "005" followed by "012")
      else if (!rtrw && v.match(/^\d{3}$/) && i + 1 < values.length && values[i+1].match(/^\d{3}$/)) {
          rtrw = `${v}/${values[i+1]}`;
          values[i+1] = ''; // nullify the next one
          matched = true;
      }
      // Or just a stray RT like "005"
      else if (!rtrw && v.match(/^\d{3}$/)) {
          rtrw = v;
          matched = true;
      }
      // Gender
      else if (!gender && v.match(/LAKI|PEREMPUAN/)) {
          matched = true;
      }
      // Religion
      else if (!religion && v.match(/ISLAM|KRISTEN|KATHOLIK|KATOLIK|HINDU|BUDDHA|KONGHUCU/)) {
          matched = true;
      }
      // Marriage
      else if (!status && v.match(/KAWIN|CERAI/)) {
          matched = true;
      }
      // Job
      else if (!job && v.match(/KARYAWAN|SWASTA|WIRASWASTA|PELAJAR|MENGURUS|PEGAWAI|TENTARA|POLISI|GURU|TANI|DAGANG/)) {
          matched = true;
      }
      // Nationality
      else if (!nationality && v.match(/WNI|WNA/)) {
          matched = true;
      }
      // Valid Until
      else if (!validUntil && v.match(/SEUMUR HIDUP|\d{4}/) && !v.includes(',')) {
          // don't match DOB
          matched = true;
      }

      if (!matched && v.length > 0) {
          unclassified.push(v);
      }
  }

  // 3. The remaining unclassified strings are consistently: Name, Address, Kelurahan, Kecamatan
  // Because they are alphabetical and strictly ordered on the card.
  let name = '';
  let alamat = '';
  let kelDesa = '';
  let kecamatan = '';

  if (unclassified.length > 0) name = unclassified[0];
  
  // Ignore garbage padding at the end of OCR results (like signatures or dates)
  // Strict Indexing is the safest format for KTP since Name, Alamat, Kel/Desa, and Kec are strictly consecutive.
  if (unclassified.length >= 4) {
      alamat = unclassified[1];
      kelDesa = unclassified[2];
      kecamatan = unclassified[3];
  } else if (unclassified.length === 3) {
      alamat = unclassified[1];
      kecamatan = unclassified[2];
  } else if (unclassified.length === 2) {
      alamat = unclassified[1];
  }

  // Build final address logically with clean comma separation
  const addressParts: string[] = [];
  if (alamat) addressParts.push(alamat);
  if (rtrw) addressParts.push(`RT/RW ${rtrw}`);
  if (kelDesa) addressParts.push(`KEL. ${kelDesa}`);
  if (kecamatan) addressParts.push(`KEC. ${kecamatan}`);

  let address = addressParts.join(', ');

  // 4. Handle GCS Upload
  let ktpPath = '';
  try {
      const fileName = `clients/ktp/${Date.now()}_${nik || 'unknown'}.jpg`;
      ktpPath = await uploadToGcs(imageBuffer, fileName, 'image/jpeg');
  } catch (err) {
      console.error('KTP GCS Upload failed:', err);
  }

  return { 
    nik: nik.replace(/[:\-|!.;]/g, ''), 
    name: name.replace(/[:\-|!.;]/g, '').trim().toUpperCase(), 
    pob: pob.replace(/[:\-|!.;]/g, '').trim().toUpperCase(), 
    dob: dob,
    address: address.trim().toUpperCase(),
    rawVisionText: fullTextResult,
    ktpPath: ktpPath
  };
}

/**
 * NPWP extraction logic
 */
export async function extractNpwpData(imageBuffer: Buffer): Promise<NpwpExtraction> {
  const [result] = await visionClient.documentTextDetection(imageBuffer);
  const fullTextResult = result.fullTextAnnotation?.text || '';

  if (!fullTextResult) {
    throw new Error('Gagal mengekstrak teks dari gambar NPWP');
  }

  const lines = fullTextResult.replace(/\r/g, '').split('\n').map(l => l.trim().toUpperCase()).filter(l => l.length > 0);
  
  let npwp = '';
  let name = '';

  // 1. Find NPWP Number (XX.XXX.XXX.X-XXX.XXX or 15/16 digits)
  const npwpRegex = /\d{2}[\.\s]?\d{3}[\.\s]?\d{3}[\.\s]?\d{1}[\-\s\.]?\d{3}[\.\s]?\d{3}/;
  const numMatch = fullTextResult.match(npwpRegex);
  if (numMatch) {
    npwp = numMatch[0].replace(/[^\d]/g, '');
  } else {
    // Fallback search for just 15-16 digits
    const digitsOnly = fullTextResult.replace(/[^\d]/g, '');
    const fallbackMatch = digitsOnly.match(/\d{15,16}/);
    if (fallbackMatch) npwp = fallbackMatch[0];
  }

  // 2. Identify potential name
  // Usually the name is alone on a line near the NPWP label or the NPWP number
  const blacklist = ['NPWP', 'DIREKTORAT', 'JENDERAL', 'PAJAK', 'KEMENTERIAN', 'KEUANGAN', 'REPUBLIK', 'INDONESIA', 'KPP', 'PRATAMA'];
  
  for (let line of lines) {
    // If it's pure alphabetical and not in blacklist
    const cleanLine = line.replace(/[^A-Z\s]/g, '').trim();
    if (cleanLine.length > 3 && !blacklist.some(b => cleanLine.includes(b))) {
      // Potential name
      if (!name) name = cleanLine;
    }
  }

  // 3. Handle GCS Upload
  let npwpPath = '';
  try {
      const fileName = `clients/npwp/${Date.now()}_${npwp || 'unknown'}.jpg`;
      npwpPath = await uploadToGcs(imageBuffer, fileName, 'image/jpeg');
  } catch (err) {
      console.error('NPWP GCS Upload failed:', err);
  }

  return {
    npwp: npwp || '',
    name: name || '',
    rawVisionText: fullTextResult,
    npwpPath: npwpPath
  };
}
