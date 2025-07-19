const express = require('express');
const router = express.Router();
const { adminAuth } = require('./adminAuth');
const { getDevices, setParameterValues } = require('../config/genieacs');
const fs = require('fs');
const path = require('path');
// Helper dan parameterPaths dari customerPortal.js
const parameterPaths = {
  pppUsername: [
    'VirtualParameters.pppoeUsername',
    'VirtualParameters.pppUsername',
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username'
  ],
  rxPower: [
    'VirtualParameters.RXPower',
    'VirtualParameters.redaman',
    'InternetGatewayDevice.WANDevice.1.WANPONInterfaceConfig.RXPower'
  ]
};
function getParameterWithPaths(device, paths) {
  for (const path of paths) {
    const parts = path.split('.');
    let value = device;
    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
        if (value && value._value !== undefined) value = value._value;
      } else {
        value = undefined;
        break;
      }
    }
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return '-';
}


// GET: List Device GenieACS
router.get('/genieacs', adminAuth, async (req, res) => {
  try {
    // Ambil data device dari GenieACS
    const devicesRaw = await getDevices();
    // Mapping data sesuai kebutuhan tabel
    const devices = devicesRaw.map((device, i) => ({
      id: device._id || device.DeviceID?.SerialNumber || '-',
      serialNumber: device.DeviceID?.SerialNumber || device._id || '-',
      model: device.DeviceID?.ProductClass || device.InternetGatewayDevice?.DeviceInfo?.ModelName?._value || '-',
      lastInform: device._lastInform ? new Date(device._lastInform).toLocaleString('id-ID') : '-',
      pppoeUsername: getParameterWithPaths(device, parameterPaths.pppUsername),
      ssid: device.InternetGatewayDevice?.LANDevice?.['1']?.WLANConfiguration?.['1']?.SSID?._value || device.VirtualParameters?.SSID || '-',
      password: device.InternetGatewayDevice?.LANDevice?.['1']?.WLANConfiguration?.['1']?.KeyPassphrase?._value || '-',
      userKonek: device.InternetGatewayDevice?.LANDevice?.['1']?.WLANConfiguration?.['1']?.TotalAssociations?._value || '-',
      rxPower: getParameterWithPaths(device, parameterPaths.rxPower),
      tag: (Array.isArray(device.Tags) && device.Tags.length > 0)
        ? device.Tags.join(', ')
        : (typeof device.Tags === 'string' && device.Tags)
          ? device.Tags
          : (Array.isArray(device._tags) && device._tags.length > 0)
            ? device._tags.join(', ')
            : (typeof device._tags === 'string' && device._tags)
              ? device._tags
              : '-'
    }));
    // Tambahkan statistik GenieACS seperti di dashboard
    const genieacsTotal = devicesRaw.length;
    const now = Date.now();
    const genieacsOnline = devicesRaw.filter(dev => dev._lastInform && (now - new Date(dev._lastInform).getTime()) < 3600*1000).length;
    const genieacsOffline = genieacsTotal - genieacsOnline;
    const settings = JSON.parse(fs.readFileSync(path.join(__dirname, '../settings.json'), 'utf8'));
    res.render('adminGenieacs', { devices, settings, genieacsTotal, genieacsOnline, genieacsOffline });
  } catch (err) {
    res.render('adminGenieacs', { devices: [], error: 'Gagal mengambil data device.' });
  }
});

// Endpoint edit SSID/Password
router.post('/genieacs/edit', adminAuth, async (req, res) => {
  try {
    const { id, ssid, password } = req.body;
    // Implementasi update SSID/Password ke GenieACS
    let updateResult = null;
    if (ssid) {
      try {
        await setParameterValues(id, { 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID': ssid });
        updateResult = { success: true, field: 'ssid' };
      } catch (e) {
        return res.status(500).json({ success: false, message: 'Gagal update SSID' });
      }
    }
    if (password) {
      try {
        await setParameterValues(id, { 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.KeyPassphrase': password });
        updateResult = { success: true, field: 'password' };
      } catch (e) {
        return res.status(500).json({ success: false, message: 'Gagal update Password' });
      }
    }
    if (updateResult) {
      res.json({ success: true, field: updateResult.field });
    } else {
      res.status(400).json({ success: false, message: 'Tidak ada perubahan' });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: 'Gagal update SSID/Password' });
  }
});

// Endpoint edit tag (nomor pelanggan)
router.post('/genieacs/edit-tag', adminAuth, async (req, res) => {
  try {
    const { id, tag } = req.body;
    if (!id || !tag) {
      return res.status(400).json({ success: false, message: 'ID dan tag wajib diisi' });
    }
    const axios = require('axios');
    const { getSetting } = require('../config/settingsManager');
    const genieacsUrl = getSetting('genieacs_url', 'http://localhost:7557');
    const genieacsUsername = getSetting('genieacs_username', 'admin');
    const genieacsPassword = getSetting('genieacs_password', 'password');
    // 1. Ambil tag lama perangkat
    let oldTags = [];
    try {
      const deviceResp = await axios.get(`${genieacsUrl}/devices/${encodeURIComponent(id)}`, {
        auth: { username: genieacsUsername, password: genieacsPassword }
      });
      oldTags = deviceResp.data._tags || deviceResp.data.Tags || [];
      if (typeof oldTags === 'string') oldTags = [oldTags];
    } catch (e) {
      oldTags = [];
    }
    // 2. Hapus semua tag lama (tanpa kecuali)
    for (const oldTag of oldTags) {
      if (oldTag) {
        try {
          await axios.delete(`${genieacsUrl}/devices/${encodeURIComponent(id)}/tags/${encodeURIComponent(oldTag)}`, {
            auth: { username: genieacsUsername, password: genieacsPassword }
          });
        } catch (e) {
          // lanjutkan saja
        }
      }
    }
    // 3. Tambahkan tag baru
    await axios.post(`${genieacsUrl}/devices/${encodeURIComponent(id)}/tags/${encodeURIComponent(tag)}`, {}, {
      auth: { username: genieacsUsername, password: genieacsPassword }
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Gagal update tag' });
  }
});

// Endpoint restart ONU
router.post('/genieacs/restart-onu', adminAuth, async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) {
      return res.status(400).json({ success: false, message: 'Device ID wajib diisi' });
    }

    const axios = require('axios');
    const { getSetting } = require('../config/settingsManager');
    const genieacsUrl = getSetting('genieacs_url', 'http://localhost:7557');
    const genieacsUsername = getSetting('genieacs_username', 'admin');
    const genieacsPassword = getSetting('genieacs_password', 'password');

    // Kirim perintah restart ke GenieACS menggunakan endpoint yang benar
    const taskData = {
      name: 'reboot'
    };

    // Pastikan device ID di-encode dengan benar untuk menghindari masalah karakter khusus
    const encodedDeviceId = encodeURIComponent(id);
    console.log(`🔧 Admin restart - Device ID: ${id}`);
    console.log(`🔧 Admin restart - Encoded Device ID: ${encodedDeviceId}`);

    await axios.post(`${genieacsUrl}/devices/${encodedDeviceId}/tasks?connection_request`, taskData, {
      auth: { username: genieacsUsername, password: genieacsPassword },
      headers: { 'Content-Type': 'application/json' }
    });

    res.json({ success: true, message: 'Perintah restart berhasil dikirim' });
  } catch (err) {
    console.error('Error restart:', err.message);
    res.status(500).json({ 
      success: false, 
      message: 'Gagal mengirim perintah restart: ' + (err.response?.data?.message || err.message)
    });
  }
});

module.exports = router;
