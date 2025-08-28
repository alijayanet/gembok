const express = require('express');
const router = express.Router();

// GET: Halaman Tool Umum (tanpa auth)
router.get('/', (req, res) => {
    try {
        // Render halaman tool tanpa perlu login
        res.render('publicTools', {
            title: 'Tool Jaringan ISP - Gembok'
        });
    } catch (error) {
        console.error('Error rendering public tools:', error);
        res.status(500).send('Internal Server Error');
    }
});

module.exports = router;