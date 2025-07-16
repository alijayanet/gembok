const fs = require('fs');
const path = require('path');

const settingsPath = path.join(__dirname, '../settings.json');

function getSettings() {
  const raw = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  // Kompatibilitas: jika admins belum array, konversi dari admins.0, admins.1, dst
  if (!Array.isArray(raw.admins)) {
    const admins = [];
    Object.keys(raw).forEach(key => {
      if (key.startsWith('admins.') && typeof raw[key] === 'string') {
        admins.push(raw[key]);
      }
    });
    raw.admins = admins;
  }
  return raw;
}

function setAdminEnabled(status) {
  const settings = getSettings();
  settings.admin_enabled = status;
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

function isAdmin(number) {
  const settings = getSettings();
  // Pastikan number dan semua admins sudah dalam format string hanya angka (tanpa +, spasi, dsb)
  const clean = n => String(n).replace(/\D/g, '');
  const adminList = (settings.admins || []).map(clean);
  return settings.admin_enabled && adminList.includes(clean(number));
}

function getAdmins() {
  const settings = getSettings();
  return settings.admins || [];
}

function getTechnicianNumbers() {
  const settings = getSettings();
  let numbers = [];
  if (Array.isArray(settings.technician_numbers)) {
    numbers = settings.technician_numbers;
  } else {
    Object.keys(settings).forEach(key => {
      if (key.startsWith('technician_numbers.') && typeof settings[key] === 'string') {
        numbers.push(settings[key]);
      }
    });
  }
  // Normalisasi: hanya angka
  return numbers.map(n => String(n).replace(/\D/g, ''));
}

module.exports = {
  getSettings,
  setAdminEnabled,
  isAdmin,
  getAdmins,
  getTechnicianNumbers
};
