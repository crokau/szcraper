/**
 * Example: Search Gumtree for items
 *
 * Usage: node example.mjs <search terms including location>
 *
 * Examples:
 *   node example.mjs iphone 15 sydney
 *   node example.mjs mountain bike brisbane
 *   node example.mjs toyota hilux perth
 */

import lib from "./lib.mjs";

// Location is the full search term (e.g. "iphone sydney")
const location = process.argv.slice(2).join(" ") || "iphone sydney";

console.log(`\nSearching Gumtree for: "${location}"\n`);

const results = await lib.scrapeGumtreeSearch({
  location,
  maxPages: 2,
  headless: true,
  onPage: ({ page, listings }) => {
    console.log(`Page ${page}: Found ${listings.length} listings`);
  },
});

console.log(`\n--- Results ---`);
console.log(`Total listings: ${results.listings.length}`);
console.log(`Pages scraped: ${results.pagesScraped}`);

if (results.errors.length > 0) {
  console.log(`Errors: ${results.errors.length}`);
  results.errors.forEach((e) => console.log(`  - ${e.error}`));
}

// Show first 5 listings
console.log(`\nTop listings:`);
results.listings.slice(0, 5).forEach((l, i) => {
  console.log(`${i + 1}. ${l.title || "(no title)"}`);
  console.log(`   Price: ${l.price || "N/A"}`);
  console.log(`   Location: ${l.location || "N/A"}`);
  console.log(`   URL: ${l.url}`);
  console.log();
});

// Save results
lib.saveJson("./output/results.json", results);
console.log(`\nSaved to ./output/results.json`);
