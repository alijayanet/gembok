// pppoe-commands.js - WhatsApp commands for PPPoE notification management
const { logger } = require('./logger');
const pppoeNotifications = require('./pppoe-notifications');
const pppoeMonitor = require('./pppoe-monitor');

// Store the WhatsApp socket instance
let sock = null;

// Set the WhatsApp socket instance
function setSock(sockInstance) {
    sock = sockInstance;
    logger.info('WhatsApp socket set in pppoe-commands module');
}

// Helper function untuk cek koneksi WhatsApp
async function checkWhatsAppConnection() {
    if (!sock) {
        logger.error('WhatsApp sock instance not set');
        return false;
    }

    try {
        // Cek apakah socket masih terhubung
        if (sock.ws && sock.ws.readyState === sock.ws.OPEN) {
            return true;
        } else {
            logger.warn('WhatsApp connection is not open');
            return false;
        }
    } catch (error) {
        logger.error(`Error checking WhatsApp connection: ${error.message}`);
        return false;
    }
}

// Helper function untuk mengirim pesan dengan retry
async function sendMessageSafely(remoteJid, message, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const isConnected = await checkWhatsAppConnection();
            if (!isConnected) {
                logger.warn(`WhatsApp not connected, attempt ${i + 1}/${retries}`);
                if (i < retries - 1) {
                    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
                    continue;
                } else {
                    throw new Error('WhatsApp connection not available after retries');
                }
            }

            await sock.sendMessage(remoteJid, message);
            return true;
        } catch (error) {
            logger.error(`Error sending message (attempt ${i + 1}/${retries}): ${error.message}`);
            if (i === retries - 1) {
                throw error;
            }
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
        }
    }
    return false;
}

// Handler untuk mengaktifkan notifikasi PPPoE
async function handleEnablePPPoENotifications(remoteJid) {
    if (!sock) {
        logger.error('Sock instance not set');
        return;
    }

    try {
        const success = pppoeNotifications.setNotificationStatus(true);

        if (success) {
            // Start monitoring if not already running
            await pppoeMonitor.startPPPoEMonitoring();

            const message = {
                text: `✅ *NOTIFIKASI PPPoE DIAKTIFKAN*\n\n` +
                      `Notifikasi login/logout PPPoE telah diaktifkan.\n` +
                      `Monitoring PPPoE dimulai.\n\n` +
                      `Gunakan "pppoe status" untuk melihat status lengkap.`
            };

            await sendMessageSafely(remoteJid, message);
            logger.info('PPPoE notifications enabled via WhatsApp command');
        } else {
            const message = {
                text: `❌ *GAGAL MENGAKTIFKAN NOTIFIKASI*\n\n` +
                      `Terjadi kesalahan saat menyimpan pengaturan.`
            };

            await sendMessageSafely(remoteJid, message);
        }
    } catch (error) {
        logger.error(`Error enabling PPPoE notifications: ${error.message}`);

        try {
            const message = {
                text: `❌ *ERROR*\n\nTerjadi kesalahan: ${error.message}\n\n` +
                      `Silakan coba lagi atau restart bot jika masalah berlanjut.`
            };

            await sendMessageSafely(remoteJid, message);
        } catch (sendError) {
            logger.error(`Failed to send error message: ${sendError.message}`);
        }
    }
}

// Handler untuk menonaktifkan notifikasi PPPoE
async function handleDisablePPPoENotifications(remoteJid) {
    if (!sock) {
        logger.error('Sock instance not set');
        return;
    }

    try {
        const success = pppoeNotifications.setNotificationStatus(false);

        if (success) {
            const message = {
                text: `🔕 *NOTIFIKASI PPPoE DINONAKTIFKAN*\n\n` +
                      `Notifikasi login/logout PPPoE telah dinonaktifkan.\n` +
                      `Monitoring tetap berjalan tapi notifikasi tidak dikirim.\n\n` +
                      `Gunakan "pppoe on" untuk mengaktifkan kembali.`
            };

            await sendMessageSafely(remoteJid, message);
            logger.info('PPPoE notifications disabled via WhatsApp command');
        } else {
            const message = {
                text: `❌ *GAGAL MENONAKTIFKAN NOTIFIKASI*\n\n` +
                      `Terjadi kesalahan saat menyimpan pengaturan.`
            };

            await sendMessageSafely(remoteJid, message);
        }
    } catch (error) {
        logger.error(`Error disabling PPPoE notifications: ${error.message}`);

        try {
            const message = {
                text: `❌ *ERROR*\n\nTerjadi kesalahan: ${error.message}\n\n` +
                      `Silakan coba lagi atau restart bot jika masalah berlanjut.`
            };

            await sendMessageSafely(remoteJid, message);
        } catch (sendError) {
            logger.error(`Failed to send error message: ${sendError.message}`);
        }
    }
}

// Handler untuk melihat status notifikasi PPPoE
async function handlePPPoEStatus(remoteJid) {
    if (!sock) {
        logger.error('Sock instance not set');
        return;
    }

    try {
        const status = pppoeMonitor.getMonitoringStatus();
        const settings = pppoeNotifications.getSettings();
        const adminNumbers = pppoeNotifications.getAdminNumbers();
        const technicianNumbers = pppoeNotifications.getTechnicianNumbers();

        let message = `📊 *STATUS NOTIFIKASI PPPoE*\n\n`;

        // Status monitoring
        message += `🔄 *Monitoring:* ${status.isRunning ? '🟢 Berjalan' : '🔴 Berhenti'}\n`;
        message += `🔔 *Notifikasi:* ${status.notificationsEnabled ? '🟢 Aktif' : '🔴 Nonaktif'}\n`;
        message += `📥 *Login Notif:* ${status.loginNotifications ? '🟢 Aktif' : '🔴 Nonaktif'}\n`;
        message += `📤 *Logout Notif:* ${status.logoutNotifications ? '🟢 Aktif' : '🔴 Nonaktif'}\n`;
        message += `⏱️ *Interval:* ${status.interval/1000} detik\n`;
        message += `👥 *Koneksi Aktif:* ${status.activeConnections}\n\n`;

        // Recipients
        message += `📱 *Penerima Notifikasi:*\n`;
        if (adminNumbers.length > 0) {
            message += `• Admin (${adminNumbers.length}): ${adminNumbers.join(', ')}\n`;
        }
        if (technicianNumbers.length > 0) {
            message += `• Teknisi (${technicianNumbers.length}): ${technicianNumbers.join(', ')}\n`;
        }
        if (adminNumbers.length === 0 && technicianNumbers.length === 0) {
            message += `• Belum ada nomor terdaftar\n`;
        }

        message += `\n💡 *Perintah Tersedia:*\n`;
        message += `• pppoe on - Aktifkan notifikasi\n`;
        message += `• pppoe off - Nonaktifkan notifikasi\n`;
        message += `• pppoe addadmin [nomor] - Tambah admin\n`;
        message += `• pppoe addtech [nomor] - Tambah teknisi\n`;
        message += `• pppoe interval [detik] - Ubah interval\n`;
        message += `• pppoe test - Test notifikasi`;

        await sendMessageSafely(remoteJid, { text: message });

    } catch (error) {
        logger.error(`Error getting PPPoE status: ${error.message}`);

        try {
            const errorMessage = {
                text: `❌ *ERROR*\n\nTerjadi kesalahan: ${error.message}\n\n` +
                      `Silakan coba lagi atau restart bot jika masalah berlanjut.`
            };

            await sendMessageSafely(remoteJid, errorMessage);
        } catch (sendError) {
            logger.error(`Failed to send error message: ${sendError.message}`);
        }
    }
}

// Helper function untuk validasi nomor WhatsApp
async function validateWhatsAppNumber(number) {
    try {
        // Format nomor
        let cleanNumber = number.replace(/[^0-9]/g, '');
        if (cleanNumber.startsWith('0')) {
            cleanNumber = '62' + cleanNumber.substring(1);
        } else if (!cleanNumber.startsWith('62')) {
            cleanNumber = '62' + cleanNumber;
        }

        // Check if number exists on WhatsApp
        const [result] = await sock.onWhatsApp(cleanNumber);
        return result && result.exists;
    } catch (error) {
        logger.warn(`Error validating WhatsApp number ${number}: ${error.message}`);
        return true; // Assume valid if validation fails
    }
}

// Handler untuk menambah nomor admin
async function handleAddAdminNumber(remoteJid, phoneNumber) {
    if (!sock) {
        logger.error('Sock instance not set');
        return;
    }

    try {
        // Format nomor telepon
        const formattedNumber = phoneNumber.replace(/[^0-9]/g, '');
        if (formattedNumber.length < 10 || formattedNumber.length > 15) {
            const message = {
                text: `❌ *FORMAT NOMOR SALAH*\n\n` +
                      `Format yang benar:\n` +
                      `pppoe addadmin 081234567890\n\n` +
                      `Nomor harus 10-15 digit.`
            };
            await sendMessageSafely(remoteJid, message);
            return;
        }

        // Validate WhatsApp number
        const isValid = await validateWhatsAppNumber(formattedNumber);
        if (!isValid) {
            const message = {
                text: `❌ *NOMOR TIDAK VALID*\n\n` +
                      `Nomor ${formattedNumber} tidak terdaftar di WhatsApp.\n` +
                      `Pastikan nomor aktif dan terdaftar WhatsApp.`
            };
            await sendMessageSafely(remoteJid, message);
            return;
        }

        const success = pppoeNotifications.addAdminNumber(formattedNumber);

        if (success) {
            const message = {
                text: `✅ *ADMIN DITAMBAHKAN*\n\n` +
                      `Nomor ${formattedNumber} berhasil ditambahkan sebagai admin.\n` +
                      `Nomor ini akan menerima notifikasi PPPoE.\n\n` +
                      `Gunakan "pppoe test" untuk test notifikasi.`
            };
            await sendMessageSafely(remoteJid, message);
            logger.info(`Admin number added: ${formattedNumber}`);
        } else {
            const message = {
                text: `❌ *GAGAL MENAMBAH ADMIN*\n\n` +
                      `Terjadi kesalahan saat menyimpan pengaturan.`
            };
            await sendMessageSafely(remoteJid, message);
        }
    } catch (error) {
        logger.error(`Error adding admin number: ${error.message}`);

        try {
            const message = {
                text: `❌ *ERROR*\n\nTerjadi kesalahan: ${error.message}\n\n` +
                      `Silakan coba lagi atau restart bot jika masalah berlanjut.`
            };
            await sendMessageSafely(remoteJid, message);
        } catch (sendError) {
            logger.error(`Failed to send error message: ${sendError.message}`);
        }
    }
}

// Handler untuk menambah nomor teknisi
async function handleAddTechnicianNumber(remoteJid, phoneNumber) {
    if (!sock) {
        logger.error('Sock instance not set');
        return;
    }

    try {
        // Format nomor telepon
        const formattedNumber = phoneNumber.replace(/[^0-9]/g, '');
        if (formattedNumber.length < 10) {
            await sock.sendMessage(remoteJid, {
                text: `❌ *FORMAT NOMOR SALAH*\n\n` +
                      `Format yang benar:\n` +
                      `pppoe addtech 081234567890`
            });
            return;
        }
        
        const success = pppoeNotifications.addTechnicianNumber(formattedNumber);
        
        if (success) {
            await sock.sendMessage(remoteJid, {
                text: `✅ *TEKNISI DITAMBAHKAN*\n\n` +
                      `Nomor ${formattedNumber} berhasil ditambahkan sebagai teknisi.\n` +
                      `Nomor ini akan menerima notifikasi PPPoE.`
            });
            
            logger.info(`Technician number added: ${formattedNumber}`);
        } else {
            await sock.sendMessage(remoteJid, {
                text: `❌ *GAGAL MENAMBAH TEKNISI*\n\n` +
                      `Terjadi kesalahan saat menyimpan pengaturan.`
            });
        }
    } catch (error) {
        logger.error(`Error adding technician number: ${error.message}`);
        await sock.sendMessage(remoteJid, {
            text: `❌ *ERROR*\n\nTerjadi kesalahan: ${error.message}`
        });
    }
}

// Handler untuk mengubah interval monitoring
async function handleSetInterval(remoteJid, seconds) {
    if (!sock) {
        logger.error('Sock instance not set');
        return;
    }

    try {
        const intervalSeconds = parseInt(seconds);
        if (isNaN(intervalSeconds) || intervalSeconds < 30 || intervalSeconds > 3600) {
            await sock.sendMessage(remoteJid, {
                text: `❌ *INTERVAL TIDAK VALID*\n\n` +
                      `Interval harus antara 30-3600 detik.\n\n` +
                      `Contoh: pppoe interval 60`
            });
            return;
        }
        
        const intervalMs = intervalSeconds * 1000;
        const result = await pppoeMonitor.setMonitoringInterval(intervalMs);
        
        if (result.success) {
            await sock.sendMessage(remoteJid, {
                text: `✅ *INTERVAL DIUBAH*\n\n` +
                      `Interval monitoring PPPoE diubah menjadi ${intervalSeconds} detik.\n` +
                      `Monitoring akan restart dengan interval baru.`
            });
            
            logger.info(`PPPoE monitoring interval changed to ${intervalSeconds} seconds`);
        } else {
            await sock.sendMessage(remoteJid, {
                text: `❌ *GAGAL MENGUBAH INTERVAL*\n\n${result.message}`
            });
        }
    } catch (error) {
        logger.error(`Error setting interval: ${error.message}`);
        await sock.sendMessage(remoteJid, {
            text: `❌ *ERROR*\n\nTerjadi kesalahan: ${error.message}`
        });
    }
}

// Handler untuk test notifikasi
async function handleTestNotification(remoteJid) {
    if (!sock) {
        logger.error('Sock instance not set');
        return;
    }

    try {
        const testMessage = `🧪 *TEST NOTIFIKASI PPPoE*\n\n` +
                           `Ini adalah test notifikasi PPPoE.\n` +
                           `Jika Anda menerima pesan ini, berarti notifikasi berfungsi dengan baik.\n\n` +
                           `⏰ ${new Date().toLocaleString()}`;
        
        const success = await pppoeNotifications.sendNotification(testMessage);
        
        if (success) {
            await sock.sendMessage(remoteJid, {
                text: `✅ *TEST NOTIFIKASI BERHASIL*\n\n` +
                      `Notifikasi test telah dikirim ke semua nomor terdaftar.`
            });
        } else {
            await sock.sendMessage(remoteJid, {
                text: `❌ *TEST NOTIFIKASI GAGAL*\n\n` +
                      `Tidak ada nomor terdaftar atau terjadi kesalahan.`
            });
        }
    } catch (error) {
        logger.error(`Error sending test notification: ${error.message}`);
        await sock.sendMessage(remoteJid, {
            text: `❌ *ERROR*\n\nTerjadi kesalahan: ${error.message}`
        });
    }
}

// Handler untuk menghapus nomor admin
async function handleRemoveAdminNumber(remoteJid, phoneNumber) {
    if (!sock) {
        logger.error('Sock instance not set');
        return;
    }

    try {
        // Format nomor telepon
        const formattedNumber = phoneNumber.replace(/[^0-9]/g, '');
        if (formattedNumber.length < 10) {
            const message = {
                text: `❌ *FORMAT NOMOR SALAH*\n\n` +
                      `Format yang benar:\n` +
                      `pppoe removeadmin 081234567890`
            };
            await sendMessageSafely(remoteJid, message);
            return;
        }

        const success = pppoeNotifications.removeAdminNumber(formattedNumber);

        if (success) {
            const message = {
                text: `✅ *ADMIN DIHAPUS*\n\n` +
                      `Nomor ${formattedNumber} berhasil dihapus dari daftar admin.\n` +
                      `Nomor ini tidak akan menerima notifikasi PPPoE lagi.`
            };
            await sendMessageSafely(remoteJid, message);
            logger.info(`Admin number removed: ${formattedNumber}`);
        } else {
            const message = {
                text: `❌ *GAGAL MENGHAPUS ADMIN*\n\n` +
                      `Terjadi kesalahan saat menyimpan pengaturan.`
            };
            await sendMessageSafely(remoteJid, message);
        }
    } catch (error) {
        logger.error(`Error removing admin number: ${error.message}`);

        try {
            const message = {
                text: `❌ *ERROR*\n\nTerjadi kesalahan: ${error.message}`
            };
            await sendMessageSafely(remoteJid, message);
        } catch (sendError) {
            logger.error(`Failed to send error message: ${sendError.message}`);
        }
    }
}

// Handler untuk menghapus nomor teknisi
async function handleRemoveTechnicianNumber(remoteJid, phoneNumber) {
    if (!sock) {
        logger.error('Sock instance not set');
        return;
    }

    try {
        // Format nomor telepon
        const formattedNumber = phoneNumber.replace(/[^0-9]/g, '');
        if (formattedNumber.length < 10) {
            const message = {
                text: `❌ *FORMAT NOMOR SALAH*\n\n` +
                      `Format yang benar:\n` +
                      `pppoe removetech 081234567890`
            };
            await sendMessageSafely(remoteJid, message);
            return;
        }

        const success = pppoeNotifications.removeTechnicianNumber(formattedNumber);

        if (success) {
            const message = {
                text: `✅ *TEKNISI DIHAPUS*\n\n` +
                      `Nomor ${formattedNumber} berhasil dihapus dari daftar teknisi.\n` +
                      `Nomor ini tidak akan menerima notifikasi PPPoE lagi.`
            };
            await sendMessageSafely(remoteJid, message);
            logger.info(`Technician number removed: ${formattedNumber}`);
        } else {
            const message = {
                text: `❌ *GAGAL MENGHAPUS TEKNISI*\n\n` +
                      `Terjadi kesalahan saat menyimpan pengaturan.`
            };
            await sendMessageSafely(remoteJid, message);
        }
    } catch (error) {
        logger.error(`Error removing technician number: ${error.message}`);

        try {
            const message = {
                text: `❌ *ERROR*\n\nTerjadi kesalahan: ${error.message}`
            };
            await sendMessageSafely(remoteJid, message);
        } catch (sendError) {
            logger.error(`Failed to send error message: ${sendError.message}`);
        }
    }
}

module.exports = {
    setSock,
    handleEnablePPPoENotifications,
    handleDisablePPPoENotifications,
    handlePPPoEStatus,
    handleAddAdminNumber,
    handleAddTechnicianNumber,
    handleRemoveAdminNumber,
    handleRemoveTechnicianNumber,
    handleSetInterval,
    handleTestNotification
};
