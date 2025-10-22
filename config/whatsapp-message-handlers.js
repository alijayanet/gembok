const logger = require('./logger');
const { getAdminHelpMessage, getTechnicianHelpMessage, getCustomerHelpMessage, getGeneralHelpMessage, getVersionMessage, getSystemInfoMessage } = require('./help-messages');
const WhatsAppTroubleCommands = require('./whatsapp-trouble-commands');
const WhatsAppPPPoECommands = require('./whatsapp-pppoe-commands');

class WhatsAppMessageHandlers {
    constructor(whatsappCore, whatsappCommands) {
        this.core = whatsappCore;
        this.commands = whatsappCommands;
        this.troubleCommands = new WhatsAppTroubleCommands(whatsappCore);
        this.pppoeCommands = new WhatsAppPPPoECommands(whatsappCore);
        
        // Parameter paths for different device parameters (from genieacs-commands.js)
        this.parameterPaths = {
            rxPower: [
                'VirtualParameters.RXPower',
                'InternetGatewayDevice.WANDevice.1.WANPONInterfaceConfig.RXPower',
                'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.X_ALU-COM_RxPower',
                'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.RxPower',
                'Device.Optical.Interface.1.RxPower'
            ],
            pppoeIP: [
                'VirtualParameters.pppoeIP',
                'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ExternalIPAddress',
                'Device.PPP.Interface.1.IPCPExtensions.RemoteIPAddress'
            ],
            pppUsername: [
                'VirtualParameters.pppoeUsername',
                'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username',
                'Device.PPP.Interface.1.Username'
            ],
            uptime: [
                'VirtualParameters.getdeviceuptime',
                'InternetGatewayDevice.DeviceInfo.UpTime',
                'Device.DeviceInfo.UpTime'
            ],
            firmware: [
                'InternetGatewayDevice.DeviceInfo.SoftwareVersion',
                'Device.DeviceInfo.SoftwareVersion'
            ],
            userConnected: [
                'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.TotalAssociations',
                'VirtualParameters.activedevices',
                'Device.WiFi.AccessPoint.1.AssociatedDeviceNumberOfEntries'
            ],
            temperature: [
                'VirtualParameters.gettemp',
                'InternetGatewayDevice.DeviceInfo.TemperatureStatus.TemperatureValue',
                'Device.DeviceInfo.TemperatureStatus.TemperatureValue'
            ],
            serialNumber: [
                'VirtualParameters.getSerialNumber',
                'InternetGatewayDevice.DeviceInfo.SerialNumber'
            ],
            ponMode: [
                'VirtualParameters.getponmode'
            ],
            pppUptime: [
                'VirtualParameters.getpppuptime'
            ]
        };
    }

    // Phone helpers: normalize and variants (08..., 62..., +62...)
    normalizePhone(input) {
        if (!input) return '';
        let s = String(input).replace(/[^0-9+]/g, '');
        if (s.startsWith('+')) s = s.slice(1);
        if (s.startsWith('0')) return '62' + s.slice(1);
        if (s.startsWith('62')) return s;
        // Fallback: if it looks like local without leading 0, prepend 62
        if (/^8[0-9]{7,13}$/.test(s)) return '62' + s;
        return s;
    }

    generatePhoneVariants(input) {
        const raw = String(input || '');
        const norm = this.normalizePhone(raw);
        const local = norm.startsWith('62') ? '0' + norm.slice(2) : raw;
        const plus = norm.startsWith('62') ? '+62' + norm.slice(2) : raw;
        const shortLocal = local.startsWith('0') ? local.slice(1) : local;
        return Array.from(new Set([raw, norm, local, plus, shortLocal].filter(Boolean)));
    }

    // Main message handler
    async handleIncomingMessage(sock, message) {
        try {
            // Validasi input
            if (!message || !message.key) {
                logger.warn('Invalid message received', { message: typeof message });
                return;
            }
            
            // Ekstrak informasi pesan
            const remoteJid = message.key.remoteJid;
            if (!remoteJid) {
                logger.warn('Message without remoteJid received', { messageKey: message.key });
                return;
            }
            
            // Skip jika pesan dari grup dan bukan dari admin
            if (remoteJid.includes('@g.us')) {
                logger.debug('Message from group received', { groupJid: remoteJid });
                const participant = message.key.participant;
                if (!participant || !this.core.isAdminNumber(participant.split('@')[0])) {
                    logger.debug('Group message not from admin, ignoring', { participant });
                    return;
                }
                logger.info('Group message from admin, processing', { participant });
            }
            
            // Cek tipe pesan dan ekstrak teks
            let messageText = '';
            if (!message.message) {
                logger.debug('Message without content received', { messageType: 'unknown' });
                return;
            }
            
            if (message.message.conversation) {
                messageText = message.message.conversation;
                logger.debug('Conversation message received');
            } else if (message.message.extendedTextMessage) {
                messageText = message.message.extendedTextMessage.text;
                logger.debug('Extended text message received');
            } else {
                logger.debug('Unsupported message type received', { 
                    messageTypes: Object.keys(message.message) 
                });
                return;
            }
            
            // Ekstrak nomor pengirim
            let senderNumber;
            try {
                senderNumber = remoteJid.split('@')[0];
            } catch (error) {
                logger.error('Error extracting sender number', { remoteJid, error: error.message });
                return;
            }
            
            logger.info(`Message received`, { sender: senderNumber, messageLength: messageText.length });
            logger.debug(`Message content`, { sender: senderNumber, message: messageText });
            
            // Cek apakah pengirim adalah admin
            const isAdmin = this.core.isAdminNumber(senderNumber);
            logger.debug(`Sender admin status`, { sender: senderNumber, isAdmin });
            
            // Jika pesan kosong, abaikan
            if (!messageText.trim()) {
                logger.debug('Empty message, ignoring');
                return;
            }
            
            // Proses pesan
            await this.processMessage(remoteJid, senderNumber, messageText, isAdmin);
            
        } catch (error) {
            logger.error('Error in handleIncomingMessage', { error: error.message, stack: error.stack });
        }
    }

    // Process message and route to appropriate handler
    async processMessage(remoteJid, senderNumber, messageText, isAdmin) {
        const command = messageText.trim().toLowerCase();
        const originalCommand = messageText.trim();
        
        try {
            // Cek apakah pengirim bisa akses fitur teknisi
            const canAccessTechnician = this.core.canAccessTechnicianFeatures(senderNumber);
            
            // Debug logging
            logger.info(`🔍 [ROUTING] Processing command: "${originalCommand}" (lowercase: "${command}")`);
            logger.info(`🔍 [ROUTING] Sender: ${senderNumber}, isAdmin: ${isAdmin}, canAccessTechnician: ${canAccessTechnician}`);
            
            // Admin commands (termasuk command teknisi)
            if (isAdmin) {
                logger.info(`🔍 [ROUTING] Routing to handleAdminCommands`);
                await this.handleAdminCommands(remoteJid, senderNumber, command, messageText);
                return;
            }
            
            // Technician commands (untuk teknisi yang bukan admin)
            if (canAccessTechnician && !isAdmin) {
                logger.info(`🔍 [ROUTING] Routing to handleTechnicianCommands`);
                await this.handleTechnicianCommands(remoteJid, senderNumber, command, messageText);
                return;
            }
            
            // Customer commands
            logger.info(`🔍 [ROUTING] Routing to handleCustomerCommands`);
            await this.handleCustomerCommands(remoteJid, senderNumber, command, messageText);
            
        } catch (error) {
            logger.error('Error processing message', { 
                command, 
                sender: senderNumber, 
                error: error.message 
            });
            
            // Send error message to user
            await this.commands.sendMessage(remoteJid, 
                `❌ *ERROR*\n\nTerjadi kesalahan saat memproses perintah:\n${error.message}`
            );
        }
    }

    // Handle technician commands (untuk teknisi yang bukan admin)
    async handleTechnicianCommands(remoteJid, senderNumber, command, messageText) {
        // Command yang bisa diakses teknisi (tidak bisa akses semua fitur admin)
        
        logger.info(`🔍 [TECHNICIAN] Processing command: "${command}" from ${senderNumber}`);
        
        // Help Commands
        if (command === 'teknisi') {
            logger.info(`🔍 [TECHNICIAN] Handling teknisi command`);
            await this.sendTechnicianHelp(remoteJid);
            return;
        }
        
        if (command === 'help') {
            await this.sendTechnicianHelp(remoteJid);
            return;
        }
        
        // Trouble Report Commands (PRIORITAS TINGGI)
        if (command === 'trouble') {
            await this.troubleCommands.handleListTroubleReports(remoteJid);
            return;
        }
        
        if (command.startsWith('status ')) {
            const reportId = messageText.split(' ')[1];
            await this.troubleCommands.handleTroubleReportStatus(remoteJid, reportId);
            return;
        }
        
        if (command.startsWith('update ')) {
            const params = messageText.split(' ').slice(1);
            if (params.length >= 2) {
                const reportId = params[0];
                const newStatus = params[1];
                const notes = params.slice(2).join(' ');
                await this.troubleCommands.handleUpdateTroubleReport(remoteJid, reportId, newStatus, notes);
            }
            return;
        }
        
        if (command.startsWith('selesai ')) {
            const params = messageText.split(' ').slice(1);
            if (params.length >= 1) {
                const reportId = params[0];
                const notes = params.slice(1).join(' ');
                await this.troubleCommands.handleResolveTroubleReport(remoteJid, reportId, notes);
            }
            return;
        }
        
        // Search Commands (untuk teknisi)
        if (command.startsWith('cari ')) {
            const searchTerm = messageText.split(' ').slice(1).join(' ');
            await this.handleSearchCustomer(remoteJid, searchTerm);
            return;
        }
        
        if (command.startsWith('catatan ')) {
            const params = messageText.split(' ').slice(1);
            if (params.length >= 2) {
                const reportId = params[0];
                const notes = params.slice(1).join(' ');
                await this.troubleCommands.handleAddNoteToTroubleReport(remoteJid, reportId, notes);
            }
            return;
        }
        
        if (command === 'help trouble') {
            await this.troubleCommands.handleTroubleReportHelp(remoteJid);
            return;
        }
        
        // PPPoE Commands (PEMASANGAN BARU)
        if (command.startsWith('addpppoe ')) {
            const params = messageText.split(' ').slice(1);
            if (params.length >= 3) {
                const username = params[0];
                const password = params[1];
                const profile = params[2];
                const ipAddress = params[3] || null;
                const customerInfo = params.slice(4).join(' ') || null;
                await this.pppoeCommands.handleAddPPPoE(remoteJid, username, password, profile, ipAddress, customerInfo);
            }
            return;
        }
        
        if (command.startsWith('editpppoe ')) {
            const params = messageText.split(' ').slice(1);
            if (params.length >= 3) {
                const username = params[0];
                const field = params[1];
                const newValue = params.slice(2).join(' ');
                await this.pppoeCommands.handleEditPPPoE(remoteJid, username, field, newValue);
            }
            return;
        }
        
        if (command.startsWith('checkpppoe ')) {
            const username = messageText.split(' ')[1];
            await this.pppoeCommands.handleCheckPPPoEStatus(remoteJid, username);
            return;
        }
        
        if (command.startsWith('restartpppoe ')) {
            const username = messageText.split(' ')[1];
            await this.pppoeCommands.handleRestartPPPoE(remoteJid, username);
            return;
        }
        
        if (command === 'help pppoe') {
            await this.pppoeCommands.handlePPPoEHelp(remoteJid);
            return;
        }
        
        // System Info Commands
        if (command === 'version') {
            const versionMessage = getVersionMessage();
            await this.commands.sendMessage(remoteJid, versionMessage);
            return;
        }
        
        if (command === 'info') {
            const systemInfoMessage = getSystemInfoMessage();
            await this.commands.sendMessage(remoteJid, systemInfoMessage);
            return;
        }
        
        // Basic device commands (terbatas)
        if (command.startsWith('cek ')) {
            const customerNumber = messageText.split(' ')[1];
            await this.commands.handleCekStatus(remoteJid, customerNumber);
            return;
        }
        
        if (command.startsWith('cekstatus ')) {
            const customerNumber = messageText.split(' ')[1];
            await this.commands.handleCekStatus(remoteJid, customerNumber);
            return;
        }
        
        // Search Commands
        if (command.startsWith('cari ')) {
            logger.info(`🔍 [TECHNICIAN] Handling cari command`);
            const searchTerm = messageText.split(' ').slice(1).join(' ');
            await this.handleSearchCustomer(remoteJid, searchTerm);
            return;
        }
        
        // Debug GenieACS Commands (case insensitive)
        if (command.toLowerCase().startsWith('debuggenieacs ')) {
            logger.info(`🔍 [TECHNICIAN] Handling debuggenieacs command`);
            const phoneNumber = messageText.split(' ')[1];
            await this.handleDebugGenieACS(remoteJid, phoneNumber);
            return;
        }
        
        // Simple debug command
        if (command.toLowerCase().startsWith('debug ')) {
            logger.info(`🔍 [TECHNICIAN] Handling debug command`);
            const phoneNumber = messageText.split(' ')[1];
            await this.handleDebugGenieACS(remoteJid, phoneNumber);
            return;
        }
        
        // List all devices command
        if (command === 'listdevices') {
            logger.info(`🔍 [TECHNICIAN] Handling listdevices command`);
            await this.handleListDevices(remoteJid);
            return;
        }
        
        // Unknown command for technician
        await this.commands.sendMessage(remoteJid, 
            `❓ *PERINTAH TIDAK DIKENAL*\n\nPerintah "${command}" tidak dikenali.\n\nKetik *teknisi* untuk melihat menu teknisi.`
        );
    }

    // Handle admin commands
    async handleAdminCommands(remoteJid, senderNumber, command, messageText) {
        // GenieACS Commands
        if (command.startsWith('cek ')) {
            const customerNumber = messageText.split(' ')[1];
            await this.commands.handleCekStatus(remoteJid, customerNumber);
            return;
        }
        
        if (command.startsWith('cekstatus ')) {
            const customerNumber = messageText.split(' ')[1];
            await this.commands.handleCekStatus(remoteJid, customerNumber);
            return;
        }
        
        if (command === 'cekall') {
            await this.commands.handleCekAll(remoteJid);
            return;
        }
        
        if (command.startsWith('refresh ')) {
            const deviceId = messageText.split(' ')[1];
            await this.commands.handleRefresh(remoteJid, deviceId);
            return;
        }
        
        if (command.startsWith('gantissid ')) {
            const params = messageText.split(' ').slice(1);
            if (params.length >= 2) {
                const customerNumber = params[0];
                const newSSID = params.slice(1).join(' ');
                await this.commands.handleGantiSSID(remoteJid, customerNumber, newSSID);
            }
            return;
        }
        
        if (command.startsWith('gantipass ')) {
            const params = messageText.split(' ').slice(1);
            if (params.length >= 2) {
                const customerNumber = params[0];
                const newPassword = params.slice(1).join(' ');
                await this.commands.handleGantiPassword(remoteJid, customerNumber, newPassword);
            }
            return;
        }
        
        if (command.startsWith('reboot ')) {
            const customerNumber = messageText.split(' ')[1];
            await this.commands.handleReboot(remoteJid, customerNumber);
            return;
        }
        
        // Search Commands
        if (command.startsWith('cari ')) {
            logger.info(`🔍 [TECHNICIAN] Handling cari command`);
            const searchTerm = messageText.split(' ').slice(1).join(' ');
            await this.handleSearchCustomer(remoteJid, searchTerm);
            return;
        }
        
        // Debug GenieACS Commands (case insensitive)
        if (command.toLowerCase().startsWith('debuggenieacs ')) {
            logger.info(`🔍 [TECHNICIAN] Handling debuggenieacs command`);
            const phoneNumber = messageText.split(' ')[1];
            await this.handleDebugGenieACS(remoteJid, phoneNumber);
            return;
        }
        
        // Simple debug command
        if (command.toLowerCase().startsWith('debug ')) {
            logger.info(`🔍 [TECHNICIAN] Handling debug command`);
            const phoneNumber = messageText.split(' ')[1];
            await this.handleDebugGenieACS(remoteJid, phoneNumber);
            return;
        }
        
        // List all devices command
        if (command === 'listdevices') {
            logger.info(`🔍 [TECHNICIAN] Handling listdevices command`);
            await this.handleListDevices(remoteJid);
            return;
        }
        
        if (command.startsWith('tag ')) {
            const params = messageText.split(' ').slice(1);
            if (params.length >= 2) {
                const deviceId = params[0];
                const tag = params.slice(1).join(' ');
                await this.commands.handleAddTag(remoteJid, deviceId, tag);
            }
            return;
        }
        
        if (command.startsWith('untag ')) {
            const params = messageText.split(' ').slice(1);
            if (params.length >= 2) {
                const deviceId = params[0];
                const tag = params.slice(1).join(' ');
                await this.commands.handleRemoveTag(remoteJid, deviceId, tag);
            }
            return;
        }
        
        if (command.startsWith('tags ')) {
            const deviceId = messageText.split(' ')[1];
            await this.commands.handleListTags(remoteJid, deviceId);
            return;
        }
        
        if (command.startsWith('addtag ')) {
            const params = messageText.split(' ').slice(1);
            if (params.length >= 2) {
                const deviceId = params[0];
                const customerNumber = params[1];
                await this.commands.handleAddTag(remoteJid, deviceId, customerNumber);
            }
            return;
        }
        
        // System Commands
        if (command === 'status') {
            await this.commands.handleStatus(remoteJid);
            return;
        }
        
        if (command === 'restart') {
            await this.commands.handleRestart(remoteJid);
            return;
        }
        
        if (command === 'ya' || command === 'iya' || command === 'yes') {
            await this.commands.handleConfirmRestart(remoteJid);
            return;
        }
        
        if (command === 'tidak' || command === 'no' || command === 'batal') {
            if (global.pendingRestart && global.restartRequestedBy === remoteJid) {
                global.pendingRestart = false;
                global.restartRequestedBy = null;
                await this.commands.sendMessage(remoteJid, 
                    `✅ *RESTART DIBATALKAN*\n\nRestart aplikasi telah dibatalkan.`
                );
            }
            return;
        }
        
        if (command === 'debug resource') {
            await this.commands.handleDebugResource(remoteJid);
            return;
        }
        
        if (command === 'checkgroup') {
            await this.commands.handleCheckGroup(remoteJid);
            return;
        }
        
        if (command.startsWith('setheader ')) {
            const newHeader = messageText.split(' ').slice(1).join(' ');
            await this.commands.handleSetHeader(remoteJid, newHeader);
            return;
        }
        
        // Trouble Report Commands
        if (command === 'trouble') {
            await this.troubleCommands.handleListTroubleReports(remoteJid);
            return;
        }
        
        if (command.startsWith('status ')) {
            const reportId = messageText.split(' ')[1];
            await this.troubleCommands.handleTroubleReportStatus(remoteJid, reportId);
            return;
        }
        
        if (command.startsWith('update ')) {
            const params = messageText.split(' ').slice(1);
            if (params.length >= 2) {
                const reportId = params[0];
                const newStatus = params[1];
                const notes = params.slice(2).join(' ');
                await this.troubleCommands.handleUpdateTroubleReport(remoteJid, reportId, newStatus, notes);
            }
            return;
        }
        
        if (command.startsWith('selesai ')) {
            const params = messageText.split(' ').slice(1);
            if (params.length >= 2) {
                const reportId = params[0];
                const notes = params.slice(1).join(' ');
                await this.troubleCommands.handleResolveTroubleReport(remoteJid, reportId, notes);
            }
            return;
        }
        
        if (command.startsWith('catatan ')) {
            const params = messageText.split(' ').slice(1);
            if (params.length >= 2) {
                const reportId = params[0];
                const notes = params.slice(1).join(' ');
                await this.troubleCommands.handleAddNoteToTroubleReport(remoteJid, reportId, notes);
            }
            return;
        }
        
        if (command === 'help trouble') {
            await this.troubleCommands.handleTroubleReportHelp(remoteJid);
            return;
        }
        
        // PPPoE Commands
        if (command.startsWith('addpppoe ')) {
            const params = messageText.split(' ').slice(1);
            if (params.length >= 3) {
                const username = params[0];
                const password = params[1];
                const profile = params[2];
                const ipAddress = params[3] || null;
                const customerInfo = params.slice(4).join(' ') || null;
                await this.pppoeCommands.handleAddPPPoE(remoteJid, username, password, profile, ipAddress, customerInfo);
            }
            return;
        }
        
        if (command.startsWith('editpppoe ')) {
            const params = messageText.split(' ').slice(1);
            if (params.length >= 3) {
                const username = params[0];
                const field = params[1];
                const newValue = params.slice(2).join(' ');
                await this.pppoeCommands.handleEditPPPoE(remoteJid, username, field, newValue);
            }
            return;
        }
        
        if (command.startsWith('delpppoe ')) {
            const params = messageText.split(' ').slice(1);
            if (params.length >= 1) {
                const username = params[0];
                const reason = params.slice(1).join(' ') || null;
                await this.pppoeCommands.handleDeletePPPoE(remoteJid, username, reason);
            }
            return;
        }
        
        if (command.startsWith('pppoe ')) {
            const filter = messageText.split(' ').slice(1).join(' ');
            await this.pppoeCommands.handleListPPPoE(remoteJid, filter);
            return;
        }
        
        if (command === 'pppoe') {
            await this.pppoeCommands.handleListPPPoE(remoteJid);
            return;
        }
        
        if (command.startsWith('checkpppoe ')) {
            const username = messageText.split(' ')[1];
            await this.pppoeCommands.handleCheckPPPoEStatus(remoteJid, username);
            return;
        }
        
        if (command.startsWith('restartpppoe ')) {
            const username = messageText.split(' ')[1];
            await this.pppoeCommands.handleRestartPPPoE(remoteJid, username);
            return;
        }
        
        if (command === 'help pppoe') {
            await this.pppoeCommands.handlePPPoEHelp(remoteJid);
            return;
        }
        
        // Help Commands
        if (command === 'admin') {
            await this.sendAdminHelp(remoteJid);
            return;
        }
        
        if (command === 'teknisi') {
            await this.sendTechnicianHelp(remoteJid);
            return;
        }
        
        if (command === 'menu' || command === 'help') {
            await this.sendAdminHelp(remoteJid);
            return;
        }
        
        // System Info Commands
        if (command === 'version') {
            const versionMessage = getVersionMessage();
            await this.commands.sendMessage(remoteJid, versionMessage);
            return;
        }
        
        if (command === 'info') {
            const systemInfoMessage = getSystemInfoMessage();
            await this.commands.sendMessage(remoteJid, systemInfoMessage);
            return;
        }
        
        // Unknown command
        await this.commands.sendMessage(remoteJid, 
            `❓ *PERINTAH TIDAK DIKENAL*\n\nPerintah "${command}" tidak dikenali.\n\nKetik *admin* untuk melihat menu lengkap.`
        );
    }

    // Handle customer commands
    async handleCustomerCommands(remoteJid, senderNumber, command, messageText) {
        // Customer-specific commands
        if (command === 'status') {
            await this.handleCustomerStatus(remoteJid, senderNumber);
            return;
        }
        
        if (command === 'menu' || command === 'help') {
            await this.sendCustomerHelp(remoteJid);
            return;
        }
        
        if (command === 'info') {
            await this.handleCustomerInfo(remoteJid, senderNumber);
            return;
        }
        
        // Search Commands (untuk pelanggan - akses terbatas)
        if (command.startsWith('cari ')) {
            const searchTerm = messageText.split(' ').slice(1).join(' ');
            await this.handleCustomerSearch(remoteJid, searchTerm);
            return;
        }
        
        // System Info Commands
        if (command === 'version') {
            const versionMessage = getVersionMessage();
            await this.commands.sendMessage(remoteJid, versionMessage);
            return;
        }
        
        // Unknown command for customer
        await this.commands.sendMessage(remoteJid, 
            `❓ *PERINTAH TIDAK DIKENAL*\n\nPerintah "${command}" tidak dikenali.\n\nKetik *menu* untuk melihat menu pelanggan.`
        );
    }

    // Send admin help message
    async sendAdminHelp(remoteJid) {
        const helpMessage = getAdminHelpMessage();
        await this.commands.sendMessage(remoteJid, helpMessage);
    }
    
    // Send technician help message
    async sendTechnicianHelp(remoteJid) {
        const helpMessage = getTechnicianHelpMessage();
        await this.commands.sendMessage(remoteJid, helpMessage);
    }

    // Send customer help message
    async sendCustomerHelp(remoteJid) {
        const helpMessage = getCustomerHelpMessage();
        await this.commands.sendMessage(remoteJid, helpMessage);
    }

    // Handle customer status request
    async handleCustomerStatus(remoteJid, senderNumber) {
        try {
            // Implementasi cek status pelanggan
            // ... existing code ...
            
            await this.commands.sendMessage(remoteJid, 
                `📱 *STATUS PELANGGAN*\n\nSedang mengecek status perangkat Anda...\nMohon tunggu sebentar.`
            );
            
        } catch (error) {
            logger.error('Error handling customer status', { 
                sender: senderNumber, 
                error: error.message 
            });
            
            await this.commands.sendMessage(remoteJid, 
                `❌ *ERROR*\n\nTerjadi kesalahan saat mengecek status:\n${error.message}`
            );
        }
    }

    // Handle customer info request
    async handleCustomerInfo(remoteJid, senderNumber) {
        try {
            // Implementasi info layanan pelanggan
            // ... existing code ...
            
            await this.commands.sendMessage(remoteJid, 
                `📋 *INFO LAYANAN*\n\nSedang mengambil informasi layanan Anda...\nMohon tunggu sebentar.`
            );
            
        } catch (error) {
            logger.error('Error handling customer info', { 
                sender: senderNumber, 
                error: error.message 
            });
            
            await this.commands.sendMessage(remoteJid, 
                `❌ *ERROR*\n\nTerjadi kesalahan saat mengambil info:\n${error.message}`
            );
        }
    }

    // Handle customer search command (limited access)
    async handleCustomerSearch(remoteJid, searchTerm) {
        try {
            if (!searchTerm || searchTerm.trim() === '') {
                await this.commands.sendMessage(remoteJid, 
                    `❌ *FORMAT SALAH!*\n\n` +
                    `Format: cari [nama_pelanggan]\n` +
                    `Contoh:\n` +
                    `• cari andi\n` +
                    `• cari santo`
                );
                return;
            }

            // Import billing manager
            const billingManager = require('./billing');
            
            // Send processing message
            await this.commands.sendMessage(remoteJid, 
                `🔍 *MENCARI PELANGGAN*\n\nSedang mencari data pelanggan dengan kata kunci: "${searchTerm}"\nMohon tunggu sebentar...`
            );

            // Search customers
            const customers = await billingManager.findCustomersByNameOrPhone(searchTerm);
            
            if (customers.length === 0) {
                await this.commands.sendMessage(remoteJid, 
                    `❌ *PELANGGAN TIDAK DITEMUKAN!*\n\n` +
                    `Tidak ada pelanggan yang ditemukan dengan kata kunci: "${searchTerm}"\n\n` +
                    `💡 *Tips pencarian:*\n` +
                    `• Gunakan nama lengkap atau sebagian\n` +
                    `• Pastikan ejaan benar`
                );
                return;
            }

            // Format search results (limited info for customers)
            let message = `🔍 *HASIL PENCARIAN PELANGGAN*\n\n`;
            message += `Kata kunci: "${searchTerm}"\n`;
            message += `Ditemukan: ${customers.length} pelanggan\n\n`;

            for (let i = 0; i < customers.length; i++) {
                const customer = customers[i];
                const status = customer.status === 'active' ? '🟢 Aktif' : '🔴 Nonaktif';
                
                message += `📋 *${i + 1}. ${customer.name}*\n`;
                message += `📱 Phone: ${customer.phone}\n`;
                message += `📦 Paket: ${customer.package_name || 'N/A'} (${customer.package_speed || 'N/A'})\n`;
                message += `💰 Harga: Rp ${customer.package_price ? customer.package_price.toLocaleString('id-ID') : 'N/A'}\n`;
                message += `📊 Status: ${status}\n`;
                
                if (customer.address) {
                    message += `📍 Alamat: ${customer.address}\n`;
                }
                
                message += `\n`;
            }

            // Add usage instructions
            message += `💡 *Untuk informasi lebih detail, hubungi admin.*`;

            await this.commands.sendMessage(remoteJid, message);

        } catch (error) {
            logger.error('Error handling customer search', { 
                searchTerm, 
                error: error.message 
            });
            
            await this.commands.sendMessage(remoteJid, 
                `❌ *ERROR SISTEM!*\n\n` +
                `Terjadi kesalahan saat mencari pelanggan:\n${error.message}\n\n` +
                `Silakan coba lagi atau hubungi admin.`
            );
        }
    }

    // Handle search customer command
    async handleSearchCustomer(remoteJid, searchTerm) {
        try {
            if (!searchTerm || searchTerm.trim() === '') {
                await this.commands.sendMessage(remoteJid, 
                    `❌ *FORMAT SALAH!*\n\n` +
                    `Format: cari [nama_pelanggan/pppoe_username]\n` +
                    `Contoh:\n` +
                    `• cari andi\n` +
                    `• cari santo\n` +
                    `• cari leha\n` +
                    `• cari 081234567890`
                );
                return;
            }

            // Import billing manager and genieacs
            const billingManager = require('./billing');
            const genieacsApi = require('./genieacs');
            
            // Send processing message
            await this.commands.sendMessage(remoteJid, 
                `🔍 *MENCARI PELANGGAN*\n\nSedang mencari data pelanggan dengan kata kunci: "${searchTerm}"\nMohon tunggu sebentar...`
            );

            // Search customers
            const customers = await billingManager.findCustomersByNameOrPhone(searchTerm);
            
            if (customers.length === 0) {
                await this.commands.sendMessage(remoteJid, 
                    `❌ *PELANGGAN TIDAK DITEMUKAN!*\n\n` +
                    `Tidak ada pelanggan yang ditemukan dengan kata kunci: "${searchTerm}"\n\n` +
                    `💡 *Tips pencarian:*\n` +
                    `• Gunakan nama lengkap atau sebagian\n` +
                    `• Gunakan PPPoE username\n` +
                    `• Gunakan nomor telepon\n` +
                    `• Pastikan ejaan benar`
                );
                return;
            }

            // Format search results
            let message = `🔍 *HASIL PENCARIAN PELANGGAN*\n\n`;
            message += `Kata kunci: "${searchTerm}"\n`;
            message += `Ditemukan: ${customers.length} pelanggan\n\n`;

            for (let i = 0; i < customers.length; i++) {
                const customer = customers[i];
                const status = customer.status === 'active' ? '🟢 Aktif' : '🔴 Nonaktif';
                const paymentStatus = customer.payment_status === 'overdue' ? '🔴 Overdue' : 
                                    customer.payment_status === 'unpaid' ? '🟡 Belum Bayar' : 
                                    customer.payment_status === 'paid' ? '🟢 Lunas' : '⚪ No Invoice';
                
                message += `📋 *${i + 1}. ${customer.name}*\n`;
                message += `📱 Phone: ${customer.phone}\n`;
                message += `👤 Username: ${customer.username || 'N/A'}\n`;
                message += `🌐 PPPoE: ${customer.pppoe_username || 'N/A'}\n`;
                message += `📦 Paket: ${customer.package_name || 'N/A'} (${customer.package_speed || 'N/A'})\n`;
                message += `💰 Harga: Rp ${customer.package_price ? customer.package_price.toLocaleString('id-ID') : 'N/A'}\n`;
                message += `📊 Status: ${status}\n`;
                message += `💳 Payment: ${paymentStatus}\n`;
                
                if (customer.address) {
                    message += `📍 Alamat: ${customer.address}\n`;
                }
                
                // Get comprehensive data using customer dashboard logic
                try {
                    const customerData = await this.getCustomerComprehensiveData(customer.phone);
                    
                    if (customerData.deviceFound) {
                        message += `\n🔧 *DATA PERANGKAT GENIEACS:*\n`;
                        message += `• Status: ${customerData.status}\n`;
                        message += `• Last Inform: ${customerData.lastInform}\n`;
                        message += `• Device ID: ${customerData.deviceId}\n`;
                        message += `• Serial: ${customerData.serialNumber}\n`;
                        message += `• Manufacturer: ${customerData.manufacturer}\n`;
                        message += `• Model: ${customerData.model}\n`;
                        message += `• Hardware: ${customerData.hardwareVersion}\n`;
                        message += `• Firmware: ${customerData.firmware}\n`;
                        message += `• Device Uptime: ${customerData.uptime}\n`;
                        message += `• PPP Uptime: ${customerData.pppUptime}\n`;
                        message += `• PPPoE IP: ${customerData.pppoeIP}\n`;
                        message += `• PPPoE Username: ${customerData.pppoeUsername}\n`;
                        message += `• RX Power: ${customerData.rxPower} dBm\n`;
                        message += `• Temperature: ${customerData.temperature}°C\n`;
                        message += `• SSID 2.4G: ${customerData.ssid}\n`;
                        message += `• SSID 5G: ${customerData.ssid5G}\n`;
                        message += `• User Terkoneksi: ${customerData.connectedUsers}\n`;
                        message += `• PON Mode: ${customerData.ponMode}\n`;
                        
                        if (customerData.tags && customerData.tags.length > 0) {
                            message += `• Tags: ${customerData.tags.join(', ')}\n`;
                        }
                    } else {
                        message += `\n🔧 *DATA PERANGKAT:* ${customerData.message}\n`;
                        message += `• PPPoE Username: ${customer.pppoe_username || 'N/A'}\n`;
                        message += `• Username: ${customer.username || 'N/A'}\n`;
                    }
                } catch (deviceError) {
                    logger.error(`❌ [SEARCH] Error getting device data for ${customer.phone}:`, deviceError.message);
                    message += `\n🔧 *DATA PERANGKAT:* Error mengambil data perangkat\n`;
                    message += `• Error: ${deviceError.message}\n`;
                }
                
                message += `\n`;
            }

            // Add usage instructions
            message += `💡 *Cara menggunakan data di atas:*\n`;
            message += `• Gunakan nomor telepon untuk perintah cek status\n`;
            message += `• Contoh: cek ${customers[0].phone}\n`;
            message += `• Atau: cekstatus ${customers[0].phone}`;

            await this.commands.sendMessage(remoteJid, message);

        } catch (error) {
            logger.error('Error handling search customer', { 
                searchTerm, 
                error: error.message 
            });
            
            await this.commands.sendMessage(remoteJid, 
                `❌ *ERROR SISTEM!*\n\n` +
                `Terjadi kesalahan saat mencari pelanggan:\n${error.message}\n\n` +
                `Silakan coba lagi atau hubungi admin.`
            );
        }
    }

    // Get comprehensive customer data using customer dashboard logic
    async getCustomerComprehensiveData(phone) {
        try {
            // 1. Ambil data customer dari billing terlebih dahulu (coba semua varian phone)
            let customer = null;
            const phoneVariants = this.generatePhoneVariants(phone);
            
            logger.info(`🔍 [COMPREHENSIVE] Searching customer with phone variants:`, phoneVariants);
            
            for (const variant of phoneVariants) {
                try {
                    const billingManager = require('./billing');
                    customer = await billingManager.getCustomerByPhone(variant);
                    if (customer) {
                        logger.info(`✅ [COMPREHENSIVE] Customer found in billing with variant: ${variant}`);
                        break;
                    }
                } catch (error) {
                    logger.warn(`⚠️ [COMPREHENSIVE] Error searching with variant ${variant}:`, error.message);
                }
            }
            
            let device = null;
            let billingData = null;
            
            if (customer) {
                logger.info(`✅ [COMPREHENSIVE] Customer found in billing: ${customer.name} (${customer.phone}) - searched with: ${phone}`);
                
                // 2. CUSTOMER BILLING: Cari device berdasarkan PPPoE username (FAST PATH)
                if (customer.pppoe_username || customer.username) {
                    try {
                        const { genieacsApi } = require('./genieacs');
                        const pppoeToSearch = customer.pppoe_username || customer.username;
                        logger.info(`🔍 [COMPREHENSIVE] Searching device by PPPoE username: ${pppoeToSearch}`);
                        
                        device = await genieacsApi.findDeviceByPPPoE(pppoeToSearch);
                        if (device) {
                            logger.info(`✅ [COMPREHENSIVE] Device found by PPPoE username: ${pppoeToSearch}`);
                        } else {
                            logger.warn(`⚠️ [COMPREHENSIVE] No device found by PPPoE username: ${pppoeToSearch}`);
                        }
                    } catch (error) {
                        logger.error('❌ [COMPREHENSIVE] Error finding device by PPPoE username:', error.message);
                    }
                }
                
                // 3. Jika tidak ditemukan dengan PPPoE, coba dengan tag sebagai fallback
                if (!device) {
                    logger.info(`🔍 [COMPREHENSIVE] Trying tag search as fallback...`);
                    const { genieacsApi } = require('./genieacs');
                    const tagVariants = this.generatePhoneVariants(phone);
                    
                    for (const v of tagVariants) {
                        try {
                            device = await genieacsApi.findDeviceByPhoneNumber(v);
                            if (device) {
                                logger.info(`✅ [COMPREHENSIVE] Device found by tag fallback: ${v}`);
                                break;
                            }
                        } catch (error) {
                            logger.warn(`⚠️ [COMPREHENSIVE] Error searching by tag ${v}:`, error.message);
                        }
                    }
                }
                
                // 4. Siapkan data billing
                try {
                    const billingManager = require('./billing');
                    const invoices = await billingManager.getInvoicesByCustomer(customer.id);
                    billingData = {
                        customer: customer,
                        invoices: invoices || []
                    };
                } catch (error) {
                    logger.error('❌ [COMPREHENSIVE] Error getting billing data:', error);
                    billingData = {
                        customer: customer,
                        invoices: []
                    };
                }
                
            } else {
                // 5. CUSTOMER NON-BILLING: Cari device berdasarkan tag saja (FAST PATH)
                logger.info(`⚠️ [COMPREHENSIVE] Customer not found in billing, searching GenieACS by tag only`);
                
                const { genieacsApi } = require('./genieacs');
                const tagVariants = this.generatePhoneVariants(phone);
                for (const v of tagVariants) {
                    try {
                        device = await genieacsApi.findDeviceByPhoneNumber(v);
                        if (device) {
                            logger.info(`✅ [COMPREHENSIVE] Device found by tag: ${v}`);
                            break;
                        }
                    } catch (error) {
                        logger.warn(`⚠️ [COMPREHENSIVE] Error searching by tag ${v}:`, error.message);
                    }
                }
            }
            
            // 6. Jika tidak ada device di GenieACS, buat data default yang informatif
            if (!device) {
                logger.info(`⚠️ [COMPREHENSIVE] No device found in GenieACS for: ${phone}`);
                
                return {
                    phone: phone,
                    ssid: customer ? `WiFi-${customer.username}` : 'WiFi-Default',
                    status: 'Unknown',
                    lastInform: '-',
                    firmware: '-',
                    rxPower: '-',
                    pppoeIP: '-',
                    pppoeUsername: customer ? (customer.pppoe_username || customer.username) : '-',
                    connectedUsers: '0',
                    billingData: billingData,
                    deviceFound: false,
                    searchMethod: customer ? 'pppoe_username_fallback_tag' : 'tag_only',
                    message: customer ? 
                        'Device ONU tidak ditemukan di GenieACS. Silakan hubungi teknisi untuk setup device.' :
                        'Customer tidak terdaftar di sistem billing. Silakan hubungi admin.'
                };
            }
            
            // 7. Jika ada device di GenieACS, ambil data lengkap
            logger.info(`✅ [COMPREHENSIVE] Processing device data for: ${device._id}`);
            
            const ssid = device?.InternetGatewayDevice?.LANDevice?.['1']?.WLANConfiguration?.['1']?.SSID?._value || 
                         device?.VirtualParameters?.SSID || 
                         (customer ? `WiFi-${customer.username}` : 'WiFi-Default');
            
            const lastInform = device?._lastInform
                ? new Date(device._lastInform).toLocaleString('id-ID')
                : device?.Events?.Inform
                    ? new Date(device.Events.Inform).toLocaleString('id-ID')
                    : device?.InternetGatewayDevice?.DeviceInfo?.['1']?.LastInform?._value
                        ? new Date(device.InternetGatewayDevice.DeviceInfo['1'].LastInform._value).toLocaleString('id-ID')
                        : '-';
            
            const status = lastInform !== '-' ? 'Online' : 'Unknown';
            
            // Extract device parameters
            const rxPower = this.getParameterWithPaths(device, this.parameterPaths.rxPower) || '-';
            const pppoeIP = this.getParameterWithPaths(device, this.parameterPaths.pppoeIP) || '-';
            const pppoeUsername = customer ? (customer.pppoe_username || customer.username) : 
                                 this.getParameterWithPaths(device, this.parameterPaths.pppUsername) || '-';
            const connectedUsers = this.getParameterWithPaths(device, this.parameterPaths.userConnected) || '0';
            const temperature = this.getParameterWithPaths(device, this.parameterPaths.temperature) || '-';
            const ponMode = this.getParameterWithPaths(device, this.parameterPaths.ponMode) || '-';
            const pppUptime = this.getParameterWithPaths(device, this.parameterPaths.pppUptime) || '-';
            const firmware = device?.InternetGatewayDevice?.DeviceInfo?.SoftwareVersion?._value || 
                           device?.VirtualParameters?.softwareVersion || '-';
            const uptime = device?.InternetGatewayDevice?.DeviceInfo?.UpTime?._value || '-';
            const serialNumber = device.DeviceID?.SerialNumber || 
                               device.InternetGatewayDevice?.DeviceInfo?.SerialNumber?._value || 
                               device._id;
            const manufacturer = device.InternetGatewayDevice?.DeviceInfo?.Manufacturer?._value || '-';
            const model = device.DeviceID?.ProductClass || 
                         device.InternetGatewayDevice?.DeviceInfo?.ModelName?._value || '-';
            const hardwareVersion = device.InternetGatewayDevice?.DeviceInfo?.HardwareVersion?._value || '-';
            
            // SSID 5G
            const ssid5G = this.getSSIDValue(device, '5') || 'N/A';
            
            // Tags
            const tags = device._tags || [];
            
            return {
                phone: phone,
                ssid: ssid,
                status: status,
                lastInform: lastInform,
                deviceId: device._id,
                serialNumber: serialNumber,
                manufacturer: manufacturer,
                model: model,
                hardwareVersion: hardwareVersion,
                firmware: firmware,
                uptime: uptime,
                pppUptime: pppUptime,
                pppoeIP: pppoeIP,
                pppoeUsername: pppoeUsername,
                rxPower: rxPower,
                temperature: temperature,
                ssid5G: ssid5G,
                connectedUsers: connectedUsers,
                ponMode: ponMode,
                tags: tags,
                billingData: billingData,
                deviceFound: true,
                searchMethod: customer ? 'pppoe_username_fallback_tag' : 'tag_only'
            };
            
        } catch (error) {
            logger.error('❌ [COMPREHENSIVE] Error in getCustomerComprehensiveData:', error);
            return {
                phone: phone,
                deviceFound: false,
                message: `Error: ${error.message}`,
                searchMethod: 'error'
            };
        }
    }

    // Helper method to check device status
    getDeviceStatus(lastInform) {
        if (!lastInform) return false;
        const now = Date.now();
        const lastInformTime = new Date(lastInform).getTime();
        const timeDiff = now - lastInformTime;
        // Consider device online if last inform was within 5 minutes
        return timeDiff < 5 * 60 * 1000;
    }

    // Helper method to format uptime (from genieacs-commands.js)
    formatUptime(uptimeValue) {
        if (!uptimeValue || uptimeValue === 'N/A') return 'N/A';

        // If already formatted (like "5d 04:50:18"), return as is
        if (typeof uptimeValue === 'string' && uptimeValue.includes('d ')) {
            return uptimeValue;
        }

        // If it's seconds, convert to formatted string
        if (!isNaN(uptimeValue)) {
            const seconds = parseInt(uptimeValue);
            const days = Math.floor(seconds / (24 * 3600));
            const hours = Math.floor((seconds % (24 * 3600)) / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            const secs = seconds % 60;

            let result = '';
            if (days > 0) result += `${days}d `;
            if (hours > 0) result += `${hours}h `;
            if (minutes > 0) result += `${minutes}m `;
            if (secs > 0) result += `${secs}s`;

            return result.trim() || '0s';
        }

        return uptimeValue;
    }

    // Helper method to get device parameters from GenieACS device object
    getDeviceParameters(device) {
        const getParameterWithPaths = (device, paths) => {
            if (!device || !paths || !Array.isArray(paths)) return 'N/A';

            for (const path of paths) {
                try {
                    const value = this.getParameterValue(device, path);
                    if (value && value !== 'N/A') {
                        return value;
                    }
                } catch (error) {
                    // Continue to next path
                }
            }
            return 'N/A';
        };

        const getParameterValue = (device, path) => {
            if (!device || !path) return 'N/A';

            try {
                const pathParts = path.split('.');
                let current = device;

                for (const part of pathParts) {
                    if (current && typeof current === 'object') {
                        current = current[part];
                    } else {
                        return 'N/A';
                    }
                }

                // Handle GenieACS parameter format
                if (current && typeof current === 'object' && current._value !== undefined) {
                    return current._value;
                }

                // Handle direct value
                if (current !== null && current !== undefined && current !== '') {
                    return current;
                }

                return 'N/A';
            } catch (error) {
                return 'N/A';
            }
        };

        const getSSIDValue = (device, configIndex) => {
            try {
                // Try method 1: Using bracket notation for WLANConfiguration
                if (device.InternetGatewayDevice && 
                    device.InternetGatewayDevice.LANDevice && 
                    device.InternetGatewayDevice.LANDevice['1'] && 
                    device.InternetGatewayDevice.LANDevice['1'].WLANConfiguration && 
                    device.InternetGatewayDevice.LANDevice['1'].WLANConfiguration[configIndex] && 
                    device.InternetGatewayDevice.LANDevice['1'].WLANConfiguration[configIndex].SSID) {
                    
                    const ssidObj = device.InternetGatewayDevice.LANDevice['1'].WLANConfiguration[configIndex].SSID;
                    if (ssidObj._value !== undefined) {
                        return ssidObj._value;
                    }
                }
                
                // Try method 2: Using getParameterWithPaths
                const ssidPath = `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${configIndex}.SSID`;
                const ssidValue = getParameterWithPaths(device, [ssidPath]);
                if (ssidValue && ssidValue !== 'N/A') {
                    return ssidValue;
                }
                
                return 'N/A';
            } catch (error) {
                return 'N/A';
            }
        };

        const formatUptime = (uptimeValue) => {
            if (!uptimeValue || uptimeValue === 'N/A') return 'N/A';

            // If already formatted (like "5d 04:50:18"), return as is
            if (typeof uptimeValue === 'string' && uptimeValue.includes('d ')) {
                return uptimeValue;
            }

            // If it's seconds, convert to formatted string
            if (!isNaN(uptimeValue)) {
                const seconds = parseInt(uptimeValue);
                const days = Math.floor(seconds / (24 * 3600));
                const hours = Math.floor((seconds % (24 * 3600)) / 3600);
                const minutes = Math.floor((seconds % 3600) / 60);
                const secs = seconds % 60;

                let result = '';
                if (days > 0) result += `${days}d `;
                if (hours > 0) result += `${hours}h `;
                if (minutes > 0) result += `${minutes}m `;
                if (secs > 0) result += `${secs}s`;

                return result.trim() || '0s';
            }

            return uptimeValue;
        };

        // Parameter paths for different device parameters
        const parameterPaths = {
            rxPower: [
                'VirtualParameters.RXPower',
                'InternetGatewayDevice.WANDevice.1.WANPONInterfaceConfig.RXPower',
                'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.X_ALU-COM_RxPower',
                'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.RxPower',
                'Device.Optical.Interface.1.RxPower'
            ],
            pppoeIP: [
                'VirtualParameters.pppoeIP',
                'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ExternalIPAddress',
                'Device.PPP.Interface.1.IPCPExtensions.RemoteIPAddress'
            ],
            uptime: [
                'VirtualParameters.getdeviceuptime',
                'InternetGatewayDevice.DeviceInfo.UpTime',
                'Device.DeviceInfo.UpTime'
            ],
            firmware: [
                'InternetGatewayDevice.DeviceInfo.SoftwareVersion',
                'Device.DeviceInfo.SoftwareVersion'
            ],
            userConnected: [
                'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.TotalAssociations',
                'VirtualParameters.activedevices',
                'Device.WiFi.AccessPoint.1.AssociatedDeviceNumberOfEntries'
            ],
            temperature: [
                'VirtualParameters.gettemp',
                'InternetGatewayDevice.DeviceInfo.TemperatureStatus.TemperatureValue',
                'Device.DeviceInfo.TemperatureStatus.TemperatureValue'
            ],
            serialNumber: [
                'VirtualParameters.getSerialNumber',
                'InternetGatewayDevice.DeviceInfo.SerialNumber'
            ],
            ponMode: [
                'VirtualParameters.getponmode'
            ]
        };

        return {
            serialNumber: getParameterWithPaths(device, parameterPaths.serialNumber),
            firmware: getParameterWithPaths(device, parameterPaths.firmware),
            rxPower: getParameterWithPaths(device, parameterPaths.rxPower),
            pppoeIP: getParameterWithPaths(device, parameterPaths.pppoeIP),
            uptime: formatUptime(getParameterWithPaths(device, parameterPaths.uptime)),
            temperature: getParameterWithPaths(device, parameterPaths.temperature),
            connectedUsers: getParameterWithPaths(device, parameterPaths.userConnected),
            ponMode: getParameterWithPaths(device, parameterPaths.ponMode),
            ssid: getSSIDValue(device, '1'),
            ssid5G: getSSIDValue(device, '5')
        };
    }

    // Handle list all devices command
    async handleListDevices(remoteJid) {
        try {
            const genieacsApi = require('./genieacs');
            
            await this.commands.sendMessage(remoteJid, 
                `🔍 *LIST ALL DEVICES*\n\nSedang mengambil daftar semua perangkat dari GenieACS...\nMohon tunggu...`
            );

            const allDevices = await genieacsApi.getDevices();
            
            if (!allDevices || allDevices.length === 0) {
                await this.commands.sendMessage(remoteJid, 
                    `❌ *TIDAK ADA PERANGKAT!*\n\nTidak ada perangkat yang ditemukan di GenieACS.`
                );
                return;
            }

            let message = `📱 *DAFTAR SEMUA PERANGKAT*\n\n`;
            message += `Total perangkat: ${allDevices.length}\n\n`;

            // Tampilkan 10 perangkat pertama dengan detail
            const devicesToShow = allDevices.slice(0, 10);
            
            for (let i = 0; i < devicesToShow.length; i++) {
                const device = devicesToShow[i];
                message += `${i + 1}. *Device ID:* ${device._id}\n`;
                message += `   *Tags:* ${device._tags ? device._tags.join(', ') : 'None'}\n`;
                message += `   *Last Inform:* ${device._lastInform ? new Date(device._lastInform).toLocaleString() : 'N/A'}\n`;
                
                // Cek PPPoE username
                const pppoeUsername = this.getParameterWithPaths(device, this.parameterPaths.pppUsername);
                if (pppoeUsername !== 'N/A') {
                    message += `   *PPPoE Username:* ${pppoeUsername}\n`;
                }
                
                // Cek serial number
                const serialNumber = device.InternetGatewayDevice?.DeviceInfo?.SerialNumber?._value || 'N/A';
                if (serialNumber !== 'N/A') {
                    message += `   *Serial:* ${serialNumber}\n`;
                }
                
                message += `\n`;
            }

            if (allDevices.length > 10) {
                message += `... dan ${allDevices.length - 10} perangkat lainnya\n\n`;
            }

            // Tampilkan semua tags yang ada
            const allTags = new Set();
            allDevices.forEach(device => {
                if (device._tags) {
                    device._tags.forEach(tag => allTags.add(tag));
                }
            });

            if (allTags.size > 0) {
                message += `🏷️ *SEMUA TAGS YANG ADA:*\n`;
                const tagsArray = Array.from(allTags).sort();
                message += tagsArray.join(', ');
            }

            await this.commands.sendMessage(remoteJid, message);

        } catch (error) {
            logger.error('Error in handleListDevices:', error);
            await this.commands.sendMessage(remoteJid, 
                `❌ *ERROR SISTEM!*\n\nTerjadi kesalahan saat mengambil daftar perangkat:\n${error.message}`
            );
        }
    }

    // Handle debug GenieACS command
    async handleDebugGenieACS(remoteJid, phoneNumber) {
        try {
            if (!phoneNumber) {
                await this.commands.sendMessage(remoteJid, 
                    `❌ *FORMAT SALAH!*\n\n` +
                    `Format: debuggenieacs [nomor_telepon]\n` +
                    `Contoh: debuggenieacs 087786722675`
                );
                return;
            }

            await this.commands.sendMessage(remoteJid, 
                `🔍 *DEBUG GENIEACS*\n\nSedang mengecek data GenieACS untuk nomor: ${phoneNumber}\nMohon tunggu...`
            );

            // Get comprehensive data using customer dashboard logic
            const customerData = await this.getCustomerComprehensiveData(phoneNumber);
            
            let message = `🔍 *DEBUG GENIEACS*\n\n`;
            message += `📱 *Nomor:* ${phoneNumber}\n`;
            message += `🔍 *Search Method:* ${customerData.searchMethod}\n`;
            message += `📊 *Device Found:* ${customerData.deviceFound ? '✅ Ya' : '❌ Tidak'}\n\n`;

            if (customerData.billingData && customerData.billingData.customer) {
                const customer = customerData.billingData.customer;
                message += `👤 *DATA BILLING:*\n`;
                message += `• Nama: ${customer.name}\n`;
                message += `• Username: ${customer.username || 'N/A'}\n`;
                message += `• PPPoE Username: ${customer.pppoe_username || 'N/A'}\n`;
                message += `• Status: ${customer.status || 'N/A'}\n`;
                message += `• Package: ${customer.package_id || 'N/A'}\n\n`;
            } else {
                message += `❌ *BILLING:* Customer tidak ditemukan di database billing\n\n`;
            }

            if (customerData.deviceFound) {
                message += `🔧 *DATA PERANGKAT GENIEACS:*\n`;
                message += `• Status: ${customerData.status}\n`;
                message += `• Last Inform: ${customerData.lastInform}\n`;
                message += `• Device ID: ${customerData.deviceId}\n`;
                message += `• Serial: ${customerData.serialNumber}\n`;
                message += `• Manufacturer: ${customerData.manufacturer}\n`;
                message += `• Model: ${customerData.model}\n`;
                message += `• Hardware: ${customerData.hardwareVersion}\n`;
                message += `• Firmware: ${customerData.firmware}\n`;
                message += `• Device Uptime: ${customerData.uptime}\n`;
                message += `• PPP Uptime: ${customerData.pppUptime}\n`;
                message += `• PPPoE IP: ${customerData.pppoeIP}\n`;
                message += `• PPPoE Username: ${customerData.pppoeUsername}\n`;
                message += `• RX Power: ${customerData.rxPower} dBm\n`;
                message += `• Temperature: ${customerData.temperature}°C\n`;
                message += `• SSID 2.4G: ${customerData.ssid}\n`;
                message += `• SSID 5G: ${customerData.ssid5G}\n`;
                message += `• User Terkoneksi: ${customerData.connectedUsers}\n`;
                message += `• PON Mode: ${customerData.ponMode}\n`;
                
                if (customerData.tags && customerData.tags.length > 0) {
                    message += `• Tags: ${customerData.tags.join(', ')}\n`;
                }
            } else {
                message += `❌ *PERANGKAT:* ${customerData.message}\n`;
            }

            await this.commands.sendMessage(remoteJid, message);

        } catch (error) {
            logger.error('Error in handleDebugGenieACS:', error);
            await this.commands.sendMessage(remoteJid, 
                `❌ *ERROR SISTEM!*\n\nTerjadi kesalahan saat debug GenieACS:\n${error.message}`
            );
        }
    }

    // Handle welcome message for super admin
    async handleSuperAdminWelcome(sock) {
        if (!global.superAdminWelcomeSent && this.core.getSuperAdmin()) {
            try {
                const superAdminJid = this.core.createJID(this.core.getSuperAdmin());
                if (superAdminJid) {
                    await sock.sendMessage(superAdminJid, {
                        text: `${this.core.getSetting('company_header', 'ALIJAYA BOT MANAGEMENT ISP')}\n👋 *Selamat datang, Super Admin!*\n\nAplikasi WhatsApp Bot berhasil dijalankan.\n\nRekening Donasi Untuk Pembangunan Masjid\n# 4206 0101 2214 534 BRI an DKM BAITUR ROHMAN\n\n${this.core.getSetting('footer_info', 'Internet Tanpa Batas')}`
                    });
                    global.superAdminWelcomeSent = true;
                    logger.info('Pesan selamat datang terkirim ke super admin');
                }
            } catch (err) {
                logger.error('Gagal mengirim pesan selamat datang ke super admin:', err);
            }
        }
    }
}

module.exports = WhatsAppMessageHandlers;
