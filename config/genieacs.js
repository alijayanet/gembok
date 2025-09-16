const axios = require('axios');
const { sendTechnicianMessage } = require('./sendMessage');
const mikrotik = require('./mikrotik');
const { getMikrotikConnection } = require('./mikrotik');
const { getSetting } = require('./settingsManager');

// Cache untuk ONU detection (TTL: 30 menit)
const onuTypeCache = new Map();
const CACHE_TTL = 30 * 60 * 1000; // 30 menit

// Helper untuk membuat axios instance dinamis
function getAxiosInstance() {
    const GENIEACS_URL = getSetting('genieacs_url', 'http://localhost:7557');
    const GENIEACS_USERNAME = getSetting('genieacs_username', 'alijayanet');
    const GENIEACS_PASSWORD = getSetting('genieacs_password', '087828060111');
    return axios.create({
        baseURL: GENIEACS_URL,
        auth: {
            username: GENIEACS_USERNAME,
            password: GENIEACS_PASSWORD
        },
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        }
    });
}

// Helper untuk mendeteksi tipe ONU berdasarkan device info
function detectONUType(device) {
    try {
        const productClass = device?.DeviceID?.ProductClass || 
                           device?.InternetGatewayDevice?.DeviceInfo?.ProductClass?._value || 
                           '';
        const manufacturer = device?.DeviceID?.Manufacturer || 
                            device?.InternetGatewayDevice?.DeviceInfo?.Manufacturer?._value || 
                            '';
        const modelName = device?.InternetGatewayDevice?.DeviceInfo?.ModelName?._value || '';
        const deviceId = device?._id || '';
        
        const deviceInfo = `${manufacturer} ${productClass} ${modelName}`.toLowerCase();
        
        console.log(`Detecting ONU type for device ID: ${deviceId}`);
        console.log(`Device info: ${deviceInfo}`);
        
        // Deteksi berdasarkan device ID pattern (lebih reliable)
        const ztePatterns = [
            'ZXHN',     // ZXHN F477, F660, F670L, F609, F612, F670, F601
            'ZTE',      // ZTE Corporation
            'F477',     // ZTE F477
            'F660',     // ZTE F660
            'F670',     // ZTE F670L, F670
            'F609',     // ZTE F609
            'F612',     // ZTE F612
            'F601',     // ZTE F601
            'F680',     // ZTE F680
            'F668',     // ZTE F668
            'F822',     // ZTE F822
            'ZXONT',    // ZX ONT series
            'GPON-ONU', // Generic GPON ONU yang biasanya ZTE
            'EPON-ONU'  // Generic EPON ONU yang biasanya ZTE
        ];
        
        for (const pattern of ztePatterns) {
            if (deviceId.toUpperCase().includes(pattern)) {
                console.log(`Detected ZTE from device ID pattern: ${pattern}`);
                return 'zte';
            }
        }
        const huaweiPatterns = [
            'HG',       // Huawei HG series
            'EG',       // Huawei EG series  
            'ONT',      // Huawei ONT
            'MA5608T',  // Huawei OLT yang kadang ada di device ID
            'HS8545M',  // Huawei HS8545M
            'HG8240',   // Huawei HG8240 series
            'HG8245',   // Huawei HG8245 series
            'HG8247',   // Huawei HG8247 series
            'EG8145',   // Huawei EG8145 series
            'EG8247'    // Huawei EG8247 series
        ];
        
        for (const pattern of huaweiPatterns) {
            if (deviceId.toUpperCase().includes(pattern)) {
                console.log(`Detected Huawei from device ID pattern: ${pattern}`);
                return 'huawei';
            }
        }
        const fiberhomePatterns = [
            'AN',       // FiberHome AN series  
            'FH',       // FiberHome prefix
            'AN5506',   // FiberHome AN5506 series
            'AN5516',   // FiberHome AN5516 series
            'HG6245N',  // FiberHome rebrand
            'HG6243C'   // FiberHome rebrand
        ];
        
        for (const pattern of fiberhomePatterns) {
            if (deviceId.toUpperCase().includes(pattern)) {
                console.log(`Detected FiberHome from device ID pattern: ${pattern}`);
                return 'fiberhome';
            }
        }
        
        // Deteksi berdasarkan vendor dan model info
        const huaweiInfoPatterns = [
            'huawei',           // Huawei Technologies
            'hg', 'eg',         // HG/EG series
            'hg8240', 'hg8245', 'hg8247',  // Specific models
            'eg8145', 'eg8247', 'eg8240',  // EG models
            'hs8545m',          // HS series
            'ma5608t',          // OLT model
            'smartax'           // Huawei SmartAX series
        ];
        
        for (const pattern of huaweiInfoPatterns) {
            if (deviceInfo.includes(pattern)) {
                console.log(`Detected Huawei from device info pattern: ${pattern}`);
                return 'huawei';
            }
        }
        const zteInfoPatterns = [
            'zte',           // ZTE Corporation
            'zxhn',          // ZXHN series
            'zhongxing',     // Zhongxing Telecommunication (nama lengkap ZTE)
            'f477', 'f660', 'f670', 'f609', 'f612', 'f601',  // Model numbers
            'f680', 'f668', 'f822', 'f663n', 'f650',         // More models
            'zxont',         // ZX ONT series
            'zxa10',         // ZTE ZXA10 series
            'zxv10'          // ZTE ZXV10 series
        ];
        
        for (const pattern of zteInfoPatterns) {
            if (deviceInfo.includes(pattern)) {
                console.log(`Detected ZTE from device info pattern: ${pattern}`);
                return 'zte';
            }
        }
        const fiberhomeInfoPatterns = [
            'fiberhome',        // FiberHome Technologies
            'an',               // AN series
            'an5506', 'an5516', // Specific AN models
            'hg6245n', 'hg6243c',  // Rebrand models
            'wuhan'             // FiberHome adalah perusahaan dari Wuhan
        ];
        
        for (const pattern of fiberhomeInfoPatterns) {
            if (deviceInfo.includes(pattern)) {
                console.log(`Detected FiberHome from device info pattern: ${pattern}`);
                return 'fiberhome';
            }
        }
        if (deviceInfo.includes('nokia') || deviceInfo.includes('alcatel')) {
            console.log('Detected Nokia from device info');
            return 'nokia';
        }
        if (deviceInfo.includes('technicolor') || deviceInfo.includes('thomson')) {
            console.log('Detected Technicolor from device info');
            return 'technicolor';
        }
        
        // Default ke generic jika tidak terdeteksi
        console.log('No specific ONU type detected, using generic');
        return 'generic';
    } catch (error) {
        console.error('Error detecting ONU type:', error);
        return 'generic';
    }
}

// Helper untuk mendapatkan parameter paths berdasarkan tipe ONU
function getParameterPathsForONU(onuType) {
    const pathsByONU = {
        huawei: {
            ssid_2_4g: [
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID",
                "Device.WiFi.SSID.1.SSID"
            ],
            ssid_5g: [
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.SSID",
                "Device.WiFi.SSID.5.SSID"
            ],
            password_2_4g: [
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.PreSharedKey",
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.KeyPassphrase"
            ],
            password_5g: [
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.PreSharedKey.1.PreSharedKey",
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.KeyPassphrase"
            ]
        },
        zte: {
            ssid_2_4g: [
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID",
                "Device.WiFi.SSID.1.SSID"
            ],
            ssid_5g: [
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.SSID",
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.6.SSID",
                "Device.WiFi.SSID.2.SSID"
            ],
            password_2_4g: [
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.PreSharedKey",
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.KeyPassphrase",
                "Device.WiFi.AccessPoint.1.Security.KeyPassphrase"
            ],
            password_5g: [
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.PreSharedKey.1.PreSharedKey",
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.6.PreSharedKey.1.PreSharedKey",
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.KeyPassphrase",
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.6.KeyPassphrase",
                "Device.WiFi.AccessPoint.2.Security.KeyPassphrase"
            ]
        },
        fiberhome: {
            ssid_2_4g: [
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID",
                "Device.WiFi.Radio.1.SSID.1.SSID"
            ],
            ssid_5g: [
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.7.SSID",
                "Device.WiFi.Radio.2.SSID.1.SSID"
            ],
            password_2_4g: [
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.KeyPassphrase",
                "Device.WiFi.SSID.1.KeyPassphrase"
            ],
            password_5g: [
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.7.KeyPassphrase",
                "Device.WiFi.SSID.2.KeyPassphrase"
            ]
        },
        generic: {
            ssid_2_4g: [
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID",
                "Device.WiFi.SSID.1.SSID",
                "InternetGatewayDevice.WANDevice.1.X_Config.WiFi.SSID.1.SSID",
                "Device.WiFi.Radio.1.SSID.1.SSID"
            ],
            ssid_5g: [
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.SSID",
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.6.SSID",
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.7.SSID",
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.8.SSID",
                "Device.WiFi.SSID.2.SSID",
                "Device.WiFi.Radio.2.SSID.1.SSID"
            ],
            password_2_4g: [
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.PreSharedKey",
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.KeyPassphrase",
                "Device.WiFi.AccessPoint.1.Security.KeyPassphrase",
                "Device.WiFi.SSID.1.KeyPassphrase"
            ],
            password_5g: [
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.PreSharedKey.1.PreSharedKey",
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.6.PreSharedKey.1.PreSharedKey",
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.7.PreSharedKey.1.PreSharedKey",
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.8.PreSharedKey.1.PreSharedKey",
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.KeyPassphrase",
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.6.KeyPassphrase",
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.7.KeyPassphrase",
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.8.KeyPassphrase",
                "Device.WiFi.AccessPoint.2.Security.KeyPassphrase",
                "Device.WiFi.SSID.2.KeyPassphrase"
            ]
        }
    };
    
    return pathsByONU[onuType] || pathsByONU.generic;
}

// GenieACS API wrapper
const genieacsApi = {
    async getDevices() {
        try {
            console.log('Getting all devices...');
            const axiosInstance = getAxiosInstance();
            const response = await axiosInstance.get('/devices');
            console.log(`Found ${response.data?.length || 0} devices`);
            return response.data;
        } catch (error) {
            console.error('Error getting devices:', error.response?.data || error.message);
            throw error;
        }
    },

    async findDeviceByPhoneNumber(phoneNumber) {
        try {
            const axiosInstance = getAxiosInstance();
            // Mencari device berdasarkan tag yang berisi nomor telepon
            const response = await axiosInstance.get('/devices', {
                params: {
                    'query': JSON.stringify({
                        '_tags': phoneNumber
                    })
                }
            });

            if (!response.data || response.data.length === 0) {
                throw new Error(`No device found with phone number: ${phoneNumber}`);
            }

            return response.data[0]; // Mengembalikan device pertama yang ditemukan
        } catch (error) {
            console.error(`Error finding device with phone number ${phoneNumber}:`, error.response?.data || error.message);
            throw error;
        }
    },

    async getDeviceByPhoneNumber(phoneNumber) {
        try {
            const device = await this.findDeviceByPhoneNumber(phoneNumber);
            return await this.getDevice(device._id);
        } catch (error) {
            console.error(`Error getting device by phone number ${phoneNumber}:`, error.message);
            throw error;
        }
    },

    async getDevice(deviceId) {
        try {
            const axiosInstance = getAxiosInstance();
            const response = await axiosInstance.get(`/devices/${encodeURIComponent(deviceId)}`);
            return response.data;
        } catch (error) {
            console.error(`Error getting device ${deviceId}:`, error.response?.data || error.message);
            throw error;
        }
    },

    async setParameterValues(deviceId, parameters) {
        try {
            console.log('Setting parameters for device:', deviceId, parameters);
            const axiosInstance = getAxiosInstance();
            
            // OPTIMASI: Cache-based ONU detection
            let onuType = 'generic';
            let parameterPaths = getParameterPathsForONU('generic');
            
            // Check cache first
            const cacheKey = deviceId;
            const cachedResult = onuTypeCache.get(cacheKey);
            
            if (cachedResult && (Date.now() - cachedResult.timestamp) < CACHE_TTL) {
                onuType = cachedResult.onuType;
                parameterPaths = getParameterPathsForONU(onuType);
                console.log(`🚀 Using cached ONU type: ${onuType} (${Math.round((Date.now() - cachedResult.timestamp) / 1000)}s old)`);
            } else {
                try {
                    const device = await genieacsApi.getDevice(deviceId);
                    onuType = detectONUType(device);
                    parameterPaths = getParameterPathsForONU(onuType);
                    
                    // Cache hasil detection
                    onuTypeCache.set(cacheKey, {
                        onuType: onuType,
                        timestamp: Date.now()
                    });
                    
                    console.log(`🔍 Detected and cached ONU type: ${onuType}`);
                } catch (deviceError) {
                    console.warn(`Cannot detect ONU type for ${deviceId}, using generic paths:`, deviceError.message);
                    
                    // Cache generic sebagai fallback
                    onuTypeCache.set(cacheKey, {
                        onuType: 'generic',
                        timestamp: Date.now()
                    });
                }
            }
            
            // Format parameter values untuk GenieACS dengan paths yang optimal per tipe ONU
            const parameterValues = [];
            for (const [path, value] of Object.entries(parameters)) {
                // Handle SSID update - gunakan paths yang spesifik untuk tipe ONU yang terdeteksi
                if (path.includes('SSID')) {
                    // Untuk generic ONU, batasi hanya path utama SSID 1 (2.4G) dan SSID 5 (5G)
                    const ssid24gPaths = (onuType === 'generic')
                        ? [
                            'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID'
                          ]
                        : parameterPaths.ssid_2_4g;

                    const ssid5gPaths = (onuType === 'generic')
                        ? [
                            'InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.SSID'
                          ]
                        : parameterPaths.ssid_5g;

                    // Tambahkan SSID 2.4GHz
                    ssid24gPaths.forEach(ssidPath => {
                        parameterValues.push([ssidPath, value, "xsd:string"]);
                    });
                    
                    // Tambahkan SSID 5GHz dengan suffix -5G
                    const ssid5G = `${value}-5G`;
                    ssid5gPaths.forEach(ssidPath => {
                        parameterValues.push([ssidPath, ssid5G, "xsd:string"]);
                    });
                    
                    console.log(`Added SSID parameters for ${onuType} ONU: 2.4G="${value}", 5G="${ssid5G}"`);
                    console.log(`  - 2.4GHz paths: ${ssid24gPaths.length} parameters`);
                    console.log(`  - 5GHz paths: ${ssid5gPaths.length} parameters`);
                }
                // Handle WiFi password update - gunakan paths yang spesifik untuk tipe ONU yang terdeteksi
                else if (path.includes('Password') || path.includes('KeyPassphrase')) {
                    // Untuk generic ONU, batasi hanya path utama password SSID 1 (2.4G) dan 5 (5G)
                    const pass24gPaths = (onuType === 'generic')
                        ? [
                            'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.KeyPassphrase'
                          ]
                        : parameterPaths.password_2_4g;

                    const pass5gPaths = (onuType === 'generic')
                        ? [
                            'InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.KeyPassphrase'
                          ]
                        : parameterPaths.password_5g;

                    // Tambahkan password 2.4GHz
                    pass24gPaths.forEach(passPath => {
                        parameterValues.push([passPath, value, "xsd:string"]);
                    });
                    
                    // Tambahkan password 5GHz (sama dengan 2.4GHz)
                    pass5gPaths.forEach(passPath => {
                        parameterValues.push([passPath, value, "xsd:string"]);
                    });
                    
                    console.log(`Added password parameters for ${onuType} ONU`);
                    console.log(`  - 2.4GHz password paths: ${pass24gPaths.length} parameters`);
                    console.log(`  - 5GHz password paths: ${pass5gPaths.length} parameters`);
                }
                // Handle other parameters
                else {
                    // Pastikan semua parameter menggunakan format 3-element array dengan tipe data
                    parameterValues.push([path, value, "xsd:string"]);
                }
            }

            console.log(`Formatted parameter values for ${onuType} ONU (${parameterValues.length} parameters):`, parameterValues);

            // OPTIMASI: Kirim task dengan strategi optimized berdasarkan tipe ONU
            let taskResponse;
            const startTime = Date.now();
            
            // Untuk ONU yang terdeteksi spesifik, gunakan fast mode
            if (onuType !== 'generic' && parameterValues.length <= 10) {
                console.log(`🚀 Using fast mode for ${onuType} ONU (${parameterValues.length} parameters)`);
                
                // Split parameters menjadi chunks untuk parallel execution
                const chunkSize = Math.ceil(parameterValues.length / 2);
                const parameterChunks = [];
                for (let i = 0; i < parameterValues.length; i += chunkSize) {
                    parameterChunks.push(parameterValues.slice(i, i + chunkSize));
                }
                
                // Kirim tasks secara paralel
                const taskPromises = parameterChunks.map(async (chunk, index) => {
                    const task = {
                        name: "setParameterValues",
                        parameterValues: chunk
                    };
                    
                    try {
                        return await axiosInstance.post(
                            `/devices/${encodeURIComponent(deviceId)}/tasks?connection_request&timeout=3000`,
                            task
                        );
                    } catch (error) {
                        console.warn(`⚠️  Chunk ${index + 1} failed with connection_request, trying fallback`);
                        return await axiosInstance.post(
                            `/devices/${encodeURIComponent(deviceId)}/tasks`,
                            task
                        );
                    }
                });
                
                const responses = await Promise.all(taskPromises);
                taskResponse = responses[0]; // Use first response as primary
                console.log(`✅ Fast parallel tasks completed for ${onuType} ONU (${responses.length} chunks)`);
                
            } else {
                // Fallback untuk generic atau banyak parameter
                console.log(`📋 Using standard mode for ${onuType} ONU (${parameterValues.length} parameters)`);
                
                const task = {
                    name: "setParameterValues",
                    parameterValues: parameterValues
                };

                try {
                    taskResponse = await axiosInstance.post(
                        `/devices/${encodeURIComponent(deviceId)}/tasks?connection_request&timeout=5000`,
                        task
                    );
                    console.log(`✅ Standard task created successfully for ${onuType} ONU`);
                } catch (taskError) {
                    console.warn(`⚠️  Failed with connection_request, trying fallback:`, taskError.message);
                    
                    taskResponse = await axiosInstance.post(
                        `/devices/${encodeURIComponent(deviceId)}/tasks`,
                        task
                    );
                    console.log(`✅ Fallback task created for ${onuType} ONU`);
                }
            }

            // OPTIMASI: Conditional refresh task berdasarkan mode
            const processingTime = Date.now() - startTime;
            let refreshResponse = null;
            
            // Skip refresh untuk fast mode atau jika processing sudah cepat
            if (onuType === 'generic' || processingTime > 2000) {
                console.log(`🔄 Creating refresh task for ${onuType} ONU (processing time: ${processingTime}ms)`);
                
                try {
                    const refreshTask = {
                        name: "refreshObject",
                        objectName: "InternetGatewayDevice.LANDevice.1.WLANConfiguration"
                    };

                    refreshResponse = await axiosInstance.post(
                        `/devices/${encodeURIComponent(deviceId)}/tasks?connection_request&timeout=2000`,
                        refreshTask
                    );
                    console.log(`✅ Refresh task created for ${onuType} ONU`);
                } catch (refreshError) {
                    console.warn(`⚠️  Refresh task failed for ${onuType} ONU:`, refreshError.message);
                    // Refresh task gagal tidak masalah kritis
                }
            } else {
                console.log(`⚡ Skipping refresh task for fast ${onuType} ONU mode (${processingTime}ms)`);
            }

            const totalProcessingTime = Date.now() - startTime;
            
            return {
                success: true,
                onuType: onuType,
                taskId: taskResponse.data._id,
                parametersSet: parameterValues.length,
                processingTime: totalProcessingTime,
                mode: onuType !== 'generic' && parameterValues.length <= 10 ? 'fast' : 'standard',
                refreshSkipped: onuType !== 'generic' && totalProcessingTime <= 2000,
                message: `Parameter update completed for ${onuType} ONU in ${totalProcessingTime}ms`
            };
        } catch (error) {
            console.error(`Error setting parameters for device ${deviceId}:`, error.response?.data || error.message);
            throw error;
        }
    },

    async reboot(deviceId) {
        try {
            const axiosInstance = getAxiosInstance();
            const task = {
                name: "reboot",
                timestamp: new Date().toISOString()
            };
            const response = await axiosInstance.post(
                `/devices/${encodeURIComponent(deviceId)}/tasks`,
                task
            );
            return response.data;
        } catch (error) {
            console.error(`Error rebooting device ${deviceId}:`, error.response?.data || error.message);
            throw error;
        }
    },

    async factoryReset(deviceId) {
        try {
            const axiosInstance = getAxiosInstance();
            const task = {
                name: "factoryReset",
                timestamp: new Date().toISOString()
            };
            const response = await axiosInstance.post(
                `/devices/${encodeURIComponent(deviceId)}/tasks`,
                task
            );
            return response.data;
        } catch (error) {
            console.error(`Error factory resetting device ${deviceId}:`, error.response?.data || error.message);
            throw error;
        }
    },

    async getDeviceParameters(deviceId, parameterNames) {
        try {
            const axiosInstance = getAxiosInstance();
            const queryString = parameterNames.map(name => `query=${encodeURIComponent(name)}`).join('&');
            const response = await axiosInstance.get(`/devices/${encodeURIComponent(deviceId)}?${queryString}`);
            return response.data;
        } catch (error) {
            console.error(`Error getting parameters for device ${deviceId}:`, error.response?.data || error.message);
            throw error;
        }
    },

    async getDeviceInfo(deviceId) {
        try {
            console.log(`Getting device info for device ID: ${deviceId}`);
            const GENIEACS_URL = getSetting('genieacs_url', 'http://localhost:7557');
            const GENIEACS_USERNAME = getSetting('genieacs_username', 'alijayanet');
            const GENIEACS_PASSWORD = getSetting('genieacs_password', '087828060111');
            // Mendapatkan device detail
            const deviceResponse = await axios.get(`${GENIEACS_URL}/devices/${encodeURIComponent(deviceId)}`, {
                auth: {
                    username: GENIEACS_USERNAME,
                    password: GENIEACS_PASSWORD
                }
            });
            return deviceResponse.data;
        } catch (error) {
            console.error(`Error getting device info for ${deviceId}:`, error.response?.data || error.message);
            throw error;
        }
    },

    async getVirtualParameters(deviceId) {
        try {
            const axiosInstance = getAxiosInstance();
            const response = await axiosInstance.get(`/devices/${encodeURIComponent(deviceId)}`);
            return response.data.VirtualParameters || {};
        } catch (error) {
            console.error(`Error getting virtual parameters for device ${deviceId}:`, error.response?.data || error.message);
            throw error;
        }
    },
};

// Fungsi untuk memeriksa nilai RXPower dari semua perangkat
async function monitorRXPower(threshold = -27) {
    try {
        console.log(`Memulai pemantauan RXPower dengan threshold ${threshold} dBm`);
        
        // Ambil semua perangkat
        const devices = await genieacsApi.getDevices();
        console.log(`Memeriksa RXPower untuk ${devices.length} perangkat...`);
        
        // Ambil data PPPoE dari Mikrotik
        console.log('Mengambil data PPPoE dari Mikrotik...');
        const conn = await getMikrotikConnection();
        let pppoeSecrets = [];
        
        if (conn) {
            try {
                // Dapatkan semua PPPoE secret dari Mikrotik
                pppoeSecrets = await conn.write('/ppp/secret/print');
                console.log(`Ditemukan ${pppoeSecrets.length} PPPoE secret`);
            } catch (error) {
                console.error('Error mendapatkan PPPoE secret:', error.message);
            }
        }
        
        const criticalDevices = [];
        
        // Periksa setiap perangkat
        for (const device of devices) {
            try {
                // Dapatkan nilai RXPower
                const rxPowerPaths = [
                    'VirtualParameters.RXPower',
                    'VirtualParameters.redaman',
                    'InternetGatewayDevice.WANDevice.1.WANPONInterfaceConfig.RXPower',
                    'Device.XPON.Interface.1.Stats.RXPower'
                ];
                
                let rxPower = null;
                
                // Periksa setiap jalur yang mungkin berisi nilai RXPower
                for (const path of rxPowerPaths) {
                    // Ekstrak nilai menggunakan path yang ada di device
                    if (getRXPowerValue(device, path)) {
                        rxPower = getRXPowerValue(device, path);
                        break;
                    }
                }
                
                // Jika rxPower ditemukan dan di bawah threshold
                if (rxPower !== null && parseFloat(rxPower) < threshold) {
                    // Cari PPPoE username dari parameter perangkat (seperti di handleAdminCheckONU)
                    let pppoeUsername = "Unknown";
                    const serialNumber = getDeviceSerialNumber(device);
                    const deviceId = device._id;
                    const shortDeviceId = deviceId.split('-')[2] || deviceId;
                    
                    // Ambil PPPoE username dari parameter perangkat
                    pppoeUsername = 
                        device.InternetGatewayDevice?.WANDevice?.[1]?.WANConnectionDevice?.[1]?.WANPPPConnection?.[1]?.Username?._value ||
                        device.InternetGatewayDevice?.WANDevice?.[0]?.WANConnectionDevice?.[0]?.WANPPPConnection?.[0]?.Username?._value ||
                        device.VirtualParameters?.pppoeUsername?._value ||
                        "Unknown";
                    
                    // Jika tidak ditemukan dari parameter perangkat, coba cari dari PPPoE secret di Mikrotik
                    if (pppoeUsername === "Unknown") {
                        // Coba cari PPPoE secret yang terkait dengan perangkat ini berdasarkan comment
                        const matchingSecret = pppoeSecrets.find(secret => {
                            if (!secret.comment) return false;
                            
                            // Cek apakah serial number atau device ID ada di kolom comment
                            return (
                                secret.comment.includes(serialNumber) || 
                                secret.comment.includes(shortDeviceId)
                            );
                        });
                        
                        if (matchingSecret) {
                            // Jika ditemukan secret yang cocok, gunakan nama secret sebagai username
                            pppoeUsername = matchingSecret.name;
                            console.log(`Menemukan PPPoE username ${pppoeUsername} untuk perangkat ${shortDeviceId} dari PPPoE secret`);
                        }
                    } else {
                        console.log(`Menemukan PPPoE username ${pppoeUsername} untuk perangkat ${shortDeviceId} dari parameter perangkat`);
                    }
                    
                    // Jika masih tidak ditemukan, coba cari dari tag perangkat
                    if (pppoeUsername === "Unknown" && device._tags && Array.isArray(device._tags)) {
                        // Cek apakah ada tag yang dimulai dengan "pppoe:" yang berisi username
                        const pppoeTag = device._tags.find(tag => tag.startsWith('pppoe:'));
                        if (pppoeTag) {
                            pppoeUsername = pppoeTag.replace('pppoe:', '');
                            console.log(`Menemukan PPPoE username ${pppoeUsername} untuk perangkat ${shortDeviceId} dari tag`);
                        } else {
                            console.log(`Tidak menemukan PPPoE username untuk perangkat ${shortDeviceId}, tags: ${JSON.stringify(device._tags)}`);
                        }
                    }
                    
                    const deviceInfo = {
                        id: device._id,
                        rxPower,
                        serialNumber: getDeviceSerialNumber(device),
                        lastInform: device._lastInform,
                        pppoeUsername: pppoeUsername
                    };
                    
                    criticalDevices.push(deviceInfo);
                    console.log(`Perangkat dengan RXPower rendah: ${deviceInfo.id}, RXPower: ${rxPower} dBm, PPPoE: ${pppoeUsername}`);
                }
            } catch (deviceError) {
                console.error(`Error memeriksa RXPower untuk perangkat ${device._id}:`, deviceError);
            }
        }
        
        // Jika ada perangkat dengan RXPower di bawah threshold
        if (criticalDevices.length > 0) {
            // Buat pesan peringatan
            let message = `⚠️ *PERINGATAN: REDAMAN TINGGI* ⚠️\n\n`;
            message += `${criticalDevices.length} perangkat memiliki nilai RXPower di atas ${threshold} dBm:\n\n`;
            
            criticalDevices.forEach((device, index) => {
                message += `${index + 1}. ID: ${device.id.split('-')[2] || device.id}\n`;
                message += `   S/N: ${device.serialNumber}\n`;
                message += `   PPPoE: ${device.pppoeUsername}\n`;
                message += `   RXPower: ${device.rxPower} dBm\n`;
                message += `   Last Inform: ${new Date(device.lastInform).toLocaleString()}\n\n`;
            });
            
            message += `Mohon segera dicek untuk menghindari koneksi terputus.`;
            
            // Kirim pesan ke grup teknisi dengan prioritas tinggi
            await sendTechnicianMessage(message, 'high');
            console.log(`Pesan peringatan RXPower terkirim untuk ${criticalDevices.length} perangkat`);
        } else {
            console.log('Tidak ada perangkat dengan nilai RXPower di bawah threshold');
        }
        
        return {
            success: true,
            criticalDevices,
            message: `${criticalDevices.length} perangkat memiliki RXPower di atas threshold`
        };
    } catch (error) {
        console.error('Error memantau RXPower:', error);
        return {
            success: false,
            message: `Error memantau RXPower: ${error.message}`,
            error
        };
    }
}

// Helper function untuk mendapatkan nilai RXPower
function getRXPowerValue(device, path) {
    try {
        // Split path menjadi parts
        const parts = path.split('.');
        let current = device;
        
        // Navigate through nested properties
        for (const part of parts) {
            if (!current) return null;
            current = current[part];
        }
        
        // Check if it's a GenieACS parameter object
        if (current && current._value !== undefined) {
            return current._value;
        }
        
        return null;
    } catch (error) {
        console.error(`Error getting RXPower from path ${path}:`, error);
        return null;
    }
}

// Helper function untuk mendapatkan serial number
function getDeviceSerialNumber(device) {
    try {
        const serialPaths = [
            'DeviceID.SerialNumber',
            'InternetGatewayDevice.DeviceInfo.SerialNumber',
            'Device.DeviceInfo.SerialNumber'
        ];
        
        for (const path of serialPaths) {
            const parts = path.split('.');
            let current = device;
            
            for (const part of parts) {
                if (!current) break;
                current = current[part];
            }
            
            if (current && current._value !== undefined) {
                return current._value;
            }
        }
        
        // Fallback ke ID perangkat jika serial number tidak ditemukan
        if (device._id) {
            const parts = device._id.split('-');
            if (parts.length >= 3) {
                return parts[2];
            }
            return device._id;
        }
        
        return 'Unknown';
    } catch (error) {
        console.error('Error getting device serial number:', error);
        return 'Unknown';
    }
}

// Fungsi untuk memantau perangkat yang tidak aktif (offline)
async function monitorOfflineDevices(thresholdHours = 24) {
    try {
        console.log(`Memulai pemantauan perangkat offline dengan threshold ${thresholdHours} jam`);
        
        // Ambil semua perangkat
        const devices = await genieacsApi.getDevices();
        console.log(`Memeriksa status untuk ${devices.length} perangkat...`);
        
        const offlineDevices = [];
        const now = new Date();
        const thresholdMs = thresholdHours * 60 * 60 * 1000; // Convert jam ke ms
        
        // Periksa setiap perangkat
        for (const device of devices) {
            try {
                if (!device._lastInform) {
                    console.log(`Perangkat ${device._id} tidak memiliki lastInform`);
                    continue;
                }
                
                const lastInformTime = new Date(device._lastInform).getTime();
                const timeDiff = now.getTime() - lastInformTime;
                
                // Jika perangkat belum melakukan inform dalam waktu yang melebihi threshold
                if (timeDiff > thresholdMs) {
                    const pppoeUsername = device?.VirtualParameters?.pppoeUsername?._value ||
    device?.InternetGatewayDevice?.WANDevice?.[1]?.WANConnectionDevice?.[1]?.WANPPPConnection?.[1]?.Username?._value ||
    device?.InternetGatewayDevice?.WANDevice?.[0]?.WANConnectionDevice?.[0]?.WANPPPConnection?.[0]?.Username?._value ||
    (Array.isArray(device?._tags) ? (device._tags.find(tag => tag.startsWith('pppoe:'))?.replace('pppoe:', '')) : undefined) ||
    '-';
const deviceInfo = {
    id: device._id,
    serialNumber: getDeviceSerialNumber(device),
    pppoeUsername,
    lastInform: device._lastInform,
    offlineHours: Math.round(timeDiff / (60 * 60 * 1000) * 10) / 10 // Jam dengan 1 desimal
};
                    
                    offlineDevices.push(deviceInfo);
                    console.log(`Perangkat offline: ${deviceInfo.id}, Offline selama: ${deviceInfo.offlineHours} jam`);
                }
            } catch (deviceError) {
                console.error(`Error memeriksa status untuk perangkat ${device._id}:`, deviceError);
            }
        }
        
        // Jika ada perangkat yang offline
        if (offlineDevices.length > 0) {
            // Buat pesan peringatan
            let message = `⚠️ *PERINGATAN: PERANGKAT OFFLINE* ⚠️\n\n`;
            message += `${offlineDevices.length} perangkat offline lebih dari ${thresholdHours} jam:\n\n`;
            
            offlineDevices.forEach((device, index) => {
    message += `${index + 1}. ID: ${device.id.split('-')[2] || device.id}\n`;
    message += `   S/N: ${device.serialNumber}\n`;
    message += `   PPPoE: ${device.pppoeUsername || '-'}\n`;
    message += `   Offline selama: ${device.offlineHours} jam\n`;
    message += `   Last Inform: ${new Date(device.lastInform).toLocaleString()}\n\n`;
});
            
            message += `Mohon segera ditindaklanjuti.`;
            
            // Kirim pesan ke grup teknisi dengan prioritas medium
            await sendTechnicianMessage(message, 'medium');
            console.log(`Pesan peringatan perangkat offline terkirim untuk ${offlineDevices.length} perangkat`);
        } else {
            console.log('Tidak ada perangkat yang offline lebih dari threshold');
        }
        
        return {
            success: true,
            offlineDevices,
            message: `${offlineDevices.length} perangkat offline lebih dari ${thresholdHours} jam`
        };
    } catch (error) {
        console.error('Error memantau perangkat offline:', error);
        return {
            success: false,
            message: `Error memantau perangkat offline: ${error.message}`,
            error
        };
    }
}

// Jadwalkan monitoring setiap 6 jam
function scheduleMonitoring() {
    // Ambil pengaturan dari settings.json
    const rxPowerRecapEnabled = getSetting('rxpower_recap_enable', true) !== false;
    const rxPowerRecapInterval = getSetting('rxpower_recap_interval', 6) * 60 * 60 * 1000; // Convert jam ke ms
    const offlineNotifEnabled = getSetting('offline_notification_enable', true) !== false;
    const offlineNotifInterval = getSetting('offline_notification_interval', 12) * 60 * 60 * 1000; // Convert jam ke ms

    setTimeout(async () => {
        if (rxPowerRecapEnabled) {
            console.log('Menjalankan pemantauan RXPower awal...');
            await monitorRXPower();
        }
        if (offlineNotifEnabled) {
            console.log('Menjalankan pemantauan perangkat offline awal...');
            await monitorOfflineDevices();
        }
        // Jadwalkan secara berkala
        if (rxPowerRecapEnabled) {
            setInterval(async () => {
                console.log('Menjalankan pemantauan RXPower terjadwal...');
                await monitorRXPower();
            }, rxPowerRecapInterval);
        }
        if (offlineNotifEnabled) {
            setInterval(async () => {
                console.log('Menjalankan pemantauan perangkat offline terjadwal...');
                await monitorOfflineDevices();
            }, offlineNotifInterval);
        }
    }, 5 * 60 * 1000); // Mulai 5 menit setelah server berjalan
}

// Jalankan penjadwalan monitoring
scheduleMonitoring();

// Wrapper untuk update SSID berdasarkan nomor telepon pelanggan (digunakan oleh mobile customer routes)
async function updateSSID(phone, newSSID) {
    try {
        const device = await genieacsApi.findDeviceByPhoneNumber(phone);
        if (!device || !device._id) {
            return { success: false, error: 'Device tidak ditemukan' };
        }

        const result = await genieacsApi.setParameterValues(device._id, {
            'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID': newSSID
        });

        return {
            success: true,
            processingTime: result.processingTime,
            onuType: result.onuType,
            mode: result.mode
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Wrapper untuk update Password WiFi berdasarkan nomor telepon pelanggan (digunakan oleh mobile customer routes)
async function updatePassword(phone, newPassword) {
    try {
        if (!newPassword || newPassword.length < 8) {
            return { success: false, error: 'Password minimal 8 karakter' };
        }

        const device = await genieacsApi.findDeviceByPhoneNumber(phone);
        if (!device || !device._id) {
            return { success: false, error: 'Device tidak ditemukan' };
        }

        const result = await genieacsApi.setParameterValues(device._id, {
            'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.KeyPassphrase': newPassword
        });

        return {
            success: true,
            processingTime: result.processingTime,
            onuType: result.onuType,
            mode: result.mode
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

module.exports = {
    getDevices: genieacsApi.getDevices,
    getDevice: genieacsApi.getDevice,
    getDeviceInfo: genieacsApi.getDeviceInfo,
    findDeviceByPhoneNumber: genieacsApi.findDeviceByPhoneNumber,
    getDeviceByPhoneNumber: genieacsApi.getDeviceByPhoneNumber,
    setParameterValues: genieacsApi.setParameterValues,
    reboot: genieacsApi.reboot,
    factoryReset: genieacsApi.factoryReset,
    getVirtualParameters: genieacsApi.getVirtualParameters,
    monitorRXPower,
    monitorOfflineDevices,
    updateSSID,
    updatePassword
};
