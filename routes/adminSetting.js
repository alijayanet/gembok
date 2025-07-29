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

// GET: Render halaman Setting
router.get('/', (req, res) => {
    const fs = require('fs');
    const path = require('path');
    const settings = JSON.parse(fs.readFileSync(path.join(__dirname, '../settings.json'), 'utf8'));
    res.render('adminSetting', { settings });
});

// GET: Ambil semua setting
router.get('/data', (req, res) => {
    fs.readFile(settingsPath, 'utf8', (err, data) => {
        if (err) return res.status(500).json({ error: 'Gagal membaca settings.json' });
        try {
            res.json(JSON.parse(data));
        } catch (e) {
            res.status(500).json({ error: 'Format settings.json tidak valid' });
        }
    });
});

// POST: Simpan perubahan setting
router.post('/save', (req, res) => {
    const newSettings = req.body;
    // Baca settings lama
    let oldSettings = {};
    try {
        oldSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch (e) {}
    // Merge: field baru overwrite field lama, field lama yang tidak ada di form tetap dipertahankan
    const mergedSettings = { ...oldSettings, ...newSettings };
    // Pastikan user_auth_mode selalu ada
    if (!('user_auth_mode' in mergedSettings)) {
        mergedSettings.user_auth_mode = 'mikrotik';
    }
    fs.writeFile(settingsPath, JSON.stringify(mergedSettings, null, 2), 'utf8', err => {
        if (err) return res.status(500).json({ error: 'Gagal menyimpan settings.json' });
        // Cek field yang hilang (ada di oldSettings tapi tidak di mergedSettings)
        const oldKeys = Object.keys(oldSettings);
        const newKeys = Object.keys(mergedSettings);
        const missing = oldKeys.filter(k => !newKeys.includes(k));
        if (missing.length > 0) {
            console.warn('Field yang hilang dari settings.json setelah simpan:', missing);
        }
        res.json({ success: true, missingFields: missing });
    });
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

module.exports = router;
