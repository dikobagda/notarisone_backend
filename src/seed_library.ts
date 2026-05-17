import 'dotenv/config';
import { prisma } from '@/lib/prisma';

const TEMPLATES = [
  {
    title: "Draft Akta Pendirian PT",
    description: "Template standar akta pendirian Perseroan Terbatas sesuai UU Cipta Kerja.",
    category: "Akta Notaris",
    fileType: "DOCX",
    downloads: 145,
    isPremium: false,
  },
  {
    title: "Draft Akta Jual Beli (AJB) Tanah",
    description: "Template akta jual beli tanah untuk PPAT. Standar BPN.",
    category: "Akta PPAT",
    fileType: "DOCX",
    downloads: 89,
    isPremium: true,
  },
  {
    title: "Perjanjian Kerjasama (MOU)",
    description: "Template umum perjanjian kerjasama antar perusahaan.",
    category: "Non-Akta",
    fileType: "DOCX",
    downloads: 210,
    isPremium: false,
  },
  {
    title: "Draft Akta Hibah",
    description: "Template akta hibah harta bergerak dan tidak bergerak.",
    category: "Akta Notaris",
    fileType: "DOCX",
    downloads: 56,
    isPremium: true,
  },
  {
    title: "SOP Pengarsipan Kantor Notaris",
    description: "Panduan standar operasional untuk pengelolaan arsip fisik dan digital.",
    category: "SOP & Regulasi",
    fileType: "PDF",
    downloads: 78,
    isPremium: false,
  },
  {
    title: "Template Waarmerking Surat Dibawah Tangan",
    description: "Format pembukuan dan cap untuk waarmerking.",
    category: "Non-Akta",
    fileType: "DOCX",
    downloads: 122,
    isPremium: false,
  },
];

async function main() {
  console.log('Seeding library items...');
  for (const item of TEMPLATES) {
    await prisma.libraryItem.create({
      data: {
        ...item,
        status: 'APPROVED',
      },
    });
  }
  console.log('Seeding done!');
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());
