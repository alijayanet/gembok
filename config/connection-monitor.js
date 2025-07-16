// Modul monitoring koneksi untuk WhatsApp dan Mikrotik
const { logger } = require('./logger');
const whatsapp = require('./whatsapp');
const mikrotik = require('./mikrotik');

let whatsappMonitorInterval = null;
let mikrotikMonitorInterval = null;
let isRestarting = false;

// Fungsi untuk monitoring koneksi WhatsApp
function startWhatsAppMonitoring() {
    if (whatsappMonitorInterval) {
        clearInterval(whatsappMonitorInterval);
    }

    whatsappMonitorInterval = setInterval(async () => {
        try {
            const status = whatsapp.getWhatsAppStatus();
            
            if (!status.connected && !isRestarting) {
                logger.warn('WhatsApp connection lost, attempting to reconnect...');
                isRestarting = true;
                
                // Coba reconnect WhatsApp
                await whatsapp.connectToWhatsApp();
                
                setTimeout(() => {
                    isRestarting = false;
                }, 10000);
            }
        } catch (error) {
            logger.error('Error in WhatsApp monitoring:', error);
        }
    }, 30000); // Check setiap 30 detik

    logger.info('WhatsApp connection monitoring started');
}

// Fungsi untuk monitoring koneksi Mikrotik
function startMikrotikMonitoring() {
    if (mikrotikMonitorInterval) {
        clearInterval(mikrotikMonitorInterval);
    }

    mikrotikMonitorInterval = setInterval(async () => {
        try {
            // Test koneksi Mikrotik dengan command sederhana
            const connection = await mikrotik.getMikrotikConnection();
            if (!connection) {
                logger.warn('Mikrotik connection lost, attempting to reconnect...');
                
                // Coba reconnect Mikrotik
                await mikrotik.connectToMikrotik();
            }
        } catch (error) {
            logger.error('Error in Mikrotik monitoring:', error);
        }
    }, 60000); // Check setiap 60 detik

    logger.info('Mikrotik connection monitoring started');
}

// Fungsi untuk stop monitoring
function stopMonitoring() {
    if (whatsappMonitorInterval) {
        clearInterval(whatsappMonitorInterval);
        whatsappMonitorInterval = null;
    }
    
    if (mikrotikMonitorInterval) {
        clearInterval(mikrotikMonitorInterval);
        mikrotikMonitorInterval = null;
    }
    
    logger.info('Connection monitoring stopped');
}

// Fungsi untuk mendapatkan status monitoring
function getMonitoringStatus() {
    return {
        whatsappMonitoring: !!whatsappMonitorInterval,
        mikrotikMonitoring: !!mikrotikMonitorInterval,
        isRestarting: isRestarting
    };
}

// Fungsi untuk restart monitoring
function restartMonitoring() {
    stopMonitoring();
    startWhatsAppMonitoring();
    startMikrotikMonitoring();
}

module.exports = {
    startWhatsAppMonitoring,
    startMikrotikMonitoring,
    stopMonitoring,
    getMonitoringStatus,
    restartMonitoring
}; 