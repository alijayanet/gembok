const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { getSetting, getSettingsWithCache } = require('../config/settingsManager');
const billing = require('../config/billing');
const { findDeviceByTag } = require('../config/addWAN');
const { logger } = require('../config/logger');

// Middleware auth admin (menggunakan yang sudah ada)
const { adminAuth } = require('./adminAuth');

// GET: Halaman management billing
router.get('/', adminAuth, async (req, res) => {
  try {
    const packages = billing.getAllPackages();
    const customers = billing.getAllCustomers();
    let invoices = billing.getAllInvoices();
    
    // Get PPPoE profiles from Mikrotik
    const { getPPPoEProfiles } = require('../config/mikrotik');
    let pppoeProfiles = [];
    try {
      const profilesResult = await getPPPoEProfiles();
      if (profilesResult.success) {
        pppoeProfiles = profilesResult.data.map(profile => ({
          name: profile.name,
          rateLimit: profile['rate-limit'] || 'Unlimited',
          localAddress: profile['local-address'] || '',
          remoteAddress: profile['remote-address'] || ''
        }));
      }
    } catch (profileError) {
      logger.warn(`Could not fetch PPPoE profiles: ${profileError.message}`);
    }
    
    // Check for customers without invoices and create them
    try {
      let createdInvoices = 0;
      for (const customer of customers) {
        if (customer.package_id && customer.package_price) {
          const customerInvoices = invoices.filter(inv => inv.customer_phone === customer.phone);
          if (customerInvoices.length === 0) {
            // Customer has package but no invoice, create one
            const invoice = billing.createInvoice(customer.phone, customer.package_id, customer.package_price);
            if (invoice) {
              // If customer payment status is paid, mark invoice as paid
              if (customer.payment_status === 'paid') {
                billing.markInvoiceAsPaid(invoice.id);
              }
              createdInvoices++;
            }
          }
        }
      }
      
      if (createdInvoices > 0) {
        logger.info(`Auto-created ${createdInvoices} missing invoices for existing customers`);
        // Refresh invoices data after creating new ones
        invoices = billing.getAllInvoices();
      }
    } catch (error) {
      logger.error(`Error creating missing invoices: ${error.message}`);
    }

    // Stats untuk dashboard
    const stats = {
      totalPackages: packages.filter(p => p.status === 'active').length,
      totalCustomers: customers.length,
      totalInvoices: invoices.length,
      unpaidInvoices: invoices.filter(i => i.status === 'unpaid').length,
      totalRevenue: invoices.filter(i => i.status === 'paid')
        .reduce((sum, i) => sum + parseFloat(i.amount), 0)
    };

    // Settings & default templates untuk WhatsApp
    const settingsAll = getSettingsWithCache();
    // Baca template WA dari file terpisah agar settings.json tetap ringan
    let waTemplates = {};
    try {
      const tplPath = path.join(process.cwd(), 'config', 'wa-templates.json');
      waTemplates = JSON.parse(fs.readFileSync(tplPath, 'utf8')) || {};
    } catch (e) {
      waTemplates = {};
    }
    const invoiceTemplateDefault =
      '📄 *TAGIHAN BARU*\n\n' +
      'Tagihan baru telah dibuat untuk Anda:\n\n' +
      '📋 No. Tagihan: {{invoice_number}}\n' +
      '📦 Paket: {{package_name}}\n' +
      '💰 Jumlah: {{amount}}\n' +
      '📅 Jatuh Tempo: {{due_date}}\n\n' +
      '💡 Silakan lakukan pembayaran sebelum jatuh tempo.';
    const paymentTemplateDefault =
      '✅ *PEMBAYARAN DITERIMA*\n\n' +
      'Terima kasih, pembayaran Anda telah diterima:\n\n' +
      '📋 No. Tagihan: {{invoice_number}}\n' +
      '💰 Jumlah: {{amount}}\n' +
      '📅 Dibayar: {{paid_at}}\n\n' +
      '✅ Status akun Anda sudah lunas.';
    const isolirTemplateDefault =
      '🔒 *LAYANAN DIISOLIR*\n\n' +
      'Yth. {{customer_name}},\n\n' +
      'Layanan internet Anda telah diisolir karena keterlambatan pembayaran.\n\n' +
      '📦 Paket: {{package_name}}\n' +
      '📋 Tagihan: {{invoice_number}}\n' +
      '💰 Jumlah: {{amount}}\n' +
      '📅 Jatuh Tempo: {{due_date}}\n\n' +
      '💳 Pembayaran dapat dilakukan ke: \n{{payment_accounts}}\n\n' +
      '📞 Info: {{footer_info}}';

    // Sisipkan template yang dibaca agar EJS tetap bekerja tanpa perubahan besar
    settingsAll.wa_invoice_template = waTemplates.wa_invoice_template || settingsAll.wa_invoice_template || '';
    settingsAll.wa_payment_template = waTemplates.wa_payment_template || settingsAll.wa_payment_template || '';
    settingsAll.wa_isolir_template = waTemplates.wa_isolir_template || settingsAll.wa_isolir_template || '';

    res.render('adminBilling', {
      packages,
      customers,
      invoices,
      stats,
      pppoeProfiles, // Add PPPoE profiles data
      page: 'billing',
      currentPage: 'billing',
      success: req.query.success,
      error: req.query.error,
      settings: settingsAll,
      invoiceTemplateDefault,
      paymentTemplateDefault,
      isolirTemplateDefault
    });
  } catch (error) {
    logger.error(`Error loading billing page: ${error.message}`);
    res.status(500).send('Error loading billing page');
  }
});

// MESSAGES: Kirim tagihan manual ke banyak pelanggan (batch)
router.post('/messages/send-invoice-batch', adminAuth, async (req, res) => {
  try {
    let { phones } = req.body; // bisa array atau CSV string
    if (!phones || (Array.isArray(phones) && phones.length === 0)) {
      return res.redirect('/admin/billing?error=' + encodeURIComponent('Pilih minimal 1 pelanggan'));
    }

    // Normalisasi daftar nomor
    if (typeof phones === 'string') {
      phones = phones.split(',').map(s => s.trim()).filter(Boolean);
    }
    const normalize = (p) => {
      let n = String(p).replace(/\D/g, '');
      if (n.startsWith('0')) n = '62' + n.slice(1);
      else if (!n.startsWith('62')) n = '62' + n;
      return n;
    };

    const uniquePhones = Array.from(new Set(phones.map(normalize)));

    // Load template
    const invoiceTemplateDefault =
      '📄 *TAGIHAN BARU*\n\n' +
      'Tagihan baru telah dibuat untuk Anda:\n\n' +
      '📋 No. Tagihan: {{invoice_number}}\n' +
      '📦 Paket: {{package_name}}\n' +
      '💰 Jumlah: {{amount}}\n' +
      '📅 Jatuh Tempo: {{due_date}}\n\n' +
      '💡 Silakan lakukan pembayaran sebelum jatuh tempo.';
    const tpl = (getSetting && getSetting('wa_invoice_template')) || invoiceTemplateDefault;
    const formatCurrency = (amount) => `Rp ${parseFloat(amount).toLocaleString('id-ID')}`;
    const renderTemplate = (t, data) => t.replace(/{{\s*([\w_]+)\s*}}/g, (m, k) => (data[k] ?? ''));

    const { sendMessage } = require('../config/sendMessage');

    let sent = 0;
    let failed = 0;
    for (const p of uniquePhones) {
      try {
        const customer = billing.getCustomerByPhone(p);
        if (!customer) { failed++; continue; }
        const invs = billing.getInvoicesByPhone(p) || [];
        if (!invs.length) { failed++; continue; }
        const unpaid = invs.filter(i => i.status === 'unpaid');
        const latest = (arr) => arr.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
        const invoice = unpaid.length > 0 ? latest(unpaid) : latest(invs);
        if (!invoice) { failed++; continue; }

        const message = renderTemplate(tpl, {
          invoice_number: invoice.invoice_number,
          package_name: invoice.package_name,
          amount: formatCurrency(invoice.amount),
          due_date: new Date(invoice.due_date).toLocaleDateString('id-ID'),
          customer_name: customer.name || p,
          customer_phone: p
        });
        const ok = await sendMessage(p, message);
        if (ok) sent++; else failed++;
      } catch (e) {
        failed++;
      }
    }

    if (sent > 0) {
      return res.redirect('/admin/billing?success=' + encodeURIComponent(`Kirim tagihan batch: ${sent} berhasil, ${failed} gagal`));
    }
    return res.redirect('/admin/billing?error=' + encodeURIComponent(`Gagal kirim batch: semua gagal (${failed})`));
  } catch (error) {
    logger.error(`Error sending manual invoice batch: ${error.message}`);
    res.redirect('/admin/billing?error=' + encodeURIComponent('Gagal mengirim tagihan batch: ' + error.message));
  }
});

// MESSAGES: Kirim tagihan manual ke 1 pelanggan
router.post('/messages/send-invoice', adminAuth, async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.redirect('/admin/billing?error=' + encodeURIComponent('Nomor HP wajib diisi'));
    }

    // Normalisasi nomor ke format 62xxxxxxxxxxx (untuk konsistensi billing dan WhatsApp)
    let cleanPhone = String(phone).replace(/\D/g, '');
    if (cleanPhone.startsWith('0')) {
      cleanPhone = '62' + cleanPhone.slice(1);
    } else if (!cleanPhone.startsWith('62')) {
      // Jika pengguna menginput tanpa 0/62 (misal 8123...), tambahkan 62 di depan
      cleanPhone = '62' + cleanPhone;
    }

    const customer = billing.getCustomerByPhone(cleanPhone);
    if (!customer) {
      return res.redirect('/admin/billing?error=' + encodeURIComponent('Pelanggan tidak ditemukan di sistem billing'));
    }

    // Ambil tagihan: prioritas tagihan belum lunas terbaru, jika tidak ada gunakan tagihan terbaru
    const invs = billing.getInvoicesByPhone(cleanPhone) || [];
    if (!invs || invs.length === 0) {
      return res.redirect('/admin/billing?error=' + encodeURIComponent('Pelanggan belum memiliki tagihan'));
    }
    const unpaid = invs.filter(i => i.status === 'unpaid');
    const latest = (arr) => arr.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
    const invoice = unpaid.length > 0 ? latest(unpaid) : latest(invs);

    // Helper: format mata uang
    const formatCurrency = (amount) => `Rp ${parseFloat(amount).toLocaleString('id-ID')}`;
    // Helper: render template {{key}}
    const renderTemplate = (tpl, data) => {
      if (!tpl || typeof tpl !== 'string') return '';
      return tpl.replace(/{{\s*([\w_]+)\s*}}/g, (m, key) => {
        const val = data[key];
        return (val === undefined || val === null) ? '' : String(val);
      });
    };

    // Ambil template dari settings, fallback ke default
    const invoiceTemplateDefault =
      '📄 *TAGIHAN BARU*\n\n' +
      'Tagihan baru telah dibuat untuk Anda:\n\n' +
      '📋 No. Tagihan: {{invoice_number}}\n' +
      '📦 Paket: {{package_name}}\n' +
      '💰 Jumlah: {{amount}}\n' +
      '📅 Jatuh Tempo: {{due_date}}\n\n' +
      '💡 Silakan lakukan pembayaran sebelum jatuh tempo.';

    const tpl = (getSetting && getSetting('wa_invoice_template')) || invoiceTemplateDefault;
    const message = renderTemplate(tpl, {
      invoice_number: invoice.invoice_number,
      package_name: invoice.package_name,
      amount: formatCurrency(invoice.amount),
      due_date: new Date(invoice.due_date).toLocaleDateString('id-ID'),
      customer_name: customer.name || cleanPhone,
      customer_phone: cleanPhone
    });

    // Kirim melalui WhatsApp
    const { sendMessage } = require('../config/sendMessage');
    const ok = await sendMessage(cleanPhone, message);
    if (ok) {
      return res.redirect('/admin/billing?success=' + encodeURIComponent(`Tagihan ${invoice.invoice_number} dikirim ke ${cleanPhone}`));
    }
    return res.redirect('/admin/billing?error=' + encodeURIComponent('Gagal mengirim pesan WhatsApp. Periksa koneksi WhatsApp.'));
  } catch (error) {
    logger.error(`Error sending manual invoice: ${error.message}`);
    res.redirect('/admin/billing?error=' + encodeURIComponent('Gagal mengirim tagihan: ' + error.message));
  }
});

// MESSAGES: Broadcast gangguan ke pelanggan
router.post('/messages/broadcast-outage', adminAuth, async (req, res) => {
  try {
    const { message_text, target, package_ids, phones } = req.body;
    if (!message_text || message_text.trim().length === 0) {
      return res.redirect('/admin/billing?error=' + encodeURIComponent('Pesan tidak boleh kosong'));
    }

    let targets = [];
    const customers = billing.getAllCustomers();

    if (target === 'all') {
      targets = customers.map(c => c.phone).filter(Boolean);
    } else if (target === 'active') {
      targets = customers.filter(c => c.status !== 'inactive').map(c => c.phone).filter(Boolean);
    } else if (target === 'package') {
      const ids = Array.isArray(package_ids) ? package_ids : (package_ids ? [package_ids] : []);
      targets = customers.filter(c => ids.includes(c.package_id)).map(c => c.phone).filter(Boolean);
    } else if (target === 'list') {
      const list = (phones || '').split(',').map(s => s.trim()).filter(Boolean);
      targets = list;
    }

    // Unique & valid
    targets = Array.from(new Set(targets)).filter(v => !!v);
    if (targets.length === 0) {
      return res.redirect('/admin/billing?error=' + encodeURIComponent('Tidak ada nomor tujuan yang valid'));
    }

    const { sendGroupMessage } = require('../config/sendMessage');
    const result = await sendGroupMessage(targets, message_text);
    const sent = result?.sent || 0;
    const failed = result?.failed || 0;
    const ok = result?.success;

    if (ok) {
      return res.redirect('/admin/billing?success=' + encodeURIComponent(`Broadcast dikirim: ${sent} berhasil, ${failed} gagal`));
    }
    return res.redirect('/admin/billing?error=' + encodeURIComponent(`Broadcast gagal: ${failed} gagal, ${sent} berhasil`));
  } catch (error) {
    logger.error(`Error broadcasting outage: ${error.message}`);
    res.redirect('/admin/billing?error=' + encodeURIComponent('Gagal mengirim broadcast: ' + error.message));
  }
});

// PACKAGE MANAGEMENT
router.post('/packages/create', adminAuth, async (req, res) => {
  try {
    const { name, speed, price, description, pppoe_profile } = req.body;
    
    if (!name || !speed || !price) {
      return res.redirect('/admin/billing?error=' + encodeURIComponent('Nama, kecepatan, dan harga paket wajib diisi'));
    }
    
    const newPackage = billing.createPackage({
      name,
      speed,
      price: parseFloat(price),
      description,
      pppoe_profile
    });
    
    if (newPackage) {
      res.redirect('/admin/billing?success=' + encodeURIComponent('Paket berhasil dibuat'));
    } else {
      res.redirect('/admin/billing?error=' + encodeURIComponent('Gagal membuat paket'));
    }
  } catch (error) {
    logger.error(`Error creating package: ${error.message}`);
    res.redirect('/admin/billing?error=' + encodeURIComponent('Terjadi kesalahan saat membuat paket'));
  }
});

router.post('/packages/update/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, speed, price, description, pppoe_profile } = req.body;
    
    const updatedPackage = billing.updatePackage(id, {
      name,
      speed,
      price: parseFloat(price),
      description,
      pppoe_profile
    });
    
    if (updatedPackage) {
      res.redirect('/admin/billing?success=' + encodeURIComponent('Paket berhasil diperbarui'));
    } else {
      res.redirect('/admin/billing?error=' + encodeURIComponent('Gagal memperbarui paket'));
    }
  } catch (error) {
    logger.error(`Error updating package: ${error.message}`);
    res.redirect('/admin/billing?error=' + encodeURIComponent('Terjadi kesalahan saat memperbarui paket'));
  }
});

router.post('/packages/delete/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    if (billing.deletePackage(id)) {
      res.redirect('/admin/billing?success=' + encodeURIComponent('Paket berhasil dihapus'));
    } else {
      res.redirect('/admin/billing?error=' + encodeURIComponent('Gagal menghapus paket'));
    }
  } catch (error) {
    logger.error(`Error deleting package: ${error.message}`);
    res.redirect('/admin/billing?error=' + encodeURIComponent('Terjadi kesalahan saat menghapus paket'));
  }
});

// AUTO-SYNC customers dari GenieACS
router.post('/customers/sync-genieacs', adminAuth, async (req, res) => {
  try {
    console.log('🔄 Starting GenieACS customer sync...');
    
    // Import function untuk ambil semua devices dari GenieACS
    const { findDeviceByTag } = require('../config/addWAN');
    const settings = JSON.parse(fs.readFileSync(path.join(__dirname, '../settings.json'), 'utf8'));
    const axios = require('axios');
    
    // Ambil semua devices dari GenieACS
    const genieacsUrl = settings.genieacs_url || 'http://localhost:7557';
    const response = await axios.get(`${genieacsUrl}/devices/`, {
      auth: { 
        username: settings.genieacs_username || 'admin', 
        password: settings.genieacs_password || 'admin' 
      },
      headers: { 'Accept': 'application/json' }
    });
    
    let syncedCount = 0;
    let errorCount = 0;
    const syncErrors = [];
    
    if (response.data && response.data.length > 0) {
      for (const device of response.data) {
        try {
          // Cari tag yang berupa nomor HP (format: phone: atau langsung nomor)
          let customerPhone = null;
          let customerName = null;
          
          if (Array.isArray(device._tags)) {
            device._tags.forEach(tag => {
              // Format phone:081234567890
              if (tag.startsWith('phone:')) {
                customerPhone = tag.replace('phone:', '').trim();
              }
              // Format customer:Nama Customer
              else if (tag.startsWith('customer:')) {
                customerName = tag.replace('customer:', '').trim();
              }
              // Langsung nomor HP (8-15 digit)
              else if (/^0?8[0-9]{8,13}$/.test(tag.trim())) {
                customerPhone = tag.trim();
              }
            });
          }
          
          // Jika ada nomor HP, sync ke billing system
          if (customerPhone) {
            // Normalisasi nomor HP (tambah 62 jika dimulai dengan 0)
            if (customerPhone.startsWith('0')) {
              customerPhone = '62' + customerPhone.substring(1);
            }
            
            // Cek apakah customer sudah ada di billing
            let existingCustomer = billing.getCustomerByPhone(customerPhone);
            
            if (!existingCustomer) {
              // Buat customer baru
              const newCustomer = {
                phone: customerPhone,
                name: customerName || customerPhone,
                username: customerPhone,
                device_id: device._id,
                serial_number: device.DeviceID?.SerialNumber || device._id,
                status: 'active',
                payment_status: 'unpaid',
                created_at: new Date().toISOString(),
                synced_from_genieacs: true
              };
              
              const result = billing.createOrUpdateCustomer(newCustomer);
              if (result) {
                syncedCount++;
                console.log(`✅ Synced customer: ${customerPhone} (${customerName || 'No name'})`);
              }
            } else {
              // Update device info jika sudah ada
              existingCustomer.device_id = device._id;
              existingCustomer.serial_number = device.DeviceID?.SerialNumber || device._id;
              existingCustomer.synced_from_genieacs = true;
              
              billing.createOrUpdateCustomer(existingCustomer);
              console.log(`🔄 Updated device info for: ${customerPhone}`);
            }
          }
        } catch (deviceError) {
          errorCount++;
          syncErrors.push(`Device ${device._id}: ${deviceError.message}`);
          console.error(`❌ Error syncing device ${device._id}:`, deviceError.message);
        }
      }
    }
    
    const message = `Sync berhasil! ${syncedCount} customer di-sync dari GenieACS` + 
                   (errorCount > 0 ? ` (${errorCount} error)` : '');
    
    console.log(`🎉 Sync completed: ${syncedCount} customers synced, ${errorCount} errors`);
    res.redirect('/admin/billing?success=' + encodeURIComponent(message));
    
  } catch (error) {
    logger.error(`Error syncing customers from GenieACS: ${error.message}`);
    res.redirect('/admin/billing?error=' + encodeURIComponent('Gagal sync customer dari GenieACS: ' + error.message));
  }
});

// CUSTOMER MANAGEMENT
router.post('/customers/update', adminAuth, async (req, res) => {
  try {
    const { phone, name, username, package_id, payment_status, pppoe_username } = req.body;
    
    if (!phone) {
      return res.redirect('/admin/billing?error=' + encodeURIComponent('Nomor HP wajib diisi'));
    }
    
    // Get current customer data
    let customer = billing.getCustomerByPhone(phone);
    
    if (!customer) {
      // Create new customer if doesn't exist
      customer = {
        phone: phone,
        name: name || '',
        username: username || phone,
        payment_status: payment_status || 'unpaid',
        status: 'active'
      };
    } else {
      // Update existing customer
      customer.name = name || customer.name;
      customer.username = username || customer.username;
      customer.pppoe_username = pppoe_username || customer.pppoe_username;
      customer.payment_status = payment_status || customer.payment_status;
    }
    
    // If package is changed, update package info
    if (package_id && package_id !== customer.package_id) {
      const package = billing.getPackageById(package_id);
      if (package) {
        customer.package_id = package_id;
        customer.package_name = package.name;
        customer.package_price = package.price;
      }
    }
    
    // Update customer
    const updatedCustomer = billing.createOrUpdateCustomer(customer);
    
    if (updatedCustomer) {
      res.redirect('/admin/billing?success=' + encodeURIComponent('Data customer berhasil diperbarui'));
    } else {
      res.redirect('/admin/billing?error=' + encodeURIComponent('Gagal memperbarui data customer'));
    }
  } catch (error) {
    logger.error(`Error updating customer: ${error.message}`);
    res.redirect('/admin/billing?error=' + encodeURIComponent('Terjadi kesalahan saat memperbarui customer'));
  }
});

router.post('/customers/assign-package', adminAuth, async (req, res) => {
  try {
    const { phone, package_id, name, enable_isolir, pppoe_username, static_ip, connection_type } = req.body;
    
    // Validasi berdasarkan tipe koneksi
    if (!phone || !package_id) {
      return res.redirect('/admin/billing?error=' + encodeURIComponent('Nomor HP dan paket wajib diisi'));
    }
    
    if (connection_type === 'static' && !static_ip) {
      return res.redirect('/admin/billing?error=' + encodeURIComponent('IP Statik wajib diisi untuk tipe koneksi statik'));
    }
    
    if (connection_type === 'pppoe' && !pppoe_username) {
      return res.redirect('/admin/billing?error=' + encodeURIComponent('PPPoE Username wajib diisi untuk tipe koneksi PPPoE'));
    }
    
    // Validasi customer ada di GenieACS
    const device = await findDeviceByTag(phone);
    if (!device) {
      return res.redirect('/admin/billing?error=' + encodeURIComponent('Nomor HP tidak ditemukan di GenieACS'));
    }
    
    // Assign package with PPPoE username
    const enableIsolirBool = enable_isolir === 'true';
    const customer = billing.assignPackageToCustomer(
      phone, 
      package_id, 
      name, 
      enableIsolirBool, 
      pppoe_username, 
      static_ip, 
      connection_type || 'pppoe'
    );
    if (customer && name) {
      // Update nama jika disediakan
      billing.createOrUpdateCustomer({ ...customer, name });
    }
    
    // Auto-create invoice untuk customer baru
    if (customer) {
      const invoice = billing.createInvoice(phone, package_id, customer.package_price);
      if (invoice) {
        logger.info(`Auto-created invoice ${invoice.invoice_number} for customer ${phone}`);
      }
    }
    
    if (customer) {
      res.redirect('/admin/billing?success=' + encodeURIComponent('Paket berhasil ditetapkan untuk pelanggan'));
    } else {
      res.redirect('/admin/billing?error=' + encodeURIComponent('Gagal menetapkan paket'));
    }
  } catch (error) {
    logger.error(`Error assigning package: ${error.message}`);
    res.redirect('/admin/billing?error=' + encodeURIComponent('Terjadi kesalahan saat menetapkan paket'));
  }
});

// INVOICE MANAGEMENT
router.post('/invoices/create', adminAuth, async (req, res) => {
  try {
    const { customer_phone, package_id, amount } = req.body;
    
    if (!customer_phone || !package_id) {
      return res.redirect('/admin/billing?error=' + encodeURIComponent('Nomor HP dan paket wajib diisi'));
    }
    
    const invoice = billing.createInvoice(customer_phone, package_id, amount);
    
    if (invoice) {
      res.redirect('/admin/billing?success=' + encodeURIComponent('Tagihan berhasil dibuat'));
    } else {
      res.redirect('/admin/billing?error=' + encodeURIComponent('Gagal membuat tagihan'));
    }
  } catch (error) {
    logger.error(`Error creating invoice: ${error.message}`);
    res.redirect('/admin/billing?error=' + encodeURIComponent('Terjadi kesalahan saat membuat tagihan'));
  }
});

router.post('/invoices/mark-paid/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const invoice = billing.markInvoiceAsPaid(id);
    
    if (invoice) {
      res.redirect('/admin/billing?success=' + encodeURIComponent('Tagihan berhasil ditandai lunas'));
    } else {
      res.redirect('/admin/billing?error=' + encodeURIComponent('Gagal menandai tagihan lunas'));
    }
  } catch (error) {
    logger.error(`Error marking invoice as paid: ${error.message}`);
    res.redirect('/admin/billing?error=' + encodeURIComponent('Terjadi kesalahan saat menandai tagihan lunas'));
  }
});

// API ENDPOINTS for AJAX
router.get('/api/packages', adminAuth, (req, res) => {
  try {
    const packages = billing.getActivePackages();
    res.json({ success: true, packages });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

router.get('/api/customers', adminAuth, (req, res) => {
  try {
    const customers = billing.getAllCustomers();
    res.json({ success: true, customers });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

router.get('/api/customer/:phone', adminAuth, async (req, res) => {
  try {
    const { phone } = req.params;
    
    // Check if customer exists in GenieACS
    const device = await findDeviceByTag(phone);
    if (!device) {
      return res.json({ success: false, message: 'Customer not found in GenieACS' });
    }
    
    // Get billing data
    const customer = billing.getCustomerByPhone(phone);
    const invoices = billing.getInvoicesByPhone(phone);
    
    res.json({ 
      success: true, 
      customer: customer || { phone, name: '', package_name: 'Belum ada paket' },
      invoices,
      device_status: device ? 'active' : 'inactive'
    });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

// Generate monthly invoices
router.post('/generate-monthly-invoices', adminAuth, async (req, res) => {
  try {
    const customers = billing.getAllCustomers();
    let generated = 0;
    
    for (const customer of customers) {
      if (customer.package_id && customer.status === 'active') {
        // Check if invoice for this month already exists
        const invoices = billing.getInvoicesByPhone(customer.phone);
        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();
        
        const existingInvoice = invoices.find(inv => {
          const invDate = new Date(inv.created_at);
          return invDate.getMonth() === currentMonth && invDate.getFullYear() === currentYear;
        });
        
        if (!existingInvoice) {
          const invoice = billing.createInvoice(customer.phone, customer.package_id, customer.package_price);
          if (invoice) generated++;
        }
      }
    }
    
    res.redirect('/admin/billing?success=' + encodeURIComponent(`${generated} tagihan bulanan berhasil dibuat`));
  } catch (error) {
    logger.error(`Error generating monthly invoices: ${error.message}`);
    res.redirect('/admin/billing?error=' + encodeURIComponent('Gagal membuat tagihan bulanan'));
  }
});

// Manual trigger monthly invoice generation
router.post('/trigger-monthly-invoices', adminAuth, async (req, res) => {
  try {
    const monthlyInvoiceService = require('../config/monthly-invoice-service');
    await monthlyInvoiceService.generateMonthlyInvoicesNow();
    
    res.redirect('/admin/billing?success=' + encodeURIComponent('Generasi invoice bulanan berhasil dijalankan'));
  } catch (error) {
    logger.error(`Error triggering monthly invoices: ${error.message}`);
    res.redirect('/admin/billing?error=' + encodeURIComponent('Gagal menjalankan generasi invoice bulanan'));
  }
});

// Get monthly invoice service status
router.get('/api/monthly-invoice-status', adminAuth, (req, res) => {
  try {
    const monthlyInvoiceService = require('../config/monthly-invoice-service');
    const status = monthlyInvoiceService.getServiceStatus();
    
    res.json({
      success: true,
      status: status
    });
  } catch (error) {
    logger.error(`Error getting monthly invoice status: ${error.message}`);
    res.json({
      success: false,
      message: error.message
    });
  }
});

// DELETE: Hapus single customer
router.post('/customers/delete', adminAuth, async (req, res) => {
  try {
    const { phone } = req.body;
    
    if (!phone) {
      return res.redirect('/admin/billing?error=' + encodeURIComponent('Nomor HP pelanggan wajib diisi'));
    }
    
    // Delete customer and related invoices
    const result = billing.deleteCustomer(phone);
    
    if (result.success) {
      res.redirect('/admin/billing?success=' + encodeURIComponent(`Pelanggan ${phone} berhasil dihapus`));
    } else {
      res.redirect('/admin/billing?error=' + encodeURIComponent(result.message || 'Gagal menghapus pelanggan'));
    }
  } catch (error) {
    logger.error(`Error deleting customer: ${error.message}`);
    res.redirect('/admin/billing?error=' + encodeURIComponent('Terjadi kesalahan saat menghapus pelanggan'));
  }
});

// DELETE: Hapus multiple customers
router.post('/customers/delete-multiple', adminAuth, async (req, res) => {
  try {
    const { phones } = req.body;
    
    if (!phones || !Array.isArray(phones) || phones.length === 0) {
      return res.redirect('/admin/billing?error=' + encodeURIComponent('Pilih pelanggan yang akan dihapus'));
    }
    
    let successCount = 0;
    let errorCount = 0;
    const errors = [];
    
    for (const phone of phones) {
      try {
        const result = billing.deleteCustomer(phone);
        if (result.success) {
          successCount++;
        } else {
          errorCount++;
          errors.push(`${phone}: ${result.message}`);
        }
      } catch (error) {
        errorCount++;
        errors.push(`${phone}: ${error.message}`);
      }
    }
    
    if (successCount > 0) {
      const message = `${successCount} pelanggan berhasil dihapus`;
      if (errorCount > 0) {
        message += `, ${errorCount} gagal`;
      }
      res.redirect('/admin/billing?success=' + encodeURIComponent(message));
    } else {
      res.redirect('/admin/billing?error=' + encodeURIComponent('Gagal menghapus semua pelanggan yang dipilih'));
    }
  } catch (error) {
    logger.error(`Error deleting multiple customers: ${error.message}`);
    res.redirect('/admin/billing?error=' + encodeURIComponent('Terjadi kesalahan saat menghapus pelanggan'));
  }
});

module.exports = router;
 
// SETTINGS: Simpan template WhatsApp invoice & payment
router.post('/settings/whatsapp-templates', adminAuth, async (req, res) => {
  try {
    const { invoice_template, payment_template, isolir_template, payment_accounts, payment_numbers } = req.body;

    // 1) Simpan hanya payment_* ke settings.json
    const settingsPath = path.join(process.cwd(), 'settings.json');
    let current = {};
    try { current = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch { current = {}; }
    if (payment_accounts && String(payment_accounts).trim()) {
      current.payment_accounts = String(payment_accounts);
    } else {
      delete current.payment_accounts;
    }
    if (payment_numbers && String(payment_numbers).trim()) {
      current.payment_numbers = String(payment_numbers);
    } else {
      delete current.payment_numbers;
    }
    fs.writeFileSync(settingsPath, JSON.stringify(current, null, 2), 'utf8');

    // 2) Simpan template WA ke config/wa-templates.json
    const tplPath = path.join(process.cwd(), 'config', 'wa-templates.json');
    let tpl = {};
    try { tpl = JSON.parse(fs.readFileSync(tplPath, 'utf8')); } catch { tpl = {}; }
    tpl.wa_invoice_template = invoice_template || '';
    tpl.wa_payment_template = payment_template || '';
    tpl.wa_isolir_template = isolir_template || '';
    // pastikan folder config ada (harusnya sudah ada)
    try { fs.mkdirSync(path.join(process.cwd(), 'config'), { recursive: true }); } catch {}
    fs.writeFileSync(tplPath, JSON.stringify(tpl, null, 2), 'utf8');

    res.redirect('/admin/billing?success=' + encodeURIComponent('Template WhatsApp & metode pembayaran berhasil disimpan (disimpan terpisah)'));
  } catch (error) {
    logger.error(`Error saving WhatsApp templates: ${error.message}`);
    res.redirect('/admin/billing?error=' + encodeURIComponent('Gagal menyimpan template WhatsApp'));
  }
});

// SETTINGS: Simpan profil isolir global (PPPoE) dari Mikrotik
router.post('/settings/isolir-profile', adminAuth, async (req, res) => {
  try {
    const { billing_isolir_profile } = req.body;
    if (!billing_isolir_profile || String(billing_isolir_profile).trim().length === 0) {
      return res.redirect('/admin/billing?error=' + encodeURIComponent('Profile isolir wajib dipilih'));
    }

    const settingsPath = path.join(process.cwd(), 'settings.json');
    let current = {};
    try { current = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch { current = {}; }
    current.billing_isolir_profile = String(billing_isolir_profile).trim();
    fs.writeFileSync(settingsPath, JSON.stringify(current, null, 2), 'utf8');

    return res.redirect('/admin/billing?success=' + encodeURIComponent('Profil isolir berhasil disimpan'));
  } catch (error) {
    logger.error(`Error saving isolir profile: ${error.message}`);
    return res.redirect('/admin/billing?error=' + encodeURIComponent('Gagal menyimpan profil isolir: ' + error.message));
  }
});
