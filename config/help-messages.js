// help-messages.js - File untuk menangani pesan help admin dan pelanggan

const { getSetting } = require('./settingsManager');

// Footer info dari settings
const FOOTER_INFO = getSetting('footer_info', 'Juragan Pulsa Wifi Hotspot');

/**
 * Pesan help untuk admin
 */
function getAdminHelpMessage() {
    let message = `👨‍💼 *MENU ADMIN LENGKAP*\n\n`;
    
    // GenieACS Commands
    message += `🔧 *GENIEACS*\n`;
    message += `• *cek [nomor]* — Cek status ONU pelanggan\n`;
    message += `• *cekstatus [nomor]* — Alias cek status pelanggan\n`;
    message += `• *cekall* — Cek semua perangkat\n`;
    message += `• *refresh* — Refresh data perangkat\n`;
    message += `• *gantissid [nomor] [ssid]* — Ubah SSID WiFi\n`;
    message += `• *gantipass [nomor] [password]* — Ubah password WiFi\n`;
    message += `• *reboot [nomor]* — Restart ONU pelanggan\n`;
    message += `• *tag [nomor] [tag]* — Tambah tag\n`;
    message += `• *untag [nomor] [tag]* — Hapus tag\n`;
    message += `• *tags [nomor]* — Lihat tags\n`;
    message += `• *addtag [device_id] [nomor]* — Tambah tag device\n`;
    message += `• *addpppoe_tag [user] [nomor]* — Tambah tag PPPoE\n\n`;
    
    // Mikrotik Commands
    message += `🌐 *MIKROTIK*\n`;
    message += `• *interfaces* — Daftar interface\n`;
    message += `• *interface [nama]* — Detail interface\n`;
    message += `• *enableif [nama]* — Aktifkan interface\n`;
    message += `• *disableif [nama]* — Nonaktifkan interface\n`;
    message += `• *ipaddress* — Alamat IP\n`;
    message += `• *routes* — Tabel routing\n`;
    message += `• *dhcp* — DHCP leases\n`;
    message += `• *ping [ip] [count]* — Test ping\n`;
    message += `• *logs [topics] [count]* — Log Mikrotik\n`;
    message += `• *firewall [chain]* — Status firewall\n`;
    message += `• *users* — Daftar user\n`;
    message += `• *profiles [type]* — Daftar profile\n`;
    message += `• *identity [nama]* — Info router\n`;
    message += `• *clock* — Waktu router\n`;
    message += `• *resource* — Info resource\n`;
    message += `• *reboot* — Restart router\n\n`;
    
    // Hotspot & PPPoE Commands
    message += `📶 *HOTSPOT & PPPoE*\n`;
    message += `• *vcr [username] [profile] [nomor]* — Buat voucher\n`;
    message += `• *hotspot* — User hotspot aktif\n`;
    message += `• *pppoe* — User PPPoE aktif\n`;
    message += `• *offline* — User PPPoE offline\n`;
    message += `• *users* — Daftar semua user\n`;
    message += `• *addhotspot [user] [pass] [profile]* — Tambah user\n`;
    message += `• *addpppoe [user] [pass] [profile] [ip]* — Tambah PPPoE\n`;
    message += `• *setprofile [user] [profile]* — Ubah profile\n`;
    message += `• *remove [username]* — Hapus user\n\n`;
    
    // OTP & Sistem Commands
    message += `🛡️ *OTP & SISTEM*\n`;
    message += `• *otp [nomor]* — Kirim OTP\n`;
    message += `• *status* — Status sistem\n`;
    message += `• *logs* — Log aplikasi\n`;
    message += `• *restart* — Restart aplikasi\n`;
    message += `• *confirm restart* — Konfirmasi restart\n`;
    message += `• *debug resource* — Debug resource\n`;
    message += `• *checkgroup* — Cek status group & nomor\n`;
    message += `• *ya/iya/yes* — Konfirmasi ya\n`;
    message += `• *tidak/no/batal* — Konfirmasi tidak\n\n`;
    
    message += `💡 *TIPS:*\n`;
    message += `• Semua perintah case-insensitive\n`;
    message += `• Bisa menggunakan prefix ! atau /\n`;
    message += `• Contoh: !status atau /status\n\n`;
    
    message += `${FOOTER_INFO}`;
    
    return message;
}

/**
 * Pesan help untuk pelanggan
 */
function getCustomerHelpMessage() {
    let message = `📱 *MENU PELANGGAN*\n\n`;
    
    // Perintah untuk pelanggan
    message += `🔧 *PERANGKAT ANDA*\n`;
    message += `• *status* — Cek status perangkat Anda\n`;
    message += `• *gantiwifi [nama]* — Ganti nama WiFi\n`;
    message += `• *gantipass [password]* — Ganti password WiFi\n`;
    message += `• *devices* — Lihat perangkat terhubung WiFi\n`;
    message += `• *speedtest* — Info bandwidth perangkat\n`;
    message += `• *diagnostic* — Diagnostik jaringan\n`;
    message += `• *history* — Riwayat koneksi\n`;
    message += `• *refresh* — Refresh data perangkat\n\n`;
    
    message += `📞 *BANTUAN*\n`;
    message += `• *menu* — Tampilkan menu ini\n`;
    message += `• *help* — Tampilkan bantuan\n`;
    message += `• *info* — Informasi layanan\n\n`;
    
    message += `💡 *TIPS:*\n`;
    message += `• Pastikan perangkat Anda terdaftar di sistem\n`;
    message += `• Gunakan format: gantiwifi NamaWiFiBaru\n`;
    message += `• Password minimal 8 karakter\n\n`;
    
    message += `${FOOTER_INFO}`;
    
    return message;
}

/**
 * Pesan help umum (untuk non-admin)
 */
function getGeneralHelpMessage() {
    let message = `🤖 *MENU BOT*\n\n`;
    
    message += `📱 *UNTUK PELANGGAN*\n`;
    message += `• *status* — Cek status perangkat\n`;
    message += `• *gantiwifi [nama]* — Ganti nama WiFi\n`;
    message += `• *gantipass [password]* — Ganti password WiFi\n`;
    message += `• *menu* — Tampilkan menu ini\n\n`;
    
    message += `👨‍💼 *UNTUK ADMIN*\n`;
    message += `• *admin* — Menu admin lengkap\n`;
    message += `• *help* — Bantuan umum\n\n`;
    
    message += `💡 *INFO:*\n`;
    message += `• Ketik *admin* untuk menu khusus admin\n`;
    message += `• Semua perintah case-insensitive\n\n`;
    
    message += `${FOOTER_INFO}`;
    
    return message;
}

module.exports = {
    getAdminHelpMessage,
    getCustomerHelpMessage,
    getGeneralHelpMessage
}; 