-- CreateTable
CREATE TABLE `analyses` (
    `id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `kind` ENUM('face', 'hair') NOT NULL DEFAULT 'face',
    `status` ENUM('pending', 'done', 'failed') NOT NULL DEFAULT 'pending',
    `session_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NULL,
    `image_key` VARCHAR(191) NULL,
    `provider_request_id` VARCHAR(191) NULL,
    `raw_result` JSON NULL,
    `error` TEXT NULL,
    `callback_status` ENUM('pending', 'sent', 'failed') NULL,

    INDEX `analyses_user_id_idx`(`user_id`),
    INDEX `analyses_session_id_idx`(`session_id`),
    INDEX `analyses_kind_idx`(`kind`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `analysis_issues` (
    `id` VARCHAR(191) NOT NULL,
    `analysis_id` VARCHAR(191) NOT NULL,
    `issue_type` VARCHAR(191) NOT NULL,
    `score` DOUBLE NULL,
    `confidence` DOUBLE NULL,
    `details` JSON NULL,

    INDEX `analysis_issues_analysis_id_idx`(`analysis_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `analysis_issues` ADD CONSTRAINT `analysis_issues_analysis_id_fkey` FOREIGN KEY (`analysis_id`) REFERENCES `analyses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
