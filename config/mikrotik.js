// Modul untuk koneksi dan operasi Mikrotik
const { RouterOSAPI } = require('node-routeros');
const { logger } = require('./logger');
const { getSetting } = require('./settingsManager');

let sock = null;
let mikrotikConnection = null;
let monitorInterval = null;

// Fungsi untuk set instance sock
function setSock(sockInstance) {
    sock = sockInstance;
}

// Fungsi untuk koneksi ke Mikrotik
async function connectToMikrotik() {
    try {
        // Dapatkan konfigurasi Mikrotik
        const host = getSetting('mikrotik_host', '192.168.8.1');
        const port = parseInt(getSetting('mikrotik_port', '8728'));
        const user = getSetting('mikrotik_user', 'admin');
        const password = getSetting('mikrotik_password', 'admin');
        
        if (!host || !user || !password) {
            logger.error('Mikrotik configuration is incomplete');
            return null;
        }
        
        // Buat koneksi ke Mikrotik
        const conn = new RouterOSAPI({
            host,
            port,
            user,
            password,
            keepalive: true
        });
        
        // Connect ke Mikrotik
        await conn.connect();
        logger.info(`Connected to Mikrotik at ${host}:${port}`);
        
        // Set global connection
        mikrotikConnection = conn;
        
        return conn;
    } catch (error) {
        logger.error(`Error connecting to Mikrotik: ${error.message}`);
        return null;
    }
}

// Fungsi untuk mendapatkan koneksi Mikrotik
async function getMikrotikConnection() {
    if (!mikrotikConnection) {
        return await connectToMikrotik();
    }
    return mikrotikConnection;
}

// Fungsi untuk mendapatkan seluruh user PPPoE (secret) beserta status aktif/offline
async function getPPPoEUsers() {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return [];
        }
        // Ambil semua secret PPPoE
        const pppSecrets = await conn.write('/ppp/secret/print');
        // Ambil semua koneksi aktif
        const activeResult = await getActivePPPoEConnections();
        const activeNames = (activeResult && activeResult.success && Array.isArray(activeResult.data)) ? activeResult.data.map(c => c.name) : [];
        // Gabungkan data
        return pppSecrets.map(secret => ({
            id: secret['.id'],
            name: secret.name,
            password: secret.password,
            profile: secret.profile,
            active: activeNames.includes(secret.name)
        }));
    } catch (error) {
        logger.error(`Error getting PPPoE users: ${error.message}`);
        return [];
    }
}

// Fungsi untuk edit user PPPoE (berdasarkan id)
async function editPPPoEUser({ id, username, password, profile }) {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) throw new Error('Koneksi ke Mikrotik gagal');
        await conn.write('/ppp/secret/set', [
            '=.id=' + id,
            '=name=' + username,
            '=password=' + password,
            '=profile=' + profile
        ]);
        return { success: true };
    } catch (error) {
        logger.error(`Error editing PPPoE user: ${error.message}`);
        throw error;
    }
}

// Fungsi untuk hapus user PPPoE (berdasarkan id)
async function deletePPPoEUser(id) {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) throw new Error('Koneksi ke Mikrotik gagal');
        await conn.write('/ppp/secret/remove', [ '=.id=' + id ]);
        return { success: true };
    } catch (error) {
        logger.error(`Error deleting PPPoE user: ${error.message}`);
        throw error;
    }
}

// Fungsi untuk mendapatkan daftar koneksi PPPoE aktif
async function getActivePPPoEConnections() {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal', data: [] };
        }
        // Dapatkan daftar koneksi PPPoE aktif
        const pppConnections = await conn.write('/ppp/active/print');
        return {
            success: true,
            message: `Ditemukan ${pppConnections.length} koneksi PPPoE aktif`,
            data: pppConnections
        };
    } catch (error) {
        logger.error(`Error getting active PPPoE connections: ${error.message}`);
        return { success: false, message: `Gagal ambil data PPPoE: ${error.message}`, data: [] };
    }
}

// Fungsi untuk mendapatkan daftar user PPPoE offline
async function getOfflinePPPoEUsers() {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return [];
        }
        
        // Dapatkan semua secret PPPoE
        const pppSecrets = await conn.write('/ppp/secret/print');
        
        // Dapatkan koneksi aktif
        const activeConnections = await getActivePPPoEConnections();
        const activeUsers = activeConnections.map(conn => conn.name);
        
        // Filter user yang offline
        const offlineUsers = pppSecrets.filter(secret => !activeUsers.includes(secret.name));
        
        return offlineUsers;
    } catch (error) {
        logger.error(`Error getting offline PPPoE users: ${error.message}`);
        return [];
    }
}

// Fungsi untuk mendapatkan informasi user PPPoE yang tidak aktif (untuk whatsapp.js)
async function getInactivePPPoEUsers() {
    try {
        // Dapatkan semua secret PPPoE
        const pppSecrets = await getMikrotikConnection().then(conn => {
            if (!conn) return [];
            return conn.write('/ppp/secret/print');
        });
        
        // Dapatkan koneksi aktif
        let activeUsers = [];
        const activeConnectionsResult = await getActivePPPoEConnections();
        if (activeConnectionsResult && activeConnectionsResult.success && Array.isArray(activeConnectionsResult.data)) {
            activeUsers = activeConnectionsResult.data.map(conn => conn.name);
        }
        
        // Filter user yang offline
        const inactiveUsers = pppSecrets.filter(secret => !activeUsers.includes(secret.name));
        
        // Format hasil untuk whatsapp.js
        return {
            success: true,
            totalSecrets: pppSecrets.length,
            totalActive: activeUsers.length,
            totalInactive: inactiveUsers.length,
            data: inactiveUsers.map(user => ({
                name: user.name,
                comment: user.comment || '',
                profile: user.profile,
                lastLogout: user['last-logged-out'] || 'N/A'
            }))
        };
    } catch (error) {
        logger.error(`Error getting inactive PPPoE users: ${error.message}`);
        return {
            success: false,
            message: error.message,
            totalSecrets: 0,
            totalActive: 0,
            totalInactive: 0,
            data: []
        };
    }
}

// Fungsi untuk mendapatkan resource router
async function getRouterResources() {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return null;
        }

        // Dapatkan resource router
        const resources = await conn.write('/system/resource/print');

        // Debug: Log semua data yang dikembalikan (bisa dinonaktifkan nanti)
        // logger.info('=== DEBUG: Raw MikroTik Resource Response ===');
        // logger.info('Full response:', JSON.stringify(resources, null, 2));
        // logger.info('Response length:', resources.length);
        // if (resources.length > 0) {
        //     logger.info('First item:', JSON.stringify(resources[0], null, 2));
        //     logger.info('Available fields:', Object.keys(resources[0]));
        // }
        // logger.info('=== END DEBUG ===');

        return resources[0];
    } catch (error) {
        logger.error(`Error getting router resources: ${error.message}`);
        return null;
    }
}

function safeNumber(val) {
    if (val === undefined || val === null) return 0;
    const n = Number(val);
    return isNaN(n) ? 0 : n;
}

// Helper function untuk parsing memory dengan berbagai format
function parseMemoryValue(value) {
    if (!value) return 0;

    // Jika sudah berupa number, return langsung
    if (typeof value === 'number') return value;

    // Jika berupa string yang berisi angka
    if (typeof value === 'string') {
        // Coba parse sebagai integer dulu (untuk format bytes dari MikroTik)
        const intValue = parseInt(value);
        if (!isNaN(intValue)) return intValue;

        // Jika gagal, coba parse dengan unit
        const str = value.toString().toLowerCase();
        const numericPart = parseFloat(str.replace(/[^0-9.]/g, ''));
        if (isNaN(numericPart)) return 0;

        // Check for units
        if (str.includes('kib') || str.includes('kb')) {
            return numericPart * 1024;
        } else if (str.includes('mib') || str.includes('mb')) {
            return numericPart * 1024 * 1024;
        } else if (str.includes('gib') || str.includes('gb')) {
            return numericPart * 1024 * 1024 * 1024;
        } else {
            // Assume bytes if no unit
            return numericPart;
        }
    }

    return 0;
}

// Fungsi untuk mendapatkan informasi resource yang diformat
async function getResourceInfo() {
    // Ambil traffic interface utama (default ether1)
    const interfaceName = getSetting('main_interface', 'ether1');
    let traffic = { rx: 0, tx: 0 };
    try {
        traffic = await getInterfaceTraffic(interfaceName);
    } catch (e) { traffic = { rx: 0, tx: 0 }; }

    try {
        const resources = await getRouterResources();
        if (!resources) {
            return { success: false, message: 'Resource router tidak ditemukan', data: null };
        }

        // Debug: Log raw resource data (bisa dinonaktifkan nanti)
        // logger.info('Raw MikroTik resource data:', JSON.stringify(resources, null, 2));

        // Parse memory berdasarkan field yang tersedia di debug
        // Berdasarkan debug: free-memory: 944705536, total-memory: 1073741824 (dalam bytes)
        const totalMem = parseMemoryValue(resources['total-memory']) || 0;
        const freeMem = parseMemoryValue(resources['free-memory']) || 0;
        const usedMem = totalMem > 0 && freeMem >= 0 ? totalMem - freeMem : 0;

        // Parse disk space berdasarkan field yang tersedia di debug
        // Berdasarkan debug: free-hdd-space: 438689792, total-hdd-space: 537133056 (dalam bytes)
        const totalDisk = parseMemoryValue(resources['total-hdd-space']) || 0;
        const freeDisk = parseMemoryValue(resources['free-hdd-space']) || 0;
        const usedDisk = totalDisk > 0 && freeDisk >= 0 ? totalDisk - freeDisk : 0;

        // Parse CPU load (bisa dalam format percentage atau decimal)
        let cpuLoad = safeNumber(resources['cpu-load']);
        if (cpuLoad > 0 && cpuLoad <= 1) {
            cpuLoad = cpuLoad * 100; // Convert dari decimal ke percentage
        }

        const data = {
            trafficRX: traffic && traffic.rx ? (traffic.rx / 1000000).toFixed(2) : '0.00',
            trafficTX: traffic && traffic.tx ? (traffic.tx / 1000000).toFixed(2) : '0.00',
            cpuLoad: Math.round(cpuLoad),
            cpuCount: safeNumber(resources['cpu-count']),
            cpuFrequency: safeNumber(resources['cpu-frequency']),
            architecture: resources['architecture-name'] || resources['cpu'] || 'N/A',
            model: resources['model'] || resources['board-name'] || 'N/A',
            serialNumber: resources['serial-number'] || 'N/A',
            firmware: resources['firmware-type'] || resources['version'] || 'N/A',
            voltage: resources['voltage'] || resources['board-voltage'] || 'N/A',
            temperature: resources['temperature'] || resources['board-temperature'] || 'N/A',
            badBlocks: resources['bad-blocks'] || 'N/A',
            // Konversi dari bytes ke MB dengan 2 decimal places
            memoryUsed: totalMem > 0 ? parseFloat((usedMem / 1024 / 1024).toFixed(2)) : 0,
            memoryFree: totalMem > 0 ? parseFloat((freeMem / 1024 / 1024).toFixed(2)) : 0,
            totalMemory: totalMem > 0 ? parseFloat((totalMem / 1024 / 1024).toFixed(2)) : 0,
            diskUsed: totalDisk > 0 ? parseFloat((usedDisk / 1024 / 1024).toFixed(2)) : 0,
            diskFree: totalDisk > 0 ? parseFloat((freeDisk / 1024 / 1024).toFixed(2)) : 0,
            totalDisk: totalDisk > 0 ? parseFloat((totalDisk / 1024 / 1024).toFixed(2)) : 0,
            uptime: resources.uptime || 'N/A',
            version: resources.version || 'N/A',
            boardName: resources['board-name'] || 'N/A',
            platform: resources['platform'] || 'N/A',
            // Debug info (bisa dihapus nanti)
            rawTotalMem: resources['total-memory'],
            rawFreeMem: resources['free-memory'],
            rawTotalDisk: resources['total-hdd-space'],
            rawFreeDisk: resources['free-hdd-space'],
            parsedTotalMem: totalMem,
            parsedFreeMem: freeMem,
            parsedTotalDisk: totalDisk,
            parsedFreeDisk: freeDisk
        };

        // Log parsed data for debugging (bisa dinonaktifkan nanti)
        // logger.info('Parsed memory data:', {
        //     totalMem: totalMem,
        //     freeMem: freeMem,
        //     usedMem: usedMem,
        //     totalMemMB: data.totalMemory,
        //     freeMemMB: data.memoryFree,
        //     usedMemMB: data.memoryUsed
        // });

        return {
            success: true,
            message: 'Berhasil mengambil info resource router',
            data
        };
    } catch (error) {
        logger.error(`Error getting formatted resource info: ${error.message}`);
        return { success: false, message: `Gagal ambil resource router: ${error.message}`, data: null };
    }
}

// Fungsi untuk mendapatkan daftar user hotspot aktif
async function getActiveHotspotUsers() {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal', data: [] };
        }
        // Dapatkan daftar user hotspot aktif
        const hotspotUsers = await conn.write('/ip/hotspot/active/print');
        logger.info(`Found ${hotspotUsers.length} active hotspot users`);
        
        return {
            success: true,
            message: `Ditemukan ${hotspotUsers.length} user hotspot aktif`,
            data: hotspotUsers
        };
    } catch (error) {
        logger.error(`Error getting active hotspot users: ${error.message}`);
        return { success: false, message: `Gagal ambil data hotspot: ${error.message}`, data: [] };
    }
}

// Fungsi untuk menambahkan user hotspot
async function addHotspotUser(username, password, profile) {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal' };
        }
        // Tambahkan user hotspot
        await conn.write('/ip/hotspot/user/add', [
            '=name=' + username,
            '=password=' + password,
            '=profile=' + profile
        ]);
        return { success: true, message: 'User hotspot berhasil ditambahkan' };
    } catch (error) {
        logger.error(`Error adding hotspot user: ${error.message}`);
        return { success: false, message: `Gagal menambah user hotspot: ${error.message}` };
    }
}

// Fungsi untuk menghapus user hotspot
async function deleteHotspotUser(username) {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal' };
        }
        // Cari user hotspot
        const users = await conn.write('/ip/hotspot/user/print', [
            '?name=' + username
        ]);
        if (users.length === 0) {
            return { success: false, message: 'User hotspot tidak ditemukan' };
        }
        // Hapus user hotspot
        await conn.write('/ip/hotspot/user/remove', [
            '=.id=' + users[0]['.id']
        ]);
        return { success: true, message: 'User hotspot berhasil dihapus' };
    } catch (error) {
        logger.error(`Error deleting hotspot user: ${error.message}`);
        return { success: false, message: `Gagal menghapus user hotspot: ${error.message}` };
    }
}

// Fungsi untuk menambahkan secret PPPoE
async function addPPPoESecret(username, password, profile, localAddress = '') {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal' };
        }
        // Parameter untuk menambahkan secret
        const params = [
            '=name=' + username,
            '=password=' + password,
            '=profile=' + profile,
            '=service=pppoe'
        ];
        if (localAddress) {
            params.push('=local-address=' + localAddress);
        }
        // Tambahkan secret PPPoE
        await conn.write('/ppp/secret/add', params);
        return { success: true, message: 'Secret PPPoE berhasil ditambahkan' };
    } catch (error) {
        logger.error(`Error adding PPPoE secret: ${error.message}`);
        return { success: false, message: `Gagal menambah secret PPPoE: ${error.message}` };
    }
}

// Fungsi untuk menghapus secret PPPoE
async function deletePPPoESecret(username) {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal' };
        }
        // Cari secret PPPoE
        const secrets = await conn.write('/ppp/secret/print', [
            '?name=' + username
        ]);
        if (secrets.length === 0) {
            return { success: false, message: 'Secret PPPoE tidak ditemukan' };
        }
        // Hapus secret PPPoE
        await conn.write('/ppp/secret/remove', [
            '=.id=' + secrets[0]['.id']
        ]);
        return { success: true, message: 'Secret PPPoE berhasil dihapus' };
    } catch (error) {
        logger.error(`Error deleting PPPoE secret: ${error.message}`);
        return { success: false, message: `Gagal menghapus secret PPPoE: ${error.message}` };
    }
}

// Fungsi untuk mengubah profile PPPoE
async function setPPPoEProfile(username, profile) {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal' };
        }
        // Cari secret PPPoE
        const secrets = await conn.write('/ppp/secret/print', [
            '?name=' + username
        ]);
        if (secrets.length === 0) {
            return { success: false, message: 'Secret PPPoE tidak ditemukan' };
        }
        // Ubah profile PPPoE
        await conn.write('/ppp/secret/set', [
            '=.id=' + secrets[0]['.id'],
            '=profile=' + profile
        ]);

        // Tambahan: Kick user dari sesi aktif PPPoE
        // Cari sesi aktif
        const activeSessions = await conn.write('/ppp/active/print', [
            '?name=' + username
        ]);
        if (activeSessions.length > 0) {
            // Hapus semua sesi aktif user ini
            for (const session of activeSessions) {
                await conn.write('/ppp/active/remove', [
                    '=.id=' + session['.id']
                ]);
            }
            logger.info(`User ${username} di-kick dari sesi aktif PPPoE setelah ganti profile`);
        }

        return { success: true, message: 'Profile PPPoE berhasil diubah dan user di-kick dari sesi aktif' };
    } catch (error) {
        logger.error(`Error setting PPPoE profile: ${error.message}`);
        return { success: false, message: `Gagal mengubah profile PPPoE: ${error.message}` };
    }
}

// Fungsi untuk monitoring koneksi PPPoE
let lastActivePPPoE = [];
async function monitorPPPoEConnections() {
    try {
        // Cek ENV untuk enable/disable monitoring
        const monitorEnable = (getSetting('pppoe_monitor_enable', 'true')).toLowerCase() === 'true';
        if (!monitorEnable) {
            logger.info('PPPoE monitoring is DISABLED by ENV');
            return;
        }
        // Dapatkan interval monitoring dari konfigurasi
        const interval = parseInt(getSetting('pppoe_monitor_interval', '60000'));
        
        // Bersihkan interval sebelumnya jika ada
        if (monitorInterval) {
            clearInterval(monitorInterval);
        }
        
        // Set interval untuk monitoring
        monitorInterval = setInterval(async () => {
            try {
                // Dapatkan koneksi PPPoE aktif
                const connections = await getActivePPPoEConnections();
                if (!connections.success) {
                    logger.warn(`Monitoring PPPoE connections failed: ${connections.message}`);
                    return;
                }
                const activeNow = connections.data.map(u => u.name);
                // Deteksi login/logout
                const loginUsers = activeNow.filter(u => !lastActivePPPoE.includes(u));
                const logoutUsers = lastActivePPPoE.filter(u => !activeNow.includes(u));
                if (loginUsers.length > 0) {
                    // Ambil detail user login
                    const loginDetail = connections.data.filter(u => loginUsers.includes(u.name));
                    // Ambil daftar user offline
                    let offlineList = [];
                    try {
                        const conn = await getMikrotikConnection();
                        const pppSecrets = await conn.write('/ppp/secret/print');
                        offlineList = pppSecrets.filter(secret => !activeNow.includes(secret.name)).map(u => u.name);
                    } catch (e) {}
                    // Format pesan WhatsApp
                    let msg = `🔔 *PPPoE LOGIN*\n\n`;
                    loginDetail.forEach((u, i) => {
                        msg += `*${i+1}. ${u.name}*\n• Address: ${u.address || '-'}\n• Uptime: ${u.uptime || '-'}\n\n`;
                    });
                    msg += `🚫 *Pelanggan Offline* (${offlineList.length})\n`;
                    offlineList.forEach((u, i) => {
                        msg += `${i+1}. ${u}\n`;
                    });
                    // Kirim ke group WhatsApp
                    const technicianGroupId = getSetting('technician_group_id', '');
                    if (sock && technicianGroupId) {
                        try {
                            await sock.sendMessage(technicianGroupId, { text: msg });
                            logger.info(`PPPoE login notification sent to group: ${technicianGroupId}`);
                        } catch (e) {
                            logger.error('Gagal kirim notifikasi PPPoE ke WhatsApp group:', e);
                        }
                    } else {
                        logger.warn('No technician group configured for PPPoE notifications');
                    }
                    logger.info('PPPoE LOGIN:', loginUsers);
                }
                if (logoutUsers.length > 0) {
                    // Ambil detail user logout dari lastActivePPPoE (karena sudah tidak ada di connections.data)
                    let logoutDetail = logoutUsers.map(name => ({ name }));
                    // Ambil daftar user offline terbaru
                    let offlineList = [];
                    try {
                        const conn = await getMikrotikConnection();
                        const pppSecrets = await conn.write('/ppp/secret/print');
                        offlineList = pppSecrets.filter(secret => !activeNow.includes(secret.name)).map(u => u.name);
                    } catch (e) {}
                    // Format pesan WhatsApp
                    let msg = `🚪 *PPPoE LOGOUT*\n\n`;
                    logoutDetail.forEach((u, i) => {
                        msg += `*${i+1}. ${u.name}*\n\n`;
                    });
                    msg += `🚫 *Pelanggan Offline* (${offlineList.length})\n`;
                    offlineList.forEach((u, i) => {
                        msg += `${i+1}. ${u}\n`;
                    });
                    // Kirim ke group WhatsApp
                    const technicianGroupId = getSetting('technician_group_id', '');
                    if (sock && technicianGroupId) {
                        try {
                            await sock.sendMessage(technicianGroupId, { text: msg });
                            logger.info(`PPPoE logout notification sent to group: ${technicianGroupId}`);
                        } catch (e) {
                            logger.error('Gagal kirim notifikasi PPPoE LOGOUT ke WhatsApp group:', e);
                        }
                    } else {
                        logger.warn('No technician group configured for PPPoE notifications');
                    }
                    logger.info('PPPoE LOGOUT:', logoutUsers);
                }
                lastActivePPPoE = activeNow;
                logger.info(`Monitoring PPPoE connections: ${connections.data.length} active connections`);
            } catch (error) {
                logger.error(`Error in PPPoE monitoring: ${error.message}`);
            }
        }, interval);
        
        logger.info(`PPPoE monitoring started with interval ${interval}ms`);
    } catch (error) {
        logger.error(`Error starting PPPoE monitoring: ${error.message}`);
    }
}

// Fungsi untuk mendapatkan traffic interface
async function getInterfaceTraffic(interfaceName = 'ether1') {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) return { rx: 0, tx: 0 };
        const res = await conn.write('/interface/monitor-traffic', [
            `=interface=${interfaceName}`,
            '=once='
        ]);
        if (!res || !res[0]) return { rx: 0, tx: 0 };
        // RX/TX dalam bps
        return {
            rx: res[0]['rx-bits-per-second'] || 0,
            tx: res[0]['tx-bits-per-second'] || 0
        };
    } catch (error) {
        logger.error('Error getting interface traffic:', error.message, error);
        return { rx: 0, tx: 0 };
    }
}

// Fungsi untuk mendapatkan daftar interface
async function getInterfaces() {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal', data: [] };
        }

        const interfaces = await conn.write('/interface/print');
        return {
            success: true,
            message: `Ditemukan ${interfaces.length} interface`,
            data: interfaces
        };
    } catch (error) {
        logger.error(`Error getting interfaces: ${error.message}`);
        return { success: false, message: `Gagal ambil data interface: ${error.message}`, data: [] };
    }
}

// Fungsi untuk mendapatkan detail interface tertentu
async function getInterfaceDetail(interfaceName) {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal', data: null };
        }

        const interfaces = await conn.write('/interface/print', [
            `?name=${interfaceName}`
        ]);

        if (interfaces.length === 0) {
            return { success: false, message: 'Interface tidak ditemukan', data: null };
        }

        return {
            success: true,
            message: `Detail interface ${interfaceName}`,
            data: interfaces[0]
        };
    } catch (error) {
        logger.error(`Error getting interface detail: ${error.message}`);
        return { success: false, message: `Gagal ambil detail interface: ${error.message}`, data: null };
    }
}

// Fungsi untuk enable/disable interface
async function setInterfaceStatus(interfaceName, enabled) {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal' };
        }

        // Cari interface
        const interfaces = await conn.write('/interface/print', [
            `?name=${interfaceName}`
        ]);

        if (interfaces.length === 0) {
            return { success: false, message: 'Interface tidak ditemukan' };
        }

        // Set status interface
        const action = enabled ? 'enable' : 'disable';
        await conn.write(`/interface/${action}`, [
            `=.id=${interfaces[0]['.id']}`
        ]);

        return {
            success: true,
            message: `Interface ${interfaceName} berhasil ${enabled ? 'diaktifkan' : 'dinonaktifkan'}`
        };
    } catch (error) {
        logger.error(`Error setting interface status: ${error.message}`);
        return { success: false, message: `Gagal mengubah status interface: ${error.message}` };
    }
}

// Fungsi untuk mendapatkan daftar IP address
async function getIPAddresses() {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal', data: [] };
        }

        const addresses = await conn.write('/ip/address/print');
        return {
            success: true,
            message: `Ditemukan ${addresses.length} IP address`,
            data: addresses
        };
    } catch (error) {
        logger.error(`Error getting IP addresses: ${error.message}`);
        return { success: false, message: `Gagal ambil data IP address: ${error.message}`, data: [] };
    }
}

// Fungsi untuk menambah IP address
async function addIPAddress(interfaceName, address) {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal' };
        }

        await conn.write('/ip/address/add', [
            `=interface=${interfaceName}`,
            `=address=${address}`
        ]);

        return { success: true, message: `IP address ${address} berhasil ditambahkan ke ${interfaceName}` };
    } catch (error) {
        logger.error(`Error adding IP address: ${error.message}`);
        return { success: false, message: `Gagal menambah IP address: ${error.message}` };
    }
}

// Fungsi untuk menghapus IP address
async function deleteIPAddress(interfaceName, address) {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal' };
        }

        // Cari IP address
        const addresses = await conn.write('/ip/address/print', [
            `?interface=${interfaceName}`,
            `?address=${address}`
        ]);

        if (addresses.length === 0) {
            return { success: false, message: 'IP address tidak ditemukan' };
        }

        // Hapus IP address
        await conn.write('/ip/address/remove', [
            `=.id=${addresses[0]['.id']}`
        ]);

        return { success: true, message: `IP address ${address} berhasil dihapus dari ${interfaceName}` };
    } catch (error) {
        logger.error(`Error deleting IP address: ${error.message}`);
        return { success: false, message: `Gagal menghapus IP address: ${error.message}` };
    }
}

// Fungsi untuk mendapatkan routing table
async function getRoutes() {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal', data: [] };
        }

        const routes = await conn.write('/ip/route/print');
        return {
            success: true,
            message: `Ditemukan ${routes.length} route`,
            data: routes
        };
    } catch (error) {
        logger.error(`Error getting routes: ${error.message}`);
        return { success: false, message: `Gagal ambil data route: ${error.message}`, data: [] };
    }
}

// Fungsi untuk menambah route
async function addRoute(destination, gateway, distance = '1') {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal' };
        }

        await conn.write('/ip/route/add', [
            `=dst-address=${destination}`,
            `=gateway=${gateway}`,
            `=distance=${distance}`
        ]);

        return { success: true, message: `Route ${destination} via ${gateway} berhasil ditambahkan` };
    } catch (error) {
        logger.error(`Error adding route: ${error.message}`);
        return { success: false, message: `Gagal menambah route: ${error.message}` };
    }
}

// Fungsi untuk menghapus route
async function deleteRoute(destination) {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal' };
        }

        // Cari route
        const routes = await conn.write('/ip/route/print', [
            `?dst-address=${destination}`
        ]);

        if (routes.length === 0) {
            return { success: false, message: 'Route tidak ditemukan' };
        }

        // Hapus route
        await conn.write('/ip/route/remove', [
            `=.id=${routes[0]['.id']}`
        ]);

        return { success: true, message: `Route ${destination} berhasil dihapus` };
    } catch (error) {
        logger.error(`Error deleting route: ${error.message}`);
        return { success: false, message: `Gagal menghapus route: ${error.message}` };
    }
}

// Fungsi untuk mendapatkan DHCP leases
async function getDHCPLeases() {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal', data: [] };
        }

        const leases = await conn.write('/ip/dhcp-server/lease/print');
        return {
            success: true,
            message: `Ditemukan ${leases.length} DHCP lease`,
            data: leases
        };
    } catch (error) {
        logger.error(`Error getting DHCP leases: ${error.message}`);
        return { success: false, message: `Gagal ambil data DHCP lease: ${error.message}`, data: [] };
    }
}

// Fungsi untuk mendapatkan DHCP server
async function getDHCPServers() {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal', data: [] };
        }

        const servers = await conn.write('/ip/dhcp-server/print');
        return {
            success: true,
            message: `Ditemukan ${servers.length} DHCP server`,
            data: servers
        };
    } catch (error) {
        logger.error(`Error getting DHCP servers: ${error.message}`);
        return { success: false, message: `Gagal ambil data DHCP server: ${error.message}`, data: [] };
    }
}

// Fungsi untuk ping
async function pingHost(host, count = '4') {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal', data: null };
        }

        const result = await conn.write('/ping', [
            `=address=${host}`,
            `=count=${count}`
        ]);

        return {
            success: true,
            message: `Ping ke ${host} selesai`,
            data: result
        };
    } catch (error) {
        logger.error(`Error pinging host: ${error.message}`);
        return { success: false, message: `Gagal ping ke ${host}: ${error.message}`, data: null };
    }
}

// Fungsi untuk mendapatkan system logs
async function getSystemLogs(topics = '', count = '50') {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal', data: [] };
        }

        const params = [];
        if (topics) {
            params.push(`?topics~${topics}`);
        }

        const logs = await conn.write('/log/print', params);

        // Batasi jumlah log yang dikembalikan
        const limitedLogs = logs.slice(0, parseInt(count));

        return {
            success: true,
            message: `Ditemukan ${limitedLogs.length} log entries`,
            data: limitedLogs
        };
    } catch (error) {
        logger.error(`Error getting system logs: ${error.message}`);
        return { success: false, message: `Gagal ambil system logs: ${error.message}`, data: [] };
    }
}

// Fungsi untuk mendapatkan daftar profile PPPoE
async function getPPPoEProfiles() {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal', data: [] };
        }

        const profiles = await conn.write('/ppp/profile/print');
        return {
            success: true,
            message: `Ditemukan ${profiles.length} PPPoE profile`,
            data: profiles
        };
    } catch (error) {
        logger.error(`Error getting PPPoE profiles: ${error.message}`);
        return { success: false, message: `Gagal ambil data PPPoE profile: ${error.message}`, data: [] };
    }
}

// Fungsi untuk mendapatkan detail profile PPPoE
async function getPPPoEProfileDetail(id) {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal', data: null };
        }

        const profiles = await conn.write('/ppp/profile/print', [`?.id=${id}`]);
        if (profiles.length === 0) {
            return { success: false, message: 'Profile tidak ditemukan', data: null };
        }

        return {
            success: true,
            message: 'Detail profile berhasil diambil',
            data: profiles[0]
        };
    } catch (error) {
        logger.error(`Error getting PPPoE profile detail: ${error.message}`);
        return { success: false, message: `Gagal ambil detail profile: ${error.message}`, data: null };
    }
}

// Fungsi untuk mendapatkan daftar profile hotspot
async function getHotspotProfiles() {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal', data: [] };
        }
        
        const profiles = await conn.write('/ip/hotspot/user/profile/print');
        return {
            success: true,
            message: `Ditemukan ${profiles.length} profile hotspot`,
            data: profiles
        };
    } catch (error) {
        logger.error(`Error getting hotspot profiles: ${error.message}`);
        return { success: false, message: `Gagal ambil data profile hotspot: ${error.message}`, data: [] };
    }
}

// Fungsi untuk mendapatkan detail profile hotspot
async function getHotspotProfileDetail(id) {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal', data: null };
        }
        
        const result = await conn.write('/ip/hotspot/user/profile/print', [
            '?.id=' + id
        ]);
        
        if (result && result.length > 0) {
            return { success: true, data: result[0] };
        } else {
            return { success: false, message: 'Profile tidak ditemukan', data: null };
        }
    } catch (error) {
        logger.error(`Error getting hotspot profile detail: ${error.message}`);
        return { success: false, message: error.message, data: null };
    }
}

// Fungsi untuk mendapatkan daftar server hotspot
async function getHotspotServers() {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal', data: [] };
        }
        
        const result = await conn.write('/ip/hotspot/print');
        
        if (result && Array.isArray(result)) {
            return { success: true, data: result.map(server => ({
                id: server['.id'],
                name: server.name,
                interface: server.interface,
                profile: server.profile,
                address: server['address-pool'] || '',
                disabled: server.disabled === 'true'
            })) };
        } else {
            return { success: false, message: 'Gagal mendapatkan server hotspot', data: [] };
        }
    } catch (error) {
        logger.error(`Error getting hotspot servers: ${error.message}`);
        return { success: false, message: error.message, data: [] };
    }
}

// Fungsi untuk memutus koneksi user hotspot aktif
async function disconnectHotspotUser(username) {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal' };
        }
        
        // Cari ID koneksi aktif berdasarkan username
        const activeUsers = await conn.write('/ip/hotspot/active/print', [
            '?user=' + username
        ]);
        
        if (!activeUsers || activeUsers.length === 0) {
            return { success: false, message: `User ${username} tidak ditemukan atau tidak aktif` };
        }
        
        // Putus koneksi user dengan ID yang ditemukan
        await conn.write('/ip/hotspot/active/remove', [
            '=.id=' + activeUsers[0]['.id']
        ]);
        
        logger.info(`Disconnected hotspot user: ${username}`);
        return { success: true, message: `User ${username} berhasil diputus` };
    } catch (error) {
        logger.error(`Error disconnecting hotspot user: ${error.message}`);
        return { success: false, message: error.message };
    }
}

// Fungsi untuk menambah profile hotspot
async function addHotspotProfile(profileData) {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal' };
        }
        
        const {
            name,
            comment,
            rateLimit,
            rateLimitUnit,
            sessionTimeout,
            sessionTimeoutUnit,
            idleTimeout,
            idleTimeoutUnit,
            localAddress,
            remoteAddress,
            dnsServer,
            parentQueue,
            addressList,
            sharedUsers
        } = profileData;
        
        const params = [
            '=name=' + name
        ];
        
        if (comment) params.push('=comment=' + comment);
        if (rateLimit && rateLimitUnit) params.push('=rate-limit=' + rateLimit + rateLimitUnit);
        if (sessionTimeout && sessionTimeoutUnit) params.push('=session-timeout=' + sessionTimeout + sessionTimeoutUnit);
        if (idleTimeout && idleTimeoutUnit) params.push('=idle-timeout=' + idleTimeout + idleTimeoutUnit);
        if (localAddress) params.push('=local-address=' + localAddress);
        if (remoteAddress) params.push('=remote-address=' + remoteAddress);
        if (dnsServer) params.push('=dns-server=' + dnsServer);
        if (parentQueue) params.push('=parent-queue=' + parentQueue);
        if (addressList) params.push('=address-list=' + addressList);
        if (sharedUsers) params.push('=shared-users=' + sharedUsers);
        
        await conn.write('/ip/hotspot/user/profile/add', params);
        
        return { success: true, message: 'Profile hotspot berhasil ditambahkan' };
    } catch (error) {
        logger.error(`Error adding hotspot profile: ${error.message}`);
        return { success: false, message: `Gagal menambah profile: ${error.message}` };
    }
}

// Fungsi untuk edit profile hotspot
async function editHotspotProfile(profileData) {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal' };
        }
        
        const {
            id,
            name,
            comment,
            rateLimit,
            rateLimitUnit,
            sessionTimeout,
            sessionTimeoutUnit,
            idleTimeout,
            idleTimeoutUnit,
            localAddress,
            remoteAddress,
            dnsServer,
            parentQueue,
            addressList,
            sharedUsers
        } = profileData;
        
        const params = [
            '=.id=' + id,
            '=name=' + name
        ];
        
        if (comment !== undefined) params.push('=comment=' + comment);
        if (rateLimit && rateLimitUnit) params.push('=rate-limit=' + rateLimit + rateLimitUnit);
        else if (rateLimit === '') params.push('=rate-limit=');
        if (sessionTimeout && sessionTimeoutUnit) params.push('=session-timeout=' + sessionTimeout + sessionTimeoutUnit);
        else if (sessionTimeout === '') params.push('=session-timeout=');
        if (idleTimeout && idleTimeoutUnit) params.push('=idle-timeout=' + idleTimeout + idleTimeoutUnit);
        else if (idleTimeout === '') params.push('=idle-timeout=');
        if (localAddress !== undefined) params.push('=local-address=' + localAddress);
        if (remoteAddress !== undefined) params.push('=remote-address=' + remoteAddress);
        if (dnsServer !== undefined) params.push('=dns-server=' + dnsServer);
        if (parentQueue !== undefined) params.push('=parent-queue=' + parentQueue);
        if (addressList !== undefined) params.push('=address-list=' + addressList);
        if (sharedUsers !== undefined) params.push('=shared-users=' + sharedUsers);
        
        await conn.write('/ip/hotspot/user/profile/set', params);
        
        return { success: true, message: 'Profile hotspot berhasil diupdate' };
    } catch (error) {
        logger.error(`Error editing hotspot profile: ${error.message}`);
        return { success: false, message: `Gagal mengupdate profile: ${error.message}` };
    }
}

// Fungsi untuk hapus profile hotspot
async function deleteHotspotProfile(id) {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal' };
        }
        
        await conn.write('/ip/hotspot/user/profile/remove', [
            '=.id=' + id
        ]);
        
        return { success: true, message: 'Profile hotspot berhasil dihapus' };
    } catch (error) {
        logger.error(`Error deleting hotspot profile: ${error.message}`);
        return { success: false, message: `Gagal menghapus profile: ${error.message}` };
    }
}

// Fungsi untuk mendapatkan firewall rules
async function getFirewallRules(chain = '') {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal', data: [] };
        }

        const params = [];
        if (chain) {
            params.push(`?chain=${chain}`);
        }

        const rules = await conn.write('/ip/firewall/filter/print', params);
        return {
            success: true,
            message: `Ditemukan ${rules.length} firewall rule${chain ? ` untuk chain ${chain}` : ''}`,
            data: rules
        };
    } catch (error) {
        logger.error(`Error getting firewall rules: ${error.message}`);
        return { success: false, message: `Gagal ambil data firewall rule: ${error.message}`, data: [] };
    }
}

// Fungsi untuk restart router
async function restartRouter() {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal' };
        }

        await conn.write('/system/reboot');
        return { success: true, message: 'Router akan restart dalam beberapa detik' };
    } catch (error) {
        logger.error(`Error restarting router: ${error.message}`);
        return { success: false, message: `Gagal restart router: ${error.message}` };
    }
}

// Fungsi untuk mendapatkan identity router
async function getRouterIdentity() {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal', data: null };
        }

        const identity = await conn.write('/system/identity/print');
        return {
            success: true,
            message: 'Identity router berhasil diambil',
            data: identity[0]
        };
    } catch (error) {
        logger.error(`Error getting router identity: ${error.message}`);
        return { success: false, message: `Gagal ambil identity router: ${error.message}`, data: null };
    }
}

// Fungsi untuk set identity router
async function setRouterIdentity(name) {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal' };
        }

        await conn.write('/system/identity/set', [
            `=name=${name}`
        ]);

        return { success: true, message: `Identity router berhasil diubah menjadi: ${name}` };
    } catch (error) {
        logger.error(`Error setting router identity: ${error.message}`);
        return { success: false, message: `Gagal mengubah identity router: ${error.message}` };
    }
}

// Fungsi untuk mendapatkan clock router
async function getRouterClock() {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal', data: null };
        }

        const clock = await conn.write('/system/clock/print');
        return {
            success: true,
            message: 'Clock router berhasil diambil',
            data: clock[0]
        };
    } catch (error) {
        logger.error(`Error getting router clock: ${error.message}`);
        return { success: false, message: `Gagal ambil clock router: ${error.message}`, data: null };
    }
}

// Fungsi untuk mendapatkan semua user (hotspot + PPPoE)
async function getAllUsers() {
    try {
        // Ambil user hotspot
        const hotspotResult = await getActiveHotspotUsers();
        const hotspotUsers = hotspotResult.success ? hotspotResult.data : [];

        // Ambil user PPPoE aktif
        const pppoeResult = await getActivePPPoEConnections();
        const pppoeUsers = pppoeResult.success ? pppoeResult.data : [];

        // Ambil user PPPoE offline
        const offlineResult = await getInactivePPPoEUsers();
        const offlineUsers = offlineResult.success ? offlineResult.data : [];

        return {
            success: true,
            message: `Total: ${hotspotUsers.length} hotspot aktif, ${pppoeUsers.length} PPPoE aktif, ${offlineUsers.length} PPPoE offline`,
            data: {
                hotspotActive: hotspotUsers,
                pppoeActive: pppoeUsers,
                pppoeOffline: offlineUsers,
                totalActive: hotspotUsers.length + pppoeUsers.length,
                totalOffline: offlineUsers.length
            }
        };
    } catch (error) {
        logger.error(`Error getting all users: ${error.message}`);
        return { success: false, message: `Gagal ambil data semua user: ${error.message}`, data: null };
    }
}

// ...
// Fungsi tambah user PPPoE (alias addPPPoESecret)
async function addPPPoEUser({ username, password, profile }) {
    return await addPPPoESecret(username, password, profile);
}

// Update user hotspot (password dan profile)
async function updateHotspotUser(username, password, profile) {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) throw new Error('Koneksi ke Mikrotik gagal');
        // Cari .id user berdasarkan username
        const users = await conn.write('/ip/hotspot/user/print', [
            '?name=' + username
        ]);
        if (!users.length) throw new Error('User tidak ditemukan');
        const id = users[0]['.id'];
        // Update password dan profile
        await conn.write('/ip/hotspot/user/set', [
            '=numbers=' + id,
            '=password=' + password,
            '=profile=' + profile
        ]);
        return true;
    } catch (err) {
        throw err;
    }
}

// Fungsi untuk generate voucher hotspot secara massal (versi lama - dihapus)
// Fungsi ini diganti dengan fungsi generateHotspotVouchers yang lebih lengkap di bawah

// Fungsi untuk menambah profile PPPoE
async function addPPPoEProfile(profileData) {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) throw new Error('Koneksi ke Mikrotik gagal');
        
        const params = [
            '=name=' + profileData.name
        ];
        
        // Tambahkan field opsional jika ada
        if (profileData['rate-limit']) params.push('=rate-limit=' + profileData['rate-limit']);
        if (profileData['local-address']) params.push('=local-address=' + profileData['local-address']);
        if (profileData['remote-address']) params.push('=remote-address=' + profileData['remote-address']);
        if (profileData['dns-server']) params.push('=dns-server=' + profileData['dns-server']);
        if (profileData['parent-queue']) params.push('=parent-queue=' + profileData['parent-queue']);
        if (profileData['address-list']) params.push('=address-list=' + profileData['address-list']);
        if (profileData.comment) params.push('=comment=' + profileData.comment);
        if (profileData['bridge-learning'] && profileData['bridge-learning'] !== 'default') params.push('=bridge-learning=' + profileData['bridge-learning']);
        if (profileData['use-mpls'] && profileData['use-mpls'] !== 'default') params.push('=use-mpls=' + profileData['use-mpls']);
        if (profileData['use-compression'] && profileData['use-compression'] !== 'default') params.push('=use-compression=' + profileData['use-compression']);
        if (profileData['use-encryption'] && profileData['use-encryption'] !== 'default') params.push('=use-encryption=' + profileData['use-encryption']);
        if (profileData['only-one'] && profileData['only-one'] !== 'default') params.push('=only-one=' + profileData['only-one']);
        if (profileData['change-tcp-mss'] && profileData['change-tcp-mss'] !== 'default') params.push('=change-tcp-mss=' + profileData['change-tcp-mss']);
        
        await conn.write('/ppp/profile/add', params);
        
        return { success: true };
    } catch (error) {
        logger.error(`Error adding PPPoE profile: ${error.message}`);
        return { success: false, message: error.message };
    }
}

// Fungsi untuk edit profile PPPoE
async function editPPPoEProfile(profileData) {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) throw new Error('Koneksi ke Mikrotik gagal');
        
        const params = [
            '=.id=' + profileData.id
        ];
        
        // Tambahkan field yang akan diupdate
        if (profileData.name) params.push('=name=' + profileData.name);
        if (profileData['rate-limit'] !== undefined) params.push('=rate-limit=' + profileData['rate-limit']);
        if (profileData['local-address'] !== undefined) params.push('=local-address=' + profileData['local-address']);
        if (profileData['remote-address'] !== undefined) params.push('=remote-address=' + profileData['remote-address']);
        if (profileData['dns-server'] !== undefined) params.push('=dns-server=' + profileData['dns-server']);
        if (profileData['parent-queue'] !== undefined) params.push('=parent-queue=' + profileData['parent-queue']);
        if (profileData['address-list'] !== undefined) params.push('=address-list=' + profileData['address-list']);
        if (profileData.comment !== undefined) params.push('=comment=' + profileData.comment);
        if (profileData['bridge-learning'] !== undefined) params.push('=bridge-learning=' + profileData['bridge-learning']);
        if (profileData['use-mpls'] !== undefined) params.push('=use-mpls=' + profileData['use-mpls']);
        if (profileData['use-compression'] !== undefined) params.push('=use-compression=' + profileData['use-compression']);
        if (profileData['use-encryption'] !== undefined) params.push('=use-encryption=' + profileData['use-encryption']);
        if (profileData['only-one'] !== undefined) params.push('=only-one=' + profileData['only-one']);
        if (profileData['change-tcp-mss'] !== undefined) params.push('=change-tcp-mss=' + profileData['change-tcp-mss']);
        
        await conn.write('/ppp/profile/set', params);
        
        return { success: true };
    } catch (error) {
        logger.error(`Error editing PPPoE profile: ${error.message}`);
        return { success: false, message: error.message };
    }
}

// Fungsi untuk hapus profile PPPoE
async function deletePPPoEProfile(id) {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) throw new Error('Koneksi ke Mikrotik gagal');
        
        await conn.write('/ppp/profile/remove', [ '=.id=' + id ]);
        
        return { success: true };
    } catch (error) {
        logger.error(`Error deleting PPPoE profile: ${error.message}`);
        return { success: false, message: error.message };
    }
}

// Fungsi untuk generate hotspot vouchers
async function generateHotspotVouchers(count, prefix, profile, server, validUntil, price, charType = 'alphanumeric') {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('Tidak dapat terhubung ke Mikrotik');
            return { success: false, message: 'Tidak dapat terhubung ke Mikrotik', vouchers: [] };
        }
        
        // Fungsi untuk generate random string berdasarkan jenis karakter
        function randomString(length, charType = 'alphanumeric') {
            let chars;
            switch (charType) {
                case 'numeric':
                    chars = '0123456789';
                    break;
                case 'alphabetic':
                    chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
                    break;
                case 'alphanumeric':
                default:
                    chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
                    break;
            }
            let str = '';
            for (let i = 0; i < length; i++) {
                str += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            return str;
        }
        
        const vouchers = [];
        
        // Log untuk debugging
        logger.info(`Generating ${count} vouchers with prefix ${prefix} and profile ${profile}`);
        
        for (let i = 0; i < count; i++) {
            const username = prefix + randomString(5, charType);
            const password = username; // Username dan password disamakan
            
            try {
                // Tambahkan user hotspot ke Mikrotik
                const params = [
                    `=name=${username}`,
                    `=password=${password}`,
                    `=profile=${profile}`,
                    `=comment=voucher`
                ];
                
                // Tambahkan server jika bukan 'all'
                if (server && server !== 'all') {
                    params.push(`=server=${server}`);
                }
                
                // Tambahkan user hotspot
                await conn.write('/ip/hotspot/user/add', params);
                
                // Tambahkan ke array vouchers
                vouchers.push({
                    username,
                    password,
                    profile,
                    server: server !== 'all' ? server : 'all',
                    createdAt: new Date(),
                    price: price // Tambahkan harga ke data voucher
                });
                
                logger.info(`Voucher created: ${username}`);
            } catch (err) {
                logger.error(`Failed to create voucher ${username}: ${err.message}`);
                // Lanjutkan ke voucher berikutnya
            }
        }
        
        logger.info(`Successfully generated ${vouchers.length} vouchers`);
        
        return {
            success: true,
            message: `Berhasil membuat ${vouchers.length} voucher`,
            vouchers: vouchers
        };
    } catch (error) {
        logger.error(`Error generating vouchers: ${error.message}`);
        return {
            success: false,
            message: `Gagal generate voucher: ${error.message}`,
            vouchers: []
        };
    }
}

module.exports = {
    setSock,
    getInterfaceTraffic,
    getPPPoEUsers,
    addPPPoEUser,
    editPPPoEUser,
    deletePPPoEUser,
    connectToMikrotik,
    getMikrotikConnection,
    getActivePPPoEConnections,
    getOfflinePPPoEUsers,
    getInactivePPPoEUsers,
    getRouterResources,
    getResourceInfo,
    getActiveHotspotUsers,
    addHotspotUser,
    deleteHotspotUser,
    addPPPoESecret,
    deletePPPoESecret,
    setPPPoEProfile,
    monitorPPPoEConnections,
    generateHotspotVouchers,
    getInterfaces,
    getInterfaceDetail,
    setInterfaceStatus,
    getIPAddresses,
    addIPAddress,
    deleteIPAddress,
    getRoutes,
    addRoute,
    deleteRoute,
    getDHCPLeases,
    getDHCPServers,
    pingHost,
    getSystemLogs,
    getPPPoEProfiles,
    getHotspotProfiles,
    getFirewallRules,
    restartRouter,
    getRouterIdentity,
    setRouterIdentity,
    getRouterClock,
    getAllUsers,
    updateHotspotUser,
    addPPPoEProfile,
    editPPPoEProfile,
    deletePPPoEProfile,
    getPPPoEProfileDetail,
    getHotspotProfileDetail,
    addHotspotProfile,
    editHotspotProfile,
    deleteHotspotProfile,
    getHotspotServers,
    disconnectHotspotUser
};
