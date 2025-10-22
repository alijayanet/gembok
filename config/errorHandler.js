/**
 * Comprehensive Error Handler for ISP Portal
 * Centralized error handling, logging, and user notification system
 */

const { logger } = require('./logger');
const { getSetting } = require('./settingsManager');

/**
 * Custom Error Classes for better error categorization
 */
class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    this.timestamp = new Date().toISOString();
    
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, field = null) {
    super(message, 400, 'VALIDATION_ERROR');
    this.field = field;
  }
}

class DatabaseError extends AppError {
  constructor(message, query = null) {
    super(message, 500, 'DATABASE_ERROR');
    this.query = query;
  }
}

class NetworkError extends AppError {
  constructor(message, host = null, port = null) {
    super(message, 503, 'NETWORK_ERROR');
    this.host = host;
    this.port = port;
  }
}

class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed') {
    super(message, 401, 'AUTH_ERROR');
  }
}

class AuthorizationError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

class WhatsAppError extends AppError {
  constructor(message, phoneNumber = null) {
    super(message, 503, 'WHATSAPP_ERROR');
    this.phoneNumber = phoneNumber;
  }
}

class GenieACSError extends AppError {
  constructor(message, deviceId = null) {
    super(message, 503, 'GENIEACS_ERROR');
    this.deviceId = deviceId;
  }
}

class MikrotikError extends AppError {
  constructor(message, command = null) {
    super(message, 503, 'MIKROTIK_ERROR');
    this.command = command;
  }
}

/**
 * Error Handler Class
 */
class ErrorHandler {
  constructor() {
    this.isDevelopment = process.env.NODE_ENV === 'development';
    this.logLevel = getSetting('log_level', 'info');
  }

  /**
   * Handle different types of errors
   */
  handleError(error, req = null, res = null) {
    // Log the error
    this.logError(error, req);

    // Send response if res object is provided
    if (res && !res.headersSent) {
      this.sendErrorResponse(error, res);
    }

    // Determine if we should exit the process
    if (!error.isOperational) {
      this.handleProgrammerError(error);
    }
  }

  /**
   * Log errors with context
   */
  logError(error, req = null) {
    const errorInfo = {
      message: error.message,
      stack: error.stack,
      code: error.code || 'UNKNOWN_ERROR',
      statusCode: error.statusCode || 500,
      timestamp: error.timestamp || new Date().toISOString(),
    };

    // Add request context if available
    if (req) {
      errorInfo.request = {
        method: req.method,
        url: req.originalUrl || req.url,
        userAgent: req.get('User-Agent'),
        ip: req.ip || req.connection?.remoteAddress,
        userId: req.session?.customer?.phone || req.session?.admin?.username || 'anonymous'
      };
    }

    // Add specific error context
    if (error.field) errorInfo.field = error.field;
    if (error.query) errorInfo.query = error.query;
    if (error.host) errorInfo.host = error.host;
    if (error.port) errorInfo.port = error.port;
    if (error.phoneNumber) errorInfo.phoneNumber = error.phoneNumber;
    if (error.deviceId) errorInfo.deviceId = error.deviceId;
    if (error.command) errorInfo.command = error.command;

    // Log based on severity
    if (error.statusCode >= 500) {
      logger.error('Application Error', errorInfo);
    } else if (error.statusCode >= 400) {
      logger.warn('Client Error', errorInfo);
    } else {
      logger.info('Error Info', errorInfo);
    }
  }

  /**
   * Send appropriate error response to client
   */
  sendErrorResponse(error, res) {
    const isDevelopment = this.isDevelopment;
    
    // Determine status code
    const statusCode = error.statusCode || 500;
    
    // Base response object
    const errorResponse = {
      success: false,
      error: {
        code: error.code || 'INTERNAL_ERROR',
        message: this.getClientSafeMessage(error),
        timestamp: new Date().toISOString()
      }
    };

    // Add additional info in development
    if (isDevelopment) {
      errorResponse.error.stack = error.stack;
      errorResponse.error.details = error.message;
    }

    // Handle different content types
    const acceptsJSON = res.req.accepts('json');
    const acceptsHTML = res.req.accepts('html');

    if (acceptsJSON && !acceptsHTML) {
      // API request - send JSON response
      res.status(statusCode).json(errorResponse);
    } else {
      // Web request - render error page or redirect
      this.handleWebError(error, res, statusCode);
    }
  }

  /**
   * Handle web errors (render error pages)
   */
  handleWebError(error, res, statusCode) {
    try {
      // For authentication errors, redirect to login
      if (statusCode === 401) {
        return res.redirect('/customer/login');
      }

      // For authorization errors, show access denied
      if (statusCode === 403) {
        return res.status(403).render('error', {
          title: 'Access Denied',
          message: 'Anda tidak memiliki akses ke halaman ini',
          statusCode: 403
        });
      }

      // For other errors, show general error page
      res.status(statusCode).render('error', {
        title: 'Terjadi Kesalahan',
        message: this.getClientSafeMessage(error),
        statusCode: statusCode,
        showDetails: this.isDevelopment
      });
    } catch (renderError) {
      // Fallback if error page rendering fails
      logger.error('Error rendering error page', { error: renderError.message });
      res.status(500).send(`
        <html>
          <head><title>Error</title></head>
          <body>
            <h1>Terjadi Kesalahan</h1>
            <p>Silakan coba lagi nanti.</p>
          </body>
        </html>
      `);
    }
  }

  /**
   * Get client-safe error message
   */
  getClientSafeMessage(error) {
    // Don't expose internal errors to users in production
    if (!this.isDevelopment && error.statusCode >= 500) {
      return 'Terjadi kesalahan internal. Silakan coba lagi nanti.';
    }

    // Map specific error codes to user-friendly messages
    const errorMessages = {
      'VALIDATION_ERROR': 'Data yang Anda masukkan tidak valid',
      'DATABASE_ERROR': 'Terjadi kesalahan pada database',
      'NETWORK_ERROR': 'Terjadi kesalahan koneksi jaringan',
      'AUTH_ERROR': 'Autentikasi gagal. Silakan login kembali',
      'AUTHORIZATION_ERROR': 'Anda tidak memiliki akses ke resource ini',
      'WHATSAPP_ERROR': 'Terjadi kesalahan pada layanan WhatsApp',
      'GENIEACS_ERROR': 'Terjadi kesalahan pada sistem GenieACS',
      'MIKROTIK_ERROR': 'Terjadi kesalahan pada sistem Mikrotik',
    };

    return errorMessages[error.code] || error.message || 'Terjadi kesalahan yang tidak diketahui';
  }

  /**
   * Handle programmer errors (bugs)
   */
  handleProgrammerError(error) {
    logger.error('PROGRAMMER ERROR - Application will exit', {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    // In production, gracefully shutdown
    if (!this.isDevelopment) {
      process.exit(1);
    }
  }

  /**
   * Async error wrapper for route handlers
   */
  asyncHandler(fn) {
    return (req, res, next) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  }

  /**
   * Database operation wrapper with error handling
   */
  async dbOperation(operation, context = {}) {
    try {
      return await operation();
    } catch (error) {
      throw new DatabaseError(
        `Database operation failed: ${error.message}`,
        context.query
      );
    }
  }

  /**
   * Network operation wrapper with error handling
   */
  async networkOperation(operation, host = null, port = null) {
    try {
      return await operation();
    } catch (error) {
      throw new NetworkError(
        `Network operation failed: ${error.message}`,
        host,
        port
      );
    }
  }

  /**
   * Express error middleware
   */
  expressErrorHandler() {
    return (error, req, res, next) => {
      this.handleError(error, req, res);
    };
  }

  /**
   * Unhandled rejection handler
   */
  setupGlobalHandlers() {
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Promise Rejection', {
        reason: reason,
        promise: promise,
        stack: reason?.stack
      });
      
      // Create an error and handle it
      const error = new AppError(
        `Unhandled Promise Rejection: ${reason}`,
        500,
        'UNHANDLED_REJECTION'
      );
      error.isOperational = false;
      this.handleError(error);
    });

    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception', {
        message: error.message,
        stack: error.stack
      });
      
      const appError = new AppError(
        `Uncaught Exception: ${error.message}`,
        500,
        'UNCAUGHT_EXCEPTION'
      );
      appError.isOperational = false;
      this.handleError(appError);
    });
  }
}

// Create singleton instance
const errorHandler = new ErrorHandler();

module.exports = {
  ErrorHandler,
  errorHandler,
  AppError,
  ValidationError,
  DatabaseError,
  NetworkError,
  AuthenticationError,
  AuthorizationError,
  WhatsAppError,
  GenieACSError,
  MikrotikError
};
