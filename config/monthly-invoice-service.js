const { getSetting } = require('./settingsManager');
const billing = require('./billing');
const { logger } = require('./logger');

let monthlyInvoiceInterval = null;
let isServiceRunning = false;

/**
 * Initialize monthly invoice and reminder services
 */
function initializeMonthlyInvoiceService() {
  const enabled = getSetting('billing_monthly_invoice_enable', 'true') === 'true';
  
  if (!enabled) {
    logger.info('🚫 Monthly invoice service disabled');
    // Walau service bulanan mati, kita tetap boleh mengaktifkan reminder jika diizinkan
  } else {
    logger.info('📅 Monthly invoice service enabled - will run on 1st of each month');
    // Start the service
    startMonthlyInvoiceService();
  }

  // Start daily reminder service (optional)
  const reminderEnabled = getSetting('billing_reminder_enable', 'true') === 'true';
  if (reminderEnabled) {
    startReminderService();
  } else {
    logger.info('🔕 Due/overdue reminder service disabled');
  }
}

/**
 * Start monthly invoice service
 */
function startMonthlyInvoiceService() {
  if (isServiceRunning) {
    logger.info('📅 Monthly invoice service already running');
    return;
  }

  // Helper to parse HH:MM from settings (default 00:00)
  const getRunTimeToday = () => {
    const timeStr = getSetting('billing_monthly_invoice_time', '00:00');
    const [hh, mm] = String(timeStr).split(':').map(v => parseInt(v, 10));
    return { hour: Number.isFinite(hh) ? hh : 0, minute: Number.isFinite(mm) ? mm : 0 };
  };

  const scheduleNextRun = () => {
    const now = new Date();
    const { hour, minute } = getRunTimeToday();

    // Target: tanggal 1 bulan berikutnya pada jam yang ditentukan
    const nextRun = new Date(now.getFullYear(), now.getMonth() + 1, 1, hour, minute, 0, 0);
    const delay = Math.max(0, nextRun.getTime() - now.getTime());

    logger.info(`📅 Next monthly invoice generation: ${nextRun.toLocaleDateString('id-ID')} at ${hour.toString().padStart(2,'0')}:${minute.toString().padStart(2,'0')}`);

    // Clear any previous timer and set a new one-shot timer
    if (monthlyInvoiceInterval) {
      clearTimeout(monthlyInvoiceInterval);
      monthlyInvoiceInterval = null;
    }

    monthlyInvoiceInterval = setTimeout(async () => {
      try {
        await generateMonthlyInvoices();
      } finally {
        // After run, schedule the following month
        scheduleNextRun();
      }
    }, delay);
  };

  scheduleNextRun();
  isServiceRunning = true;
}

/**
 * Stop monthly invoice service
 */
function stopMonthlyInvoiceService() {
  if (monthlyInvoiceInterval) {
    clearInterval(monthlyInvoiceInterval);
    monthlyInvoiceInterval = null;
  }
  isServiceRunning = false;
  logger.info('📅 Monthly invoice service stopped');
}

/**
 * Generate monthly invoices for all active customers
 */
// Simple file lock to avoid parallel runs
const fs = require('fs');
const path = require('path');
const LOCK_PATH = path.join(process.cwd(), 'logs', 'monthly-invoice.lock');

function tryAcquireLock() {
  try {
    // Ensure logs dir exists
    const logsDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
    // Use exclusive flag to fail if exists
    const fd = fs.openSync(LOCK_PATH, 'wx');
    fs.writeFileSync(fd, String(Date.now()));
    fs.closeSync(fd);
    return true;
  } catch {
    return false;
  }
}

function releaseLock() {
  try { fs.unlinkSync(LOCK_PATH); } catch {}
}

async function generateMonthlyInvoices() {
  try {
    logger.info('📅 Starting monthly invoice generation...');

    // Acquire lock
    if (!tryAcquireLock()) {
      logger.warn('⛔ Monthly invoice generation skipped (another run is in progress)');
      return;
    }
    
    const customers = billing.getAllCustomers();
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    
    let generatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
    const sendDelayMs = parseInt(getSetting('wa_send_delay_ms', '1200')); // default 1.2s
    for (const customer of customers) {
      try {
        // Skip if customer doesn't have package or is inactive
        if (!customer.package_id || customer.status !== 'active') {
          skippedCount++;
          continue;
        }
        
        // Check if invoice for this month already exists
        const customerInvoices = billing.getInvoicesByPhone(customer.phone);
        const existingInvoice = customerInvoices.find(inv => {
          const invDate = new Date(inv.created_at);
          return invDate.getMonth() === currentMonth && 
                 invDate.getFullYear() === currentYear;
        });
        
        if (existingInvoice) {
          logger.info(`📄 Invoice already exists for ${customer.phone} (${customer.name}) - ${currentMonth + 1}/${currentYear}`);
          skippedCount++;
          continue;
        }
        
        // Create new monthly invoice
        const invoice = billing.createInvoice(customer.phone, customer.package_id, customer.package_price);
        
        if (invoice) {
          generatedCount++;
          logger.info(`✅ Generated invoice ${invoice.invoice_number} for ${customer.phone} (${customer.name}) - Rp ${customer.package_price.toLocaleString('id-ID')}`);
          
          // Send WhatsApp notification to customer (with delay)
          await sendInvoiceNotification(customer, invoice);
          if (sendDelayMs > 0) {
            await new Promise(r => setTimeout(r, sendDelayMs));
          }
          
        } else {
          errorCount++;
          logger.error(`❌ Failed to generate invoice for ${customer.phone}`);
        }
        
      } catch (customerError) {
        errorCount++;
        logger.error(`❌ Error processing customer ${customer.phone}: ${customerError.message}`);
      }
    }
    
    logger.info(`📅 Monthly invoice generation completed: ${generatedCount} generated, ${skippedCount} skipped, ${errorCount} errors`);
    
    // Send summary to admin
    await sendAdminSummary(generatedCount, skippedCount, errorCount);
    
  } catch (error) {
    logger.error(`❌ Error in monthly invoice generation: ${error.message}`);
  } finally {
    releaseLock();
  }
}

// =========================
// Daily Reminder Service
// =========================
let reminderInterval = null;

function startReminderService() {
  // Baca jam kirim reminder, default 08:00
  const timeStr = getSetting('billing_reminder_time', '08:00');
  const [hh, mm] = String(timeStr).split(':').map(v => parseInt(v, 10));
  const hour = Number.isFinite(hh) ? hh : 8;
  const minute = Number.isFinite(mm) ? mm : 0;

  const scheduleNext = () => {
    const now = new Date();
    let next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
    if (next <= now) {
      next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, hour, minute, 0, 0);
    }
    const delay = Math.max(0, next.getTime() - now.getTime());
    logger.info(`🔔 Next billing reminder schedule: ${next.toLocaleDateString('id-ID')} ${hour.toString().padStart(2,'0')}:${minute.toString().padStart(2,'0')}`);

    if (reminderInterval) {
      clearTimeout(reminderInterval);
      reminderInterval = null;
    }

    reminderInterval = setTimeout(async () => {
      try {
        await runDailyReminders();
      } catch (e) {
        logger.error(`❌ Error running daily reminders: ${e.message}`);
      } finally {
        scheduleNext();
      }
    }, delay);
  };

  scheduleNext();
  logger.info('🔔 Reminder service started');
}

async function runDailyReminders() {
  const daysBefore = parseInt(getSetting('billing_monthly_invoice_reminder_days', '3'));
  const now = new Date();
  const customers = billing.getAllCustomers();
  const { sendMessage } = require('./sendMessage');

  let dueCount = 0;
  let overdueCount = 0;

  for (const customer of customers) {
    try {
      const invoices = billing.getInvoicesByPhone(customer.phone) || [];
      if (invoices.length === 0) continue;

      const unpaid = invoices.filter(inv => inv.status === 'unpaid');
      if (unpaid.length === 0) continue;

      for (const inv of unpaid) {
        const dueDate = new Date(inv.due_date);
        const daysDiff = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));

        // Reminder sebelum jatuh tempo (D-n)
        if (daysDiff === daysBefore) {
          const msg = buildDueReminderMessage(customer, inv, daysBefore);
          await safeSendMessage(sendMessage, customer.phone, msg);
          dueCount++;
        }

        // Reminder overdue (H+)
        if (dueDate < now) {
          const msg = buildOverdueReminderMessage(customer, inv);
          await safeSendMessage(sendMessage, customer.phone, msg);
          overdueCount++;
        }
      }

      // H-1 sebelum isolir_scheduled_date kirim pengingat
      if (customer.enable_isolir && customer.isolir_scheduled_date) {
        try {
          const sched = new Date(customer.isolir_scheduled_date);
          const diffDays = Math.ceil((sched - now) / (1000 * 60 * 60 * 24));
          if (diffDays === 1) {
            const msg = buildIsolirH1Reminder(customer, sched);
            await safeSendMessage(sendMessage, customer.phone, msg);
          }
        } catch {}
      }
    } catch (e) {
      logger.warn(`Reminder loop error for ${customer.phone}: ${e.message}`);
    }
  }

  logger.info(`🔔 Reminders sent: due ${dueCount}, overdue ${overdueCount}`);
}

function buildDueReminderMessage(customer, invoice, daysBefore) {
  const company = getSetting('company_header', 'ISP Monitor');
  const amount = `Rp ${parseFloat(invoice.amount||0).toLocaleString('id-ID')}`;
  const dueDate = new Date(invoice.due_date).toLocaleDateString('id-ID');
  return (
    `📅 *PENGINGAT JATUH TEMPO (${daysBefore} hari lagi)*\n\n` +
    `*${company}*\n\n` +
    `👤 ${customer.name || customer.phone}\n` +
    `📋 No. Tagihan: ${invoice.invoice_number}\n` +
    `💰 Jumlah: ${amount}\n` +
    `📅 Jatuh Tempo: ${dueDate}\n\n` +
    `Mohon melakukan pembayaran sebelum jatuh tempo. Terima kasih.`
  );
}

function buildOverdueReminderMessage(customer, invoice) {
  const company = getSetting('company_header', 'ISP Monitor');
  const amount = `Rp ${parseFloat(invoice.amount||0).toLocaleString('id-ID')}`;
  const dueDate = new Date(invoice.due_date).toLocaleDateString('id-ID');
  const payment_accounts = getSetting('payment_accounts', '');
  return (
    `⚠️ *TAGIHAN TERLAMBAT (OVERDUE)*\n\n` +
    `*${company}*\n\n` +
    `👤 ${customer.name || customer.phone}\n` +
    `📋 No. Tagihan: ${invoice.invoice_number}\n` +
    `💰 Jumlah: ${amount}\n` +
    `📅 Jatuh Tempo: ${dueDate}\n\n` +
    (payment_accounts ? `Pembayaran: \n${payment_accounts}\n\n` : '') +
    `Silakan melakukan pembayaran secepatnya untuk menghindari isolir layanan.`
  );
}

async function safeSendMessage(sendMessage, phone, message) {
  try {
    await sendMessage(phone, message);
  } catch (e) {
    logger.warn(`Failed to send reminder to ${phone}: ${e.message}`);
  }
}

function buildIsolirH1Reminder(customer, schedDate) {
  const company = getSetting('company_header', 'ISP Monitor');
  const when = schedDate.toLocaleDateString('id-ID');
  return (
    `🔔 *PENGINGAT ISOLIR (H-1)*\n\n` +
    `*${company}*\n\n` +
    `👤 ${customer.name || customer.phone}\n` +
    `📅 Jadwal Isolir: ${when}\n\n` +
    `Mohon segera melakukan pelunasan agar layanan tidak diisolir.`
  );
}

/**
 * Send invoice notification to customer via WhatsApp
 */
async function sendInvoiceNotification(customer, invoice) {
  try {
    // Import WhatsApp functions with error handling
    let sock = null;
    try {
      const { getSock } = require('./whatsapp');
      sock = getSock();
    } catch (whatsappError) {
      logger.warn(`📱 WhatsApp module not available: ${whatsappError.message}`);
      return false;
    }
    
    if (!sock) {
      logger.warn(`📱 WhatsApp not connected, cannot send invoice notification to ${customer.phone}`);
      return false;
    }
    
    const customerJid = customer.phone.replace(/^0/, '62') + '@s.whatsapp.net';
    const companyHeader = getSetting('company_header', 'ISP Monitor');
    
    const message = `📄 *TAGIHAN BULANAN BARU*

*${companyHeader}*

👤 *Pelanggan:* ${customer.name || customer.phone}
📦 *Paket:* ${invoice.package_name}
💰 *Jumlah:* Rp ${invoice.amount.toLocaleString('id-ID')}
📅 *Jatuh Tempo:* ${new Date(invoice.due_date).toLocaleDateString('id-ID')}
📋 *No. Tagihan:* ${invoice.invoice_number}

💡 *Cara Pembayaran:*
• Transfer ke rekening yang telah ditentukan
• Konfirmasi pembayaran via WhatsApp admin
• Atau bayar langsung di kantor

⚠️ *Penting:* Pembayaran setelah jatuh tempo akan dikenakan denda dan dapat mengakibatkan isolir layanan.

🙏 Terima kasih atas kepercayaan Anda menggunakan layanan kami.

*${companyHeader}*`;
    
    await sock.sendMessage(customerJid, { text: message });
    logger.info(`📱 Invoice notification sent to customer ${customer.phone}`);
    return true;
    
  } catch (error) {
    logger.error(`❌ Error sending invoice notification to ${customer.phone}: ${error.message}`);
    return false;
  }
}

/**
 * Send summary to admin via WhatsApp
 */
async function sendAdminSummary(generatedCount, skippedCount, errorCount) {
  try {
    // Import WhatsApp functions with error handling
    let sock = null;
    try {
      const { getSock } = require('./whatsapp');
      sock = getSock();
    } catch (whatsappError) {
      logger.warn(`📱 WhatsApp module not available: ${whatsappError.message}`);
      return false;
    }
    
    if (!sock) {
      logger.warn('📱 WhatsApp not connected, cannot send admin summary');
      return false;
    }
    
    // Get admin numbers from settings
    const adminNumbers = getSetting('admin_numbers', '');
    if (!adminNumbers) {
      logger.warn('📱 No admin numbers configured for invoice summary');
      return false;
    }
    
    const adminList = adminNumbers.split(',').map(num => num.trim());
    const companyHeader = getSetting('company_header', 'ISP Monitor');
    
    const message = `📅 *LAPORAN GENERASI INVOICE BULANAN*

*${companyHeader}*

📊 *Ringkasan:*
✅ Berhasil dibuat: ${generatedCount} tagihan
⏭️ Dilewati: ${skippedCount} (sudah ada invoice)
❌ Error: ${errorCount}

📅 *Periode:* ${new Date().toLocaleDateString('id-ID')}
🕐 *Waktu Generate:* ${new Date().toLocaleString('id-ID')}

${generatedCount > 0 ? '📱 Notifikasi telah dikirim ke semua pelanggan.' : ''}
${errorCount > 0 ? '⚠️ Ada beberapa error yang perlu diperiksa.' : ''}

*${companyHeader}*`;
    
    // Send to all admin numbers
    for (const adminNumber of adminList) {
      try {
        const adminJid = adminNumber.replace(/^0/, '62') + '@s.whatsapp.net';
        await sock.sendMessage(adminJid, { text: message });
        logger.info(`📱 Invoice summary sent to admin ${adminNumber}`);
      } catch (adminError) {
        logger.error(`❌ Error sending summary to admin ${adminNumber}: ${adminError.message}`);
      }
    }
    
    return true;
    
  } catch (error) {
    logger.error(`❌ Error sending admin summary: ${error.message}`);
    return false;
  }
}

/**
 * Manual trigger for testing
 */
async function generateMonthlyInvoicesNow() {
  logger.info('📅 Manual monthly invoice generation triggered');
  await generateMonthlyInvoices();
}

/**
 * Get service status
 */
function getServiceStatus() {
  return {
    isRunning: isServiceRunning,
    nextRun: getNextRunTime(),
    enabled: getSetting('billing_monthly_invoice_enable', 'true') === 'true'
  };
}

/**
 * Get next run time
 */
function getNextRunTime() {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return nextMonth;
}

module.exports = {
  initializeMonthlyInvoiceService,
  startMonthlyInvoiceService,
  stopMonthlyInvoiceService,
  generateMonthlyInvoices,
  generateMonthlyInvoicesNow,
  getServiceStatus,
  getNextRunTime
};
