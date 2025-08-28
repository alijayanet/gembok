const express = require('express');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { findDeviceByTag } = require('../config/addWAN');
const { sendMessage } = require('../config/sendMessage');
const { getSettingsWithCache, getSetting } = require('../config/settingsManager');
const { setParameterValues } = require('../config/genieacs');
const router = express.Router();

// Validasi nomor pelanggan ke GenieACS
async function isValidCustomer(phone) {
  const device = await findDeviceByTag(phone);
  return !!device;
}

// Simpan OTP sementara di memory (bisa diganti redis/db)
const otpStore = {};

// parameterPaths dan getParameterWithPaths dari WhatsApp bot
const parameterPaths = {
  rxPower: [
    'VirtualParameters.RXPower',
    'VirtualParameters.redaman',
    'InternetGatewayDevice.WANDevice.1.WANPONInterfaceConfig.RXPower'
  ],
  pppoeIP: [
    'VirtualParameters.pppoeIP',
    'VirtualParameters.pppIP',
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ExternalIPAddress'
  ],
  pppUsername: [
    'VirtualParameters.pppoeUsername',
    'VirtualParameters.pppUsername',
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username'
  ],
  uptime: [
    'VirtualParameters.getdeviceuptime',
    'InternetGatewayDevice.DeviceInfo.UpTime'
  ],
  userConnected: [
    'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.TotalAssociations'
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
  return 'N/A';
}

// Helper: Ambil info perangkat dan user terhubung dari GenieACS
async function getCustomerDeviceData(phone) {
  const device = await findDeviceByTag(phone);
  if (!device) return null;
  // Ambil SSID
  const ssid = device?.InternetGatewayDevice?.LANDevice?.['1']?.WLANConfiguration?.['1']?.SSID?._value || '-';
  // Status online/offline with proper time-based determination
  const lastInformRaw = device?._lastInform 
    ? new Date(device._lastInform)
    : device?.Events?.Inform
      ? new Date(device.Events.Inform)
      : device?.InternetGatewayDevice?.DeviceInfo?.['1']?.LastInform?._value
        ? new Date(device.InternetGatewayDevice.DeviceInfo['1'].LastInform._value)
        : null;
  
  const lastInform = lastInformRaw 
    ? lastInformRaw.toLocaleString('id-ID')
    : '-';
  
  // Calculate time difference to determine actual status
  const now = new Date();
  const timeDiff = lastInformRaw ? (now - lastInformRaw) / (1000 * 60 * 60) : Infinity; // dalam jam
  
  let status = 'Offline';
  if (timeDiff < 1) {
    status = 'Online';
  } else if (timeDiff < 24) {
    status = 'Idle';
  } else {
    status = 'Offline';
  }
  
  // Debug logging untuk status determination
  console.log(`📱 Status check for ${phone}:`);
  console.log(`   Last Inform: ${lastInform}`);
  console.log(`   Time Diff: ${timeDiff !== Infinity ? timeDiff.toFixed(2) + ' hours' : 'No last inform'}`);
  console.log(`   Status: ${status}`);
  // User terhubung (WiFi)
  let connectedUsers = [];
  try {
    const hosts = device?.InternetGatewayDevice?.LANDevice?.['1']?.Hosts?.Host;
    if (hosts && typeof hosts === 'object') {
      for (const key in hosts) {
        if (!isNaN(key)) {
          const entry = hosts[key];
          connectedUsers.push({
            hostname: typeof entry?.HostName === 'object' ? entry?.HostName?._value || '-' : entry?.HostName || '-',
            ip: typeof entry?.IPAddress === 'object' ? entry?.IPAddress?._value || '-' : entry?.IPAddress || '-',
            mac: typeof entry?.MACAddress === 'object' ? entry?.MACAddress?._value || '-' : entry?.MACAddress || '-',
            iface: typeof entry?.InterfaceType === 'object' ? entry?.InterfaceType?._value || '-' : entry?.InterfaceType || entry?.Interface || '-',
            waktu: entry?.Active?._value === 'true' ? 'Aktif' : 'Tidak Aktif'
          });
        }
      }
    }
  } catch (e) {}
  // Ambil data dengan helper agar sama dengan WhatsApp
  const rxPower = getParameterWithPaths(device, parameterPaths.rxPower);
  const pppoeIP = getParameterWithPaths(device, parameterPaths.pppoeIP);
  const pppoeUsername = getParameterWithPaths(device, parameterPaths.pppUsername);
  const serialNumber =
    device?.DeviceID?.SerialNumber ||
    device?.InternetGatewayDevice?.DeviceInfo?.SerialNumber?._value ||
    device?.InternetGatewayDevice?.DeviceInfo?.['1']?.SerialNumber?._value ||
    device?.SerialNumber ||
    '-';
  const productClass =
    device?.DeviceID?.ProductClass ||
    device?.InternetGatewayDevice?.DeviceInfo?.ProductClass?._value ||
    device?.InternetGatewayDevice?.DeviceInfo?.['1']?.ProductClass?._value ||
    device?.ProductClass ||
    '-';
  let lokasi = device?.Tags || '-';
  if (Array.isArray(lokasi)) lokasi = lokasi.join(', ');
  const softwareVersion = device?.InternetGatewayDevice?.DeviceInfo?.SoftwareVersion?._value || '-';
  const model =
    device?.InternetGatewayDevice?.DeviceInfo?.ModelName?._value ||
    device?.InternetGatewayDevice?.DeviceInfo?.['1']?.ModelName?._value ||
    device?.ModelName ||
    '-';
  const uptime = getParameterWithPaths(device, parameterPaths.uptime);
  const totalAssociations = getParameterWithPaths(device, parameterPaths.userConnected);
  return {
    phone,
    ssid,
    status,
    lastInform,
    connectedUsers,
    rxPower,
    pppoeIP,
    pppoeUsername,
    serialNumber,
    productClass,
    lokasi,
    softwareVersion,
    model,
    uptime,
    totalAssociations
  };
}

// Helper: Update SSID (real ke GenieACS) - Ultra Fast Optimized version
async function updateSSID(phone, newSSID) {
  try {
    const startTime = Date.now();
    const device = await findDeviceByTag(phone);
    if (!device) return false;
    
    const deviceId = device._id;
    
    console.log(`🚀 Fast SSID update for device ${deviceId} to ${newSSID}`);
    
    // Use optimized setParameterValues with fast mode
    const result = await setParameterValues(deviceId, {
      'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID': newSSID
    });
    
    const totalTime = Date.now() - startTime;
    console.log(`✅ SSID update completed in ${totalTime}ms (${result.mode} mode, ${result.onuType} ONU)`);
    
    return {
      success: true,
      processingTime: totalTime,
      onuType: result.onuType,
      mode: result.mode
    };
  } catch (error) {
    console.error('Error updating SSID:', error.message);
    return { success: false, error: error.message };
  }
}
// Helper: Add admin number and company info to customer data
function addAdminNumber(customerData) {
  const adminNumber = getSetting('admins.0', '6281947215703');
  const companyHeader = getSetting('company_header', 'ALIJAYA DIGITAL NETWORK');
  
  // Convert to display format (remove country code if present)
  const displayNumber = adminNumber.startsWith('62') ? '0' + adminNumber.slice(2) : adminNumber;
  
  if (customerData && typeof customerData === 'object') {
    customerData.adminNumber = displayNumber;
    customerData.adminNumberWA = adminNumber;
    customerData.companyHeader = companyHeader;
  }
  return customerData;
}

// Helper: Update Password (real ke GenieACS) - Ultra Fast Optimized version
async function updatePassword(phone, newPassword) {
  try {
    if (newPassword.length < 8) return { success: false, error: 'Password minimal 8 karakter' };
    
    const startTime = Date.now();
    const device = await findDeviceByTag(phone);
    if (!device) return { success: false, error: 'Device tidak ditemukan' };
    
    const deviceId = device._id;
    
    console.log(`🚀 Fast password update for device ${deviceId}`);
    
    // Use optimized setParameterValues with fast mode
    const result = await setParameterValues(deviceId, {
      'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.KeyPassphrase': newPassword
    });
    
    const totalTime = Date.now() - startTime;
    console.log(`✅ Password update completed in ${totalTime}ms (${result.mode} mode, ${result.onuType} ONU)`);
    
    return {
      success: true,
      processingTime: totalTime,
      onuType: result.onuType,
      mode: result.mode
    };
  } catch (error) {
    console.error('Error updating password:', error.message);
    return { success: false, error: error.message };
  }
}

// GET: Login page
router.get('/login', (req, res) => {
  const settings = JSON.parse(fs.readFileSync(path.join(__dirname, '../settings.json'), 'utf8'));
  res.render('login', { settings, error: null });
});

// POST: Proses login
router.post('/login', async (req, res) => {
  const { phone } = req.body;
  const settings = getSettingsWithCache();
  if (!await isValidCustomer(phone)) {
    return res.render('login', { settings, error: 'Nomor HP tidak valid atau belum terdaftar.' });
  }
  if (settings.customerPortalOtp === 'true') {
    // Generate OTP sesuai jumlah digit di settings
    const otpLength = settings.otp_length || 6;
    const min = Math.pow(10, otpLength - 1);
    const max = Math.pow(10, otpLength) - 1;
    const otp = Math.floor(min + Math.random() * (max - min)).toString();
    otpStore[phone] = { otp, expires: Date.now() + 5 * 60 * 1000 };
    
    // Kirim OTP ke WhatsApp pelanggan
    try {
      const waJid = phone.replace(/^0/, '62') + '@s.whatsapp.net';
      const msg = `🔐 *KODE OTP PORTAL PELANGGAN*\n\n` +
        `Kode OTP Anda adalah: *${otp}*\n\n` +
        `⏰ Kode ini berlaku selama 5 menit\n` +
        `🔒 Jangan bagikan kode ini kepada siapapun`;
      
      await sendMessage(waJid, msg);
      console.log(`OTP berhasil dikirim ke ${phone}: ${otp}`);
    } catch (error) {
      console.error(`Gagal mengirim OTP ke ${phone}:`, error);
    }
    return res.render('otp', { phone, error: null, otp_length: otpLength, settings });
  } else {
    req.session.phone = phone;
    return res.redirect('/customer/dashboard');
  }
});

// GET: Halaman OTP
router.get('/otp', (req, res) => {
  const { phone } = req.query;
  const settings = getSettingsWithCache();
  res.render('otp', { phone, error: null, otp_length: settings.otp_length || 6, settings });
});

// POST: Verifikasi OTP
router.post('/otp', (req, res) => {
  const { phone, otp } = req.body;
  const data = otpStore[phone];
  const settings = getSettingsWithCache();
  if (!data || data.otp !== otp || Date.now() > data.expires) {
    return res.render('otp', { phone, error: 'OTP salah atau sudah kadaluarsa.', otp_length: settings.otp_length || 6, settings });
  }
  // Sukses login
  delete otpStore[phone];
  req.session = req.session || {};
  req.session.phone = phone;
  return res.redirect('/customer/dashboard');
});

// GET: Dashboard pelanggan
router.get('/dashboard', async (req, res) => {
  const phone = req.session && (req.session.customerPhone || req.session.phone);
  if (!phone) return res.redirect('/customer/login');
  const settings = JSON.parse(fs.readFileSync(path.join(__dirname, '../settings.json'), 'utf8'));
  const data = await getCustomerDeviceData(phone);
  if (!data) {
    const fallbackCustomer = addAdminNumber({ phone, ssid: '-', status: 'Tidak ditemukan', lastChange: '-' });
    return res.render('dashboard', {
      customer: fallbackCustomer,
      connectedUsers: [],
      notif: 'Data perangkat tidak ditemukan.',
      settings,
      currentPage: 'dashboard'
    });
  }
  const customerWithAdmin = addAdminNumber(data);
  res.render('dashboard', {
    customer: customerWithAdmin,
    connectedUsers: data.connectedUsers,
    settings,
    currentPage: 'dashboard'
  });
});

// POST: Ganti SSID - Optimized Fast Mode
router.post('/change-ssid', async (req, res) => {
  const phone = req.session && req.session.phone;
  if (!phone) return res.redirect('/customer/login');
  const { ssid } = req.body;
  
  const result = await updateSSID(phone, ssid);
  
  let notificationMessage = 'Gagal mengubah SSID.';
  
  if (result.success) {
    const timeInfo = result.processingTime ? ` (${result.processingTime}ms, ${result.mode} mode)` : '';
    notificationMessage = `Nama WiFi berhasil diubah${timeInfo}.`;
    
    // Kirim notifikasi WhatsApp ke pelanggan
    const waJid = phone.replace(/^0/, '62') + '@s.whatsapp.net';
    const msg = `✅ *PERUBAHAN NAMA WIFI*\n\n` +
      `Nama WiFi Anda telah diubah menjadi:\n` +
      `• WiFi 2.4GHz: ${ssid}\n` +
      `• WiFi 5GHz: ${ssid}-5G\n\n` +
      `⚡ Diproses dalam ${result.processingTime}ms menggunakan ${result.mode} mode\n\n` +
      `Silakan hubungkan ulang perangkat Anda ke WiFi baru.`;
    
    try { 
      await sendMessage(waJid, msg); 
    } catch (e) {
      console.warn('Gagal kirim notifikasi WhatsApp:', e.message);
    }
  }
  
  const data = await getCustomerDeviceData(phone);
  const customerWithAdmin = addAdminNumber(data || { phone, ssid: '-', status: '-', lastChange: '-' });
  
  res.render('dashboard', { 
    customer: customerWithAdmin, 
    connectedUsers: data ? data.connectedUsers : [], 
    notif: notificationMessage,
    settings: JSON.parse(fs.readFileSync(path.join(__dirname, '../settings.json'), 'utf8')),
    currentPage: 'dashboard'
  });
});

// POST: Ganti Password - Optimized Fast Mode
router.post('/change-password', async (req, res) => {
  const phone = req.session && req.session.phone;
  if (!phone) return res.redirect('/customer/login');
  const { password } = req.body;
  
  const result = await updatePassword(phone, password);
  
  let notificationMessage = result.error || 'Gagal mengubah password.';
  
  if (result.success) {
    const timeInfo = result.processingTime ? ` (${result.processingTime}ms, ${result.mode} mode)` : '';
    notificationMessage = `Password WiFi berhasil diubah${timeInfo}.`;
    
    // Kirim notifikasi WhatsApp ke pelanggan
    const waJid = phone.replace(/^0/, '62') + '@s.whatsapp.net';
    const msg = `✅ *PERUBAHAN PASSWORD WIFI*\n\n` +
      `Password WiFi Anda telah diubah menjadi:\n` +
      `• Password Baru: ${password}\n\n` +
      `⚡ Diproses dalam ${result.processingTime}ms menggunakan ${result.mode} mode\n\n` +
      `Silakan hubungkan ulang perangkat Anda dengan password baru.`;
    
    try { 
      await sendMessage(waJid, msg); 
    } catch (e) {
      console.warn('Gagal kirim notifikasi WhatsApp:', e.message);
    }
  }
  
  const data = await getCustomerDeviceData(phone);
  const customerWithAdmin = addAdminNumber(data || { phone, ssid: '-', status: '-', lastChange: '-' });
  
  res.render('dashboard', { 
    customer: customerWithAdmin, 
    connectedUsers: data ? data.connectedUsers : [], 
    notif: notificationMessage,
    settings: JSON.parse(fs.readFileSync(path.join(__dirname, '../settings.json'), 'utf8')),
    currentPage: 'dashboard'
  });
});

// POST: Restart Device
router.post('/restart-device', async (req, res) => {
  const phone = req.session && req.session.phone;
  if (!phone) return res.status(401).json({ success: false, message: 'Session tidak valid' });
  
  try {
    console.log(`🔄 Restart device request from phone: ${phone}`);
    
    // Cari device berdasarkan nomor pelanggan
    const device = await findDeviceByTag(phone);
    if (!device) {
      console.log(`❌ Device not found for phone: ${phone}`);
      return res.status(404).json({ success: false, message: 'Device tidak ditemukan' });
    }

    console.log(`✅ Device found: ${device._id}`);

    // Cek status device (online/offline) - gunakan threshold yang lebih longgar
    const lastInform = device._lastInform ? new Date(device._lastInform) : null;
    const now = Date.now();
    const thirtyMinutes = 30 * 60 * 1000; // 30 menit
    
    const isOnline = lastInform && (now - lastInform.getTime()) < thirtyMinutes;
    
    if (!isOnline) {
      const minutesAgo = lastInform ? Math.round((now - lastInform.getTime()) / 60000) : 'Unknown';
      console.log(`⚠️ Device is offline. Last inform: ${lastInform ? lastInform.toLocaleString() : 'Never'}`);
      console.log(`⏰ Time since last inform: ${minutesAgo} minutes`);
      
      let offlineMessage = 'Device sedang offline.';
      if (minutesAgo !== 'Unknown' && minutesAgo > 60) {
        offlineMessage = `Device offline sejak ${Math.floor(minutesAgo / 60)} jam ${minutesAgo % 60} menit yang lalu.`;
      } else if (minutesAgo !== 'Unknown') {
        offlineMessage = `Device offline sejak ${minutesAgo} menit yang lalu.`;
      }
      
      return res.status(400).json({ 
        success: false, 
        message: offlineMessage + ' Silakan coba lagi dalam beberapa menit setelah device online kembali.' 
      });
    }
    
    console.log(`✅ Device is online. Last inform: ${lastInform.toLocaleString()}`);

    const genieacsUrl = getSetting('genieacs_url', 'http://localhost:7557');
    const genieacsUsername = getSetting('genieacs_username', 'admin');
    const genieacsPassword = getSetting('genieacs_password', 'password');

    console.log(`🔗 GenieACS URL: ${genieacsUrl}`);

    // Gunakan device ID asli (tidak di-decode) karena GenieACS memerlukan format yang di-encode
    const deviceId = device._id;
    console.log(`🔧 Using original device ID: ${deviceId}`);

    // Kirim perintah restart ke GenieACS menggunakan endpoint yang benar
    const taskData = {
      name: 'reboot'
    };

    console.log(`📤 Sending restart task to GenieACS for device: ${deviceId}`);

    // Gunakan endpoint yang benar sesuai dokumentasi GenieACS
    // Pastikan device ID di-encode dengan benar untuk menghindari masalah karakter khusus
    const encodedDeviceId = encodeURIComponent(deviceId);
    console.log(`🔧 Using encoded device ID: ${encodedDeviceId}`);

    try {
      const response = await axios.post(`${genieacsUrl}/devices/${encodedDeviceId}/tasks?connection_request`, taskData, {
        auth: { username: genieacsUsername, password: genieacsPassword },
        headers: { 'Content-Type': 'application/json' }
      });

      console.log(`✅ GenieACS response:`, response.data);

      // Jika task berhasil dibuat, berarti restart command berhasil dikirim
      // Device akan offline selama proses restart (1-2 menit)
      console.log(`🔄 Restart command sent successfully. Device will be offline during restart process.`);
      
    } catch (taskError) {
      console.error(`❌ Error sending restart task:`, taskError.response?.data || taskError.message);
      
      // Jika device tidak ditemukan saat mengirim task, berarti device baru saja offline
      if (taskError.response?.status === 404) {
        throw new Error('Device tidak dapat menerima perintah restart. Device mungkin baru saja offline atau sedang dalam proses restart.');
      }
      
      throw taskError;
    }

    // Kirim notifikasi WhatsApp ke pelanggan
    try {
      const waJid = phone.replace(/^0/, '62') + '@s.whatsapp.net';
      const msg = `🔄 *RESTART PERANGKAT*\n\n` +
        `Perintah restart berhasil dikirim ke perangkat Anda.\n\n` +
        `⏰ Proses restart memakan waktu 1-2 menit\n` +
        `📶 Koneksi internet akan terputus sementara\n` +
        `✅ Internet akan kembali normal setelah restart selesai\n\n` +
        `Terima kasih atas kesabaran Anda.`;
      await sendMessage(waJid, msg);
      console.log(`✅ WhatsApp notification sent to ${phone}`);
    } catch (e) {
      console.error('❌ Gagal mengirim notifikasi restart:', e);
    }

    res.json({ success: true, message: 'Perintah restart berhasil dikirim' });
  } catch (err) {
    console.error('❌ Error restart device:', err.message);
    console.error('❌ Error details:', err.response?.data || err);
    
    let errorMessage = 'Gagal mengirim perintah restart';
    
    // Berikan pesan yang lebih informatif berdasarkan error
    if (err.response?.status === 404) {
      errorMessage = 'Device tidak ditemukan atau sedang offline. Silakan coba lagi dalam beberapa menit.';
    } else if (err.response?.data?.message) {
      errorMessage = err.response.data.message;
    } else if (err.message) {
      errorMessage = err.message;
    }
    
    res.status(500).json({ 
      success: false, 
      message: errorMessage
    });
  }
});

// POST: Logout pelanggan
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/customer/login');
  });
});

// GET: Logout pelanggan (untuk link navigasi)
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/customer/login');
  });
});

// Import dan gunakan route laporan gangguan
const troubleReportRouter = require('./troubleReport');
router.use('/trouble', troubleReportRouter);

// Route form trouble report simpel (tanpa session)
router.get('/trouble/simple', (req, res) => {
  res.render('customer-trouble-simple');
});

// GET: Halaman Map untuk pelanggan
router.get('/map', async (req, res) => {
  try {
    // Cek apakah pelanggan sudah login
    if (!req.session.phone) {
      return res.redirect('/customer/login?redirect=/customer/map');
    }

    const customerPhone = req.session.phone;

    // Cek apakah nomor valid
    if (!await isValidCustomer(customerPhone)) {
      req.session.destroy();
      return res.redirect('/customer/login?error=invalid');
    }

    // Ambil data device pelanggan
    const customerData = await getCustomerDeviceData(customerPhone);
    if (!customerData) {
      return res.render('error', {
        message: 'Data perangkat tidak ditemukan',
        error: { status: 404 }
      });
    }

    // Render halaman map
    res.render('customer-map', {
      customerPhone,
      customerData,
      companyHeader: getSetting('company_header', 'ISP Monitor'),
      footerInfo: getSetting('footer_info', ''),
      currentPage: 'map'
    });

  } catch (error) {
    console.error('Error loading map page:', error);
    res.render('error', {
      message: 'Terjadi kesalahan saat memuat halaman map',
      error: { status: 500 }
    });
  }
});

// GET: API untuk data map pelanggan (JSON response untuk AJAX)
router.get('/map/data', async (req, res) => {
  try {
    // Cek apakah pelanggan sudah login
    if (!req.session.phone) {
      return res.status(401).json({
        success: false,
        message: 'Pelanggan belum login'
      });
    }

    const customerPhone = req.session.phone;

    // Cek apakah nomor valid
    if (!await isValidCustomer(customerPhone)) {
      return res.status(401).json({
        success: false,
        message: 'Nomor pelanggan tidak valid'
      });
    }

    // Panggil API map customer
    const axios = require('axios');
    const apiUrl = `${req.protocol}://${req.get('host')}/api/map/customer/${customerPhone}`;

    const response = await axios.get(apiUrl);

    res.json(response.data);

  } catch (error) {
    console.error('Error getting map data:', error);
    res.status(500).json({
      success: false,
      message: 'Error mengambil data map: ' + error.message
    });
  }
});

module.exports = router;
module.exports.getCustomerDeviceData = getCustomerDeviceData; 