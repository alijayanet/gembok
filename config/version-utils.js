// version-utils.js - Utility functions untuk versioning di web admin

const { getSettingsWithCache } = require('./settingsManager');

/**
 * Dapatkan info versi aplikasi untuk web admin
 */
function getVersionInfo() {
    const settings = getSettingsWithCache();
    
    return {
        version: settings.app_version || '1.0.0',
        versionName: settings.version_name || 'Unknown Version',
        versionDate: settings.version_date || 'Unknown Date',
        versionNotes: settings.version_notes || 'No release notes',
        buildNumber: settings.build_number || 'Unknown Build',
        companyHeader: settings.company_header || 'GEMBOK',
        footerInfo: settings.footer_info || 'Info Hubungi : 081947215703'
    };
}

/**
 * Format versi untuk display di web
 */
function getVersionDisplay() {
    const versionInfo = getVersionInfo();
    
    return {
        shortVersion: `v${versionInfo.version}`,
        fullVersion: `${versionInfo.versionName} (v${versionInfo.version})`,
        buildInfo: `Build ${versionInfo.buildNumber}`,
        releaseDate: versionInfo.versionDate,
        releaseNotes: versionInfo.versionNotes
    };
}

/**
 * Format untuk badge versi
 */
function getVersionBadge() {
    const versionInfo = getVersionInfo();
    
    // Tentukan warna badge berdasarkan versi
    let badgeClass = 'badge-secondary';
    if (versionInfo.version.startsWith('3.')) {
        badgeClass = 'badge-danger'; // Major version
    } else if (versionInfo.version.startsWith('2.')) {
        badgeClass = 'badge-warning'; // Minor version
    } else if (versionInfo.version.startsWith('1.')) {
        badgeClass = 'badge-info'; // Patch version
    }
    
    return {
        text: `v${versionInfo.version}`,
        class: badgeClass,
        title: `${versionInfo.versionName} - ${versionInfo.versionDate}`
    };
}

/**
 * Format untuk footer versi
 */
function getVersionFooter() {
    const versionInfo = getVersionInfo();
    
    return {
        copyright: `© ${new Date().getFullYear()} ${versionInfo.companyHeader}`,
        version: `v${versionInfo.version}`,
        build: versionInfo.buildNumber,
        contact: versionInfo.footerInfo
    };
}

/**
 * Format untuk sidebar info
 */
function getSidebarVersionInfo() {
    const versionInfo = getVersionInfo();
    
    return {
        company: versionInfo.companyHeader,
        version: `v${versionInfo.version}`,
        build: versionInfo.buildNumber,
        date: versionInfo.versionDate
    };
}

/**
 * Format untuk dashboard header
 */
function getDashboardHeader() {
    const versionInfo = getVersionInfo();
    
    return {
        title: `${versionInfo.companyHeader}`,
        subtitle: `${versionInfo.versionName}`,
        version: `v${versionInfo.version}`,
        build: versionInfo.buildNumber
    };
}

module.exports = {
    getVersionInfo,
    getVersionDisplay,
    getVersionBadge,
    getVersionFooter,
    getSidebarVersionInfo,
    getDashboardHeader
};
