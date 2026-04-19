import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import 'dotenv/config';

// Initialize Prisma with MariaDB adapter as required by the project setup
const adapter = new PrismaMariaDb(process.env.DATABASE_URL || '');
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('--- Starting PPAT Data Generation ---');

  // 1. Get or Create Tenant & User
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

  const user = await prisma.user.findFirst({
    where: { tenantId: tenant.id },
  });

  if (!user) {
    console.error('Initial user not found. Please run regular seed first.');
    return;
  }

  console.log(`Target Tenant: ${tenant.name} (${tenant.id})`);
  console.log(`Target User: ${user.name} (${user.id})`);

  // 2. Define Sample Clients
  const sampleClients = [
    {
      name: 'Heri Kusnadi',
      nik: '3174012903750001',
      npwp: '01.234.567.8-012.000',
      address: 'Perumahan Griya Asri Blok B1 No. 12, Bekasi',
      email: 'heri.kusnadi@email.com',
      phone: '081211223344',
    },
    {
      name: 'Dewi Lestari',
      nik: '3273014506820002',
      npwp: '02.345.678.9-023.000',
      address: 'Apartemen Kalibata City Tower Borneo Lt. 15, Jakarta Selatan',
      email: 'dewi.lestari82@email.com',
      phone: '081322334455',
    },
    {
      name: 'Rahmat Hidayat',
      nik: '3578011212700003',
      npwp: '03.456.789.0-034.000',
      address: 'Jl. Ahmad Yani No. 45, Surabaya',
      email: 'rahmat.h@email.com',
      phone: '081133445566',
    },
    {
      name: 'Linda Wijaya',
      nik: '3171015607900004',
      npwp: '04.567.890.1-045.000',
      address: 'Menteng Residence Kav. 8, Jakarta Pusat',
      email: 'linda.wijaya@email.com',
      phone: '081244556677',
    },
    {
      name: 'Agus Setiawan',
      nik: '3201010101650005',
      npwp: '05.678.901.2-056.000',
      address: 'Jl. Raya Bogor KM 30, Depok',
      email: 'agus.setiawan@email.com',
      phone: '085655667788',
    }
  ];

  console.log('Creating clients...');
  const createdClients = [];
  for (const c of sampleClients) {
    const client = await prisma.client.upsert({
      where: { nik: c.nik },
      update: {},
      create: {
        ...c,
        tenantId: tenant.id,
      },
    });
    createdClients.push(client);
  }
  console.log(`Created/Ensured ${createdClients.length} clients.`);

  // 3. Define PPAT Deeds
  const ppatDeeds = [
    {
      title: 'AJB Tanah & Bangunan - Heri Kusnadi',
      type: 'AJB',
      metadata: {
        nop: '32.75.010.001.002-0003.0',
        luasTanah: 250,
        luasBangunan: 180,
        lokasiAlamat: 'Perumahan Griya Asri Blok B1 No. 12, Bekasi Timur',
        latitude: -6.234567,
        longitude: 107.012345,
      }
    },
    {
      title: 'APHT atas Tanah Rahmat Hidayat',
      type: 'APHT',
      metadata: {
        nop: '35.78.040.005.010-0123.0',
        luasTanah: 500,
        luasBangunan: 0,
        lokasiAlamat: 'Jl. Ahmad Yani KM 15, Surabaya Industrial Estate',
        latitude: -7.345678,
        longitude: 112.789012,
      }
    },
    {
      title: 'Akta Hibah Lahan Menteng - Linda Wijaya',
      type: 'HIBAH',
      metadata: {
        nop: '31.71.030.002.008-0056.0',
        luasTanah: 1200,
        luasBangunan: 600,
        lokasiAlamat: 'Jl. Teuku Umar No. 8, Menteng, Jakarta Pusat',
        latitude: -6.189012,
        longitude: 106.834567,
      }
    },
    {
      title: 'APHB Warisan Keluarga Dewi Lestari',
      type: 'APHB',
      metadata: {
        nop: '32.73.050.012.001-0890.0',
        luasTanah: 350,
        luasBangunan: 200,
        lokasiAlamat: 'Jl. Pasteur No. 12, Bandung Kota',
        latitude: -6.890123,
        longitude: 107.567890,
      }
    },
    {
      title: 'SKMHT Ruko Depok - Agus Setiawan',
      type: 'SKMHT',
      metadata: {
        nop: '32.01.080.020.005-0432.0',
        luasTanah: 150,
        luasBangunan: 300,
        lokasiAlamat: 'Jl. Margonda Raya No. 100, Depok',
        latitude: -6.345678,
        longitude: 106.812345,
      }
    }
  ];

  console.log('Creating PPAT deeds and metadata...');
  for (let i = 0; i < ppatDeeds.length; i++) {
    const d = ppatDeeds[i];
    const client = createdClients[i % createdClients.length];

    const deed = await prisma.deed.create({
      data: {
        title: d.title,
        type: d.type as any,
        status: i % 2 === 0 ? 'DRAFT' : 'PENDING_CLIENT',
        tenantId: tenant.id,
        clientId: client.id,
        createdById: user.id,
        ppatData: {
          create: d.metadata,
        },
      },
    });
    console.log(`- Created ${deed.type}: ${deed.title}`);
  }

  console.log('--- Data Generation Completed Successfully ---');
}

main()
  .catch((e) => {
    console.error('Error during data generation:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
