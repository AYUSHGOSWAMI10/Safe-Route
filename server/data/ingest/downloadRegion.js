#!/usr/bin/env node
/**
 * downloadRegion.js
 *
 * Downloads a Geofabrik .osm.pbf extract for an Indian region and converts
 * it to .osm XML for use with parseOSM.js.
 *
 * External tools required (not npm dependencies):
 *   - osmconvert or osmosis (for PBF -> OSM XML conversion)
 *   - curl or wget (for downloading)
 *
 * Usage:
 *   node server/data/ingest/downloadRegion.js <region> [outputDir]
 *
 * Example:
 *   node server/data/ingest/downloadRegion.js uttar-pradesh server/data/raw
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const GEOFABRIK_BASE = "https://download.geofabrik.de/asia/india";

const REGIONS = {
  "uttar-pradesh": "uttar-pradesh-latest.osm.pbf",
  "rajasthan": "rajasthan-latest.osm.pbf",
  "bihar": "bihar-latest.osm.pbf",
  "madhya-pradesh": "madhya-pradesh-latest.osm.pbf",
  "delhi": "delhi-latest.osm.pbf",
  "haryana": "haryana-latest.osm.pbf",
  "uttarakhand": "uttarakhand-latest.osm.pdf",
  "himachal-pradesh": "himachal-pradesh-latest.osm.pbf",
  "punjab": "punjab-latest.osm.pbf",
};

const region = process.argv[2];
const outputDir = process.argv[3] || path.join(__dirname, "../raw");

if (!region) {
  console.error("Usage: node downloadRegion.js <region> [outputDir]");
  console.error("Available regions:", Object.keys(REGIONS).join(", "));
  process.exit(1);
}

if (!REGIONS[region]) {
  console.error(`Unknown region: ${region}`);
  console.error("Available regions:", Object.keys(REGIONS).join(", "));
  process.exit(1);
}

const pbfFile = REGIONS[region];
const url = `${GEOFABRIK_BASE}/${pbfFile}`;
const pbfPath = path.join(outputDir, `${region}.osm.pbf`);
const osmPath = path.join(outputDir, `${region}.osm`);

fs.mkdirSync(outputDir, { recursive: true });

console.log(`Downloading ${region} from ${url}...`);
try {
  execSync(`curl -L -o "${pbfPath}" "${url}"`, { stdio: "inherit" });
} catch (err) {
  console.error("Download failed:", err.message);
  process.exit(1);
}

console.log(`Converting ${pbfPath} to ${osmPath}...`);
try {
  // Try osmconvert first, fall back to osmosis
  try {
    execSync(`osmconvert "${pbfPath}" -o="${osmPath}"`, { stdio: "inherit" });
  } catch (e) {
    execSync(`osmosis --read-pbf file="${pbfPath}" --write-xml file="${osmPath}"`, { stdio: "inherit" });
  }
} catch (err) {
  console.error("Conversion failed:", err.message);
  console.error("Install osmconvert or osmosis to convert PBF to OSM XML.");
  process.exit(1);
}

console.log(`Done: ${osmPath}`);
console.log("Next: run node server/data/ingest/parseOSM.js to generate the walking graph.");