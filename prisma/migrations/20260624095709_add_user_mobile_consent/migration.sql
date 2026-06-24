-- AlterTable
ALTER TABLE `users` ADD COLUMN `consent_at` DATETIME(3) NULL,
    ADD COLUMN `mobile` VARCHAR(191) NULL;
