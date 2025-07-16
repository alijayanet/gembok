const fs = require('fs');
const path = require('path');

const settingsPath = path.join(process.cwd(), 'settings.json');

function getSettingsWithCache() {
  // Untuk kompatibilitas, tetap pakai nama lama, tapi selalu baca ulang file
  try {
    const raw = fs.readFileSync(settingsPath, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    return {};
  }
}

function getSetting(key, defaultValue) {
  const settings = getSettingsWithCache();
  return settings[key] !== undefined ? settings[key] : defaultValue;
}

module.exports = { getSettingsWithCache, getSetting }; 