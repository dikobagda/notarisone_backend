"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const prisma_1 = require("../src/lib/prisma");
async function main() {
    const templates = [
        {
            title: 'Pendirian Perseroan Terbatas (PT)',
            type: 'PENDIRIAN_PT',
            content: `
AKTA PENDIRIAN PERSEROAN TERBATAS
PT [[NAMA_PERSEROAN]]

Pada hari ini, [[TANGGAL_SEKARANG]], menghadap kepada saya, Notaris di Jakarta, dengan saksi-saksi yang saya kenal:

1. Tuan/Nyonya [[NAMA_KLIEN]], pemegang NIK [[NIK_KLIEN]], beralamat di [[ALAMAT_KLIEN]].

Para penghadap sepakat untuk mendirikan sebuah Perseroan Terbatas dengan ketentuan sebagai berikut:
Pasal 1: Nama Perseroan adalah PT [[NAMA_PERSEROAN]].
Pasal 2: Tempat kedudukan di [[ALAMAT_KLIEN]].
... (Konten standar UU Cipta Kerja)
      `.trim(),
        },
        {
            title: 'Akta Jual Beli Tanah & Bangunan',
            type: 'JUAL_BELI',
            content: `
AKTA JUAL BELI
Nomor: [[NOMOR_AKTA]]

Pada hari ini, [[TANGGAL_SEKARANG]], kami yang bertanda tangan di bawah ini:

I. [[NAMA_KLIEN]], NIK [[NIK_KLIEN]], beralamat di [[ALAMAT_KLIEN]], selanjutnya disebut PENJUAL.

Penjual dengan ini menjual kepada Pembeli sebidang tanah Hak Milik Nomor [[NOMOR_Sertifikat]] yang terletak di [[LOKASI_TANAH]].
      `.trim(),
        },
    ];
    console.log('Seeding templates...');
    for (const t of templates) {
        await prisma_1.prisma.deedTemplate.create({
            data: t,
        });
    }
    console.log('Seeding finished.');
}
main()
    .catch((e) => {
    console.error(e);
    process.exit(1);
})
    .finally(async () => {
    // prisma.$disconnect is sometimes missing on extended clients without cast
    process.exit(0);
});
//# sourceMappingURL=seed-templates.js.map