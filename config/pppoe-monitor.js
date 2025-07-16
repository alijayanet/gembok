// pppoe-monitor.js - Enhanced PPPoE monitoring with notification control
const { logger } = require('./logger');
const pppoeNotifications = require('./pppoe-notifications');

let monitorInterval = null;
let lastActivePPPoE = [];
let isMonitoring = false;

// Start PPPoE monitoring
async function startPPPoEMonitoring() {
    try {
        if (isMonitoring) {
            logger.info('PPPoE monitoring is already running');
            return { success: true, message: 'Monitoring sudah berjalan' };
        }

        const settings = pppoeNotifications.getSettings();
        const interval = settings.monitorInterval || 60000; // Default 1 minute

        // Clear any existing interval
        if (monitorInterval) {
            clearInterval(monitorInterval);
        }

        // Start monitoring
        monitorInterval = setInterval(async () => {
            await checkPPPoEChanges();
        }, interval);

        isMonitoring = true;
        logger.info(`PPPoE monitoring started with interval ${interval}ms`);
        
        return { 
            success: true, 
            message: `PPPoE monitoring dimulai dengan interval ${interval/1000} detik` 
        };
    } catch (error) {
        logger.error(`Error starting PPPoE monitoring: ${error.message}`);
        return { 
            success: false, 
            message: `Gagal memulai monitoring: ${error.message}` 
        };
    }
}

// Stop PPPoE monitoring
function stopPPPoEMonitoring() {
    try {
        if (monitorInterval) {
            clearInterval(monitorInterval);
            monitorInterval = null;
        }
        
        isMonitoring = false;
        logger.info('PPPoE monitoring stopped');
        
        return { 
            success: true, 
            message: 'PPPoE monitoring dihentikan' 
        };
    } catch (error) {
        logger.error(`Error stopping PPPoE monitoring: ${error.message}`);
        return { 
            success: false, 
            message: `Gagal menghentikan monitoring: ${error.message}` 
        };
    }
}

// Restart PPPoE monitoring
async function restartPPPoEMonitoring() {
    try {
        stopPPPoEMonitoring();
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
        return await startPPPoEMonitoring();
    } catch (error) {
        logger.error(`Error restarting PPPoE monitoring: ${error.message}`);
        return { 
            success: false, 
            message: `Gagal restart monitoring: ${error.message}` 
        };
    }
}

// Check for PPPoE login/logout changes
async function checkPPPoEChanges() {
    try {
        const settings = pppoeNotifications.getSettings();
        
        // Skip if notifications are disabled
        if (!settings.enabled) {
            return;
        }

        // Get current active connections
        const connectionsResult = await pppoeNotifications.getActivePPPoEConnections();
        if (!connectionsResult.success) {
            logger.warn(`Failed to get PPPoE connections: ${connectionsResult.message || 'Unknown error'}`);
            return;
        }

        const connections = connectionsResult.data;
        const activeNow = connections.map(conn => conn.name);

        // Detect login/logout events
        const loginUsers = activeNow.filter(user => !lastActivePPPoE.includes(user));
        const logoutUsers = lastActivePPPoE.filter(user => !activeNow.includes(user));

        // Handle login notifications
        if (loginUsers.length > 0 && settings.loginNotifications) {
            logger.info(`PPPoE LOGIN detected: ${loginUsers.join(', ')}`);
            
            // Get offline users for the notification
            const offlineUsers = await pppoeNotifications.getOfflinePPPoEUsers(activeNow);
            
            // Format and send login notification
            const message = pppoeNotifications.formatLoginMessage(loginUsers, connections, offlineUsers);
            await pppoeNotifications.sendNotification(message);
        }

        // Handle logout notifications
        if (logoutUsers.length > 0 && settings.logoutNotifications) {
            logger.info(`PPPoE LOGOUT detected: ${logoutUsers.join(', ')}`);
            
            // Get offline users for the notification
            const offlineUsers = await pppoeNotifications.getOfflinePPPoEUsers(activeNow);
            
            // Format and send logout notification
            const message = pppoeNotifications.formatLogoutMessage(logoutUsers, offlineUsers);
            await pppoeNotifications.sendNotification(message);
        }

        // Update last active users
        lastActivePPPoE = activeNow;

        // Log monitoring status
        if (loginUsers.length > 0 || logoutUsers.length > 0) {
            logger.info(`PPPoE monitoring: ${connections.length} active connections, ${loginUsers.length} login, ${logoutUsers.length} logout`);
        }

    } catch (error) {
        logger.error(`Error in PPPoE monitoring check: ${error.message}`);
    }
}

// Get monitoring status
function getMonitoringStatus() {
    const settings = pppoeNotifications.getSettings();
    const adminNumbers = pppoeNotifications.getAdminNumbers();
    const technicianNumbers = pppoeNotifications.getTechnicianNumbers();
    
    return {
        isRunning: isMonitoring,
        notificationsEnabled: settings.enabled,
        loginNotifications: settings.loginNotifications,
        logoutNotifications: settings.logoutNotifications,
        interval: settings.monitorInterval,
        adminNumbers: adminNumbers,
        technicianNumbers: technicianNumbers,
        activeConnections: lastActivePPPoE.length
    };
}

// Set monitoring interval
async function setMonitoringInterval(intervalMs) {
    try {
        const settings = pppoeNotifications.getSettings();
        settings.monitorInterval = intervalMs;
        
        if (pppoeNotifications.saveSettings(settings)) {
            // Restart monitoring with new interval if it's running
            if (isMonitoring) {
                await restartPPPoEMonitoring();
            }
            
            logger.info(`PPPoE monitoring interval updated to ${intervalMs}ms`);
            return { 
                success: true, 
                message: `Interval monitoring diubah menjadi ${intervalMs/1000} detik` 
            };
        } else {
            return { 
                success: false, 
                message: 'Gagal menyimpan pengaturan interval' 
            };
        }
    } catch (error) {
        logger.error(`Error setting monitoring interval: ${error.message}`);
        return { 
            success: false, 
            message: `Gagal mengubah interval: ${error.message}` 
        };
    }
}

// Initialize monitoring on startup
async function initializePPPoEMonitoring() {
    try {
        const settings = pppoeNotifications.getSettings();
        
        // Auto-start monitoring if enabled
        if (settings.enabled) {
            await startPPPoEMonitoring();
            logger.info('PPPoE monitoring auto-started on initialization');
        } else {
            logger.info('PPPoE monitoring disabled in settings');
        }
    } catch (error) {
        logger.error(`Error initializing PPPoE monitoring: ${error.message}`);
    }
}

// Set WhatsApp socket
function setSock(sockInstance) {
    pppoeNotifications.setSock(sockInstance);
}

module.exports = {
    setSock,
    startPPPoEMonitoring,
    stopPPPoEMonitoring,
    restartPPPoEMonitoring,
    getMonitoringStatus,
    setMonitoringInterval,
    initializePPPoEMonitoring,
    checkPPPoEChanges
};
