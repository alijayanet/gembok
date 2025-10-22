const express = require('express');
const router = express.Router();
const { getSetting } = require('../config/settingsManager');

// Middleware cek login admin
function adminAuth(req, res, next) {
  console.log('=== AdminAuth middleware called ===');
  console.log('Session:', req.session);
  console.log('Session ID:', req.sessionID);
  console.log('IsAdmin:', req.session && req.session.isAdmin);
  
  if (req.session && req.session.isAdmin) {
    console.log('Admin authenticated, proceeding to next middleware');
    next();
  } else {
    console.log('Admin not authenticated, redirecting to login');
    res.redirect('/admin/login');
  }
}

// GET: Halaman login admin
router.get('/login', (req, res) => {
  res.render('adminLogin', { error: null });
});

// POST: Proses login admin
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const adminUsername = getSetting('admin_username', 'admin');
  const adminPassword = getSetting('admin_password', 'admin');

  // Autentikasi sederhana (plain, tanpa hash)
  if (username === adminUsername && password === adminPassword) {
    req.session.isAdmin = true;
    req.session.adminUser = username;
    // For API calls, return JSON instead of redirecting
    if (req.headers['content-type'] === 'application/json' || req.headers['accept'] === 'application/json') {
      res.json({ success: true, message: 'Login successful' });
    } else {
      res.redirect('/admin/dashboard');
    }
  } else {
    // For API calls, return JSON instead of rendering
    if (req.headers['content-type'] === 'application/json' || req.headers['accept'] === 'application/json') {
      res.status(401).json({ success: false, message: 'Username atau password salah.' });
    } else {
      res.render('adminLogin', { error: 'Username atau password salah.' });
    }
  }
});

// GET: Logout admin
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/admin/login');
  });
});

module.exports = { router, adminAuth };