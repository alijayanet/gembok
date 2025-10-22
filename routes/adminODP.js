const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// Logging untuk debugging - pastikan route file dimuat
console.log('=== Memuat route adminODP.js ===');

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

const odpsFile = path.join(__dirname, '../logs/odps.json');
const linksFile = path.join(__dirname, '../logs/onu-odp.json');
const odpLinksFile = path.join(__dirname, '../logs/odp-links.json');
const settingsFile = path.join(__dirname, '../settings.json');

// Test endpoint to verify route is working
router.get('/odp/test', (req, res) => {
  res.json({ success: true, message: 'ODP test endpoint working' });
});

// Test endpoint to verify session
router.get('/odp/session-test', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Session test endpoint working',
    session: req.session,
    sessionId: req.sessionID
  });
});

router.get('/odp', (req, res) => {
  console.log('=== Mengakses GET /admin/odp ===');
  const odps = readJson(odpsFile, []);
  const links = readJson(linksFile, []);
  const odpLinks = readJson(odpLinksFile, []);
  const settings = readJson(settingsFile, {});
  const odpsWithUsage = odps.map(o => {
    const total = typeof o.total_ports === 'number' ? o.total_ports : 8;
    const used = Array.isArray(links) ? links.filter(l => l.odpId === o.id).length : 0;
    return { ...o, total_ports: total, used_ports: used };
  });
  res.render('adminODP', { title: 'Manajemen ODP', page: 'odp', odps: odpsWithUsage, odpLinks: Array.isArray(odpLinks) ? odpLinks : [], settings });
});

// API: Link ODP↔ODP - This needs to be defined BEFORE the :id route
router.post('/odp/link', express.urlencoded({ extended: true }), (req, res) => {
  console.log('=== Mengakses POST /admin/odp/link ===');
  console.log('Headers diterima:', req.headers);
  console.log('Body diterima:', req.body);
  console.log('Session:', req.session);
  console.log('Session ID:', req.sessionID);
  console.log('IsAdmin:', req.session && req.session.isAdmin);
  
  // Check if user is authenticated
  if (!req.session || !req.session.isAdmin) {
    console.log('Error: User not authenticated for ODP link operation');
    return res.status(401).json({ success: false, message: 'Unauthorized: Please log in as admin' });
  }
  
  console.log('Body type:', typeof req.body);
  console.log('Body keys:', Object.keys(req.body));
  
  let { fromOdpId, toOdpId, action } = req.body || {};
  
  // Logging untuk debugging - log semua data yang diterima
  console.log('=== Menerima request koneksi ODP ===');
  console.log('Headers:', req.headers);
  console.log('Body:', req.body);
  console.log('Parsed data:', { fromOdpId, toOdpId, action });
  console.log('Parsed data types:', { 
    fromOdpId: typeof fromOdpId, 
    toOdpId: typeof toOdpId, 
    action: typeof action 
  });
  
  // Additional logging for debugging
  console.log('Request method:', req.method);
  console.log('Request URL:', req.url);
  console.log('Request original URL:', req.originalUrl);
  console.log('Request path:', req.path);
  
  // Decode URI encoded values if they exist
  try {
    const originalFrom = fromOdpId;
    const originalTo = toOdpId;
    fromOdpId = decodeURIComponent(fromOdpId);
    toOdpId = decodeURIComponent(toOdpId);
    if (originalFrom !== fromOdpId || originalTo !== toOdpId) {
      console.log('Decode URI berhasil:', { originalFrom, originalTo, decodedFrom: fromOdpId, decodedTo: toOdpId });
    }
  } catch (e) {
    // Jika decode gagal, gunakan nilai asli
    console.log('Decode URI gagal:', e.message);
  }
  
  fromOdpId = String(fromOdpId || '').trim();
  toOdpId = String(toOdpId || '').trim();
  
  // Logging setelah trim
  console.log('Data setelah trim:', { fromOdpId, toOdpId, action });
  console.log('Trimmed data types:', { 
    fromOdpId: typeof fromOdpId, 
    toOdpId: typeof toOdpId, 
    action: typeof action 
  });
  
  if (!fromOdpId || !toOdpId) {
    console.log('Error: fromOdpId atau toOdpId kosong');
    return res.status(400).json({ success: false, message: 'fromOdpId & toOdpId wajib' });
  }

  // Untuk operasi hapus, kita tidak perlu memvalidasi keberadaan ODP
  // karena mungkin ODP sudah dihapus tapi koneksi masih ada
  if (action !== 'delete') {
    // Validasi: pastikan kedua ODP ada di data (hanya untuk operasi tambah)
    const odps = readJson(odpsFile, []);
    console.log('Data ODP tersedia:', odps);
    console.log('Mencari ODP:', { fromOdpId, toOdpId });
    
    // Log the type and structure of odps data
    console.log('ODPS type:', typeof odps);
    console.log('ODPS is array:', Array.isArray(odps));
    if (Array.isArray(odps)) {
      console.log('ODPS length:', odps.length);
      console.log('ODPS contents:', odps.map(o => ({ id: o.id, name: o.name })));
    }
    
    const norm = v => String(v || '').trim().toUpperCase();
    const findBy = (id) => {
      console.log('Mencari ID:', id);
      console.log('ID type:', typeof id);
      if (!Array.isArray(odps)) {
        console.log('ODPS bukan array:', typeof odps);
        return null;
      }
      const result = odps.find(o => {
        const oId = norm(o.id);
        const searchId = norm(id);
        const idMatch = oId === searchId;
        console.log('Perbandingan ID:', { oId, searchId, idMatch });
        return idMatch;
      });
      return result;
    };
    const a = findBy(fromOdpId);
    const b = findBy(toOdpId);
    
    // Logging hasil pencarian ODP
    console.log('ODP ditemukan:', { a: a ? { id: a.id, name: a.name } : null, b: b ? { id: b.id, name: b.name } : null });
    
    if (!a || !b) {
      console.log('Error: ODP tidak ditemukan');
      return res.status(404).json({ 
        success: false, 
        message: 'ODP tidak ditemukan', 
        from: fromOdpId, 
        to: toOdpId, 
        knownIds: Array.isArray(odps) ? odps.map(o => o.id) : [],
        knownNames: Array.isArray(odps) ? odps.map(o => o.name) : []
      });
    }
  }

  let links = readJson(odpLinksFile, []);
  
  // Fungsi untuk membuat kunci koneksi yang konsisten dan aman
  const createConnectionKey = (id1, id2) => {
    // Normalisasi dan pastikan tidak ada karakter yang menyebabkan masalah
    const normalizedId1 = String(id1 || '').trim().toUpperCase();
    const normalizedId2 = String(id2 || '').trim().toUpperCase();
    return [normalizedId1, normalizedId2].sort().join(':::');
  };
  
  const cur = createConnectionKey(fromOdpId, toOdpId);
  
  // Logging untuk debugging
  console.log('Proses koneksi ODP:', { fromOdpId, toOdpId, action, connectionKey: cur });
  
  if (action === 'delete') {
    const initialLength = links.length;
    // Gunakan fungsi kunci yang konsisten untuk filter
    links = Array.isArray(links) ? links.filter(l => {
      const linkKey = createConnectionKey(l.fromOdpId, l.toOdpId);
      console.log('Membandingkan kunci:', { linkKey, targetKey: cur, match: linkKey === cur });
      return linkKey !== cur;
    }) : [];
    const deletedCount = initialLength - links.length;
    
    // Logging untuk debugging
    console.log('Hasil penghapusan:', { initialLength, finalLength: links.length, deletedCount });
    
    // Jika tidak ada koneksi yang dihapus, kirim pesan error
    if (deletedCount === 0) {
      console.log('Error: Koneksi ODP tidak ditemukan');
      return res.status(404).json({ success: false, message: 'Koneksi ODP tidak ditemukan' });
    }
  } else {
    // Untuk operasi tambah, gunakan ODP yang sudah divalidasi
    const odps = readJson(odpsFile, []);
    const norm = v => String(v || '').trim().toUpperCase();
    const findBy = (id) => {
      if (!Array.isArray(odps)) return null;
      return odps.find(o => norm(o.id) === norm(id));
    };
    const a = findBy(fromOdpId);
    const b = findBy(toOdpId);
    
    links = Array.isArray(links) ? links : [];
    // Periksa apakah koneksi sudah ada menggunakan fungsi kunci yang konsisten
    const connectionExists = links.some(l => {
      const linkKey = createConnectionKey(l.fromOdpId, l.toOdpId);
      return linkKey === cur;
    });
    
    if (connectionExists) {
      console.log('Error: Koneksi ODP sudah ada');
      return res.status(400).json({ success: false, message: 'Koneksi ODP sudah ada' });
    }
    
    links.push({ fromOdpId: a.id, toOdpId: b.id });
    console.log('Koneksi ODP berhasil ditambahkan');
  }
  fs.writeFileSync(odpLinksFile, JSON.stringify(links, null, 2));
  res.json({ success: true, links });
});

// These routes need to be defined AFTER the /link route
router.post('/odp', express.urlencoded({ extended: true }), (req, res) => {
  console.log('=== Mengakses POST /admin/odp ===');
  const { id, name, lat, lng, total_ports } = req.body;
  const odps = readJson(odpsFile, []);
  const exists = odps.find(o => o.id === id);
  if (exists) return res.status(400).json({ success: false, message: 'ID ODP sudah ada' });
  const newOdp = {
    id: String(id).trim(),
    name: String(name || id).trim(),
    lat: parseFloat(lat),
    lng: parseFloat(lng),
    total_ports: parseInt(total_ports || 8)
  };
  odps.push(newOdp);
  fs.writeFileSync(odpsFile, JSON.stringify(odps, null, 2));
  res.json({ success: true, message: 'ODP ditambahkan', data: newOdp });
});

router.post('/odp/:id', express.urlencoded({ extended: true }), (req, res) => {
  console.log('=== Mengakses POST /admin/odp/:id ===');
  const { id } = req.params;
  const { name, lat, lng, total_ports } = req.body;
  const odps = readJson(odpsFile, []);
  const idx = odps.findIndex(o => o.id === id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'ODP tidak ditemukan' });
  odps[idx] = {
    ...odps[idx],
    name: String(name || odps[idx].name).trim(),
    lat: parseFloat(lat),
    lng: parseFloat(lng),
    total_ports: parseInt(total_ports || odps[idx].total_ports || 8)
  };
  fs.writeFileSync(odpsFile, JSON.stringify(odps, null, 2));
  res.json({ success: true, message: 'ODP diperbarui', data: odps[idx] });
});

router.post('/odp/:id/delete', (req, res) => {
  console.log('=== Mengakses POST /admin/odp/:id/delete ===');
  const { id } = req.params;
  const odps = readJson(odpsFile, []);
  const newOdps = odps.filter(o => o.id !== id);
  if (newOdps.length === odps.length) return res.status(404).json({ success: false, message: 'ODP tidak ditemukan' });
  fs.writeFileSync(odpsFile, JSON.stringify(newOdps, null, 2));
  res.json({ success: true, message: 'ODP dihapus' });
});

console.log('=== Route adminODP.js berhasil dimuat ===');
module.exports = router;