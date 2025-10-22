const express = require('express');
const router = express.Router();
const { getHotspotProfiles } = require('../config/mikrotik');
const { getSettingsWithCache } = require('../config/settingsManager');
const billingManager = require('../config/billing');
const logger = require('../config/logger');

// Helper function untuk format pesan voucher WhatsApp
function formatVoucherMessage(vouchers, purchase) {
    let message = `🛒 *VOUCHER HOTSPOT BERHASIL DIBELI*\n\n`;
    message += `👤 Nama: ${purchase.customer_name}\n`;
    message += `📱 No HP: ${purchase.customer_phone}\n`;
    message += `💰 Total: Rp ${purchase.amount.toLocaleString('id-ID')}\n\n`;

    message += `🎫 *DETAIL VOUCHER:*\n\n`;

    vouchers.forEach((voucher, index) => {
        message += `${index + 1}. *${voucher.username}*\n`;
        message += `   Password: ${voucher.password}\n`;
        message += `   Profile: ${voucher.profile}\n\n`;
    });

    message += `🌐 *CARA PENGGUNAAN:*\n`;
    message += `1. Hubungkan ke WiFi hotspot\n`;
    message += `2. Buka browser ke http://192.168.88.1\n`;
    message += `3. Masukkan Username & Password di atas\n`;
    message += `4. Klik Login\n\n`;

    message += `⏰ *MASA AKTIF:* Sesuai paket yang dipilih\n\n`;
    message += `📞 *BANTUAN:* Hubungi admin jika ada kendala\n\n`;
    message += `Terima kasih telah menggunakan layanan kami! 🚀`;

    return message;
}

// Helper function untuk format pesan voucher dengan link success page
function formatVoucherMessageWithSuccessPage(vouchers, purchase, successUrl) {
    let message = `🛒 *VOUCHER HOTSPOT BERHASIL DIBELI*\n\n`;
    message += `👤 Nama: ${purchase.customer_name}\n`;
    message += `📱 No HP: ${purchase.customer_phone}\n`;
    message += `💰 Total: Rp ${purchase.amount.toLocaleString('id-ID')}\n\n`;

    message += `🎫 *DETAIL VOUCHER:*\n\n`;

    vouchers.forEach((voucher, index) => {
        message += `${index + 1}. *${voucher.username}*\n`;
        message += `   Password: ${voucher.password}\n`;
        message += `   Profile: ${voucher.profile}\n\n`;
    });

    message += `🌐 *LIHAT DETAIL LENGKAP:*\n`;
    message += `${successUrl}\n\n`;

    message += `🌐 *CARA PENGGUNAAN:*\n`;
    message += `1. Hubungkan ke WiFi hotspot\n`;
    message += `2. Buka browser ke http://192.168.88.1\n`;
    message += `3. Masukkan Username & Password di atas\n`;
    message += `4. Klik Login\n\n`;

    message += `⏰ *MASA AKTIF:* Sesuai paket yang dipilih\n\n`;

    message += `📞 *BANTUAN:* Hubungi admin jika ada kendala\n\n`;
    message += `Terima kasih telah menggunakan layanan kami! 🚀`;

    return message;
}

// Function untuk handle voucher webhook (bisa dipanggil dari universal webhook)
async function handleVoucherWebhook(body, headers) {
    try {
        console.log('Received voucher payment webhook:', body);

        // Gunakan PaymentGatewayManager untuk konsistensi
        const PaymentGatewayManager = require('../config/paymentGateway');
        const paymentGateway = new PaymentGatewayManager();
        
        // Tentukan gateway berdasarkan payload
        let gateway = 'tripay'; // Default ke tripay
        if (body.transaction_status) {
            gateway = 'midtrans';
        } else if (body.status === 'PAID' || body.status === 'EXPIRED' || body.status === 'FAILED') {
            gateway = 'tripay';
        } else if (body.status === 'settled' || body.status === 'expired' || body.status === 'failed') {
            gateway = 'xendit';
        }

        console.log(`Processing webhook with gateway: ${gateway}`);

        // Process webhook menggunakan PaymentGatewayManager
        const webhookResult = await paymentGateway.handleWebhook({ body, headers }, gateway);
        console.log('Webhook result:', webhookResult);

        const { order_id, status, amount, payment_type } = webhookResult;

        if (!order_id) {
            console.log('No order_id found in webhook payload');
            return {
                success: false,
                message: 'Order ID tidak ditemukan dalam webhook payload'
            };
        }

        // Cari purchase berdasarkan order_id
        const sqlite3 = require('sqlite3').verbose();
        const db = new sqlite3.Database('./data/billing.db');

        let purchase;
        try {
            // Coba cari berdasarkan invoice_id terlebih dahulu
            const invoiceId = order_id.replace('INV-', '');
            purchase = await new Promise((resolve, reject) => {
                db.get('SELECT * FROM voucher_purchases WHERE invoice_id = ?', [invoiceId], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });
        } catch (error) {
            console.error('Error finding purchase by invoice_id:', error);
            // Fallback: cari berdasarkan order_id langsung
            purchase = await new Promise((resolve, reject) => {
                db.get('SELECT * FROM voucher_purchases WHERE invoice_id = ?', [order_id], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });
        }

        if (!purchase) {
            console.log(`Purchase dengan order_id ${order_id} tidak ditemukan di database`);
            return {
                success: false,
                message: 'Voucher tidak ditemukan',
                details: `Purchase dengan order_id ${order_id} tidak ditemukan. Kemungkinan sudah expired atau order_id tidak valid.`,
                suggestions: [
                    'Periksa kembali link pembayaran yang benar',
                    'Pastikan pembayaran dilakukan dalam batas waktu yang ditentukan',
                    'Hubungi admin jika mengalami kesulitan'
                ]
            };
        }

        // Cek status pembayaran menggunakan status yang sudah dinormalisasi
        if (status === 'success' || status === 'settlement' || status === 'capture') {
            console.log('Payment successful for purchase ID:', purchase.id);

            // Generate voucher SETELAH payment success untuk menghindari voucher terbuang
            let generatedVouchers = [];
            try {
                console.log('Generating vouchers after payment success...');
                generatedVouchers = await generateHotspotVouchersWithRetry({
                    profile: purchase.voucher_profile,
                    count: purchase.voucher_quantity,
                    packageId: purchase.voucher_package,
                    customerName: purchase.customer_name,
                    customerPhone: purchase.customer_phone
                });

                if (generatedVouchers && generatedVouchers.length > 0) {
                    console.log('Vouchers generated successfully:', generatedVouchers.length);
                } else {
                    console.log('No vouchers generated');
                }
            } catch (voucherError) {
                console.error('Error generating vouchers:', voucherError);
                // Log error tapi jangan gagalkan webhook
            }

            // Update status purchase menjadi completed
            await new Promise((resolve, reject) => {
                const updateSql = `UPDATE voucher_purchases 
                                 SET status = 'completed', 
                                     voucher_data = ?, 
                                     updated_at = datetime('now')
                                 WHERE id = ?`;
                db.run(updateSql, [JSON.stringify(generatedVouchers), purchase.id], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            // Kirim voucher via WhatsApp jika ada nomor HP
            if (purchase.customer_phone) {
                try {
                    const { sendMessage } = require('../config/sendMessage');
                    const successUrl = `${process.env.APP_BASE_URL || 'https://alijaya.gantiwifi.online'}/voucher/success/${purchase.id}`;
                    const voucherText = formatVoucherMessageWithSuccessPage(generatedVouchers, purchase, successUrl);
                    const deliveryResult = await sendVoucherWithRetry(purchase.customer_phone, voucherText);
                    
                    // Log delivery result
                    await logVoucherDelivery(purchase.id, purchase.customer_phone, deliveryResult.success, deliveryResult.message);
                    
                    if (deliveryResult.success) {
                        console.log('Voucher sent successfully via WhatsApp');
                    } else {
                        console.log('Failed to send voucher via WhatsApp:', deliveryResult.message);
                    }
                } catch (whatsappError) {
                    console.error('Error sending voucher via WhatsApp:', whatsappError);
                    await logVoucherDelivery(purchase.id, purchase.customer_phone, false, whatsappError.message);
                }
            }

            db.close();
            return {
                success: true,
                message: 'Voucher berhasil dibuat dan dikirim',
                purchase_id: purchase.id,
                vouchers_generated: generatedVouchers.length,
                whatsapp_sent: purchase.customer_phone ? true : false
            };

        } else if (status === 'failed' || status === 'expired' || status === 'cancelled') {
            console.log('Payment failed/expired for purchase ID:', purchase.id);
            
            // Update status menjadi failed
            await new Promise((resolve, reject) => {
                db.run('UPDATE voucher_purchases SET status = ?, updated_at = datetime(\'now\') WHERE id = ?', 
                       [status, purchase.id], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            db.close();
            return {
                success: false,
                message: `Pembayaran ${status}`,
                purchase_id: purchase.id
            };

        } else {
            console.log('Payment status unknown:', status);
            db.close();
            return {
                success: false,
                message: 'Status pembayaran tidak dikenali',
                status: status,
                purchase_id: purchase.id
            };
        }

    } catch (error) {
        console.error('Voucher webhook error:', error);
        return {
            success: false,
            message: 'Error processing voucher webhook: ' + error.message
        };
    }
}

// Webhook handler untuk voucher payment success
router.post('/payment-webhook', async (req, res) => {
    try {
        const result = await handleVoucherWebhook(req.body, req.headers);
        res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
        console.error('Voucher webhook route error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error: ' + error.message
        });
    }
});

// Export functions for testing
module.exports = {
    router,
    handleVoucherWebhook,
    generateHotspotVouchersWithRetry,
    generateHotspotVouchers,
    sendVoucherWithRetry,
    logVoucherDelivery,
    saveVoucherPurchase,
    cleanupFailedVoucher
};
