const { getSetting } = require('./settingsManager');
const logger = require('./logger');

class WhatsAppPPPoECommands {
    constructor(whatsappCore) {
        this.core = whatsappCore;
        this.sock = null;
    }

    // Set socket instance
    setSock(sock) {
        this.sock = sock;
    }

    // Get socket instance
    getSock() {
        return this.sock || this.core.getSock();
    }

    // Helper function untuk mengirim pesan
    async sendMessage(remoteJid, text) {
        const sock = this.getSock();
        if (!sock) {
            console.error('Sock instance not set');
            return false;
        }

        try {
            await sock.sendMessage(remoteJid, { text });
            return true;
        } catch (error) {
            console.error('Error sending message:', error);
            return false;
        }
    }

    // Command: Tambah user PPPoE baru
    async handleAddPPPoE(remoteJid, username, password, profile, ipAddress, customerInfo) {
        try {
            if (!username || !password || !profile) {
                await this.sendMessage(remoteJid, 
                    `❌ *FORMAT SALAH*\n\nFormat yang benar:\naddpppoe [username] [password] [profile] [ip_optional] [info_pelanggan]\n\nContoh:\naddpppoe john123 password123 Premium 192.168.1.100 "John Doe - Jl. Contoh No. 123"`
                );
                return;
            }

            // Validasi password minimal 8 karakter
            if (password.length < 8) {
                await this.sendMessage(remoteJid, 
                    `❌ *PASSWORD TERLALU PENDEK*\n\nPassword harus minimal 8 karakter.\n\nContoh:\naddpppoe john123 password123 Premium`
                );
                return;
            }

            // Validasi profile yang tersedia
            const validProfiles = ['Basic', 'Standard', 'Premium', 'VIP', 'Enterprise'];
            if (!validProfiles.includes(profile)) {
                await this.sendMessage(remoteJid, 
                    `❌ *PROFILE TIDAK VALID*\n\nProfile yang tersedia:\n• Basic\n• Standard\n• Premium\n• VIP\n• Enterprise\n\nContoh:\naddpppoe john123 password123 Premium`
                );
                return;
            }

            // Simulasi penambahan user PPPoE (akan diintegrasikan dengan MikroTik)
            const success = await this.createPPPoEUser(username, password, profile, ipAddress, customerInfo);
            
            if (success) {
                let message = `✅ *USER PPPoE BERHASIL DITAMBAHKAN*\n\n`;
                message += `👤 *Username*: ${username}\n`;
                message += `🔑 *Password*: ${password}\n`;
                message += `📊 *Profile*: ${profile}\n`;
                
                if (ipAddress) {
                    message += `🌐 *IP Address*: ${ipAddress}\n`;
                }
                
                if (customerInfo) {
                    message += `📱 *Info Pelanggan*: ${customerInfo}\n`;
                }
                
                message += `🕒 *Dibuat Pada*: ${new Date().toLocaleString('id-ID')}\n\n`;
                message += `💡 *Langkah Selanjutnya:*\n`;
                message += `1. Set username & password di ONU pelanggan\n`;
                message += `2. Test koneksi PPPoE\n`;
                message += `3. Verifikasi speed sesuai profile\n`;
                message += `4. Update status di trouble report jika ada`;

                await this.sendMessage(remoteJid, message);
                
                // Log aktivitas
                logger.info(`PPPoE user ${username} berhasil ditambahkan oleh teknisi`);
                
            } else {
                await this.sendMessage(remoteJid, 
                    `❌ *GAGAL MENAMBAHKAN USER PPPoE*\n\nTerjadi kesalahan saat menambahkan user.\nSilakan coba lagi atau hubungi admin.`
                );
            }
            
        } catch (error) {
            console.error('Error in handleAddPPPoE:', error);
            await this.sendMessage(remoteJid, 
                `❌ *ERROR*\n\nTerjadi kesalahan saat menambahkan user PPPoE:\n${error.message}`
            );
        }
    }

    // Command: Edit user PPPoE
    async handleEditPPPoE(remoteJid, username, field, newValue) {
        try {
            if (!username || !field || !newValue) {
                await this.sendMessage(remoteJid, 
                    `❌ *FORMAT SALAH*\n\nFormat yang benar:\neditpppoe [username] [field] [value_baru]\n\nField yang bisa diedit:\n• password - Ganti password\n• profile - Ganti profile\n• ip - Ganti IP address\n• status - Enable/disable\n\nContoh:\neditpppoe john123 password password456\neditpppoe john123 profile VIP`
                );
                return;
            }

            // Validasi field yang bisa diedit
            const validFields = ['password', 'profile', 'ip', 'status'];
            if (!validFields.includes(field)) {
                await this.sendMessage(remoteJid, 
                    `❌ *FIELD TIDAK VALID*\n\nField yang tersedia:\n• password - Ganti password\n• profile - Ganti profile\n• ip - Ganti IP address\n• status - Enable/disable\n\nContoh:\neditpppoe john123 password password456`
                );
                return;
            }

            // Validasi khusus untuk password
            if (field === 'password' && newValue.length < 8) {
                await this.sendMessage(remoteJid, 
                    `❌ *PASSWORD TERLALU PENDEK*\n\nPassword harus minimal 8 karakter.`
                );
                return;
            }

            // Validasi khusus untuk profile
            if (field === 'profile') {
                const validProfiles = ['Basic', 'Standard', 'Premium', 'VIP', 'Enterprise'];
                if (!validProfiles.includes(newValue)) {
                    await this.sendMessage(remoteJid, 
                        `❌ *PROFILE TIDAK VALID*\n\nProfile yang tersedia:\n• Basic\n• Standard\n• Premium\n• VIP\n• Enterprise`
                    );
                    return;
                }
            }

            // Simulasi edit user PPPoE
            const success = await this.updatePPPoEUser(username, field, newValue);
            
            if (success) {
                let message = `✅ *USER PPPoE BERHASIL DIUPDATE*\n\n`;
                message += `👤 *Username*: ${username}\n`;
                message += `📝 *Field*: ${field}\n`;
                message += `🆕 *Value Baru*: ${newValue}\n`;
                message += `🕒 *Update Pada*: ${new Date().toLocaleString('id-ID')}\n\n`;
                
                if (field === 'password') {
                    message += `💡 *Langkah Selanjutnya:*\n`;
                    message += `1. Update password di ONU pelanggan\n`;
                    message += `2. Test koneksi dengan password baru\n`;
                    message += `3. Pastikan pelanggan mendapat info password baru`;
                } else if (field === 'profile') {
                    message += `💡 *Langkah Selanjutnya:*\n`;
                    message += `1. Restart koneksi PPPoE di ONU\n`;
                    message += `2. Test speed sesuai profile baru\n`;
                    message += `3. Verifikasi bandwidth sesuai paket`;
                } else if (field === 'ip') {
                    message += `💡 *Langkah Selanjutnya:*\n`;
                    message += `1. Restart koneksi PPPoE di ONU\n`;
                    message += `2. Verifikasi IP address baru\n`;
                    message += `3. Test koneksi internet`;
                } else if (field === 'status') {
                    message += `💡 *Langkah Selanjutnya:*\n`;
                    message += `1. ${newValue === 'enable' ? 'Aktifkan' : 'Nonaktifkan'} koneksi di ONU\n`;
                    message += `2. Test koneksi internet\n`;
                    message += `3. Update status di trouble report`;
                }

                await this.sendMessage(remoteJid, message);
                
                // Log aktivitas
                logger.info(`PPPoE user ${username} berhasil diupdate field ${field} oleh teknisi`);
                
            } else {
                await this.sendMessage(remoteJid, 
                    `❌ *GAGAL UPDATE USER PPPoE*\n\nTerjadi kesalahan saat mengupdate user.\nSilakan coba lagi atau hubungi admin.`
                );
            }
            
        } catch (error) {
            console.error('Error in handleEditPPPoE:', error);
            await this.sendMessage(remoteJid, 
                `❌ *ERROR*\n\nTerjadi kesalahan saat mengupdate user PPPoE:\n${error.message}`
            );
        }
    }

    // Command: Hapus user PPPoE
    async handleDeletePPPoE(remoteJid, username, reason) {
        try {
            if (!username) {
                await this.sendMessage(remoteJid, 
                    `❌ *FORMAT SALAH*\n\nFormat yang benar:\ndelpppoe [username] [alasan_optional]\n\nContoh:\ndelpppoe john123\natau\ndelpppoe john123 Pelanggan pindah lokasi`
                );
                return;
            }

            // Konfirmasi penghapusan
            if (!reason) {
                await this.sendMessage(remoteJid, 
                    `⚠️ *KONFIRMASI PENGHAPUSAN*\n\nAnda yakin ingin menghapus user PPPoE "${username}"?\n\nKirim ulang dengan alasan untuk konfirmasi:\ndelpppoe ${username} [alasan_penghapusan]\n\nContoh:\ndelpppoe ${username} Pelanggan pindah lokasi`
                );
                return;
            }

            // Simulasi penghapusan user PPPoE
            const success = await this.removePPPoEUser(username, reason);
            
            if (success) {
                let message = `✅ *USER PPPoE BERHASIL DIHAPUS*\n\n`;
                message += `👤 *Username*: ${username}\n`;
                message += `🗑️ *Alasan*: ${reason}\n`;
                message += `🕒 *Dihapus Pada*: ${new Date().toLocaleString('id-ID')}\n\n`;
                message += `💡 *Langkah Selanjutnya:*\n`;
                message += `1. Hapus konfigurasi PPPoE di ONU\n`;
                message += `2. Pastikan tidak ada koneksi aktif\n`;
                message += `3. Update status di trouble report jika ada\n`;
                message += `4. Catat alasan penghapusan untuk audit`;

                await this.sendMessage(remoteJid, message);
                
                // Log aktivitas
                logger.info(`PPPoE user ${username} berhasil dihapus oleh teknisi dengan alasan: ${reason}`);
                
            } else {
                await this.sendMessage(remoteJid, 
                    `❌ *GAGAL MENGHAPUS USER PPPoE*\n\nTerjadi kesalahan saat menghapus user.\nSilakan coba lagi atau hubungi admin.`
                );
            }
            
        } catch (error) {
            console.error('Error in handleDeletePPPoE:', error);
            await this.sendMessage(remoteJid, 
                `❌ *ERROR*\n\nTerjadi kesalahan saat menghapus user PPPoE:\n${error.message}`
            );
        }
    }

    // Command: Lihat daftar user PPPoE
    async handleListPPPoE(remoteJid, filter) {
        try {
            // Simulasi mendapatkan daftar user PPPoE
            const users = await this.getPPPoEUsers(filter);
            
            if (!users || users.length === 0) {
                await this.sendMessage(remoteJid, 
                    `📋 *DAFTAR USER PPPoE*\n\nTidak ada user PPPoE yang ditemukan${filter ? ` dengan filter: ${filter}` : ''}.`
                );
                return;
            }

            let message = `📋 *DAFTAR USER PPPoE*\n\n`;
            
            users.forEach((user, index) => {
                const statusEmoji = user.status === 'active' ? '🟢' : '🔴';
                const statusText = user.status === 'active' ? 'Aktif' : 'Nonaktif';
                
                message += `${index + 1}. *${user.username}*\n`;
                message += `   ${statusEmoji} Status: ${statusText}\n`;
                message += `   📊 Profile: ${user.profile}\n`;
                message += `   🌐 IP: ${user.ip || 'DHCP'}\n`;
                message += `   📱 Customer: ${user.customer || 'N/A'}\n`;
                message += `   🕒 Created: ${new Date(user.createdAt).toLocaleDateString('id-ID')}\n\n`;
            });

            message += `💡 *Command yang tersedia:*\n`;
            message += `• *addpppoe [user] [pass] [profile] [ip] [info]* - Tambah user baru\n`;
            message += `• *editpppoe [user] [field] [value]* - Edit user\n`;
            message += `• *delpppoe [user] [alasan]* - Hapus user\n`;
            message += `• *pppoe [filter]* - Lihat daftar user\n`;
            message += `• *help pppoe* - Bantuan PPPoE`;

            await this.sendMessage(remoteJid, message);
            
        } catch (error) {
            console.error('Error in handleListPPPoE:', error);
            await this.sendMessage(remoteJid, 
                `❌ *ERROR*\n\nTerjadi kesalahan saat mengambil daftar user PPPoE:\n${error.message}`
            );
        }
    }

    // Command: Cek status user PPPoE
    async handleCheckPPPoEStatus(remoteJid, username) {
        try {
            if (!username) {
                await this.sendMessage(remoteJid, 
                    `❌ *FORMAT SALAH*\n\nFormat yang benar:\ncheckpppoe [username]\n\nContoh:\ncheckpppoe john123`
                );
                return;
            }

            // Simulasi cek status user PPPoE
            const userStatus = await this.getPPPoEUserStatus(username);
            
            if (!userStatus) {
                await this.sendMessage(remoteJid, 
                    `❌ *USER TIDAK DITEMUKAN*\n\nUser PPPoE "${username}" tidak ditemukan dalam sistem.`
                );
                return;
            }

            const statusEmoji = userStatus.status === 'active' ? '🟢' : '🔴';
            const statusText = userStatus.status === 'active' ? 'Aktif' : 'Nonaktif';
            const connectionEmoji = userStatus.connected ? '🟢' : '🔴';
            const connectionText = userStatus.connected ? 'Terhubung' : 'Tidak Terhubung';

            let message = `📊 *STATUS USER PPPoE*\n\n`;
            message += `👤 *Username*: ${userStatus.username}\n`;
            message += `📊 *Profile*: ${userStatus.profile}\n`;
            message += `${statusEmoji} *Status*: ${statusText}\n`;
            message += `${connectionEmoji} *Koneksi*: ${connectionText}\n`;
            
            if (userStatus.ip) {
                message += `🌐 *IP Address*: ${userStatus.ip}\n`;
            }
            
            if (userStatus.lastSeen) {
                message += `🕒 *Last Seen*: ${new Date(userStatus.lastSeen).toLocaleString('id-ID')}\n`;
            }
            
            if (userStatus.bandwidth) {
                message += `📈 *Bandwidth*: ${userStatus.bandwidth.download}↓ / ${userStatus.bandwidth.upload}↑\n`;
            }
            
            if (userStatus.customer) {
                message += `📱 *Customer*: ${userStatus.customer}\n`;
            }

            message += `\n💡 *Command yang tersedia:*\n`;
            message += `• *editpppoe ${username} [field] [value]* - Edit user\n`;
            message += `• *delpppoe ${username} [alasan]* - Hapus user\n`;
            message += `• *restartpppoe ${username}* - Restart koneksi`;

            await this.sendMessage(remoteJid, message);
            
        } catch (error) {
            console.error('Error in handleCheckPPPoEStatus:', error);
            await this.sendMessage(remoteJid, 
                `❌ *ERROR*\n\nTerjadi kesalahan saat mengecek status user PPPoE:\n${error.message}`
            );
        }
    }

    // Command: Restart koneksi PPPoE
    async handleRestartPPPoE(remoteJid, username) {
        try {
            if (!username) {
                await this.sendMessage(remoteJid, 
                    `❌ *FORMAT SALAH*\n\nFormat yang benar:\nrestartpppoe [username]\n\nContoh:\nrestartpppoe john123`
                );
                return;
            }

            // Simulasi restart koneksi PPPoE
            const success = await this.restartPPPoEConnection(username);
            
            if (success) {
                let message = `🔄 *KONEKSI PPPoE BERHASIL DIRESTART*\n\n`;
                message += `👤 *Username*: ${username}\n`;
                message += `🕒 *Restart Pada*: ${new Date().toLocaleString('id-ID')}\n\n`;
                message += `💡 *Langkah Selanjutnya:*\n`;
                message += `1. Tunggu 30-60 detik untuk koneksi stabil\n`;
                message += `2. Test koneksi internet\n`;
                message += `3. Verifikasi speed sesuai profile\n`;
                message += `4. Update status di trouble report jika ada`;

                await this.sendMessage(remoteJid, message);
                
                // Log aktivitas
                logger.info(`PPPoE connection ${username} berhasil di-restart oleh teknisi`);
                
            } else {
                await this.sendMessage(remoteJid, 
                    `❌ *GAGAL RESTART KONEKSI PPPoE*\n\nTerjadi kesalahan saat restart koneksi.\nSilakan coba lagi atau hubungi admin.`
                );
            }
            
        } catch (error) {
            console.error('Error in handleRestartPPPoE:', error);
            await this.sendMessage(remoteJid, 
                `❌ *ERROR*\n\nTerjadi kesalahan saat restart koneksi PPPoE:\n${error.message}`
            );
        }
    }

    // Command: Help untuk PPPoE
    async handlePPPoEHelp(remoteJid) {
        const message = `🌐 *BANTUAN COMMAND PPPoE*\n\n` +
            `📋 *Command yang tersedia:*\n\n` +
            `• *addpppoe [user] [pass] [profile] [ip] [info]* - Tambah user PPPoE baru\n` +
            `• *editpppoe [user] [field] [value]* - Edit user PPPoE\n` +
            `• *delpppoe [user] [alasan]* - Hapus user PPPoE\n` +
            `• *pppoe [filter]* - Lihat daftar user PPPoE\n` +
            `• *checkpppoe [user]* - Cek status user PPPoE\n` +
            `• *restartpppoe [user]* - Restart koneksi PPPoE\n` +
            `• *help pppoe* - Tampilkan bantuan ini\n\n` +
            
            `📊 *Profile yang tersedia:*\n` +
            `• Basic - Paket dasar\n` +
            `• Standard - Paket standar\n` +
            `• Premium - Paket premium\n` +
            `• VIP - Paket VIP\n` +
            `• Enterprise - Paket enterprise\n\n` +
            
            `🔧 *Field yang bisa diedit:*\n` +
            `• password - Ganti password\n` +
            `• profile - Ganti profile\n` +
            `• ip - Ganti IP address\n` +
            `• status - Enable/disable user\n\n` +
            
            `💡 *Contoh Penggunaan:*\n` +
            `• addpppoe john123 password123 Premium 192.168.1.100 "John Doe - Jl. Contoh"\n` +
            `• editpppoe john123 password password456\n` +
            `• editpppoe john123 profile VIP\n` +
            `• delpppoe john123 Pelanggan pindah lokasi\n` +
            `• checkpppoe john123\n` +
            `• restartpppoe john123\n\n` +
            
            `⚠️ *PENTING:*\n` +
            `• Password minimal 8 karakter\n` +
            `• Selalu update trouble report setelah setup\n` +
            `• Test koneksi sebelum selesai\n` +
            `• Catat semua perubahan untuk audit`;

        await this.sendMessage(remoteJid, message);
    }

    // Helper functions (akan diintegrasikan dengan MikroTik)
    async createPPPoEUser(username, password, profile, ipAddress, customerInfo) {
        try {
            // Simulasi penambahan user PPPoE
            // Di sini akan diintegrasikan dengan MikroTik API
            logger.info(`Creating PPPoE user: ${username}, profile: ${profile}`);
            
            // Simulasi delay
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            return true;
        } catch (error) {
            logger.error(`Error creating PPPoE user: ${error.message}`);
            return false;
        }
    }

    async updatePPPoEUser(username, field, newValue) {
        try {
            // Simulasi update user PPPoE
            logger.info(`Updating PPPoE user: ${username}, field: ${field}, value: ${newValue}`);
            
            // Simulasi delay
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            return true;
        } catch (error) {
            logger.error(`Error updating PPPoE user: ${error.message}`);
            return false;
        }
    }

    async removePPPoEUser(username, reason) {
        try {
            // Simulasi penghapusan user PPPoE
            logger.info(`Removing PPPoE user: ${username}, reason: ${reason}`);
            
            // Simulasi delay
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            return true;
        } catch (error) {
            logger.error(`Error removing PPPoE user: ${error.message}`);
            return false;
        }
    }

    async getPPPoEUsers(filter) {
        try {
            // Simulasi mendapatkan daftar user PPPoE
            // Di sini akan diintegrasikan dengan MikroTik API
            const mockUsers = [
                {
                    username: 'john123',
                    status: 'active',
                    profile: 'Premium',
                    ip: '192.168.1.100',
                    customer: 'John Doe',
                    createdAt: new Date('2024-12-01')
                },
                {
                    username: 'jane456',
                    status: 'active',
                    profile: 'Standard',
                    ip: '192.168.1.101',
                    customer: 'Jane Smith',
                    createdAt: new Date('2024-12-05')
                }
            ];

            if (filter) {
                return mockUsers.filter(user => 
                    user.username.includes(filter) || 
                    user.customer.includes(filter) ||
                    user.profile.includes(filter)
                );
            }

            return mockUsers;
        } catch (error) {
            logger.error(`Error getting PPPoE users: ${error.message}`);
            return [];
        }
    }

    async getPPPoEUserStatus(username) {
        try {
            // Simulasi cek status user PPPoE
            // Di sini akan diintegrasikan dengan MikroTik API
            const mockStatus = {
                username: username,
                status: 'active',
                profile: 'Premium',
                ip: '192.168.1.100',
                connected: true,
                lastSeen: new Date(),
                bandwidth: {
                    download: '50 Mbps',
                    upload: '25 Mbps'
                },
                customer: 'John Doe'
            };

            return mockStatus;
        } catch (error) {
            logger.error(`Error getting PPPoE user status: ${error.message}`);
            return null;
        }
    }

    async restartPPPoEConnection(username) {
        try {
            // Simulasi restart koneksi PPPoE
            // Di sini akan diintegrasikan dengan MikroTik API
            logger.info(`Restarting PPPoE connection: ${username}`);
            
            // Simulasi delay
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            return true;
        } catch (error) {
            logger.error(`Error restarting PPPoE connection: ${error.message}`);
            return false;
        }
    }
}

module.exports = WhatsAppPPPoECommands;
