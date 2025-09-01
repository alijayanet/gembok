const { getSetting } = require('./settingsManager');
const billing = require('./billing');
const { logger } = require('./logger');

let monthlyInvoiceInterval = null;
let isServiceRunning = false;

/**
 * Initialize monthly invoice service
 */
function initializeMonthlyInvoiceService() {
  const enabled = getSetting('billing_monthly_invoice_enable', 'true') === 'true';
  
  if (!enabled) {
    logger.info('🚫 Monthly invoice service disabled');
    return;
  }
  
  logger.info('📅 Monthly invoice service enabled - will run on 1st of each month');
  
  // Start the service
  startMonthlyInvoiceService();
}

/**
 * Start monthly invoice service
 */
function startMonthlyInvoiceService() {
  if (isServiceRunning) {
    logger.info('📅 Monthly invoice service already running');
    return;
  }
  
  // Calculate time until next 1st of month
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const timeUntilNextMonth = nextMonth.getTime() - now.getTime();
  
  logger.info(`📅 Next monthly invoice generation: ${nextMonth.toLocaleDateString('id-ID')} at 00:00`);
  
  // Schedule first run
  setTimeout(() => {
    generateMonthlyInvoices();
    
    // Then schedule for every 1st of month at 00:00
    monthlyInvoiceInterval = setInterval(() => {
      generateMonthlyInvoices();
    }, 24 * 60 * 60 * 1000); // 24 hours
  }, timeUntilNextMonth);
  
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
async function generateMonthlyInvoices() {
  try {
    logger.info('📅 Starting monthly invoice generation...');
    
    const customers = billing.getAllCustomers();
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    
    let generatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
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
          
          // Send WhatsApp notification to customer
          await sendInvoiceNotification(customer, invoice);
          
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
  }
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
