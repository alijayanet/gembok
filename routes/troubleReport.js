const express = require('express');
const router = express.Router();
const { getSetting } = require('../config/settingsManager');
const { findDeviceByTag } = require('../config/addWAN');
const { 
  createTroubleReport, 
  getTroubleReportsByPhone, 
  updateTroubleReportStatus,
  getTroubleReportById
} = require('../config/troubleReport');

// Middleware untuk memastikan pelanggan sudah login
function customerAuth(req, res, next) {
  console.log('🔍 customerAuth middleware - Session:', req.session);
  console.log('🔍 customerAuth middleware - Session phone:', req.session?.phone);
  
  const phone = req.session && req.session.phone;
  if (!phone) {
    console.log('❌ customerAuth: No session phone, redirecting to login');
    return res.redirect('/customer/login');
  }
  
  console.log('✅ customerAuth: Session valid, phone:', phone);
  next();
}

// GET: Halaman form laporan gangguan
router.get('/report', customerAuth, async (req, res) => {
  const phone = req.session.phone;
  
  // Dapatkan data pelanggan dari GenieACS
  const device = await findDeviceByTag(phone);
  const customerName = device?.Tags?.find(tag => tag !== phone) || '';
  const location = device?.Tags?.join(', ') || '';
  
  // Dapatkan kategori gangguan dari settings
  const categoriesString = getSetting('trouble_report.categories', 'Internet Lambat,Tidak Bisa Browsing,WiFi Tidak Muncul,Koneksi Putus-Putus,Lainnya');
  const categories = categoriesString.split(',').map(cat => cat.trim());
  
  // Dapatkan laporan gangguan sebelumnya
  const previousReports = getTroubleReportsByPhone(phone);
  
  // Render halaman form laporan gangguan
  res.render('trouble-report-form', {
    phone,
    customerName,
    location,
    categories,
    previousReports,
    companyHeader: getSetting('company_header', 'ISP Monitor'),
    footerInfo: getSetting('footer_info', '')
  });
});

// POST: Submit laporan gangguan
router.post('/report', customerAuth, async (req, res) => {
  const phone = req.session.phone;
  const { name, location, category, description } = req.body;
  
  console.log('📝 POST /trouble/report - Session phone:', phone);
  console.log('📋 Request body:', req.body);
  
  // Validasi input
  if (!category || !description) {
    console.log('❌ Validation failed: missing category or description');
    return res.status(400).json({
      success: false,
      message: 'Kategori dan deskripsi masalah wajib diisi'
    });
  }
  
  // Buat laporan gangguan baru
  const report = createTroubleReport({
    phone,
    name,
    location,
    category,
    description
  });
  
  if (!report) {
    console.log('❌ Failed to create trouble report');
    return res.status(500).json({
      success: false,
      message: 'Gagal membuat laporan gangguan'
    });
  }
  
  console.log('✅ Trouble report created successfully:', report.id);
  
  console.log('✅ Sending JSON response:', {
    success: true,
    message: 'Laporan gangguan berhasil dibuat',
    reportId: report.id
  });
  
  // Redirect ke halaman detail laporan
  res.json({
    success: true,
    message: 'Laporan gangguan berhasil dibuat',
    reportId: report.id
  });
});

// GET: Test route untuk debugging (tanpa session)
router.get('/test', async (req, res) => {
  console.log('🧪 GET /trouble/test - Query params:', req.query);
  
  const { name, phone, location, category, description } = req.query;
  
  // Validasi input
  if (!category || !description) {
    return res.status(400).json({
      success: false,
      message: 'Kategori dan deskripsi masalah wajib diisi'
    });
  }
  
  // Buat laporan gangguan baru
  const report = createTroubleReport({
    phone: phone || '081321960111',
    name: name || 'Test Customer',
    location: location || 'Test Location',
    category,
    description
  });
  
  if (!report) {
    return res.status(500).json({
      success: false,
      message: 'Gagal membuat laporan gangguan'
    });
  }
  
  console.log('✅ Test trouble report created successfully:', report.id);
  
  res.json({
    success: true,
    message: 'Laporan gangguan berhasil dibuat (test)',
    reportId: report.id
  });
});

// POST: Test route untuk debugging (tanpa session)
router.post('/test', async (req, res) => {
  console.log('🧪 POST /trouble/test - Body:', req.body);
  
  const { name, phone, location, category, description } = req.body;
  
  // Validasi input
  if (!category || !description) {
    return res.status(400).json({
      success: false,
      message: 'Kategori dan deskripsi masalah wajib diisi'
    });
  }
  
  // Buat laporan gangguan baru
  const report = createTroubleReport({
    phone: phone || '081321960111',
    name: name || 'Test Customer',
    location: location || 'Test Location',
    category,
    description
  });
  
  if (!report) {
    return res.status(500).json({
      success: false,
      message: 'Gagal membuat laporan gangguan'
    });
  }
  
  console.log('✅ Test trouble report created successfully:', report.id);
  
  res.json({
    success: true,
    message: 'Laporan gangguan berhasil dibuat (test POST)',
    reportId: report.id
  });
});

// GET: Halaman daftar laporan gangguan pelanggan
router.get('/list', customerAuth, (req, res) => {
  const phone = req.session.phone;
  
  // Dapatkan semua laporan gangguan pelanggan
  const reports = getTroubleReportsByPhone(phone);
  
  // Render halaman daftar laporan
  res.render('trouble-report-list', {
    phone,
    reports,
    companyHeader: getSetting('company_header', 'ISP Monitor'),
    footerInfo: getSetting('footer_info', '')
  });
});

// GET: Halaman detail laporan gangguan
router.get('/detail/:id', customerAuth, (req, res) => {
  const phone = req.session.phone;
  const reportId = req.params.id;
  
  // Dapatkan detail laporan
  const report = getTroubleReportById(reportId);
  
  // Validasi laporan ditemukan dan milik pelanggan yang login
  if (!report || report.phone !== phone) {
    return res.redirect('/customer/trouble/list');
  }
  
  // Render halaman detail laporan
  res.render('trouble-report-detail', {
    phone,
    report,
    companyHeader: getSetting('company_header', 'ISP Monitor'),
    footerInfo: getSetting('footer_info', '')
  });
});

// POST: Tambah komentar pada laporan
router.post('/comment/:id', customerAuth, (req, res) => {
  const phone = req.session.phone;
  const reportId = req.params.id;
  const { comment } = req.body;
  
  // Dapatkan detail laporan
  const report = getTroubleReportById(reportId);
  
  // Validasi laporan ditemukan dan milik pelanggan yang login
  if (!report || report.phone !== phone) {
    return res.status(403).json({
      success: false,
      message: 'Laporan tidak ditemukan atau Anda tidak memiliki akses'
    });
  }
  
  // Update laporan dengan komentar baru
  const updatedReport = updateTroubleReportStatus(reportId, report.status, `[Pelanggan]: ${comment}`);
  
  if (!updatedReport) {
    return res.status(500).json({
      success: false,
      message: 'Gagal menambahkan komentar'
    });
  }
  
  res.json({
    success: true,
    message: 'Komentar berhasil ditambahkan'
  });
});

// POST: Tutup laporan (hanya jika status resolved)
router.post('/close/:id', customerAuth, (req, res) => {
  const phone = req.session.phone;
  const reportId = req.params.id;
  
  // Dapatkan detail laporan
  const report = getTroubleReportById(reportId);
  
  // Validasi laporan ditemukan dan milik pelanggan yang login
  if (!report || report.phone !== phone) {
    return res.status(403).json({
      success: false,
      message: 'Laporan tidak ditemukan atau Anda tidak memiliki akses'
    });
  }
  
  // Hanya bisa menutup laporan jika status resolved
  if (report.status !== 'resolved') {
    return res.status(400).json({
      success: false,
      message: 'Hanya laporan dengan status "Terselesaikan" yang dapat ditutup'
    });
  }
  
  // Update status laporan menjadi closed
  const updatedReport = updateTroubleReportStatus(reportId, 'closed', 'Laporan ditutup oleh pelanggan');
  
  if (!updatedReport) {
    return res.status(500).json({
      success: false,
      message: 'Gagal menutup laporan'
    });
  }
  
  res.json({
    success: true,
    message: 'Laporan berhasil ditutup'
  });
});

module.exports = router;
