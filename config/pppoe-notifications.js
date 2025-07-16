// pppoe-notifications.js - Module for managing PPPoE login/logout notifications
const fs = require('fs');
const path = require('path');
const { logger } = require('./logger');
const { getMikrotikConnection } = require('./mikrotik');
const { getSetting, setSetting } = require('./settingsManager');

// Default settings
const defaultSettings = {
    enabled: true,
    loginNotifications: true,
    logoutNotifications: true,
    includeOfflineList: true,
    maxOfflineListCount: 20,
    monitorInterval: 60000, // 1 menit
    lastActiveUsers: []
};

// Store the WhatsApp socket instance
let sock = null;
let monitorInterval = null;
let lastActivePPPoE = [];

// Set the WhatsApp socket instance
function setSock(sockInstance) {
    sock = sockInstance;
    logger.info('WhatsApp socket set in pppoe-notifications module');
}

// Fungsi untuk mendapatkan pengaturan notifikasi PPPoE dari settings.json
function getPPPoENotificationSettings() {
    return getSetting('pppoe_notifications', {
        enabled: true,
        loginNotifications: true,
        logoutNotifications: true,
        includeOfflineList: true,
        maxOfflineListCount: 20,
        monitorInterval: 60000
    });
}

// Save settings to settings.json
function saveSettings(settings) {
    try {
        // Update settings.json dengan pengaturan PPPoE notifications
        const settingsPath = path.join(__dirname, '..', 'settings.json');
        const currentSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        
        // Update pppoe_notifications settings
        currentSettings['pppoe_notifications.enabled'] = settings.enabled.toString();
        currentSettings['pppoe_notifications.loginNotifications'] = settings.loginNotifications.toString();
        currentSettings['pppoe_notifications.logoutNotifications'] = settings.logoutNotifications.toString();
        currentSettings['pppoe_notifications.includeOfflineList'] = settings.includeOfflineList.toString();
        currentSettings['pppoe_notifications.maxOfflineListCount'] = settings.maxOfflineListCount.toString();
        currentSettings['pppoe_notifications.monitorInterval'] = settings.monitorInterval.toString();
        
        fs.writeFileSync(settingsPath, JSON.stringify(currentSettings, null, 2));
        logger.info('PPPoE notification settings saved to settings.json');
        return true;
    } catch (error) {
        logger.error(`Error saving PPPoE notification settings: ${error.message}`);
        return false;
    }
}

// Get current settings
function getSettings() {
    return getPPPoENotificationSettings();
}

// Update settings
function updateSettings(newSettings) {
    const currentSettings = getPPPoENotificationSettings();
    const updatedSettings = { ...currentSettings, ...newSettings };
    return setSetting('pppoe_notifications', updatedSettings);
}

// Enable/disable notifications
function setNotificationStatus(enabled) {
    return updateSettings({ enabled });
}

// Enable/disable login notifications
function setLoginNotifications(enabled) {
    return updateSettings({ loginNotifications: enabled });
}

// Enable/disable logout notifications
function setLogoutNotifications(enabled) {
    return updateSettings({ logoutNotifications: enabled });
}

// Get admin numbers from settings.json
function getAdminNumbers() {
    try {
        const settingsPath = path.join(__dirname, '..', 'settings.json');
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        
        // Cari admin numbers dengan format admins.0, admins.1, dst
        const adminNumbers = [];
        let index = 0;
        while (settings[`admins.${index}`]) {
            adminNumbers.push(settings[`admins.${index}`]);
            index++;
        }
        
        // Jika tidak ada format admins.0, coba cari array admins
        if (adminNumbers.length === 0 && settings.admins) {
            return settings.admins;
        }
        
        return adminNumbers;
    } catch (error) {
        logger.error(`Error getting admin numbers: ${error.message}`);
        return [];
    }
}

// Get technician numbers from settings.json
function getTechnicianNumbers() {
    try {
        const settingsPath = path.join(__dirname, '..', 'settings.json');
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        
        // Cari technician numbers dengan format technician_numbers.0, technician_numbers.1, dst
        const technicianNumbers = [];
        let index = 0;
        while (settings[`technician_numbers.${index}`]) {
            technicianNumbers.push(settings[`technician_numbers.${index}`]);
            index++;
        }
        
        // Jika tidak ada format technician_numbers.0, coba cari array technician_numbers
        if (technicianNumbers.length === 0 && settings.technician_numbers) {
            return settings.technician_numbers;
        }
        
        return technicianNumbers;
    } catch (error) {
        logger.error(`Error getting technician numbers: ${error.message}`);
        return [];
    }
}

// Add admin number to settings.json
function addAdminNumber(number) {
    try {
        const settingsPath = path.join(__dirname, '..', 'settings.json');
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        
        if (!settings.admins) {
            settings.admins = [];
        }
        
        if (!settings.admins.includes(number)) {
            settings.admins.push(number);
            fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
            logger.info(`Admin number added to settings.json: ${number}`);
            return true;
        }
        return true; // Already exists
    } catch (error) {
        logger.error(`Error adding admin number: ${error.message}`);
        return false;
    }
}

// Add technician number to settings.json
function addTechnicianNumber(number) {
    try {
        const settingsPath = path.join(__dirname, '..', 'settings.json');
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        
        if (!settings.technician_numbers) {
            settings.technician_numbers = [];
        }
        
        if (!settings.technician_numbers.includes(number)) {
            settings.technician_numbers.push(number);
            fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
            logger.info(`Technician number added to settings.json: ${number}`);
            return true;
        }
        return true; // Already exists
    } catch (error) {
        logger.error(`Error adding technician number: ${error.message}`);
        return false;
    }
}

// Remove admin number from settings.json
function removeAdminNumber(number) {
    try {
        const settingsPath = path.join(__dirname, '..', 'settings.json');
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        
        if (settings.admins) {
            settings.admins = settings.admins.filter(n => n !== number);
            fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
            logger.info(`Admin number removed from settings.json: ${number}`);
            return true;
        }
        return true;
    } catch (error) {
        logger.error(`Error removing admin number: ${error.message}`);
        return false;
    }
}

// Remove technician number from settings.json
function removeTechnicianNumber(number) {
    try {
        const settingsPath = path.join(__dirname, '..', 'settings.json');
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        
        if (settings.technician_numbers) {
            settings.technician_numbers = settings.technician_numbers.filter(n => n !== number);
            fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
            logger.info(`Technician number removed from settings.json: ${number}`);
            return true;
        }
        return true;
    } catch (error) {
        logger.error(`Error removing technician number: ${error.message}`);
        return false;
    }
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

// Helper function untuk format nomor WhatsApp
function formatWhatsAppNumber(number) {
    // Remove all non-numeric characters
    let cleanNumber = number.replace(/[^0-9]/g, '');

    // Add country code if not present
    if (cleanNumber.startsWith('0')) {
        cleanNumber = '62' + cleanNumber.substring(1); // Indonesia country code
    } else if (!cleanNumber.startsWith('62')) {
        cleanNumber = '62' + cleanNumber;
    }

    return cleanNumber + '@s.whatsapp.net';
}

// Helper function untuk validasi nomor WhatsApp
async function validateWhatsAppNumber(number) {
    try {
        const jid = formatWhatsAppNumber(number);
        const cleanNumber = jid.replace('@s.whatsapp.net', '');

        // Check if number exists on WhatsApp
        const [result] = await sock.onWhatsApp(cleanNumber);
        
        if (!result) {
            logger.warn(`WhatsApp validation failed for ${number}: No result`);
            return false;
        }
        
        if (!result.exists) {
            logger.warn(`WhatsApp number ${number} does not exist`);
            return false;
        }
        
        return true;
    } catch (error) {
        logger.warn(`Error validating WhatsApp number ${number}: ${error.message}`);
        // Return true untuk kasus di mana validasi gagal tapi nomor mungkin valid
        // Ini untuk menghindari blocking pengiriman karena error validasi
        return true;
    }
}

// Send notification to admin and technician numbers
async function sendNotification(message) {
    if (!sock) {
        logger.error('WhatsApp socket not available for PPPoE notifications');
        return false;
    }

    const settings = getPPPoENotificationSettings();
    if (!settings.enabled) {
        logger.info('PPPoE notifications are disabled');
        return false;
    }

    // Check connection before sending
    const isConnected = await checkWhatsAppConnection();
    if (!isConnected) {
        logger.error('WhatsApp connection not available for PPPoE notifications');
        return false;
    }

    const recipients = [...getAdminNumbers(), ...getTechnicianNumbers()];
    const uniqueRecipients = [...new Set(recipients)]; // Remove duplicates

    if (uniqueRecipients.length === 0) {
        logger.warn('No recipients configured for PPPoE notifications');
        return false;
    }

    let successCount = 0;
    let validRecipients = 0;

    for (const number of uniqueRecipients) {
        try {
            // Validate number first
            const isValid = await validateWhatsAppNumber(number);
            if (!isValid) {
                logger.warn(`Skipping invalid WhatsApp number: ${number}`);
                continue;
            }

            validRecipients++;
            const jid = formatWhatsAppNumber(number);

            // Retry mechanism for each recipient with longer timeout
            let sent = false;
            for (let retry = 0; retry < 2; retry++) { // Reduced to 2 retries
                try {
                    // Add timeout to prevent hanging
                    const sendPromise = sock.sendMessage(jid, { text: message });
                    const timeoutPromise = new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Send timeout')), 10000) // 10 second timeout
                    );

                    await Promise.race([sendPromise, timeoutPromise]);
                    sent = true;
                    break;
                } catch (retryError) {
                    logger.warn(`Retry ${retry + 1}/2 failed for ${number}: ${retryError.message}`);
                    if (retry < 1) {
                        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
                    }
                }
            }

            if (sent) {
                successCount++;
                logger.info(`PPPoE notification sent to ${number}`);
            } else {
                logger.error(`Failed to send PPPoE notification to ${number} after 2 retries`);
            }

            // Add delay between recipients to avoid rate limiting
            if (uniqueRecipients.indexOf(number) < uniqueRecipients.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
            }

        } catch (error) {
            logger.error(`Failed to send PPPoE notification to ${number}: ${error.message}`);
        }
    }

    logger.info(`PPPoE notification sent to ${successCount}/${validRecipients} valid recipients (${uniqueRecipients.length} total)`);
    return successCount > 0;
}

// Get active PPPoE connections
async function getActivePPPoEConnections() {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available for PPPoE monitoring');
            return { success: false, data: [] };
        }
        
        const pppConnections = await conn.write('/ppp/active/print');
        return {
            success: true,
            data: pppConnections
        };
    } catch (error) {
        logger.error(`Error getting active PPPoE connections: ${error.message}`);
        return { success: false, data: [] };
    }
}

// Get offline PPPoE users
async function getOfflinePPPoEUsers(activeUsers) {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            return [];
        }
        
        const pppSecrets = await conn.write('/ppp/secret/print');
        const offlineUsers = pppSecrets.filter(secret => !activeUsers.includes(secret.name));
        return offlineUsers.map(user => user.name);
    } catch (error) {
        logger.error(`Error getting offline PPPoE users: ${error.message}`);
        return [];
    }
}

// Format login notification message
function formatLoginMessage(loginUsers, connections, offlineUsers) {
    const settings = getPPPoENotificationSettings();
    let message = `🔔 *PPPoE LOGIN NOTIFICATION*\n\n`;
    
    message += `📊 *User Login (${loginUsers.length}):*\n`;
    loginUsers.forEach((username, index) => {
        const connection = connections.find(c => c.name === username);
        message += `${index + 1}. *${username}*\n`;
        if (connection) {
            message += `   • IP: ${connection.address || 'N/A'}\n`;
            message += `   • Uptime: ${connection.uptime || 'N/A'}\n`;
        }
        message += '\n';
    });
    
    if (settings.includeOfflineList && offlineUsers.length > 0) {
        const maxCount = settings.maxOfflineListCount;
        const displayCount = Math.min(offlineUsers.length, maxCount);
        
        message += `🚫 *User Offline (${offlineUsers.length}):*\n`;
        for (let i = 0; i < displayCount; i++) {
            message += `${i + 1}. ${offlineUsers[i]}\n`;
        }
        
        if (offlineUsers.length > maxCount) {
            message += `... dan ${offlineUsers.length - maxCount} user lainnya\n`;
        }
    }
    
    message += `\n⏰ ${new Date().toLocaleString()}`;
    return message;
}

// Format logout notification message
function formatLogoutMessage(logoutUsers, offlineUsers) {
    const settings = getPPPoENotificationSettings();
    let message = `🚪 *PPPoE LOGOUT NOTIFICATION*\n\n`;
    
    message += `📊 *User Logout (${logoutUsers.length}):*\n`;
    logoutUsers.forEach((username, index) => {
        message += `${index + 1}. *${username}*\n`;
    });
    
    if (settings.includeOfflineList && offlineUsers.length > 0) {
        const maxCount = settings.maxOfflineListCount;
        const displayCount = Math.min(offlineUsers.length, maxCount);
        
        message += `\n🚫 *Total User Offline (${offlineUsers.length}):*\n`;
        for (let i = 0; i < displayCount; i++) {
            message += `${i + 1}. ${offlineUsers[i]}\n`;
        }
        
        if (offlineUsers.length > maxCount) {
            message += `... dan ${offlineUsers.length - maxCount} user lainnya\n`;
        }
    }
    
    message += `\n⏰ ${new Date().toLocaleString()}`;
    return message;
}

module.exports = {
    setSock,
    getPPPoENotificationSettings,
    // Tambahkan alias agar kompatibel:
    getSettings: getPPPoENotificationSettings,
    setNotificationStatus,
    setLoginNotifications,
    setLogoutNotifications,
    getAdminNumbers,
    getTechnicianNumbers,
    addAdminNumber,
    addTechnicianNumber,
    removeAdminNumber,
    removeTechnicianNumber,
    sendNotification,
    getActivePPPoEConnections,
    getOfflinePPPoEUsers,
    formatLoginMessage,
    formatLogoutMessage
};
