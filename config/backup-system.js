const fs = require('fs');
const path = require('path');
const { logger } = require('./logger');
const { getSetting } = require('./settingsManager');

class BackupSystem {
    constructor() {
        this.backupDir = path.join(__dirname, '../backups');
        this.dataFiles = [
            'logs/packages.json',
            'logs/customers.json', 
            'logs/invoices.json',
            'logs/trouble_reports.json',
            'logs/onu-locations.json',
            'settings.json'
        ];
        this.maxBackups = parseInt(getSetting('backup_max_files', '30')); // Default 30 backup files
        this.backupInterval = parseInt(getSetting('backup_interval_hours', '6')) * 60 * 60 * 1000; // Default 6 jam
        this.isRunning = false;
        this.backupTimer = null;
    }

    // Inisialisasi sistem backup
    initialize() {
        try {
            // Pastikan direktori backup ada
            if (!fs.existsSync(this.backupDir)) {
                fs.mkdirSync(this.backupDir, { recursive: true });
                logger.info(`📁 Backup directory created: ${this.backupDir}`);
            }

            // Mulai backup otomatis
            this.startAutomaticBackup();
            
            logger.info('✅ Backup system initialized successfully');
        } catch (error) {
            logger.error('❌ Error initializing backup system:', error);
        }
    }

    // Mulai backup otomatis
    startAutomaticBackup() {
        if (this.isRunning) {
            logger.warn('⚠️ Backup system is already running');
            return;
        }

        this.isRunning = true;
        
        // Backup pertama kali saat startup
        this.createBackup();

        // Set timer untuk backup berkala
        this.backupTimer = setInterval(() => {
            this.createBackup();
        }, this.backupInterval);

        logger.info(`🔄 Automatic backup started - interval: ${this.backupInterval / (60 * 60 * 1000)} hours`);
    }

    // Hentikan backup otomatis
    stopAutomaticBackup() {
        if (this.backupTimer) {
            clearInterval(this.backupTimer);
            this.backupTimer = null;
        }
        this.isRunning = false;
        logger.info('⏹️ Automatic backup stopped');
    }

    // Buat backup manual
    async createBackup(backupName = null) {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupNameFinal = backupName || `backup-${timestamp}`;
            const backupPath = path.join(this.backupDir, backupNameFinal);

            // Buat direktori backup
            if (!fs.existsSync(backupPath)) {
                fs.mkdirSync(backupPath, { recursive: true });
            }

            let successCount = 0;
            let errorCount = 0;

            // Backup setiap file data
            for (const filePath of this.dataFiles) {
                try {
                    const sourcePath = path.join(__dirname, '..', filePath);
                    
                    if (fs.existsSync(sourcePath)) {
                        const fileName = path.basename(filePath);
                        const destPath = path.join(backupPath, fileName);
                        
                        // Copy file
                        fs.copyFileSync(sourcePath, destPath);
                        successCount++;
                        
                        logger.debug(`📄 Backed up: ${filePath} -> ${fileName}`);
                    } else {
                        logger.warn(`⚠️ File not found: ${filePath}`);
                    }
                } catch (error) {
                    errorCount++;
                    logger.error(`❌ Error backing up ${filePath}:`, error.message);
                }
            }

            // Buat file metadata backup
            const metadata = {
                timestamp: new Date().toISOString(),
                backupName: backupNameFinal,
                files: this.dataFiles,
                successCount,
                errorCount,
                version: '1.0.0',
                system: {
                    nodeVersion: process.version,
                    platform: process.platform,
                    arch: process.arch
                }
            };

            const metadataPath = path.join(backupPath, 'backup-metadata.json');
            fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

            // Cleanup backup lama
            this.cleanupOldBackups();

            if (errorCount === 0) {
                logger.info(`✅ Backup created successfully: ${backupNameFinal} (${successCount} files)`);
                return {
                    success: true,
                    backupName: backupNameFinal,
                    backupPath,
                    filesBackedUp: successCount,
                    errors: errorCount
                };
            } else {
                logger.warn(`⚠️ Backup completed with errors: ${backupNameFinal} (${successCount} files, ${errorCount} errors)`);
                return {
                    success: false,
                    backupName: backupNameFinal,
                    backupPath,
                    filesBackedUp: successCount,
                    errors: errorCount
                };
            }

        } catch (error) {
            logger.error('❌ Error creating backup:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Restore dari backup
    async restoreBackup(backupName) {
        try {
            const backupPath = path.join(this.backupDir, backupName);
            
            if (!fs.existsSync(backupPath)) {
                throw new Error(`Backup not found: ${backupName}`);
            }

            // Baca metadata backup
            const metadataPath = path.join(backupPath, 'backup-metadata.json');
            if (!fs.existsSync(metadataPath)) {
                throw new Error('Backup metadata not found');
            }

            const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
            let successCount = 0;
            let errorCount = 0;

            // Restore setiap file
            for (const filePath of this.dataFiles) {
                try {
                    const fileName = path.basename(filePath);
                    const sourcePath = path.join(backupPath, fileName);
                    const destPath = path.join(__dirname, '..', filePath);

                    if (fs.existsSync(sourcePath)) {
                        // Pastikan direktori tujuan ada
                        const destDir = path.dirname(destPath);
                        if (!fs.existsSync(destDir)) {
                            fs.mkdirSync(destDir, { recursive: true });
                        }

                        // Copy file
                        fs.copyFileSync(sourcePath, destPath);
                        successCount++;
                        
                        logger.debug(`📄 Restored: ${fileName} -> ${filePath}`);
                    } else {
                        logger.warn(`⚠️ Backup file not found: ${fileName}`);
                    }
                } catch (error) {
                    errorCount++;
                    logger.error(`❌ Error restoring ${filePath}:`, error.message);
                }
            }

            if (errorCount === 0) {
                logger.info(`✅ Backup restored successfully: ${backupName} (${successCount} files)`);
                return {
                    success: true,
                    backupName,
                    filesRestored: successCount,
                    errors: errorCount
                };
            } else {
                logger.warn(`⚠️ Restore completed with errors: ${backupName} (${successCount} files, ${errorCount} errors)`);
                return {
                    success: false,
                    backupName,
                    filesRestored: successCount,
                    errors: errorCount
                };
            }

        } catch (error) {
            logger.error('❌ Error restoring backup:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // List semua backup yang tersedia
    listBackups() {
        try {
            if (!fs.existsSync(this.backupDir)) {
                return [];
            }

            const backups = fs.readdirSync(this.backupDir)
                .filter(item => {
                    const itemPath = path.join(this.backupDir, item);
                    return fs.statSync(itemPath).isDirectory();
                })
                .map(backupName => {
                    const backupPath = path.join(this.backupDir, backupName);
                    const metadataPath = path.join(backupPath, 'backup-metadata.json');
                    
                    let metadata = null;
                    if (fs.existsSync(metadataPath)) {
                        try {
                            metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
                        } catch (error) {
                            logger.warn(`⚠️ Error reading metadata for ${backupName}:`, error.message);
                        }
                    }

                    return {
                        name: backupName,
                        path: backupPath,
                        metadata,
                        created: metadata ? metadata.timestamp : fs.statSync(backupPath).birthtime.toISOString()
                    };
                })
                .sort((a, b) => new Date(b.created) - new Date(a.created));

            return backups;
        } catch (error) {
            logger.error('❌ Error listing backups:', error);
            return [];
        }
    }

    // Hapus backup lama
    cleanupOldBackups() {
        try {
            const backups = this.listBackups();
            
            if (backups.length > this.maxBackups) {
                const backupsToDelete = backups.slice(this.maxBackups);
                
                for (const backup of backupsToDelete) {
                    try {
                        fs.rmSync(backup.path, { recursive: true, force: true });
                        logger.info(`🗑️ Deleted old backup: ${backup.name}`);
                    } catch (error) {
                        logger.error(`❌ Error deleting backup ${backup.name}:`, error.message);
                    }
                }
            }
        } catch (error) {
            logger.error('❌ Error cleaning up old backups:', error);
        }
    }

    // Hapus backup tertentu
    deleteBackup(backupName) {
        try {
            const backupPath = path.join(this.backupDir, backupName);
            
            if (!fs.existsSync(backupPath)) {
                throw new Error(`Backup not found: ${backupName}`);
            }

            fs.rmSync(backupPath, { recursive: true, force: true });
            logger.info(`🗑️ Deleted backup: ${backupName}`);
            
            return {
                success: true,
                message: `Backup ${backupName} deleted successfully`
            };
        } catch (error) {
            logger.error('❌ Error deleting backup:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Export backup ke file ZIP
    async exportBackup(backupName, exportPath = null) {
        try {
            const backupPath = path.join(this.backupDir, backupName);
            
            if (!fs.existsSync(backupPath)) {
                throw new Error(`Backup not found: ${backupName}`);
            }

            // Jika exportPath tidak diberikan, gunakan direktori backup
            if (!exportPath) {
                exportPath = path.join(this.backupDir, `${backupName}.zip`);
            }

            // Untuk sementara, copy direktori backup ke exportPath
            // TODO: Implementasi ZIP compression
            const exportDir = exportPath.replace('.zip', '');
            if (fs.existsSync(exportDir)) {
                fs.rmSync(exportDir, { recursive: true, force: true });
            }
            
            fs.cpSync(backupPath, exportDir, { recursive: true });
            
            logger.info(`📦 Backup exported: ${backupName} -> ${exportPath}`);
            
            return {
                success: true,
                exportPath,
                message: `Backup exported successfully`
            };
        } catch (error) {
            logger.error('❌ Error exporting backup:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Status sistem backup
    getStatus() {
        return {
            isRunning: this.isRunning,
            backupDir: this.backupDir,
            maxBackups: this.maxBackups,
            backupInterval: this.backupInterval,
            nextBackup: this.backupTimer ? 
                new Date(Date.now() + this.backupInterval).toISOString() : null,
            totalBackups: this.listBackups().length
        };
    }
}

// Buat instance singleton
const backupSystem = new BackupSystem();

module.exports = backupSystem;
