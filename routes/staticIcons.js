const express = require('express');
const router = express.Router();

// Simple transparent PNG (1x1) as placeholder icon
// You can replace these later with real brand icons in public/img/icons/
const TRANSPARENT_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAoMBg2m1bC8AAAAASUVORK5CYII=';

function sendPng(res) {
  const buf = Buffer.from(TRANSPARENT_PNG_BASE64, 'base64');
  res.set('Cache-Control', 'public, max-age=86400');
  res.type('png').send(buf);
}

router.get('/img/icons/icon-192.png', (req, res) => {
  sendPng(res);
});

router.get('/img/icons/icon-512.png', (req, res) => {
  sendPng(res);
});

// Serve a small PNG as favicon placeholder (works in modern browsers)
router.get('/favicon.ico', (req, res) => {
  sendPng(res);
});

module.exports = router;


