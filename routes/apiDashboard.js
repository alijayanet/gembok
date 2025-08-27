const express = require('express');
const router = express.Router();
const { getInterfaceTraffic, getInterfaces } = require('../config/mikrotik');
const { getDevices, getDevice, findDeviceByPhoneNumber, getDeviceInfo } = require('../config/genieacs');

// Import settings manager
const { getSetting } = require('../config/settingsManager');
// API: GET /api/dashboard/traffic?interface=ether1
router.get('/dashboard/traffic', async (req, res) => {
  // Ambil interface dari query, jika tidak ada gunakan dari settings.json
  let iface = req.query.interface;
  if (!iface) {
    iface = getSetting('main_interface', 'ether1');
  }
  try {
    const traffic = await getInterfaceTraffic(iface);
    res.json({ success: true, rx: traffic.rx, tx: traffic.tx, interface: iface });
  } catch (e) {
    res.json({ success: false, rx: 0, tx: 0, message: e.message });
  }
});

// API: GET /api/dashboard/interfaces - Mendapatkan daftar interface yang tersedia
router.get('/dashboard/interfaces', async (req, res) => {
  try {
    const interfaces = await getInterfaces();
    if (interfaces.success) {
      // Filter interface yang umum digunakan untuk monitoring
      const commonInterfaces = interfaces.data.filter(iface => {
        const name = iface.name.toLowerCase();
        return name.startsWith('ether') || 
               name.startsWith('wlan') || 
               name.startsWith('sfp') || 
               name.startsWith('vlan') || 
               name.startsWith('bridge') || 
               name.startsWith('bond') ||
               name.startsWith('pppoe') ||
               name.startsWith('lte');
      });
      
      res.json({ 
        success: true, 
        interfaces: commonInterfaces.map(iface => ({
          name: iface.name,
          type: iface.type,
          disabled: iface.disabled === 'true',
          running: iface.running === 'true'
        }))
      });
    } else {
      res.json({ success: false, interfaces: [], message: interfaces.message });
    }
  } catch (e) {
    res.json({ success: false, interfaces: [], message: e.message });
  }
});

// API: GET /api/map/devices - Mendapatkan data ONU untuk map
router.get('/map/devices', async (req, res) => {
  try {
    console.log('📍 Mengambil data ONU untuk map...');

    // Ambil semua devices dari GenieACS
    const devices = await getDevices();

    if (!devices || devices.length === 0) {
      return res.json({
        success: true,
        devices: [],
        message: 'Tidak ada perangkat ONU yang ditemukan'
      });
    }

    const mapDevices = [];

    for (const device of devices) {
      try {
        // Ambil informasi dasar device
        const deviceId = device._id;
        const serialNumber = device.InternetGatewayDevice?.DeviceInfo?.SerialNumber?._value ||
                            device.Device?.DeviceInfo?.SerialNumber?._value || 'N/A';

        // Ambil informasi PPPoE username
        const pppoeUsername = device.InternetGatewayDevice?.WANDevice?.[1]?.WANConnectionDevice?.[1]?.WANPPPConnection?.[1]?.Username?._value ||
                             device.InternetGatewayDevice?.WANDevice?.[0]?.WANConnectionDevice?.[0]?.WANPPPConnection?.[0]?.Username?._value ||
                             device.VirtualParameters?.pppoeUsername?._value || 'N/A';

        // Ambil informasi lokasi dari tags atau virtual parameters
        let location = null;

        // Coba ambil dari VirtualParameters.location (format JSON)
        if (device.VirtualParameters?.location?._value) {
          try {
            location = JSON.parse(device.VirtualParameters.location._value);
          } catch (e) {
            console.log(`Format lokasi tidak valid untuk device ${deviceId}`);
          }
        }

        // Jika tidak ada di VirtualParameters, coba dari tags
        if (!location && device._tags && Array.isArray(device._tags)) {
          const locationTag = device._tags.find(tag => tag.startsWith('location:'));
          if (locationTag) {
            try {
              const locationData = locationTag.replace('location:', '');
              location = JSON.parse(locationData);
            } catch (e) {
              console.log(`Format lokasi dari tag tidak valid untuk device ${deviceId}`);
            }
          }
        }

        // Ambil informasi status dan sinyal
        const lastInform = device._lastInform ? new Date(device._lastInform) : null;
        const isOnline = lastInform && (new Date() - lastInform) < (24 * 60 * 60 * 1000); // Online jika inform dalam 24 jam

        // Ambil RX Power
        const rxPower = device.VirtualParameters?.RXPower?._value ||
                        device.VirtualParameters?.redaman?._value ||
                        device.InternetGatewayDevice?.WANDevice?.[1]?.WANPONInterfaceConfig?.RXPower?._value ||
                        'N/A';

        // Ambil nama pelanggan dari tags
        const customerTags = device._tags ? device._tags.filter(tag =>
          !tag.startsWith('location:') &&
          !tag.startsWith('pppoe:') &&
          tag.match(/^\d{10,15}$/) // Format nomor telepon
        ) : [];

        const customerPhone = customerTags.length > 0 ? customerTags[0] : 'N/A';

        // Hanya tambahkan device yang memiliki lokasi
        if (location && location.lat && location.lng) {
          mapDevices.push({
            id: deviceId,
            serialNumber,
            pppoeUsername,
            customerPhone,
            location: {
              lat: parseFloat(location.lat),
              lng: parseFloat(location.lng),
              address: location.address || 'N/A'
            },
            status: {
              isOnline,
              lastInform: lastInform ? lastInform.toLocaleString('id-ID') : 'N/A',
              rxPower: rxPower !== 'N/A' ? parseFloat(rxPower) : null
            },
            info: {
              manufacturer: device.InternetGatewayDevice?.DeviceInfo?.Manufacturer?._value || 'N/A',
              modelName: device.InternetGatewayDevice?.DeviceInfo?.ModelName?._value || 'N/A',
              softwareVersion: device.InternetGatewayDevice?.DeviceInfo?.SoftwareVersion?._value || 'N/A'
            }
          });
        }
      } catch (deviceError) {
        console.error(`Error memproses device ${device._id}:`, deviceError.message);
        continue;
      }
    }

    console.log(`📍 Berhasil memproses ${mapDevices.length} dari ${devices.length} perangkat ONU untuk map`);

    res.json({
      success: true,
      devices: mapDevices,
      total: mapDevices.length,
      message: `Berhasil mengambil ${mapDevices.length} perangkat ONU untuk map`
    });

  } catch (error) {
    console.error('❌ Error mengambil data ONU untuk map:', error.message);
    res.status(500).json({
      success: false,
      devices: [],
      message: 'Error mengambil data ONU: ' + error.message
    });
  }
});

// API: GET /api/map/customer/:phone - Mendapatkan data ONU pelanggan tertentu untuk map
router.get('/map/customer/:phone', async (req, res) => {
  try {
    const phone = req.params.phone;
    console.log(`🔍 Mencari ONU untuk pelanggan: ${phone}`);

    // Validasi format nomor telepon
    if (!phone || phone.length < 10) {
      return res.status(400).json({
        success: false,
        message: 'Nomor telepon tidak valid'
      });
    }

    // Import function yang sama seperti dashboard
    const { getCustomerDeviceData } = require('./customerPortal');
    
    // Gunakan fungsi yang sama seperti dashboard untuk mendapatkan data lengkap
    const customerData = await getCustomerDeviceData(phone);
    
    if (!customerData) {
      console.log(`❌ Device tidak ditemukan untuk nomor ${phone}`);
      return res.status(404).json({
        success: false,
        message: 'Perangkat ONU tidak ditemukan untuk nomor telepon ini. Pastikan nomor telepon sudah terdaftar di sistem dan ONU sudah terhubung ke GenieACS.'
      });
    }

    console.log(`✅ Device ditemukan untuk ${phone}:`, customerData.serialNumber);

    // Data customer sudah lengkap dari getCustomerDeviceData, sekarang cari lokasi
    const { findDeviceByTag } = require('../config/addWAN');
    let device;
    try {
      device = await findDeviceByTag(phone);
    } catch (error) {
      console.error(`❌ Error finding device by tag: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: 'Error mencari perangkat di GenieACS'
      });
    }

    if (!device) {
      return res.status(404).json({
        success: false,
        message: 'Perangkat tidak ditemukan di GenieACS'
      });
    }

    const deviceId = device._id;
    console.log(`🆔 Device ID: ${deviceId}`);

    // Ambil lokasi dari beberapa sumber
    let location = null;

    // 1. Coba ambil dari VirtualParameters.location (format JSON)
    if (device.VirtualParameters?.location?._value) {
      try {
        location = JSON.parse(device.VirtualParameters.location._value);
        console.log(`📍 Lokasi ditemukan di VirtualParameters untuk ${phone}:`, location);
      } catch (e) {
        console.log(`❌ Format lokasi VirtualParameters tidak valid untuk device ${deviceId}`);
      }
    }

    // 2. Jika tidak ada di VirtualParameters, coba dari tags
    if (!location && device._tags && Array.isArray(device._tags)) {
      const locationTag = device._tags.find(tag => tag.startsWith('location:'));
      if (locationTag) {
        try {
          const locationData = locationTag.replace('location:', '');
          location = JSON.parse(locationData);
          console.log(`📍 Lokasi ditemukan di tags untuk ${phone}:`, location);
        } catch (e) {
          console.log(`❌ Format lokasi dari tag tidak valid untuk device ${deviceId}`);
        }
      }
    }

    // 3. Jika masih tidak ada, coba dari JSON file
    if (!location) {
      console.log(`🔄 Trying fallback: getting location from JSON file for device ${deviceId}`);
      
      const fs = require('fs');
      const path = require('path');
      const locationsFile = path.join(__dirname, '../logs/onu-locations.json');
      
      if (fs.existsSync(locationsFile)) {
        try {
          const locationsData = JSON.parse(fs.readFileSync(locationsFile, 'utf8'));
          const locationFromFile = locationsData[deviceId];
          
          if (locationFromFile && locationFromFile.lat && locationFromFile.lng) {
            location = {
              lat: locationFromFile.lat,
              lng: locationFromFile.lng,
              address: locationFromFile.address || 'N/A'
            };
            console.log(`✅ Found location in JSON file for ${phone}:`, location);
          }
        } catch (fileError) {
          console.log(`❌ Error reading JSON file: ${fileError.message}`);
        }
      }
    }

    // Jika tidak ada lokasi, berikan response khusus
    if (!location || !location.lat || !location.lng) {
      console.log(`❌ Tidak ada lokasi yang tersimpan untuk device ${deviceId}`);
      return res.status(404).json({
        success: false,
        message: 'Data lokasi ONU belum tersedia. Silakan hubungi admin untuk menambahkan lokasi perangkat Anda.'
      });
    }

    // Konversi status untuk kompatibilitas dengan map
    const isOnline = customerData.status === 'Online';
    
    // Format response data menggunakan data lengkap dari dashboard
    const responseData = {
      success: true,
      device: {
        id: deviceId,
        serialNumber: customerData.serialNumber || 'N/A',
        pppoeUsername: customerData.pppoeUsername || 'N/A',
        customerPhone: phone,
        location: {
          lat: parseFloat(location.lat),
          lng: parseFloat(location.lng),
          address: location.address || customerData.lokasi || 'N/A'
        },
        status: {
          isOnline,
          lastInform: customerData.lastInform || 'N/A',
          rxPower: customerData.rxPower !== 'N/A' && customerData.rxPower !== '-' ? parseFloat(customerData.rxPower) : null
        },
        info: {
          manufacturer: customerData.productClass || 'N/A',
          modelName: customerData.model || 'N/A',
          softwareVersion: customerData.softwareVersion || 'N/A'
        }
      }
    };

    console.log(`✅ Berhasil mengambil data lengkap ONU untuk pelanggan ${phone}`);
    res.json(responseData);

  } catch (error) {
    console.error('❌ Error mengambil data ONU pelanggan:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error mengambil data ONU: ' + error.message
    });
  }
});

module.exports = router;
