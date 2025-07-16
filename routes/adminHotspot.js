const express = require('express');
const router = express.Router();
const { addHotspotUser, getActiveHotspotUsers, getHotspotProfiles, deleteHotspotUser, generateHotspotVouchers } = require('../config/mikrotik');
const { getMikrotikConnection } = require('../config/mikrotik');

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
        const vouchers = await generateHotspotVouchers({
            quantity: parseInt(quantity),
            length: parseInt(length),
            profile,
            type,
            charType
        });
        res.json({ success: true, vouchers });
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
            res.json({ success: true, activeUsers: activeCount });
        } else {
            console.error('Failed to get active hotspot users:', result.message);
            res.status(500).json({ success: false, message: result.message });
        }
    } catch (error) {
        console.error('Error getting active hotspot users:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
