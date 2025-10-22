#!/usr/bin/env node

/**
 * Download Kibana Dashboard
 *
 * Downloads a Kibana dashboard and all its dependencies from Kibana
 * Usage: node elasticsearch/download-dashboard.js <dashboard-id> [output-file]
 */

require('dotenv').config();
const { Client } = require('@elastic/elasticsearch');
const fs = require('fs');
const path = require('path');

// Validate environment variables
if (!process.env.ES_URL || !process.env.API_KEY) {
  console.error('❌ Error: ES_URL and API_KEY must be set in .env file');
  process.exit(1);
}

// Initialize Elasticsearch client
const apiKey = process.env.API_KEY.replace(/^your_/, '');
const client = new Client({
  node: process.env.ES_URL,
  auth: {
    apiKey: apiKey
  },
  requestTimeout: 60000
});

// Derive Kibana URL from Elasticsearch URL
function getKibanaUrl(esUrl) {
  if (process.env.KIBANA_URL) {
    return process.env.KIBANA_URL;
  }

  // For Elastic Cloud, derive Kibana URL from ES URL
  const match = esUrl.match(/https:\/\/([^.]+)\.es\.([^\/]+)/);
  if (match) {
    const deploymentId = match[1];
    const region = match[2];
    return `https://${deploymentId}.kb.${region}`;
  }

  // Fallback: assume Kibana is on port 5601
  return esUrl.replace(':9200', ':5601');
}

const kibanaUrl = getKibanaUrl(process.env.ES_URL);

/**
 * Download dashboard from Kibana
 */
async function downloadDashboard(dashboardId, outputFile) {
  try {
    console.log(`\n📥 Downloading Kibana Dashboard`);
    console.log(`   Dashboard ID: ${dashboardId}`);
    console.log(`   Kibana URL: ${kibanaUrl}`);

    // Use Kibana's Saved Objects Export API
    const exportUrl = `${kibanaUrl}/api/saved_objects/_export`;

    console.log(`\n📤 Requesting dashboard export...`);

    const response = await fetch(exportUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'kbn-xsrf': 'true',
        'Authorization': `ApiKey ${apiKey}`
      },
      body: JSON.stringify({
        objects: [
          {
            type: 'dashboard',
            id: dashboardId
          }
        ],
        includeReferencesDeep: true
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to download dashboard: ${response.status} ${response.statusText}\n${errorText}`);
    }

    // Get the NDJSON content
    const ndjsonContent = await response.text();

    // Count objects
    const lines = ndjsonContent.trim().split('\n');
    const objects = lines.filter(line => line.trim() && !line.includes('"exportedCount"'));

    console.log(`\n✓ Downloaded ${objects.length} saved objects`);

    // Parse to show summary
    const objectTypes = {};
    objects.forEach(line => {
      try {
        const obj = JSON.parse(line);
        const type = obj.type || 'unknown';
        objectTypes[type] = (objectTypes[type] || 0) + 1;
      } catch (e) {
        // Skip invalid lines
      }
    });

    console.log(`\n📦 Object Types:`);
    Object.entries(objectTypes).forEach(([type, count]) => {
      console.log(`   - ${count} ${type}(s)`);
    });

    // Save to file
    fs.writeFileSync(outputFile, ndjsonContent, 'utf8');
    const fileSize = fs.statSync(outputFile).size;

    console.log(`\n✅ Dashboard saved successfully!`);
    console.log(`   File: ${outputFile}`);
    console.log(`   Size: ${fileSize.toLocaleString()} bytes`);
    console.log(`   Objects: ${objects.length}`);

  } catch (error) {
    console.error(`\n❌ Error downloading dashboard:`, error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1 || args.includes('--help') || args.includes('-h')) {
    console.log(`
📥 Kibana Dashboard Download Utility

Usage: node elasticsearch/download-dashboard.js <dashboard-id> [output-file]

Arguments:
  <dashboard-id>   ID of the dashboard to download (e.g., gaig-usage-dashboard)
  [output-file]    Optional output file path (default: ./elasticsearch/kibana-dashboard.ndjson)

Options:
  --help, -h       Show this help message

Examples:
  node elasticsearch/download-dashboard.js gaig-usage-dashboard
  node elasticsearch/download-dashboard.js gaig-usage-dashboard ./my-dashboard.ndjson

Environment Variables Required:
  ES_URL           Elasticsearch cluster URL
  API_KEY          Elasticsearch API key
  KIBANA_URL       (Optional) Kibana URL (auto-detected for Elastic Cloud)
    `);
    process.exit(0);
  }

  const dashboardId = args[0];
  const outputFile = args[1] || './elasticsearch/kibana-dashboard.ndjson';

  // Ensure output directory exists
  const outputDir = path.dirname(outputFile);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Verify Elasticsearch connection
  try {
    console.log(`\n🔌 Connecting to Elasticsearch...`);
    const info = await client.info();
    console.log(`✓ Connected to Elasticsearch ${info.version.number}`);
  } catch (error) {
    console.error(`\n❌ Failed to connect to Elasticsearch:`, error.message);
    console.error(`   Please check your ES_URL and API_KEY in .env file`);
    process.exit(1);
  }

  // Download the dashboard
  await downloadDashboard(dashboardId, outputFile);
}

// Run the main function
main();
