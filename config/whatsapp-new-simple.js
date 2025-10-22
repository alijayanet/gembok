const path = require('path');
const fs = require('fs');
const logger = require('./logger');

// Import modul-modul yang sudah dibuat
const WhatsAppCore = require('./whatsapp-core');
const WhatsAppCommands = require('./whatsapp-commands');
const WhatsAppMessageHandlers = require('./whatsapp-message-handlers');

// Inisialisasi modul-modul
const whatsappCore = new WhatsAppCore();
const whatsappCommands = new WhatsAppCommands(whatsappCore);
const messageHandlers = new WhatsAppMessageHandlers(whatsappCore, whatsappCommands);

// Variabel global untuk status WhatsApp
global.whatsappStatus = whatsappCore.getWhatsAppStatus();

// Mock function untuk testing
async function connectToWhatsApp() {
    console.log('Mock: Memulai koneksi WhatsApp...');
    return { success: true, message: 'Mock connection successful' };
}

// Fungsi untuk mendapatkan status WhatsApp
function getWhatsAppStatus() {
    return whatsappCore.getWhatsAppStatus();
}

// Fungsi untuk menghapus sesi WhatsApp
async function deleteWhatsAppSession() {
    try {
        const sessionDir = './whatsapp-session';
        if (fs.existsSync(sessionDir)) {
            const files = fs.readdirSync(sessionDir);
            for (const file of files) {
                fs.unlinkSync(path.join(sessionDir, file));
            }
            console.log(`Menghapus ${files.length} file sesi WhatsApp`);
        }
        
        console.log('Sesi WhatsApp berhasil dihapus');
        
        // Reset status
        whatsappCore.updateStatus({
            connected: false,
            qrCode: null,
            phoneNumber: null,
            connectedSince: null,
            status: 'disconnected'
        });
        
        return { success: true, message: 'Sesi WhatsApp berhasil dihapus' };
    } catch (error) {
        console.error('Error saat menghapus sesi WhatsApp:', error);
        return { success: false, message: error.message };
    }
}

// Export fungsi-fungsi yang diperlukan
module.exports = {
    connectToWhatsApp,
    getWhatsAppStatus,
    deleteWhatsAppSession,
    whatsappCore,
    whatsappCommands,
    messageHandlers
};
