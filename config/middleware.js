/**
 * Custom Middleware Collection for ISP Portal
 * Reusable middleware functions for common operations
 */

const { errorHandler, ValidationError, AuthenticationError, AuthorizationError } = require('./errorHandler');
const { getSetting } = require('./settingsManager');
const { logger } = require('./logger');

/**
 * Authentication middleware for customer portal
 */
const requireCustomerAuth = (req, res, next) => {
  try {
    if (!req.session || !req.session.customer || !req.session.customer.phone) {
      throw new AuthenticationError('Login diperlukan untuk mengakses halaman ini');
    }
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Authentication middleware for admin panel
 */
const requireAdminAuth = (req, res, next) => {
  try {
    if (!req.session || !req.session.admin || !req.session.admin.username) {
      throw new AuthenticationError('Login admin diperlukan');
    }
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Rate limiting middleware
 */
const createRateLimit = (windowMs = 15 * 60 * 1000, max = 100) => {
  const requests = new Map();
  
  return (req, res, next) => {
    try {
      const key = req.ip || req.connection.remoteAddress;
      const now = Date.now();
      const windowStart = now - windowMs;
      
      // Clean old entries
      for (const [ip, timestamps] of requests.entries()) {
        requests.set(ip, timestamps.filter(time => time > windowStart));
        if (requests.get(ip).length === 0) {
          requests.delete(ip);
        }
      }
      
      // Check current IP
      const userRequests = requests.get(key) || [];
      if (userRequests.length >= max) {
        const error = new ValidationError('Terlalu banyak permintaan. Silakan coba lagi nanti.');
        error.statusCode = 429;
        throw error;
      }
      
      // Add current request
      userRequests.push(now);
      requests.set(key, userRequests);
      
      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Input validation middleware
 */
const validateInput = (schema) => {
  return (req, res, next) => {
    try {
      const { error, value } = schema.validate(req.body);
      if (error) {
        throw new ValidationError(error.details[0].message, error.details[0].path[0]);
      }
      req.body = value;
      next();
    } catch (err) {
      next(err);
    }
  };
};

/**
 * Phone number validation middleware
 */
const validatePhoneNumber = (req, res, next) => {
  try {
    const { phone } = req.body;
    
    if (!phone) {
      throw new ValidationError('Nomor telepon harus diisi', 'phone');
    }
    
    // Remove all non-digits
    const cleanPhone = phone.replace(/\D/g, '');
    
    // Validate Indonesian phone number format
    if (!cleanPhone.match(/^08[0-9]{8,13}$/)) {
      throw new ValidationError('Format nomor telepon tidak valid. Gunakan format: 08xxxxxxxxxx', 'phone');
    }
    
    // Store cleaned phone number
    req.body.phone = cleanPhone;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Request logging middleware
 */
const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  // Log request
  logger.info('Request started', {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('User-Agent'),
    userId: req.session?.customer?.phone || req.session?.admin?.username || 'anonymous'
  });
  
  // Log response
  const originalSend = res.send;
  res.send = function(data) {
    const duration = Date.now() - start;
    logger.info('Request completed', {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      userId: req.session?.customer?.phone || req.session?.admin?.username || 'anonymous'
    });
    originalSend.call(this, data);
  };
  
  next();
};

/**
 * Security headers middleware
 */
const securityHeaders = (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  
  // Only add HSTS in production with HTTPS
  if (process.env.NODE_ENV === 'production' && req.secure) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  
  next();
};

/**
 * Content Security Policy middleware
 */
const contentSecurityPolicy = (req, res, next) => {
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
    "font-src 'self' https://cdn.jsdelivr.net",
    "img-src 'self' data: https:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; ');
  
  res.setHeader('Content-Security-Policy', csp);
  next();
};

/**
 * API response standardization middleware
 */
const standardizeApiResponse = (req, res, next) => {
  // Add helper methods to response object
  res.apiSuccess = (data = null, message = 'Success') => {
    res.json({
      success: true,
      message,
      data,
      timestamp: new Date().toISOString()
    });
  };
  
  res.apiError = (message = 'Error', statusCode = 500, code = 'INTERNAL_ERROR') => {
    res.status(statusCode).json({
      success: false,
      error: {
        code,
        message,
        timestamp: new Date().toISOString()
      }
    });
  };
  
  next();
};

/**
 * Session management middleware
 */
const sessionManager = (req, res, next) => {
  // Ensure session object exists
  if (!req.session) {
    req.session = {};
  }
  
  // Add session helper methods
  req.session.setCustomer = (customerData) => {
    req.session.customer = customerData;
  };
  
  req.session.setAdmin = (adminData) => {
    req.session.admin = adminData;
  };
  
  req.session.clearAuth = () => {
    delete req.session.customer;
    delete req.session.admin;
  };
  
  req.session.isCustomer = () => {
    return !!(req.session.customer && req.session.customer.phone);
  };
  
  req.session.isAdmin = () => {
    return !!(req.session.admin && req.session.admin.username);
  };
  
  next();
};

/**
 * Error boundary for async operations
 */
const asyncErrorBoundary = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Development only middleware - remove in production
 */
const developmentOnly = (middleware) => {
  return (req, res, next) => {
    if (process.env.NODE_ENV === 'development') {
      return middleware(req, res, next);
    }
    next();
  };
};

/**
 * Production only middleware
 */
const productionOnly = (middleware) => {
  return (req, res, next) => {
    if (process.env.NODE_ENV === 'production') {
      return middleware(req, res, next);
    }
    next();
  };
};

module.exports = {
  requireCustomerAuth,
  requireAdminAuth,
  createRateLimit,
  validateInput,
  validatePhoneNumber,
  requestLogger,
  securityHeaders,
  contentSecurityPolicy,
  standardizeApiResponse,
  sessionManager,
  asyncErrorBoundary,
  developmentOnly,
  productionOnly,
  
  // Common rate limits
  loginRateLimit: createRateLimit(15 * 60 * 1000, 5), // 5 attempts per 15 minutes
  apiRateLimit: createRateLimit(15 * 60 * 1000, 100), // 100 requests per 15 minutes
  strictRateLimit: createRateLimit(15 * 60 * 1000, 10) // 10 requests per 15 minutes
};
