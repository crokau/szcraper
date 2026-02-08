import express from "express";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import pLimit from "p-limit";
import fetch from "node-fetch";

dotenv.config();
puppeteer.use(StealthPlugin());

const app = express();
app.use(express.json());

// ==========================
// Config
// ==========================
const PORT = parseInt(process.env.PORT || "3000", 10);
const CONCURRENCY = parseInt(process.env.CONCURRENCY || "2", 10);
const HEADLESS = (process.env.HEADLESS || "false").toLowerCase() === "true";
const RETRIES = parseInt(process.env.RETRIES || "2", 10);
const OUTPUT_DIR = process.env.OUTPUT_DIR || "output";
const UA_DESKTOP =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const proxiesFile = process.env.PROXIES;
let PROXIES = [];
if (proxiesFile && fs.existsSync(proxiesFile)) {
  PROXIES = fs
    .readFileSync(proxiesFile, "utf-8")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// ==========================
// Helpers
// ==========================
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

function sanitizeName(url) {
  return url.replace(/(^\w+:|^)\/\//, "").replace(/[/?#&=]/g, "_").slice(0, 200);
}

async function humanize(page) {
  try {
    await page.mouse.move(200, 200);
    await delay(200 + Math.random() * 300);
    await page.mouse.move(400, 350);
    await delay(150 + Math.random() * 200);
    await page.evaluate(() =>
      window.scrollBy(0, Math.floor(window.innerHeight * 0.25))
    );
    await delay(200 + Math.random() * 400);
    await page.evaluate(() =>
      window.scrollBy(0, Math.floor(window.innerHeight * 0.5))
    );
  } catch {}
}

async function extractLinks(page) {
  await delay(1000);
  const links = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a[href*="/s-ad/"]'))
      .map((a) => a.href.trim())
      .filter((h) => h.startsWith("https://"));
  });
  return [...new Set(links)];
}

async function extractWithSelectors(page) {
  const trySelectors = async (arr) => {
    for (const sel of arr) {
      const txt = await page
        .evaluate((s) => {
          const el = document.querySelector(s);
          return el ? el.innerText.trim() : "";
        }, sel)
        .catch(() => "");
      if (txt && txt.length > 0) return txt;
    }
    return "";
  };

  const title = await trySelectors([
    "h1",
    ".advert-title",
    ".ad-title",
    "[data-qa='listing-title']",
  ]);
  const price = await trySelectors([
    "[data-qa='listing-price']",
    ".price",
    ".listing-price",
  ]);
  const location = await trySelectors([
    ".location",
    "[data-qa='listing-location']",
    "[itemprop='address']",
  ]);
  const description = await page
    .evaluate(() => {
      const el =
        document.querySelector("[data-qa='listing-description']") ||
        document.querySelector(".description") ||
        document.querySelector("[itemprop='description']");
      return el?.innerText?.trim() || "";
    })
    .catch(() => "");
  return { title, price, location, description };
}

// ==========================
// Launch browser
// ==========================
async function launchBrowser(proxy) {
  const args = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-web-security",
  ];
  if (proxy) args.push(`--proxy-server=${proxy}`);
  return puppeteer.launch({
    headless: HEADLESS,
    args,
    defaultViewport: { width: 1366, height: 768 },
  });
}

// ==========================
// Run one URL
// ==========================
async function runOne(url, proxy) {
  let attempt = 0;
  while (attempt <= RETRIES) {
    attempt++;
    let browser;
    try {
      browser = await launchBrowser(proxy);
      const page = await browser.newPage();
      await page.setUserAgent(UA_DESKTOP);
      await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });
      page.setDefaultNavigationTimeout(60000);

      // Warmup
      try {
        await page.goto("https://www.gumtree.com.au/", {
          waitUntil: "networkidle2",
          timeout: 30000,
        });
      } catch {}

      await delay(800 + Math.random() * 1000);
      await humanize(page);

      const resp = await page.goto(url, {
        waitUntil: "networkidle2",
        timeout: 60000,
      });
      if (resp && [403, 429].includes(resp.status()))
        throw new Error(`Blocked (HTTP ${resp.status()})`);

      await delay(1500 + Math.random() * 1000);
      await humanize(page);

      const html = await page.content();
      const id = sanitizeName(url);
      const outDir = path.join(OUTPUT_DIR, id);
      fs.mkdirSync(outDir, { recursive: true });

      fs.writeFileSync(path.join(outDir, "page.html"), html, "utf-8");
      await page.screenshot({
        path: path.join(outDir, "screenshot.png"),
        fullPage: true,
      });

      const meta = await extractWithSelectors(page);
      const links = await extractLinks(page);

      meta.url = url;
      meta.linkCount = links.length;
      meta.scrapedAt = new Date().toISOString();

      fs.writeFileSync(
        path.join(outDir, "meta.json"),
        JSON.stringify(meta, null, 2),
        "utf-8"
      );
      fs.writeFileSync(
        path.join(outDir, "links.json"),
        JSON.stringify(links, null, 2),
        "utf-8"
      );

      console.log(`[OK] ${url} (${links.length} ads)`);
      await page.close();
      await browser.close();

      return { ok: true, url, meta, links };
    } catch (err) {
      console.warn(`[WARN] attempt ${attempt} failed for ${url}: ${err.message}`);
      try {
        if (browser) await browser.close();
      } catch {}
      if (attempt > RETRIES) {
        return { ok: false, url, error: err.message };
      }
      await delay(1000 + attempt * 500);
      if (PROXIES.length > 0)
        proxy = PROXIES[Math.floor(Math.random() * PROXIES.length)];
    }
  }
}

// ==========================
// GPT expansion
// ==========================
async function expandWithGPT(term) {
  const key = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  if (!key) return [term, `${term}`, `cheap ${term}`, `${term} near me`];

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        messages: [
          { role: "system", content: "Expand search queries for marketplace listings. Return an array of 5 concise variations only." },
          { role: "user", content: `Expand this term: "${term}"` },
        ],
      }),
    });
    if (!resp.ok) throw new Error(`OpenAI HTTP ${resp.status}`);
    const data = await resp.json();
    const text = data?.choices?.[0]?.message?.content?.trim() || "";
    const match = text.match(/\[.*\]/s);
    if (match) {
      const arr = JSON.parse(match[0]);
      return Array.from(new Set([term, ...arr]));
    }
    return [term, `used ${term}`, `cheap ${term}`, `${term} near me`];
  } catch {
    return [term, `used ${term}`, `cheap ${term}`, `${term} near me`];
  }
}

// ==========================
// URL builder (no + signs!)
// ==========================
function buildSearchUrl(term, location) {
  const q = encodeURIComponent(term);
  if (location && location.trim()) {
    const loc = encodeURIComponent(location.toLowerCase().trim().replace(/\s+/g, "-"));
    return `https://www.gumtree.com.au/s-${loc}/${q}/k0`;
  }
  return `https://www.gumtree.com.au/s-${q}/k0`;
}

// ==========================
// Express route
// ==========================
app.post("/search", async (req, res) => {
  const { term, location } = req.body;
  if (!term) return res.status(400).json({ error: "Missing term" });

  try {
    const expanded = await expandWithGPT(term);
    const urls = expanded.map((t) => buildSearchUrl(t, location));

    const limit = pLimit(CONCURRENCY);
    const results = await Promise.all(
      urls.map((u, i) => limit(() => runOne(u, PROXIES[i % PROXIES.length])))
    );

    const allLinks = results
      .filter((r) => r.ok)
      .flatMap((r) => r.links.map((url) => ({ url, source: r.url })));

    res.json({
      term,
      location: location || "all",
      expanded,
      totalFound: allLinks.length,
      results: allLinks,
      failures: results.filter((r) => !r.ok),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/health", (_, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`✅ Gumtree API running on :${PORT}`));
