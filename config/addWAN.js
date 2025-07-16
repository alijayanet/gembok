// Fungsi untuk menambahkan konfigurasi WAN pada perangkat ONU
const axios = require('axios');
const { logger } = require('./logger');
const { getSetting } = require('./settingsManager');

// Fungsi untuk menambahkan konfigurasi WAN pada perangkat ONU
async function handleAddWAN(remoteJid, params, sock) {
    try {
        // Ekstrak parameter
        const [customerNumber, wanType, connMode] = params;
        
        // Validasi tipe WAN dan mode koneksi
        if (!['ppp', 'ip'].includes(wanType.toLowerCase())) {
            await sock.sendMessage(remoteJid, {
                text: `❌ *Tipe WAN tidak valid*\n\nTipe WAN harus 'ppp' atau 'ip'`
            });
            return;
        }
        
        if (!['bridge', 'route'].includes(connMode.toLowerCase())) {
            await sock.sendMessage(remoteJid, {
                text: `❌ *Mode koneksi tidak valid*\n\nMode koneksi harus 'bridge' atau 'route'`
            });
            return;
        }
        
        // Dapatkan URL GenieACS
        const genieacsUrl = getSetting('genieacs_url', 'http://localhost:7557');
        if (!genieacsUrl) {
            await sock.sendMessage(remoteJid, {
                text: `❌ *Konfigurasi tidak lengkap*\n\nURL GenieACS tidak dikonfigurasi`
            });
            return;
        }
        
        // Cari perangkat berdasarkan tag nomor pelanggan
        const device = await findDeviceByTag(customerNumber);
        
        if (!device) {
            await sock.sendMessage(remoteJid, {
                text: `❌ *Perangkat tidak ditemukan*\n\nTidak dapat menemukan perangkat untuk nomor ${customerNumber}`
            });
            return;
        }
        
        // Kirim pesan bahwa proses sedang berlangsung
        await sock.sendMessage(remoteJid, {
            text: `⏳ *Proses konfigurasi WAN*\n\nSedang mengkonfigurasi WAN untuk perangkat ${device._id}...`
        });
        
        // Buat task berdasarkan tipe WAN dan mode koneksi
        const task = createWANTask(wanType.toLowerCase(), connMode.toLowerCase());
        
        // Kirim task ke GenieACS
        try {
            const response = await axios.post(
                `${genieacsUrl}/devices/${device._id}/tasks?connection_request`,
                task,
                {
                    auth: { username: getSetting('genieacs_username', 'admin'), password: getSetting('genieacs_password', 'admin') }
                }
            );
            
            logger.info(`Task response: ${response.status}`);
            
            // Kirim pesan sukses
            let successMessage = `✅ *Konfigurasi WAN berhasil*\n\n`;
            successMessage += `📱 *Nomor Pelanggan:* ${customerNumber}\n`;
            successMessage += `🔄 *Tipe WAN:* ${wanType.toUpperCase()}\n`;
            successMessage += `🔄 *Mode Koneksi:* ${connMode}\n\n`;
            successMessage += `Perangkat akan segera menerapkan konfigurasi WAN baru.`;
            
            await sock.sendMessage(remoteJid, { text: successMessage });
            
        } catch (error) {
            logger.error('Error sending task to GenieACS:', error);
            
            let errorMessage = `❌ *Gagal mengkonfigurasi WAN*\n\n`;
            if (error.response) {
                errorMessage += `Status: ${error.response.status}\n`;
                errorMessage += `Pesan: ${JSON.stringify(error.response.data)}\n`;
            } else {
                errorMessage += `Error: ${error.message}\n`;
            }
            
            await sock.sendMessage(remoteJid, { text: errorMessage });
        }
        
    } catch (error) {
        logger.error('Error in handleAddWAN:', error);
        
        await sock.sendMessage(remoteJid, {
            text: `❌ *Error*\n\nTerjadi kesalahan saat mengkonfigurasi WAN: ${error.message}`
        });
    }
}

// Fungsi untuk mencari perangkat berdasarkan tag nomor pelanggan
async function findDeviceByTag(customerNumber) {
    try {
        // Dapatkan URL GenieACS
        const genieacsUrl = getSetting('genieacs_url', 'http://localhost:7557');
        if (!genieacsUrl) {
            logger.error('GenieACS URL not configured');
            return null;
        }
        
        // Buat query untuk mencari perangkat berdasarkan tag
        const queryObj = { "_tags": customerNumber };
        const queryJson = JSON.stringify(queryObj);
        const encodedQuery = encodeURIComponent(queryJson);
        
        // Ambil perangkat dari GenieACS
        const response = await axios.get(`${genieacsUrl}/devices/?query=${encodedQuery}`, {
            auth: { username: getSetting('genieacs_username', 'admin'), password: getSetting('genieacs_password', 'admin') },
            headers: {
                'Accept': 'application/json'
            }
        });
        
        if (response.data && response.data.length > 0) {
            return response.data[0];
        }
        
        return null;
    } catch (error) {
        logger.error(`Error finding device by tag: ${error.message}`);
        return null;
    }
}

// Fungsi untuk membuat task WAN berdasarkan tipe dan mode
function createWANTask(wanType, connMode) {
    // Parameter WAN yang akan diatur
    let connectionType = '';
    let serviceList = '';
    let task = {
        name: "setParameterValues",
        parameterValues: []
    };
    
    // Tentukan parameter berdasarkan tipe dan mode
    if (wanType === 'ppp') {
        if (connMode === 'bridge') {
            connectionType = 'PPPoE_Bridged';
            serviceList = 'INTERNET';
            
            // Parameter untuk PPPoE Bridge
            task.parameterValues = [
                ["InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Enable", false, "xsd:boolean"],
                ["InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ConnectionType", connectionType, "xsd:string"],
                ["InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.X_HW_ServiceList", serviceList, "xsd:string"],
                ["InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Enable", true, "xsd:boolean"]
            ];
            
        } else { // route
            connectionType = 'PPPoE_Routed';
            serviceList = 'TR069,INTERNET';
            
            // Parameter untuk PPPoE Route
            task.parameterValues = [
                ["InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Enable", false, "xsd:boolean"],
                ["InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ConnectionType", connectionType, "xsd:string"],
                ["InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.X_HW_ServiceList", serviceList, "xsd:string"],
                ["InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.X_HW_VLAN", 0, "xsd:unsignedInt"],
                ["InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.X_HW_LANBIND", "LAN1,LAN2,LAN3,LAN4,SSID1,SSID2,SSID3,SSID4", "xsd:string"],
                ["InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Enable", true, "xsd:boolean"]
            ];
        }
    } else { // ip
        if (connMode === 'bridge') {
            connectionType = 'IP_Bridged';
            serviceList = 'INTERNET';
            
            // Parameter untuk IP Bridge
            task.parameterValues = [
                ["InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.Enable", false, "xsd:boolean"],
                ["InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.ConnectionType", connectionType, "xsd:string"],
                ["InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.X_HW_ServiceList", serviceList, "xsd:string"],
                ["InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.Enable", true, "xsd:boolean"]
            ];
            
        } else { // route
            connectionType = 'IP_Routed';
            serviceList = 'INTERNET';
            
            // Parameter untuk IP Route
            task.parameterValues = [
                ["InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.Enable", false, "xsd:boolean"],
                ["InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.ConnectionType", connectionType, "xsd:string"],
                ["InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.X_HW_ServiceList", serviceList, "xsd:string"],
                ["InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.X_HW_VLAN", 0, "xsd:unsignedInt"],
                ["InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.X_HW_LANBIND", "LAN1,LAN2,LAN3,LAN4,SSID1,SSID2,SSID3,SSID4", "xsd:string"],
                ["InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.Enable", true, "xsd:boolean"]
            ];
        }
    }
    
    return task;
}

module.exports = {
    handleAddWAN,
    findDeviceByTag
};
