const express = require('express');
const router = express.Router();
const { adminAuth } = require('./adminAuth');
const fs = require('fs');
const path = require('path');
const { getDevices } = require('../config/genieacs');
const { getActivePPPoEConnections, getInactivePPPoEUsers } = require('../config/mikrotik');
const { getAllPackages, getAllCustomers, getAllInvoices } = require('../config/billing');
const { getAllTroubleReports } = require('../config/troubleReport');
const { logger } = require('../config/logger');

// GET: Advanced Analytics Dashboard
router.get('/analytics', adminAuth, async (req, res) => {
  try {
    console.log('📊 Analytics dashboard request received');
    
    // Ambil data dari berbagai sumber
    console.log('📊 Fetching async data...');
    const [devices, pppoeData] = await Promise.all([
      getDevices().catch((err) => {
        console.error('📊 Error getting devices:', err);
        return [];
      }),
      getActivePPPoEConnections().catch((err) => {
        console.error('📊 Error getting PPPoE data:', err);
        return { success: false, data: [] };
      })
    ]);
    
    console.log('📊 Async data received:', {
      devices: devices.length,
      pppoeSuccess: pppoeData.success,
      pppoeData: pppoeData.data ? pppoeData.data.length : 0
    });

    // Function synchronous - tidak perlu Promise.all
    console.log('📊 Fetching sync data...');
    let packages = [];
    let customers = [];
    let invoices = [];
    let troubleReports = [];

    try {
      packages = getAllPackages();
      console.log('📊 Packages loaded:', packages.length);
    } catch (error) {
      console.error('📊 Error getting packages:', error);
    }

    try {
      customers = getAllCustomers();
      console.log('📊 Customers loaded:', customers.length);
    } catch (error) {
      console.error('📊 Error getting customers:', error);
    }

    try {
      invoices = getAllInvoices();
      console.log('📊 Invoices loaded:', invoices.length);
    } catch (error) {
      console.error('📊 Error getting invoices:', error);
    }

    try {
      troubleReports = getAllTroubleReports();
      console.log('📊 Trouble reports loaded:', troubleReports.length);
    } catch (error) {
      console.error('📊 Error getting trouble reports:', error);
    }

    // Analytics untuk GenieACS
    const genieacsAnalytics = {
      total: devices.length,
      online: devices.filter(dev => {
        if (!dev._lastInform) return false;
        try {
          const lastInform = new Date(dev._lastInform).getTime();
          if (isNaN(lastInform)) return false; // Validasi tanggal
          const now = Date.now();
          return (now - lastInform) < 3600 * 1000; // Online dalam 1 jam terakhir
        } catch (error) {
          logger.error('Invalid _lastInform date:', dev._lastInform, error);
          return false;
        }
      }).length,
      offline: 0,
      byStatus: {},
      byManufacturer: {},
      byModel: {},
      signalStrength: {
        excellent: 0, // > -20 dBm
        good: 0,      // -20 to -30 dBm
        fair: 0,      // -30 to -40 dBm
        poor: 0       // < -40 dBm
      }
    };

    genieacsAnalytics.offline = genieacsAnalytics.total - genieacsAnalytics.online;

    // Analisis perangkat berdasarkan status dan manufacturer
    devices.forEach(device => {
      let status = 'unknown';
      if (device._lastInform) {
        try {
          const lastInform = new Date(device._lastInform).getTime();
          if (!isNaN(lastInform)) {
            status = (Date.now() - lastInform < 3600 * 1000 ? 'online' : 'offline');
          }
        } catch (error) {
          logger.error('Invalid _lastInform date in forEach:', device._lastInform, error);
        }
      }
      
      genieacsAnalytics.byStatus[status] = (genieacsAnalytics.byStatus[status] || 0) + 1;
      
      const manufacturer = device.InternetGatewayDevice?.DeviceInfo?.Manufacturer?._value || 'Unknown';
      genieacsAnalytics.byManufacturer[manufacturer] = (genieacsAnalytics.byManufacturer[manufacturer] || 0) + 1;
      
      const model = device.InternetGatewayDevice?.DeviceInfo?.ModelName?._value || 'Unknown';
      genieacsAnalytics.byModel[model] = (genieacsAnalytics.byModel[model] || 0) + 1;

      // Analisis signal strength - gunakan field yang benar untuk RX Power
      const rxPowerPaths = [
        'VirtualParameters.RXPower',
        'VirtualParameters.redaman',
        'InternetGatewayDevice.WANDevice.1.WANPONInterfaceConfig.RXPower',
        'Device.XPON.Interface.1.Stats.RXPower'
      ];
      
      let rxPower = null;
      
      // Cari RX Power dari berbagai field yang mungkin
      for (const path of rxPowerPaths) {
        try {
          const parts = path.split('.');
          let current = device;
          
          for (const part of parts) {
            if (!current) break;
            current = current[part];
          }
          
          if (current && current._value !== undefined) {
            rxPower = current._value;
            break;
          }
        } catch (error) {
          // Continue to next path
        }
      }
      
      if (rxPower && !isNaN(parseFloat(rxPower))) {
        const power = parseFloat(rxPower);
        if (power > -20) genieacsAnalytics.signalStrength.excellent++;
        else if (power > -30) genieacsAnalytics.signalStrength.good++;
        else if (power > -40) genieacsAnalytics.signalStrength.fair++;
        else genieacsAnalytics.signalStrength.poor++;
      }
    });

    // Analytics untuk Mikrotik PPPoE
    const mikrotikAnalytics = {
      total: pppoeData.success ? pppoeData.data.length : 0,
      active: pppoeData.success ? pppoeData.data.length : 0,
      inactive: 0,
      byProfile: {},
      connectionTime: {
        average: 0,
        max: 0,
        min: 0
      }
    };

    if (pppoeData.success) {
      pppoeData.data.forEach(conn => {
        const profile = conn.profile || 'Unknown';
        mikrotikAnalytics.byProfile[profile] = (mikrotikAnalytics.byProfile[profile] || 0) + 1;
      });
    }

    // Analytics untuk Billing
    const billingAnalytics = {
      packages: {
        total: packages.length,
        active: packages.filter(pkg => pkg.status === 'active').length,
        revenue: packages.reduce((sum, pkg) => sum + (pkg.price || 0), 0)
      },
      customers: {
        total: customers.length,
        active: customers.filter(cust => cust.status === 'active').length,
        inactive: customers.filter(cust => cust.status === 'inactive').length,
        isolir: customers.filter(cust => cust.status === 'isolir').length
      },
      invoices: {
        total: invoices.length,
        pending: invoices.filter(inv => inv.status === 'pending').length,
        paid: invoices.filter(inv => inv.status === 'paid').length,
        overdue: invoices.filter(inv => inv.status === 'overdue').length,
        totalAmount: invoices.reduce((sum, inv) => sum + (inv.amount || 0), 0),
        pendingAmount: invoices
          .filter(inv => inv.status === 'pending')
          .reduce((sum, inv) => sum + (inv.amount || 0), 0)
      }
    };

    // Debug logging untuk melihat data yang sebenarnya
    logger.info('Analytics Debug:', {
      devices: devices.length,
      packages: packages.length,
      customers: customers.length,
      invoices: invoices.length,
      troubleReports: troubleReports.length,
      genieacsOnline: genieacsAnalytics.online,
      signalStrength: genieacsAnalytics.signalStrength
    });

    // Analytics untuk Trouble Reports
    const troubleAnalytics = {
      total: troubleReports.length,
      byStatus: {},
      byCategory: {},
      byMonth: {},
      averageResolutionTime: 0
    };

    troubleReports.forEach(report => {
      const status = report.status || 'unknown';
      const category = report.category || 'unknown';
      let month = 'unknown';
      try {
        const reportDate = new Date(report.created_at);
        if (!isNaN(reportDate.getTime())) {
          month = reportDate.toISOString().substring(0, 7);
        }
      } catch (error) {
        logger.error('Invalid created_at date:', report.created_at, error);
      }
      
      troubleAnalytics.byStatus[status] = (troubleAnalytics.byStatus[status] || 0) + 1;
      troubleAnalytics.byCategory[category] = (troubleAnalytics.byCategory[category] || 0) + 1;
      troubleAnalytics.byMonth[month] = (troubleAnalytics.byMonth[month] || 0) + 1;
    });

    // Trend data untuk 30 hari terakhir
    const trendData = generateTrendData(invoices, troubleReports);

    res.render('adminAnalytics', {
      title: 'Advanced Analytics',
      page: 'analytics',
      genieacs: genieacsAnalytics,
      mikrotik: mikrotikAnalytics,
      billing: billingAnalytics,
      trouble: troubleAnalytics,
      trends: trendData,
      lastUpdated: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in analytics route:', error);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Gagal memuat data analytics',
      error: error.message
    });
  }
});

// GET: Analytics API untuk AJAX calls
router.get('/analytics/api/real-time', adminAuth, async (req, res) => {
  try {
    const [devices, pppoeData] = await Promise.all([
      getDevices().catch(() => []),
      getActivePPPoEConnections().catch(() => ({ success: false, data: [] }))
    ]);

    const now = Date.now();
    const onlineDevices = devices.filter(dev => {
      if (!dev._lastInform) return false;
      try {
        const lastInform = new Date(dev._lastInform).getTime();
        if (isNaN(lastInform)) return false;
        return (now - lastInform) < 3600 * 1000;
      } catch (error) {
        logger.error('Invalid _lastInform date in trend:', dev._lastInform, error);
        return false;
      }
    }).length;

    res.json({
      success: true,
      data: {
        timestamp: now,
        genieacs: {
          total: devices.length,
          online: onlineDevices,
          offline: devices.length - onlineDevices
        },
        mikrotik: {
          active: pppoeData.success ? pppoeData.data.length : 0
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Gagal memuat data real-time',
      error: error.message
    });
  }
});

// Helper function untuk generate trend data
function generateTrendData(invoices, troubleReports) {
  const trends = {
    revenue: [],
    troubleReports: [],
    customers: []
  };

  // Generate data untuk 30 hari terakhir
  for (let i = 29; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().substring(0, 10);
    
    // Revenue trend - cari invoice yang dibuat pada tanggal tersebut
    const dayRevenue = invoices
      .filter(inv => {
        if (!inv.created_at) return false;
        try {
          const invDate = new Date(inv.created_at);
          const invDateStr = invDate.toISOString().substring(0, 10);
          return invDateStr === dateStr;
        } catch (error) {
          return false;
        }
      })
      .reduce((sum, inv) => sum + (inv.amount || 0), 0);
    
    // Trouble reports trend - cari trouble report yang dibuat pada tanggal tersebut
    const dayTroubles = troubleReports
      .filter(tr => {
        if (!tr.created_at) return false;
        try {
          const trDate = new Date(tr.created_at);
          const trDateStr = trDate.toISOString().substring(0, 10);
          return trDateStr === dateStr;
        } catch (error) {
          return false;
        }
      })
      .length;

    trends.revenue.push({
      date: dateStr,
      value: dayRevenue
    });
    
    trends.troubleReports.push({
      date: dateStr,
      value: dayTroubles
    });
  }

  return trends;
}

module.exports = router;
