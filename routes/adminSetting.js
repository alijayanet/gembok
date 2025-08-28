const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const multer = require('multer');

// Konfigurasi penyimpanan file
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, '../public/img'));
    },
    filename: function (req, file, cb) {
        // Selalu gunakan nama 'logo' dengan ekstensi file asli
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, 'logo' + ext);
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 2 * 1024 * 1024 // 2MB
    },
    fileFilter: function (req, file, cb) {
        // Hanya izinkan file gambar dan SVG
        if (file.mimetype.startsWith('image/') || file.originalname.toLowerCase().endsWith('.svg')) {
            cb(null, true);
        } else {
            cb(new Error('Hanya file gambar yang diizinkan'), false);
        }
    }
});

const settingsPath = path.join(__dirname, '../settings.json');

// Cache untuk settings data (untuk mempercepat loading)
let cachedSettings = null;
let cacheTime = null;
const CACHE_DURATION = 30000; // 30 detik

// Dummy data untuk first time loading
const dummySettings = {
    admin_username: 'admin',
    admin_password: 'admin', 
    genieacs_url: 'http://localhost:7557',
    genieacs_username: 'admin',
    genieacs_password: 'password',
    mikrotik_host: '192.168.1.1',
    mikrotik_port: '8728',
    mikrotik_user: 'admin',
    mikrotik_password: 'password',
    main_interface: 'ether1',
    company_header: 'ISP Monitor',
    footer_info: 'Powered by Gembok',
    server_port: '3001',
    server_host: 'localhost',
    customerPortalOtp: 'false',
    otp_length: '6',
    pppoe_monitor_enable: 'true',
    rx_power_warning: '-27',
    rx_power_critical: '-30',
    whatsapp_keep_alive: 'true'
};

// GET: Render halaman Setting - Ultra-optimized with pre-loaded cache
router.get('/', (req, res) => {
    const startTime = Date.now();
    
    try {
        let settings;
        
        // Prioritas 1: Gunakan cache dari middleware jika tersedia
        if (req.cachedSettings) {
            settings = req.cachedSettings;
            console.log('⚡ Using pre-loaded settings from global cache');
        }
        // Prioritas 2: Gunakan cache lokal jika masih valid
        else if (cachedSettings && cacheTime && (Date.now() - cacheTime) < CACHE_DURATION) {
            settings = cachedSettings;
            console.log('⚡ Using local cached settings');
        }
        // Prioritas 3: Baca dari file
        else {
            const settingsFile = path.join(__dirname, '../settings.json');
            
            if (fs.existsSync(settingsFile)) {
                try {
                    const data = fs.readFileSync(settingsFile, 'utf8');
                    settings = JSON.parse(data);
                    console.log('📜 Loaded fresh settings from file');
                } catch (parseError) {
                    console.warn('⚠️ Parse error, using dummy data:', parseError.message);
                    settings = { ...dummySettings };
                }
            } else {
                console.log('📝 No settings file, using dummy data');
                settings = { ...dummySettings };
                
                // Buat file settings.json secara async untuk tidak memblokir response
                setImmediate(() => {
                    try {
                        fs.writeFileSync(settingsFile, JSON.stringify(dummySettings, null, 2), 'utf8');
                        console.log('✅ Created settings.json in background');
                    } catch (writeError) {
                        console.warn('⚠️ Background file creation failed:', writeError.message);
                    }
                });
            }
        }
        
        // Pastikan settings lengkap dengan merge dummy data
        settings = { ...dummySettings, ...settings };
        
        // Update cache untuk request berikutnya
        cachedSettings = settings;
        cacheTime = Date.now();
        
        const loadTime = Date.now() - startTime;
        console.log(`🏁 Admin settings rendered in ${loadTime}ms`);
        
        res.render('adminSetting', { 
            settings,
            fastLoad: loadTime < 50, // Tandai sebagai fast load jika < 50ms
            loadTime: loadTime
        });
        
    } catch (error) {
        console.error('❌ Error in admin settings route:', error);
        
        // Emergency fallback - selalu return response
        const loadTime = Date.now() - startTime;
        res.render('adminSetting', { 
            settings: dummySettings,
            fastLoad: false,
            loadTime: loadTime,
            error: 'Menggunakan data dummy karena terjadi kesalahan: ' + error.message
        });
    }
});

// GET: Ambil semua setting - Optimized with caching
router.get('/data', (req, res) => {
    try {
        // Gunakan cache jika tersedia dan masih valid
        const now = Date.now();
        if (cachedSettings && cacheTime && (now - cacheTime) < CACHE_DURATION) {
            console.log('🚀 Returning cached settings data');
            return res.json({
                ...cachedSettings,
                _cached: true,
                _loadTime: now - cacheTime
            });
        }
        
        // Async file reading untuk performa yang lebih baik
        fs.readFile(settingsPath, 'utf8', (err, data) => {
            if (err) {
                console.warn('⚠️ Failed to read settings.json, returning dummy data:', err.message);
                // Return dummy data jika file tidak bisa dibaca
                cachedSettings = { ...dummySettings };
                cacheTime = now;
                return res.json({
                    ...dummySettings,
                    _dummy: true,
                    _error: 'Settings file not accessible'
                });
            }
            
            try {
                const settings = JSON.parse(data);
                // Merge dengan dummy data untuk field yang mungkin hilang
                const completeSettings = { ...dummySettings, ...settings };
                
                // Update cache
                cachedSettings = completeSettings;
                cacheTime = now;
                
                res.json({
                    ...completeSettings,
                    _cached: false,
                    _loadTime: 0
                });
            } catch (parseError) {
                console.warn('⚠️ Invalid settings.json format, returning dummy data:', parseError.message);
                cachedSettings = { ...dummySettings };
                cacheTime = now;
                res.json({
                    ...dummySettings,
                    _dummy: true,
                    _error: 'Invalid JSON format'
                });
            }
        });
        
    } catch (error) {
        console.error('❌ Error in /data endpoint:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            message: error.message,
            ...dummySettings,
            _dummy: true
        });
    }
});

// POST: Simpan perubahan setting - Optimized with cache invalidation
router.post('/save', (req, res) => {
    const newSettings = req.body;
    const startTime = Date.now();
    
    try {
        // Baca settings lama dengan fallback ke dummy data
        let oldSettings = {};
        try {
            if (fs.existsSync(settingsPath)) {
                oldSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            } else {
                console.log('📄 Settings file not found, starting with dummy data');
                oldSettings = { ...dummySettings };
            }
        } catch (readError) {
            console.warn('⚠️ Error reading old settings, using dummy data:', readError.message);
            oldSettings = { ...dummySettings };
        }
        
        // Merge: field baru overwrite field lama, field lama yang tidak ada di form tetap dipertahankan
        const mergedSettings = { ...dummySettings, ...oldSettings, ...newSettings };
        
        // Pastikan field critical selalu ada
        if (!mergedSettings.user_auth_mode) {
            mergedSettings.user_auth_mode = 'mikrotik';
        }
        if (!mergedSettings.server_port) {
            mergedSettings.server_port = '3001';
        }
        if (!mergedSettings.admin_username) {
            mergedSettings.admin_username = 'admin';
        }
        
        // Atomic write - tulis ke file temporary dulu
        const tempPath = settingsPath + '.tmp';
        const jsonData = JSON.stringify(mergedSettings, null, 2);
        
        try {
            // Tulis ke file temporary
            fs.writeFileSync(tempPath, jsonData, 'utf8');
            
            // Jika berhasil, rename ke file asli (atomic operation)
            fs.renameSync(tempPath, settingsPath);
            
            // Invalidate cache setelah save berhasil
            cachedSettings = mergedSettings;
            cacheTime = Date.now();
            
            // 🔄 BROADCAST SETTINGS UPDATE KE SELURUH SISTEM
            // Update global preloaded cache
            if (global.preloadedSettings) {
                global.preloadedSettings = mergedSettings;
                console.log('🌐 Global cache updated with new settings');
            }
            
            // Notify settingsManager untuk clear cache internal
            try {
                const { clearCache } = require('../config/settingsManager');
                if (typeof clearCache === 'function') {
                    clearCache();
                    console.log('🧹 SettingsManager cache cleared');
                }
            } catch (clearError) {
                console.warn('⚠️ Could not clear settingsManager cache:', clearError.message);
            }
            
            // Emit settings update event jika ada event system
            try {
                const EventEmitter = require('events');
                if (global.appEvents && global.appEvents instanceof EventEmitter) {
                    global.appEvents.emit('settings:updated', mergedSettings);
                    console.log('📡 Settings update event broadcasted');
                }
            } catch (eventError) {
                // Silent fail - event system optional
            }
            
            const saveTime = Date.now() - startTime;
            
            // 🚀 BROADCAST SETTINGS UPDATE KE SELURUH SISTEM TANPA RESTART
            const broadcastSuccess = broadcastSettingsUpdate(mergedSettings);
            
            console.log(`✅ Settings saved and broadcasted in ${saveTime}ms`);
            
            // Cek field yang hilang (ada di oldSettings tapi tidak di mergedSettings)
            const oldKeys = Object.keys(oldSettings);
            const newKeys = Object.keys(mergedSettings);
            const missing = oldKeys.filter(k => !newKeys.includes(k));
            
            if (missing.length > 0) {
                console.warn('📄 Fields removed from settings:', missing);
            }
            
            // Response dengan info broadcast
            const responseData = { 
                success: true, 
                missingFields: missing,
                saveTime: saveTime,
                fieldsCount: Object.keys(mergedSettings).length,
                broadcasted: broadcastSuccess,
                message: broadcastSuccess ? 
                    'Settings berhasil disimpan dan diterapkan ke seluruh sistem tanpa restart' :
                    'Settings berhasil disimpan tapi broadcast gagal (mungkin perlu restart untuk beberapa komponen)',
                hotReload: true // Tandai bahwa ini adalah hot reload tanpa restart
            };
            
            res.json(responseData);
            
        } catch (writeError) {
            // Hapus file temporary jika ada error
            if (fs.existsSync(tempPath)) {
                try {
                    fs.unlinkSync(tempPath);
                } catch (e) {}
            }
            throw writeError;
        }
        
    } catch (error) {
        console.error('❌ Error saving settings:', error);
        res.status(500).json({ 
            success: false,
            error: 'Gagal menyimpan settings: ' + error.message,
            saveTime: Date.now() - startTime
        });
    }
});

// POST: Upload Logo
router.post('/upload-logo', upload.single('logo'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ 
                success: false, 
                error: 'Tidak ada file yang diupload' 
            });
        }

        // Dapatkan nama file yang sudah disimpan (akan selalu 'logo' + ekstensi)
        const filename = req.file.filename;
        const filePath = req.file.path;

        // Verifikasi file berhasil disimpan
        if (!fs.existsSync(filePath)) {
            return res.status(500).json({ 
                success: false, 
                error: 'File gagal disimpan' 
            });
        }

        // Baca settings.json
        let settings = {};
        
        try {
            settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        } catch (err) {
            console.error('Gagal membaca settings.json:', err);
            return res.status(500).json({ 
                success: false, 
                error: 'Gagal membaca pengaturan' 
            });
        }

        // Hapus file logo lama jika ada
        if (settings.logo_filename && settings.logo_filename !== filename) {
            const oldLogoPath = path.join(__dirname, '../public/img', settings.logo_filename);
            if (fs.existsSync(oldLogoPath)) {
                try {
                    fs.unlinkSync(oldLogoPath);
                    console.log('Logo lama dihapus:', oldLogoPath);
                } catch (err) {
                    console.error('Gagal menghapus logo lama:', err);
                    // Lanjutkan meskipun gagal hapus file lama
                }
            }
        }

        // Update settings.json
        settings.logo_filename = filename;
        
        try {
            fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
            console.log('Settings.json berhasil diupdate dengan logo baru:', filename);
            
            // Update cache setelah logo berhasil diupload
            cachedSettings = settings;
            cacheTime = Date.now();
            
            // Broadcast settings update ke seluruh sistem
            const broadcastSuccess = broadcastSettingsUpdate(settings);
            console.log(`📸 Logo update broadcasted: ${broadcastSuccess ? 'success' : 'failed'}`);
            
        } catch (err) {
            console.error('Gagal menyimpan settings.json:', err);
            return res.status(500).json({ 
                success: false, 
                error: 'Gagal menyimpan pengaturan' 
            });
        }

        res.json({ 
            success: true, 
            filename: filename,
            message: 'Logo berhasil diupload dan disimpan'
        });

    } catch (error) {
        console.error('Error saat upload logo:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Terjadi kesalahan saat mengupload logo: ' + error.message 
        });
    }
});

// Error handler untuk multer
router.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ 
                success: false, 
                error: 'Ukuran file terlalu besar. Maksimal 2MB.' 
            });
        }
        return res.status(400).json({ 
            success: false, 
            error: 'Error upload file: ' + error.message 
        });
    }
    
    if (error) {
        return res.status(400).json({ 
            success: false, 
            error: error.message 
        });
    }
    
    next();
});

// GET: Status WhatsApp
router.get('/wa-status', async (req, res) => {
    try {
        const { getWhatsAppStatus } = require('../config/whatsapp');
        const status = getWhatsAppStatus();
        
        // Pastikan QR code dalam format yang benar
        let qrCode = null;
        if (status.qrCode) {
            qrCode = status.qrCode;
        } else if (status.qr) {
            qrCode = status.qr;
        }
        
        res.json({
            connected: status.connected || false,
            qr: qrCode,
            phoneNumber: status.phoneNumber || null,
            status: status.status || 'disconnected',
            connectedSince: status.connectedSince || null
        });
    } catch (e) {
        console.error('Error getting WhatsApp status:', e);
        res.status(500).json({ 
            connected: false, 
            qr: null, 
            error: e.message 
        });
    }
});

// POST: Refresh QR WhatsApp
router.post('/wa-refresh', async (req, res) => {
    try {
        const { deleteWhatsAppSession } = require('../config/whatsapp');
        await deleteWhatsAppSession();
        
        // Tunggu sebentar sebelum memeriksa status baru
        setTimeout(() => {
            res.json({ success: true, message: 'Sesi WhatsApp telah direset. Silakan pindai QR code baru.' });
        }, 1000);
    } catch (e) {
        console.error('Error refreshing WhatsApp session:', e);
        res.status(500).json({ 
            success: false, 
            error: e.message 
        });
    }
});

// POST: Hapus sesi WhatsApp
router.post('/wa-delete', async (req, res) => {
    try {
        const { deleteWhatsAppSession } = require('../config/whatsapp');
        await deleteWhatsAppSession();
        res.json({ 
            success: true, 
            message: 'Sesi WhatsApp telah dihapus. Silakan pindai QR code baru untuk terhubung kembali.' 
        });
    } catch (e) {
        console.error('Error deleting WhatsApp session:', e);
        res.status(500).json({ 
            success: false, 
            error: e.message 
        });
    }
});

// GET: Test endpoint untuk upload logo (tanpa auth)
router.get('/test-upload', (req, res) => {
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
                    <input type="file" name="logo" accept="image/*,.svg" required>
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

// GET: Test endpoint untuk upload SVG (tanpa auth)
router.get('/test-svg', (req, res) => {
    const fs = require('fs');
    const path = require('path');
    const testHtmlPath = path.join(__dirname, '../test-svg-upload.html');
    
    if (fs.existsSync(testHtmlPath)) {
        res.sendFile(testHtmlPath);
    } else {
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Test SVG Upload</title>
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
                <h2>Test SVG Upload</h2>
                <form id="uploadForm" enctype="multipart/form-data">
                    <div class="form-group">
                        <label>Pilih file SVG:</label><br>
                        <input type="file" name="logo" accept=".svg" required>
                    </div>
                    <button type="submit">Upload SVG Logo</button>
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
    }
});

// GET: Load WhatsApp Groups
router.get('/whatsapp-groups', async (req, res) => {
    try {
        const whatsapp = require('../config/whatsapp');

        // Cek apakah WhatsApp sudah terhubung
        if (!global.whatsappStatus || !global.whatsappStatus.connected) {
            return res.status(400).json({
                success: false,
                message: 'WhatsApp belum terhubung. Silakan scan QR code terlebih dahulu.'
            });
        }

        // Load chats untuk mendapatkan group
        const sock = whatsapp.getSock();
        if (!sock) {
            return res.status(500).json({
                success: false,
                message: 'WhatsApp socket tidak tersedia'
            });
        }

        // Get chats dari beberapa sumber yang berbeda
        let chats = [];

        // Coba beberapa metode untuk mendapatkan chats
        try {
            // Metode 1: Dari store
            if (sock.store?.chats) {
                chats = sock.store.chats;
                console.log('📱 Menggunakan chats dari store:', chats.length);
            }
            // Metode 2: Dari cache jika ada
            else if (sock.chats) {
                chats = Object.values(sock.chats);
                console.log('📱 Menggunakan chats dari sock.chats:', chats.length);
            }
            // Metode 3: Fetch langsung dari WhatsApp
            else {
                console.log('📱 Fetching chats langsung dari WhatsApp...');
                const fetchedChats = await sock.groupFetchAllParticipating();
                chats = Object.values(fetchedChats);
                console.log('📱 Menggunakan chats yang di-fetch:', chats.length);
            }
        } catch (fetchError) {
            console.error('❌ Error fetching chats:', fetchError);
            // Jika semua gagal, coba metode alternatif
            try {
                const fetchedChats = await sock.groupFetchAllParticipating();
                chats = Object.values(fetchedChats);
                console.log('📱 Menggunakan fallback method:', chats.length);
            } catch (fallbackError) {
                console.error('❌ Fallback method juga gagal:', fallbackError);
            }
        }

        console.log('📊 Total chats found:', chats.length);
        console.log('📋 Sample chat IDs:', chats.slice(0, 5).map(c => c.id));

        // Filter hanya groups dan format data
        const groups = chats
            .filter(chat => {
                const isGroup = chat.id?.endsWith('@g.us');
                console.log(`🔍 Chat ${chat.id}: ${chat.name || chat.notify} - Is Group: ${isGroup}`);
                return isGroup;
            })
            .map(chat => ({
                id: chat.id,
                name: chat.name || chat.notify || chat.subject || 'Group Tanpa Nama',
                participants: chat.participants?.length || chat.participantIds?.length || 0,
                created: chat.created ? new Date(chat.created * 1000).toLocaleDateString('id-ID') : 'Tidak diketahui',
                isAdmin: false, // Default false, akan dicek nanti jika diperlukan
                description: chat.desc || chat.description || '',
                owner: chat.owner ? chat.owner.split('@')[0] : 'Tidak diketahui'
            }));

        console.log('🎯 Groups found:', groups.length);
        console.log('📝 Groups:', groups.map(g => `${g.name} (${g.id})`));

        res.json({
            success: true,
            groups: groups,
            total: groups.length,
            totalChats: chats.length,
            debug: {
                chatsFound: chats.length,
                groupsFiltered: groups.length,
                sampleChatIds: chats.slice(0, 3).map(c => ({ id: c.id, name: c.name || c.notify, isGroup: c.id?.endsWith('@g.us') }))
            },
            message: `Berhasil memuat ${groups.length} grup WhatsApp dari ${chats.length} total chats`
        });

    } catch (error) {
        console.error('Error loading WhatsApp groups:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal memuat grup WhatsApp: ' + error.message
        });
    }
});

// GET: Get WhatsApp Group Detail
router.get('/whatsapp-groups/:groupId', async (req, res) => {
    try {
        const { groupId } = req.params;
        const whatsapp = require('../config/whatsapp');

        // Cek apakah WhatsApp sudah terhubung
        if (!global.whatsappStatus || !global.whatsappStatus.connected) {
            return res.status(400).json({
                success: false,
                message: 'WhatsApp belum terhubung. Silakan scan QR code terlebih dahulu.'
            });
        }

        // Load chats untuk mendapatkan group
        const sock = whatsapp.getSock();
        if (!sock) {
            return res.status(500).json({
                success: false,
                message: 'WhatsApp socket tidak tersedia'
            });
        }

        // Get group metadata
        const groupMetadata = await sock.groupMetadata(groupId);

        if (!groupMetadata) {
            return res.status(404).json({
                success: false,
                message: 'Grup tidak ditemukan'
            });
        }

        // Format participants
        const participants = groupMetadata.participants.map(p => ({
            id: p.id,
            isAdmin: p.admin === 'admin',
            isSuperAdmin: p.admin === 'superadmin'
        }));

        // Check if bot is admin
        const botId = sock.user.id;
        const botParticipant = participants.find(p => p.id === botId);
        const isAdmin = botParticipant ? botParticipant.isAdmin || botParticipant.isSuperAdmin : false;

        const groupDetail = {
            id: groupMetadata.id,
            name: groupMetadata.subject || 'Group Tanpa Nama',
            owner: groupMetadata.owner ? groupMetadata.owner.split('@')[0] : 'Tidak diketahui',
            totalParticipants: groupMetadata.participants.length,
            created: groupMetadata.creation ? new Date(groupMetadata.creation * 1000).toLocaleDateString('id-ID') : 'Tidak diketahui',
            isAdmin: isAdmin,
            description: groupMetadata.desc || '',
            participants: participants
        };

        res.json({
            success: true,
            group: groupDetail
        });

    } catch (error) {
        console.error('Error loading WhatsApp group detail:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal memuat detail grup WhatsApp: ' + error.message
        });
    }
});

// GET: Test WhatsApp Connection
router.get('/whatsapp-test', async (req, res) => {
    try {
        const whatsapp = require('../config/whatsapp');

        // Cek status koneksi WhatsApp
        const connectionStatus = global.whatsappStatus || {
            connected: false,
            status: 'disconnected'
        };

        let testResult = {
            success: connectionStatus.connected,
            connection: connectionStatus,
            message: connectionStatus.connected ? 'WhatsApp terhubung dengan baik' : 'WhatsApp belum terhubung'
        };

        if (connectionStatus.connected) {
            // Coba dapatkan informasi tambahan
            const sock = whatsapp.getSock();
            if (sock) {
                try {
                    // Coba fetch groups untuk test
                    const fetchedChats = await sock.groupFetchAllParticipating();
                    const groups = Object.values(fetchedChats).filter(chat => chat.id?.endsWith('@g.us'));

                    testResult.groups = {
                        total: groups.length,
                        sample: groups.slice(0, 3).map(g => ({
                            id: g.id,
                            name: g.subject || g.name || 'Unknown'
                        }))
                    };

                    testResult.message += `. ${groups.length} grup ditemukan.`;

                } catch (groupError) {
                    console.error('Error fetching groups in test:', groupError);
                    testResult.groups = {
                        total: 0,
                        error: 'Gagal mengambil data grup: ' + groupError.message
                    };
                }
            } else {
                testResult.message = 'WhatsApp socket tidak tersedia';
                testResult.success = false;
            }
        } else {
            testResult.message = 'WhatsApp belum terhubung. Silakan scan QR code terlebih dahulu.';
        }

        res.json(testResult);

    } catch (error) {
        console.error('Error testing WhatsApp connection:', error);
        res.status(500).json({
            success: false,
            message: 'Error testing connection: ' + error.message
        });
    }
});

// Helper function untuk clear cache (bisa dipanggil dari luar jika diperlukan)
function clearSettingsCache() {
    cachedSettings = null;
    cacheTime = null;
    console.log('🧹 Settings cache cleared');
}

// Helper function untuk broadcast settings update ke seluruh sistem  
function broadcastSettingsUpdate(newSettings) {
    try {
        // Update global cache
        if (global.preloadedSettings) {
            global.preloadedSettings = newSettings;
            console.log('🌐 Global preloaded cache updated');
        }
        
        // Update local cache
        cachedSettings = newSettings;
        cacheTime = Date.now();
        
        // Clear settingsManager internal cache
        try {
            const settingsManager = require('../config/settingsManager');
            if (settingsManager && typeof settingsManager.clearCache === 'function') {
                settingsManager.clearCache();
                console.log('🧹 SettingsManager cache cleared');
            }
        } catch (e) {
            console.warn('⚠️ SettingsManager cache clear failed:', e.message);
        }
        
        // Emit ke event system jika tersedia (untuk future use)
        if (global.appEvents) {
            global.appEvents.emit('settings:updated', newSettings);
            console.log('📡 Settings update event emitted');
        }
        
        console.log(`✅ Settings broadcasted to all systems (${Object.keys(newSettings).length} fields)`);
        return true;
        
    } catch (error) {
        console.error('❌ Error broadcasting settings update:', error.message);
        return false;
    }
}

// Helper function untuk memastikan settings.json ada dengan data dummy
function ensureSettingsFileExists() {
    const fs = require('fs');
    const path = require('path');
    
    if (!fs.existsSync(settingsPath)) {
        console.log('📝 Creating settings.json with dummy data for first time setup');
        try {
            fs.writeFileSync(settingsPath, JSON.stringify(dummySettings, null, 2), 'utf8');
            console.log('✅ settings.json created successfully');
            
            // Broadcast initial settings
            broadcastSettingsUpdate(dummySettings);
            
            return true;
        } catch (error) {
            console.error('❌ Failed to create settings.json:', error.message);
            return false;
        }
    }
    return true;
}

// Export functions untuk digunakan dari modul lain jika diperlukan
module.exports = router;
module.exports.clearSettingsCache = clearSettingsCache;
module.exports.broadcastSettingsUpdate = broadcastSettingsUpdate;
module.exports.ensureSettingsFileExists = ensureSettingsFileExists;
