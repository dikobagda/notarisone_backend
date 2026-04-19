const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

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
      `,
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
      `,
    },
  ];

  console.log('Seeding templates...');
  for (const t of templates) {
    await prisma.deedTemplate.create({
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
    await prisma.$disconnect();
  });
