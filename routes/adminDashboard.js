const express = require('express');
const router = express.Router();
const { adminAuth } = require('./adminAuth');

const { getDevices } = require('../config/genieacs');
const { getActivePPPoEConnections, getInactivePPPoEUsers } = require('../config/mikrotik');

// GET: Dashboard admin
router.get('/dashboard', adminAuth, async (req, res) => {
  let genieacsTotal = 0, genieacsOnline = 0, genieacsOffline = 0;
  let mikrotikTotal = 0, mikrotikAktif = 0, mikrotikOffline = 0;
  try {
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
    mikrotikOffline
  });
});

module.exports = router;
