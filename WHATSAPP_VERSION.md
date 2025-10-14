# Konfigurasi Versi WhatsApp Web

Dokumen ini menjelaskan cara mengatur versi WhatsApp Web yang digunakan oleh aplikasi WhatsApp Gateway berbasis Baileys.

## Gambaran Umum

Aplikasi ini menggunakan library [@whiskeysockets/baileys](https://github.com/WhiskeySockets/Baileys) untuk terhubung dengan WhatsApp Web. Untuk memastikan kompatibilitas dan stabilitas koneksi, kita dapat mengatur versi WhatsApp Web yang digunakan oleh library ini.

## File Konfigurasi

### 1. File `whatsapp-version.js`

File ini berisi konfigurasi versi WhatsApp Web:

```javascript
const { fetchLatestWaWebVersion } = require('@whiskeysockets/baileys');

async function getWhatsAppWebVersion(botName = 'WhatsApp Bot') {
    try {
        // Coba fetch versi terbaru
        const versionInfo = await fetchLatestWaWebVersion();
        console.log(`📱 [${botName}] Using WA Web v${versionInfo.version.join(".")}, isLatest: ${versionInfo.isLatest}`);
        return versionInfo.version;
    } catch (error) {
        console.warn(`⚠️ [${botName}] Failed to fetch latest version, using fallback:`, error.message);
        // Fallback ke versi yang telah ditentukan
        return [2, 3000, 1025190524]; // Versi fallback yang stabil
    }
}
```

### 2. Integrasi dalam File WhatsApp

Versi WhatsApp Web diintegrasikan dalam file konfigurasi WhatsApp:

```javascript
const { getVersion: getWhatsAppWebVersion } = require('./whatsapp-version');

// Dapatkan versi WhatsApp Web
const botName = 'ALIJAYA WhatsApp Bot';
const version = await getWhatsAppWebVersion(botName);

// Gunakan versi dalam konfigurasi Baileys
const sock = makeWASocket({
    // ... konfigurasi lainnya
    version: version
});
```

## Cara Kerja

1. **Pengecekan Versi Otomatis**: Aplikasi akan mencoba mengambil versi WhatsApp Web terbaru menggunakan fungsi `fetchLatestWaWebVersion()`.

2. **Fallback**: Jika gagal mengambil versi terbaru (karena koneksi internet atau masalah lain), aplikasi akan menggunakan versi fallback yang telah ditentukan.

3. **Logging**: Informasi versi yang digunakan akan dicatat dalam log aplikasi untuk memudahkan debugging.

## Mengubah Versi Fallback

Untuk mengubah versi fallback, edit file `config/whatsapp-version.js`:

```javascript
const WHATSAPP_WEB_VERSION = {
    // Versi fallback yang digunakan ketika gagal fetch versi terbaru
    FALLBACK_VERSION: [2, 3000, 1025190524], // <-- Ubah di sini
    
    // Fungsi untuk mendapatkan versi
    getVersion: getWhatsAppWebVersion
};
```

## Rekomendasi Versi

Versi WhatsApp Web yang direkomendasikan:
- **Stabil**: `[2, 3000, 1025190524]`
- **Terbaru**: Gunakan fungsi `fetchLatestWaWebVersion()` untuk mendapatkan versi terbaru secara otomatis

## Troubleshooting

### Masalah Koneksi
Jika mengalami masalah koneksi:
1. Periksa log aplikasi untuk melihat versi WhatsApp Web yang digunakan
2. Coba ubah versi fallback ke versi yang lebih lama
3. Pastikan koneksi internet tersedia jika menggunakan fitur auto-fetch versi

### Kompatibilitas
Jika mengalami masalah kompatibilitas:
1. Periksa dokumentasi Baileys untuk versi yang kompatibel
2. Gunakan versi fallback yang telah teruji
3. Pertimbangkan untuk memperbarui library Baileys ke versi terbaru

## Catatan Penting

- Versi WhatsApp Web yang digunakan akan konsisten setiap kali aplikasi dijalankan
- Menggunakan versi yang konsisten membantu mencegah masalah kompatibilitas
- Selalu uji versi baru sebelum menerapkannya di lingkungan produksi