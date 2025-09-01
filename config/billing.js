const fs = require('fs');
const path = require('path');
const { logger } = require('./logger');
const { getSetting } = require('./settingsManager');

// Path untuk file billing data
const packagesPath = path.join(__dirname, '../logs/packages.json');
const customersPath = path.join(__dirname, '../logs/customers.json');
const invoicesPath = path.join(__dirname, '../logs/invoices.json');

// Helper: normalisasi nomor HP ke format 62xxxxxxxxxxx
function normalizePhone(phone) {
  if (!phone) return '';
  let p = String(phone).replace(/\D/g, '');
  if (p.startsWith('0')) {
    p = '62' + p.slice(1);
  } else if (!p.startsWith('62')) {
    p = '62' + p;
  }
  return p;
}

// Pastikan direktori logs ada
function ensureLogsDirectory() {
  const logsDir = path.dirname(packagesPath);
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
}

// Pastikan file billing ada dengan data default
function ensureBillingFiles() {
  ensureLogsDirectory();
  
  // File packages.json
  if (!fs.existsSync(packagesPath)) {
    const defaultPackages = [
      {
        id: 'PKG001',
        name: 'Paket 10 Mbps',
        speed: '10 Mbps',
        price: 150000,
        description: 'Paket internet rumahan 10 Mbps unlimited',
        status: 'active',
        created_at: new Date().toISOString()
      },
      {
        id: 'PKG002', 
        name: 'Paket 20 Mbps',
        speed: '20 Mbps',
        price: 250000,
        description: 'Paket internet rumahan 20 Mbps unlimited',
        status: 'active',
        created_at: new Date().toISOString()
      },
      {
        id: 'PKG003',
        name: 'Paket 50 Mbps',
        speed: '50 Mbps', 
        price: 500000,
        description: 'Paket internet bisnis 50 Mbps unlimited',
        status: 'active',
        created_at: new Date().toISOString()
      }
    ];
    fs.writeFileSync(packagesPath, JSON.stringify(defaultPackages, null, 2));
    logger.info('Created default packages.json');
  }
  
  // File customers.json
  if (!fs.existsSync(customersPath)) {
    fs.writeFileSync(customersPath, JSON.stringify([], null, 2));
    logger.info('Created empty customers.json');
  }
  
  // File invoices.json
  if (!fs.existsSync(invoicesPath)) {
    fs.writeFileSync(invoicesPath, JSON.stringify([], null, 2));
    logger.info('Created empty invoices.json');
  }
}

// PACKAGES MANAGEMENT
function getAllPackages() {
  ensureBillingFiles();
  try {
    const data = fs.readFileSync(packagesPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    logger.error(`Error reading packages: ${error.message}`);
    return [];
  }
}

function getActivePackages() {
  return getAllPackages().filter(pkg => pkg.status === 'active');
}

function getPackageById(id) {
  const packages = getAllPackages();
  return packages.find(pkg => pkg.id === id);
}

function savePackages(packages) {
  try {
    fs.writeFileSync(packagesPath, JSON.stringify(packages, null, 2));
    return true;
  } catch (error) {
    logger.error(`Error saving packages: ${error.message}`);
    return false;
  }
}

function createPackage(packageData) {
  try {
    const packages = getAllPackages();
    const newPackage = {
      id: generatePackageId(),
      name: packageData.name,
      speed: packageData.speed,
      price: parseFloat(packageData.price),
      description: packageData.description || '',
      pppoe_profile: packageData.pppoe_profile || '',
      status: 'active',
      created_at: new Date().toISOString()
    };
    
    packages.push(newPackage);
    if (savePackages(packages)) {
      logger.info(`Package created: ${newPackage.id} - ${newPackage.name}`);
      return newPackage;
    }
    return null;
  } catch (error) {
    logger.error(`Error creating package: ${error.message}`);
    return null;
  }
}

function updatePackage(id, packageData) {
  try {
    const packages = getAllPackages();
    const index = packages.findIndex(pkg => pkg.id === id);
    
    if (index === -1) return null;
    
    packages[index] = {
      ...packages[index],
      name: packageData.name,
      speed: packageData.speed,
      price: parseFloat(packageData.price),
      description: packageData.description || packages[index].description,
      pppoe_profile: packageData.pppoe_profile || packages[index].pppoe_profile,
      updated_at: new Date().toISOString()
    };
    
    if (savePackages(packages)) {
      logger.info(`Package updated: ${id}`);
      return packages[index];
    }
    return null;
  } catch (error) {
    logger.error(`Error updating package: ${error.message}`);
    return null;
  }
}

function deletePackage(id) {
  try {
    const packages = getAllPackages();
    const index = packages.findIndex(pkg => pkg.id === id);
    
    if (index === -1) return false;
    
    packages[index].status = 'inactive';
    packages[index].deleted_at = new Date().toISOString();
    
    if (savePackages(packages)) {
      logger.info(`Package deleted: ${id}`);
      return true;
    }
    return false;
  } catch (error) {
    logger.error(`Error deleting package: ${error.message}`);
    return false;
  }
}

// CUSTOMERS MANAGEMENT
function getAllCustomers() {
  ensureBillingFiles();
  try {
    const data = fs.readFileSync(customersPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    logger.error(`Error reading customers: ${error.message}`);
    return [];
  }
}

function getCustomerByPhone(phone) {
  const customers = getAllCustomers();
  const target = normalizePhone(phone);
  return customers.find(customer => normalizePhone(customer.phone) === target);
}

function getCustomerByName(name) {
  try {
    const customers = getAllCustomers();
    const searchName = name.toLowerCase().trim();
    
    // Cari exact match dulu
    let customer = customers.find(c => c.name && c.name.toLowerCase().trim() === searchName);
    
    // Jika tidak ada exact match, cari partial match
    if (!customer) {
      customer = customers.find(c => c.name && c.name.toLowerCase().includes(searchName));
    }
    
    return customer || null;
  } catch (error) {
    logger.error(`Error getting customer by name: ${error.message}`);
    return null;
  }
}

function searchCustomers(query) {
  try {
    const customers = getAllCustomers();
    const searchQuery = query.toLowerCase().trim();
    
    return customers.filter(customer => {
      const name = customer.name ? customer.name.toLowerCase() : '';
      const phone = customer.phone ? customer.phone.toLowerCase() : '';
      const username = customer.username ? customer.username.toLowerCase() : '';
      
      return name.includes(searchQuery) || 
             phone.includes(searchQuery) || 
             username.includes(searchQuery);
    });
  } catch (error) {
    logger.error(`Error searching customers: ${error.message}`);
    return [];
  }
}

// ISOLIR MANAGEMENT
function getOverdueCustomers() {
  try {
    const customers = getAllCustomers();
    const invoices = getAllInvoices();
    const now = new Date();
    const overdueCustomers = [];
    
    customers.forEach(customer => {
      // Skip jika isolir disabled untuk customer ini
      if (!customer.enable_isolir) return;
      
      // Cari tagihan yang overdue untuk customer ini
      const customerInvoices = invoices.filter(inv => 
        inv.customer_phone === customer.phone && 
        inv.status === 'unpaid'
      );
      
      customerInvoices.forEach(invoice => {
        const dueDate = new Date(invoice.due_date);
        const daysPastDue = Math.floor((now - dueDate) / (1000 * 60 * 60 * 24));
        
        if (daysPastDue > 0) {
          overdueCustomers.push({
            ...customer,
            invoice: invoice,
            days_past_due: daysPastDue
          });
        }
      });
    });
    
    return overdueCustomers;
  } catch (error) {
    logger.error(`Error getting overdue customers: ${error.message}`);
    return [];
  }
}

function updateCustomerIsolirStatus(phone, status) {
  try {
    const customers = getAllCustomers();
    const customerIndex = customers.findIndex(c => c.phone === phone);
    
    if (customerIndex === -1) {
      logger.error(`Customer not found: ${phone}`);
      return false;
    }
    
    customers[customerIndex].isolir_status = status;
    customers[customerIndex].isolir_updated_at = new Date().toISOString();
    
    if (saveCustomers(customers)) {
      logger.info(`Customer ${phone} isolir status updated to: ${status}`);
      return true;
    }
    return false;
  } catch (error) {
    logger.error(`Error updating isolir status: ${error.message}`);
    return false;
  }
}

function saveCustomers(customers) {
  try {
    fs.writeFileSync(customersPath, JSON.stringify(customers, null, 2));
    return true;
  } catch (error) {
    logger.error(`Error saving customers: ${error.message}`);
    return false;
  }
}

function createOrUpdateCustomer(customerData) {
  try {
    const customers = getAllCustomers();
    const existingIndex = customers.findIndex(c => c.phone === customerData.phone);
    
    if (existingIndex !== -1) {
      // Update existing customer
      customers[existingIndex] = {
        ...customers[existingIndex],
        ...customerData,
        updated_at: new Date().toISOString()
      };
      
      if (saveCustomers(customers)) {
        logger.info(`Customer updated: ${customerData.phone}`);
        return customers[existingIndex];
      }
    } else {
      // Create new customer
      const newCustomer = {
        id: generateCustomerId(),
        phone: customerData.phone,
        name: customerData.name,
        username: customerData.username || customerData.phone,
        package_id: customerData.package_id,
        package_name: customerData.package_name,
        package_price: customerData.package_price,
        payment_status: 'unpaid',
        status: 'active',
        created_at: new Date().toISOString()
      };
      
      customers.push(newCustomer);
      
      if (saveCustomers(customers)) {
        logger.info(`Customer created: ${newCustomer.phone} - ${newCustomer.name}`);
        return newCustomer;
      }
    }
    return null;
  } catch (error) {
    logger.error(`Error creating/updating customer: ${error.message}`);
    return null;
  }
}

function assignPackageToCustomer(phone, packageId, customerName = null, enableIsolir = true, pppoeUsername = null) {
  try {
    const package = getPackageById(packageId);
    if (!package) {
      logger.error(`Package not found: ${packageId}`);
      return null;
    }
    
    const customerData = {
      phone: phone,
      name: customerName || phone,
      username: phone, // Username for login portal
      pppoe_username: pppoeUsername || phone, // PPPoE username for Mikrotik
      package_id: packageId,
      package_name: package.name,
      package_price: package.price,
      enable_isolir: enableIsolir, // New field for isolir setting
      isolir_status: 'normal' // normal, isolated
    };
    
    return createOrUpdateCustomer(customerData);
  } catch (error) {
    logger.error(`Error assigning package: ${error.message}`);
    return null;
  }
}

// INVOICES MANAGEMENT
function getAllInvoices() {
  ensureBillingFiles();
  try {
    const data = fs.readFileSync(invoicesPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    logger.error(`Error reading invoices: ${error.message}`);
    return [];
  }
}

function getInvoicesByPhone(phone) {
  const invoices = getAllInvoices();
  const target = normalizePhone(phone);
  return invoices.filter(invoice => normalizePhone(invoice.customer_phone) === target);
}

function saveInvoices(invoices) {
  try {
    fs.writeFileSync(invoicesPath, JSON.stringify(invoices, null, 2));
    return true;
  } catch (error) {
    logger.error(`Error saving invoices: ${error.message}`);
    return false;
  }
}

function createInvoice(customerPhone, packageId, amount) {
  try {
    const invoices = getAllInvoices();
    const customer = getCustomerByPhone(customerPhone);
    const package = getPackageById(packageId);
    
    if (!customer || !package) {
      logger.error(`Customer or package not found for invoice creation`);
      return null;
    }
    
    const currentDate = new Date();
    const dueDate = new Date();
    dueDate.setDate(currentDate.getDate() + 30); // Jatuh tempo 30 hari
    
    const newInvoice = {
      id: generateInvoiceId(),
      invoice_number: generateInvoiceNumber(),
      customer_phone: customerPhone,
      customer_name: customer.name,
      package_id: packageId,
      package_name: package.name,
      amount: parseFloat(amount) || package.price,
      status: 'unpaid',
      created_at: currentDate.toISOString(),
      due_date: dueDate.toISOString()
    };
    
    invoices.push(newInvoice);
    
    if (saveInvoices(invoices)) {
      logger.info(`Invoice created: ${newInvoice.invoice_number} for ${customerPhone}`);
      return newInvoice;
    }
    return null;
  } catch (error) {
    logger.error(`Error creating invoice: ${error.message}`);
    return null;
  }
}

function markInvoiceAsPaid(invoiceId) {
  try {
    const invoices = getAllInvoices();
    const index = invoices.findIndex(inv => inv.id === invoiceId);
    
    if (index === -1) return null;
    
    invoices[index].status = 'paid';
    invoices[index].paid_at = new Date().toISOString();
    
    // Update customer payment status
    const customer = getCustomerByPhone(invoices[index].customer_phone);
    if (customer) {
      customer.payment_status = 'paid';
      createOrUpdateCustomer(customer);
    }
    
    if (saveInvoices(invoices)) {
      logger.info(`Invoice marked as paid: ${invoiceId}`);
      return invoices[index];
    }
    return null;
  } catch (error) {
    logger.error(`Error marking invoice as paid: ${error.message}`);
    return null;
  }
}

// UTILITY FUNCTIONS
function generatePackageId() {
  const packages = getAllPackages();
  const count = packages.length + 1;
  return `PKG${count.toString().padStart(3, '0')}`;
}

function generateCustomerId() {
  const customers = getAllCustomers();
  const count = customers.length + 1;
  return `CUST${count.toString().padStart(4, '0')}`;
}

function generateInvoiceId() {
  const invoices = getAllInvoices();
  const count = invoices.length + 1;
  return `INV${count.toString().padStart(4, '0')}`;
}

function generateInvoiceNumber() {
  const now = new Date();
  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const invoices = getAllInvoices();
  const count = invoices.length + 1;
  return `INV-${year}${month}-${count.toString().padStart(4, '0')}`;
}

// Get billing data for customer portal
function getBillingDataForCustomer(phone) {
  try {
    const customer = getCustomerByPhone(phone);
    const invoices = getInvoicesByPhone(phone);
    
    if (!customer) {
      return null;
    }
    
    return {
      customer: customer,
      invoices: invoices || []
    };
  } catch (error) {
    logger.error(`Error getting billing data for customer ${phone}: ${error.message}`);
    return null;
  }
}

// Initialize billing system
function initializeBilling() {
  try {
    ensureBillingFiles();
    logger.info('Billing system initialized successfully');
    return true;
  } catch (error) {
    logger.error(`Error initializing billing system: ${error.message}`);
    return false;
  }
}

// DELETE CUSTOMER
function deleteCustomer(phone) {
  try {
    if (!phone) {
      return { success: false, message: 'Nomor HP pelanggan wajib diisi' };
    }
    
    const customers = getAllCustomers();
    const customerIndex = customers.findIndex(c => c.phone === phone);
    
    if (customerIndex === -1) {
      return { success: false, message: 'Pelanggan tidak ditemukan' };
    }
    
    // Delete related invoices first
    const invoices = getAllInvoices();
    const customerInvoices = invoices.filter(inv => inv.customer_phone === phone);
    
    // Remove customer invoices
    const updatedInvoices = invoices.filter(inv => inv.customer_phone !== phone);
    try {
      fs.writeFileSync(invoicesPath, JSON.stringify(updatedInvoices, null, 2));
      logger.info(`Deleted ${customerInvoices.length} invoices for customer ${phone}`);
    } catch (error) {
      logger.error(`Error deleting invoices for customer ${phone}: ${error.message}`);
      return { success: false, message: 'Gagal menghapus tagihan pelanggan' };
    }
    
    // Remove customer
    customers.splice(customerIndex, 1);
    try {
      fs.writeFileSync(customersPath, JSON.stringify(customers, null, 2));
      logger.info(`Customer ${phone} deleted successfully`);
      return { success: true, message: 'Pelanggan berhasil dihapus' };
    } catch (error) {
      logger.error(`Error deleting customer ${phone}: ${error.message}`);
      return { success: false, message: 'Gagal menghapus data pelanggan' };
    }
    
  } catch (error) {
    logger.error(`Error in deleteCustomer: ${error.message}`);
    return { success: false, message: 'Terjadi kesalahan saat menghapus pelanggan' };
  }
}

module.exports = {
  // Packages
  getAllPackages,
  getActivePackages,
  getPackageById,
  createPackage,
  updatePackage,
  deletePackage,
  
  // Customers
  getAllCustomers,
  getCustomerByPhone,
  getCustomerByName,
  searchCustomers,
  createOrUpdateCustomer,
  assignPackageToCustomer,
  deleteCustomer,
  
  // Isolir Management
  getOverdueCustomers,
  updateCustomerIsolirStatus,
  
  // Invoices
  getAllInvoices,
  getInvoicesByPhone,
  createInvoice,
  markInvoiceAsPaid,
  
  // Utility
  getBillingDataForCustomer,
  initializeBilling
};
