import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import bcrypt from 'bcryptjs';
import 'dotenv/config';

const adapter = new PrismaMariaDb(process.env.DATABASE_URL || '');
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding database...');

  // 0. Create Super Admin
  const admin = await prisma.adminUser.upsert({
    where: { email: 'admin@notarisone.id' },
    update: {},
    create: {
      email: 'admin@notarisone.id',
      password: 'password123', // In prod, this must be hashed
      name: 'Super Admin NotarisOne',
      role: 'SUPERADMIN',
    },
  });

  console.log(`Created admin user: ${admin.email}`);

  // 1. Create Tenant
  const tenant = await prisma.tenant.upsert({
    where: { subdomain: 'ahmad' },
    update: {},
    create: {
      name: 'Kantor Notaris Ahmad, S.H., M.Kn.',
      subdomain: 'ahmad',
      address: 'Jl. Jenderal Sudirman No. 123, Jakarta Selatan',
      subscription: 'ENTERPRISE',
    },
  });

  console.log(`Created tenant: ${tenant.name} (${tenant.id})`);

  // 2. Create User
  const hashedPassword = await bcrypt.hash('ahmad123', 10);
  const user = await prisma.user.upsert({
    where: { email: 'ahmad@notarisone.com' },
    update: {},
    create: {
      email: 'ahmad@notarisone.com',
      name: 'Ahmad Muzaki',
      role: 'NOTARIS',
      tenantId: tenant.id,
      password: hashedPassword,
    },
  });

  console.log(`Created user: ${user.name}`);

  // 2.5. Create default required documents master data
  const defaultDocs = [
    { name: 'KTP', description: 'Kartu Tanda Penduduk Pemohon', category: 'ALL', isRequired: true },
    { name: 'KK', description: 'Kartu Keluarga Pemohon', category: 'ALL', isRequired: true },
    { name: 'NPWP', description: 'Nomor Pokok Wajib Pajak Pemohon', category: 'ALL', isRequired: true },
    { name: 'Sertifikat', description: 'Sertifikat Tanah (Asli)', category: 'PPAT', isRequired: true },
    { name: 'PBB', description: 'Pajak Bumi dan Bangunan (Tahun Terakhir)', category: 'PPAT', isRequired: true },
  ];

  // Seed for ALL existing tenants in the database to ensure existing active tenants get populated
  const allTenants = await prisma.tenant.findMany();
  console.log(`Found ${allTenants.length} tenants in database. Seeding default documents for each...`);

  for (const t of allTenants) {
    for (const doc of defaultDocs) {
      const existingDoc = await prisma.requiredDocumentMaster.findFirst({
        where: { tenantId: t.id, name: doc.name }
      });
      if (!existingDoc) {
        await prisma.requiredDocumentMaster.create({
          data: {
            tenantId: t.id,
            name: doc.name,
            description: doc.description,
            category: doc.category,
            isRequired: doc.isRequired,
          }
        });
      }
    }
  }
  console.log('Created default required documents master data for all tenants');

  // 2.6. Create default deed types master data
  const defaultDeedTypes = [
    // NOTARY
    { name: "Pendirian Perseroan Terbatas (PT)", category: "NOTARY" as const, code: "PENDIRIAN_PT" },
    { name: "Pendirian CV / Firma", category: "NOTARY" as const, code: "PENDIRIAN_CV" },
    { name: "Pendirian Yayasan", category: "NOTARY" as const, code: "PENDIRIAN_YAYASAN" },
    { name: "Pendirian Perkumpulan", category: "NOTARY" as const, code: "PENDIRIAN_PERKUMPULAN" },
    { name: "Perubahan Anggaran Dasar", category: "NOTARY" as const, code: "AD_PERUBAHAN" },
    { name: "Perjanjian Sewa Menyewa", category: "NOTARY" as const, code: "SEWA_MENYUWA" },
    { name: "Perjanjian Kerjasama (Joint Venture)", category: "NOTARY" as const, code: "KERJASAMA" },
    { name: "Perjanjian Kredit", category: "NOTARY" as const, code: "KREDIT" },
    { name: "Akta Jual Beli Saham", category: "NOTARY" as const, code: "JUAL_BELI" },
    { name: "Akta Wasiat", category: "NOTARY" as const, code: "WASIAT" },
    { name: "Akta Kuasa Menjual", category: "NOTARY" as const, code: "KUASA_MENJUAL" },
    { name: "Pengikatan Jual Beli (PPJB)", category: "NOTARY" as const, code: "PPJB" },
    { name: "Berita Acara Rapat (RUPS)", category: "NOTARY" as const, code: "RUPS" },
    { name: "Surat Kuasa Membebankan Hak Tanggungan (SKMHT)", category: "NOTARY" as const, code: "SKMHT" },
    { name: "Hibah", category: "NOTARY" as const, code: "HIBAH" },
    { name: "Lainnya", category: "NOTARY" as const, code: "LAINNYA" },
    // PPAT
    { name: "Akta Jual Beli (AJB)", category: "PPAT" as const, code: "AJB" },
    { name: "Akta Hibah", category: "PPAT" as const, code: "HIBAH" },
    { name: "Akta Tukar Menukar", category: "PPAT" as const, code: "TUKAR_MENUKAR" },
    { name: "Akta Pemasukan Ke Dalam Perusahaan (Inbreng)", category: "PPAT" as const, code: "INBRENG" },
    { name: "Akta Pembagian Hak Bersama (APHB)", category: "PPAT" as const, code: "APHB" },
    { name: "Akta Pemberian Hak Tanggungan (APHT)", category: "PPAT" as const, code: "APHT" },
    { name: "Akta Pemberian Hak Tanggungan Novasi (APHT-Novasi)", category: "PPAT" as const, code: "APHT_NOVASI" },
    { name: "Surat Kuasa Membebankan Hak Tanggungan (SKMHT)", category: "PPAT" as const, code: "SKMHT" },
    { name: "Akta Pemberian Hak Guna Bangunan (HGB)", category: "PPAT" as const, code: "HGB" },
    { name: "Akta Pemberian Hak Guna Usaha (HGU)", category: "PPAT" as const, code: "HGU" },
    { name: "Akta Pemberian Hak Pakai (HP)", category: "PPAT" as const, code: "HP" },
  ];

  console.log(`Seeding default deed types for ${allTenants.length} tenants...`);
  for (const t of allTenants) {
    for (const type of defaultDeedTypes) {
      const existingType = await prisma.deedTypeMaster.findFirst({
        where: { tenantId: t.id, code: type.code, category: type.category }
      });
      if (!existingType) {
        await prisma.deedTypeMaster.create({
          data: {
            tenantId: t.id,
            name: type.name,
            code: type.code,
            category: type.category,
          }
        });
      }
    }
  }
  console.log('Created default deed types master data for all tenants');

  // 3. Create initial clients
  const client1 = await prisma.client.upsert({
    where: {
      tenantId_nik: {
        tenantId: tenant.id,
        nik: '3171012345678901',
      }
    },
    update: {},
    create: {
      name: 'Budi Santoso',
      nik: '3171012345678901',
      email: 'budi.santoso@email.com',
      phone: '08123456789',
      address: 'Jl. Melati No. 5, Jakarta',
      tenantId: tenant.id,
    },
  });

  const client2 = await prisma.client.upsert({
    where: {
      tenantId_nik: {
        tenantId: tenant.id,
        nik: '3271012345678902',
      }
    },
    update: {},
    create: {
      name: 'Siti Aminah',
      nik: '3271012345678902',
      email: 'siti.aminah@email.com',
      phone: '08129876543',
      address: 'Jl. Mawar No. 10, Bandung',
      tenantId: tenant.id,
    },
  });

  console.log('Created initial clients');

  // 4. Create a sample Deed (Akta)
  const existingDeed = await prisma.deed.findFirst({
    where: {
      title: 'Akta Pendirian PT Maju Jaya',
      tenantId: tenant.id,
      clientId: client1.id,
    }
  });

  if (!existingDeed) {
    await prisma.deed.create({
      data: {
        title: 'Akta Pendirian PT Maju Jaya',
        type: 'PENDIRIAN_PT',
        status: 'DRAFT',
        tenant: { connect: { id: tenant.id } },
        client: { connect: { id: client1.id } },
        createdBy: { connect: { id: user.id } },
      },
    });
  }

  console.log('Created sample deed');
  console.log('Seeding completed successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    // Adapter handle cleanup internally but good to close client
    await prisma.$disconnect();
  });
