const express = require('express');
const router = express.Router();
const { getSetting } = require('../config/settingsManager');

// Middleware cek login admin
function adminAuth(req, res, next) {
  if (req.session && req.session.isAdmin) {
    next();
  } else {
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
    res.redirect('/admin/dashboard');
  } else {
    res.render('adminLogin', { error: 'Username atau password salah.' });
  }
});

// GET: Logout admin
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/admin/login');
  });
});

module.exports = { router, adminAuth };
