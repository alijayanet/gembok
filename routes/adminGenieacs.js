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
    res.render('adminGenieacs', { 
      title: 'Device GenieACS',
      devices, 
      settings, 
      genieacsTotal, 
      genieacsOnline, 
      genieacsOffline 
    });
  } catch (err) {
    res.render('adminGenieacs', { 
      title: 'Device GenieACS',
      devices: [], 
      error: 'Gagal mengambil data device.' 
    });
  }
});

// Endpoint edit SSID/Password - Optimized Fast Mode (Admin)
router.post('/genieacs/edit', adminAuth, async (req, res) => {
  try {
    const { id, ssid, password } = req.body;
    
    if (!id) {
      return res.status(400).json({ success: false, message: 'Device ID wajib diisi' });
    }
    
    console.log(`🚀 Admin fast edit for device: ${id}`);
    const startTime = Date.now();
    
    let updateResults = [];
    let totalProcessingTime = 0;
    
    // Update SSID dengan fast mode optimization
    if (ssid) {
      try {
        console.log(`📡 Admin updating SSID to: ${ssid}`);
        const result = await setParameterValues(id, { 
          'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID': ssid 
        });
        
        updateResults.push({
          field: 'ssid',
          success: true,
          onuType: result.onuType,
          mode: result.mode,
          processingTime: result.processingTime,
          parameters: result.parametersSet
        });
        
        console.log(`✅ Admin SSID updated in ${result.processingTime}ms (${result.mode} mode, ${result.onuType} ONU)`);
        
      } catch (e) {
        console.error(`❌ Admin SSID update failed:`, e.message);
        return res.status(500).json({ 
          success: false, 
          message: `Gagal update SSID: ${e.message}`,
          error: e.message
        });
      }
    }
    
    // Update Password dengan fast mode optimization
    if (password) {
      try {
        console.log(`🔐 Admin updating password`);
        const result = await setParameterValues(id, { 
          'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.KeyPassphrase': password 
        });
        
        updateResults.push({
          field: 'password',
          success: true,
          onuType: result.onuType,
          mode: result.mode,
          processingTime: result.processingTime,
          parameters: result.parametersSet
        });
        
        console.log(`✅ Admin password updated in ${result.processingTime}ms (${result.mode} mode, ${result.onuType} ONU)`);
        
      } catch (e) {
        console.error(`❌ Admin password update failed:`, e.message);
        return res.status(500).json({ 
          success: false, 
          message: `Gagal update password: ${e.message}`,
          error: e.message
        });
      }
    }
    
    totalProcessingTime = Date.now() - startTime;
    
    if (updateResults.length > 0) {
      // Aggregate performance info
      const modes = [...new Set(updateResults.map(r => r.mode))];
      const onuTypes = [...new Set(updateResults.map(r => r.onuType))];
      const totalParams = updateResults.reduce((sum, r) => sum + r.parameters, 0);
      
      console.log(`🎯 Admin edit completed: ${updateResults.length} fields, ${totalProcessingTime}ms total`);
      
      res.json({ 
        success: true, 
        fields: updateResults.map(r => r.field),
        totalTime: totalProcessingTime,
        onuType: onuTypes[0],
        mode: modes[0],
        totalParameters: totalParams,
        details: updateResults,
        message: `Update berhasil dalam ${totalProcessingTime}ms (${modes[0]} mode)`
      });
    } else {
      res.status(400).json({ success: false, message: 'Tidak ada perubahan yang diminta' });
    }
    
  } catch (err) {
    console.error('❌ Admin edit error:', err.message);
    res.status(500).json({ 
      success: false, 
      message: 'Gagal update SSID/Password: ' + err.message,
      error: err.message
    });
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

// Endpoint save location ONU
router.post('/genieacs/save-location', adminAuth, async (req, res) => {
  try {
    console.log('📍 Save location request received:', req.body);
    
    const { deviceId, serial, tag, lat, lng, address } = req.body;
    
    if (!deviceId || !lat || !lng) {
      console.log('❌ Validation failed: missing required fields');
      return res.status(400).json({ 
        success: false, 
        message: 'Device ID, latitude, dan longitude wajib diisi' 
      });
    }

    const fs = require('fs');
    const path = require('path');
    const locationsFile = path.join(__dirname, '../logs/onu-locations.json');
    
    console.log('📁 Locations file path:', locationsFile);
    
    // Pastikan direktori logs ada
    const logsDir = path.dirname(locationsFile);
    if (!fs.existsSync(logsDir)) {
      console.log('📁 Creating logs directory:', logsDir);
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    // Baca data lokasi yang sudah ada
    let locationsData = {};
    try {
      if (fs.existsSync(locationsFile)) {
        const fileContent = fs.readFileSync(locationsFile, 'utf8');
        console.log('📖 Reading existing locations file, size:', fileContent.length);
        locationsData = JSON.parse(fileContent);
        console.log('📊 Existing locations count:', Object.keys(locationsData).length);
      } else {
        console.log('📝 Creating new locations file');
      }
    } catch (e) {
      console.error('❌ Error reading locations file:', e.message);
      console.log('📝 Creating new locations data');
      locationsData = {};
    }
    
    // Validasi koordinat
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    
    if (isNaN(latitude) || isNaN(longitude)) {
      console.log('❌ Invalid coordinates:', { lat, lng, latitude, longitude });
      return res.status(400).json({
        success: false,
        message: 'Koordinat tidak valid'
      });
    }
    
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      console.log('❌ Coordinates out of range:', { latitude, longitude });
      return res.status(400).json({
        success: false,
        message: 'Koordinat di luar jangkauan yang valid'
      });
    }
    
    // Simpan/update lokasi device
    const locationData = {
      deviceId,
      serial: serial || '',
      tag: tag || '',
      lat: latitude,
      lng: longitude,
      address: address || '',
      lastUpdated: new Date().toISOString(),
      updatedBy: 'admin'
    };
    
    locationsData[deviceId] = locationData;
    
    console.log('💾 Saving location data for device:', deviceId);
    console.log('📍 Location data:', locationData);
    
    // Tulis kembali ke file dengan error handling yang lebih baik
    try {
      const jsonData = JSON.stringify(locationsData, null, 2);
      fs.writeFileSync(locationsFile, jsonData, 'utf8');
      console.log('✅ Location data written to file successfully');
      
      // Verify file was written
      if (fs.existsSync(locationsFile)) {
        const fileSize = fs.statSync(locationsFile).size;
        console.log('📊 File written successfully, size:', fileSize, 'bytes');
      } else {
        throw new Error('File was not created');
      }
      
    } catch (writeError) {
      console.error('❌ Error writing to file:', writeError.message);
      throw new Error('Gagal menulis file lokasi: ' + writeError.message);
    }
    
    console.log(`✅ Location saved successfully for device ${deviceId}: ${latitude}, ${longitude}`);
    
    res.json({ 
      success: true, 
      message: 'Lokasi berhasil disimpan',
      location: locationData
    });
    
  } catch (err) {
    console.error('❌ Error saving location:', err.message);
    console.error('❌ Stack trace:', err.stack);
    res.status(500).json({ 
      success: false, 
      message: 'Gagal menyimpan lokasi: ' + err.message 
    });
  }
});

// Endpoint get location ONU
router.get('/genieacs/get-location', adminAuth, async (req, res) => {
  try {
    const { deviceId } = req.query;
    
    if (!deviceId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Device ID wajib diisi' 
      });
    }

    const fs = require('fs');
    const path = require('path');
    const locationsFile = path.join(__dirname, '../logs/onu-locations.json');
    
    // Cek apakah file lokasi ada
    if (!fs.existsSync(locationsFile)) {
      return res.json({ 
        success: false, 
        message: 'No location data found' 
      });
    }
    
    // Baca data lokasi
    const locationsData = JSON.parse(fs.readFileSync(locationsFile, 'utf8'));
    
    // Cari lokasi device
    if (locationsData[deviceId]) {
      res.json({ 
        success: true, 
        location: locationsData[deviceId]
      });
    } else {
      res.json({ 
        success: false, 
        message: 'Location not found for this device' 
      });
    }
    
  } catch (err) {
    console.error('Error getting location:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Gagal mengambil lokasi: ' + err.message 
    });
  }
});

// Endpoint get all locations untuk map monitoring
router.get('/genieacs/get-all-locations', adminAuth, async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const locationsFile = path.join(__dirname, '../logs/onu-locations.json');
    
    // Cek apakah file lokasi ada
    if (!fs.existsSync(locationsFile)) {
      return res.json({ 
        success: true, 
        locations: {} 
      });
    }
    
    // Baca data lokasi
    const locationsData = JSON.parse(fs.readFileSync(locationsFile, 'utf8'));
    
    res.json({ 
      success: true, 
      locations: locationsData
    });
    
  } catch (err) {
    console.error('Error getting all locations:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Gagal mengambil semua lokasi: ' + err.message 
    });
  }
});

// Test route tanpa auth untuk memastikan routing bekerja
router.get('/test-onu', (req, res) => {
    console.log('Test ONU route accessed!');
    res.send('ONU route is working!');
});

// Debug route to check if router is working
router.get('/debug', (req, res) => {
    res.json({
        message: 'GenieACS router is working!',
        timestamp: new Date().toISOString(),
        routes: ['/test-onu', '/onu-monitoring', '/onu-map-data', '/save-location']
    });
});

// GET: ONU Monitoring Page - Halaman monitoring dengan peta
router.get('/onu-monitoring', (req, res) => {
    try {
        console.log('ONU monitoring route accessed - NO AUTH');
        res.send('ONU Monitoring Page is working! Route is accessible.');
    } catch (error) {
        console.error('Error loading ONU monitoring page:', error);
        res.status(500).send('Error: ' + error.message);
    }
});

// GET: ONU Map Data - Data ONU untuk peta
router.get('/onu-map-data', adminAuth, async (req, res) => {
    try {
        console.log('🔄 Getting ONU map data...');

        // Ambil data device dari GenieACS
        const devicesRaw = await getDevices();

        // Filter hanya ONU (Optical Network Unit) berdasarkan model atau parameter
        const onuDevices = devicesRaw.filter(device => {
            const model = device.DeviceID?.ProductClass || device.InternetGatewayDevice?.DeviceInfo?.ModelName?._value || '';
            const serialNumber = device.DeviceID?.SerialNumber || device._id || '';

            // Filter berdasarkan model ONU yang umum (ZTE, Huawei, Nokia, dll)
            const onuModels = ['onu', 'ont', 'zte', 'huawei', 'nokia', 'fiber', 'gpon', 'epon'];
            const isONU = onuModels.some(keyword =>
                model.toLowerCase().includes(keyword) ||
                serialNumber.toLowerCase().includes(keyword)
            );

            // Atau berdasarkan parameter yang menunjukkan ini adalah ONU
            const hasPONInterface = device.InternetGatewayDevice?.WANDevice?.[1]?.WANPONInterfaceConfig ||
                                   device.VirtualParameters?.RXPower ||
                                   device.VirtualParameters?.redaman;

            return isONU || hasPONInterface;
        });

        console.log(`📊 Found ${onuDevices.length} ONU devices from ${devicesRaw.length} total devices`);

        // Mapping data ONU dengan informasi untuk peta
        const onuMapData = onuDevices.map((device, i) => {
            const serialNumber = device.DeviceID?.SerialNumber || device._id || '-';
            const model = device.DeviceID?.ProductClass || device.InternetGatewayDevice?.DeviceInfo?.ModelName?._value || '-';
            const pppoeUsername = getParameterWithPaths(device, parameterPaths.pppUsername);
            const rxPower = getParameterWithPaths(device, parameterPaths.rxPower);
            const lastInform = device._lastInform ? new Date(device._lastInform).toLocaleString('id-ID') : '-';

            // Status koneksi berdasarkan lastInform
            const now = Date.now();
            const lastInformTime = device._lastInform ? new Date(device._lastInform).getTime() : 0;
            const timeDiff = now - lastInformTime;
            const hoursDiff = timeDiff / (1000 * 60 * 60);

            let connectionStatus = 'Offline';
            let statusColor = 'red';

            if (hoursDiff < 1) {
                connectionStatus = 'Online';
                statusColor = 'green';
            } else if (hoursDiff < 24) {
                connectionStatus = 'Idle';
                statusColor = 'yellow';
            }

            // Tag pelanggan
            const customerTag = (Array.isArray(device.Tags) && device.Tags.length > 0)
                ? device.Tags.join(', ')
                : (typeof device.Tags === 'string' && device.Tags)
                  ? device.Tags
                  : (Array.isArray(device._tags) && device._tags.length > 0)
                    ? device._tags.join(', ')
                    : (typeof device._tags === 'string' && device._tags)
                      ? device._tags
                      : '-';

            // Koordinat GPS (akan dibaca dari tag atau parameter)
            let latitude = -6.2088; // Default Jakarta
            let longitude = 106.8456;

            // Coba ambil koordinat dari tag (format: location:lat,lng)
            if (Array.isArray(device._tags)) {
                const locationTag = device._tags.find(tag => tag.startsWith('location:'));
                if (locationTag) {
                    const coords = locationTag.replace('location:', '').split(',');
                    if (coords.length === 2) {
                        latitude = parseFloat(coords[0]);
                        longitude = parseFloat(coords[1]);
                    }
                }
            }

            // Informasi pelanggan dari tag
            let customerName = '-';
            let customerPhone = '-';
            let customerLocation = '-';

            if (Array.isArray(device._tags)) {
                device._tags.forEach(tag => {
                    if (tag.startsWith('customer:')) {
                        customerName = tag.replace('customer:', '');
                    } else if (tag.startsWith('phone:')) {
                        customerPhone = tag.replace('phone:', '');
                    } else if (tag.startsWith('location:') && !tag.includes(',')) {
                        customerLocation = tag.replace('location:', '');
                    }
                });
            }

            return {
                id: device._id || device.DeviceID?.SerialNumber || '-',
                serialNumber: serialNumber,
                model: model,
                pppoeUsername: pppoeUsername,
                rxPower: rxPower,
                lastInform: lastInform,
                connectionStatus: connectionStatus,
                statusColor: statusColor,
                customerName: customerName,
                customerPhone: customerPhone,
                customerLocation: customerLocation,
                latitude: latitude,
                longitude: longitude,
                firmwareVersion: device.InternetGatewayDevice?.DeviceInfo?.SoftwareVersion?._value || '-',
                hardwareVersion: device.InternetGatewayDevice?.DeviceInfo?.HardwareVersion?._value || '-',
                ipAddress: device.InternetGatewayDevice?.WANDevice?.[1]?.WANConnectionDevice?.[1]?.WANPPPConnection?.[1]?.ExternalIPAddress?._value || '-'
            };
        });

        // Statistik untuk peta
        const stats = {
            total: onuMapData.length,
            online: onuMapData.filter(onu => onu.connectionStatus === 'Online').length,
            idle: onuMapData.filter(onu => onu.connectionStatus === 'Idle').length,
            offline: onuMapData.filter(onu => onu.connectionStatus === 'Offline').length,
            mapped: onuMapData.filter(onu => onu.customerName !== '-').length,
            unmapped: onuMapData.filter(onu => onu.customerName === '-').length
        };

        res.json({
            success: true,
            onuData: onuMapData,
            stats: stats,
            message: `Berhasil memuat ${onuMapData.length} ONU untuk peta`
        });

    } catch (error) {
        console.error('Error getting ONU map data:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal memuat data ONU untuk peta: ' + error.message
        });
    }
});

// POST: Save Location - Simpan koordinat GPS ke GenieACS
router.post('/save-location', adminAuth, async (req, res) => {
    try {
        const { deviceId, latitude, longitude, locationName } = req.body;

        if (!deviceId || !latitude || !longitude) {
            return res.status(400).json({
                success: false,
                message: 'Device ID, latitude, dan longitude wajib diisi'
            });
        }

        console.log(`🔧 Saving location for device ${deviceId}: ${latitude}, ${longitude}`);

        const axios = require('axios');
        const { getSetting } = require('../config/settingsManager');
        const genieacsUrl = getSetting('genieacs_url', 'http://localhost:7557');
        const genieacsUsername = getSetting('genieacs_username', 'admin');
        const genieacsPassword = getSetting('genieacs_password', 'password');

        // Format koordinat untuk disimpan sebagai tag
        const locationTag = `location:${latitude},${longitude}`;
        const locationNameTag = locationName ? `location_name:${locationName}` : null;

        // 1. Ambil tag lama perangkat
        let oldTags = [];
        try {
            const deviceResp = await axios.get(`${genieacsUrl}/devices/${encodeURIComponent(deviceId)}`, {
                auth: { username: genieacsUsername, password: genieacsPassword }
            });
            oldTags = deviceResp.data._tags || deviceResp.data.Tags || [];
            if (typeof oldTags === 'string') oldTags = [oldTags];
        } catch (e) {
            oldTags = [];
        }

        // 2. Hapus tag lokasi lama jika ada
        for (const oldTag of oldTags) {
            if (oldTag && (oldTag.startsWith('location:') || oldTag.startsWith('location_name:'))) {
                try {
                    await axios.delete(`${genieacsUrl}/devices/${encodeURIComponent(deviceId)}/tags/${encodeURIComponent(oldTag)}`, {
                        auth: { username: genieacsUsername, password: genieacsPassword }
                    });
                    console.log(`🗑️ Removed old location tag: ${oldTag}`);
                } catch (e) {
                    console.log(`⚠️ Could not delete old tag ${oldTag}`);
                }
            }
        }

        // 3. Tambahkan tag lokasi baru
        const newTags = [locationTag];
        if (locationNameTag) newTags.push(locationNameTag);

        for (const newTag of newTags) {
            try {
                await axios.post(`${genieacsUrl}/devices/${encodeURIComponent(deviceId)}/tags/${encodeURIComponent(newTag)}`, {}, {
                    auth: { username: genieacsUsername, password: genieacsPassword }
                });
                console.log(`✅ Added new location tag: ${newTag}`);
            } catch (e) {
                console.error(`❌ Error adding tag ${newTag}:`, e.message);
                return res.status(500).json({
                    success: false,
                    message: `Gagal menambahkan tag lokasi: ${e.message}`
                });
            }
        }

        res.json({
            success: true,
            message: `Lokasi berhasil disimpan untuk device ${deviceId}`,
            data: {
                deviceId: deviceId,
                latitude: latitude,
                longitude: longitude,
                locationName: locationName,
                tags: newTags
            }
        });

    } catch (error) {
        console.error('Error saving location:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal menyimpan lokasi: ' + error.message
        });
    }
});

// POST: Set Location for Device
router.post('/set-location', adminAuth, async (req, res) => {
    try {
        const { deviceId, location } = req.body;

        if (!deviceId || !location) {
            return res.status(400).json({
                success: false,
                message: 'Device ID dan lokasi harus disertakan'
            });
        }

        let locationData;
        try {
            locationData = JSON.parse(location);
        } catch (error) {
            return res.status(400).json({
                success: false,
                message: 'Format lokasi tidak valid'
            });
        }

        // Validasi koordinat
        if (!locationData.lat || !locationData.lng) {
            return res.status(400).json({
                success: false,
                message: 'Latitude dan longitude harus disertakan'
            });
        }

        // Validasi range koordinat
        const lat = parseFloat(locationData.lat);
        const lng = parseFloat(locationData.lng);

        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            return res.status(400).json({
                success: false,
                message: 'Koordinat tidak valid (Latitude: -90 sampai 90, Longitude: -180 sampai 180)'
            });
        }

        console.log(`📍 Setting location for device ${deviceId}:`, locationData);

        const axios = require('axios');
        const { getSetting } = require('../config/settingsManager');
        const genieacsUrl = getSetting('genieacs_url', 'http://localhost:7557');
        const genieacsUsername = getSetting('genieacs_username', 'admin');
        const genieacsPassword = getSetting('genieacs_password', 'password');

        // Format koordinat untuk disimpan sebagai tag
        const locationTag = `location:${lat},${lng}`;
        const addressTag = locationData.address ? `address:${locationData.address}` : null;

        // 1. Ambil tag lama perangkat
        let oldTags = [];
        try {
            const deviceResp = await axios.get(`${genieacsUrl}/devices/${encodeURIComponent(deviceId)}`, {
                auth: { username: genieacsUsername, password: genieacsPassword }
            });
            oldTags = deviceResp.data._tags || deviceResp.data.Tags || [];
            if (typeof oldTags === 'string') oldTags = [oldTags];
        } catch (e) {
            oldTags = [];
        }

        // 2. Hapus tag lokasi lama jika ada
        for (const oldTag of oldTags) {
            if (oldTag && (oldTag.startsWith('location:') || oldTag.startsWith('address:'))) {
                try {
                    await axios.delete(`${genieacsUrl}/devices/${encodeURIComponent(deviceId)}/tags/${encodeURIComponent(oldTag)}`, {
                        auth: { username: genieacsUsername, password: genieacsPassword }
                    });
                    console.log(`🗑️ Removed old location tag: ${oldTag}`);
                } catch (e) {
                    console.log(`⚠️ Could not delete old tag ${oldTag}`);
                }
            }
        }

        // 3. Tambahkan tag lokasi baru
        const newTags = [locationTag];
        if (addressTag) newTags.push(addressTag);

        for (const newTag of newTags) {
            try {
                await axios.post(`${genieacsUrl}/devices/${encodeURIComponent(deviceId)}/tags/${encodeURIComponent(newTag)}`, {}, {
                    auth: { username: genieacsUsername, password: genieacsPassword }
                });
                console.log(`✅ Added new location tag: ${newTag}`);
            } catch (e) {
                console.error(`❌ Error adding tag ${newTag}:`, e.message);
                return res.status(500).json({
                    success: false,
                    message: `Gagal menambahkan tag lokasi: ${e.message}`
                });
            }
        }

        console.log(`✅ Location berhasil disimpan untuk device ${deviceId}`);

        res.json({
            success: true,
            message: 'Lokasi berhasil disimpan',
            data: {
                deviceId: deviceId,
                location: locationData,
                tags: newTags
            }
        });

    } catch (error) {
        console.error('Error setting device location:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal menyimpan lokasi: ' + error.message
        });
    }
});

// GET: Map Settings - Mendapatkan settings untuk Google Maps
router.get('/map-settings', (req, res) => {
  try {
    const { getSetting } = require('../config/settingsManager');

    const mapSettings = {
      googleMapsApiKey: getSetting('google_maps_api_key', ''),
      defaultCenter: {
        lat: -6.2088,
        lng: 106.8456
      },
      defaultZoom: 15,
      jakartaCenter: {
        lat: -6.2088,
        lng: 106.8456
      }
    };

    res.json({
      success: true,
      settings: mapSettings
    });

  } catch (error) {
    console.error('Error getting map settings:', error);
    res.status(500).json({
      success: false,
      message: 'Gagal mendapatkan settings peta'
    });
  }
});

// GET: Test endpoint untuk memverifikasi router berfungsi
router.get('/test-route', (req, res) => {
  res.json({
    success: true,
    message: 'Router is working!',
    timestamp: new Date().toISOString()
  });
});

// POST: Reverse Geocoding Proxy - untuk mengatasi CORS issue dengan Nominatim
router.post('/reverse-geocode', async (req, res) => {
  try {
    const { lat, lng } = req.body;

    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required'
      });
    }

    // Menggunakan Nominatim API untuk reverse geocoding
    const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`;

    const axios = require('axios');
    const response = await axios.get(nominatimUrl, {
      headers: {
        'User-Agent': 'Alijaya-Digital-Network/1.0'
      }
    });

    res.json({
      success: true,
      data: response.data
    });

  } catch (error) {
    console.error('Error reverse geocoding:', error);
    res.status(500).json({
      success: false,
      message: 'Error reverse geocoding',
      error: error.message
    });
  }
});

// Endpoint batch edit SSID/Password untuk multiple devices - Admin Fast Mode
router.post('/genieacs/batch-edit', adminAuth, async (req, res) => {
  try {
    const { devices, ssid, password } = req.body;
    
    if (!devices || !Array.isArray(devices) || devices.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Daftar device wajib diisi dan tidak boleh kosong' 
      });
    }
    
    if (!ssid && !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'SSID atau password harus diisi' 
      });
    }
    
    console.log(`🚀 Admin batch edit for ${devices.length} devices`);
    const startTime = Date.now();
    
    // Process devices in parallel for better performance
    const batchPromises = devices.map(async (deviceId, index) => {
      try {
        console.log(`📱 Processing device ${index + 1}/${devices.length}: ${deviceId}`);
        
        const deviceResults = [];
        
        // Update SSID if provided
        if (ssid) {
          const ssidResult = await setParameterValues(deviceId, { 
            'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID': ssid 
          });
          deviceResults.push({
            field: 'ssid',
            onuType: ssidResult.onuType,
            mode: ssidResult.mode,
            processingTime: ssidResult.processingTime
          });
        }
        
        // Update password if provided
        if (password) {
          const passwordResult = await setParameterValues(deviceId, { 
            'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.KeyPassphrase': password 
          });
          deviceResults.push({
            field: 'password',
            onuType: passwordResult.onuType,
            mode: passwordResult.mode,
            processingTime: passwordResult.processingTime
          });
        }
        
        return {
          deviceId,
          success: true,
          results: deviceResults
        };
        
      } catch (error) {
        console.error(`❌ Error processing device ${deviceId}:`, error.message);
        return {
          deviceId,
          success: false,
          error: error.message
        };
      }
    });
    
    // Wait for all devices to be processed
    const results = await Promise.all(batchPromises);
    
    // Separate successful and failed updates
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    
    const totalProcessingTime = Date.now() - startTime;
    
    // Calculate performance statistics
    const onuTypes = {};
    const modes = {};
    let totalParams = 0;
    
    successful.forEach(result => {
      result.results.forEach(r => {
        onuTypes[r.onuType] = (onuTypes[r.onuType] || 0) + 1;
        modes[r.mode] = (modes[r.mode] || 0) + 1;
        totalParams++;
      });
    });
    
    console.log(`🎯 Batch edit completed: ${successful.length}/${devices.length} successful, ${totalProcessingTime}ms total`);
    
    res.json({
      success: true,
      totalDevices: devices.length,
      successful: successful.length,
      failed: failed.length,
      totalTime: totalProcessingTime,
      avgTimePerDevice: Math.round(totalProcessingTime / devices.length),
      onuTypeStats: onuTypes,
      modeStats: modes,
      totalParameters: totalParams,
      successfulDevices: successful,
      failedDevices: failed,
      message: `Batch update berhasil: ${successful.length}/${devices.length} device dalam ${totalProcessingTime}ms`
    });
    
  } catch (err) {
    console.error('❌ Batch edit error:', err.message);
    res.status(500).json({ 
      success: false, 
      message: 'Gagal melakukan batch update: ' + err.message,
      error: err.message
    });
  }
});

module.exports = router;
