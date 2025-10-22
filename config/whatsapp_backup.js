const { Boom } = require('@hapi/boom');
const { default: makeWASocket, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const pino = require('pino');
const { useMultiFileAuthState } = require('@whiskeysockets/baileys');
const WHATSAPP_WEB_VERSION = require('./whatsapp-version');
const loggerModule = require('./logger');

// Update fungsi koneksi WhatsApp dengan penanganan error yang lebih baik
async function connectToWhatsApp() {
    try {
        console.log('Memulai koneksi WhatsApp...');
        
        // Pastikan direktori sesi ada
        const sessionDir = process.env.WHATSAPP_SESSION_PATH || './whatsapp-session';
        if (!fs.existsSync(sessionDir)) {
            try {
                fs.mkdirSync(sessionDir, { recursive: true });
                console.log(`Direktori sesi WhatsApp dibuat: ${sessionDir}`);
            } catch (dirError) {
                console.error(`Error membuat direktori sesi: ${dirError.message}`);
                throw new Error(`Gagal membuat direktori sesi WhatsApp: ${dirError.message}`);
            }
        }
        
        // Gunakan logger dengan level yang dapat dikonfigurasi
        const logLevel = process.env.WHATSAPP_LOG_LEVEL || 'silent';
        const logger = pino({ level: logLevel });
        
        // Buat socket dengan konfigurasi yang lebih baik dan penanganan error
        let authState;
        try {
            authState = await useMultiFileAuthState(sessionDir);
        } catch (authError) {
            console.error(`Error loading WhatsApp auth state: ${authError.message}`);
            throw new Error(`Gagal memuat state autentikasi WhatsApp: ${authError.message}`);
        }
        
        const { state, saveCreds } = authState;
        
        // Dapatkan versi WhatsApp yang akan digunakan
        const whatsappVersion = WHATSAPP_WEB_VERSION.FALLBACK_VERSION;
        
        const sock = makeWASocket({
            auth: state,
            logger,
            browser: ['ALIJAYA DIGITAL NETWORK', 'Chrome', '1.0.0'],
            connectTimeoutMs: 60000,
            qrTimeout: 40000,
            defaultQueryTimeoutMs: 30000, // Timeout untuk query
            retryRequestDelayMs: 1000,
            version: whatsappVersion
        });

        return sock;
    } catch (error) {
        console.error('Error connecting to WhatsApp:', error);
        
        // Coba koneksi ulang setelah interval
        setTimeout(() => {
            connectToWhatsApp();
        }, parseInt(process.env.RECONNECT_INTERVAL) || 5000);
        
        return null;
    }
}

// Export fungsi-fungsi yang diperlukan
module.exports = {
    connectToWhatsApp
};