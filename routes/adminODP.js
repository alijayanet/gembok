const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { adminAuth } = require('./adminAuth');

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

const odpsFile = path.join(__dirname, '../logs/odps.json');
const linksFile = path.join(__dirname, '../logs/onu-odp.json');
const odpLinksFile = path.join(__dirname, '../logs/odp-links.json');
const settingsFile = path.join(__dirname, '../settings.json');

router.get('/odp', adminAuth, (req, res) => {
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

router.post('/odp', adminAuth, express.urlencoded({ extended: true }), (req, res) => {
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

router.post('/odp/:id', adminAuth, express.urlencoded({ extended: true }), (req, res) => {
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

router.post('/odp/:id/delete', adminAuth, (req, res) => {
  const { id } = req.params;
  const odps = readJson(odpsFile, []);
  const newOdps = odps.filter(o => o.id !== id);
  if (newOdps.length === odps.length) return res.status(404).json({ success: false, message: 'ODP tidak ditemukan' });
  fs.writeFileSync(odpsFile, JSON.stringify(newOdps, null, 2));
  res.json({ success: true, message: 'ODP dihapus' });
});

module.exports = router;

// API: Link ODP↔ODP
router.post('/odp/link', adminAuth, express.urlencoded({ extended: true }), (req, res) => {
  let { fromOdpId, toOdpId, action } = req.body || {};
  fromOdpId = String(fromOdpId || '').trim();
  toOdpId = String(toOdpId || '').trim();
  if (!fromOdpId || !toOdpId) return res.status(400).json({ success: false, message: 'fromOdpId & toOdpId wajib' });

  // Validasi: pastikan kedua ODP ada di data
  const odps = readJson(odpsFile, []);
  const norm = v => String(v || '').trim().toUpperCase();
  const findBy = (id) => Array.isArray(odps) && odps.find(o => norm(o.id) === norm(id) || norm(o.name) === norm(id));
  const a = findBy(fromOdpId);
  const b = findBy(toOdpId);
  if (!a || !b) {
    return res.status(404).json({ success: false, message: 'ODP tidak ditemukan', from: fromOdpId, to: toOdpId, knownIds: Array.isArray(odps) ? odps.map(o => o.id) : [] });
  }

  let links = readJson(odpLinksFile, []);
  const key = (a, b) => [a, b].sort().join(':::');
  const cur = key(a.id, b.id);
  if (action === 'delete') {
    links = Array.isArray(links) ? links.filter(l => key(l.fromOdpId, l.toOdpId) !== cur) : [];
  } else {
    links = Array.isArray(links) ? links : [];
    if (!links.find(l => key(l.fromOdpId, l.toOdpId) === cur)) links.push({ fromOdpId: a.id, toOdpId: b.id });
  }
  fs.writeFileSync(odpLinksFile, JSON.stringify(links, null, 2));
  res.json({ success: true, links });
});


