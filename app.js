const express = require('express');
const path = require('path');
const axios = require('axios');
const { logger } = require('./config/logger');
const whatsapp = require('./config/whatsapp');
const { monitorPPPoEConnections } = require('./config/mikrotik');
const fs = require('fs');
const session = require('express-session');
const { getSetting } = require('./config/settingsManager');

// Inisialisasi aplikasi Express
const app = express();

// Import route adminAuth
const { router: adminAuthRouter } = require('./routes/adminAuth');

// Middleware dasar
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(session({
  secret: 'rahasia-portal-anda', // Ganti dengan string random yang aman
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}));

// Gunakan route adminAuth untuk /admin
app.use('/admin', adminAuthRouter);

// Import dan gunakan route adminDashboard
const adminDashboardRouter = require('./routes/adminDashboard');
app.use('/admin', adminDashboardRouter);

// Import dan gunakan route adminGenieacs
const adminGenieacsRouter = require('./routes/adminGenieacs');
app.use('/admin', adminGenieacsRouter);

// Import dan gunakan route adminMikrotik
const adminMikrotikRouter = require('./routes/adminMikrotik');
app.use('/admin', adminMikrotikRouter);

// Import dan gunakan route adminHotspot
const adminHotspotRouter = require('./routes/adminHotspot');
app.use('/admin/hotspot', adminHotspotRouter);

// Import dan gunakan route adminSetting
const adminSettingRouter = require('./routes/adminSetting');
const { adminAuth } = require('./routes/adminAuth');
app.use('/admin/setting', adminAuth, adminSettingRouter);

// Import dan gunakan route adminTroubleReport
const adminTroubleReportRouter = require('./routes/adminTroubleReport');
app.use('/admin/trouble', adminAuth, adminTroubleReportRouter);

// Import dan gunakan route testTroubleReport untuk debugging
const testTroubleReportRouter = require('./routes/testTroubleReport');
app.use('/test/trouble', testTroubleReportRouter);

// Route untuk halaman test trouble report
app.get('/test-trouble-report', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'test-trouble-report.html'));
});

// Route test trouble report langsung
app.get('/test-trouble-direct', async (req, res) => {
    try {
        const { createTroubleReport, updateTroubleReportStatus } = require('./config/troubleReport');
        const { logger } = require('./config/logger');
        
        logger.info('🧪 Test trouble report langsung dimulai...');
        
        const testReport = {
            phone: '081234567890',
            name: 'Test User Direct',
            location: 'Test Location Direct',
            category: 'Internet Lambat',
            description: 'Test deskripsi masalah internet lambat untuk testing notifikasi WhatsApp - test langsung'
        };
        
        const newReport = createTroubleReport(testReport);
        
        if (newReport) {
            logger.info(`✅ Laporan gangguan berhasil dibuat dengan ID: ${newReport.id}`);
            
            // Test update status setelah 3 detik
            setTimeout(async () => {
                logger.info(`🔄 Test update status untuk laporan ${newReport.id}...`);
                const updatedReport = updateTroubleReportStatus(
                    newReport.id, 
                    'in_progress', 
                    'Test update status dari test langsung - sedang ditangani',
                    true // sendNotification = true
                );
                
                if (updatedReport) {
                    logger.info(`✅ Status laporan berhasil diupdate ke: ${updatedReport.status}`);
                }
            }, 3000);
            
            res.json({
                success: true,
                message: 'Test trouble report berhasil dijalankan',
                report: newReport,
                note: 'Status akan diupdate otomatis dalam 3 detik. Cek log server untuk melihat notifikasi WhatsApp.'
            });
        } else {
            logger.error('❌ Gagal membuat laporan gangguan');
            res.status(500).json({
                success: false,
                message: 'Gagal membuat laporan gangguan'
            });
        }
    } catch (error) {
        console.error('❌ Error dalam test trouble report:', error.message);
        res.status(500).json({
            success: false,
            message: 'Error dalam test trouble report',
            error: error.message
        });
    }
});

// Route test restart device
app.get('/test-restart-device', (req, res) => {
    res.sendFile(path.join(__dirname, 'test-restart-device.html'));
});

// Route test session
app.get('/test-session', (req, res) => {
    res.sendFile(path.join(__dirname, 'test-session.html'));
});

// Route test restart device web interface
app.get('/test-restart-web', (req, res) => {
    res.sendFile(path.join(__dirname, 'test-restart-web.html'));
});

// Route test frontend debug
app.get('/test-frontend-debug', (req, res) => {
    res.sendFile(path.join(__dirname, 'test-frontend-debug.html'));
});

// Route test dashboard simple
app.get('/test-dashboard-simple', (req, res) => {
    res.sendFile(path.join(__dirname, 'test-dashboard-simple.html'));
});

// Route test upload logo tanpa auth
app.get('/test-upload-logo', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Test Upload Logo</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                .form-group { margin: 10px 0; }
                input[type="file"] { margin: 10px 0; }
                button { padding: 10px 20px; background: #007bff; color: white; border: none; cursor: pointer; }
                .result { margin: 10px 0; padding: 10px; border-radius: 5px; }
                .success { background: #d4edda; color: #155724; }
                .error { background: #f8d7da; color: #721c24; }
            </style>
        </head>
        <body>
            <h2>Test Upload Logo</h2>
            <form id="uploadForm" enctype="multipart/form-data">
                <div class="form-group">
                    <label>Pilih file logo:</label><br>
                    <input type="file" name="logo" accept="image/*" required>
                </div>
                <button type="submit">Upload Logo</button>
            </form>
            <div id="result"></div>
            
            <script>
                document.getElementById('uploadForm').addEventListener('submit', function(e) {
                    e.preventDefault();
                    
                    const formData = new FormData(this);
                    const resultDiv = document.getElementById('result');
                    
                    fetch('/admin/setting/upload-logo', {
                        method: 'POST',
                        body: formData
                    })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            resultDiv.innerHTML = '<div class="result success">✓ ' + data.message + '</div>';
                        } else {
                            resultDiv.innerHTML = '<div class="result error">✗ ' + data.error + '</div>';
                        }
                    })
                    .catch(error => {
                        resultDiv.innerHTML = '<div class="result error">✗ Error: ' + error.message + '</div>';
                    });
                });
            </script>
        </body>
        </html>
    `);
});

// Import dan gunakan route API dashboard traffic
const apiDashboardRouter = require('./routes/apiDashboard');
app.use('/api', apiDashboardRouter);

// Konstanta
const VERSION = '1.0.0';

// Variabel global untuk menyimpan status koneksi WhatsApp
global.whatsappStatus = {
    connected: false,
    qrCode: null,
    phoneNumber: null,
    connectedSince: null,
    status: 'disconnected'
};

// Variabel global untuk menyimpan semua pengaturan dari settings.json
global.appSettings = {
  // Server
  port: getSetting('server_port', 4555),
  host: getSetting('server_host', 'localhost'),
  
  // Admin
  adminUsername: getSetting('admin_username', 'admin'),
  adminPassword: getSetting('admin_password', 'admin'),
  
  // GenieACS
  genieacsUrl: getSetting('genieacs_url', 'http://localhost:7557'),
  genieacsUsername: getSetting('genieacs_username', ''),
  genieacsPassword: getSetting('genieacs_password', ''),
  
  // Mikrotik
  mikrotikHost: getSetting('mikrotik_host', ''),
  mikrotikPort: getSetting('mikrotik_port', '8728'),
  mikrotikUser: getSetting('mikrotik_user', ''),
  mikrotikPassword: getSetting('mikrotik_password', ''),
  
  // WhatsApp
  adminNumber: getSetting('admins', [''])[0] || '',
  technicianNumbers: getSetting('technician_numbers', []).join(','),
  reconnectInterval: 5000,
  maxReconnectRetries: 5,
  whatsappSessionPath: getSetting('whatsapp_session_path', './whatsapp-session'),
  whatsappKeepAlive: getSetting('whatsapp_keep_alive', true),
  whatsappRestartOnError: getSetting('whatsapp_restart_on_error', true),
  
  // Monitoring
  pppoeMonitorInterval: getSetting('pppoe_monitor_interval', 60000),
  rxPowerWarning: getSetting('rx_power_warning', -25),
  rxPowerCritical: getSetting('rx_power_critical', -27),
  rxPowerNotificationEnable: getSetting('rx_power_notification_enable', true),
  rxPowerNotificationInterval: getSetting('rx_power_notification_interval', 300000),
  
  // Company Info
  companyHeader: getSetting('company_header', 'ISP Monitor'),
  footerInfo: getSetting('footer_info', ''),
};

// Pastikan direktori sesi WhatsApp ada
const sessionDir = global.appSettings.whatsappSessionPath || './whatsapp-session';
if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
    logger.info(`Direktori sesi WhatsApp dibuat: ${sessionDir}`);
}

// Route untuk health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        version: VERSION,
        whatsapp: global.whatsappStatus.status
    });
});

// Route untuk mendapatkan status WhatsApp
app.get('/whatsapp/status', (req, res) => {
    res.json({
        status: global.whatsappStatus.status,
        connected: global.whatsappStatus.connected,
        phoneNumber: global.whatsappStatus.phoneNumber,
        connectedSince: global.whatsappStatus.connectedSince
    });
});

// Redirect root ke portal pelanggan
app.get('/', (req, res) => {
  res.redirect('/customer/login');
});

// Import PPPoE monitoring modules
const pppoeMonitor = require('./config/pppoe-monitor');
const pppoeCommands = require('./config/pppoe-commands');

// Import GenieACS commands module
const genieacsCommands = require('./config/genieacs-commands');

// Import MikroTik commands module
const mikrotikCommands = require('./config/mikrotik-commands');

// Import RX Power Monitor module
const rxPowerMonitor = require('./config/rxPowerMonitor');

// Tambahkan view engine dan static
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
// Mount customer portal
const customerPortal = require('./routes/customerPortal');
app.use('/customer', customerPortal);

// Inisialisasi WhatsApp dan PPPoE monitoring
try {
    whatsapp.connectToWhatsApp().then(sock => {
        if (sock) {
            // Set sock instance untuk whatsapp
            whatsapp.setSock(sock);

            // Set sock instance untuk PPPoE monitoring
            pppoeMonitor.setSock(sock);
            pppoeCommands.setSock(sock);

            // Set sock instance untuk GenieACS commands
            genieacsCommands.setSock(sock);

            // Set sock instance untuk MikroTik commands
            mikrotikCommands.setSock(sock);

            // Set sock instance untuk RX Power Monitor
            rxPowerMonitor.setSock(sock);

            // Set sock instance untuk trouble report
            const troubleReport = require('./config/troubleReport');
            troubleReport.setSockInstance(sock);

            logger.info('WhatsApp connected successfully');

            // Initialize PPPoE monitoring jika MikroTik dikonfigurasi
            if (global.appSettings.mikrotikHost && global.appSettings.mikrotikUser && global.appSettings.mikrotikPassword) {
                pppoeMonitor.initializePPPoEMonitoring().then(() => {
                    logger.info('PPPoE monitoring initialized');
                }).catch(err => {
                    logger.error('Error initializing PPPoE monitoring:', err);
                });
            }

            // Initialize RX Power monitoring
            try {
                rxPowerMonitor.startRXPowerMonitoring();
                logger.info('RX Power monitoring initialized');
            } catch (err) {
                logger.error('Error initializing RX Power monitoring:', err);
            }
        }
    }).catch(err => {
        logger.error('Error connecting to WhatsApp:', err);
    });

    // Mulai monitoring PPPoE lama jika dikonfigurasi (fallback)
    if (global.appSettings.mikrotikHost && global.appSettings.mikrotikUser && global.appSettings.mikrotikPassword) {
        monitorPPPoEConnections().catch(err => {
            logger.error('Error starting legacy PPPoE monitoring:', err);
        });
    }
} catch (error) {
    logger.error('Error initializing services:', error);
}

// Tambahkan delay yang lebih lama untuk reconnect WhatsApp
const RECONNECT_DELAY = 30000; // 30 detik

// Fungsi untuk memulai server hanya pada port yang dikonfigurasi di settings.json
function startServer(portToUse) {
    // Pastikan port adalah number
    const port = parseInt(portToUse);
    if (isNaN(port) || port < 1 || port > 65535) {
        logger.error(`Port tidak valid: ${portToUse}`);
        process.exit(1);
    }
    
    logger.info(`Memulai server pada port yang dikonfigurasi: ${port}`);
    logger.info(`Port diambil dari settings.json - tidak ada fallback ke port alternatif`);
    
    // Hanya gunakan port dari settings.json, tidak ada fallback
    try {
        const server = app.listen(port, () => {
            logger.info(`✅ Server berhasil berjalan pada port ${port}`);
            logger.info(`🌐 Web Portal tersedia di: http://localhost:${port}`);
            logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
            // Update global.appSettings.port dengan port yang berhasil digunakan
            global.appSettings.port = port.toString();
        }).on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                logger.error(`❌ ERROR: Port ${port} sudah digunakan oleh aplikasi lain!`);
                logger.error(`💡 Solusi: Hentikan aplikasi yang menggunakan port ${port} atau ubah port di settings.json`);
                logger.error(`🔍 Cek aplikasi yang menggunakan port: netstat -ano | findstr :${port}`);
            } else {
                logger.error('❌ Error starting server:', err.message);
            }
            process.exit(1);
        });
    } catch (error) {
        logger.error(`❌ Terjadi kesalahan saat memulai server:`, error.message);
        process.exit(1);
    }
}

// Mulai server dengan port dari settings.json
const port = global.appSettings.port;
logger.info(`Attempting to start server on configured port: ${port}`);

// Mulai server dengan port dari konfigurasi
startServer(port);

// Tambahkan perintah untuk menambahkan nomor pelanggan ke tag GenieACS
const { addCustomerTag } = require('./config/customerTag');

// Export app untuk testing
module.exports = app;
