// Kumpulan respons bot untuk berbagai pertanyaan dan perintah

const { getSetting } = require('./settingsManager');

// Format pesan dengan header dan footer
function formatWithHeaderFooter(message) {
    const COMPANY_HEADER = getSetting('company_header', "📱 ALIJAYA DIGITAL NETWORK 📱\n\n");
    const FOOTER_SEPARATOR = "\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n";
    const FOOTER_INFO = FOOTER_SEPARATOR + getSetting('footer_info', "Powered by Alijaya Digital Network");
    
    return `${COMPANY_HEADER}${message}${FOOTER_INFO}`;
}

// Respons untuk perintah bantuan/menu
const menuResponse = `*DAFTAR PERINTAH*

*Mikrotik:*
• *resource* - Info resource router
• *hotspot* - Daftar user hotspot aktif
• *pppoe* - Daftar koneksi PPPoE aktif
• *offline* - Daftar user PPPoE offline
• *addhotspot [user] [pass] [profile]* - Tambah user hotspot
• *delhotspot [user]* - Hapus user hotspot
• *addpppoe [user] [pass] [profile] [ip]* - Tambah secret PPPoE
• *delpppoe [user]* - Hapus secret PPPoE
• *setprofile [user] [profile]* - Ubah profile PPPoE

*GenieACS:*
• *status* - Cek status perangkat
• *info wifi* - Info WiFi Anda
• *gantiwifi [nama]* - Ganti nama WiFi
• *gantipass [password]* - Ganti password WiFi
• *restart* - Restart perangkat
• *addwan [no] [tipe] [mode]* - Tambah WAN
• *addtag [device] [no]* - Tambah tag pelanggan
• *addpppoe_tag [user] [no]* - Tambah tag via PPPoE`;

// Respons untuk pertanyaan tentang WiFi/SSID
const wifiResponses = [
    {
        title: "Cara Ganti Nama WiFi (SSID) dan Password",
        content: `Halo Kak! 👋

Mau ganti nama WiFi atau passwordnya? Gampang banget kok! Ikuti langkah-langkah berikut ya:

*📱 Lewat WhatsApp*
Ketik perintah berikut:
• *gantiwifi [nama]* - untuk ubah nama WiFi
• *gantipass [password]* - untuk ubah password WiFi
Contoh: gantiwifi RumahKu atau gantipass Pass123Aman

*📱 Lewat Aplikasi ISP Monitor*
1. Login ke aplikasi ISP Monitor dengan nomor pelanggan Kakak
2. Masuk ke menu Dashboard
3. Tekan tombol "Pengaturan WiFi"
4. Ganti nama SSID (nama WiFi) dan password sesuai keinginan
5. Tekan "Simpan" dan tunggu beberapa detik sampai perangkat ter-update

*🌐 Lewat Perangkat ONT Langsung*
1. Buka browser dan ketik 192.168.1.1 di address bar
2. Login dengan username & password admin (bisa ditanyakan ke teknisi kami)
3. Cari menu "WLAN" atau "Wireless"
4. Ubah nama SSID dan password
5. Simpan perubahan dan restart jika diperlukan

Kalau masih bingung, Kakak bisa chat CS kami untuk bantuan lebih lanjut ya! 😊

#KoneksiStabil #WiFiNgebut`
    },
    {
        title: "Tips Mengatur WiFi untuk Kecepatan Optimal",
        content: `Hai Pelanggan Setia! ✨

Biar WiFi makin ngebut, coba tips berikut ini:

*🚀 Pengaturan WiFi Optimal:*
1. Gunakan nama WiFi (SSID) yang unik tanpa karakter khusus
2. Pilih password yang kuat (min. 8 karakter kombinasi huruf & angka)
3. Untuk perangkat terbaru, pisahkan jaringan 2.4GHz & 5GHz untuk performa terbaik
   - 2.4GHz: jangkauan lebih jauh, cocok untuk browsing biasa
   - 5GHz: lebih cepat tapi jangkauan lebih pendek, ideal untuk streaming & gaming

*📍 Penempatan Router:*
- Letakkan di tengah rumah/ruangan
- Hindari dekat barang elektronik lain & tembok tebal

Butuh bantuan pengaturan? Silakan balas chat ini ya! 🙌

#InternetCepat #WiFiLancar`
    },
    {
        title: "Panduan Pengamanan Jaringan WiFi",
        content: `Halo Kak! 🔐

Keamanan WiFi itu penting banget nih! Berikut tips mengamankan jaringan WiFi Kakak:

*🛡️ Pengaturan Keamanan WiFi:*
1. Ganti nama WiFi (SSID) default jadi nama yang tidak mudah ditebak
2. Pakai password yang kuat (min. 12 karakter, kombinasi huruf besar-kecil, angka, & simbol)
3. Aktifkan enkripsi WPA3 (atau minimal WPA2) di pengaturan router
4. Sembunyikan SSID jika perlu (router tidak akan muncul di daftar WiFi umum)
5. Update firmware router secara berkala

Jangan pernah berbagi password WiFi dengan sembarangan ya! Kalau butuh bantuan mengatur keamanan, tim teknisi kami siap membantu 🚀

#WiFiAman #PrivasiTerjaga`
    }
];

// Respons untuk perintah status
const statusResponse = (data) => {
    return `📰 *STATUS PERANGKAT*

• Status: ${data.isOnline ? '🟢 Online' : '❌ Offline'}
• Serial Number: ${data.serialNumber}
• Firmware: ${data.firmware}
• Uptime: ${data.uptime}
• Signal (RX): ${data.rxPower} dBm
• IP PPPoE: ${data.pppoeIP}
• Username PPPoE: ${data.pppUsername}
• SSID 2.4GHz: ${data.ssid}
• SSID 5GHz: ${data.ssid5G}
• Perangkat Terhubung: ${data.connectedUsers}

Last Inform: ${data.lastInform}

Untuk informasi WiFi lengkap, kirim: info wifi
Untuk restart perangkat, kirim: restart`;
};

// Respons untuk perintah info wifi
const wifiInfoResponse = (data) => {
    return `📶 *Informasi WiFi Anda*

*SSID 2.4GHz:* ${data.ssid}
*SSID 5GHz:* ${data.ssid5G}

Untuk mengganti nama WiFi, kirim:
gantiwifi NamaBaruAnda

Untuk mengganti password WiFi, kirim:
gantipass PasswordBaruAnda`;
};

// Respons untuk perintah ganti wifi
const changeWifiResponse = {
    processing: (newSSID) => `⏳ *Memproses Permintaan*

Sedang mengubah nama WiFi menjadi "${newSSID}"...
Proses ini akan memakan waktu beberapa menit.`,
    
    success: (newSSID) => `✅ *NAMA WIFI BERHASIL DIUBAH*

Nama WiFi baru: ${newSSID}

Perangkat Anda akan restart dalam beberapa menit dan WiFi akan tersedia dengan nama baru.`,
    
    error: (error) => `❌ *ERROR*

Terjadi kesalahan saat mengubah nama WiFi: ${error}`,
    
    invalidFormat: `❌ *FORMAT SALAH*

Nama WiFi harus antara 3-32 karakter.

Contoh: gantiwifi RumahSaya`
};

// Respons untuk perintah ganti password
const changePasswordResponse = {
    processing: `⏳ *Memproses Permintaan*

Sedang mengubah password WiFi...
Proses ini akan memakan waktu beberapa menit.`,
    
    success: `✅ *PASSWORD WIFI BERHASIL DIUBAH*

Password WiFi baru telah diatur.

Perangkat Anda akan restart dalam beberapa menit dan WiFi akan tersedia dengan password baru.`,
    
    error: (error) => `❌ *ERROR*

Terjadi kesalahan saat mengubah password WiFi: ${error}`,
    
    invalidFormat: `❌ *FORMAT SALAH*

Password WiFi harus antara 8-63 karakter.

Contoh: gantipass Password123`
};

// Respons untuk perintah restart
const restartResponse = {
    confirmation: `⚠️ *KONFIRMASI RESTART*

Anda yakin ingin me-restart perangkat? Semua koneksi internet dan WiFi akan terputus selama beberapa menit.

Balas dengan *ya* untuk melanjutkan atau *tidak* untuk membatalkan.`,
    
    processing: `⏳ *Memproses Permintaan*

Sedang me-restart perangkat Anda...
Proses ini akan memakan waktu beberapa menit.`,
    
    success: `✅ *RESTART BERHASIL DIKIRIM*

Perangkat Anda akan restart dalam beberapa menit. Koneksi internet dan WiFi akan terputus sementara selama proses restart.`,
    
    cancelled: `✅ *RESTART DIBATALKAN*

Permintaan restart perangkat telah dibatalkan.`,
    
    expired: `❌ *KONFIRMASI KEDALUWARSA*

Permintaan restart telah kedaluwarsa. Silakan kirim perintah restart lagi jika Anda masih ingin me-restart perangkat.`,
    
    error: (error) => `❌ *ERROR*

Terjadi kesalahan saat me-restart perangkat: ${error}`
};

// Respons untuk perangkat tidak ditemukan
const deviceNotFoundResponse = `❌ *PERANGKAT TIDAK DITEMUKAN*

Maaf, perangkat Anda tidak ditemukan dalam sistem kami. Silakan hubungi admin untuk bantuan.`;

// Respons untuk error umum
const generalErrorResponse = (error) => `❌ *ERROR*

Terjadi kesalahan: ${error}

Silakan coba lagi nanti.`;

// Fungsi untuk mendapatkan respons berdasarkan kata kunci
function getResponseByKeywords(message) {
    const lowerMessage = message.toLowerCase();
    
    // Deteksi kata kunci terkait WiFi/SSID
    if (containsWifiKeywords(lowerMessage)) {
        // Logika untuk memilih respons yang paling sesuai
        if (lowerMessage.includes('ganti') || lowerMessage.includes('ubah') || 
            lowerMessage.includes('cara') || lowerMessage.includes('bagaimana')) {
            // Ini pertanyaan tentang cara mengubah WiFi
            return wifiResponses[0];
        } else if (lowerMessage.includes('lemot') || lowerMessage.includes('lambat') || 
                  lowerMessage.includes('cepat') || lowerMessage.includes('kencang') ||
                  lowerMessage.includes('ngebut')) {
            // Ini pertanyaan tentang kecepatan
            return wifiResponses[1];
        } else if (lowerMessage.includes('aman') || lowerMessage.includes('keamanan') || 
                  lowerMessage.includes('bahaya') || lowerMessage.includes('bobol')) {
            // Ini pertanyaan tentang keamanan
            return wifiResponses[2];
        }
        
        // Pilih respons secara random dari array wifiResponses jika tidak ada yang spesifik
        return wifiResponses[Math.floor(Math.random() * wifiResponses.length)];
    }
    
    // Kembalikan null jika tidak ada keyword yang cocok
    return null;
}

// Helper function untuk cek apakah pesan mengandung kata kunci terkait WiFi
function containsWifiKeywords(message) {
    const wifiKeywords = ['wifi', 'ssid', 'password', 'internet', 'router', 'modem', 'koneksi'];
    return wifiKeywords.some(keyword => message.includes(keyword));
}

module.exports = {
    formatWithHeaderFooter,
    menuResponse,
    wifiResponses,
    statusResponse,
    wifiInfoResponse,
    changeWifiResponse,
    changePasswordResponse,
    restartResponse,
    deviceNotFoundResponse,
    generalErrorResponse,
    getResponseByKeywords
};
