const express = require('express');
const router = express.Router();
const { 
  getAllTroubleReports, 
  getTroubleReportById, 
  updateTroubleReportStatus 
} = require('../config/troubleReport');

// Middleware untuk autentikasi teknisi (sederhana, bisa diperbaiki)
function technicianAuth(req, res, next) {
  // Untuk sementara, gunakan basic auth atau bisa dikembangkan lebih lanjut
  // Atau redirect ke login khusus teknisi
  next();
}

// GET: Halaman daftar laporan gangguan untuk teknisi
router.get('/troubletickets', technicianAuth, (req, res) => {
  const { status } = req.query;
  
  // Dapatkan semua laporan gangguan
  let reports = getAllTroubleReports();
  
  // Filter berdasarkan status jika ada
  if (status && status !== 'all') {
    reports = reports.filter(report => report.status === status);
  }
  
  // Urutkan berdasarkan tanggal terbaru
  reports.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  
  // Hitung statistik
  const allReports = getAllTroubleReports();
  const stats = {
    total: allReports.length,
    open: allReports.filter(r => r.status === 'open').length,
    inProgress: allReports.filter(r => r.status === 'in_progress').length,
    resolved: allReports.filter(r => r.status === 'resolved').length,
    closed: allReports.filter(r => r.status === 'closed').length
  };
  
  // Render halaman teknisi
  res.render('technician/trouble-tickets', {
    reports,
    stats,
    currentStatus: status || 'all',
    title: 'Laporan Gangguan - Teknisi'
  });
});

// GET: Detail laporan untuk teknisi
router.get('/troubletickets/:id', technicianAuth, (req, res) => {
  const reportId = req.params.id;
  
  // Dapatkan detail laporan
  const report = getTroubleReportById(reportId);
  
  if (!report) {
    return res.status(404).render('error', {
      message: 'Laporan gangguan tidak ditemukan',
      error: { status: 404 }
    });
  }
  
  // Render halaman detail untuk teknisi
  res.render('technician/trouble-ticket-detail', {
    report,
    title: `Detail Laporan #${reportId}`
  });
});

// POST: Update status laporan oleh teknisi
router.post('/troubletickets/:id/update', technicianAuth, (req, res) => {
  const reportId = req.params.id;
  const { status, notes, sendNotification = true } = req.body;
  
  // Validasi status
  const validStatuses = ['open', 'in_progress', 'resolved', 'closed'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({
      success: false,
      message: 'Status tidak valid'
    });
  }
  
  // Update status laporan
  const updatedReport = updateTroubleReportStatus(reportId, status, notes, sendNotification);
  
  if (!updatedReport) {
    return res.status(500).json({
      success: false,
      message: 'Gagal mengupdate status laporan'
    });
  }
  
  // Redirect kembali ke detail atau daftar
  if (req.headers.accept && req.headers.accept.includes('application/json')) {
    res.json({
      success: true,
      message: 'Status laporan berhasil diupdate',
      report: updatedReport
    });
  } else {
    res.redirect(`/technician/troubletickets/${reportId}?updated=true`);
  }
});

module.exports = router;