import 'dotenv/config';
import { prisma } from './lib/prisma';

async function main() {
  console.log('Seeding Subscription Plans...');

  const plans = [
    {
      slug: 'TRIAL',
      name: 'TRIAL',
      tagline: 'Coba semua fitur gratis selama 30 hari.',
      price: 0,
      isPopular: false,
      features: [
        { text: "1 Akun Notaris", icon: "Users" },
        { text: "Manajemen Akta Dasar", icon: "FileText" },
        { text: "Penyimpanan 5 GB", icon: "HardDrive" },
        { text: "Akses Penuh 30 Hari", icon: "Zap" },
      ],
    },
    {
      slug: 'STARTER',
      name: 'STARTER',
      tagline: 'Cocok untuk Notaris baru atau praktik tunggal.',
      price: 99000,
      isPopular: false,
      features: [
        { text: "1 Akun Notaris", icon: "Users" },
        { text: "Manajemen Akta Dasar", icon: "FileText" },
        { text: "Penyimpanan 5 GB", icon: "HardDrive" },
        { text: "Riwayat 30 Hari", icon: "History" },
        { text: "Keamanan Standar", icon: "ShieldCheck" },
        { text: "Dukungan Email", icon: "CheckCircle2" },
      ],
    },
    {
      slug: 'PROFESSIONAL',
      name: 'PROFESSIONAL',
      tagline: 'Ideal untuk kantor Notaris dengan staf/pegawai.',
      price: 249000,
      isPopular: true,
      features: [
        { text: "Hingga 5 Anggota Tim", icon: "Users" },
        { text: "Manajemen Tim & Izin", icon: "ShieldCheck" },
        { text: "Template Akta Kustom", icon: "FileText" },
        { text: "Penyimpanan 50 GB", icon: "HardDrive" },
        { text: "Audit Log (Basic)", icon: "History" },
        { text: "Dukungan Prioritas", icon: "CheckCircle2" },
      ],
    },
    {
      slug: 'ENTERPRISE',
      name: 'ENTERPRISE',
      tagline: 'Solusi lengkap untuk kantor Notaris skala besar.',
      price: 1000000, // Testing price
      isPopular: false,
      features: [
        { text: "Anggota Tim Tanpa Batas", icon: "Users" },
        { text: "Enkripsi Data Berlapis", icon: "Lock" },
        { text: "Audit Log Lengkap", icon: "History" },
        { text: "Penyimpanan 500 GB", icon: "HardDrive" },
        { text: "Subdomain Kustom", icon: "Zap" },
        { text: "Manager Pendamping Khusus", icon: "Crown" },
      ],
    },
  ];

  for (const plan of plans) {
    await prisma.subscriptionPlan.upsert({
      where: { slug: plan.slug as any },
      update: plan as any,
      create: plan as any,
    });
  }

  console.log('Subscription Plans seeded successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
