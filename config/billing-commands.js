// billing-commands.js - WhatsApp commands untuk billing system
const { logger } = require('./logger');
const billing = require('./billing');
const { findDeviceByTag } = require('./addWAN');
const mikrotik = require('./mikrotik');
const { getSetting } = require('./settingsManager');

// Set WhatsApp sock instance
let sock = null;

function setSock(sockInstance) {
  sock = sockInstance;
}

// Helper: safely send WhatsApp message, avoid throwing when disconnected
async function safeSend(remoteJid, content) {
  try {
    if (!sock) {
      logger.warn(`safeSend: WhatsApp socket not set; cannot send to ${remoteJid}`);
      return false;
    }

    // Langsung coba kirim; koneksi akan ter-handle oleh modul whatsapp
    await sock.sendMessage(remoteJid, content);
    return true;
  } catch (err) {
    logger.error(`safeSend error to ${remoteJid}: ${err.message}`);
    return false;
  }
}

// Format message dengan header dan footer
function formatBillingMessage(message) {
  const companyHeader = getSetting('company_header', 'BILLING SYSTEM');
  const footerInfo = getSetting('footer_info', '');
  
  let formattedMessage = `*${companyHeader}*\n\n${message}`;
  
  if (footerInfo) {
    formattedMessage += `\n\n${footerInfo}`;
  }
  
  return formattedMessage;
}

// Helper function untuk format currency
function formatCurrency(amount) {
  return `Rp ${parseFloat(amount).toLocaleString('id-ID')}`;
}

// Helper: render template dengan placeholder {{key}}
function renderTemplate(tpl, data) {
  if (!tpl || typeof tpl !== 'string') return '';
  return tpl.replace(/{{\s*([\w_]+)\s*}}/g, (m, key) => {
    const val = data[key];
    return (val === undefined || val === null) ? '' : String(val);
  });
}

// Command: List customers with pagination and search
async function handleListCustomersCommand(remoteJid, params = []) {
  try {
    const all = billing.getAllCustomers();
    const pageSize = 10;
    let page = 1;
    let mode = 'list';
    let query = '';

    if (params.length > 0) {
      if (params[0] === 'cari') {
        mode = 'search';
        query = (params.slice(1).join(' ') || '').toLowerCase();
      } else {
        const p = parseInt(params[0], 10);
        if (Number.isFinite(p) && p > 0) page = p;
      }
    }

    let items = all;
    if (mode === 'search' && query) {
      items = all.filter(c => {
        const hay = [c.name, c.phone, c.username, c.package_name]
          .map(v => (v || '').toString().toLowerCase()).join(' ');
        return hay.includes(query);
      });
    }

    const total = items.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    page = Math.min(Math.max(1, page), totalPages);
    const start = (page - 1) * pageSize;
    const slice = items.slice(start, start + pageSize);

    let msg = `👥 *DAFTAR PELANGGAN*${mode === 'search' ? ' (cari)' : ''}\n\n`;
    if (total === 0) {
      msg += 'Tidak ada data.\n';
    } else {
      slice.forEach((c, idx) => {
        const no = start + idx + 1;
        const price = c.package_price ? ` — ${formatCurrency(c.package_price)}` : '';
        const status = c.payment_status === 'paid' ? 'Lunas' : (c.payment_status || '-')
        msg += `${no}. ${c.name || '-'} (${c.phone})\n`;
        msg += `   Paket: ${c.package_name || '-'}${price}\n`;
        msg += `   Bayar: ${status}\n`;
      });
      msg += `\nHalaman ${page}/${totalPages} — Total ${total} pelanggan`;
    }

    msg += `\n\nPerintah:\n`;
    msg += `• *pelanggan* — halaman 1\n`;
    msg += `• *pelanggan [hal]* — contoh: pelanggan 2\n`;
    msg += `• *pelanggan cari [kata]* — contoh: pelanggan cari budi`;

    await safeSend(remoteJid, { text: formatBillingMessage(msg) });
  } catch (error) {
    logger.error(`Error list customers: ${error.message}`);
    await safeSend(remoteJid, { text: formatBillingMessage('❌ Terjadi kesalahan saat mengambil daftar pelanggan.') });
  }
}

function getInvoiceTemplate() {
  const defaultTpl =
    '📄 *TAGIHAN BARU*\n\n' +
    'Tagihan baru telah dibuat untuk Anda:\n\n' +
    '📋 No. Tagihan: {{invoice_number}}\n' +
    '📦 Paket: {{package_name}}\n' +
    '💰 Jumlah: {{amount}}\n' +
    '📅 Jatuh Tempo: {{due_date}}\n\n' +
    '💡 Silakan lakukan pembayaran sebelum jatuh tempo.';
  return getSetting('wa_invoice_template', defaultTpl);
}

function getPaymentTemplate() {
  const defaultTpl =
    '✅ *PEMBAYARAN DITERIMA*\n\n' +
    'Terima kasih, pembayaran Anda telah diterima:\n\n' +
    '📋 No. Tagihan: {{invoice_number}}\n' +
    '💰 Jumlah: {{amount}}\n' +
    '📅 Dibayar: {{paid_at}}\n\n' +
    '✅ Status akun Anda sudah lunas.';
  return getSetting('wa_payment_template', defaultTpl);
}

// Command: Lihat semua paket
async function handlePackagesCommand(remoteJid) {
  try {
    const packages = billing.getActivePackages();
    
    if (packages.length === 0) {
      const message = `📦 *DAFTAR PAKET INTERNET*\n\n❌ Belum ada paket tersedia.`;
      await safeSend(remoteJid, { text: formatBillingMessage(message) });
      return;
    }
    
    let message = `📦 *DAFTAR PAKET INTERNET*\n\n`;
    
    packages.forEach((pkg, index) => {
      message += `${index + 1}. *${pkg.name}*\n`;
      message += `   🚀 Kecepatan: ${pkg.speed}\n`;
      message += `   💰 Harga: ${formatCurrency(pkg.price)}\n`;
      if (pkg.description) {
        message += `   📝 ${pkg.description}\n`;
      }
      message += `\n`;
    });
    
    message += `📞 Untuk berlangganan, hubungi admin atau gunakan perintah:\n`;
    message += `*tetapkan [nomor_hp] [id_paket]*`;
    
    await safeSend(remoteJid, { text: formatBillingMessage(message) });
    logger.info(`Packages list sent to ${remoteJid}`);
  } catch (error) {
    logger.error(`Error sending packages list: ${error.message}`);
    await safeSend(remoteJid, { 
      text: formatBillingMessage('❌ Terjadi kesalahan saat mengambil daftar paket.') 
    });
  }
}

// Command: Cek billing customer
async function handleBillingCheckCommand(remoteJid, phoneOrName) {
  try {
    if (!phoneOrName) {
      await safeSend(remoteJid, { 
        text: formatBillingMessage('❌ Format salah. Gunakan: *cekbilling [nomor_hp/nama]*\nContoh: cekbilling 081234567890\nContoh: cekbilling John Doe') 
      });
      return;
    }
    
    let customer = null;
    let cleanPhone = null;
    
    // Cek apakah input adalah nomor HP atau nama
    const isPhoneNumber = /^\d+$/.test(phoneOrName.replace(/\D/g, ''));
    
    if (isPhoneNumber) {
      // Normalize phone number
      cleanPhone = phoneOrName.replace(/\D/g, '');
      if (cleanPhone.startsWith('62')) {
        cleanPhone = '0' + cleanPhone.substring(2);
      }
      
      customer = billing.getCustomerByPhone(cleanPhone);
    } else {
      // Cari berdasarkan nama
      customer = billing.getCustomerByName(phoneOrName);
      if (customer) {
        cleanPhone = customer.phone;
      }
    }
    
    // Jika tidak ditemukan di billing, coba cari multiple matches untuk nama
    if (!customer && !isPhoneNumber) {
      const searchResults = billing.searchCustomers(phoneOrName);
      if (searchResults.length > 1) {
        let message = `🔍 *DITEMUKAN ${searchResults.length} CUSTOMER*\n\n`;
        searchResults.slice(0, 5).forEach((c, index) => {
          message += `${index + 1}. ${c.name || 'Tanpa nama'} (${c.phone})\n`;
        });
        message += `\n💡 Gunakan nama lengkap atau nomor HP untuk hasil spesifik.`;
        
        await safeSend(remoteJid, { text: formatBillingMessage(message) });
        return;
      } else if (searchResults.length === 1) {
        customer = searchResults[0];
        cleanPhone = customer.phone;
      }
    }
    
    // Tentukan sumber status device
    const deviceSource = (getSetting('billing_device_source', 'genieacs') || 'genieacs').toLowerCase();
    let deviceActive = false;
    if (deviceSource === 'mikrotik') {
      try {
        // Cek PPPoE aktif berdasarkan pppoe_username atau fallback nomor HP
        const username = (customer && customer.pppoe_username) ? customer.pppoe_username : cleanPhone;
        const res = await mikrotik.getActivePPPoEConnections();
        if (res && res.success && Array.isArray(res.data)) {
          deviceActive = res.data.some(c => String(c.name).toLowerCase() === String(username).toLowerCase());
        }
      } catch (e) {
        deviceActive = false;
      }
    } else {
      // Default: cek GenieACS (kompatibel lama)
      try {
        const device = await findDeviceByTag(cleanPhone);
        deviceActive = !!device;
      } catch (e) {
        deviceActive = false;
      }
    }
    
    // Get billing data
    const billingData = billing.getBillingDataForCustomer(cleanPhone);
    
    if (!billingData || !billingData.customer) {
      await safeSend(remoteJid, { 
        text: formatBillingMessage(`📋 *INFORMASI BILLING*\n\n👤 Nomor: ${cleanPhone}\n❌ Belum terdaftar di sistem billing.\n\n💡 Gunakan perintah *tetapkan* untuk mendaftarkan paket.`) 
      });
      return;
    }
    
    customer = billingData.customer;
    const invoices = billingData.invoices || [];
    const unpaidInvoices = invoices.filter(inv => inv.status === 'unpaid');
    const unpaidTotal = unpaidInvoices.reduce((sum, inv) => sum + parseFloat(inv.amount), 0);
    
    let message = `📋 *INFORMASI BILLING*\n\n`;
    message += `👤 *Pelanggan:* ${customer.name || 'Belum diisi'}\n`;
    message += `📱 *No. HP:* ${customer.phone}\n`;
    message += `📦 *Paket:* ${customer.package_name || 'Belum ada paket'}\n`;
    message += `🖥️ *Status Device:* ${deviceActive ? 'Aktif' : 'Tidak Aktif'}\n`;
    
    if (customer.package_price) {
      message += `💰 *Harga:* ${formatCurrency(customer.package_price)}\n`;
    }
    
    message += `📊 *Status Bayar:* `;
    if (customer.payment_status === 'paid') {
      message += `✅ Lunas\n`;
    } else if (customer.payment_status === 'unpaid') {
      message += `⏳ Belum Lunas\n`;
    } else if (customer.payment_status === 'overdue') {
      message += `⚠️ Terlambat\n`;
    } else {
      message += `➖ Belum Ada Tagihan\n`;
    }
    
    message += `\n📄 *RINGKASAN TAGIHAN*\n`;
    message += `📊 Total Tagihan: ${invoices.length}\n`;
    message += `✅ Lunas: ${invoices.filter(inv => inv.status === 'paid').length}\n`;
    message += `⏳ Belum Lunas: ${unpaidInvoices.length}\n`;
    
    if (unpaidTotal > 0) {
      message += `\n💸 *TOTAL BELUM LUNAS:* ${formatCurrency(unpaidTotal)}\n`;
    }
    
    if (unpaidInvoices.length > 0) {
      message += `\n📋 *TAGIHAN BELUM LUNAS:*\n`;
      unpaidInvoices.forEach(inv => {
        const dueDate = new Date(inv.due_date);
        const isOverdue = dueDate < new Date();
        message += `• ${inv.invoice_number}\n`;
        message += `  💰 ${formatCurrency(inv.amount)}\n`;
        message += `  📅 Jatuh tempo: ${dueDate.toLocaleDateString('id-ID')}`;
        if (isOverdue) {
          message += ` ⚠️ TERLAMBAT`;
        }
        message += `\n\n`;
      });
    }
    
    await safeSend(remoteJid, { text: formatBillingMessage(message) });
    logger.info(`Billing info sent for ${cleanPhone} to ${remoteJid}`);
  } catch (error) {
    logger.error(`Error checking billing: ${error.message}`);
    await safeSend(remoteJid, { 
      text: formatBillingMessage('❌ Terjadi kesalahan saat mengecek billing.') 
    });
  }
}

// Command: Assign package ke customer
async function handleAssignPackageCommand(remoteJid, params) {
  try {
    if (params.length < 2) {
      await safeSend(remoteJid, { 
        text: formatBillingMessage('❌ Format salah. Gunakan: *tetapkan [nomor_hp/nama] [id_paket]*\nContoh: tetapkan 081234567890 PKG001\nContoh: tetapkan "John Doe" PKG001') 
      });
      return;
    }
    
    const [phoneOrName, packageId] = params;
    let customer = null;
    let cleanPhone = null;
    
    // Cek apakah input adalah nomor HP atau nama
    const isPhoneNumber = /^\d+$/.test(phoneOrName.replace(/\D/g, ''));
    
    if (isPhoneNumber) {
      // Normalize phone number
      cleanPhone = phoneOrName.replace(/\D/g, '');
      if (cleanPhone.startsWith('62')) {
        cleanPhone = '0' + cleanPhone.substring(2);
      }
    } else {
      // Cari berdasarkan nama
      customer = billing.getCustomerByName(phoneOrName);
      if (customer) {
        cleanPhone = customer.phone;
      } else {
        // Coba cari multiple matches
        const searchResults = billing.searchCustomers(phoneOrName);
        if (searchResults.length > 1) {
          let message = `🔍 *DITEMUKAN ${searchResults.length} CUSTOMER*\n\n`;
          searchResults.slice(0, 5).forEach((c, index) => {
            message += `${index + 1}. ${c.name || 'Tanpa nama'} (${c.phone})\n`;
          });
          message += `\n💡 Gunakan nama lengkap atau nomor HP untuk hasil spesifik.`;
          
          await safeSend(remoteJid, { text: formatBillingMessage(message) });
          return;
        } else if (searchResults.length === 1) {
          customer = searchResults[0];
          cleanPhone = customer.phone;
        } else {
          await safeSend(remoteJid, { 
            text: formatBillingMessage(`❌ Customer dengan nama "${phoneOrName}" tidak ditemukan.`) 
          });
          return;
        }
      }
    }
    
    // Check if customer exists in GenieACS
    const device = await findDeviceByTag(cleanPhone);
    if (!device) {
      await safeSend(remoteJid, { 
        text: formatBillingMessage(`❌ Nomor ${cleanPhone} tidak ditemukan di sistem GenieACS.`) 
      });
      return;
    }
    
    // Check if package exists
    const package = billing.getPackageById(packageId);
    if (!package) {
      await safeSend(remoteJid, { 
        text: formatBillingMessage(`❌ Paket ${packageId} tidak ditemukan.\n\n💡 Gunakan perintah *paket* untuk melihat daftar paket.`) 
      });
      return;
    }
    
    // Assign package
    customer = billing.assignPackageToCustomer(cleanPhone, packageId);
    
    if (customer) {
      let message = `✅ *PAKET BERHASIL DITETAPKAN*\n\n`;
      message += `👤 *Pelanggan:* ${cleanPhone}\n`;
      message += `📦 *Paket:* ${package.name}\n`;
      message += `🚀 *Kecepatan:* ${package.speed}\n`;
      message += `💰 *Harga:* ${formatCurrency(package.price)}\n\n`;
      message += `📝 Paket telah ditetapkan untuk pelanggan.\n`;
      message += `💡 Gunakan perintah *buattagihan* untuk membuat tagihan.`;
      
      await safeSend(remoteJid, { text: formatBillingMessage(message) });
      logger.info(`Package ${packageId} assigned to ${cleanPhone} by ${remoteJid}`);
    } else {
      await safeSend(remoteJid, { 
        text: formatBillingMessage('❌ Gagal menetapkan paket. Silakan coba lagi.') 
      });
    }
  } catch (error) {
    logger.error(`Error assigning package: ${error.message}`);
    await safeSend(remoteJid, { 
      text: formatBillingMessage('❌ Terjadi kesalahan saat menetapkan paket.') 
    });
  }
}

// Command: Create invoice
async function handleCreateInvoiceCommand(remoteJid, params) {
  try {
    if (params.length < 1) {
      await safeSend(remoteJid, { 
        text: formatBillingMessage('❌ Format salah. Gunakan: *buattagihan [nomor_hp/nama]*\nContoh: buattagihan 081234567890\nContoh: buattagihan John Doe') 
      });
      return;
    }
    
    const phoneOrName = params[0];
    let customer = null;
    let cleanPhone = null;
    
    // Cek apakah input adalah nomor HP atau nama
    const isPhoneNumber = /^\d+$/.test(phoneOrName.replace(/\D/g, ''));
    
    if (isPhoneNumber) {
      cleanPhone = phoneOrName.replace(/\D/g, '');
      if (cleanPhone.startsWith('62')) {
        cleanPhone = '0' + cleanPhone.substring(2);
      }
      customer = billing.getCustomerByPhone(cleanPhone);
    } else {
      // Cari berdasarkan nama
      customer = billing.getCustomerByName(phoneOrName);
      if (customer) {
        cleanPhone = customer.phone;
      } else {
        // Coba cari multiple matches
        const searchResults = billing.searchCustomers(phoneOrName);
        if (searchResults.length > 1) {
          let message = `🔍 *DITEMUKAN ${searchResults.length} CUSTOMER*\n\n`;
          searchResults.slice(0, 5).forEach((c, index) => {
            message += `${index + 1}. ${c.name || 'Tanpa nama'} (${c.phone})\n`;
          });
          message += `\n💡 Gunakan nama lengkap atau nomor HP untuk hasil spesifik.`;
          
          await safeSend(remoteJid, { text: formatBillingMessage(message) });
          return;
        } else if (searchResults.length === 1) {
          customer = searchResults[0];
          cleanPhone = customer.phone;
        } else {
          await safeSend(remoteJid, { 
            text: formatBillingMessage(`❌ Customer dengan nama "${phoneOrName}" tidak ditemukan.`) 
          });
          return;
        }
      }
    }
    
    // Get customer data
    if (!customer || !customer.package_id) {
      await safeSend(remoteJid, { 
        text: formatBillingMessage(`❌ Pelanggan ${cleanPhone} belum memiliki paket.\n\n💡 Gunakan perintah *tetapkan* terlebih dahulu.`) 
      });
      return;
    }
    
    // Create invoice
    const invoice = billing.createInvoice(cleanPhone, customer.package_id, customer.package_price);
    
    if (invoice) {
      let message = `📄 *TAGIHAN BERHASIL DIBUAT*\n\n`;
      message += `📋 *No. Tagihan:* ${invoice.invoice_number}\n`;
      message += `👤 *Pelanggan:* ${customer.name || cleanPhone}\n`;
      message += `📦 *Paket:* ${invoice.package_name}\n`;
      message += `💰 *Jumlah:* ${formatCurrency(invoice.amount)}\n`;
      message += `📅 *Jatuh Tempo:* ${new Date(invoice.due_date).toLocaleDateString('id-ID')}\n`;
      message += `📊 *Status:* Belum Lunas\n\n`;
      message += `✅ Tagihan telah dibuat dan siap untuk dibayar.`;

      await safeSend(remoteJid, { text: formatBillingMessage(message) });

      // Send notification to customer (gunakan template)
      try {
        const customerJid = cleanPhone.replace(/^0/, '62') + '@s.whatsapp.net';
        const tpl = getInvoiceTemplate();
        const customerMessage = renderTemplate(tpl, {
          invoice_number: invoice.invoice_number,
          package_name: invoice.package_name,
          amount: formatCurrency(invoice.amount),
          due_date: new Date(invoice.due_date).toLocaleDateString('id-ID'),
          customer_name: customer.name || cleanPhone,
          customer_phone: cleanPhone,
          payment_accounts: getSetting('payment_accounts', getSetting('payment_numbers', '')),
          footer_info: getSetting('footer_info', '')
        });

        await safeSend(customerJid, { text: formatBillingMessage(customerMessage) });
        logger.info(`Invoice notification sent to customer ${cleanPhone}`);
      } catch (notifError) {
        logger.warn(`Failed to send invoice notification to customer: ${notifError.message}`);
      }

      logger.info(`Invoice ${invoice.invoice_number} created for ${cleanPhone} by ${remoteJid}`);
    } else {
      await safeSend(remoteJid, { 
        text: formatBillingMessage('❌ Gagal membuat tagihan. Silakan coba lagi.') 
      });
    }
  } catch (error) {
    logger.error(`Error creating invoice: ${error.message}`);
    await safeSend(remoteJid, { 
      text: formatBillingMessage('❌ Terjadi kesalahan saat membuat tagihan.') 
    });
  }
}

// Command: Mark invoice as paid
async function handlePaymentCommand(remoteJid, invoiceId) {
  try {
    // Jika input bukan pola ID invoice, perlakukan sebagai nama/nomor customer dan lunasi semua tagihan UNPAID
    const isInvoiceId = typeof invoiceId === 'string' && /^(INV|inv)[-_]/.test(invoiceId);
    if (!isInvoiceId) {
      const phoneOrName = invoiceId;
      let customer = null;
      let cleanPhone = null;
      const isPhoneNumber = /^\d+$/.test(String(phoneOrName).replace(/\D/g, ''));
      if (isPhoneNumber) {
        cleanPhone = String(phoneOrName).replace(/\D/g, '');
        if (cleanPhone.startsWith('62')) cleanPhone = '0' + cleanPhone.substring(2);
        customer = billing.getCustomerByPhone(cleanPhone);
      } else {
        customer = billing.getCustomerByName(phoneOrName);
        if (customer) cleanPhone = customer.phone;
      }

      if (!customer) {
        await safeSend(remoteJid, { text: formatBillingMessage(`❌ Pelanggan tidak ditemukan: ${phoneOrName}`) });
        return;
      }

      const invoices = billing.getInvoicesByPhone(cleanPhone) || [];
      const unpaid = invoices.filter(i => i.status === 'unpaid');
      if (unpaid.length === 0) {
        await safeSend(remoteJid, { text: formatBillingMessage(`ℹ️ Tidak ada tagihan UNPAID untuk ${customer.name || cleanPhone}.`) });
        return;
      }

      let successCount = 0;
      for (const inv of unpaid) {
        const res = billing.markInvoiceAsPaid(inv.id);
        if (res) successCount++;
      }

      await safeSend(remoteJid, { text: formatBillingMessage(`✅ ${successCount} tagihan ditandai LUNAS untuk ${customer.name || cleanPhone}.`) });
      return;
    }

    const invoice = billing.markInvoiceAsPaid(invoiceId);

    if (invoice) {
      let message = `✅ *PEMBAYARAN BERHASIL DIKONFIRMASI*\n\n`;
      message += `📋 *No. Tagihan:* ${invoice.invoice_number}\n`;
      message += `👤 *Pelanggan:* ${invoice.customer_name || invoice.customer_phone}\n`;
      message += `💰 *Jumlah:* ${formatCurrency(invoice.amount)}\n`;
      message += `📅 *Dibayar:* ${new Date(invoice.paid_at).toLocaleDateString('id-ID')}\n`;
      message += `📊 *Status:* Lunas\n\n`;
      message += `🎉 Terima kasih atas pembayarannya!`;

      await safeSend(remoteJid, { text: formatBillingMessage(message) });

      // Send notification to customer (gunakan template)
      try {
        const customerJid = invoice.customer_phone.replace(/^0/, '62') + '@s.whatsapp.net';
        const tpl = getPaymentTemplate();
        const customerMessage = renderTemplate(tpl, {
          invoice_number: invoice.invoice_number,
          amount: formatCurrency(invoice.amount),
          paid_at: new Date(invoice.paid_at).toLocaleDateString('id-ID'),
          customer_name: invoice.customer_name || invoice.customer_phone,
          customer_phone: invoice.customer_phone,
          payment_accounts: getSetting('payment_accounts', getSetting('payment_numbers', '')),
          footer_info: getSetting('footer_info', '')
        });

        await safeSend(customerJid, { text: formatBillingMessage(customerMessage) });
        logger.info(`Payment notification sent to customer ${invoice.customer_phone}`);
      } catch (notifError) {
        logger.warn(`Failed to send payment notification to customer: ${notifError.message}`);
      }

      logger.info(`Invoice ${invoiceId} marked as paid by ${remoteJid}`);
    } else {
      await safeSend(remoteJid, { 
        text: formatBillingMessage(`❌ Tagihan ${invoiceId} tidak ditemukan atau sudah lunas.`) 
      });
    }
  } catch (error) {
    logger.error(`Error marking payment: ${error.message}`);
    await safeSend(remoteJid, { 
      text: formatBillingMessage('❌ Terjadi kesalahan saat konfirmasi pembayaran.') 
    });
  }
}

// Get billing help message
function getBillingHelp() {
  return `💰 *PERINTAH BILLING*\n\n` +
    `📦 *paket* - Lihat daftar paket internet\n` +
    `📋 *cekbilling [nomor_hp]* - Cek info billing pelanggan\n` +
    `🔗 *tetapkan [nomor_hp] [id_paket]* - Tetapkan paket ke pelanggan\n` +
    `📄 *buattagihan [nomor_hp]* - Buat tagihan baru\n` +
    `✅ *bayar [id_tagihan]* - Konfirmasi pembayaran\n\n` +
    `📝 *Contoh penggunaan:*\n` +
    `• paket\n` +
    `• cekbilling 081234567890\n` +
    `• tetapkan 081234567890 PKG001\n` +
    `• buattagihan 081234567890\n` +
    `• bayar INV0001`;
}

// Command: Manual isolir customer
async function handleIsolirCommand(remoteJid, params) {
  try {
    if (params.length < 1) {
      await safeSend(remoteJid, { 
        text: formatBillingMessage('❌ Format salah. Gunakan: *isolir [nomor_hp/nama]*\nContoh: isolir 081234567890\nContoh: isolir John Doe') 
      });
      return;
    }
    
    const phoneOrName = params[0];
    let customer = null;
    let cleanPhone = null;
    
    // Cek apakah input adalah nomor HP atau nama  
    const isPhoneNumber = /^\d+$/.test(phoneOrName.replace(/\D/g, ''));
    
    if (isPhoneNumber) {
      cleanPhone = phoneOrName.replace(/\D/g, '');
      if (cleanPhone.startsWith('62')) {
        cleanPhone = '0' + cleanPhone.substring(2);
      }
      customer = billing.getCustomerByPhone(cleanPhone);
    } else {
      customer = billing.getCustomerByName(phoneOrName);
      if (customer) {
        cleanPhone = customer.phone;
      } else {
        const searchResults = billing.searchCustomers(phoneOrName);
        if (searchResults.length > 1) {
          let message = `🔍 *DITEMUKAN ${searchResults.length} CUSTOMER*\n\n`;
          searchResults.slice(0, 5).forEach((c, index) => {
            message += `${index + 1}. ${c.name || 'Tanpa nama'} (${c.phone})\n`;
          });
          message += `\n💡 Gunakan nama lengkap atau nomor HP untuk hasil spesifik.`;
          
          await safeSend(remoteJid, { text: formatBillingMessage(message) });
          return;
        } else if (searchResults.length === 1) {
          customer = searchResults[0];
          cleanPhone = customer.phone;
        }
      }
    }
    
    if (!customer) {
      await safeSend(remoteJid, { 
        text: formatBillingMessage(`❌ Customer tidak ditemukan: ${phoneOrName}`) 
      });
      return;
    }
    
    // Import isolir service
    const isolirService = require('./isolir-service');
    const result = await isolirService.isolirCustomer(cleanPhone);
    
    if (result.success) {
      let message = `🔒 *CUSTOMER BERHASIL DIISOLIR*\n\n`;
      message += `👤 Customer: ${customer.name || customer.phone}\n`;
      message += `📱 Nomor: ${customer.phone}\n`;
      message += `⚙️  Username: ${customer.username || 'N/A'}\n`;
      message += `📦 Paket: ${customer.package_name || 'N/A'}\n\n`;
      message += `✅ ${result.message}`;
      
      await safeSend(remoteJid, { text: formatBillingMessage(message) });
    } else {
      await safeSend(remoteJid, { 
        text: formatBillingMessage(`❌ Gagal isolir customer: ${result.message}`) 
      });
    }
    
  } catch (error) {
    logger.error(`Error isolir command: ${error.message}`);
    await safeSend(remoteJid, { 
      text: formatBillingMessage('❌ Terjadi kesalahan saat melakukan isolir.') 
    });
  }
}

// Command: Manual unisolir customer
async function handleUnisolirCommand(remoteJid, params) {
  try {
    if (params.length < 1) {
      await safeSend(remoteJid, { 
        text: formatBillingMessage('❌ Format salah. Gunakan: *unisolir [nomor_hp/nama] [profile]*\nContoh: unisolir 081234567890\nContoh: unisolir John Doe premium') 
      });
      return;
    }
    
    const phoneOrName = params[0];
    const newProfile = params[1] || null; // Optional profile parameter
    let customer = null;
    let cleanPhone = null;
    
    // Cek apakah input adalah nomor HP atau nama
    const isPhoneNumber = /^\d+$/.test(phoneOrName.replace(/\D/g, ''));
    
    if (isPhoneNumber) {
      cleanPhone = phoneOrName.replace(/\D/g, '');
      if (cleanPhone.startsWith('62')) {
        cleanPhone = '0' + cleanPhone.substring(2);
      }
      customer = billing.getCustomerByPhone(cleanPhone);
    } else {
      customer = billing.getCustomerByName(phoneOrName);
      if (customer) {
        cleanPhone = customer.phone;
      } else {
        const searchResults = billing.searchCustomers(phoneOrName);
        if (searchResults.length > 1) {
          let message = `🔍 *DITEMUKAN ${searchResults.length} CUSTOMER*\n\n`;
          searchResults.slice(0, 5).forEach((c, index) => {
            message += `${index + 1}. ${c.name || 'Tanpa nama'} (${c.phone})\n`;
          });
          message += `\n💡 Gunakan nama lengkap atau nomor HP untuk hasil spesifik.`;
          
          await safeSend(remoteJid, { text: formatBillingMessage(message) });
          return;
        } else if (searchResults.length === 1) {
          customer = searchResults[0];
          cleanPhone = customer.phone;
        }
      }
    }
    
    if (!customer) {
      await safeSend(remoteJid, { 
        text: formatBillingMessage(`❌ Customer tidak ditemukan: ${phoneOrName}`) 
      });
      return;
    }
    
    // Import isolir service
    const isolirService = require('./isolir-service');
    const result = await isolirService.unisolirCustomer(cleanPhone, newProfile);
    
    if (result.success) {
      let message = `🔓 *CUSTOMER BERHASIL DI-UNISOLIR*\n\n`;
      message += `👤 Customer: ${customer.name || customer.phone}\n`;
      message += `📱 Nomor: ${customer.phone}\n`;
      message += `⚙️  Username: ${customer.username || 'N/A'}\n`;
      message += `📦 Paket: ${customer.package_name || 'N/A'}\n\n`;
      message += `✅ ${result.message}`;
      
      await safeSend(remoteJid, { text: formatBillingMessage(message) });
    } else {
      await safeSend(remoteJid, { 
        text: formatBillingMessage(`❌ Gagal unisolir customer: ${result.message}`) 
      });
    }
    
  } catch (error) {
    logger.error(`Error unisolir command: ${error.message}`);
    await safeSend(remoteJid, { 
      text: formatBillingMessage('❌ Terjadi kesalahan saat melakukan unisolir.') 
    });
  }
}

module.exports = {
  setSock,
  handlePackagesCommand,
  handleBillingCheckCommand,
  handleAssignPackageCommand,
  handleCreateInvoiceCommand,
  handlePaymentCommand,
  getBillingHelp,
  handleIsolirCommand,
  handleUnisolirCommand,
  handleListCustomersCommand
};
