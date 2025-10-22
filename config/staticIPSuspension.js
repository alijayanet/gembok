const logger = require('./logger');
const { getMikrotikConnection } = require('./mikrotik');
const { getSetting } = require('./settingsManager');

/**
 * Static IP Suspension Manager
 * Menangani isolir untuk pelanggan dengan IP statik (bukan PPPoE)
 */
class StaticIPSuspensionManager {
    constructor() {
        this.suspensionMethods = {
            ADDRESS_LIST: 'address_list',
            DHCP_BLOCK: 'dhcp_block', 
            BANDWIDTH_LIMIT: 'bandwidth_limit',
            FIREWALL_RULE: 'firewall_rule'
        };
    }

    /**
     * Suspend pelanggan dengan IP statik
     * @param {Object} customer - Data pelanggan
     * @param {string} reason - Alasan suspend
     * @param {string} method - Metode suspend (default: address_list)
     */
    async suspendStaticIPCustomer(customer, reason = 'Telat bayar', method = 'address_list') {
        try {
            logger.info(`Suspending static IP customer: ${customer.username} (${reason})`);

            const results = {
                mikrotik: false,
                method_used: null,
                customer_ip: null,
                mac_address: null
            };

            // Tentukan IP pelanggan (bisa dari field static_ip, ip_address, atau lainnya)
            const customerIP = customer.static_ip || customer.ip_address || customer.assigned_ip;
            const macAddress = customer.mac_address;

            if (!customerIP && !macAddress) {
                throw new Error('Customer tidak memiliki IP statik atau MAC address yang terdaftar');
            }

            results.customer_ip = customerIP;
            results.mac_address = macAddress;

            // Pilih metode suspend berdasarkan parameter
            switch (method) {
                case this.suspensionMethods.ADDRESS_LIST:
                    if (customerIP) {
                        const result = await this.suspendByAddressList(customerIP, reason);
                        results.mikrotik = result.success;
                        results.method_used = 'address_list';
                    }
                    break;

                case this.suspensionMethods.DHCP_BLOCK:
                    if (macAddress) {
                        const result = await this.suspendByDHCPBlock(macAddress, reason);
                        results.mikrotik = result.success;
                        results.method_used = 'dhcp_block';
                    }
                    break;

                case this.suspensionMethods.BANDWIDTH_LIMIT:
                    if (customerIP) {
                        const result = await this.suspendByBandwidthLimit(customerIP, reason);
                        results.mikrotik = result.success;
                        results.method_used = 'bandwidth_limit';
                    }
                    break;

                case this.suspensionMethods.FIREWALL_RULE:
                    if (customerIP) {
                        const result = await this.suspendByFirewallRule(customerIP, reason);
                        results.mikrotik = result.success;
                        results.method_used = 'firewall_rule';
                    }
                    break;

                default:
                    throw new Error(`Metode suspend tidak dikenal: ${method}`);
            }

            // Update status pelanggan di database billing
            if (results.mikrotik) {
                try {
                    const billingManager = require('./billing');
                    await billingManager.setCustomerStatusById(customer.id, 'suspended');
                    results.billing = true;
                    logger.info(`Customer ${customer.username} status updated to suspended in billing`);
                } catch (billingError) {
                    logger.error('Error updating customer status in billing:', billingError);
                }
            }

            return {
                success: results.mikrotik,
                results,
                message: results.mikrotik ? 
                    `Static IP customer suspended using ${results.method_used}` : 
                    'Failed to suspend static IP customer'
            };

        } catch (error) {
            logger.error('Error in suspendStaticIPCustomer:', error);
            return {
                success: false,
                error: error.message,
                results: null
            };
        }
    }

    /**
     * Metode 1: Suspend menggunakan Address List (Paling Efektif)
     */
    async suspendByAddressList(customerIP, reason) {
        try {
            const mikrotik = await getMikrotikConnection();
            
            // Pastikan address list "blocked_customers" ada dan firewall rule aktif
            await this.ensureBlockedCustomersSetup();

            // Cek apakah IP sudah ada di address list
            const existingEntries = await mikrotik.write('/ip/firewall/address-list/print', [
                '?list=blocked_customers',
                `?address=${customerIP}`
            ]);

            if (existingEntries && existingEntries.length > 0) {
                logger.warn(`IP ${customerIP} already in blocked list`);
                return { success: true, message: 'Already blocked' };
            }

            // Tambahkan IP ke address list
            await mikrotik.write('/ip/firewall/address-list/add', [
                '=list=blocked_customers',
                `=address=${customerIP}`,
                `=comment=SUSPENDED - ${reason} - ${new Date().toISOString()}`
            ]);

            logger.info(`Static IP ${customerIP} added to blocked_customers address list`);
            return { success: true, message: 'Added to address list' };

        } catch (error) {
            logger.error('Error in suspendByAddressList:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Metode 2: Suspend menggunakan DHCP Block
     */
    async suspendByDHCPBlock(macAddress, reason) {
        try {
            const mikrotik = await getMikrotikConnection();

            // Cari DHCP lease berdasarkan MAC address
            const leases = await mikrotik.write('/ip/dhcp-server/lease/print', [
                `?mac-address=${macAddress}`
            ]);

            if (!leases || leases.length === 0) {
                throw new Error(`DHCP lease not found for MAC ${macAddress}`);
            }

            const lease = leases[0];

            // Block DHCP lease
            await mikrotik.write('/ip/dhcp-server/lease/set', [
                `=.id=${lease['.id']}`,
                '=blocked=yes',
                `=comment=SUSPENDED - ${reason} - ${new Date().toISOString()}`
            ]);

            logger.info(`DHCP lease blocked for MAC ${macAddress}`);
            return { success: true, message: 'DHCP lease blocked' };

        } catch (error) {
            logger.error('Error in suspendByDHCPBlock:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Metode 3: Suspend menggunakan Bandwidth Limit (Soft Isolation)
     */
    async suspendByBandwidthLimit(customerIP, reason) {
        try {
            const mikrotik = await getMikrotikConnection();

            const queueName = `suspended_${customerIP.replace(/\./g, '_')}`;
            const limitSpeed = getSetting('suspension_bandwidth_limit', '1k/1k'); // Default 1KB/s

            // Cek apakah queue sudah ada
            const existingQueues = await mikrotik.write('/queue/simple/print', [
                `?name=${queueName}`
            ]);

            if (existingQueues && existingQueues.length > 0) {
                logger.warn(`Queue ${queueName} already exists`);
                return { success: true, message: 'Queue already exists' };
            }

            // Buat queue untuk limit bandwidth
            await mikrotik.write('/queue/simple/add', [
                `=name=${queueName}`,
                `=target=${customerIP}`,
                `=max-limit=${limitSpeed}`,
                `=comment=SUSPENDED - ${reason} - ${new Date().toISOString()}`,
                '=disabled=no'
            ]);

            logger.info(`Bandwidth limited for IP ${customerIP} to ${limitSpeed}`);
            return { success: true, message: 'Bandwidth limited' };

        } catch (error) {
            logger.error('Error in suspendByBandwidthLimit:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Metode 4: Suspend menggunakan Firewall Rule Individual
     */
    async suspendByFirewallRule(customerIP, reason) {
        try {
            const mikrotik = await getMikrotikConnection();

            const ruleName = `block_${customerIP.replace(/\./g, '_')}`;

            // Cek apakah rule sudah ada
            const existingRules = await mikrotik.write('/ip/firewall/filter/print', [
                `?src-address=${customerIP}`,
                '?action=drop'
            ]);

            if (existingRules && existingRules.length > 0) {
                logger.warn(`Firewall rule for ${customerIP} already exists`);
                return { success: true, message: 'Rule already exists' };
            }

            // Buat firewall rule untuk block IP spesifik
            await mikrotik.write('/ip/firewall/filter/add', [
                '=chain=forward',
                `=src-address=${customerIP}`,
                '=action=drop',
                `=comment=SUSPENDED ${ruleName} - ${reason} - ${new Date().toISOString()}`
            ]);

            logger.info(`Firewall rule created to block IP ${customerIP}`);
            return { success: true, message: 'Firewall rule created' };

        } catch (error) {
            logger.error('Error in suspendByFirewallRule:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Restore pelanggan dengan IP statik
     */
    async restoreStaticIPCustomer(customer, reason = 'Manual restore') {
        try {
            logger.info(`Restoring static IP customer: ${customer.username} (${reason})`);

            const results = {
                mikrotik: false,
                methods_tried: []
            };

            const customerIP = customer.static_ip || customer.ip_address || customer.assigned_ip;
            const macAddress = customer.mac_address;

            if (!customerIP && !macAddress) {
                throw new Error('Customer tidak memiliki IP statik atau MAC address yang terdaftar');
            }

            // Coba semua metode restore
            if (customerIP) {
                // 1. Remove dari address list
                const addressListResult = await this.restoreFromAddressList(customerIP);
                if (addressListResult.success) {
                    results.mikrotik = true;
                    results.methods_tried.push('address_list_removed');
                }

                // 2. Remove bandwidth limit
                const bandwidthResult = await this.restoreFromBandwidthLimit(customerIP);
                if (bandwidthResult.success) {
                    results.mikrotik = true;
                    results.methods_tried.push('bandwidth_limit_removed');
                }

                // 3. Remove firewall rule
                const firewallResult = await this.restoreFromFirewallRule(customerIP);
                if (firewallResult.success) {
                    results.mikrotik = true;
                    results.methods_tried.push('firewall_rule_removed');
                }
            }

            if (macAddress) {
                // 4. Unblock DHCP lease
                const dhcpResult = await this.restoreFromDHCPBlock(macAddress);
                if (dhcpResult.success) {
                    results.mikrotik = true;
                    results.methods_tried.push('dhcp_unblocked');
                }
            }

            // Update status pelanggan di database billing
            if (results.mikrotik) {
                try {
                    const billingManager = require('./billing');
                    await billingManager.setCustomerStatusById(customer.id, 'active');
                    results.billing = true;
                    logger.info(`Customer ${customer.username} status updated to active in billing`);
                } catch (billingError) {
                    logger.error('Error updating customer status in billing:', billingError);
                }
            }

            return {
                success: results.mikrotik,
                results,
                message: results.mikrotik ? 
                    `Static IP customer restored. Methods: ${results.methods_tried.join(', ')}` : 
                    'No suspension found for this customer'
            };

        } catch (error) {
            logger.error('Error in restoreStaticIPCustomer:', error);
            return {
                success: false,
                error: error.message,
                results: null
            };
        }
    }

    /**
     * Restore methods
     */
    async restoreFromAddressList(customerIP) {
        try {
            const mikrotik = await getMikrotikConnection();

            const entries = await mikrotik.write('/ip/firewall/address-list/print', [
                '?list=blocked_customers',
                `?address=${customerIP}`
            ]);

            if (entries && entries.length > 0) {
                for (const entry of entries) {
                    await mikrotik.write('/ip/firewall/address-list/remove', [
                        `=.id=${entry['.id']}`
                    ]);
                }
                logger.info(`Removed ${customerIP} from blocked_customers address list`);
                return { success: true };
            }

            return { success: false, message: 'Not found in address list' };

        } catch (error) {
            logger.error('Error in restoreFromAddressList:', error);
            return { success: false, error: error.message };
        }
    }

    async restoreFromBandwidthLimit(customerIP) {
        try {
            const mikrotik = await getMikrotikConnection();
            const queueName = `suspended_${customerIP.replace(/\./g, '_')}`;

            const queues = await mikrotik.write('/queue/simple/print', [
                `?name=${queueName}`
            ]);

            if (queues && queues.length > 0) {
                await mikrotik.write('/queue/simple/remove', [
                    `=.id=${queues[0]['.id']}`
                ]);
                logger.info(`Removed bandwidth limit queue for ${customerIP}`);
                return { success: true };
            }

            return { success: false, message: 'No bandwidth limit found' };

        } catch (error) {
            logger.error('Error in restoreFromBandwidthLimit:', error);
            return { success: false, error: error.message };
        }
    }

    async restoreFromFirewallRule(customerIP) {
        try {
            const mikrotik = await getMikrotikConnection();

            const rules = await mikrotik.write('/ip/firewall/filter/print', [
                `?src-address=${customerIP}`,
                '?action=drop'
            ]);

            if (rules && rules.length > 0) {
                for (const rule of rules) {
                    await mikrotik.write('/ip/firewall/filter/remove', [
                        `=.id=${rule['.id']}`
                    ]);
                }
                logger.info(`Removed firewall rule for ${customerIP}`);
                return { success: true };
            }

            return { success: false, message: 'No firewall rule found' };

        } catch (error) {
            logger.error('Error in restoreFromFirewallRule:', error);
            return { success: false, error: error.message };
        }
    }

    async restoreFromDHCPBlock(macAddress) {
        try {
            const mikrotik = await getMikrotikConnection();

            const leases = await mikrotik.write('/ip/dhcp-server/lease/print', [
                `?mac-address=${macAddress}`,
                '?blocked=yes'
            ]);

            if (leases && leases.length > 0) {
                for (const lease of leases) {
                    await mikrotik.write('/ip/dhcp-server/lease/set', [
                        `=.id=${lease['.id']}`,
                        '=blocked=no',
                        '=comment=RESTORED'
                    ]);
                }
                logger.info(`Unblocked DHCP lease for MAC ${macAddress}`);
                return { success: true };
            }

            return { success: false, message: 'No blocked DHCP lease found' };

        } catch (error) {
            logger.error('Error in restoreFromDHCPBlock:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Setup infrastruktur untuk blocked customers (address list + firewall rule)
     */
    async ensureBlockedCustomersSetup() {
        try {
            const mikrotik = await getMikrotikConnection();

            // 1. Pastikan firewall rule untuk block address list ada
            const existingRules = await mikrotik.write('/ip/firewall/filter/print', [
                '?src-address-list=blocked_customers',
                '?action=drop'
            ]);

            if (!existingRules || existingRules.length === 0) {
                await mikrotik.write('/ip/firewall/filter/add', [
                    '=chain=forward',
                    '=src-address-list=blocked_customers',
                    '=action=drop',
                    '=comment=Block suspended customers (static IP)',
                    '=place-before=0' // Put at top of chain
                ]);
                logger.info('Created firewall rule for blocked_customers address list');
            }

            // 2. Tambahkan rule untuk block dari internal juga (jika diperlukan)
            const internalRules = await mikrotik.write('/ip/firewall/filter/print', [
                '?chain=input',
                '?src-address-list=blocked_customers',
                '?action=drop'
            ]);

            if (!internalRules || internalRules.length === 0) {
                await mikrotik.write('/ip/firewall/filter/add', [
                    '=chain=input',
                    '=src-address-list=blocked_customers',
                    '=action=drop',
                    '=comment=Block suspended customers from accessing router (static IP)'
                ]);
                logger.info('Created input chain rule for blocked_customers address list');
            }

        } catch (error) {
            logger.error('Error in ensureBlockedCustomersSetup:', error);
            throw error;
        }
    }

    /**
     * Get suspension status untuk IP statik
     */
    async getStaticIPSuspensionStatus(customer) {
        try {
            const customerIP = customer.static_ip || customer.ip_address || customer.assigned_ip;
            const macAddress = customer.mac_address;

            if (!customerIP && !macAddress) {
                return { suspended: false, methods: [] };
            }

            const mikrotik = await getMikrotikConnection();
            const suspensionMethods = [];

            // Cek address list
            if (customerIP) {
                const addressListEntries = await mikrotik.write('/ip/firewall/address-list/print', [
                    '?list=blocked_customers',
                    `?address=${customerIP}`
                ]);
                if (addressListEntries && addressListEntries.length > 0) {
                    suspensionMethods.push('address_list');
                }

                // Cek bandwidth limit
                const queueName = `suspended_${customerIP.replace(/\./g, '_')}`;
                const queues = await mikrotik.write('/queue/simple/print', [
                    `?name=${queueName}`
                ]);
                if (queues && queues.length > 0) {
                    suspensionMethods.push('bandwidth_limit');
                }

                // Cek firewall rule
                const firewallRules = await mikrotik.write('/ip/firewall/filter/print', [
                    `?src-address=${customerIP}`,
                    '?action=drop'
                ]);
                if (firewallRules && firewallRules.length > 0) {
                    suspensionMethods.push('firewall_rule');
                }
            }

            // Cek DHCP block
            if (macAddress) {
                const blockedLeases = await mikrotik.write('/ip/dhcp-server/lease/print', [
                    `?mac-address=${macAddress}`,
                    '?blocked=yes'
                ]);
                if (blockedLeases && blockedLeases.length > 0) {
                    suspensionMethods.push('dhcp_block');
                }
            }

            return {
                suspended: suspensionMethods.length > 0,
                methods: suspensionMethods,
                customer_ip: customerIP,
                mac_address: macAddress
            };

        } catch (error) {
            logger.error('Error in getStaticIPSuspensionStatus:', error);
            return { suspended: false, methods: [], error: error.message };
        }
    }
}

module.exports = new StaticIPSuspensionManager();
