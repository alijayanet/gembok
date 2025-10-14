/**
 * WhatsApp Web Version Configuration
 * 
 * File ini digunakan untuk mengatur versi WhatsApp Web yang digunakan oleh Baileys
 * agar konsisten setiap kali aplikasi dijalankan.
 */

const { fetchLatestWaWebVersion } = require('@whiskeysockets/baileys');

/**
 * Fungsi untuk mendapatkan versi WhatsApp Web
 * 
 * @param {string} botName - Nama bot untuk logging
 * @returns {Promise<Array<number>>} - Array versi [major, minor, patch]
 */
async function getWhatsAppWebVersion(botName = 'WhatsApp Bot') {
    try {
        // Coba fetch versi terbaru
        const versionInfo = await fetchLatestWaWebVersion();
        console.log(`📱 [${botName}] Using WA Web v${versionInfo.version.join(".")}, isLatest: ${versionInfo.isLatest}`);
        return versionInfo.version;
    } catch (error) {
        console.warn(`⚠️ [${botName}] Failed to fetch latest version, using fallback:`, error.message);
        // Fallback ke versi yang telah ditentukan
        // Format: [major, minor, patch]
        return [2, 3000, 1025190524]; // Versi fallback yang stabil
    }
}

/**
 * Konfigurasi versi WhatsApp Web yang digunakan
 * 
 * Anda dapat mengganti versi fallback di sini sesuai kebutuhan
 */
const WHATSAPP_WEB_VERSION = {
    // Versi fallback yang digunakan ketika gagal fetch versi terbaru
    FALLBACK_VERSION: [2, 3000, 1025190524],
    
    // Fungsi untuk mendapatkan versi
    getVersion: getWhatsAppWebVersion
};

module.exports = WHATSAPP_WEB_VERSION;