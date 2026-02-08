/**
 * Gumtree Scraper Helper Library v2
 *
 * Handles all boilerplate for scraping hard sites:
 * - Browser setup with stealth
 * - Human-like behavior simulation
 * - Retry logic with proxy rotation
 * - Data extraction utilities
 * - Rate limiting and delays
 */

import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import fs from "fs";
import path from "path";

puppeteer.use(StealthPlugin());

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG = {
  headless: true,
  timeout: 60000,
  retries: 2,
  viewport: { width: 1366, height: 768 },
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  outputDir: "./output",
  delayRange: { min: 800, max: 1800 },
  proxyFile: null,
};

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Random delay between min and max milliseconds
 */
export function delay(min = 500, max = null) {
  const ms = max ? min + Math.random() * (max - min) : min;
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Sanitize string for use as filename
 */
export function sanitizeFilename(str) {
  return str.replace(/[^a-z0-9_-]/gi, "_").slice(0, 100);
}

/**
 * Load proxies from file (newline-delimited)
 */
export function loadProxies(filepath) {
  if (!filepath || !fs.existsSync(filepath)) return [];
  return fs.readFileSync(filepath, "utf-8")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Pick random item from array
 */
export function randomFrom(arr) {
  if (!arr || arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

// ============================================================================
// BROWSER MANAGEMENT
// ============================================================================

/**
 * Create a configured browser instance
 *
 * @param {Object} options
 * @param {boolean} options.headless - Run headless (default: true)
 * @param {string} options.proxy - Proxy server URL
 * @param {Object} options.viewport - Viewport dimensions
 * @returns {Promise<Browser>}
 */
export async function createBrowser(options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };

  const args = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-web-security",
    "--disable-blink-features=AutomationControlled",
  ];

  if (config.proxy) {
    args.push(`--proxy-server=${config.proxy}`);
  }

  // Must use system Chrome (required for anti-detection)
  const systemChromePaths = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",  // macOS
    "/usr/bin/google-chrome",  // Linux
    "/usr/bin/chromium-browser",  // Linux alt
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",  // Windows
  ];

  let executablePath = null;
  for (const p of systemChromePaths) {
    if (fs.existsSync(p)) {
      executablePath = p;
      break;
    }
  }

  if (!executablePath) {
    throw new Error("System Chrome not found. Install Google Chrome to proceed.");
  }

  const browser = await puppeteer.launch({
    headless: config.headless,
    args,
    defaultViewport: config.viewport,
    executablePath,
  });

  return browser;
}

/**
 * Create a configured page with stealth settings applied
 *
 * @param {Browser} browser
 * @param {Object} options
 * @returns {Promise<Page>}
 */
export async function createPage(browser, options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };
  const page = await browser.newPage();

  await page.setUserAgent(config.userAgent);
  await page.setExtraHTTPHeaders({
    "Accept-Language": "en-AU,en-US;q=0.9,en;q=0.8",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  });

  // Set default timeout
  page.setDefaultTimeout(config.timeout);
  page.setDefaultNavigationTimeout(config.timeout);

  return page;
}

// ============================================================================
// HUMAN-LIKE BEHAVIOR
// ============================================================================

/**
 * Simulate human-like behavior on page
 * - Random mouse movements
 * - Natural scrolling
 * - Variable delays
 */
export async function humanize(page) {
  try {
    // Random mouse movements
    const x1 = 100 + Math.random() * 200;
    const y1 = 100 + Math.random() * 200;
    await page.mouse.move(x1, y1);
    await delay(150, 350);

    const x2 = 300 + Math.random() * 300;
    const y2 = 200 + Math.random() * 300;
    await page.mouse.move(x2, y2);
    await delay(100, 250);

    // Natural scrolling
    await page.evaluate(() => {
      window.scrollBy(0, Math.floor(window.innerHeight * (0.2 + Math.random() * 0.3)));
    });
    await delay(200, 500);

    await page.evaluate(() => {
      window.scrollBy(0, Math.floor(window.innerHeight * (0.3 + Math.random() * 0.4)));
    });
    await delay(150, 400);
  } catch (e) {
    // Silently ignore humanization errors
  }
}

/**
 * Warm up session by visiting homepage first
 */
export async function warmup(page, baseUrl = "https://www.gumtree.com.au/") {
  try {
    await page.goto(baseUrl, { waitUntil: "networkidle2", timeout: 30000 });
    await delay(500, 1500);
    await humanize(page);
  } catch (e) {
    // Warmup failures are non-critical
  }
}

// ============================================================================
// NAVIGATION & SCRAPING
// ============================================================================

/**
 * Navigate to URL with retry logic and blocking detection
 *
 * @param {Page} page
 * @param {string} url
 * @param {Object} options
 * @returns {Promise<{ok: boolean, status: number, error?: string}>}
 */
export async function navigateTo(page, url, options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };

  try {
    const response = await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: config.timeout,
    });

    const status = response ? response.status() : 0;

    // Check for blocking
    if ([403, 429, 503].includes(status)) {
      return { ok: false, status, error: `Blocked (HTTP ${status})` };
    }

    await delay(config.delayRange.min, config.delayRange.max);
    await humanize(page);

    return { ok: true, status };
  } catch (e) {
    return { ok: false, status: 0, error: e.message };
  }
}

/**
 * Execute with retry logic and optional proxy rotation
 *
 * @param {Function} fn - Async function to execute
 * @param {Object} options
 * @param {number} options.retries - Number of retries
 * @param {Array} options.proxies - Array of proxy URLs
 * @returns {Promise<any>}
 */
export async function withRetry(fn, options = {}) {
  const { retries = 2, proxies = [], onRetry } = options;
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const proxy = proxies.length > 0 ? randomFrom(proxies) : null;
      return await fn({ attempt, proxy });
    } catch (e) {
      lastError = e;
      if (attempt < retries) {
        const backoff = 1000 + attempt * 500 + Math.random() * 500;
        await delay(backoff);
        if (onRetry) onRetry(attempt + 1, e);
      }
    }
  }

  throw lastError;
}

// ============================================================================
// DATA EXTRACTION
// ============================================================================

/**
 * Try multiple CSS selectors until one returns a value
 *
 * @param {Page} page
 * @param {string[]} selectors - Array of CSS selectors to try
 * @param {string} attribute - Attribute to extract ('text', 'href', 'src', etc.)
 * @returns {Promise<string>}
 */
export async function extractFirst(page, selectors, attribute = "text") {
  for (const selector of selectors) {
    try {
      const value = await page.evaluate((sel, attr) => {
        const el = document.querySelector(sel);
        if (!el) return "";
        if (attr === "text") return el.innerText?.trim() || "";
        if (attr === "html") return el.innerHTML?.trim() || "";
        return el.getAttribute(attr)?.trim() || "";
      }, selector, attribute);

      if (value && value.length > 0) return value;
    } catch (e) {
      continue;
    }
  }
  return "";
}

/**
 * Extract all matching elements
 *
 * @param {Page} page
 * @param {string} selector - CSS selector
 * @param {Function} extractor - Function to extract data from each element
 * @returns {Promise<any[]>}
 */
export async function extractAll(page, selector, extractor) {
  return page.evaluate((sel, fn) => {
    const elements = Array.from(document.querySelectorAll(sel));
    // extractor is passed as string and eval'd
    const extractFn = new Function("el", fn);
    return elements.map(el => extractFn(el)).filter(Boolean);
  }, selector, extractor.toString().replace(/^[^{]*{|}$/g, ''));
}

/**
 * Extract all links matching a pattern
 *
 * @param {Page} page
 * @param {string} pattern - URL pattern to match (e.g., "/s-ad/")
 * @returns {Promise<string[]>}
 */
export async function extractLinks(page, pattern = "/s-ad/") {
  const links = await page.evaluate((pat) => {
    return Array.from(document.querySelectorAll("a[href]"))
      .map((a) => a.href.trim())
      .filter((h) => h.includes(pat) && h.startsWith("https://"));
  }, pattern);

  return [...new Set(links)]; // Dedupe
}

/**
 * Wait for any of the given selectors to appear
 *
 * @param {Page} page
 * @param {string[]} selectors
 * @param {number} timeout
 * @returns {Promise<string|null>} - The selector that matched, or null
 */
export async function waitForAny(page, selectors, timeout = 10000) {
  const promises = selectors.map(sel =>
    page.waitForSelector(sel, { timeout })
      .then(() => sel)
      .catch(() => null)
  );

  const results = await Promise.race([
    Promise.any(promises.map(p => p.then(r => r ? Promise.resolve(r) : Promise.reject()))),
    delay(timeout).then(() => null)
  ]);

  return results;
}

/**
 * Scroll to bottom of page to load lazy content
 */
export async function scrollToBottom(page, options = {}) {
  const { step = 300, delayMs = 200, maxScrolls = 20 } = options;

  let scrolls = 0;
  let lastHeight = 0;

  while (scrolls < maxScrolls) {
    const currentHeight = await page.evaluate(() => document.body.scrollHeight);

    if (currentHeight === lastHeight) break;
    lastHeight = currentHeight;

    await page.evaluate((s) => window.scrollBy(0, s), step);
    await delay(delayMs, delayMs + 100);
    scrolls++;
  }
}

// ============================================================================
// GUMTREE-SPECIFIC HELPERS
// ============================================================================

/**
 * Build Gumtree search URL
 *
 * @param {string} query - Search term
 * @param {Object} options
 * @param {string} options.location - Location (e.g., "sydney", "melbourne")
 * @param {string} options.category - Category slug
 * @param {number} options.page - Page number (1-based)
 * @param {string} options.sort - Sort order
 * @returns {string}
 */
export function buildGumtreeSearchUrl(query, options = {}) {
  const { location, category, page = 1, sort } = options;

  const q = encodeURIComponent(query);
  let url;

  if (location && location.trim()) {
    const loc = location.toLowerCase().trim().replace(/\s+/g, "-");
    if (category) {
      url = `https://www.gumtree.com.au/s-${category}/${loc}/${q}/k0`;
    } else {
      url = `https://www.gumtree.com.au/s-${loc}/${q}/k0`;
    }
  } else if (category) {
    url = `https://www.gumtree.com.au/s-${category}/${q}/k0`;
  } else {
    url = `https://www.gumtree.com.au/s-${q}/k0`;
  }

  // Add page parameter
  if (page > 1) {
    url += `?page=${page}`;
  }

  // Add sort parameter
  if (sort) {
    url += url.includes("?") ? `&sort=${sort}` : `?sort=${sort}`;
  }

  return url;
}

/**
 * Extract listing data from a Gumtree search results page
 *
 * @param {Page} page
 * @returns {Promise<Object[]>}
 */
export async function extractGumtreeListings(page) {
  return page.evaluate(() => {
    const listings = [];

    // Find all listing cards
    const cards = document.querySelectorAll('[data-testid="listing-card"], .user-ad-row, .listing-card');

    cards.forEach(card => {
      const link = card.querySelector('a[href*="/s-ad/"]');
      const titleEl = card.querySelector('h2, h3, .listing-title, [data-testid="listing-title"]');
      const priceEl = card.querySelector('.listing-price, [data-testid="listing-price"], .price');
      const locationEl = card.querySelector('.listing-location, [data-testid="listing-location"], .location');
      const imageEl = card.querySelector('img');

      if (link) {
        listings.push({
          url: link.href,
          title: titleEl?.innerText?.trim() || "",
          price: priceEl?.innerText?.trim() || "",
          location: locationEl?.innerText?.trim() || "",
          image: imageEl?.src || "",
        });
      }
    });

    // Fallback: extract any /s-ad/ links if no cards found
    if (listings.length === 0) {
      document.querySelectorAll('a[href*="/s-ad/"]').forEach(a => {
        listings.push({
          url: a.href,
          title: a.innerText?.trim() || "",
          price: "",
          location: "",
          image: "",
        });
      });
    }

    return listings;
  });
}

/**
 * Extract detailed data from a Gumtree listing page
 *
 * @param {Page} page
 * @returns {Promise<Object>}
 */
export async function extractGumtreeListingDetails(page) {
  const data = {
    title: await extractFirst(page, [
      "h1",
      "[data-testid='listing-title']",
      ".listing-title",
      ".ad-title",
    ]),

    price: await extractFirst(page, [
      "[data-testid='listing-price']",
      ".listing-price",
      ".price",
      "[itemprop='price']",
    ]),

    location: await extractFirst(page, [
      "[data-testid='listing-location']",
      ".listing-location",
      ".location",
      "[itemprop='address']",
    ]),

    description: await extractFirst(page, [
      "[data-testid='listing-description']",
      ".listing-description",
      ".description",
      "[itemprop='description']",
    ]),

    seller: await extractFirst(page, [
      "[data-testid='seller-name']",
      ".seller-name",
      ".seller-info .name",
    ]),

    postedDate: await extractFirst(page, [
      "[data-testid='listing-date']",
      ".listing-date",
      ".posted-date",
      "time",
    ]),

    attributes: {},
    images: [],
    url: page.url(),
    scrapedAt: new Date().toISOString(),
  };

  // Extract attributes/specs
  try {
    data.attributes = await page.evaluate(() => {
      const attrs = {};
      const rows = document.querySelectorAll('.attribute-row, [data-testid="attribute"], .specs-row, dl dt');
      rows.forEach(row => {
        const label = row.querySelector('dt, .label, .attr-name')?.innerText?.trim();
        const value = row.querySelector('dd, .value, .attr-value')?.innerText?.trim();
        if (label && value) attrs[label] = value;
      });
      return attrs;
    });
  } catch (e) {}

  // Extract images
  try {
    data.images = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.gallery img, .carousel img, [data-testid="gallery"] img'))
        .map(img => img.src || img.dataset.src)
        .filter(Boolean);
    });
  } catch (e) {}

  return data;
}

/**
 * Check if current page shows Cloudflare challenge
 */
export async function isCloudflareChallenge(page) {
  return page.evaluate(() => {
    const title = document.title.toLowerCase();
    const body = document.body?.innerText?.toLowerCase() || "";
    return (
      title.includes("just a moment") ||
      title.includes("attention required") ||
      body.includes("checking your browser") ||
      body.includes("cloudflare") ||
      document.querySelector("#challenge-form") !== null
    );
  });
}

/**
 * Check pagination info
 */
export async function getPaginationInfo(page) {
  return page.evaluate(() => {
    const pager = document.querySelector('.pagination, [data-testid="pagination"], .pager');
    if (!pager) return { currentPage: 1, totalPages: 1, hasNext: false };

    const current = pager.querySelector('.active, .current, [aria-current="page"]');
    const next = pager.querySelector('a[rel="next"], .next:not(.disabled), [aria-label*="Next"]');
    const pages = Array.from(pager.querySelectorAll('a, button')).map(el => parseInt(el.innerText)).filter(n => !isNaN(n));

    return {
      currentPage: current ? parseInt(current.innerText) || 1 : 1,
      totalPages: pages.length > 0 ? Math.max(...pages) : 1,
      hasNext: !!next,
      nextUrl: next?.href || null,
    };
  });
}

// ============================================================================
// OUTPUT HELPERS
// ============================================================================

/**
 * Save scraped data to JSON file
 */
export function saveJson(filepath, data) {
  const dir = path.dirname(filepath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
}

/**
 * Save page HTML
 */
export async function saveHtml(page, filepath) {
  const dir = path.dirname(filepath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const html = await page.content();
  fs.writeFileSync(filepath, html);
}

/**
 * Save screenshot
 */
export async function saveScreenshot(page, filepath) {
  const dir = path.dirname(filepath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  await page.screenshot({ path: filepath, fullPage: true });
}

// ============================================================================
// HIGH-LEVEL SCRAPING FUNCTIONS
// ============================================================================

/**
 * Complete search scrape with all pages
 *
 * @param {Object} options
 * @param {string} options.query - Search term
 * @param {string} options.location - Location filter
 * @param {number} options.maxPages - Maximum pages to scrape
 * @param {boolean} options.headless - Run headless
 * @param {Function} options.onPage - Callback after each page
 * @param {Function} options.onListing - Callback for each listing
 * @returns {Promise<Object>}
 */
export async function scrapeGumtreeSearch(options) {
  const {
    query,
    location,
    category,
    maxPages = 5,
    headless = true,
    onPage,
    onListing,
    scrapeDetails = false,
    proxies = [],
  } = options;

  const results = {
    query,
    location,
    listings: [],
    pagesScraped: 0,
    errors: [],
  };

  let browser;

  try {
    const proxy = randomFrom(proxies);
    browser = await createBrowser({ headless, proxy });
    const page = await createPage(browser);

    // Warmup
    await warmup(page);

    let currentPage = 1;
    let hasMore = true;

    while (hasMore && currentPage <= maxPages) {
      const url = buildGumtreeSearchUrl(query, { location, category, page: currentPage });

      const nav = await navigateTo(page, url);

      if (!nav.ok) {
        results.errors.push({ page: currentPage, error: nav.error });
        break;
      }

      // Check for Cloudflare
      if (await isCloudflareChallenge(page)) {
        results.errors.push({ page: currentPage, error: "Cloudflare challenge detected" });
        break;
      }

      // Extract listings
      const listings = await extractGumtreeListings(page);

      // Optionally scrape individual listing details
      if (scrapeDetails && listings.length > 0) {
        for (const listing of listings) {
          try {
            await navigateTo(page, listing.url);
            const details = await extractGumtreeListingDetails(page);
            Object.assign(listing, details);
            if (onListing) onListing(listing);
            await delay(1000, 2000);
          } catch (e) {
            listing.error = e.message;
          }
        }
      }

      results.listings.push(...listings);
      results.pagesScraped++;

      if (onPage) onPage({ page: currentPage, listings, url });

      // Check pagination
      const pagination = await getPaginationInfo(page);
      hasMore = pagination.hasNext && currentPage < pagination.totalPages;
      currentPage++;

      if (hasMore) await delay(1500, 3000);
    }

  } catch (e) {
    results.errors.push({ error: e.message });
  } finally {
    if (browser) await browser.close();
  }

  return results;
}

// ============================================================================
// EXPORTS SUMMARY
// ============================================================================

export default {
  // Utilities
  delay,
  sanitizeFilename,
  loadProxies,
  randomFrom,

  // Browser
  createBrowser,
  createPage,

  // Behavior
  humanize,
  warmup,

  // Navigation
  navigateTo,
  withRetry,

  // Extraction
  extractFirst,
  extractAll,
  extractLinks,
  waitForAny,
  scrollToBottom,

  // Gumtree-specific
  buildGumtreeSearchUrl,
  extractGumtreeListings,
  extractGumtreeListingDetails,
  isCloudflareChallenge,
  getPaginationInfo,

  // Output
  saveJson,
  saveHtml,
  saveScreenshot,

  // High-level
  scrapeGumtreeSearch,
};
