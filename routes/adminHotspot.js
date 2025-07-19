const express = require('express');
const router = express.Router();
const { addHotspotUser, getActiveHotspotUsers, getHotspotProfiles, deleteHotspotUser, generateHotspotVouchers, getHotspotServers, disconnectHotspotUser } = require('../config/mikrotik');
const { getMikrotikConnection } = require('../config/mikrotik');
const fs = require('fs');
const path = require('path');

// GET: Tampilkan form tambah user hotspot dan daftar user hotspot
router.get('/', async (req, res) => {
    try {
        const activeUsersResult = await getActiveHotspotUsers();
        let users = [];
        if (activeUsersResult.success && Array.isArray(activeUsersResult.data)) {
            users = activeUsersResult.data;
        }
        
        let profiles = [];
        let allUsers = [];
        try {
            const profilesResult = await getHotspotProfiles();
            if (profilesResult.success && Array.isArray(profilesResult.data)) {
                profiles = profilesResult.data;
            } else {
                profiles = [];
            }
            console.log('Hotspot profiles dari Mikrotik:', profiles);
        } catch (e) {
            console.error('Gagal ambil profile hotspot:', e.message);
            profiles = [];
        }
        try {
            // Ambil semua user hotspot (bukan hanya yang aktif)
            const conn = await getMikrotikConnection();
            allUsers = await conn.write('/ip/hotspot/user/print');
            // Mapping agar property selalu ada
            allUsers = allUsers.map(u => ({
                name: u.name || '',
                password: u.password || '',
                profile: u.profile || '',
            }));
        } catch (e) {
            console.error('Gagal ambil semua user hotspot:', e.message);
            allUsers = [];
        }
        const fs = require('fs');
        const path = require('path');
        const settings = JSON.parse(fs.readFileSync(path.join(__dirname, '../settings.json'), 'utf8'));
        const company_header = settings.company_header || 'Voucher Hotspot';
        const adminKontak = settings['admins.0'] || '-';

        res.render('adminHotspot', { 
            users, 
            profiles, 
            allUsers, 
            success: req.query.success, 
            error: req.query.error, 
            company_header, 
            adminKontak,
            settings
        });
    } catch (error) {
        res.render('adminHotspot', { users: [], profiles: [], allUsers: [], success: null, error: 'Gagal mengambil data user hotspot: ' + error.message });
    }
});

// POST: Hapus user hotspot
router.post('/delete', async (req, res) => {
    const { username } = req.body;
    try {
        await deleteHotspotUser(username);
        res.redirect('/admin/hotspot?success=User+Hotspot+berhasil+dihapus');
    } catch (error) {
        res.redirect('/admin/hotspot?error=Gagal+hapus+user:+' + encodeURIComponent(error.message));
    }
});

// POST: Proses penambahan user hotspot
router.post('/', async (req, res) => {
    const { username, password, profile } = req.body;
    try {
        await addHotspotUser(username, password, profile);
        // Redirect agar tidak double submit, tampilkan pesan sukses
        res.redirect('/admin/hotspot?success=User+Hotspot+berhasil+ditambahkan');
    } catch (error) {
        res.redirect('/admin/hotspot?error=Gagal+menambah+user:+"'+encodeURIComponent(error.message)+'"');
    }
});

// POST: Edit user hotspot
router.post('/edit', async (req, res) => {
    const { username, password, profile } = req.body;
    try {
        await require('../config/mikrotik').updateHotspotUser(username, password, profile);
        res.redirect('/admin/hotspot?success=User+Hotspot+berhasil+diupdate');
    } catch (error) {
        res.redirect('/admin/hotspot?error=Gagal+update+user:+' + encodeURIComponent(error.message));
    }
});

// POST: Generate user hotspot voucher
router.post('/generate', async (req, res) => {
    const jumlah = parseInt(req.body.jumlah) || 10;
    const profile = req.body.profile || 'default';
    const panjangPassword = parseInt(req.body.panjangPassword) || 6;
    const generated = [];

    // Ambil nama hotspot dan nomor admin dari settings.json
    const fs = require('fs');
    const settings = JSON.parse(fs.readFileSync(require('path').join(__dirname, '../settings.json'), 'utf8'));
    const namaHotspot = settings.company_header || 'HOTSPOT VOUCHER';
    const adminKontak = settings['admins.0'] || '-';

    // Fungsi pembuat string random
    function randomString(length) {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let str = '';
        for (let i = 0; i < length; i++) {
            str += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return str;
    }

    // Generate user dan tambahkan ke Mikrotik
    const { addHotspotUser } = require('../config/mikrotik');
    for (let i = 0; i < jumlah; i++) {
        const username = randomString(6) + randomString(2); // 8 karakter unik
        const password = randomString(panjangPassword);
        try {
            await addHotspotUser(username, password, profile);
            generated.push({ username, password, profile });
        } catch (e) {
            // Lewati user gagal
        }
    }

    // Render voucher dalam grid 4 baris per A4
    res.render('voucherHotspot', {
        vouchers: generated,
        namaHotspot,
        adminKontak,
        profile,
    });
});

// POST: Generate user hotspot vouchers (JSON response)
router.post('/generate-vouchers', async (req, res) => {
    const { quantity, length, profile, type, charType } = req.body;

    try {
        // Gunakan fungsi generateHotspotVouchers dengan parameter yang benar
        const count = parseInt(quantity) || 5;
        const prefix = 'wifi-'; // Default prefix
        const server = 'all'; // Default server
        
        const result = await generateHotspotVouchers(count, prefix, profile, server, '', '');
        
        if (result.success) {
            res.json({ success: true, vouchers: result.vouchers });
        } else {
            res.status(500).json({ success: false, message: result.message });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET: Get active hotspot users count for statistics
router.get('/active-users', async (req, res) => {
    try {
        const result = await getActiveHotspotUsers();
        if (result.success) {
            // Hitung jumlah user yang aktif dari data array
            const activeCount = Array.isArray(result.data) ? result.data.length : 0;
            res.json({ success: true, activeUsers: activeCount, activeUsersList: result.data });
        } else {
            console.error('Failed to get active hotspot users:', result.message);
            res.status(500).json({ success: false, message: result.message });
        }
    } catch (error) {
        console.error('Error getting active hotspot users:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET: Get active hotspot users detail for table
router.get('/active-users-detail', async (req, res) => {
    try {
        const result = await getActiveHotspotUsers();
        if (result.success) {
            res.json({ success: true, activeUsers: result.data });
        } else {
            res.status(500).json({ success: false, message: result.message });
        }
    } catch (error) {
        console.error('Error getting active hotspot users detail:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST: Disconnect hotspot user
router.post('/disconnect-user', async (req, res) => {
    const { username } = req.body;
    if (!username) {
        return res.status(400).json({ success: false, message: 'Username diperlukan' });
    }
    
    try {
        const result = await disconnectHotspotUser(username);
        if (result.success) {
            res.json({ success: true, message: `User ${username} berhasil diputus` });
        } else {
            res.status(500).json({ success: false, message: result.message });
        }
    } catch (error) {
        console.error('Error disconnecting hotspot user:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET: Ambil data user hotspot aktif untuk AJAX
router.get('/active-users', async (req, res) => {
    try {
        const result = await getActiveHotspotUsers();
        if (result.success) {
            // Log data untuk debugging
            console.log('Active users data:', JSON.stringify(result.data).substring(0, 200) + '...');
            res.json({ success: true, activeUsersList: result.data });
        } else {
            console.error('Failed to get active users:', result.message);
            res.status(500).json({ success: false, message: result.message });
        }
    } catch (error) {
        console.error('Error getting active hotspot users:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET: Tampilkan halaman voucher hotspot
router.get('/voucher', async (req, res) => {
    try {
        // Ambil profile hotspot
        const profilesResult = await getHotspotProfiles();
        let profiles = [];
        if (profilesResult.success && Array.isArray(profilesResult.data)) {
            profiles = profilesResult.data;
        }
        
        // Ambil server hotspot
        const serversResult = await getHotspotServers();
        let servers = [];
        if (serversResult.success && Array.isArray(serversResult.data)) {
            servers = serversResult.data;
        }
        
        // Ambil history voucher (dari user hotspot)
        const conn = await getMikrotikConnection();
        const allUsers = await conn.write('/ip/hotspot/user/print');
        
        // Ambil active users untuk menentukan status aktif
        const activeUsersResult = await getActiveHotspotUsers();
        const activeUsernames = activeUsersResult.success && Array.isArray(activeUsersResult.data) 
            ? activeUsersResult.data.map(user => user.user) 
            : [];
        
        // Filter hanya voucher (berdasarkan prefix atau kriteria lain)
        const voucherHistory = allUsers.filter(user => 
            user.name && (user.name.startsWith('wifi-') || user.comment === 'voucher')
        ).map(user => ({
            username: user.name || '',
            password: user.password || '',
            profile: user.profile || 'default',
            server: user.server || 'all',
            createdAt: new Date(), // Ini seharusnya diambil dari data jika tersedia
            active: activeUsernames.includes(user.name), // Cek apakah user sedang aktif
            comment: user.comment || ''
        }));
        
        console.log(`Loaded ${voucherHistory.length} vouchers for history table`);
        
        // Ambil pengaturan dari settings.json
        const settings = JSON.parse(fs.readFileSync(path.join(__dirname, '../settings.json'), 'utf8'));
        const company_header = settings.company_header || 'Voucher Hotspot';
        const adminKontak = settings['footer_info'] || '-';
        
        res.render('adminVoucher', {
            profiles,
            servers,
            voucherHistory,
            success: req.query.success,
            error: req.query.error,
            company_header,
            adminKontak,
            settings
        });
    } catch (error) {
        console.error('Error rendering voucher page:', error);
        res.render('adminVoucher', {
            profiles: [],
            servers: [],
            voucherHistory: [],
            success: null,
            error: 'Gagal memuat halaman voucher: ' + error.message
        });
    }
});

// POST: Generate voucher dengan JSON response
router.post('/generate-voucher', async (req, res) => {
    try {
        // Log request untuk debugging
        console.log('Generate voucher request:', req.body);
        console.log('Count from request:', req.body.count);
        console.log('Profile from request:', req.body.profile);
        console.log('Price from request:', req.body.price);
        console.log('CharType from request:', req.body.charType);
        
        const count = parseInt(req.body.count) || 5;
        const prefix = req.body.prefix || 'wifi-';
        const profile = req.body.profile || 'default';
        const server = req.body.server || 'all';
        const validUntil = req.body.validUntil || '';
        const price = req.body.price || '';
        const voucherModel = req.body.voucherModel || 'standard';
        const charType = req.body.charType || 'alphanumeric';
        
        console.log('Parsed values:');
        console.log('- Count:', count);
        console.log('- Profile:', profile);
        console.log('- Price:', price);
        console.log('- CharType:', charType);
        
        // Gunakan fungsi generateHotspotVouchers yang sudah diimport di atas
        const result = await generateHotspotVouchers(count, prefix, profile, server, validUntil, price, charType);
        
        if (!result.success) {
            throw new Error(result.message || 'Gagal generate voucher');
        }
        
        // Ambil pengaturan dari settings.json
        const settings = JSON.parse(fs.readFileSync(path.join(__dirname, '../settings.json'), 'utf8'));
        const namaHotspot = settings.company_header || 'HOTSPOT VOUCHER';
        const adminKontak = settings['footer_info'] || '-';
        
        // Log response untuk debugging
        console.log(`Generated ${result.vouchers.length} vouchers successfully`);
        
        const response = {
            success: true,
            vouchers: result.vouchers.map(voucher => ({
                ...voucher,
                profile: profile, // Pastikan profile ada di setiap voucher
                price: price // Pastikan harga ada di setiap voucher
            })),
            server,
            profile,
            validUntil,
            price,
            voucherModel: voucherModel,
            namaHotspot,
            adminKontak
        };
        
        console.log('Response:', JSON.stringify(response));
        res.json(response);
    } catch (error) {
        console.error('Error generating vouchers:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal generate voucher: ' + error.message
        });
    }
});

// GET: Print vouchers page
router.get('/print-vouchers', async (req, res) => {
    try {
        // Ambil pengaturan dari settings.json
        const settings = JSON.parse(fs.readFileSync(path.join(__dirname, '../settings.json'), 'utf8'));
        const namaHotspot = settings.company_header || 'HOTSPOT VOUCHER';
        const adminKontak = settings['admins.0'] || '-';
        
        res.render('voucherHotspot', {
            vouchers: [], // Voucher akan dikirim via postMessage
            namaHotspot,
            adminKontak
        });
    } catch (error) {
        res.status(500).send('Error: ' + error.message);
    }
});

// POST: Delete voucher
router.post('/delete-voucher', async (req, res) => {
    const { username } = req.body;
    if (!username) {
        return res.redirect('/admin/hotspot/voucher?error=Username+diperlukan');
    }
    
    try {
        await deleteHotspotUser(username);
        res.redirect('/admin/hotspot/voucher?success=Voucher+berhasil+dihapus');
    } catch (error) {
        console.error('Error deleting voucher:', error);
        res.redirect('/admin/hotspot/voucher?error=' + encodeURIComponent('Gagal menghapus voucher: ' + error.message));
    }
});

module.exports = router;
