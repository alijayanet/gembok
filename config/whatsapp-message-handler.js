const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const logger = require('./logger');

class WhatsAppMessageHandler {
    constructor() {
        this.dbPath = path.join(__dirname, '../data/billing.db');
        this.db = new sqlite3.Database(this.dbPath);
        
        // Define response patterns for technician messages
        this.responsePatterns = {
            // Confirmation patterns
            'TERIMA': { action: 'confirm_reception', status: 'assigned' },
            'OK': { action: 'confirm_reception', status: 'assigned' },
            'KONFIRM': { action: 'confirm_reception', status: 'assigned' },
            
            // Start installation patterns
            'MULAI': { action: 'start_installation', status: 'in_progress' },
            'START': { action: 'start_installation', status: 'in_progress' },
            'PROSES': { action: 'start_installation', status: 'in_progress' },
            
            // Complete installation patterns
            'SELESAI': { action: 'complete_installation', status: 'completed' },
            'DONE': { action: 'complete_installation', status: 'completed' },
            'FINISH': { action: 'complete_installation', status: 'completed' },
            
            // Help patterns
            'BANTU': { action: 'request_help', status: null },
            'HELP': { action: 'request_help', status: null },
            'TOLONG': { action: 'request_help', status: null },
            
            // Problem report patterns
            'MASALAH': { action: 'report_problem', status: null },
            'ISSUE': { action: 'report_problem', status: null },
            'KENDALA': { action: 'report_problem', status: null },
            
            // Additional report patterns
            'LAPOR': { action: 'additional_report', status: null },
            'REPORT': { action: 'additional_report', status: null },
            'TAMBAHAN': { action: 'additional_report', status: null }
        };
    }

    // Process incoming WhatsApp message from technician
    async processTechnicianMessage(phone, message, technicianName = null) {
        try {
            // Clean and normalize the message
            const cleanMessage = message.trim().toUpperCase();
            
            // Find matching pattern
            const pattern = this.findMatchingPattern(cleanMessage);
            
            if (!pattern) {
                logger.info(`No matching pattern found for message: "${message}" from ${phone}`);
                return this.sendUnrecognizedMessageResponse(phone);
            }

            // Get technician details
            const technician = await this.getTechnicianByPhone(phone);
            if (!technician) {
                logger.warn(`Technician not found for phone: ${phone}`);
                return this.sendTechnicianNotFoundResponse(phone);
            }

            // Get active installation job for this technician
            const activeJob = await this.getActiveInstallationJob(technician.id);
            if (!activeJob) {
                logger.info(`No active installation job found for technician: ${technician.name}`);
                return this.sendNoActiveJobResponse(phone, technician.name);
            }

            // Process the action
            const result = await this.processAction(pattern.action, technician, activeJob, cleanMessage);
            
            // Send confirmation response
            await this.sendActionConfirmationResponse(phone, pattern.action, activeJob, result);
            
            return result;

        } catch (error) {
            logger.error('Error processing technician message:', error);
            return { success: false, error: error.message };
        }
    }

    // Find matching pattern in the message
    findMatchingPattern(message) {
        for (const [pattern, action] of Object.entries(this.responsePatterns)) {
            if (message.includes(pattern)) {
                return action;
            }
        }
        return null;
    }

    // Get technician by phone number
    async getTechnicianByPhone(phone) {
        return new Promise((resolve, reject) => {
            // Clean phone number
            let cleanPhone = phone.replace(/\D/g, '');
            if (cleanPhone.startsWith('62')) {
                cleanPhone = '0' + cleanPhone.slice(2);
            }
            
            this.db.get(
                'SELECT id, name, phone, role FROM technicians WHERE phone = ? AND is_active = 1',
                [cleanPhone],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
    }

    // Get active installation job for technician
    async getActiveInstallationJob(technicianId) {
        return new Promise((resolve, reject) => {
            this.db.get(`
                SELECT * FROM installation_jobs 
                WHERE assigned_technician_id = ? 
                AND status IN ('assigned', 'in_progress')
                ORDER BY created_at DESC 
                LIMIT 1
            `, [technicianId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    // Process the action based on pattern
    async processAction(action, technician, job, message) {
        try {
            switch (action) {
                case 'confirm_reception':
                    return await this.confirmJobReception(technician, job);
                
                case 'start_installation':
                    return await this.startInstallation(technician, job);
                
                case 'complete_installation':
                    return await this.completeInstallation(technician, job, message);
                
                case 'request_help':
                    return await this.requestHelp(technician, job, message);
                
                case 'report_problem':
                    return await this.reportProblem(technician, job, message);
                
                case 'additional_report':
                    return await this.additionalReport(technician, job, message);
                
                default:
                    return { success: false, error: 'Unknown action' };
            }
        } catch (error) {
            logger.error(`Error processing action ${action}:`, error);
            return { success: false, error: error.message };
        }
    }

    // Confirm job reception
    async confirmJobReception(technician, job) {
        try {
            // Update job status to confirmed
            await new Promise((resolve, reject) => {
                this.db.run(`
                    UPDATE installation_jobs 
                    SET status = 'assigned', 
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `, [job.id], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            // Log status change
            await new Promise((resolve, reject) => {
                this.db.run(`
                    INSERT INTO installation_job_status_history (
                        job_id, old_status, new_status, changed_by_type, changed_by_id, notes
                    ) VALUES (?, ?, 'assigned', 'technician', ?, 'Konfirmasi penerimaan tugas via WhatsApp')
                `, [job.id, job.status, technician.id], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            logger.info(`Technician ${technician.name} confirmed reception of job ${job.job_number}`);
            return { success: true, action: 'reception_confirmed', message: 'Penerimaan tugas dikonfirmasi' };

        } catch (error) {
            logger.error('Error confirming job reception:', error);
            return { success: false, error: error.message };
        }
    }

    // Start installation
    async startInstallation(technician, job) {
        try {
            // Update job status to in progress
            await new Promise((resolve, reject) => {
                this.db.run(`
                    UPDATE installation_jobs 
                    SET status = 'in_progress', 
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `, [job.id], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            // Log status change
            await new Promise((resolve, reject) => {
                this.db.run(`
                    INSERT INTO installation_job_status_history (
                        job_id, old_status, new_status, changed_by_type, changed_by_id, notes
                    ) VALUES (?, ?, 'in_progress', 'technician', ?, 'Mulai instalasi via WhatsApp')
                `, [job.id, job.status, technician.id], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            logger.info(`Technician ${technician.name} started installation for job ${job.job_number}`);
            return { success: true, action: 'installation_started', message: 'Instalasi dimulai' };

        } catch (error) {
            logger.error('Error starting installation:', error);
            return { success: false, error: error.message };
        }
    }

    // Complete installation
    async completeInstallation(technician, job, message) {
        try {
            // Extract completion notes from message
            const completionNotes = this.extractNotesFromMessage(message);
            
            // Update job status to completed
            await new Promise((resolve, reject) => {
                this.db.run(`
                    UPDATE installation_jobs 
                    SET status = 'completed', 
                        notes = COALESCE(?, notes),
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `, [completionNotes, job.id], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            // Log status change
            await new Promise((resolve, reject) => {
                this.db.run(`
                    INSERT INTO installation_job_status_history (
                        job_id, old_status, new_status, changed_by_type, changed_by_id, notes
                    ) VALUES (?, ?, 'completed', 'technician', ?, 'Instalasi selesai via WhatsApp: ${completionNotes}')
                `, [job.id, job.status, technician.id], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            logger.info(`Technician ${technician.name} completed installation for job ${job.job_number}`);
            return { success: true, action: 'installation_completed', message: 'Instalasi selesai', notes: completionNotes };

        } catch (error) {
            logger.error('Error completing installation:', error);
            return { success: false, error: error.message };
        }
    }

    // Request help
    async requestHelp(technician, job, message) {
        try {
            // Log help request
            await new Promise((resolve, reject) => {
                this.db.run(`
                    INSERT INTO installation_job_status_history (
                        job_id, old_status, new_status, changed_by_type, changed_by_id, notes
                    ) VALUES (?, ?, ?, 'technician', ?, 'Minta bantuan via WhatsApp: ${message}')
                `, [job.id, job.status, job.status, technician.id], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            logger.info(`Technician ${technician.name} requested help for job ${job.job_number}`);
            return { success: true, action: 'help_requested', message: 'Permintaan bantuan diterima' };

        } catch (error) {
            logger.error('Error requesting help:', error);
            return { success: false, error: error.message };
        }
    }

    // Report problem
    async reportProblem(technician, job, message) {
        try {
            // Log problem report
            await new Promise((resolve, reject) => {
                this.db.run(`
                    INSERT INTO installation_job_status_history (
                        job_id, old_status, new_status, changed_by_type, changed_by_id, notes
                    ) VALUES (?, ?, ?, 'technician', ?, 'Laporkan masalah via WhatsApp: ${message}')
                `, [job.id, job.status, job.status, technician.id], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            logger.info(`Technician ${technician.name} reported problem for job ${job.job_number}`);
            return { success: true, action: 'problem_reported', message: 'Laporan masalah diterima' };

        } catch (error) {
            logger.error('Error reporting problem:', error);
            return { success: false, error: error.message };
        }
    }

    // Additional report
    async additionalReport(technician, job, message) {
        try {
            // Log additional report
            await new Promise((resolve, reject) => {
                this.db.run(`
                    INSERT INTO installation_job_status_history (
                        job_id, old_status, new_status, changed_by_type, changed_by_id, notes
                    ) VALUES (?, ?, ?, 'technician', ?, 'Laporan tambahan via WhatsApp: ${message}')
                `, [job.id, job.status, job.status, technician.id], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            logger.info(`Technician ${technician.name} sent additional report for job ${job.job_number}`);
            return { success: true, action: 'additional_reported', message: 'Laporan tambahan diterima' };

        } catch (error) {
            logger.error('Error processing additional report:', error);
            return { success: false, error: error.message };
        }
    }

    // Extract notes from message
    extractNotesFromMessage(message) {
        // Remove command words and extract remaining text as notes
        const commandWords = ['SELESAI', 'DONE', 'FINISH', 'LAPOR', 'REPORT', 'TAMBAHAN'];
        let notes = message;
        
        commandWords.forEach(word => {
            notes = notes.replace(new RegExp(word, 'gi'), '').trim();
        });
        
        return notes || 'Instalasi selesai';
    }

    // Send response messages (placeholder - integrate with your WhatsApp sending system)
    async sendUnrecognizedMessageResponse(phone) {
        const message = `❓ *PESAN TIDAK DIKENALI*

Maaf, pesan Anda tidak dapat diproses oleh sistem.

📱 *Gunakan format berikut:*
• *TERIMA* - Konfirmasi penerimaan tugas
• *MULAI* - Mulai instalasi
• *SELESAI* - Tandai selesai
• *BANTU* - Minta bantuan
• *MASALAH* - Laporkan kendala

*ALIJAYA DIGITAL NETWORK*`;

        // TODO: Integrate with your WhatsApp sending system
        logger.info(`Sending unrecognized message response to ${phone}`);
        return { success: true, message: 'Response sent' };
    }

    async sendTechnicianNotFoundResponse(phone) {
        const message = `❌ *TEKNISI TIDAK DITEMUKAN*

Maaf, nomor telepon Anda tidak terdaftar sebagai teknisi aktif.

Silakan hubungi admin untuk verifikasi status teknisi Anda.

*ALIJAYA DIGITAL NETWORK*`;

        // TODO: Integrate with your WhatsApp sending system
        logger.info(`Sending technician not found response to ${phone}`);
        return { success: true, message: 'Response sent' };
    }

    async sendNoActiveJobResponse(phone, technicianName) {
        const message = `📋 *TIDAK ADA TUGAS AKTIF*

Halo ${technicianName},

Saat ini tidak ada tugas instalasi aktif yang ditugaskan kepada Anda.

Silakan tunggu penugasan dari admin atau hubungi admin jika ada pertanyaan.

*ALIJAYA DIGITAL NETWORK*`;

        // TODO: Integrate with your WhatsApp sending system
        logger.info(`Sending no active job response to ${phone}`);
        return { success: true, message: 'Response sent' };
    }

    async sendActionConfirmationResponse(phone, action, job, result) {
        let message = '';
        
        switch (action) {
            case 'confirm_reception':
                message = `✅ *PENERIMAAN TUGAS DIKONFIRMASI*

Tugas instalasi telah dikonfirmasi:

📋 *Detail Job:*
• No. Job: ${job.job_number}
• Pelanggan: ${job.customer_name}
• Status: Ditugaskan ✅

Silakan siapkan peralatan dan lakukan instalasi sesuai jadwal.

*ALIJAYA DIGITAL NETWORK*`;
                break;
                
            case 'start_installation':
                message = `🚀 *INSTALASI DIMULAI*

Instalasi telah dimulai:

📋 *Detail Job:*
• No. Job: ${job.job_number}
• Pelanggan: ${job.customer_name}
• Status: Sedang Berlangsung 🔄

Lakukan instalasi dengan teliti dan aman.

*ALIJAYA DIGITAL NETWORK*`;
                break;
                
            case 'complete_installation':
                message = `🎉 *INSTALASI SELESAI*

Selamat! Instalasi telah berhasil diselesaikan:

📋 *Detail Job:*
• No. Job: ${job.job_number}
• Pelanggan: ${job.customer_name}
• Status: Selesai ✅
• Catatan: ${result.notes || 'Tidak ada catatan'}

Terima kasih telah menyelesaikan tugas dengan baik!

*ALIJAYA DIGITAL NETWORK*`;
                break;
                
            case 'help_requested':
                message = `🆘 *PERMINTAAN BANTUAN DITERIMA*

Permintaan bantuan Anda telah diterima:

📋 *Detail Job:*
• No. Job: ${job.job_number}
• Pelanggan: ${job.customer_name}

Tim support akan segera menghubungi Anda.

📞 *Support:* 081947215703

*ALIJAYA DIGITAL NETWORK*`;
                break;
                
            case 'problem_reported':
                message = `⚠️ *LAPORAN MASALAH DITERIMA*

Laporan masalah Anda telah diterima:

📋 *Detail Job:*
• No. Job: ${job.job_number}
• Pelanggan: ${job.customer_name}

Tim support akan segera menindaklanjuti.

📞 *Support:* 081947215703

*ALIJAYA DIGITAL NETWORK*`;
                break;
                
            case 'additional_reported':
                message = `📝 *LAPORAN TAMBAHAN DITERIMA*

Laporan tambahan Anda telah diterima:

📋 *Detail Job:*
• No. Job: ${job.job_number}
• Pelanggan: ${job.customer_name}

Terima kasih atas informasi tambahan.

*ALIJAYA DIGITAL NETWORK*`;
                break;
                
            default:
                message = `✅ *AKSI BERHASIL DIPROSES*

Aksi Anda telah berhasil diproses oleh sistem.

*ALIJAYA DIGITAL NETWORK*`;
        }

        // TODO: Integrate with your WhatsApp sending system
        logger.info(`Sending action confirmation response to ${phone} for action: ${action}`);
        return { success: true, message: 'Response sent' };
    }
}

module.exports = new WhatsAppMessageHandler();
