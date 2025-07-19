const express = require('express');
const router = express.Router();
const { getInterfaceTraffic, getInterfaces } = require('../config/mikrotik');

// API: GET /api/dashboard/traffic?interface=ether1
const { getSetting } = require('../config/settingsManager');
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

module.exports = router;
