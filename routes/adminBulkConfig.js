const express = require('express');
const router = express.Router();
const { logger } = require('../config/logger');
const { getSetting } = require('../config/settingsManager');
const fs = require('fs');
const path = require('path');

// Import GenieACS functions
const { 
    genieacsApi, 
    getDeviceInfo, 
    setWiFiParameters,
    addTask,
    getTask,
    deleteTask
} = require('../config/genieacs');

// GET: Halaman Bulk Configuration
router.get('/', (req, res) => {
    try {
        res.render('adminBulkConfig', {
            title: 'Bulk Configuration - Konfigurasi Massal ONU',
            success: null,
            error: null
        });
    } catch (error) {
        logger.error('Error rendering bulk config page:', error);
        res.status(500).send('Internal Server Error');
    }
});

// POST: Bulk SSID & Password Change
router.post('/bulk-wifi', async (req, res) => {
    const startTime = Date.now();
    let results = [];
    
    try {
        const { customerNumbers, newSSID, newPassword, operation } = req.body;
        
        if (!customerNumbers || !operation) {
            return res.json({
                success: false,
                message: 'Parameter tidak lengkap'
            });
        }
        
        // Parse customer numbers
        const numbers = customerNumbers.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);
            
        if (numbers.length === 0) {
            return res.json({
                success: false,
                message: 'Tidak ada nomor pelanggan yang valid'
            });
        }
        
        logger.info(`Starting bulk WiFi operation: ${operation} for ${numbers.length} customers`);
        
        // Process each customer
        for (const customerNumber of numbers) {
            try {
                const result = await processBulkWiFiChange(customerNumber, newSSID, newPassword, operation);
                results.push({
                    customerNumber,
                    success: result.success,
                    message: result.message,
                    deviceId: result.deviceId || 'N/A'
                });
                
                // Delay between requests to avoid overwhelming GenieACS
                await new Promise(resolve => setTimeout(resolve, 500));
                
            } catch (error) {
                logger.error(`Error processing customer ${customerNumber}:`, error);
                results.push({
                    customerNumber,
                    success: false,
                    message: error.message || 'Terjadi kesalahan'
                });
            }
        }
        
        const successCount = results.filter(r => r.success).length;
        const failCount = results.length - successCount;
        const executionTime = Date.now() - startTime;
        
        logger.info(`Bulk WiFi operation completed: ${successCount} success, ${failCount} failed in ${executionTime}ms`);
        
        res.json({
            success: successCount > 0,
            message: `Bulk operation selesai: ${successCount} berhasil, ${failCount} gagal`,
            results,
            stats: {
                total: results.length,
                success: successCount,
                failed: failCount,
                executionTime
            }
        });
        
    } catch (error) {
        logger.error('Error in bulk WiFi operation:', error);
        res.json({
            success: false,
            message: 'Terjadi kesalahan dalam operasi bulk: ' + error.message,
            results
        });
    }
});

// POST: Bulk WAN Activation
router.post('/bulk-wan', async (req, res) => {
    const startTime = Date.now();
    let results = [];
    
    try {
        const { customerNumbers, wanConfig } = req.body;
        
        if (!customerNumbers) {
            return res.json({
                success: false,
                message: 'Nomor pelanggan tidak boleh kosong'
            });
        }
        
        // Parse customer numbers
        const numbers = customerNumbers.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);
            
        if (numbers.length === 0) {
            return res.json({
                success: false,
                message: 'Tidak ada nomor pelanggan yang valid'
            });
        }
        
        logger.info(`Starting bulk WAN activation for ${numbers.length} customers`);
        
        // Process each customer
        for (const customerNumber of numbers) {
            try {
                const result = await processBulkWANActivation(customerNumber, wanConfig);
                results.push({
                    customerNumber,
                    success: result.success,
                    message: result.message,
                    deviceId: result.deviceId || 'N/A'
                });
                
                // Delay between requests
                await new Promise(resolve => setTimeout(resolve, 1000));
                
            } catch (error) {
                logger.error(`Error processing WAN activation for ${customerNumber}:`, error);
                results.push({
                    customerNumber,
                    success: false,
                    message: error.message || 'Terjadi kesalahan'
                });
            }
        }
        
        const successCount = results.filter(r => r.success).length;
        const failCount = results.length - successCount;
        const executionTime = Date.now() - startTime;
        
        logger.info(`Bulk WAN activation completed: ${successCount} success, ${failCount} failed in ${executionTime}ms`);
        
        res.json({
            success: successCount > 0,
            message: `Bulk WAN activation selesai: ${successCount} berhasil, ${failCount} gagal`,
            results,
            stats: {
                total: results.length,
                success: successCount,
                failed: failCount,
                executionTime
            }
        });
        
    } catch (error) {
        logger.error('Error in bulk WAN activation:', error);
        res.json({
            success: false,
            message: 'Terjadi kesalahan dalam aktivasi WAN: ' + error.message,
            results
        });
    }
});

// Function: Process bulk WiFi change for single customer
async function processBulkWiFiChange(customerNumber, newSSID, newPassword, operation) {
    try {
        // Get device by customer number
        const deviceInfo = await getDeviceByCustomerNumber(customerNumber);
        
        if (!deviceInfo.success) {
            return {
                success: false,
                message: `Device tidak ditemukan: ${deviceInfo.message}`
            };
        }
        
        const { deviceId, onuType } = deviceInfo;
        logger.info(`Processing ${operation} for customer ${customerNumber}, device ${deviceId}, type ${onuType}`);
        
        // Prepare parameters based on operation
        let parameters = {};
        
        if (operation === 'ssid_only' && newSSID) {
            // Only change SSID
            if (onuType === 'HUAWEI') {
                parameters['InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID'] = newSSID;
                parameters['InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.SSID'] = newSSID + '_5G';
            } else if (onuType === 'ZTE') {
                parameters['InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID'] = newSSID;
                parameters['InternetGatewayDevice.LANDevice.1.WLANConfiguration.6.SSID'] = newSSID + '_5G';
            } else if (onuType === 'FIBERHOME') {
                parameters['InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID'] = newSSID;
                parameters['InternetGatewayDevice.LANDevice.1.WLANConfiguration.7.SSID'] = newSSID + '_5G';
            }
        } else if (operation === 'password_only' && newPassword) {
            // Only change password
            if (onuType === 'HUAWEI') {
                parameters['InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.PreSharedKey'] = newPassword;
                parameters['InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.PreSharedKey.1.PreSharedKey'] = newPassword;
            } else if (onuType === 'ZTE') {
                parameters['InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.PreSharedKey'] = newPassword;
                parameters['InternetGatewayDevice.LANDevice.1.WLANConfiguration.6.PreSharedKey.1.PreSharedKey'] = newPassword;
            } else if (onuType === 'FIBERHOME') {
                parameters['InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.PreSharedKey'] = newPassword;
                parameters['InternetGatewayDevice.LANDevice.1.WLANConfiguration.7.PreSharedKey.1.PreSharedKey'] = newPassword;
            }
        } else if (operation === 'both' && newSSID && newPassword) {
            // Change both SSID and password
            if (onuType === 'HUAWEI') {
                parameters['InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID'] = newSSID;
                parameters['InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.SSID'] = newSSID + '_5G';
                parameters['InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.PreSharedKey'] = newPassword;
                parameters['InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.PreSharedKey.1.PreSharedKey'] = newPassword;
            } else if (onuType === 'ZTE') {
                parameters['InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID'] = newSSID;
                parameters['InternetGatewayDevice.LANDevice.1.WLANConfiguration.6.SSID'] = newSSID + '_5G';
                parameters['InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.PreSharedKey'] = newPassword;
                parameters['InternetGatewayDevice.LANDevice.1.WLANConfiguration.6.PreSharedKey.1.PreSharedKey'] = newPassword;
            } else if (onuType === 'FIBERHOME') {
                parameters['InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID'] = newSSID;
                parameters['InternetGatewayDevice.LANDevice.1.WLANConfiguration.7.SSID'] = newSSID + '_5G';
                parameters['InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.PreSharedKey'] = newPassword;
                parameters['InternetGatewayDevice.LANDevice.1.WLANConfiguration.7.PreSharedKey.1.PreSharedKey'] = newPassword;
            }
        }
        
        if (Object.keys(parameters).length === 0) {
            return {
                success: false,
                message: 'Parameter konfigurasi tidak valid atau ONU type tidak didukung'
            };
        }
        
        // Set parameters via GenieACS
        const setResult = await setWiFiParameters(deviceId, parameters);
        
        if (setResult.success) {
            return {
                success: true,
                message: `${operation} berhasil diubah`,
                deviceId
            };
        } else {
            return {
                success: false,
                message: `Gagal mengubah ${operation}: ${setResult.message}`,
                deviceId
            };
        }
        
    } catch (error) {
        logger.error(`Error in processBulkWiFiChange for ${customerNumber}:`, error);
        return {
            success: false,
            message: error.message || 'Terjadi kesalahan'
        };
    }
}

// Function: Process bulk WAN activation for single customer
async function processBulkWANActivation(customerNumber, wanConfig) {
    try {
        // Get device by customer number
        const deviceInfo = await getDeviceByCustomerNumber(customerNumber);
        
        if (!deviceInfo.success) {
            return {
                success: false,
                message: `Device tidak ditemukan: ${deviceInfo.message}`
            };
        }
        
        const { deviceId, onuType } = deviceInfo;
        logger.info(`Processing WAN activation for customer ${customerNumber}, device ${deviceId}, type ${onuType}`);
        
        // Prepare WAN parameters (khusus untuk FiberHome dan lainnya)
        let parameters = {};
        
        if (onuType === 'FIBERHOME') {
            // FiberHome specific WAN activation
            parameters['InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.Enable'] = '1';
            parameters['InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.ConnectionType'] = 'IP_Routed';
            parameters['InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.AddressingType'] = 'DHCP';
            parameters['InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.DefaultGateway'] = '';
            parameters['InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.DNSServers'] = '8.8.8.8,8.8.4.4';
        } else if (onuType === 'HUAWEI') {
            // Huawei specific WAN activation
            parameters['InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.Enable'] = '1';
            parameters['InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.ConnectionType'] = 'IP_Routed';
        } else if (onuType === 'ZTE') {
            // ZTE specific WAN activation
            parameters['InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.Enable'] = '1';
            parameters['InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.ConnectionType'] = 'IP_Routed';
        }
        
        // Add custom WAN config if provided
        if (wanConfig && wanConfig.connectionType) {
            parameters['InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.ConnectionType'] = wanConfig.connectionType;
        }
        
        if (wanConfig && wanConfig.addressingType) {
            parameters['InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.AddressingType'] = wanConfig.addressingType;
        }
        
        if (Object.keys(parameters).length === 0) {
            return {
                success: false,
                message: 'ONU type tidak didukung atau parameter WAN tidak valid'
            };
        }
        
        // Set WAN parameters via GenieACS
        const setResult = await setWiFiParameters(deviceId, parameters); // Using setWiFiParameters for general parameter setting
        
        if (setResult.success) {
            return {
                success: true,
                message: 'WAN berhasil diaktifkan',
                deviceId
            };
        } else {
            return {
                success: false,
                message: `Gagal mengaktifkan WAN: ${setResult.message}`,
                deviceId
            };
        }
        
    } catch (error) {
        logger.error(`Error in processBulkWANActivation for ${customerNumber}:`, error);
        return {
            success: false,
            message: error.message || 'Terjadi kesalahan'
        };
    }
}

// Helper function: Get device by customer number
async function getDeviceByCustomerNumber(customerNumber) {
    try {
        // Search device by tag (customer number)
        const query = {
            'Tags.CustomerNumber': customerNumber.trim()
        };
        
        const devices = await genieacsApi.getDevices(query);
        
        if (!devices || devices.length === 0) {
            return {
                success: false,
                message: 'Device tidak ditemukan untuk nomor pelanggan ini'
            };
        }
        
        const device = devices[0];
        const deviceId = device._id;
        
        // Detect ONU type
        const deviceInfo = device['DeviceID.ProductClass'] || device['DeviceID.Manufacturer'] || '';
        let onuType = 'UNKNOWN';
        
        if (deviceInfo.includes('HG') || deviceInfo.includes('HUAWEI') || deviceInfo.includes('EG') || deviceInfo.includes('HS')) {
            onuType = 'HUAWEI';
        } else if (deviceInfo.includes('ZXHN') || deviceInfo.includes('ZTE') || deviceInfo.includes('F6')) {
            onuType = 'ZTE';
        } else if (deviceInfo.includes('AN') || deviceInfo.includes('FIBERHOME') || deviceInfo.includes('HG6245')) {
            onuType = 'FIBERHOME';
        }
        
        return {
            success: true,
            deviceId,
            onuType,
            deviceInfo
        };
        
    } catch (error) {
        logger.error('Error getting device by customer number:', error);
        return {
            success: false,
            message: error.message || 'Terjadi kesalahan dalam pencarian device'
        };
    }
}

module.exports = router;