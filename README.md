# Genieacs - Mikrotik - WhatsApp Gateway untuk ISP Management

Rekening Donasi Untuk Pembangunan Masjid
# 4206 0101 2214 534 BRI an DKM BAITUR ROHMAN <br>
Info 08194215703 ALIJAYA
link group tele : https://t.me/alijayaNetAcs
link chanell tele : https://t.me/alijayaNetwork

## Deskripsi Aplikasi

Gembok (GenieAcs Mikrotik dan WA Gateway adalah sistem manajemen ISP terintegrasi yang menggabungkan WhatsApp Gateway dengan portal admin web untuk mengelola:

- **GenieACS** - Monitoring dan manajemen perangkat ONU/ONT
- **Mikrotik PPPoE** - Manajemen user PPPoE dan profile
- **Mikrotik Hotspot** - Sistem voucher dan user hotspot
- **WhatsApp Bot** - Interface perintah via WhatsApp
- **Web Portal** - Dashboard admin dan portal pelanggan

## Fitur Utama

### 🔧 WhatsApp Bot Commands
- **GenieACS**: Cek status ONU, edit SSID/password, reboot device
- **Mikrotik**: Manajemen PPPoE, hotspot, interface, firewall
- **Admin**: Tambah/hapus user, generate voucher, monitoring
- **Pelanggan**: Cek status, ganti WiFi, info layanan

### 🌐 Web Portal
- **Admin Dashboard**: Statistik real-time, grafik bandwidth
- **GenieACS Management**: Edit device, tag pelanggan
- **PPPoE Management**: CRUD user, profile management
- **Hotspot Management**: Generate voucher, user management
- **Settings**: Logo upload, WhatsApp QR, system config

### 📊 Monitoring & Notifications
- Real-time PPPoE connection monitoring
- RX Power monitoring dengan notifikasi
- WhatsApp notifications untuk admin/teknisi
- Auto-restart pada error

## Persyaratan Sistem

- **Node.js** v18+ (direkomendasikan v20+)
- **npm** atau yarn
- **GenieACS** API access
- **Mikrotik** API access
- **WhatsApp** number untuk bot

## Instalasi

### 1. Clone Repository
```bash
apt install git curl -y
git clone https://github.com/alijayanet/gembok
cd gembok
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Konfigurasi Settings

Aplikasi menggunakan file `settings.json` untuk konfigurasi. Edit file `settings.json` dengan pengaturan yang sesuai:

### Penjelasan Konfigurasi Penting:

#### Admin Settings
- `admins.0` - Nomor WhatsApp admin utama
- `admin_username` / `admin_password` - Login web admin
- `admin_enabled` - Enable/disable fitur admin

#### GenieACS Settings
- `genieacs_url` - URL GenieACS server
- `genieacs_username` / `genieacs_password` - Kredensial GenieACS

#### Mikrotik Settings
- `mikrotik_host` / `mikrotik_port` - Host dan port Mikrotik
- `mikrotik_user` / `mikrotik_password` - Kredensial Mikrotik
- `main_interface` - Interface utama untuk monitoring

#### WhatsApp Settings
- `technician_numbers.0`, `technician_numbers.1` - Nomor teknisi
- `technician_group_id` - ID group Telegram untuk notifikasi
- `whatsapp_session_path` - Path untuk session WhatsApp
- `whatsapp_keep_alive` - Keep alive WhatsApp connection

#### Monitoring Settings
- `pppoe_monitor_enable` - Enable PPPoE monitoring
- `pppoe_monitor_interval` - Interval monitoring (ms)
- `rx_power_warning` / `rx_power_critical` - Threshold RX power
- `rx_power_notification_enable` - Enable RX power notifications

#### Server Settings
- `server_port` - Port web server
- `server_host` - Host web server
- `company_header` - Header untuk pesan WhatsApp
- `footer_info` - Footer untuk web portal

### 4. Menjalankan Aplikasi

**Development Mode:**
```bash
npm run dev
```

**Production Mode:**
```bash
npm start
```

**Dengan PM2:**
```bash
pm2 start app.js
```

### 5. Setup WhatsApp Bot

1. **Siapkan 2 nomor WhatsApp:**
   - 1 nomor untuk bot (akan scan QR code)
   - 1 nomor untuk admin (untuk mengirim perintah)

2. **Scan QR Code** yang muncul di terminal untuk login WhatsApp bot

3. **Test dengan perintah**: `status` atau `menu`

## Akses Web Portal

- **Portal Pelanggan**: `http://ipserver:3001`
- **Admin Dashboard**: `http://ipserver:3001/admin/login`
- **Login Admin**: Username dan password yang dikonfigurasi di `settings.json`

## Tampilan Dasboard Pelanggan
<img width="1358" height="650" alt="Image" src="https://github.com/user-attachments/assets/2e14a92c-5f93-45df-9e03-6c20f718ffcc" />
## Tampilan Dasboard ADMIN
<img width="1366" height="728" alt="Image" src="https://github.com/user-attachments/assets/0f2170e4-f7fa-40e7-9434-6b2073740163" />
<img width="1366" height="728" alt="Image" src="https://github.com/user-attachments/assets/16d2f40c-d9ac-46b5-93e2-4dfd51ad4b54" />
<img width="1366" height="728" alt="Image" src="https://github.com/user-attachments/assets/9c9469d5-2dd7-4713-81cc-d762f7fec2f0" />
<img width="1366" height="728" alt="Image" src="https://github.com/user-attachments/assets/d98b8c95-debe-4790-99d9-47f9363a066d" />
<img width="1366" height="728" alt="Image" src="https://github.com/user-attachments/assets/3951eeae-fa16-4c06-b3ed-cf1c0c2fc968" />

## Kontribusi

Untuk berkontribusi pada proyek ini:

1. Fork repository
2. Buat branch fitur baru
3. Commit perubahan
4. Push ke branch
5. Buat Pull Request

## Lisensi

ISC License

## Support

- **Telegram Group**: https://t.me/alijayaNetAcs
- **Telegram Channel**: https://t.me/alijayaNetwork
- **YouTube**: https://www.youtube.com/shorts/qYJFQY7egFw

---

**Jangan lupa untuk mengkonfigurasi file `settings.json` terlebih dahulu sebelum menjalankan aplikasi!**
