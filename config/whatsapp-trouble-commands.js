const { getSetting } = require('./settingsManager');
const troubleReport = require('./troubleReport');
const logger = require('./logger');

class WhatsAppTroubleCommands {
    constructor(whatsappCore) {
        this.core = whatsappCore;
        this.sock = null;
    }

    // Set socket instance
    setSock(sock) {
        this.sock = sock;
    }

    // Get socket instance
    getSock() {
        return this.sock || this.core.getSock();
    }

    // Helper function untuk mengirim pesan
    async sendMessage(remoteJid, text) {
        const sock = this.getSock();
        if (!sock) {
            console.error('Sock instance not set');
            return false;
        }

        try {
            await sock.sendMessage(remoteJid, { text });
            return true;
        } catch (error) {
            console.error('Error sending message:', error);
            return false;
        }
    }

    // Command: Lihat daftar laporan gangguan
    async handleListTroubleReports(remoteJid) {
        try {
            const reports = troubleReport.getAllTroubleReports();
            
            if (reports.length === 0) {
                await this.sendMessage(remoteJid, 
                    `📋 *DAFTAR LAPORAN GANGGUAN*\n\nTidak ada laporan gangguan saat ini.`
                );
                return;
            }

            // Filter laporan yang masih aktif (belum closed)
            const activeReports = reports.filter(r => r.status !== 'closed');
            
            if (activeReports.length === 0) {
                await this.sendMessage(remoteJid, 
                    `📋 *DAFTAR LAPORAN GANGGUAN*\n\nSemua laporan gangguan telah ditutup.`
                );
                return;
            }

            let message = `📋 *DAFTAR LAPORAN GANGGUAN AKTIF*\n\n`;
            
            activeReports.forEach((report, index) => {
                const statusEmoji = {
                    'open': '🔴',
                    'in_progress': '🟡', 
                    'resolved': '🟢',
                    'closed': '⚫'
                };
                
                const statusText = {
                    'open': 'Dibuka',
                    'in_progress': 'Sedang Ditangani',
                    'resolved': 'Terselesaikan',
                    'closed': 'Ditutup'
                };

                message += `${index + 1}. *ID: ${report.id}*\n`;
                message += `   ${statusEmoji[report.status]} Status: ${statusText[report.status]}\n`;
                message += `   📱 Pelanggan: ${report.phone || 'N/A'}\n`;
                message += `   🔧 Kategori: ${report.category || 'N/A'}\n`;
                message += `   🕒 Waktu: ${new Date(report.createdAt).toLocaleString('id-ID')}\n\n`;
            });

            message += `💡 *Gunakan command berikut:*\n`;
            message += `• *status [id]* - Lihat detail laporan\n`;
            message += `• *update [id] [status] [catatan]* - Update status\n`;
            message += `• *selesai [id] [catatan]* - Selesaikan laporan\n`;
            message += `• *catatan [id] [catatan]* - Tambah catatan`;

            await this.sendMessage(remoteJid, message);
            
        } catch (error) {
            console.error('Error in handleListTroubleReports:', error);
            await this.sendMessage(remoteJid, 
                `❌ *ERROR*\n\nTerjadi kesalahan saat mengambil daftar laporan:\n${error.message}`
            );
        }
    }

    // Command: Lihat detail laporan gangguan
    async handleTroubleReportStatus(remoteJid, reportId) {
        try {
            if (!reportId) {
                await this.sendMessage(remoteJid, 
                    `❌ *FORMAT SALAH*\n\nFormat yang benar:\nstatus [id_laporan]\n\nContoh:\nstatus TR001`
                );
                return;
            }

            const report = troubleReport.getTroubleReportById(reportId);
            
            if (!report) {
                await this.sendMessage(remoteJid, 
                    `❌ *LAPORAN TIDAK DITEMUKAN*\n\nLaporan dengan ID "${reportId}" tidak ditemukan.`
                );
                return;
            }

            const statusEmoji = {
                'open': '🔴',
                'in_progress': '🟡', 
                'resolved': '🟢',
                'closed': '⚫'
            };
            
            const statusText = {
                'open': 'Dibuka',
                'in_progress': 'Sedang Ditangani',
                'resolved': 'Terselesaikan',
                'closed': 'Ditutup'
            };

            let message = `📋 *DETAIL LAPORAN GANGGUAN*\n\n`;
            message += `🆔 *ID Tiket*: ${report.id}\n`;
            message += `📱 *No. HP*: ${report.phone || 'N/A'}\n`;
            message += `👤 *Nama*: ${report.name || 'N/A'}\n`;
            message += `📍 *Lokasi*: ${report.location || 'N/A'}\n`;
            message += `🔧 *Kategori*: ${report.category || 'N/A'}\n`;
            message += `${statusEmoji[report.status]} *Status*: ${statusText[report.status]}\n`;
            message += `🕒 *Dibuat*: ${new Date(report.createdAt).toLocaleString('id-ID')}\n`;
            message += `🕒 *Update*: ${new Date(report.updatedAt).toLocaleString('id-ID')}\n\n`;
            
            message += `💬 *Deskripsi Masalah*:\n${report.description || 'Tidak ada deskripsi'}\n\n`;

            // Tampilkan catatan jika ada
            if (report.notes && report.notes.length > 0) {
                message += `📝 *Catatan Teknisi*:\n`;
                report.notes.forEach((note, index) => {
                    message += `${index + 1}. ${note.content}\n`;
                    message += `   📅 ${new Date(note.timestamp).toLocaleString('id-ID')}\n\n`;
                });
            }

            message += `💡 *Command yang tersedia:*\n`;
            message += `• *update ${report.id} [status] [catatan]* - Update status\n`;
            message += `• *selesai ${report.id} [catatan]* - Selesaikan laporan\n`;
            message += `• *catatan ${report.id} [catatan]* - Tambah catatan`;

            await this.sendMessage(remoteJid, message);
            
        } catch (error) {
            console.error('Error in handleTroubleReportStatus:', error);
            await this.sendMessage(remoteJid, 
                `❌ *ERROR*\n\nTerjadi kesalahan saat mengambil detail laporan:\n${error.message}`
            );
        }
    }

    // Command: Update status laporan gangguan
    async handleUpdateTroubleReport(remoteJid, reportId, newStatus, notes) {
        try {
            if (!reportId || !newStatus) {
                await this.sendMessage(remoteJid, 
                    `❌ *FORMAT SALAH*\n\nFormat yang benar:\nupdate [id] [status] [catatan]\n\nContoh:\nupdate TR001 in_progress Sedang dicek di lokasi`
                );
                return;
            }

            // Validasi status
            const validStatuses = ['open', 'in_progress', 'resolved', 'closed'];
            if (!validStatuses.includes(newStatus)) {
                await this.sendMessage(remoteJid, 
                    `❌ *STATUS TIDAK VALID*\n\nStatus yang valid:\n• open - Dibuka\n• in_progress - Sedang Ditangani\n• resolved - Terselesaikan\n• closed - Ditutup`
                );
                return;
            }

            const report = troubleReport.getTroubleReportById(reportId);
            
            if (!report) {
                await this.sendMessage(remoteJid, 
                    `❌ *LAPORAN TIDAK DITEMUKAN*\n\nLaporan dengan ID "${reportId}" tidak ditemukan.`
                );
                return;
            }

            // Update status laporan
            const updatedReport = troubleReport.updateTroubleReportStatus(reportId, newStatus, notes);
            
            if (!updatedReport) {
                await this.sendMessage(remoteJid, 
                    `❌ *GAGAL UPDATE*\n\nTerjadi kesalahan saat mengupdate status laporan.`
                );
                return;
            }

            const statusText = {
                'open': 'Dibuka',
                'in_progress': 'Sedang Ditangani',
                'resolved': 'Terselesaikan',
                'closed': 'Ditutup'
            };

            let message = `✅ *STATUS BERHASIL DIUPDATE*\n\n`;
            message += `🆔 *ID Tiket*: ${updatedReport.id}\n`;
            message += `📱 *Pelanggan*: ${updatedReport.phone || 'N/A'}\n`;
            message += `📌 *Status Baru*: ${statusText[updatedReport.status]}\n`;
            message += `🕒 *Update Pada*: ${new Date(updatedReport.updatedAt).toLocaleString('id-ID')}\n\n`;

            if (notes) {
                message += `💬 *Catatan Ditambahkan*:\n${notes}\n\n`;
            }

            message += `📣 *Notifikasi otomatis telah dikirim ke:*\n`;
            message += `• Pelanggan (update status)\n`;
            message += `• Admin (monitoring)`;

            await this.sendMessage(remoteJid, message);
            
        } catch (error) {
            console.error('Error in handleUpdateTroubleReport:', error);
            await this.sendMessage(remoteJid, 
                `❌ *ERROR*\n\nTerjadi kesalahan saat mengupdate laporan:\n${error.message}`
            );
        }
    }

    // Command: Selesaikan laporan gangguan (alias untuk resolved)
    async handleResolveTroubleReport(remoteJid, reportId, notes) {
        try {
            if (!reportId) {
                await this.sendMessage(remoteJid, 
                    `❌ *FORMAT SALAH*\n\nFormat yang benar:\nselesai [id] [catatan]\n\nContoh:\nselesai TR001 Masalah sudah diperbaiki, internet sudah normal`
                );
                return;
            }

            // Gunakan command update dengan status resolved
            await this.handleUpdateTroubleReport(remoteJid, reportId, 'resolved', notes);
            
        } catch (error) {
            console.error('Error in handleResolveTroubleReport:', error);
            await this.sendMessage(remoteJid, 
                `❌ *ERROR*\n\nTerjadi kesalahan saat menyelesaikan laporan:\n${error.message}`
            );
        }
    }

    // Command: Tambah catatan tanpa mengubah status
    async handleAddNoteToTroubleReport(remoteJid, reportId, notes) {
        try {
            if (!reportId || !notes) {
                await this.sendMessage(remoteJid, 
                    `❌ *FORMAT SALAH*\n\nFormat yang benar:\ncatatan [id] [catatan]\n\nContoh:\ncatatan TR001 Sudah dicek di lokasi, masalah di kabel`
                );
                return;
            }

            const report = troubleReport.getTroubleReportById(reportId);
            
            if (!report) {
                await this.sendMessage(remoteJid, 
                    `❌ *LAPORAN TIDAK DITEMUKAN*\n\nLaporan dengan ID "${reportId}" tidak ditemukan.`
                );
                return;
            }

            // Update laporan dengan catatan baru tanpa mengubah status
            const updatedReport = troubleReport.updateTroubleReportStatus(reportId, report.status, notes);
            
            if (!updatedReport) {
                await this.sendMessage(remoteJid, 
                    `❌ *GAGAL TAMBAH CATATAN*\n\nTerjadi kesalahan saat menambahkan catatan.`
                );
                return;
            }

            let message = `✅ *CATATAN BERHASIL DITAMBAHKAN*\n\n`;
            message += `🆔 *ID Tiket*: ${updatedReport.id}\n`;
            message += `📱 *Pelanggan*: ${updatedReport.phone || 'N/A'}\n`;
            message += `📌 *Status Saat Ini*: ${updatedReport.status}\n`;
            message += `🕒 *Update Pada*: ${new Date(updatedReport.updatedAt).toLocaleString('id-ID')}\n\n`;
            message += `💬 *Catatan Baru*:\n${notes}\n\n`;
            message += `📣 *Notifikasi otomatis telah dikirim ke:*\n`;
            message += `• Pelanggan (update catatan)\n`;
            message += `• Admin (monitoring)`;

            await this.sendMessage(remoteJid, message);
            
        } catch (error) {
            console.error('Error in handleAddNoteToTroubleReport:', error);
            await this.sendMessage(remoteJid, 
                `❌ *ERROR*\n\nTerjadi kesalahan saat menambahkan catatan:\n${error.message}`
            );
        }
    }

    // Command: Help untuk trouble report
    async handleTroubleReportHelp(remoteJid) {
        const message = `🔧 *BANTUAN COMMAND TROUBLE REPORT*\n\n` +
            `📋 *Command yang tersedia:*\n\n` +
            `• *trouble* - Lihat daftar laporan gangguan aktif\n` +
            `• *status [id]* - Lihat detail laporan gangguan\n` +
            `• *update [id] [status] [catatan]* - Update status laporan\n` +
            `• *selesai [id] [catatan]* - Selesaikan laporan (status: resolved)\n` +
            `• *catatan [id] [catatan]* - Tambah catatan tanpa ubah status\n` +
            `• *help trouble* - Tampilkan bantuan ini\n\n` +
            
            `📌 *Status yang tersedia:*\n` +
            `• open - Dibuka\n` +
            `• in_progress - Sedang Ditangani\n` +
            `• resolved - Terselesaikan\n` +
            `• closed - Ditutup\n\n` +
            
            `💡 *Contoh Penggunaan:*\n` +
            `• trouble\n` +
            `• status TR001\n` +
            `• update TR001 in_progress Sedang dicek di lokasi\n` +
            `• selesai TR001 Masalah sudah diperbaiki\n` +
            `• catatan TR001 Sudah dicek, masalah di kabel\n\n` +
            
            `📣 *Notifikasi Otomatis:*\n` +
            `• Setiap update akan otomatis dikirim ke pelanggan\n` +
            `• Admin akan mendapat notifikasi untuk monitoring\n` +
            `• Status real-time di portal pelanggan`;

        await this.sendMessage(remoteJid, message);
    }
}

module.exports = WhatsAppTroubleCommands;
