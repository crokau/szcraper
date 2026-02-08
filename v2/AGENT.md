# Gumtree Scraper Skill

To scrape Gumtree, read `v2/skill.md` for full documentation.

## Quick Usage

```javascript
import lib from "./v2/lib.mjs";

const results = await lib.scrapeGumtreeSearch({
  location: "maltipoo puppies sydney",  // Full search: item + location
  maxPages: 3,
  scrapeDetails: true,  // Scrape each listing for full details
});

lib.saveJson("./output/results.json", results);
```

## Setup

```bash
cd v2 && npm install
```

## Key Points

- **location**: Full search term - "item location" (e.g. "iphone 15 melbourne")
- Use the helper library - it handles stealth, anti-detection, retries
- Set `scrapeDetails: true` to get full listing info (description, seller, images)
- Check `results.errors` for Cloudflare/blocking issues
- Test with `headless: false` to debug visually
