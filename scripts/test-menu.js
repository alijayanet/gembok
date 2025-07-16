#!/usr/bin/env node

/**
 * Script untuk test menu admin dan pelanggan
 */

const { getAdminHelpMessage, getCustomerHelpMessage, getGeneralHelpMessage } = require('../config/help-messages');

console.log('🧪 TEST MENU WHATSAPP BOT\n');

// Test menu admin
console.log('📋 MENU ADMIN:');
console.log('='.repeat(50));
console.log(getAdminHelpMessage());
console.log('\n');

// Test menu pelanggan
console.log('📱 MENU PELANGGAN:');
console.log('='.repeat(50));
console.log(getCustomerHelpMessage());
console.log('\n');

// Test menu umum
console.log('🤖 MENU UMUM:');
console.log('='.repeat(50));
console.log(getGeneralHelpMessage());
console.log('\n');

console.log('✅ Test menu selesai!');
console.log('\n💡 Cara menggunakan:');
console.log('• Kirim "admin" ke bot untuk menu admin');
console.log('• Kirim "customer" atau "pelanggan" untuk menu pelanggan');
console.log('• Kirim "menu" atau "help" untuk menu umum');
console.log('\n🔧 Perintah test:');
console.log('• admin - Menu admin lengkap');
console.log('• customer - Menu pelanggan');
console.log('• pelanggan - Menu pelanggan (alias)');
console.log('• menu - Menu umum');
console.log('• help - Menu umum (alias)'); 