const express = require('express');
const router = express.Router();
const { createTroubleReport, updateTroubleReportStatus } = require('../config/troubleReport');
const { logger } = require('../config/logger');

// Test endpoint GET sederhana
router.get('/test-simple', async (req, res) => {
  try {
    logger.info('🧪 Test endpoint sederhana: Membuat laporan gangguan...');
    
    const testReport = {
      phone: '081234567890',
      name: 'Test User Simple',
      location: 'Test Location Simple',
      category: 'Internet Lambat',
      description: 'Test deskripsi masalah internet lambat untuk testing notifikasi WhatsApp - endpoint sederhana'
    };
    
    const newReport = createTroubleReport(testReport);
    
    if (newReport) {
      logger.info(`✅ Laporan gangguan berhasil dibuat dengan ID: ${newReport.id}`);
      
      // Test update status setelah 3 detik
      setTimeout(async () => {
        logger.info(`🔄 Test update status untuk laporan ${newReport.id}...`);
        const updatedReport = updateTroubleReportStatus(
          newReport.id, 
          'in_progress', 
          'Test update status dari endpoint sederhana - sedang ditangani',
          true // sendNotification = true
        );
        
        if (updatedReport) {
          logger.info(`✅ Status laporan berhasil diupdate ke: ${updatedReport.status}`);
        }
      }, 3000);
      
      res.json({
        success: true,
        message: 'Test trouble report berhasil dijalankan',
        report: newReport,
        note: 'Status akan diupdate otomatis dalam 3 detik'
      });
    } else {
      logger.error('❌ Gagal membuat laporan gangguan');
      res.status(500).json({
        success: false,
        message: 'Gagal membuat laporan gangguan'
      });
    }
  } catch (error) {
    logger.error(`❌ Error dalam test simple trouble report: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error dalam test simple trouble report',
      error: error.message
    });
  }
});

// Test endpoint untuk membuat laporan gangguan
router.post('/create', async (req, res) => {
  try {
    logger.info('🧪 Test endpoint: Membuat laporan gangguan baru...');
    
    const testReport = {
      phone: req.body.phone || '081234567890',
      name: req.body.name || 'Test User',
      location: req.body.location || 'Test Location',
      category: req.body.category || 'Internet Lambat',
      description: req.body.description || 'Test deskripsi masalah internet lambat untuk testing notifikasi WhatsApp'
    };
    
    const newReport = createTroubleReport(testReport);
    
    if (newReport) {
      logger.info(`✅ Laporan gangguan berhasil dibuat dengan ID: ${newReport.id}`);
      res.json({
        success: true,
        message: 'Laporan gangguan berhasil dibuat',
        report: newReport
      });
    } else {
      logger.error('❌ Gagal membuat laporan gangguan');
      res.status(500).json({
        success: false,
        message: 'Gagal membuat laporan gangguan'
      });
    }
  } catch (error) {
    logger.error(`❌ Error dalam test create trouble report: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error dalam test create trouble report',
      error: error.message
    });
  }
});

// Test endpoint untuk update status laporan
router.post('/update/:id', async (req, res) => {
  try {
    const reportId = req.params.id;
    const { status, notes, sendNotification } = req.body;
    
    logger.info(`🧪 Test endpoint: Update status laporan ${reportId}...`);
    
    const updatedReport = updateTroubleReportStatus(
      reportId, 
      status || 'in_progress', 
      notes || 'Test update status dari endpoint test',
      sendNotification !== undefined ? sendNotification : true
    );
    
    if (updatedReport) {
      logger.info(`✅ Status laporan berhasil diupdate ke: ${updatedReport.status}`);
      res.json({
        success: true,
        message: 'Status laporan berhasil diupdate',
        report: updatedReport
      });
    } else {
      logger.error('❌ Gagal update status laporan');
      res.status(500).json({
        success: false,
        message: 'Gagal update status laporan'
      });
    }
  } catch (error) {
    logger.error(`❌ Error dalam test update trouble report: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error dalam test update trouble report',
      error: error.message
    });
  }
});

// Test endpoint untuk mengirim notifikasi manual
router.post('/notify/:id', async (req, res) => {
  try {
    const reportId = req.params.id;
    const { sendNotificationToTechnicians, sendStatusUpdateToCustomer } = require('../config/troubleReport');
    
    logger.info(`🧪 Test endpoint: Mengirim notifikasi manual untuk laporan ${reportId}...`);
    
    // Ambil data laporan
    const { getTroubleReportById } = require('../config/troubleReport');
    const report = getTroubleReportById(reportId);
    
    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Laporan tidak ditemukan'
      });
    }
    
    const results = {};
    
    // Test notifikasi ke teknisi
    if (req.body.toTechnicians !== false) {
      logger.info('📤 Mengirim notifikasi ke teknisi...');
      results.technicianNotification = await sendNotificationToTechnicians(report);
    }
    
    // Test notifikasi ke pelanggan
    if (req.body.toCustomer !== false) {
      logger.info('📤 Mengirim notifikasi ke pelanggan...');
      results.customerNotification = await sendStatusUpdateToCustomer(report);
    }
    
    res.json({
      success: true,
      message: 'Test notifikasi selesai',
      results
    });
    
  } catch (error) {
    logger.error(`❌ Error dalam test notify trouble report: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error dalam test notify trouble report',
      error: error.message
    });
  }
});

module.exports = router;
