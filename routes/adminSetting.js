const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const multer = require('multer');

// Konfigurasi multer yang lebih aman
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '../public/img/');
        // Pastikan direktori upload ada
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        // Debug: log file info
        console.log('Filename function called:', {
            originalname: file.originalname,
            mimetype: file.mimetype
        });
        
        // Validasi ekstensi file
        const allowedExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg'];
        const ext = path.extname(file.originalname).toLowerCase();
        
        console.log('File extension:', ext);
        
        if (!allowedExtensions.includes(ext)) {
            console.log('Invalid extension:', ext);
            return cb(new Error(`Ekstensi file tidak didukung: ${ext}. Gunakan PNG, JPG, JPEG, GIF, BMP, WEBP, atau SVG.`));
        }
        
        // Gunakan nama file yang konsisten
        const filename = 'logo' + ext;
        console.log('Generated filename:', filename);
        cb(null, filename);
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: function (req, file, cb) {
        // Debug: log file info
        console.log('File upload attempt:', {
            originalname: file.originalname,
            mimetype: file.mimetype,
            size: file.size
        });
        
        // Cek apakah file SVG berdasarkan ekstensi atau MIME type
        const isSvgByExtension = file.originalname.toLowerCase().endsWith('.svg');
        const isSvgByMime = file.mimetype === 'image/svg+xml';
        
        if (isSvgByExtension || isSvgByMime) {
            console.log('SVG file detected, accepting...');
            cb(null, true);
            return;
        }
        
        // Validasi tipe MIME untuk file non-SVG
        const allowedMimes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/bmp', 'image/webp'];
        if (allowedMimes.includes(file.mimetype)) {
            console.log('Valid image file accepted:', file.mimetype);
            cb(null, true);
        } else {
            console.log('Rejected file:', {
                mimetype: file.mimetype,
                originalname: file.originalname,
                allowedMimes: allowedMimes
            });
            cb(new Error('Tipe file tidak didukung. Gunakan PNG, JPG, JPEG, GIF, BMP, WEBP, atau SVG.'), false);
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
    fs.writeFile(settingsPath, JSON.stringify(newSettings, null, 2), 'utf8', err => {
        if (err) return res.status(500).json({ error: 'Gagal menyimpan settings.json' });
        res.json({ success: true });
    });
});

// POST: Upload Logo dengan error handling yang lebih baik
router.post('/upload-logo', upload.single('logo'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ 
                success: false, 
                error: 'Tidak ada file yang diupload' 
            });
        }

        // File sudah disimpan dengan nama yang benar oleh multer
        const filename = req.file.filename;
        const filePath = req.file.path;

        // Verifikasi file berhasil disimpan
        if (!fs.existsSync(filePath)) {
            return res.status(500).json({ 
                success: false, 
                error: 'File gagal disimpan' 
            });
        }

        // Update settings.json
        let settings;
        try {
            settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        } catch (err) {
            return res.status(500).json({ 
                success: false, 
                error: 'Gagal membaca settings.json' 
            });
        }

        settings.logo_filename = filename;
        
        try {
            fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
        } catch (err) {
            return res.status(500).json({ 
                success: false, 
                error: 'Gagal menyimpan settings.json' 
            });
        }

        res.json({ 
            success: true, 
            filename: filename,
            message: 'Logo berhasil diupload dan disimpan'
        });

    } catch (error) {
        console.error('Error uploading logo:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message || 'Terjadi kesalahan saat upload logo' 
        });
    }
});

// Error handler untuk multer
router.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ 
                success: false, 
                error: 'Ukuran file terlalu besar. Maksimal 5MB.' 
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
