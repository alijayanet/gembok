const { getSetting } = require('./settingsManager');
const billing = require('./billing');
const { setPPPoEProfile, addFirewallAddressList, removeFirewallAddressList } = require('./mikrotik');
const { logger } = require('./logger');
const fs = require('fs');
const path = require('path');

let isolirInterval = null;

/**
 * Initialize isolir scheduler
 */
function initializeIsolirService() {
  const enabled = getSetting('billing_auto_isolir', 'false') === 'true';
  
  if (!enabled) {
    logger.info('🚫 Auto-isolir service disabled');
    return;
  }
  
  const intervalHours = parseInt(getSetting('billing_isolir_check_interval', '24'));
  const intervalMs = intervalHours * 60 * 60 * 1000;
  
  logger.info(`🔒 Auto-isolir service enabled - checking every ${intervalHours} hours`);
  
  // Run immediately on startup
  setTimeout(checkAndIsolirCustomers, 5000);
  
  // Schedule recurring checks
  isolirInterval = setInterval(checkAndIsolirCustomers, intervalMs);
}

/**
 * Stop isolir scheduler
 */
function stopIsolirService() {
  if (isolirInterval) {
    clearInterval(isolirInterval);
    isolirInterval = null;
    logger.info('🔒 Auto-isolir service stopped');
  }
}

/**
 * Main function untuk check dan isolir customers
 */
async function checkAndIsolirCustomers() {
  try {
    logger.info('🔍 Checking for overdue customers...');
    
    const graceDays = parseInt(getSetting('billing_isolir_grace_days', '3'));
    const isolirProfile = getSetting('billing_isolir_profile', 'isolir');
    const overdueCustomers = billing.getOverdueCustomers();
    
    let isolatedCount = 0;
    let errors = 0;
    
    for (const customer of overdueCustomers) {
      try {
        // Skip jika belum melewati grace period
        if (customer.days_past_due <= graceDays) {
          continue;
        }
        
        // Skip jika sudah diisolir
        if (customer.isolir_status === 'isolated') {
          continue;
        }
        
        // Skip jika tidak ada pppoe_username dan tidak ada static_ip (tidak bisa diisolir)
        if (!customer.pppoe_username && !customer.static_ip) {
          logger.warn(`⚠️  Customer ${customer.phone} tidak memiliki PPPoE username atau Static IP, skip isolir`);
          continue;
        }
        
        logger.info(`🔒 Isolating customer: ${customer.phone} (${customer.name || 'No name'}) - ${customer.days_past_due} days overdue`);
        
        let isolirResult;
        
        // Isolir berdasarkan tipe koneksi
        if (customer.connection_type === 'static' && customer.static_ip) {
          // Isolir Static IP via Firewall Address List
          isolirResult = await addFirewallAddressList(
            customer.static_ip, 
            'ISOLIR', 
            `Customer ${customer.name || customer.phone} - Isolated for non-payment`
          );
          logger.info(`🔒 Isolating Static IP: ${customer.static_ip}`);
        } else if (customer.pppoe_username) {
          // Isolir PPPoE via Profile Change
          isolirResult = await setPPPoEProfile(customer.pppoe_username, isolirProfile);
          logger.info(`🔒 Isolating PPPoE: ${customer.pppoe_username}`);
        } else {
          isolirResult = { success: false, message: 'Tidak ada method isolir yang tersedia' };
        }
        
        if (isolirResult.success) {
          // Update status di billing
          billing.updateCustomerIsolirStatus(customer.phone, 'isolated');
          isolatedCount++;
          
          logger.info(`✅ Customer ${customer.phone} successfully isolated`);
          
          // Send notification via WhatsApp (opsional)
          await sendIsolirNotification(customer);
          
        } else {
          logger.error(`❌ Failed to isolate ${customer.phone}: ${isolirResult.message}`);
          errors++;
        }
        
      } catch (customerError) {
        logger.error(`❌ Error processing customer ${customer.phone}: ${customerError.message}`);
        errors++;
      }
    }
    
    if (isolatedCount > 0 || errors > 0) {
      logger.info(`🔒 Isolir check completed: ${isolatedCount} isolated, ${errors} errors`);
    } else {
      logger.info('✅ No customers need isolation');
    }
    
    return { isolated: isolatedCount, errors: errors };
    
  } catch (error) {
    logger.error(`❌ Error in isolir check: ${error.message}`);
    return { isolated: 0, errors: 1 };
  }
}

/**
 * Manual isolir single customer (Enhanced untuk PPPoE dan Static IP)
 */
async function isolirCustomer(phone) {
  try {
    const customer = billing.getCustomerByPhone(phone);
    if (!customer) {
      return { success: false, message: 'Customer tidak ditemukan' };
    }
    
    if (!customer.pppoe_username && !customer.static_ip) {
      return { success: false, message: 'Customer tidak memiliki PPPoE username atau Static IP' };
    }
    
    if (customer.isolir_status === 'isolated') {
      return { success: false, message: 'Customer sudah dalam status isolir' };
    }
    
    let result;
    let method = '';
    
    // Isolir berdasarkan tipe koneksi
    if (customer.connection_type === 'static' && customer.static_ip) {
      // Isolir Static IP via Firewall Address List
      result = await addFirewallAddressList(
        customer.static_ip, 
        'ISOLIR', 
        `Customer ${customer.name || customer.phone} - Manual isolir`
      );
      method = `Firewall Address List (IP: ${customer.static_ip})`;
    } else if (customer.pppoe_username) {
      // Isolir PPPoE via Profile Change
      const isolirProfile = getSetting('billing_isolir_profile', 'isolir');
      result = await setPPPoEProfile(customer.pppoe_username, isolirProfile);
      method = `PPPoE Profile (Username: ${customer.pppoe_username})`;
    } else {
      return { success: false, message: 'Tidak ada method isolir yang tersedia' };
    }
    
    if (result.success) {
      billing.updateCustomerIsolirStatus(phone, 'isolated');
      logger.info(`🔒 Manual isolir: ${phone} (${customer.name}) via ${method}`);
      
      await sendIsolirNotification(customer);
      
      return { success: true, message: `Customer berhasil diisolir via ${method}` };
    } else {
      return { success: false, message: result.message };
    }
    
  } catch (error) {
    logger.error(`Error manual isolir ${phone}: ${error.message}`);
    return { success: false, message: error.message };
  }
}

/**
 * Manual unisolir single customer (Enhanced untuk PPPoE dan Static IP)
 */
async function unisolirCustomer(phone, newProfile = null) {
  try {
    const customer = billing.getCustomerByPhone(phone);
    if (!customer) {
      return { success: false, message: 'Customer tidak ditemukan' };
    }
    
    if (!customer.pppoe_username && !customer.static_ip) {
      return { success: false, message: 'Customer tidak memiliki PPPoE username atau Static IP' };
    }
    
    if (customer.isolir_status !== 'isolated') {
      return { success: false, message: 'Customer tidak dalam status isolir' };
    }
    
    let result;
    let method = '';
    
    // Unisolir berdasarkan tipe koneksi
    if (customer.connection_type === 'static' && customer.static_ip) {
      // Unisolir Static IP via Remove dari Firewall Address List
      result = await removeFirewallAddressList(customer.static_ip, 'ISOLIR');
      method = `Firewall Address List (IP: ${customer.static_ip})`;
    } else if (customer.pppoe_username) {
      // Unisolir PPPoE via Profile Restore
      let profileToUse = newProfile;
      if (!profileToUse && customer.package_id) {
        // Ambil profile dari package data
        const package = billing.getPackageById(customer.package_id);
        if (package && package.pppoe_profile) {
          profileToUse = package.pppoe_profile;
        } else if (customer.package_name) {
          // Fallback ke nama package sebagai profile
          profileToUse = customer.package_name.toLowerCase().replace(/\s+/g, '_');
        }
      }
      if (!profileToUse) {
        profileToUse = 'default';
      }
      
      result = await setPPPoEProfile(customer.pppoe_username, profileToUse);
      method = `PPPoE Profile (Username: ${customer.pppoe_username} -> ${profileToUse})`;
    } else {
      return { success: false, message: 'Tidak ada method unisolir yang tersedia' };
    }
    
    if (result.success) {
      billing.updateCustomerIsolirStatus(phone, 'normal');
      logger.info(`🔓 Manual unisolir: ${phone} (${customer.name}) via ${method}`);
      
      await sendUnisolirNotification(customer, method);
      
      return { success: true, message: `Customer berhasil di-unisolir via ${method}` };
    } else {
      return { success: false, message: result.message };
    }
    
  } catch (error) {
    logger.error(`Error manual unisolir ${phone}: ${error.message}`);
    return { success: false, message: error.message };
  }
}

/**
 * Send isolir notification to customer
 */
async function sendIsolirNotification(customer) {
  try {
    // Import sock dari main app jika tersedia
    const { getSock } = require('./whatsapp');
    const sock = getSock();
    
    if (!sock) return;
    // Helper template
    const renderTemplate = (tpl, data) => {
      if (!tpl || typeof tpl !== 'string') return '';
      return tpl.replace(/{{\s*([\w_]+)\s*}}/g, (m, k) => (data[k] ?? ''));
    };
    const formatCurrency = (amount) => `Rp ${parseFloat(amount || 0).toLocaleString('id-ID')}`;

    // Ambil invoice terbaru (prioritas yang belum lunas)
    let invoice = null;
    try {
      const invs = billing.getInvoicesByPhone(customer.phone) || [];
      const unpaid = invs.filter(i => i.status === 'unpaid');
      const latest = (arr) => arr.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
      invoice = unpaid.length > 0 ? latest(unpaid) : latest(invs);
    } catch (e) {
      // ignore
    }

    // Ambil template & settings terkait
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

    // Baca template isolir dari config/wa-templates.json (UI Admin menyimpan di sini)
    let tpl = '';
    try {
      const tplPath = path.join(process.cwd(), 'config', 'wa-templates.json');
      const data = JSON.parse(fs.readFileSync(tplPath, 'utf8')) || {};
      tpl = data.wa_isolir_template || '';
    } catch (e) {
      tpl = '';
    }
    tpl = tpl || isolirTemplateDefault;
    let payment_accounts = getSetting('payment_accounts', '');
    if (!payment_accounts) {
      const rawNums = getSetting('payment_numbers', '') || '';
      if (rawNums) {
        const list = String(rawNums)
          .split(/[,\n]/)
          .map(s => s.trim())
          .filter(Boolean);
        if (list.length) {
          payment_accounts = list.join('\n');
        }
      }
    }
    const footer_info = getSetting('footer_info', 'Hubungi Admin');

    const data = {
      customer_name: customer.name || customer.phone,
      package_name: customer.package_name || '-',
      invoice_number: invoice ? invoice.invoice_number : 'Tagihan tertunggak',
      amount: invoice ? formatCurrency(invoice.amount) : '',
      due_date: invoice && invoice.due_date ? new Date(invoice.due_date).toLocaleDateString('id-ID') : '',
      payment_accounts,
      footer_info
    };

    const customerJid = String(customer.phone).replace(/^0/, '62') + '@s.whatsapp.net';
    const message = renderTemplate(tpl, data);
    await sock.sendMessage(customerJid, { text: message });
    logger.info(`📱 Isolir notification sent to ${customer.phone}`);
    
  } catch (error) {
    logger.error(`Error sending isolir notification: ${error.message}`);
  }
}

/**
 * Send unisolir notification to customer
 */
async function sendUnisolirNotification(customer, profile) {
  try {
    const { getSock } = require('./whatsapp');
    const sock = getSock();
    
    if (!sock) return;
    
    const customerJid = customer.phone.replace(/^0/, '62') + '@s.whatsapp.net';
    const message = `🔓 *LAYANAN DIAKTIFKAN*\n\n` +
      `Yth. ${customer.name || customer.phone},\n\n` +
      `Layanan internet Anda telah diaktifkan kembali.\n\n` +
      `📋 Paket: ${customer.package_name}\n` +
      `⚙️  Profile: ${profile}\n\n` +
      `✅ Terima kasih atas pembayarannya.\n\n` +
      `📞 Info: ${getSetting('footer_info', 'Hubungi Admin')}`;
    
    await sock.sendMessage(customerJid, { text: message });
    logger.info(`📱 Unisolir notification sent to ${customer.phone}`);
    
  } catch (error) {
    logger.error(`Error sending unisolir notification: ${error.message}`);
  }
}

/**
 * Get isolir statistics
 */
function getIsolirStats() {
  try {
    const customers = billing.getAllCustomers();
    const isolatedCount = customers.filter(c => c.isolir_status === 'isolated').length;
    const isolirEnabledCount = customers.filter(c => c.enable_isolir === true).length;
    const overdueCustomers = billing.getOverdueCustomers();
    const graceDays = parseInt(getSetting('billing_isolir_grace_days', '3'));
    const needIsolirCount = overdueCustomers.filter(c => c.days_past_due > graceDays && c.isolir_status !== 'isolated').length;
    
    return {
      total_customers: customers.length,
      isolir_enabled: isolirEnabledCount,
      currently_isolated: isolatedCount,
      overdue: overdueCustomers.length,
      need_isolir: needIsolirCount
    };
  } catch (error) {
    logger.error(`Error getting isolir stats: ${error.message}`);
    return null;
  }
}

module.exports = {
  initializeIsolirService,
  stopIsolirService,
  checkAndIsolirCustomers,
  isolirCustomer,
  unisolirCustomer,
  getIsolirStats
};
