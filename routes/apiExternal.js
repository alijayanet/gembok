const express = require('express');
const router = express.Router();
const { getDevices } = require('../config/genieacs');
const { getActivePPPoEConnections, getInactivePPPoEUsers } = require('../config/mikrotik');
const { getAllPackages, getAllCustomers, getAllInvoices } = require('../config/billing');
const { getAllTroubleReports } = require('../config/troubleReport');
const { logger } = require('../config/logger');
const { getSetting } = require('../config/settingsManager');

// Middleware untuk API key authentication
const authenticateApiKey = (req, res, next) => {
    const apiKey = req.headers['x-api-key'] || req.query.api_key;
    const validApiKey = getSetting('api_key', 'gembok-api-2024'); // Ambil dari settings.json
    
    if (!apiKey || apiKey !== validApiKey) {
        return res.status(401).json({
            success: false,
            message: 'Invalid or missing API key',
            error: 'UNAUTHORIZED'
        });
    }
    
    next();
};

// Middleware untuk rate limiting sederhana
const rateLimit = (() => {
    const requests = new Map();
    const WINDOW_MS = 60 * 1000; // 1 menit
    const MAX_REQUESTS = 100; // 100 requests per menit
    
    return (req, res, next) => {
        const clientId = req.ip || req.connection.remoteAddress;
        const now = Date.now();
        
        if (!requests.has(clientId)) {
            requests.set(clientId, { count: 1, resetTime: now + WINDOW_MS });
            return next();
        }
        
        const clientData = requests.get(clientId);
        
        if (now > clientData.resetTime) {
            clientData.count = 1;
            clientData.resetTime = now + WINDOW_MS;
            return next();
        }
        
        if (clientData.count >= MAX_REQUESTS) {
            return res.status(429).json({
                success: false,
                message: 'Too many requests',
                error: 'RATE_LIMIT_EXCEEDED',
                retryAfter: Math.ceil((clientData.resetTime - now) / 1000)
            });
        }
        
        clientData.count++;
        next();
    };
})();

// Apply middleware ke semua routes kecuali docs dan api-key
router.use((req, res, next) => {
    // Skip authentication untuk endpoint docs dan api-key
    if (req.path === '/docs' || req.path === '/api-key') {
        return next();
    }
    return authenticateApiKey(req, res, next);
});
router.use(rateLimit);

// GET: API Health Check
router.get('/health', (req, res) => {
    res.json({
        success: true,
        message: 'Gembok API is running',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// GET: API Key Info (tidak memerlukan authentication)
router.get('/api-key', (req, res) => {
    const apiKey = getSetting('api_key', 'gembok-api-2024');
    res.json({
        success: true,
        message: 'API Key information',
        apiKey: apiKey,
        usage: {
            query: `?api_key=${apiKey}`,
            header: `X-API-Key: ${apiKey}`
        },
        webInterface: 'http://localhost:3001/api-docs'
    });
});

// GET: System Overview
router.get('/overview', async (req, res) => {
    try {
        const [devices, pppoeData] = await Promise.all([
            getDevices().catch(() => []),
            getActivePPPoEConnections().catch(() => ({ success: false, data: [] }))
        ]);

        // Function synchronous - tidak perlu Promise.all
        let packages = [];
        let customers = [];
        let invoices = [];
        let troubleReports = [];

        try {
            packages = getAllPackages();
        } catch (error) {
            logger.error('Error getting packages:', error);
        }

        try {
            customers = getAllCustomers();
        } catch (error) {
            logger.error('Error getting customers:', error);
        }

        try {
            invoices = getAllInvoices();
        } catch (error) {
            logger.error('Error getting invoices:', error);
        }

        try {
            troubleReports = getAllTroubleReports();
        } catch (error) {
            logger.error('Error getting trouble reports:', error);
        }

        const now = Date.now();
        const onlineDevices = devices.filter(dev => {
            if (!dev._lastInform) return false;
            try {
                const lastInform = new Date(dev._lastInform).getTime();
                if (isNaN(lastInform)) return false;
                return (now - lastInform) < 3600 * 1000;
            } catch (error) {
                logger.error('Invalid _lastInform date in overview:', dev._lastInform, error);
                return false;
            }
        }).length;

        res.json({
            success: true,
            data: {
                devices: {
                    total: devices.length,
                    online: onlineDevices,
                    offline: devices.length - onlineDevices
                },
                pppoe: {
                    active: pppoeData.success ? pppoeData.data.length : 0
                },
                packages: {
                    total: packages.length,
                    active: packages.filter(pkg => pkg.status === 'active').length
                },
                customers: {
                    total: customers.length,
                    active: customers.filter(cust => cust.status === 'active').length,
                    inactive: customers.filter(cust => cust.status === 'inactive').length,
                    isolir: customers.filter(cust => cust.status === 'isolir').length
                },
                invoices: {
                    total: invoices.length,
                    pending: invoices.filter(inv => inv.status === 'pending').length,
                    paid: invoices.filter(inv => inv.status === 'paid').length,
                    overdue: invoices.filter(inv => inv.status === 'overdue').length,
                    totalAmount: invoices.reduce((sum, inv) => sum + (inv.amount || 0), 0)
                },
                troubleReports: {
                    total: troubleReports.length,
                    pending: troubleReports.filter(tr => tr.status === 'pending').length,
                    inProgress: troubleReports.filter(tr => tr.status === 'in_progress').length,
                    resolved: troubleReports.filter(tr => tr.status === 'resolved').length
                }
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Error in overview API:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

// GET: Device List
router.get('/devices', async (req, res) => {
    try {
        const devices = await getDevices();
        const { status, manufacturer, model } = req.query;
        
        let filteredDevices = devices;
        
        // Filter berdasarkan status
        if (status) {
            const now = Date.now();
            filteredDevices = filteredDevices.filter(dev => {
                if (status === 'online') {
                    if (!dev._lastInform) return false;
                    try {
                        const lastInform = new Date(dev._lastInform).getTime();
                        return !isNaN(lastInform) && (now - lastInform < 3600 * 1000);
                    } catch (error) {
                        logger.error('Invalid _lastInform date in filter online:', dev._lastInform, error);
                        return false;
                    }
                } else if (status === 'offline') {
                    if (!dev._lastInform) return true;
                    try {
                        const lastInform = new Date(dev._lastInform).getTime();
                        return isNaN(lastInform) || (now - lastInform >= 3600 * 1000);
                    } catch (error) {
                        logger.error('Invalid _lastInform date in filter offline:', dev._lastInform, error);
                        return true;
                    }
                }
                return true;
            });
        }
        
        // Filter berdasarkan manufacturer
        if (manufacturer) {
            filteredDevices = filteredDevices.filter(dev => {
                const devManufacturer = dev.InternetGatewayDevice?.DeviceInfo?.Manufacturer?._value || 'Unknown';
                return devManufacturer.toLowerCase().includes(manufacturer.toLowerCase());
            });
        }
        
        // Filter berdasarkan model
        if (model) {
            filteredDevices = filteredDevices.filter(dev => {
                const devModel = dev.InternetGatewayDevice?.DeviceInfo?.ModelName?._value || 'Unknown';
                return devModel.toLowerCase().includes(model.toLowerCase());
            });
        }
        
        res.json({
            success: true,
            data: filteredDevices.map(device => ({
                id: device._id,
                serial: device.InternetGatewayDevice?.DeviceInfo?.SerialNumber?._value || 'N/A',
                manufacturer: device.InternetGatewayDevice?.DeviceInfo?.Manufacturer?._value || 'Unknown',
                model: device.InternetGatewayDevice?.DeviceInfo?.ModelName?._value || 'Unknown',
                firmware: device.InternetGatewayDevice?.DeviceInfo?.SoftwareVersion?._value || 'Unknown',
                lastInform: device._lastInform,
                status: (() => {
                    if (!device._lastInform) return 'unknown';
                    try {
                        const lastInform = new Date(device._lastInform).getTime();
                        if (isNaN(lastInform)) return 'unknown';
                        return (Date.now() - lastInform < 3600 * 1000 ? 'online' : 'offline');
                    } catch (error) {
                        logger.error('Invalid _lastInform date in response:', device._lastInform, error);
                        return 'unknown';
                    }
                })(),
                ipAddress: device.InternetGatewayDevice?.WANDevice?.[1]?.WANConnectionDevice?.[1]?.WANPPPConnection?.[1]?.ExternalIPAddress?._value || 'N/A',
                username: device.InternetGatewayDevice?.WANDevice?.[1]?.WANConnectionDevice?.[1]?.WANPPPConnection?.[1]?.Username?._value || 'N/A'
            })),
            total: filteredDevices.length,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Error in devices API:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

// GET: Customer List
router.get('/customers', async (req, res) => {
    try {
        const customers = await getAllCustomers();
        const { status, package_id } = req.query;
        
        let filteredCustomers = customers;
        
        // Filter berdasarkan status
        if (status) {
            filteredCustomers = filteredCustomers.filter(cust => cust.status === status);
        }
        
        // Filter berdasarkan package
        if (package_id) {
            filteredCustomers = filteredCustomers.filter(cust => cust.package_id === package_id);
        }
        
        res.json({
            success: true,
            data: filteredCustomers,
            total: filteredCustomers.length,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Error in customers API:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

// GET: Invoice List
router.get('/invoices', async (req, res) => {
    try {
        const invoices = await getAllInvoices();
        const { status, customer_id, start_date, end_date } = req.query;
        
        let filteredInvoices = invoices;
        
        // Filter berdasarkan status
        if (status) {
            filteredInvoices = filteredInvoices.filter(inv => inv.status === status);
        }
        
        // Filter berdasarkan customer
        if (customer_id) {
            filteredInvoices = filteredInvoices.filter(inv => inv.customer_id === customer_id);
        }
        
        // Filter berdasarkan tanggal
        if (start_date) {
            filteredInvoices = filteredInvoices.filter(inv => 
                new Date(inv.created_at) >= new Date(start_date)
            );
        }
        
        if (end_date) {
            filteredInvoices = filteredInvoices.filter(inv => 
                new Date(inv.created_at) <= new Date(end_date)
            );
        }
        
        res.json({
            success: true,
            data: filteredInvoices,
            total: filteredInvoices.length,
            totalAmount: filteredInvoices.reduce((sum, inv) => sum + (inv.amount || 0), 0),
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Error in invoices API:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

// GET: Trouble Reports
router.get('/trouble-reports', async (req, res) => {
    try {
        const troubleReports = await getAllTroubleReports();
        const { status, category, phone } = req.query;
        
        let filteredReports = troubleReports;
        
        // Filter berdasarkan status
        if (status) {
            filteredReports = filteredReports.filter(tr => tr.status === status);
        }
        
        // Filter berdasarkan kategori
        if (category) {
            filteredReports = filteredReports.filter(tr => tr.category === category);
        }
        
        // Filter berdasarkan nomor telepon
        if (phone) {
            filteredReports = filteredReports.filter(tr => tr.phone === phone);
        }
        
        res.json({
            success: true,
            data: filteredReports,
            total: filteredReports.length,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Error in trouble reports API:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

// GET: PPPoE Connections
router.get('/pppoe/connections', async (req, res) => {
    try {
        const pppoeData = await getActivePPPoEConnections();
        
        if (!pppoeData.success) {
            return res.status(500).json({
                success: false,
                message: 'Failed to get PPPoE connections',
                error: pppoeData.message
            });
        }
        
        res.json({
            success: true,
            data: pppoeData.data,
            total: pppoeData.data.length,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Error in PPPoE connections API:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

// GET: Packages
router.get('/packages', async (req, res) => {
    try {
        const packages = await getAllPackages();
        const { status } = req.query;
        
        let filteredPackages = packages;
        
        if (status) {
            filteredPackages = packages.filter(pkg => pkg.status === status);
        }
        
        res.json({
            success: true,
            data: filteredPackages,
            total: filteredPackages.length,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Error in packages API:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

// POST: Create Trouble Report (untuk integrasi eksternal)
router.post('/trouble-reports', async (req, res) => {
    try {
        const { phone, name, location, category, description } = req.body;
        
        // Validasi input
        if (!phone || !name || !category || !description) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields',
                error: 'VALIDATION_ERROR'
            });
        }
        
        // Import trouble report module
        const { createTroubleReport } = require('../config/troubleReport');
        
        const reportData = {
            phone,
            name,
            location: location || 'N/A',
            category,
            description,
            source: 'api' // Tandai sebagai dari API
        };
        
        const newReport = createTroubleReport(reportData);
        
        if (newReport) {
            res.status(201).json({
                success: true,
                message: 'Trouble report created successfully',
                data: newReport,
                timestamp: new Date().toISOString()
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'Failed to create trouble report',
                error: 'CREATE_ERROR'
            });
        }
    } catch (error) {
        logger.error('Error creating trouble report via API:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

// GET: API Documentation - Redirect ke halaman docs yang user-friendly
router.get('/docs', (req, res) => {
    res.redirect('/api-docs');
});

// GET: API Documentation JSON - Untuk yang memerlukan format JSON
router.get('/docs/json', (req, res) => {
    res.json({
        success: true,
        message: 'Gembok API Documentation',
        version: '1.0.0',
        endpoints: {
            'GET /api/external/health': 'API Health Check',
            'GET /api/external/overview': 'System Overview',
            'GET /api/external/devices': 'Device List (with filters: status, manufacturer, model)',
            'GET /api/external/customers': 'Customer List (with filters: status, package_id)',
            'GET /api/external/invoices': 'Invoice List (with filters: status, customer_id, start_date, end_date)',
            'GET /api/external/trouble-reports': 'Trouble Reports (with filters: status, category, phone)',
            'GET /api/external/pppoe/connections': 'Active PPPoE Connections',
            'GET /api/external/packages': 'Package List (with filter: status)',
            'POST /api/external/trouble-reports': 'Create Trouble Report',
            'GET /api/external/docs': 'This documentation (redirects to /api-docs)',
            'GET /api/external/docs/json': 'This documentation in JSON format'
        },
        authentication: {
            method: 'API Key',
            header: 'X-API-Key',
            query: 'api_key',
            default: 'gembok-api-2024'
        },
        rateLimit: {
            limit: '100 requests per minute',
            window: '60 seconds'
        },
        examples: {
            'Get all online devices': 'GET /api/external/devices?status=online&api_key=your-api-key',
            'Get pending invoices': 'GET /api/external/invoices?status=pending&api_key=your-api-key',
            'Create trouble report': 'POST /api/external/trouble-reports with body: {phone, name, category, description}'
        },
        webInterface: 'http://localhost:3001/api-docs'
    });
});

module.exports = router;
