const i18n = require('i18n');

/**
 * Language Helper untuk WhatsApp Bot
 */
class LanguageHelper {
  constructor() {
    this.defaultLanguage = 'id';
    this.supportedLanguages = ['id', 'en'];
  }

  /**
   * Get user language preference from database
   * @param {string} phone - User phone number
   * @returns {string} Language code
   */
  async getUserLanguage(phone) {
    try {
      // Lazy load to avoid circular dependency
      const billingManager = require('./billing');
      const customer = await billingManager.getCustomerByPhone(phone);
      
      if (customer && customer.language && this.supportedLanguages.includes(customer.language)) {
        return customer.language;
      }
      
      return this.defaultLanguage;
    } catch (error) {
      console.error('Error getting user language:', error);
      return this.defaultLanguage;
    }
  }

  /**
   * Set user language preference
   * @param {string} phone - User phone number  
   * @param {string} language - Language code
   */
  async setUserLanguage(phone, language) {
    try {
      if (!this.supportedLanguages.includes(language)) {
        throw new Error(`Unsupported language: ${language}`);
      }

      // Lazy load to avoid circular dependency
      const billingManager = require('./billing');
      await billingManager.updateCustomerLanguage(phone, language);
      
      return true;
    } catch (error) {
      console.error('Error setting user language:', error);
      return false;
    }
  }

  /**
   * Get localized message for WhatsApp
   * @param {string} key - Translation key
   * @param {string} phone - User phone number
   * @param {Object} params - Parameters for interpolation
   * @returns {string} Localized message
   */
  async getLocalizedMessage(key, phone, params = {}) {
    try {
      const userLang = await this.getUserLanguage(phone);
      i18n.setLocale(userLang);
      
      return i18n.__(key, params);
    } catch (error) {
      console.error('Error getting localized message:', error);
      i18n.setLocale(this.defaultLanguage);
      return i18n.__(key, params);
    }
  }

  /**
   * Get localized message with specific language
   * @param {string} key - Translation key
   * @param {string} language - Language code
   * @param {Object} params - Parameters for interpolation
   * @returns {string} Localized message
   */
  getMessageWithLanguage(key, language, params = {}) {
    try {
      const lang = this.supportedLanguages.includes(language) ? language : this.defaultLanguage;
      i18n.setLocale(lang);
      
      return i18n.__(key, params);
    } catch (error) {
      console.error('Error getting message with language:', error);
      i18n.setLocale(this.defaultLanguage);
      return i18n.__(key, params);
    }
  }

  /**
   * Middleware for web routes to set user language
   */
  webMiddleware() {
    return async (req, res, next) => {
      try {
        let userLanguage = this.defaultLanguage;

        // Priority: query parameter > session > customer database > default
        if (req.query && req.query.lang && this.supportedLanguages.includes(req.query.lang)) {
          userLanguage = req.query.lang;
          if (req.session) {
            req.session.lang = userLanguage;
          }
        } else if (req.session && req.session.lang && this.supportedLanguages.includes(req.session.lang)) {
          userLanguage = req.session.lang;
        } else if (req.session && req.session.customer && req.session.customer.phone) {
          try {
            userLanguage = await this.getUserLanguage(req.session.customer.phone);
            if (req.session) {
              req.session.lang = userLanguage;
            }
          } catch (error) {
            // Silently fallback to default language to avoid spam logs
            userLanguage = this.defaultLanguage;
          }
        }

        // Set i18n locale for this request
        if (req.setLocale) {
          req.setLocale(userLanguage);
        }
        res.locals.currentLanguage = userLanguage;
        
        next();
      } catch (error) {
        console.error('Language middleware error:', error);
        if (req.setLocale) {
          req.setLocale(this.defaultLanguage);
        }
        res.locals.currentLanguage = this.defaultLanguage;
        next();
      }
    };
  }

  /**
   * Get supported languages list
   * @returns {Array} Array of supported language codes
   */
  getSupportedLanguages() {
    return this.supportedLanguages;
  }

  /**
   * Check if language is supported
   * @param {string} language - Language code to check
   * @returns {boolean} True if supported
   */
  isLanguageSupported(language) {
    return this.supportedLanguages.includes(language);
  }
}

module.exports = new LanguageHelper();
