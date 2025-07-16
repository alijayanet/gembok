#!/usr/bin/env node

/**
 * Script untuk mengupdate file WhatsApp dengan help messages yang baru
 */

const fs = require('fs');
const path = require('path');

// Fungsi untuk mengupdate file WhatsApp
function updateWhatsAppFile(filePath) {
    try {
        console.log(`📝 Mengupdate file: ${filePath}`);
        
        let content = fs.readFileSync(filePath, 'utf8');
        
        // Import help messages
        const importHelp = `const { getAdminHelpMessage, getCustomerHelpMessage, getGeneralHelpMessage } = require('./help-messages');`;
        
        // Cek apakah import sudah ada
        if (!content.includes('require(\'./help-messages\')')) {
            // Tambahkan import setelah require statements yang ada
            const requireIndex = content.lastIndexOf('require(');
            if (requireIndex !== -1) {
                const insertIndex = content.indexOf('\n', requireIndex) + 1;
                content = content.slice(0, insertIndex) + importHelp + '\n' + content.slice(insertIndex);
            }
        }
        
        // Update fungsi sendAdminMenuList
        const adminMenuPattern = /async function sendAdminMenuList\(remoteJid\) \{[\s\S]*?\}/;
        const newAdminMenu = `async function sendAdminMenuList(remoteJid) {
        try {
            console.log(\`Menampilkan menu admin ke \${remoteJid}\`);
            
            // Gunakan help message dari file terpisah
            const adminMessage = getAdminHelpMessage();
            
            // Kirim pesan menu admin
            await sock.sendMessage(remoteJid, { text: adminMessage });
            console.log(\`Pesan menu admin terkirim ke \${remoteJid}\`);
            
        } catch (error) {
            console.error('Error sending admin menu:', error);
            await sock.sendMessage(remoteJid, { 
                text: \`❌ *ERROR*\\n\\nTerjadi kesalahan saat menampilkan menu admin:\\n\${error.message}\` 
            });
        }
    }`;
        
        if (adminMenuPattern.test(content)) {
            content = content.replace(adminMenuPattern, newAdminMenu);
        }
        
        // Update fungsi sendHelpMessage untuk pelanggan
        const helpPattern = /async function sendHelpMessage\(remoteJid\) \{[\s\S]*?\}/;
        const newHelp = `async function sendHelpMessage(remoteJid) {
        try {
            console.log(\`Menampilkan help message ke \${remoteJid}\`);
            
            // Gunakan help message dari file terpisah
            const helpMessage = getGeneralHelpMessage();
            
            // Kirim pesan help
            await sock.sendMessage(remoteJid, { text: helpMessage });
            console.log(\`Pesan help terkirim ke \${remoteJid}\`);
            
        } catch (error) {
            console.error('Error sending help message:', error);
            await sock.sendMessage(remoteJid, { 
                text: \`❌ *ERROR*\\n\\nTerjadi kesalahan saat menampilkan help:\\n\${error.message}\` 
            });
        }
    }`;
        
        if (helpPattern.test(content)) {
            content = content.replace(helpPattern, newHelp);
        }
        
        // Tambahkan fungsi untuk menu pelanggan
        const customerMenuFunction = `
    // Fungsi untuk menampilkan menu pelanggan
    async function sendCustomerMenu(remoteJid) {
        try {
            console.log(\`Menampilkan menu pelanggan ke \${remoteJid}\`);
            
            // Gunakan help message dari file terpisah
            const customerMessage = getCustomerHelpMessage();
            
            // Kirim pesan menu pelanggan
            await sock.sendMessage(remoteJid, { text: customerMessage });
            console.log(\`Pesan menu pelanggan terkirim ke \${remoteJid}\`);
            
        } catch (error) {
            console.error('Error sending customer menu:', error);
            await sock.sendMessage(remoteJid, { 
                text: \`❌ *ERROR*\\n\\nTerjadi kesalahan saat menampilkan menu pelanggan:\\n\${error.message}\` 
            });
        }
    }`;
        
        // Tambahkan fungsi customer menu sebelum module.exports
        const moduleExportsIndex = content.lastIndexOf('module.exports');
        if (moduleExportsIndex !== -1) {
            content = content.slice(0, moduleExportsIndex) + customerMenuFunction + '\n\n' + content.slice(moduleExportsIndex);
        }
        
        // Simpan file yang sudah diupdate
        fs.writeFileSync(filePath, content);
        console.log(`✅ Berhasil mengupdate: ${filePath}`);
        
    } catch (error) {
        console.error(`❌ Error mengupdate ${filePath}:`, error.message);
    }
}

// Daftar file yang perlu diupdate
const filesToUpdate = [
    'config/whatsapp.js',
    'config/whatsapp_temp.js',
    'config/whatsapp_backup.js'
];

// Jalankan update untuk semua file
console.log('🚀 Memulai update help messages...\n');

filesToUpdate.forEach(file => {
    const filePath = path.join(__dirname, '..', file);
    if (fs.existsSync(filePath)) {
        updateWhatsAppFile(filePath);
    } else {
        console.log(`⚠️ File tidak ditemukan: ${filePath}`);
    }
});

console.log('\n✅ Update help messages selesai!');
console.log('\n📋 Ringkasan perubahan:');
console.log('• Menambahkan import help-messages.js');
console.log('• Mengupdate fungsi sendAdminMenuList');
console.log('• Mengupdate fungsi sendHelpMessage');
console.log('• Menambahkan fungsi sendCustomerMenu');
console.log('\n💡 Tips:');
console.log('• Restart aplikasi setelah update');
console.log('• Test perintah "admin" untuk menu admin');
console.log('• Test perintah "menu" untuk menu umum');
console.log('• Test perintah "customer" untuk menu pelanggan'); 