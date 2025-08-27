const express = require('express');
const router = express.Router();
const { adminAuth } = require('./adminAuth');
const fs = require('fs');
const path = require('path');

const { getDevices } = require('../config/genieacs');
const { getActivePPPoEConnections, getInactivePPPoEUsers } = require('../config/mikrotik');
const { genieacsApi } = require('../config/genieacs');

// GET: Dashboard admin
router.get('/dashboard', adminAuth, async (req, res) => {
  let genieacsTotal = 0, genieacsOnline = 0, genieacsOffline = 0;
  let mikrotikTotal = 0, mikrotikAktif = 0, mikrotikOffline = 0;
  let settings = {};
  
  try {
    // Baca settings.json
    settings = JSON.parse(fs.readFileSync(path.join(__dirname, '../settings.json'), 'utf8'));
    
    // GenieACS
    const devices = await getDevices();
    genieacsTotal = devices.length;
    // Anggap device online jika ada _lastInform dalam 1 jam terakhir
    const now = Date.now();
    genieacsOnline = devices.filter(dev => dev._lastInform && (now - new Date(dev._lastInform).getTime()) < 3600*1000).length;
    genieacsOffline = genieacsTotal - genieacsOnline;
    // Mikrotik
    const aktifResult = await getActivePPPoEConnections();
    mikrotikAktif = aktifResult.success ? aktifResult.data.length : 0;
    const offlineResult = await getInactivePPPoEUsers();
    mikrotikOffline = offlineResult.success ? offlineResult.totalInactive : 0;
    mikrotikTotal = (offlineResult.success ? offlineResult.totalSecrets : 0);
  } catch (e) {
    console.error('Error in dashboard route:', e);
    // Jika error, biarkan value default 0
  }
  
  res.render('adminDashboard', {
    title: 'Dashboard Admin',
    page: 'dashboard',
    genieacsTotal,
    genieacsOnline,
    genieacsOffline,
    mikrotikTotal,
    mikrotikAktif,
    mikrotikOffline,
    settings // Sertakan settings di sini
  });
});

// GET: Admin Map Monitoring
router.get('/map', adminAuth, async (req, res) => {
  try {
    console.log('🗺️ Loading admin map monitoring page...');

    // Ambil statistik dasar untuk dashboard
    let genieacsTotal = 0, genieacsOnline = 0, genieacsOffline = 0;
    let totalWithLocation = 0;

    try {
      const devices = await getDevices();
      genieacsTotal = devices.length;

      // Hitung device online/offline
      const now = Date.now();
      const oneHour = 3600 * 1000;
      genieacsOnline = devices.filter(dev => dev._lastInform && (now - new Date(dev._lastInform).getTime()) < oneHour).length;
      genieacsOffline = genieacsTotal - genieacsOnline;

      // Hitung device dengan lokasi
      for (const device of devices) {
        let location = null;

        // Cek VirtualParameters.location
        if (device.VirtualParameters?.location?._value) {
          try {
            JSON.parse(device.VirtualParameters.location._value);
            totalWithLocation++;
            continue;
          } catch (e) {}
        }

        // Cek tags dengan location:
        if (device._tags && Array.isArray(device._tags)) {
          const locationTag = device._tags.find(tag => tag.startsWith('location:'));
          if (locationTag) {
            try {
              JSON.parse(locationTag.replace('location:', ''));
              totalWithLocation++;
            } catch (e) {}
          }
        }
      }
    } catch (e) {
      console.error('Error getting device statistics:', e);
    }

    // Baca settings
    const settings = JSON.parse(fs.readFileSync(path.join(__dirname, '../settings.json'), 'utf8'));

    res.render('admin-map', {
      title: 'Map Monitoring - Admin',
      page: 'map',
      genieacsTotal,
      genieacsOnline,
      genieacsOffline,
      totalWithLocation,
      coveragePercentage: genieacsTotal > 0 ? Math.round((totalWithLocation / genieacsTotal) * 100) : 0,
      settings
    });

  } catch (error) {
    console.error('Error loading admin map page:', error);
    res.render('error', {
      message: 'Terjadi kesalahan saat memuat halaman map monitoring',
      error: { status: 500 }
    });
  }
});

// GET: Admin Map Data (JSON untuk AJAX)
router.get('/map/data', adminAuth, async (req, res) => {
  try {
    console.log('📍 Getting admin map data...');

    // Ambil semua devices dari GenieACS
    const devices = await getDevices();
    
    // Ambil data lokasi dari file JSON
    const fs = require('fs');
    const path = require('path');
    const locationsFile = path.join(__dirname, '../logs/onu-locations.json');
    let savedLocations = {};
    
    try {
      if (fs.existsSync(locationsFile)) {
        savedLocations = JSON.parse(fs.readFileSync(locationsFile, 'utf8'));
        console.log(`📍 Loaded ${Object.keys(savedLocations).length} saved locations`);
      }
    } catch (e) {
      console.log('No saved locations file found or invalid format');
    }

    if (!devices || devices.length === 0) {
      return res.json({
        success: true,
        devices: [],
        summary: {
          total: 0,
          online: 0,
          offline: 0,
          withLocation: 0
        },
        message: 'Tidak ada perangkat ONU yang ditemukan'
      });
    }

    const mapDevices = [];
    let onlineCount = 0;
    let offlineCount = 0;
    let withLocationCount = 0;

    // Filter parameters dari query
    const filter = req.query.filter || 'all'; // all, online, offline, with-location
    const search = req.query.search || ''; // search by serial/pppoe/username

    for (const device of devices) {
      try {
        // Ambil informasi dasar device
        const deviceId = device._id;
        const serialNumber = device.InternetGatewayDevice?.DeviceInfo?.SerialNumber?._value ||
                            device.Device?.DeviceInfo?.SerialNumber?._value || deviceId || 'N/A';

        // Ambil informasi PPPoE username
        const pppoeUsername = device.InternetGatewayDevice?.WANDevice?.[1]?.WANConnectionDevice?.[1]?.WANPPPConnection?.[1]?.Username?._value ||
                             device.InternetGatewayDevice?.WANDevice?.[0]?.WANConnectionDevice?.[0]?.WANPPPConnection?.[0]?.Username?._value ||
                             device.VirtualParameters?.pppoeUsername?._value || 'N/A';

        // Ambil informasi lokasi - prioritas dari file JSON yang tersimpan
        let location = null;
        let hasLocation = false;

        // 1. Cek lokasi dari file JSON (prioritas utama)
        if (savedLocations[deviceId]) {
          const savedLoc = savedLocations[deviceId];
          location = {
            lat: savedLoc.lat,
            lng: savedLoc.lng,
            address: savedLoc.address || 'N/A',
            lastUpdated: savedLoc.lastUpdated,
            source: 'admin_map'
          };
          hasLocation = true;
          withLocationCount++;
        }
        // 2. Fallback ke VirtualParameters.location
        else if (device.VirtualParameters?.location?._value) {
          try {
            const parsedLocation = JSON.parse(device.VirtualParameters.location._value);
            location = {
              lat: parsedLocation.lat,
              lng: parsedLocation.lng,
              address: parsedLocation.address || 'N/A',
              source: 'virtual_parameters'
            };
            hasLocation = true;
            withLocationCount++;
          } catch (e) {
            console.log(`Format lokasi tidak valid untuk device ${deviceId}`);
          }
        }
        // 3. Fallback ke tags
        else if (device._tags && Array.isArray(device._tags)) {
          const locationTag = device._tags.find(tag => tag.startsWith('location:'));
          if (locationTag) {
            try {
              const locationData = locationTag.replace('location:', '');
              const parsedLocation = JSON.parse(locationData);
              location = {
                lat: parsedLocation.lat,
                lng: parsedLocation.lng,
                address: parsedLocation.address || 'N/A',
                source: 'tags'
              };
              hasLocation = true;
              withLocationCount++;
            } catch (e) {
              console.log(`Format lokasi dari tag tidak valid untuk device ${deviceId}`);
            }
          }
        }

        // Ambil informasi status
        const lastInform = device._lastInform ? new Date(device._lastInform) : null;
        const now = new Date();
        const timeDiff = lastInform ? (now - lastInform) / (1000 * 60 * 60) : Infinity; // dalam jam
        
        let statusText = 'Offline';
        let isOnline = false;
        
        if (timeDiff < 1) {
          statusText = 'Online';
          isOnline = true;
          onlineCount++;
        } else if (timeDiff < 24) {
          statusText = 'Idle';
          onlineCount++; // Count Idle as online for basic stats
        } else {
          statusText = 'Offline';
          offlineCount++;
        }

        // Ambil RX Power
        const rxPower = device.VirtualParameters?.RXPower?._value ||
                        device.VirtualParameters?.redaman?._value ||
                        device.InternetGatewayDevice?.WANDevice?.[1]?.WANPONInterfaceConfig?.RXPower?._value ||
                        'N/A';

        // Ambil SSID untuk edit functionality
        const ssid = device.InternetGatewayDevice?.LANDevice?.['1']?.WLANConfiguration?.['1']?.SSID?._value || 'N/A';
        const wifiPassword = device.InternetGatewayDevice?.LANDevice?.['1']?.WLANConfiguration?.['1']?.KeyPassphrase?._value || 'N/A';

        // Ambil nama pelanggan dari tags
        const customerTags = device._tags ? device._tags.filter(tag =>
          !tag.startsWith('location:') &&
          !tag.startsWith('pppoe:') &&
          tag.match(/^\d{10,15}$/) // Format nomor telepon
        ) : [];
        const customerPhone = customerTags.length > 0 ? customerTags[0] : 'N/A';
        
        // Tag pelanggan untuk display
        const customerTag = (Array.isArray(device.Tags) && device.Tags.length > 0)
          ? device.Tags.join(', ')
          : (typeof device.Tags === 'string' && device.Tags)
            ? device.Tags
            : (Array.isArray(device._tags) && device._tags.length > 0)
              ? device._tags.join(', ')
              : (typeof device._tags === 'string' && device._tags)
                ? device._tags
                : 'N/A';

        // Filter berdasarkan kriteria
        let shouldInclude = true;

        // Filter status
        if (filter === 'online' && statusText !== 'Online') shouldInclude = false;
        if (filter === 'offline' && statusText !== 'Offline') shouldInclude = false;
        if (filter === 'with-location' && !hasLocation) shouldInclude = false;

        // Filter search
        if (search && shouldInclude) {
          const searchLower = search.toLowerCase();
          const searchableText = `${serialNumber} ${pppoeUsername} ${customerPhone} ${customerTag}`.toLowerCase();
          if (!searchableText.includes(searchLower)) {
            shouldInclude = false;
          }
        }

        // Hanya tambahkan device yang sesuai filter
        if (shouldInclude) {
          mapDevices.push({
            id: deviceId,
            serialNumber,
            pppoeUsername,
            customerPhone,
            customerTag,
            hasLocation,
            location: hasLocation ? {
              lat: parseFloat(location.lat),
              lng: parseFloat(location.lng),
              address: location.address || 'N/A',
              source: location.source || 'unknown',
              lastUpdated: location.lastUpdated || 'N/A'
            } : null,
            status: {
              isOnline,
              statusText,
              lastInform: lastInform ? lastInform.toLocaleString('id-ID') : 'N/A',
              rxPower: rxPower !== 'N/A' ? parseFloat(rxPower) : null,
              timeDiffHours: timeDiff !== Infinity ? Math.round(timeDiff * 100) / 100 : null
            },
            wifi: {
              ssid,
              password: wifiPassword
            },
            info: {
              manufacturer: device.InternetGatewayDevice?.DeviceInfo?.Manufacturer?._value || 'N/A',
              modelName: device.InternetGatewayDevice?.DeviceInfo?.ModelName?._value || 'N/A',
              softwareVersion: device.InternetGatewayDevice?.DeviceInfo?.SoftwareVersion?._value || 'N/A',
              productClass: device.DeviceID?.ProductClass || device.InternetGatewayDevice?.DeviceInfo?.ProductClass?._value || 'N/A'
            },
            tags: device._tags || [],
            lastInform: device._lastInform
          });
        }
      } catch (deviceError) {
        console.error(`Error memproses device ${device._id}:`, deviceError.message);
        continue;
      }
    }

    console.log(`📍 Berhasil memproses ${mapDevices.length} dari ${devices.length} perangkat ONU untuk admin map`);

    res.json({
      success: true,
      devices: mapDevices,
      summary: {
        total: devices.length,
        online: onlineCount,
        offline: offlineCount,
        withLocation: withLocationCount,
        filtered: mapDevices.length
      },
      filters: {
        status: filter,
        search: search
      },
      locations: {
        saved: Object.keys(savedLocations).length,
        mapped: withLocationCount
      },
      message: `Berhasil mengambil ${mapDevices.length} perangkat ONU untuk monitoring`
    });

  } catch (error) {
    console.error('❌ Error mengambil data admin map:', error.message);
    res.status(500).json({
      success: false,
      devices: [],
      summary: { total: 0, online: 0, offline: 0, withLocation: 0, filtered: 0 },
      message: 'Error mengambil data ONU: ' + error.message
    });
  }
});

module.exports = router;
