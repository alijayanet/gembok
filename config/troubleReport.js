const fs = require('fs');
const path = require('path');
const { logger } = require('./logger');
const { getSetting } = require('./settingsManager');
const { sendMessage, setSock } = require('./sendMessage');

// Path untuk menyimpan data laporan gangguan
const troubleReportPath = path.join(__dirname, '../logs/trouble_reports.json');

// Memastikan file laporan gangguan ada
function ensureTroubleReportFile() {
  try {
    if (!fs.existsSync(path.dirname(troubleReportPath))) {
      fs.mkdirSync(path.dirname(troubleReportPath), { recursive: true });
    }
    
    if (!fs.existsSync(troubleReportPath)) {
      fs.writeFileSync(troubleReportPath, JSON.stringify([], null, 2), 'utf8');
      logger.info(`File laporan gangguan dibuat: ${troubleReportPath}`);
    }
  } catch (error) {
    logger.error(`Gagal membuat file laporan gangguan: ${error.message}`);
  }
}

// Mendapatkan semua laporan gangguan
function getAllTroubleReports() {
  ensureTroubleReportFile();
  try {
    const data = fs.readFileSync(troubleReportPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    logger.error(`Gagal membaca laporan gangguan: ${error.message}`);
    return [];
  }
}

// Mendapatkan laporan gangguan berdasarkan ID
function getTroubleReportById(id) {
  const reports = getAllTroubleReports();
  return reports.find(report => report.id === id);
}

// Mendapatkan laporan gangguan berdasarkan nomor pelanggan
function getTroubleReportsByPhone(phone) {
  const reports = getAllTroubleReports();
  return reports.filter(report => report.phone === phone);
}

// Membuat laporan gangguan baru
function createTroubleReport(reportData) {
  try {
    const reports = getAllTroubleReports();
    
    // Generate ID unik berdasarkan timestamp dan random string
    const id = `TR${Date.now().toString().slice(-6)}${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
    
    const newReport = {
      id,
      status: 'open', // Status awal: open, in_progress, resolved, closed
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...reportData
    };
    
    reports.push(newReport);
    fs.writeFileSync(troubleReportPath, JSON.stringify(reports, null, 2), 'utf8');
    
    // Kirim notifikasi ke grup teknisi jika auto_ticket diaktifkan
    if (getSetting('trouble_report.auto_ticket', 'true') === 'true') {
      sendNotificationToTechnicians(newReport);
    }
    
    return newReport;
  } catch (error) {
    logger.error(`Gagal membuat laporan gangguan: ${error.message}`);
    return null;
  }
}

// Update status laporan gangguan
function updateTroubleReportStatus(id, status, notes, sendNotification = true) {
  try {
    const reports = getAllTroubleReports();
    const reportIndex = reports.findIndex(report => report.id === id);
    
    if (reportIndex === -1) {
      return null;
    }
    
    reports[reportIndex].status = status;
    reports[reportIndex].updatedAt = new Date().toISOString();
    
    if (notes) {
      if (!reports[reportIndex].notes) {
        reports[reportIndex].notes = [];
      }
      
      const noteEntry = {
        timestamp: new Date().toISOString(),
        content: notes,
        status
      };
      
      // Tambahkan flag notifikasi terkirim jika notifikasi akan dikirim
      if (sendNotification) {
        noteEntry.notificationSent = true;
      }
      
      reports[reportIndex].notes.push(noteEntry);
    }
    
    fs.writeFileSync(troubleReportPath, JSON.stringify(reports, null, 2), 'utf8');
    
    // Kirim notifikasi ke pelanggan tentang update status jika sendNotification true
    if (sendNotification) {
      sendStatusUpdateToCustomer(reports[reportIndex]);
      logger.info(`Notifikasi status laporan ${id} terkirim ke pelanggan`);
    } else {
      logger.info(`Update status laporan ${id} tanpa notifikasi ke pelanggan`);
    }
    
    return reports[reportIndex];
  } catch (error) {
    logger.error(`Gagal mengupdate status laporan gangguan: ${error.message}`);
    return null;
  }
}

// Kirim notifikasi ke grup teknisi
async function sendNotificationToTechnicians(report) {
  try {
    logger.info(`Mencoba mengirim notifikasi laporan gangguan ${report.id} ke teknisi`);
    
    const technicianGroupId = getSetting('technician_group_id', '');
    const companyHeader = getSetting('company_header', 'ALIJAYA DIGITAL NETWORK');
    
    // Format pesan untuk teknisi
    const message = `🚨 *LAPORAN GANGGUAN BARU*

*${companyHeader}*

📝 *ID Tiket*: ${report.id}
👤 *Pelanggan*: ${report.name || 'N/A'}
📱 *No. HP*: ${report.phone || 'N/A'}
📍 *Lokasi*: ${report.location || 'N/A'}
🔧 *Kategori*: ${report.category || 'N/A'}
🕒 *Waktu Laporan*: ${new Date(report.createdAt).toLocaleString('id-ID')}

💬 *Deskripsi Masalah*:
${report.description || 'Tidak ada deskripsi'}

📌 *Status*: ${report.status.toUpperCase()}

⚠️ *PRIORITAS TINGGI* - Silakan segera ditindaklanjuti!`;

    logger.info(`Pesan yang akan dikirim: ${message.substring(0, 100)}...`);
    
    let sentSuccessfully = false;
    
    // Kirim ke grup teknisi jika ada
    if (technicianGroupId && technicianGroupId !== '') {
      try {
        const result = await sendMessage(technicianGroupId, message);
        if (result) {
          logger.info(`✅ Notifikasi laporan gangguan ${report.id} berhasil terkirim ke grup teknisi`);
          sentSuccessfully = true;
        } else {
          logger.error(`❌ Gagal mengirim notifikasi laporan gangguan ${report.id} ke grup teknisi`);
        }
      } catch (error) {
        logger.error(`❌ Error mengirim ke grup teknisi: ${error.message}`);
      }
    } else {
      logger.warn(`⚠️ Technician group ID kosong, skip pengiriman ke grup`);
    }
    
    // Kirim ke nomor teknisi individual
    const { sendTechnicianMessage } = require('./sendMessage');
    try {
      const result = await sendTechnicianMessage(message, 'high');
      if (result) {
        logger.info(`✅ Notifikasi laporan gangguan ${report.id} berhasil terkirim ke nomor teknisi`);
        sentSuccessfully = true;
      } else {
        logger.error(`❌ Gagal mengirim notifikasi laporan gangguan ${report.id} ke nomor teknisi`);
      }
    } catch (error) {
      logger.error(`❌ Error mengirim ke nomor teknisi: ${error.message}`);
      // Jika gagal, coba kirim ke admin sebagai fallback
      try {
        const adminNumber = getSetting('admins.0', '');
        if (adminNumber) {
          const adminResult = await sendMessage(adminNumber, message);
          if (adminResult) {
            logger.info(`✅ Notifikasi laporan gangguan ${report.id} berhasil terkirim ke admin sebagai fallback`);
            sentSuccessfully = true;
          }
        }
      } catch (adminError) {
        logger.error(`❌ Error mengirim ke admin fallback: ${adminError.message}`);
      }
    }
    
    return sentSuccessfully;
  } catch (error) {
    logger.error(`❌ Error mengirim notifikasi ke teknisi: ${error.message}`);
    logger.error(`Stack trace: ${error.stack}`);
    return false;
  }
}

// Kirim notifikasi update status ke pelanggan
async function sendStatusUpdateToCustomer(report) {
  try {
    logger.info(`Mencoba mengirim update status laporan ${report.id} ke pelanggan`);
    
    if (!report.phone) {
      logger.warn(`Tidak dapat mengirim update status: nomor pelanggan tidak ada`);
      return false;
    }
    
    const waJid = report.phone.replace(/^0/, '62') + '@s.whatsapp.net';
    logger.info(`WhatsApp JID pelanggan: ${waJid}`);
    
    const companyHeader = getSetting('company_header', 'ISP Monitor');
    
    // Status dalam bahasa Indonesia
    const statusMap = {
      'open': 'Dibuka',
      'in_progress': 'Sedang Ditangani',
      'resolved': 'Terselesaikan',
      'closed': 'Ditutup'
    };
    
    // Ambil catatan terbaru jika ada
    const latestNote = report.notes && report.notes.length > 0 
      ? report.notes[report.notes.length - 1].content 
      : '';
    
    // Format pesan untuk pelanggan
    let message = `📣 *UPDATE LAPORAN GANGGUAN*
    
*${companyHeader}*

📝 *ID Tiket*: ${report.id}
🕒 *Update Pada*: ${new Date(report.updatedAt).toLocaleString('id-ID')}
📌 *Status Baru*: ${statusMap[report.status] || report.status.toUpperCase()}

${latestNote ? `💬 *Catatan Teknisi*:
${latestNote}

` : ''}`;
    
    // Tambahkan instruksi berdasarkan status
    if (report.status === 'open') {
      message += `Laporan Anda telah diterima dan akan segera ditindaklanjuti oleh tim teknisi kami.`;
    } else if (report.status === 'in_progress') {
      message += `Tim teknisi kami sedang menangani laporan Anda. Mohon kesabarannya.`;
    } else if (report.status === 'resolved') {
      message += `✅ Laporan Anda telah diselesaikan. Jika masalah sudah benar-benar teratasi, silakan tutup laporan ini melalui portal pelanggan.

Jika masalah masih berlanjut, silakan tambahkan komentar pada laporan ini.`;
    } else if (report.status === 'closed') {
      message += `🙏 Terima kasih telah menggunakan layanan kami. Laporan ini telah ditutup.`;
    }
    
    message += `

Jika ada pertanyaan, silakan hubungi kami.`;

    logger.info(`Pesan update status yang akan dikirim: ${message.substring(0, 100)}...`);
    
    // Kirim ke pelanggan
    const result = await sendMessage(waJid, message);
    
    if (result) {
      logger.info(`✅ Update status laporan ${report.id} berhasil terkirim ke pelanggan ${report.phone}`);
      return true;
    } else {
      logger.error(`❌ Gagal mengirim update status laporan ${report.id} ke pelanggan ${report.phone}`);
      return false;
    }
  } catch (error) {
    logger.error(`❌ Error mengirim update status ke pelanggan: ${error.message}`);
    logger.error(`Stack trace: ${error.stack}`);
    return false;
  }
}

// Inisialisasi saat modul dimuat
ensureTroubleReportFile();

// Fungsi untuk set sock instance
function setSockInstance(sockInstance) {
  setSock(sockInstance);
}

module.exports = {
  getAllTroubleReports,
  getTroubleReportById,
  getTroubleReportsByPhone,
  createTroubleReport,
  updateTroubleReportStatus,
  sendNotificationToTechnicians,
  sendStatusUpdateToCustomer,
  setSockInstance
};
