let sock = null;

// Fungsi untuk set instance sock
function setSock(sockInstance) {
    sock = sockInstance;
}

// Helper function untuk format nomor telepon
function formatPhoneNumber(number) {
    // Hapus karakter non-digit
    let cleaned = number.replace(/\D/g, '');
    
    // Hapus awalan 0 jika ada
    if (cleaned.startsWith('0')) {
        cleaned = cleaned.substring(1);
    }
    
    // Tambahkan kode negara 62 jika belum ada
    if (!cleaned.startsWith('62')) {
        cleaned = '62' + cleaned;
    }
    
    return cleaned;
}

// Helper function untuk mendapatkan header dan footer dari settings
function getHeaderFooter() {
    try {
        const fs = require('fs');
        const path = require('path');
        const settingsPath = path.join(__dirname, '../settings.json');
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
        
        return {
            header: settings.company_header || 'ALIJAYA BOT MANAGEMENT ISP',
            footer: settings.footer_info || 'Internet Tanpa Batas'
        };
    } catch (error) {
        return {
            header: 'ALIJAYA BOT MANAGEMENT ISP',
            footer: 'Internet Tanpa Batas'
        };
    }
}

// Helper function untuk memformat pesan dengan header dan footer
function formatMessageWithHeaderFooter(message, includeHeader = true, includeFooter = true) {
    const { header, footer } = getHeaderFooter();
    
    let formattedMessage = '';
    
    if (includeHeader) {
        formattedMessage += `🏢 *${header}*\n\n`;
    }
    
    formattedMessage += message;
    
    if (includeFooter) {
        formattedMessage += `\n\n${footer}`;
    }
    
    return formattedMessage;
}

// Fungsi untuk mengirim pesan
async function sendMessage(number, message) {
    if (!sock) {
        console.error('WhatsApp belum terhubung');
        return false;
    }
    try {
        let jid;
        if (typeof number === 'string' && number.endsWith('@g.us')) {
            // Jika group JID, gunakan langsung
            jid = number;
        } else {
            const formattedNumber = formatPhoneNumber(number);
            jid = `${formattedNumber}@s.whatsapp.net`;
        }
        
        // Format pesan dengan header dan footer
        let formattedMessage;
        if (typeof message === 'string') {
            formattedMessage = { text: formatMessageWithHeaderFooter(message) };
        } else if (message.text) {
            formattedMessage = { text: formatMessageWithHeaderFooter(message.text) };
        } else {
            formattedMessage = message;
        }
        
        await sock.sendMessage(jid, formattedMessage);
        return true;
    } catch (error) {
        console.error('Error sending message:', error);
        return false;
    }
}

// Fungsi untuk mengirim pesan ke grup nomor
async function sendGroupMessage(numbers, message) {
    try {
        if (!sock) {
            console.error('Sock instance not set');
            return { success: false, sent: 0, failed: 0, results: [] };
        }

        const results = [];
        let sent = 0;
        let failed = 0;

        // Parse numbers jika berupa string
        let numberArray = numbers;
        if (typeof numbers === 'string') {
            numberArray = numbers.split(',').map(n => n.trim());
        }

        for (const number of numberArray) {
            try {
                // Validasi dan format nomor
                let cleanNumber = number.replace(/\D/g, '');
                
                // Jika dimulai dengan 0, ganti dengan 62
                if (cleanNumber.startsWith('0')) {
                    cleanNumber = '62' + cleanNumber.substring(1);
                }
                
                // Jika tidak dimulai dengan 62, tambahkan
                if (!cleanNumber.startsWith('62')) {
                    cleanNumber = '62' + cleanNumber;
                }
                
                // Validasi panjang nomor (minimal 10 digit setelah 62)
                if (cleanNumber.length < 12) {
                    console.warn(`Skipping invalid WhatsApp number: ${number} (too short)`);
                    failed++;
                    results.push({ number, success: false, error: 'Invalid number format' });
                    continue;
                }

                // Cek apakah nomor terdaftar di WhatsApp
                const [result] = await sock.onWhatsApp(cleanNumber);
                if (!result || !result.exists) {
                    console.warn(`Skipping invalid WhatsApp number: ${cleanNumber} (not registered)`);
                    failed++;
                    results.push({ number: cleanNumber, success: false, error: 'Not registered on WhatsApp' });
                    continue;
                }

                // Kirim pesan
                await sock.sendMessage(`${cleanNumber}@s.whatsapp.net`, { text: formatMessageWithHeaderFooter(message) });
                console.log(`Message sent to: ${cleanNumber}`);
                sent++;
                results.push({ number: cleanNumber, success: true });

            } catch (error) {
                console.error(`Error sending message to ${number}:`, error.message);
                failed++;
                results.push({ number, success: false, error: error.message });
            }
        }

        return {
            success: sent > 0,
            sent,
            failed,
            results
        };
    } catch (error) {
        console.error('Error in sendGroupMessage:', error);
        return { success: false, sent: 0, failed: numberArray ? numberArray.length : 0, results: [] };
    }
}

// Fungsi untuk mengirim pesan ke grup teknisi
async function sendTechnicianMessage(message, priority = 'normal') {
    try {
        // Ambil daftar nomor teknisi dari settings
        const { getSetting } = require('./settingsManager');
        const technicianNumbers = [];
        
        // Ambil nomor teknisi dari settings
        let i = 0;
        while (true) {
            const number = getSetting(`technician_numbers.${i}`, '');
            if (!number) break;
            technicianNumbers.push(number);
            i++;
        }
        
        const technicianGroupId = getSetting('technician_group_id', '');
        let sentToGroup = false;
        let sentToNumbers = false;

        // Penambahan prioritas pesan
        let priorityIcon = '';
        if (priority === 'high') {
            priorityIcon = '🟠 *PENTING* ';
        } else if (priority === 'low') {
            priorityIcon = '🟢 *Info* ';
        }
        const priorityMessage = priorityIcon + message;

        // Kirim ke grup jika ada
        if (technicianGroupId) {
            try {
                await sendMessage(technicianGroupId, priorityMessage);
                sentToGroup = true;
                console.log(`Pesan dikirim ke grup teknisi: ${technicianGroupId}`);
            } catch (e) {
                console.error('Gagal mengirim ke grup teknisi:', e);
            }
        }
        
        // Kirim ke nomor teknisi jika ada
        if (technicianNumbers && technicianNumbers.length > 0) {
            const result = await sendGroupMessage(technicianNumbers, priorityMessage);
            sentToNumbers = result.success;
            console.log(`Pesan dikirim ke nomor teknisi: ${result.sent} berhasil, ${result.failed} gagal`);
        } else {
            // Jika tidak ada nomor teknisi, fallback ke admin
            const adminNumber = getSetting('admins.0', '');
            if (adminNumber) {
                await sendMessage(adminNumber, priorityMessage);
                sentToNumbers = true;
            }
        }
        return sentToGroup || sentToNumbers;
    } catch (error) {
        console.error('Error sending message to technician group:', error);
        return false;
    }
}

module.exports = {
    setSock,
    sendMessage,
    sendGroupMessage,
    sendTechnicianMessage,
    formatMessageWithHeaderFooter,
    getHeaderFooter
};
