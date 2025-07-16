const express = require('express');
const router = express.Router();
const { getInterfaceTraffic } = require('../config/mikrotik');

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

module.exports = router;
