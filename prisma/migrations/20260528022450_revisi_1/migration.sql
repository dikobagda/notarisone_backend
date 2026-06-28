/*
  Warnings:

  - The values [PENDING_APPROVAL,ARCHIVED] on the enum `Deed_status` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `auth0Id` on the `User` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[tenantId,nik]` on the table `Client` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[resetToken]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `type` to the `Deed` table without a default value. This is not possible if the table is not empty.
  - Added the required column `password` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX `Client_nik_key` ON `Client`;

-- DropIndex
DROP INDEX `User_auth0Id_key` ON `User`;

-- AlterTable
ALTER TABLE `Appointment` ADD COLUMN `clientId` VARCHAR(191) NULL,
    ADD COLUMN `deedId` VARCHAR(191) NULL,
    ADD COLUMN `googleEventId` VARCHAR(191) NULL,
    ADD COLUMN `location` VARCHAR(191) NULL,
    ADD COLUMN `status` ENUM('PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED') NOT NULL DEFAULT 'PENDING',
    ADD COLUMN `type` ENUM('SIGNING', 'CONSULTATION', 'FIELD_SURVEY', 'BPN_COORDINATION', 'OTHER') NOT NULL DEFAULT 'OTHER',
    ADD COLUMN `userId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Client` ADD COLUMN `dob` VARCHAR(191) NULL,
    ADD COLUMN `gender` VARCHAR(191) NULL,
    ADD COLUMN `kecamatan` VARCHAR(191) NULL,
    ADD COLUMN `kelurahan` VARCHAR(191) NULL,
    ADD COLUMN `kota` VARCHAR(191) NULL,
    ADD COLUMN `ktpPath` VARCHAR(191) NULL,
    ADD COLUMN `maritalStatus` VARCHAR(191) NULL,
    ADD COLUMN `npwp` VARCHAR(191) NULL,
    ADD COLUMN `npwpPath` VARCHAR(191) NULL,
    ADD COLUMN `pekerjaan` VARCHAR(191) NULL,
    ADD COLUMN `pob` VARCHAR(191) NULL,
    ADD COLUMN `provinsi` VARCHAR(191) NULL,
    ADD COLUMN `rt` VARCHAR(191) NULL,
    ADD COLUMN `rw` VARCHAR(191) NULL,
    ADD COLUMN `street` VARCHAR(191) NULL,
    ADD COLUMN `title` VARCHAR(191) NULL,
    MODIFY `address` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Deed` ADD COLUMN `attachments` JSON NULL,
    ADD COLUMN `scanPath` VARCHAR(191) NULL,
    ADD COLUMN `scanSize` BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN `serviceRequestId` VARCHAR(191) NULL,
    ADD COLUMN `targetFinalization` DATETIME(3) NULL,
    ADD COLUMN `type` ENUM('PENDIRIAN_PT', 'PENDIRIAN_CV', 'PENDIRIAN_YAYASAN', 'PENDIRIAN_PERKUMPULAN', 'AD_PERUBAHAN', 'JUAL_BELI', 'SEWA_MENYUWA', 'HIBAH', 'KERJASAMA', 'KREDIT', 'WASIAT', 'KUASA_MENJUAL', 'PPJB', 'RUPS', 'LAINNYA', 'AJB', 'TUKAR_MENUKAR', 'INBRENG', 'APHB', 'APHT', 'APHT_NOVASI', 'SKMHT', 'HGB', 'HGU', 'HP', 'PPAT') NOT NULL,
    MODIFY `status` ENUM('DRAFT', 'PENDING_CLIENT', 'FINAL', 'INVALIDATED') NOT NULL DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE `DeedVersion` ADD COLUMN `fileSize` BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN `googleDriveFileId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Tenant` ADD COLUMN `aiEnabled` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `lastPaymentId` VARCHAR(191) NULL,
    ADD COLUMN `status` ENUM('ACTIVE', 'SUSPENDED', 'TRIAL') NOT NULL DEFAULT 'ACTIVE',
    ADD COLUMN `subscription` ENUM('TRIAL', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE') NOT NULL DEFAULT 'TRIAL',
    ADD COLUMN `subscriptionExpiresAt` DATETIME(3) NULL,
    ADD COLUMN `trialExpiresAt` DATETIME(3) NULL,
    MODIFY `subdomain` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `User` DROP COLUMN `auth0Id`,
    ADD COLUMN `allowedMenus` JSON NULL,
    ADD COLUMN `googleAccessToken` TEXT NULL,
    ADD COLUMN `googleCalendarId` VARCHAR(191) NULL,
    ADD COLUMN `googleRefreshToken` TEXT NULL,
    ADD COLUMN `googleTokenExpiry` DATETIME(3) NULL,
    ADD COLUMN `isLocked` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `password` VARCHAR(191) NOT NULL,
    ADD COLUMN `phone` VARCHAR(191) NULL,
    ADD COLUMN `resetToken` VARCHAR(191) NULL,
    ADD COLUMN `resetTokenExpiry` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `TenantTeams` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `role` ENUM('NOTARIS', 'PEGAWAI', 'KLIEN') NOT NULL DEFAULT 'PEGAWAI',
    `token` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `acceptedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `phone` VARCHAR(191) NULL,
    `allowedMenus` JSON NULL,

    UNIQUE INDEX `TenantTeams_token_key`(`token`),
    INDEX `TenantTeams_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DeedStakeholder` (
    `id` VARCHAR(191) NOT NULL,
    `deedId` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `role` VARCHAR(191) NOT NULL,
    `ktpPath` VARCHAR(191) NULL,
    `ktpSize` BIGINT NOT NULL DEFAULT 0,
    `npwpPath` VARCHAR(191) NULL,
    `npwpSize` BIGINT NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `DeedStakeholder_clientId_fkey`(`clientId`),
    INDEX `DeedStakeholder_deedId_fkey`(`deedId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AdminUser` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `password` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `role` ENUM('SUPERADMIN', 'STAFF') NOT NULL DEFAULT 'STAFF',
    `isLocked` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AdminUser_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Invoice` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `deedId` VARCHAR(191) NULL,
    `invoiceNumber` VARCHAR(191) NOT NULL,
    `status` ENUM('UNPAID', 'PARTIAL', 'PAID', 'VOID', 'OVERDUE') NOT NULL DEFAULT 'UNPAID',
    `subtotal` DECIMAL(15, 2) NOT NULL,
    `taxAmount` DECIMAL(15, 2) NOT NULL,
    `totalAmount` DECIMAL(15, 2) NOT NULL,
    `dueDate` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Invoice_invoiceNumber_key`(`invoiceNumber`),
    INDEX `Invoice_clientId_fkey`(`clientId`),
    INDEX `Invoice_deedId_fkey`(`deedId`),
    INDEX `Invoice_tenantId_fkey`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InvoiceItem` (
    `id` VARCHAR(191) NOT NULL,
    `invoiceId` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `unitPrice` DECIMAL(15, 2) NOT NULL,
    `taxable` BOOLEAN NOT NULL DEFAULT true,
    `taxType` VARCHAR(191) NOT NULL DEFAULT 'NONE',
    `taxRate` DECIMAL(5, 2) NOT NULL DEFAULT 0.0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `InvoiceItem_invoiceId_fkey`(`invoiceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Payment` (
    `id` VARCHAR(191) NOT NULL,
    `invoiceId` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(15, 2) NOT NULL,
    `method` ENUM('CASH', 'TRANSFER', 'GATEWAY') NOT NULL,
    `status` ENUM('PENDING', 'SUCCESS', 'FAILED') NOT NULL DEFAULT 'SUCCESS',
    `pgTransactionId` VARCHAR(191) NULL,
    `paymentDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Payment_invoiceId_fkey`(`invoiceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DeedTemplate` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `type` ENUM('PENDIRIAN_PT', 'PENDIRIAN_CV', 'PENDIRIAN_YAYASAN', 'PENDIRIAN_PERKUMPULAN', 'AD_PERUBAHAN', 'JUAL_BELI', 'SEWA_MENYUWA', 'HIBAH', 'KERJASAMA', 'KREDIT', 'WASIAT', 'KUASA_MENJUAL', 'PPJB', 'RUPS', 'LAINNYA', 'AJB', 'TUKAR_MENUKAR', 'INBRENG', 'APHB', 'APHT', 'APHT_NOVASI', 'SKMHT', 'HGB', 'HGU', 'HP', 'PPAT') NOT NULL,
    `content` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PpatMetadata` (
    `id` VARCHAR(191) NOT NULL,
    `deedId` VARCHAR(191) NOT NULL,
    `nop` VARCHAR(191) NULL,
    `luasTanah` DOUBLE NULL,
    `luasBangunan` DOUBLE NULL,
    `lokasiAlamat` TEXT NULL,
    `latitude` DOUBLE NULL,
    `longitude` DOUBLE NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PpatMetadata_deedId_key`(`deedId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SubscriptionPlan` (
    `id` VARCHAR(191) NOT NULL,
    `slug` ENUM('TRIAL', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE') NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `tagline` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `price` DECIMAL(15, 2) NOT NULL,
    `features` JSON NOT NULL,
    `isPopular` BOOLEAN NOT NULL DEFAULT false,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `SubscriptionPlan_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Notification` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `type` ENUM('INFO', 'SUCCESS', 'URGENT', 'WARNING') NOT NULL DEFAULT 'INFO',
    `isRead` BOOLEAN NOT NULL DEFAULT false,
    `actionUrl` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Notification_tenantId_idx`(`tenantId`),
    INDEX `Notification_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `XenditLog` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NULL,
    `externalId` VARCHAR(191) NULL,
    `type` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NULL,
    `payload` JSON NOT NULL,
    `response` JSON NULL,
    `headers` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `XenditLog_tenantId_idx`(`tenantId`),
    INDEX `XenditLog_externalId_idx`(`externalId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Waarmerking` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `nomorDaftar` VARCHAR(191) NULL,
    `clientId` VARCHAR(191) NULL,
    `pemohon` VARCHAR(191) NOT NULL,
    `perihal` VARCHAR(191) NOT NULL,
    `keterangan` TEXT NULL,
    `tanggalDaftar` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `jumlahHalaman` INTEGER NOT NULL DEFAULT 1,
    `biaya` DECIMAL(15, 2) NULL,
    `status` ENUM('PENDING', 'SELESAI', 'DIBATALKAN') NOT NULL DEFAULT 'PENDING',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `Waarmerking_nomorDaftar_key`(`nomorDaftar`),
    INDEX `Waarmerking_tenantId_idx`(`tenantId`),
    INDEX `Waarmerking_clientId_idx`(`clientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ServiceRequest` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NULL,
    `clientName` VARCHAR(191) NULL,
    `clientPhone` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `serviceCategory` ENUM('AKTA', 'PPAT', 'NON_AKTA') NOT NULL,
    `documents` JSON NOT NULL,
    `additionalJobs` TEXT NULL,
    `estimatedCost` DECIMAL(15, 2) NULL,
    `status` ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `toNotaryStatus` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `toNotaryDate` DATETIME(3) NULL,
    `toNotaryProof` TEXT NULL,
    `toClientStatus` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `toClientDate` DATETIME(3) NULL,
    `toClientProof` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `subCategory` VARCHAR(191) NULL,

    INDEX `ServiceRequest_clientId_idx`(`clientId`),
    INDEX `ServiceRequest_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AdditionalJobMaster` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `price` DECIMAL(15, 2) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AdditionalJobMaster_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BankAccount` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `bankName` VARCHAR(191) NOT NULL,
    `accountNumber` VARCHAR(191) NOT NULL,
    `accountHolder` VARCHAR(191) NOT NULL,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `BankAccount_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LibraryItem` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `category` VARCHAR(191) NOT NULL,
    `fileType` VARCHAR(191) NOT NULL,
    `fileUrl` VARCHAR(191) NULL,
    `downloads` INTEGER NOT NULL DEFAULT 0,
    `isPremium` BOOLEAN NOT NULL DEFAULT false,
    `status` VARCHAR(191) NOT NULL DEFAULT 'APPROVED',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `LibraryItem_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SystemSetting` (
    `id` VARCHAR(191) NOT NULL DEFAULT 'SYSTEM',
    `maintenanceMode` BOOLEAN NOT NULL DEFAULT false,
    `maintenanceMsg` VARCHAR(191) NOT NULL DEFAULT 'Kami sedang melakukan pemeliharaan sistem rutin...',
    `bannerActive` BOOLEAN NOT NULL DEFAULT false,
    `bannerText` VARCHAR(191) NOT NULL DEFAULT 'Selamat datang di Penagraha!',
    `gcloudPath` VARCHAR(191) NOT NULL DEFAULT 'gs://notarisone-prod-deeds',
    `auth0Domain` VARCHAR(191) NOT NULL DEFAULT 'auth.notarisone.id',
    `logoUrl` LONGTEXT NOT NULL,
    `aiAgentActive` BOOLEAN NOT NULL DEFAULT true,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ServiceFeeMaster` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `category` VARCHAR(191) NOT NULL,
    `price` DECIMAL(15, 2) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ServiceFeeMaster_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RequiredDocumentMaster` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `category` VARCHAR(191) NOT NULL,
    `isRequired` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `RequiredDocumentMaster_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DeedTypeMaster` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `category` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `DeedTypeMaster_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Appointment_clientId_fkey` ON `Appointment`(`clientId`);

-- CreateIndex
CREATE INDEX `Appointment_deedId_fkey` ON `Appointment`(`deedId`);

-- CreateIndex
CREATE INDEX `Appointment_userId_fkey` ON `Appointment`(`userId`);

-- CreateIndex
CREATE UNIQUE INDEX `Client_tenantId_nik_key` ON `Client`(`tenantId`, `nik`);

-- CreateIndex
CREATE UNIQUE INDEX `User_resetToken_key` ON `User`(`resetToken`);

-- AddForeignKey
ALTER TABLE `TenantTeams` ADD CONSTRAINT `TenantTeams_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Deed` ADD CONSTRAINT `Deed_serviceRequestId_fkey` FOREIGN KEY (`serviceRequestId`) REFERENCES `ServiceRequest`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DeedStakeholder` ADD CONSTRAINT `DeedStakeholder_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DeedStakeholder` ADD CONSTRAINT `DeedStakeholder_deedId_fkey` FOREIGN KEY (`deedId`) REFERENCES `Deed`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Appointment` ADD CONSTRAINT `Appointment_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Appointment` ADD CONSTRAINT `Appointment_deedId_fkey` FOREIGN KEY (`deedId`) REFERENCES `Deed`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Appointment` ADD CONSTRAINT `Appointment_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Invoice` ADD CONSTRAINT `Invoice_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Invoice` ADD CONSTRAINT `Invoice_deedId_fkey` FOREIGN KEY (`deedId`) REFERENCES `Deed`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Invoice` ADD CONSTRAINT `Invoice_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InvoiceItem` ADD CONSTRAINT `InvoiceItem_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `Invoice`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `Invoice`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PpatMetadata` ADD CONSTRAINT `PpatMetadata_deedId_fkey` FOREIGN KEY (`deedId`) REFERENCES `Deed`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `XenditLog` ADD CONSTRAINT `XenditLog_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Waarmerking` ADD CONSTRAINT `Waarmerking_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Waarmerking` ADD CONSTRAINT `Waarmerking_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ServiceRequest` ADD CONSTRAINT `ServiceRequest_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ServiceRequest` ADD CONSTRAINT `ServiceRequest_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AdditionalJobMaster` ADD CONSTRAINT `AdditionalJobMaster_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BankAccount` ADD CONSTRAINT `BankAccount_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LibraryItem` ADD CONSTRAINT `LibraryItem_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ServiceFeeMaster` ADD CONSTRAINT `ServiceFeeMaster_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RequiredDocumentMaster` ADD CONSTRAINT `RequiredDocumentMaster_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DeedTypeMaster` ADD CONSTRAINT `DeedTypeMaster_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
