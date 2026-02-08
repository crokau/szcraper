# Gumtree Scraper Skill

To scrape Gumtree, read `v2/skill.md` for full documentation.

## Quick Usage

```javascript
import lib from "./v2/lib.mjs";

const results = await lib.scrapeGumtreeSearch({
  query: "your search term",
  location: "sydney",  // optional
  maxPages: 3,
});

lib.saveJson("./output/results.json", results);
```

## Setup

```bash
cd v2 && npm install
```

## Key Points

- Use the helper library - it handles stealth, anti-detection, retries
- Always add delays between requests (`lib.delay(2000, 4000)`)
- Check `results.errors` for Cloudflare/blocking issues
- Test with `headless: false` to debug visually
