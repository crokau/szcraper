/**
 * Test script: Search for Maltipoo puppies on Gumtree
 *
 * Usage: node test-maltipoo.mjs
 */

import lib from "./lib.mjs";

console.log("🐕 Searching for Maltipoo puppies on Gumtree...\n");

const results = await lib.scrapeGumtreeSearch({
  query: "maltipoo puppy",
  location: "australia",
  maxPages: 3,
  headless: true,
  onPage: ({ page, listings }) => {
    console.log(`Page ${page}: Found ${listings.length} listings`);
  },
});

console.log(`\n--- Results ---`);
console.log(`Total listings: ${results.listings.length}`);
console.log(`Pages scraped: ${results.pagesScraped}`);

if (results.errors.length > 0) {
  console.log(`\nErrors:`);
  results.errors.forEach((e) => console.log(`  - ${e.error}`));
}

if (results.listings.length > 0) {
  console.log(`\nListings found:\n`);
  results.listings.forEach((l, i) => {
    console.log(`${i + 1}. ${l.title || "(no title)"}`);
    console.log(`   Price: ${l.price || "N/A"}`);
    console.log(`   Location: ${l.location || "N/A"}`);
    console.log(`   URL: ${l.url}`);
    console.log();
  });
}

// Save results
lib.saveJson("./output/maltipoo-results.json", results);
console.log(`Saved to ./output/maltipoo-results.json`);
