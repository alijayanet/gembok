const axios = require('axios');
const { sendTechnicianMessage } = require('./sendMessage');
const mikrotik = require('./mikrotik');
const { getMikrotikConnection } = require('./mikrotik');
const { getSetting } = require('./settingsManager');

// Helper untuk membuat axios instance dinamis
function getAxiosInstance() {
    const GENIEACS_URL = getSetting('genieacs_url', 'http://localhost:7557');
    const GENIEACS_USERNAME = getSetting('genieacs_username', 'acs');
    const GENIEACS_PASSWORD = getSetting('genieacs_password', '');
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
            // Format parameter values untuk GenieACS
            const parameterValues = [];
            for (const [path, value] of Object.entries(parameters)) {
                // Handle SSID update
                if (path.includes('SSID')) {
                    parameterValues.push(
                        ["InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID", value],
                        ["Device.WiFi.SSID.1.SSID", value]
                    );
                }
                // Handle WiFi password update
                else if (path.includes('Password') || path.includes('KeyPassphrase')) {
                    parameterValues.push(
                        ["InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.KeyPassphrase", value],
                        ["InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.KeyPassphrase", value],
                        ["InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.PreSharedKey", value]
                    );
                }
                // Handle other parameters
                else {
                    parameterValues.push([path, value]);
                }
            }

            console.log('Formatted parameter values:', parameterValues);

            // Kirim task ke GenieACS
            const task = {
                name: "setParameterValues",
                parameterValues: parameterValues
            };

            const response = await axiosInstance.post(
                `/devices/${encodeURIComponent(deviceId)}/tasks?connection_request`,
                task
            );

            console.log('Parameter update response:', response.data);

            // Kirim refresh task
            const refreshTask = {
                name: "refreshObject",
                objectName: "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1"
            };

            const refreshResponse = await axiosInstance.post(
                `/devices/${encodeURIComponent(deviceId)}/tasks?connection_request`,
                refreshTask
            );

            console.log('Refresh task response:', refreshResponse.data);

            return response.data;
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
            const GENIEACS_USERNAME = getSetting('genieacs_username', 'acs');
            const GENIEACS_PASSWORD = getSetting('genieacs_password', '');
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
                    const deviceInfo = {
                        id: device._id,
                        serialNumber: getDeviceSerialNumber(device),
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
    // Jalankan sekali saat startup
    setTimeout(async () => {
        console.log('Menjalankan pemantauan RXPower awal...');
        await monitorRXPower();
        
        console.log('Menjalankan pemantauan perangkat offline awal...');
        await monitorOfflineDevices();
        
        // Jadwalkan secara berkala
        setInterval(async () => {
            console.log('Menjalankan pemantauan RXPower terjadwal...');
            await monitorRXPower();
        }, 6 * 60 * 60 * 1000); // Setiap 6 jam
        
        setInterval(async () => {
            console.log('Menjalankan pemantauan perangkat offline terjadwal...');
            await monitorOfflineDevices();
        }, 12 * 60 * 60 * 1000); // Setiap 12 jam
    }, 5 * 60 * 1000); // Mulai 5 menit setelah server berjalan
}

// Jalankan penjadwalan monitoring
scheduleMonitoring();

module.exports = {
    getDevices: genieacsApi.getDevices,
    getDeviceInfo: genieacsApi.getDeviceInfo,
    findDeviceByPhoneNumber: genieacsApi.findDeviceByPhoneNumber,
    getDeviceByPhoneNumber: genieacsApi.getDeviceByPhoneNumber,
    setParameterValues: genieacsApi.setParameterValues,
    reboot: genieacsApi.reboot,
    factoryReset: genieacsApi.factoryReset,
    getVirtualParameters: genieacsApi.getVirtualParameters,
    monitorRXPower,
    monitorOfflineDevices
};
