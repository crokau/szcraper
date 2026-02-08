# Gumtree Scraper Skill

You are an AI that writes Node.js scraping scripts for Gumtree Australia. Use the helper library `lib.mjs` to handle browser automation, anti-detection, and data extraction.

## Quick Start

```javascript
import lib from "./lib.mjs";

const results = await lib.scrapeGumtreeSearch({
  location: "iphone 15 sydney",  // Full search: item + location
  maxPages: 3,
});

console.log(`Found ${results.listings.length} listings`);
lib.saveJson("./output/results.json", results);
```

---

## How Gumtree Works

### URL Structure

```
Search: https://www.gumtree.com.au/s-[query+with+plus+signs]/k0
Listing: https://www.gumtree.com.au/s-ad/[location]/[category]/[title]/[id]
```

The library automatically converts spaces to `+` in the URL.

---

## Library Reference

### High-Level (Recommended)

```javascript
// Complete search with pagination
const results = await lib.scrapeGumtreeSearch({
  location: "macbook pro melbourne",  // Required: full search term with location
  maxPages: 5,                        // Max pages to scrape (default: 5)
  headless: true,                     // Run headless (default: true)
  scrapeDetails: true,                // Scrape each listing page for full details
  proxies: [],                        // Array of proxy URLs
  onPage: ({ page, listings }) => console.log(`Page ${page}: ${listings.length} items`),
  onListing: (listing) => console.log(`Scraped: ${listing.title}`),
});

// Results structure:
// {
//   location: "macbook pro melbourne",
//   listings: [{ url, title, price, location, image, description, ... }],
//   pagesScraped: 3,
//   errors: []
// }
```

### Low-Level Control

For custom scraping logic:

```javascript
import lib from "./lib.mjs";

// 1. Create browser with stealth
const browser = await lib.createBrowser({
  headless: true,
  proxy: "http://user:pass@proxy.example.com:8080", // Optional
});

// 2. Create configured page
const page = await lib.createPage(browser);

// 3. Warmup (visit homepage first to establish session)
await lib.warmup(page);

// 4. Navigate with retry/blocking detection
const url = lib.buildGumtreeSearchUrl("gaming laptop sydney");
const nav = await lib.navigateTo(page, url);

if (!nav.ok) {
  console.error(`Failed: ${nav.error}`);
  await browser.close();
  process.exit(1);
}

// 5. Check for Cloudflare
if (await lib.isCloudflareChallenge(page)) {
  console.error("Cloudflare challenge detected - try different proxy");
  await browser.close();
  process.exit(1);
}

// 6. Extract data
const listings = await lib.extractGumtreeListings(page);
console.log(`Found ${listings.length} listings`);

// 7. Optionally scrape individual listing details
for (const listing of listings.slice(0, 5)) {
  await lib.navigateTo(page, listing.url);
  const details = await lib.extractGumtreeListingDetails(page);
  console.log(details);
  await lib.delay(1000, 2000); // Be polite
}

// 8. Check pagination
const pagination = await lib.getPaginationInfo(page);
if (pagination.hasNext) {
  console.log(`More pages available (${pagination.currentPage}/${pagination.totalPages})`);
}

// 9. Cleanup
await browser.close();
```

---

## Extraction Functions

### `extractGumtreeListings(page)`

Returns array of listings from search results:

```javascript
[
  {
    url: "https://www.gumtree.com.au/s-ad/...",
    title: "iPhone 15 Pro Max 256GB",
    price: "$1,500",
    location: "Sydney CBD",
    image: "https://..."
  }
]
```

### `extractGumtreeListingDetails(page)`

Returns full details from a listing page:

```javascript
{
  title: "iPhone 15 Pro Max 256GB",
  price: "$1,500",
  location: "Sydney CBD, NSW",
  description: "Full description text...",
  seller: "John D",
  postedDate: "3 days ago",
  attributes: {
    "Condition": "Used",
    "Brand": "Apple"
  },
  images: ["https://...", "https://..."],
  url: "https://...",
  scrapedAt: "2025-01-15T10:30:00.000Z"
}
```

### `extractFirst(page, selectors, attribute)`

Try multiple selectors, return first match:

```javascript
const price = await lib.extractFirst(page, [
  "[data-testid='price']",
  ".listing-price",
  ".price"
], "text");
```

### `extractLinks(page, pattern)`

Get all links matching a pattern:

```javascript
const adLinks = await lib.extractLinks(page, "/s-ad/");
```

---

## Anti-Detection

The library handles anti-detection automatically:

1. **Stealth Plugin** - Masks Puppeteer detection vectors
2. **User-Agent** - Desktop Chrome on macOS
3. **Headers** - Proper Accept-Language and Accept headers
4. **Humanization** - Random mouse moves, scrolling, delays
5. **Warmup** - Visits homepage before search
6. **Delays** - Random delays between requests (800-1800ms)

### Manual Humanization

```javascript
await lib.humanize(page);  // Mouse moves + scrolling
await lib.delay(500, 1500); // Random delay
await lib.scrollToBottom(page, { step: 300, delayMs: 200 }); // Lazy load content
```

---

## Retry & Proxies

### Automatic Retry

```javascript
const result = await lib.withRetry(
  async ({ attempt, proxy }) => {
    const browser = await lib.createBrowser({ proxy });
    // ... do work
    return data;
  },
  {
    retries: 3,
    proxies: ["http://proxy1.com:8080", "http://proxy2.com:8080"],
    onRetry: (attempt, error) => console.log(`Retry ${attempt}: ${error.message}`),
  }
);
```

### Load Proxies from File

```javascript
const proxies = lib.loadProxies("./proxies.txt");
// File format: one proxy per line
// http://user:pass@host:port
// socks5://host:port
```

---

## Output Helpers

```javascript
// Save JSON
lib.saveJson("./output/results.json", data);

// Save HTML snapshot
await lib.saveHtml(page, "./output/page.html");

// Save screenshot
await lib.saveScreenshot(page, "./output/screenshot.png");
```

---

## Example Scripts

### 1. Simple Search

```javascript
import lib from "./lib.mjs";

const results = await lib.scrapeGumtreeSearch({
  location: "mountain bike brisbane",
  maxPages: 2,
});

lib.saveJson("./output/bikes.json", results);
console.log(`Found ${results.listings.length} bikes`);
```

### 2. With Full Details

```javascript
import lib from "./lib.mjs";

const results = await lib.scrapeGumtreeSearch({
  location: "ps5 melbourne",
  maxPages: 1,
  scrapeDetails: true, // Scrapes each listing page for full info
  onListing: (l) => console.log(`${l.title} - ${l.price}`),
});

lib.saveJson("./output/ps5-detailed.json", results);
```

### 3. Custom Logic with Filters

```javascript
import lib from "./lib.mjs";

const browser = await lib.createBrowser({ headless: true });
const page = await lib.createPage(browser);
await lib.warmup(page);

const url = lib.buildGumtreeSearchUrl("toyota hilux perth");
await lib.navigateTo(page, url);
const listings = await lib.extractGumtreeListings(page);

// Filter by price
const affordable = listings.filter(l => {
  const price = parseInt(l.price.replace(/[^0-9]/g, "")) || 0;
  return price > 0 && price < 30000;
});

console.log(`${affordable.length} under $30k`);
lib.saveJson("./output/affordable-hilux.json", affordable);

await browser.close();
```

### 4. Multi-Query Search

```javascript
import lib from "./lib.mjs";

const searches = ["iphone 15 sydney", "iphone 14 sydney", "iphone 13 sydney"];
const allResults = [];

for (const location of searches) {
  console.log(`Searching: ${location}`);
  const results = await lib.scrapeGumtreeSearch({
    location,
    maxPages: 2,
  });
  allResults.push(...results.listings);
  await lib.delay(3000, 5000); // Pause between searches
}

const unique = [...new Map(allResults.map(l => [l.url, l])).values()];
lib.saveJson("./output/iphones.json", unique);
console.log(`Total unique: ${unique.length}`);
```

### 5. With Proxy Rotation

```javascript
import lib from "./lib.mjs";

const proxies = lib.loadProxies("./proxies.txt");

const results = await lib.scrapeGumtreeSearch({
  location: "nvidia rtx 4090",
  maxPages: 10,
  proxies,
  onPage: ({ page }) => console.log(`Completed page ${page}`),
});

lib.saveJson("./output/gpus.json", results);
```

---

## Error Handling

Common errors and solutions:

| Error | Cause | Solution |
|-------|-------|----------|
| `Blocked (HTTP 403)` | IP blocked | Use proxy, reduce speed |
| `Blocked (HTTP 429)` | Rate limited | Add longer delays |
| `Cloudflare challenge` | Bot detection | Different proxy, try later |
| `Navigation timeout` | Slow page/network | Increase timeout |

```javascript
const results = await lib.scrapeGumtreeSearch({ location: "test" });

if (results.errors.length > 0) {
  console.error("Errors occurred:", results.errors);
}
```

---

## Configuration Defaults

```javascript
{
  headless: true,
  timeout: 60000,
  retries: 2,
  viewport: { width: 1366, height: 768 },
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)...",
  delayRange: { min: 800, max: 1800 },
}
```

---

## Notes for AI Agents

1. **Always use the high-level `scrapeGumtreeSearch()` for simple tasks** - it handles browser lifecycle, retries, and pagination automatically.

2. **Use low-level functions only when you need custom logic** - like filtering during scrape, or scraping non-standard pages.

3. **Be polite** - Add delays between requests (`lib.delay(2000, 4000)`). Gumtree will block aggressive scrapers.

4. **Check for errors** - Always check `results.errors` and handle Cloudflare challenges.

5. **Save incrementally** - For large scrapes, save after each page in case of failures.

6. **Test with `headless: false` first** - See what's happening when debugging.
