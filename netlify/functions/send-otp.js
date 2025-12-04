// Try to load Chromium, but handle gracefully if it fails
let chromium;
try {
  chromium = require('@sparticuz/chromium');
  // Configure Chromium for Netlify/Lambda environment
  chromium.setGraphicsMode(false);
} catch (e) {
  console.warn('Failed to load @sparticuz/chromium:', e.message);
  chromium = null;
}

const puppeteer = require('puppeteer-core');
const { v4: uuidv4 } = require('uuid');

// Simple in-memory cache for sessions
const sessionCache = new Map();

// Simple logger
const logger = {
  info: (...args) => console.log('[INFO]', ...args),
  debug: (...args) => console.log('[DEBUG]', ...args),
  warn: (...args) => console.warn('[WARN]', ...args),
  error: (...args) => console.error('[ERROR]', ...args),
};

class ZomotoStandalone {
  constructor() {
    // No dependencies on integrationId or userId
  }

  /**
   * Wrapper to add timeout to async operations
   */
  async _withTimeout(promise, timeoutMs, operationName) {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`${operationName} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]);
  }

  /**
   * Wait for selector with retry logic
   */
  async _waitForSelectorWithRetry(pageOrFrame, selector, options = {}) {
    const {
      timeout = 60000,
      retries = 3,
      retryDelay = 1000,
      visible = false,
    } = options;

    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const element = await pageOrFrame.waitForSelector(selector, {
          timeout: attempt === 0 ? timeout : timeout / (retries + 1),
          visible,
        });
        if (attempt > 0) {
          logger.info(`Selector found on retry attempt ${attempt}: ${selector}`);
        }
        return element;
      } catch (error) {
        lastError = error;
        if (attempt < retries) {
          const delay = retryDelay * Math.pow(2, attempt);
          logger.debug(`Selector not found, retrying in ${delay}ms (attempt ${attempt + 1}/${retries}): ${selector}`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
    throw lastError;
  }

  /**
   * Make page stealth to avoid bot detection
   */
  async _makePageStealth(page) {
    try {
      // Remove webdriver property
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', {
          get: () => false,
        });
      });

      // Override navigator properties
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'plugins', {
          get: () => [1, 2, 3, 4, 5],
        });

        Object.defineProperty(navigator, 'languages', {
          get: () => ['en-US', 'en'],
        });

        Object.defineProperty(navigator, 'platform', {
          get: () => 'Win32',
        });

        Object.defineProperty(navigator, 'hardwareConcurrency', {
          get: () => 8,
        });

        Object.defineProperty(navigator, 'deviceMemory', {
          get: () => 8,
        });

        window.chrome = {
          runtime: {},
        };

        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters) =>
          parameters.name === 'notifications'
            ? Promise.resolve({ state: Notification.permission })
            : originalQuery(parameters);
      });

      await page.setViewport({
        width: 1920,
        height: 1080,
        deviceScaleFactor: 1,
      });

      await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Upgrade-Insecure-Requests': '1',
        'Connection': 'keep-alive',
        'Cache-Control': 'max-age=0',
      });

      logger.debug('Stealth mode enabled for page');
    } catch (error) {
      logger.warn('Failed to enable stealth mode:', error.message);
    }
  }

  /**
   * Get browser launch options
   */
  async _getBrowserLaunchOptions() {
    const isLambda = !!process.env.LAMBDA_TASK_ROOT || !!process.env.AWS_EXECUTION_ENV || !!process.env.NETLIFY;
    
    const baseArgs = [
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--window-size=1920,1080',
      '--start-maximized',
      '--lang=en-US,en',
    ];

    const baseOptions = {
      args: baseArgs,
      headless: true,
      ignoreHTTPSErrors: true,
    };

    // For Lambda/serverless environments, try to use @sparticuz/chromium
    if (isLambda && chromium) {
      try {
        // Get executable path - this might fail on Netlify if Chromium isn't properly bundled
        const executablePath = await chromium.executablePath();
        
        if (executablePath) {
          return {
            ...baseOptions,
            defaultViewport: chromium.defaultViewport || { width: 1920, height: 1080 },
            executablePath: executablePath,
            headless: chromium.headless !== undefined ? chromium.headless : true,
          };
        }
      } catch (e) {
        logger.warn('Failed to get chromium executable path:', e.message);
        logger.warn('This might be a Netlify bundling issue. Consider using Vercel or ensuring Chromium is properly bundled.');
        // Fall through to default options - this won't work but will give clearer error
      }
    }
    
    // For local development or if Chromium setup fails
    // Note: This will fail on Netlify without Chromium executable
    logger.warn('Using default puppeteer options - this requires Chromium to be available');
    return {
      ...baseOptions,
      defaultViewport: { width: 1920, height: 1080 },
    };
  }

  /**
   * Launch browser directly
   */
  async launchBrowser() {
    const launchOptions = await this._getBrowserLaunchOptions();
    const browser = await puppeteer.launch(launchOptions);
    logger.debug('Browser launched');
    return browser;
  }

  /**
   * Send OTP
   */
  async sendOTP(identifier, countryCode, type = 'phone') {
    let browser;
    try {
      logger.info(`Initiating login for: ${identifier}`);

      browser = await this._withTimeout(
        this.launchBrowser(),
        30000,
        'Browser launch'
      );

      const page = await this._withTimeout(
        browser.newPage(),
        10000,
        'Page creation'
      );

      await this._makePageStealth(page);

      await this._withTimeout(
        page.setUserAgent(
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        ),
        5000,
        'User agent setup'
      );

      const zomatoPartnersUrl = process.env.ZOMATO_PARTNERS_URL || 'https://partner.zomato.com';
      logger.debug('Navigating to login page...');
      
      await this._withTimeout(
        page.goto(`${zomatoPartnersUrl}/login`, {
          waitUntil: 'networkidle2',
          timeout: 60000,
        }),
        60000,
        'Page navigation'
      );

      await new Promise((resolve) => setTimeout(resolve, 2000));

      const pageUrl = page.url();
      const pageTitle = await page.title().catch(() => 'Unknown');
      logger.debug(`Page loaded: URL=${pageUrl}, Title=${pageTitle}`);

      if (pageTitle === 'Access Denied' || pageTitle.toLowerCase().includes('access denied')) {
        const errorMessage = 'Zomato detected automated browser and blocked access. This may be due to bot detection. Please check browser stealth settings.';
        logger.error(errorMessage);
        throw new Error(errorMessage);
      }

      const loginButtonXPath = "//button[.//span[text()='Login']]";
      let loginButton;
      try {
        loginButton = await this._waitForSelectorWithRetry(
          page,
          `xpath/${loginButtonXPath}`,
          {
            timeout: 60000,
            retries: 2,
            retryDelay: 2000,
            visible: true,
          }
        );
      } catch (error) {
        const errorMessage = `Failed to find Login button after navigation. Page URL: ${pageUrl}, Page Title: ${pageTitle}. Original error: ${error.message}`;
        logger.error(errorMessage);
        throw new Error(errorMessage);
      }

      await loginButton.click();

      await page.waitForSelector('iframe[src*="accounts.zomato.com"]', { timeout: 15000 });
      const frameHandle = await page.$('iframe[src*="accounts.zomato.com"]');
      const frame = await frameHandle.contentFrame();
      if (!frame) {
        throw new Error('Could not find the login iframe.');
      }

      await frame.waitForSelector(`xpath/ //h2[text()='Login']`, { timeout: 10000 });
      const continueWithEmailSelector = 'div[aria-label="Continue with Email"]';
      const continueWithEmailButton = await frame.waitForSelector(continueWithEmailSelector, {
        visible: true,
        timeout: 15000,
      });

      if (type === 'email') {
        const boundingBox = await continueWithEmailButton.boundingBox();
        if (boundingBox) {
          const frameBox = await frameHandle.boundingBox();
          await page.mouse.click(
            frameBox.x + boundingBox.x + boundingBox.width / 2,
            frameBox.y + boundingBox.y + boundingBox.height / 2
          );
        } else {
          throw new Error('Could not get bounding box for "Continue with Email" button.');
        }

        await new Promise((r) => setTimeout(r, 1500));

        const emailInputXPath = "//label[text()='Email']/preceding-sibling::section/input[@type='text']";
        await frame.waitForSelector(`xpath/${emailInputXPath}`, { timeout: 10000 });
        const emailInput = await frame.$(`xpath/${emailInputXPath}`);
        await emailInput.type(identifier);

        const sendOtpButtonXPath = "//button[.//span[text()='Send One Time Password']]";
        const sendOtpButton = await frame.waitForSelector(`xpath/${sendOtpButtonXPath}`, { timeout: 30000 });
        await sendOtpButton.click();

        logger.info('OTP request sent.');
      } else {
        const phoneInputSelector = "input[placeholder='Phone']";
        await frame.waitForSelector(phoneInputSelector, { timeout: 10000 });
        const phoneInput = await frame.$(phoneInputSelector);
        await phoneInput.type(identifier);

        const sendOtpButtonXPath = "//button[.//span[text()='Send One Time Password']]";
        const sendOtpButton = await frame.waitForSelector(`xpath/${sendOtpButtonXPath}`, { timeout: 30000 });
        await sendOtpButton.click();

        logger.info('OTP request sent.');
      }

      // Generate sessionId
      let sessionId = uuidv4();
      const sessionData = {
        browser,
        page,
        frame,
      };
      sessionCache.set(sessionId, sessionData);

      // Cleanup browser after 5 minutes if not used
      setTimeout(() => {
        try {
          if (browser && browser.isConnected()) {
            browser.close();
            sessionCache.delete(sessionId);
          }
        } catch (e) {
          // Ignore cleanup errors
        }
      }, 5 * 60 * 1000);

      return { sessionId };
    } catch (error) {
      if (browser) {
        try {
          if (browser.isConnected()) {
            await browser.close();
          }
        } catch (closeError) {
          logger.warn('Error closing browser:', closeError.message);
        }
      }
      throw error;
    }
  }
}

// Netlify serverless function handler
exports.handler = async (event, context) => {
  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Method not allowed. Use POST.',
      }),
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { identifier, countryCode, type = 'phone' } = body;

    if (!identifier) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'identifier is required',
        }),
      };
    }

    const zomoto = new ZomotoStandalone();
    const data = await zomoto.sendOTP(identifier, countryCode, type);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'OTP sent successfully',
        data,
      }),
    };
  } catch (error) {
    logger.error('Error in sendOTP:', error);
    
    const statusCode = error.message.includes('detected automated browser') ? 403 : 500;
    
    return {
      statusCode,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to send OTP',
      }),
    };
  }
};

