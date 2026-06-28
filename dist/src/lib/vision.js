"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractKtpData = extractKtpData;
exports.extractNpwpData = extractNpwpData;
const vision_1 = require("@google-cloud/vision");
const gcs_1 = require("./gcs");
const google_auth_1 = require("./google-auth");
const authOptions = (0, google_auth_1.getGoogleCredentials)();
const visionClient = new vision_1.ImageAnnotatorClient(authOptions || {});
if (!authOptions) {
    console.error('[Vision] Warning: No Google Cloud credentials found. OCR will fail.');
}
/**
 * Enhanced KTP extraction using Google Cloud Vision (Value Pool Elimination Algorithm)
 */
async function extractKtpData(imageBuffer) {
    const [result] = await visionClient.documentTextDetection(imageBuffer);
    const fullTextResult = result.fullTextAnnotation?.text || '';
    if (!fullTextResult) {
        throw new Error('Gagal mengekstrak teks dari gambar');
    }
    const lines = fullTextResult.replace(/\r/g, '').split('\n').map(l => l.trim().toUpperCase()).filter(l => l.length > 0);
    // 1. Isolate strict values by stripping all known KTP labels from the beginning of lines
    let values = [];
    // NOTE: KOTA/KABUPATEN/PROVINSI intentionally excluded here — handled separately below
    const labelRegex = /^(?:NAMA|TEMPAT\/TGL LAHIR|TEMPAT|TGL|LAHIR|ALAMAT|RT[\s\/]*RW|RT|RW|KEL\/DESA|KELURAHAN|KEL|KECAMATAN|KEC|JENIS KELAMIN|KELAMIN|GOL\.?\s*DARAH|GOL|AGAMA|STATUS PERKAWINAN|STATUS|PEKERJAAN|KEWARGANEGARAAN|WARGA NEGARA|BERLAKU HINGGA|BERLAKU|NIK)[\s\:\;]*/i;
    let kota = '';
    let provinsi = '';
    // State flags for when OCR splits "KOTA" and "JAKARTA BARAT" onto separate lines
    let pendingKota = false;
    let pendingProvinsi = false;
    for (let line of lines) {
        // ── Handle continuation of a split label from previous line ──
        if (pendingKota) {
            if (!kota)
                kota = line.trim();
            pendingKota = false;
            continue;
        }
        if (pendingProvinsi) {
            if (!provinsi)
                provinsi = line.trim();
            pendingProvinsi = false;
            continue;
        }
        // ── Detect KOTA/KABUPATEN inline: "KOTA JAKARTA BARAT" ──
        const kotaMatch = line.match(/^(?:KOTA|KABUPATEN)\s+(.+)/);
        if (kotaMatch) {
            if (!kota)
                kota = kotaMatch[1].trim();
            continue; // skip — don't push to values
        }
        // ── Detect standalone KOTA/KABUPATEN label (next line will be the city name) ──
        if (line.match(/^(?:KOTA|KABUPATEN)[\s:;]*$/)) {
            pendingKota = true;
            continue;
        }
        // ── Detect PROVINSI inline: "PROVINSI DKI JAKARTA" ──
        const provinsiMatch = line.match(/^PROVINSI\s+(.+)/);
        if (provinsiMatch) {
            if (!provinsi)
                provinsi = provinsiMatch[1].trim();
            continue; // skip — don't push to values
        }
        // ── Detect standalone PROVINSI label (next line will be the province name) ──
        if (line.match(/^PROVINSI[\s:;]*$/)) {
            pendingProvinsi = true;
            continue;
        }
        // Strip known field labels
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
    const unclassified = [];
    // 2. Classify and eliminate known distinct formats
    for (let i = 0; i < values.length; i++) {
        let v = values[i];
        let matched = false;
        // NIK
        if (!nik && v.replace(/\s+/g, '').match(/\d{16}/)) {
            nik = v.replace(/\s+/g, '').match(/\d{16}/)?.[0] || '';
            matched = true;
        }
        // DOB
        else if (!dob && v.match(/(?:([A-Z\s\-]+),\s*)?(\d{2})[\-\/\s]*(\d{2})[\-\/\s]*(\d{4})/)) {
            const m = v.match(/(?:([A-Z\s\-]+),\s*)?(\d{2})[\-\/\s]*(\d{2})[\-\/\s]*(\d{4})/);
            if (m) {
                if (m[1])
                    pob = m[1].trim();
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
        else if (!rtrw && v.match(/^\d{3}$/) && i + 1 < values.length && values[i + 1].match(/^\d{3}$/)) {
            rtrw = `${v}/${values[i + 1]}`;
            values[i + 1] = ''; // nullify the next one
            matched = true;
        }
        // Or just a stray RT like "005"
        else if (!rtrw && v.match(/^\d{3}$/)) {
            rtrw = v;
            matched = true;
        }
        // Gender
        else if (!gender && v.match(/LAKI|PEREMPUAN/)) {
            gender = v.includes('PEREMPUAN') ? 'PEREMPUAN' : 'LAKI_LAKI';
            matched = true;
        }
        // Religion
        else if (!religion && v.match(/ISLAM|KRISTEN|KATHOLIK|KATOLIK|HINDU|BUDDHA|KONGHUCU/)) {
            matched = true;
        }
        // Marriage
        else if (!status && v.match(/KAWIN|CERAI/)) {
            if (v.includes('BELUM'))
                status = 'BELUM_KAWIN';
            else if (v.includes('MATI'))
                status = 'CERAI_MATI';
            else if (v.includes('HIDUP'))
                status = 'CERAI_HIDUP';
            else if (v.match(/^KAWIN/))
                status = 'KAWIN';
            else
                status = 'KAWIN'; // Default fallback if just "KAWIN"
            matched = true;
        }
        // Job
        else if (!job && v.match(/KARYAWAN|SWASTA|WIRASWASTA|PELAJAR|MENGURUS RUMAH|MAHASISWA|PEGAWAI|TENTARA|POLISI|GURU|PETANI|PEDAGANG|BURUH|DOKTER|PERAWAT|TNI|PNS/)) {
            job = v; // store the actual job title
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
    if (unclassified.length > 0)
        name = unclassified[0];
    // Ignore garbage padding at the end of OCR results (like signatures or dates)
    // Strict Indexing is the safest format for KTP since Name, Alamat, Kel/Desa, and Kec are strictly consecutive.
    if (unclassified.length >= 4) {
        alamat = unclassified[1];
        kelDesa = unclassified[2];
        kecamatan = unclassified[3];
    }
    else if (unclassified.length === 3) {
        alamat = unclassified[1];
        kecamatan = unclassified[2];
    }
    else if (unclassified.length === 2) {
        alamat = unclassified[1];
    }
    // 4. Parse RT/RW into separate values
    let rt = '';
    let rw = '';
    if (rtrw) {
        const rtRwMatch = rtrw.match(/(\d{1,3})\s*[\/\s]\s*(\d{1,3})/);
        if (rtRwMatch) {
            rt = rtRwMatch[1].padStart(3, '0');
            rw = rtRwMatch[2].padStart(3, '0');
        }
        else {
            // Single value — assume it's RT
            rt = rtrw.trim().padStart(3, '0');
        }
    }
    // 5. Build legacy address string for backward-compat
    const addressParts = [];
    if (alamat)
        addressParts.push(alamat);
    if (rtrw)
        addressParts.push(`RT/RW ${rtrw}`);
    if (kelDesa)
        addressParts.push(`KEL. ${kelDesa}`);
    if (kecamatan)
        addressParts.push(`KEC. ${kecamatan}`);
    const address = addressParts.join(', ');
    // 6. Handle GCS Upload
    let ktpPath = '';
    try {
        const fileName = `clients/ktp/${Date.now()}_${nik || 'unknown'}.jpg`;
        ktpPath = await (0, gcs_1.uploadToGcs)(imageBuffer, fileName, 'image/jpeg');
    }
    catch (err) {
        console.error('KTP GCS Upload failed:', err);
    }
    return {
        nik: nik.replace(/[:\-|!.;]/g, ''),
        name: name.replace(/[:\-|!.;]/g, '').trim().toUpperCase(),
        pob: pob.replace(/[:\-|!.;]/g, '').trim().toUpperCase(),
        dob: dob,
        gender: gender,
        maritalStatus: status,
        pekerjaan: job.replace(/[:\-|!.;]/g, '').trim().toUpperCase(),
        address: address.trim().toUpperCase(),
        street: alamat.replace(/[:\-|!.;]/g, '').trim().toUpperCase(),
        rt,
        rw,
        kelurahan: kelDesa.replace(/[:\-|!.;]/g, '').trim().toUpperCase(),
        kecamatan: kecamatan.replace(/[:\-|!.;]/g, '').trim().toUpperCase(),
        kota: kota.replace(/[:\-|!.;]/g, '').trim().toUpperCase(),
        provinsi: provinsi.replace(/[:\-|!.;]/g, '').trim().toUpperCase(),
        rawVisionText: fullTextResult,
        ktpPath: ktpPath
    };
}
/**
 * NPWP extraction logic
 */
async function extractNpwpData(imageBuffer) {
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
    }
    else {
        // Fallback search for just 15-16 digits
        const digitsOnly = fullTextResult.replace(/[^\d]/g, '');
        const fallbackMatch = digitsOnly.match(/\d{15,16}/);
        if (fallbackMatch)
            npwp = fallbackMatch[0];
    }
    // 2. Identify potential name
    // Usually the name is alone on a line near the NPWP label or the NPWP number
    const blacklist = ['NPWP', 'DIREKTORAT', 'JENDERAL', 'PAJAK', 'KEMENTERIAN', 'KEUANGAN', 'REPUBLIK', 'INDONESIA', 'KPP', 'PRATAMA'];
    for (let line of lines) {
        // If it's pure alphabetical and not in blacklist
        const cleanLine = line.replace(/[^A-Z\s]/g, '').trim();
        if (cleanLine.length > 3 && !blacklist.some(b => cleanLine.includes(b))) {
            // Potential name
            if (!name)
                name = cleanLine;
        }
    }
    // 3. Handle GCS Upload
    let npwpPath = '';
    try {
        const fileName = `clients/npwp/${Date.now()}_${npwp || 'unknown'}.jpg`;
        npwpPath = await (0, gcs_1.uploadToGcs)(imageBuffer, fileName, 'image/jpeg');
    }
    catch (err) {
        console.error('NPWP GCS Upload failed:', err);
    }
    return {
        npwp: npwp || '',
        name: name || '',
        rawVisionText: fullTextResult,
        npwpPath: npwpPath
    };
}
//# sourceMappingURL=vision.js.map