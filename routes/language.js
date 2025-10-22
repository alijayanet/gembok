const express = require('express');
const router = express.Router();
const languageHelper = require('../config/languageHelper');

// Switch language
router.get('/switch/:lang', async (req, res) => {
  try {
    const { lang } = req.params;
    const redirectUrl = req.query.redirect || req.headers.referer || '/customer/login';
    
    // Validate language
    if (!languageHelper.isLanguageSupported(lang)) {
      return res.status(400).json({
        success: false,
        message: 'Unsupported language'
      });
    }
    
    // Set language in session
    req.session.lang = lang;
    
    // Update customer language in database if logged in
    if (req.session.customer && req.session.customer.phone) {
      try {
        await languageHelper.setUserLanguage(req.session.customer.phone, lang);
      } catch (error) {
        console.error('Error updating customer language:', error);
        // Continue anyway - session language is set
      }
    }
    
    // Set locale for current request
    req.setLocale(lang);
    
    // Redirect back with language parameter
    const separator = redirectUrl.includes('?') ? '&' : '?';
    res.redirect(`${redirectUrl}${separator}lang=${lang}`);
    
  } catch (error) {
    console.error('Language switch error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get current language
router.get('/current', (req, res) => {
  try {
    const currentLang = req.getLocale() || 'id';
    const supportedLanguages = languageHelper.getSupportedLanguages();
    
    res.json({
      success: true,
      data: {
        current: currentLang,
        supported: supportedLanguages
      }
    });
  } catch (error) {
    console.error('Get current language error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get supported languages
router.get('/supported', (req, res) => {
  try {
    const supportedLanguages = languageHelper.getSupportedLanguages();
    
    res.json({
      success: true,
      data: supportedLanguages
    });
  } catch (error) {
    console.error('Get supported languages error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

module.exports = router;
