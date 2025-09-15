const express = require('express');
const router = express.Router();
const { adminAuth } = require('./adminAuth');
const backupSystem = require('../config/backup-system');
const { logger } = require('../config/logger');

// GET: Backup Management Page
router.get('/backup', adminAuth, (req, res) => {
    try {
        const backups = backupSystem.listBackups();
        const status = backupSystem.getStatus();
        
        res.render('adminBackup', {
            title: 'Backup Management',
            page: 'backup',
            backups,
            status,
            lastUpdated: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Error in backup page:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Gagal memuat halaman backup',
            error: error.message
        });
    }
});

// POST: Create Manual Backup
router.post('/backup/create', adminAuth, async (req, res) => {
    try {
        const { backupName } = req.body;
        
        const result = await backupSystem.createBackup(backupName);
        
        if (result.success) {
            res.json({
                success: true,
                message: 'Backup berhasil dibuat',
                data: result
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'Gagal membuat backup',
                error: result.error
            });
        }
    } catch (error) {
        logger.error('Error creating backup:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating backup',
            error: error.message
        });
    }
});

// POST: Restore Backup
router.post('/backup/restore', adminAuth, async (req, res) => {
    try {
        const { backupName } = req.body;
        
        if (!backupName) {
            return res.status(400).json({
                success: false,
                message: 'Backup name is required'
            });
        }

        const result = await backupSystem.restoreBackup(backupName);
        
        if (result.success) {
            res.json({
                success: true,
                message: 'Backup berhasil di-restore',
                data: result
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'Gagal restore backup',
                error: result.error
            });
        }
    } catch (error) {
        logger.error('Error restoring backup:', error);
        res.status(500).json({
            success: false,
            message: 'Error restoring backup',
            error: error.message
        });
    }
});

// DELETE: Delete Backup
router.delete('/backup/:backupName', adminAuth, (req, res) => {
    try {
        const { backupName } = req.params;
        
        const result = backupSystem.deleteBackup(backupName);
        
        if (result.success) {
            res.json({
                success: true,
                message: result.message
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'Gagal menghapus backup',
                error: result.error
            });
        }
    } catch (error) {
        logger.error('Error deleting backup:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting backup',
            error: error.message
        });
    }
});

// GET: Backup Status
router.get('/backup/status', adminAuth, (req, res) => {
    try {
        const status = backupSystem.getStatus();
        const backups = backupSystem.listBackups();
        
        res.json({
            success: true,
            data: {
                status,
                backups: backups.slice(0, 10), // Hanya 10 backup terbaru
                totalBackups: backups.length
            }
        });
    } catch (error) {
        logger.error('Error getting backup status:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting backup status',
            error: error.message
        });
    }
});

// POST: Start/Stop Automatic Backup
router.post('/backup/automatic', adminAuth, (req, res) => {
    try {
        const { action } = req.body; // 'start' or 'stop'
        
        if (action === 'start') {
            backupSystem.startAutomaticBackup();
            res.json({
                success: true,
                message: 'Automatic backup started'
            });
        } else if (action === 'stop') {
            backupSystem.stopAutomaticBackup();
            res.json({
                success: true,
                message: 'Automatic backup stopped'
            });
        } else {
            res.status(400).json({
                success: false,
                message: 'Invalid action. Use "start" or "stop"'
            });
        }
    } catch (error) {
        logger.error('Error controlling automatic backup:', error);
        res.status(500).json({
            success: false,
            message: 'Error controlling automatic backup',
            error: error.message
        });
    }
});

// GET: Download Backup
router.get('/backup/download/:backupName', adminAuth, (req, res) => {
    try {
        const { backupName } = req.params;
        const backupPath = require('path').join(__dirname, '../backups', backupName);
        
        if (!require('fs').existsSync(backupPath)) {
            return res.status(404).json({
                success: false,
                message: 'Backup not found'
            });
        }

        // Untuk sementara, redirect ke direktori backup
        // TODO: Implementasi ZIP download
        res.json({
            success: true,
            message: 'Backup download not implemented yet',
            backupPath: backupPath
        });
    } catch (error) {
        logger.error('Error downloading backup:', error);
        res.status(500).json({
            success: false,
            message: 'Error downloading backup',
            error: error.message
        });
    }
});

module.exports = router;
