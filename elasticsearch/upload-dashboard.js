#!/usr/bin/env node

/**
 * Kibana Dashboard Upload Utility
 *
 * Uploads Kibana saved objects (data views, visualizations, dashboards) using the Kibana Saved Objects API.
 * Usage: node elasticsearch/upload-dashboard.js <ndjson-file>
 * Example: node elasticsearch/upload-dashboard.js ./elasticsearch/kibana-dashboard.ndjson
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const https = require('https');

// Validate environment variables
if (!process.env.ES_URL || !process.env.API_KEY) {
  console.error('❌ Error: ES_URL and API_KEY must be set in .env file');
  process.exit(1);
}

/**
 * Extract Kibana URL from Elasticsearch URL
 * Assumes Elastic Cloud format: https://<deployment-id>.es.<region>.azure.elastic.cloud
 * Kibana URL: https://<deployment-id>.kb.<region>.azure.elastic.cloud
 */
function getKibanaUrl(esUrl) {
  // For Elastic Cloud
  if (esUrl.includes('.es.') && esUrl.includes('.elastic.cloud')) {
    return esUrl.replace('.es.', '.kb.');
  }

  // For custom Kibana URL, check env variable
  if (process.env.KIBANA_URL) {
    return process.env.KIBANA_URL;
  }

  // Default: assume Kibana is on same host at port 5601
  const url = new URL(esUrl);
  return `${url.protocol}//${url.hostname}:5601`;
}

/**
 * Upload saved objects to Kibana
 * @param {string} ndjsonFilePath - Path to the NDJSON file containing saved objects
 * @param {object} options - Upload options
 */
async function uploadDashboard(ndjsonFilePath, options = {}) {
  try {
    console.log(`\n📊 Uploading Kibana Dashboard`);
    console.log(`📄 File: ${ndjsonFilePath}\n`);

    // Check if file exists
    if (!fs.existsSync(ndjsonFilePath)) {
      throw new Error(`File not found: ${ndjsonFilePath}`);
    }

    // Read the NDJSON file
    const ndjsonContent = fs.readFileSync(ndjsonFilePath, 'utf8');
    const lines = ndjsonContent.trim().split('\n');
    console.log(`✓ Loaded ${lines.length} saved objects from file`);

    // Parse and count object types
    const objectTypes = {};
    lines.forEach(line => {
      const obj = JSON.parse(line);
      objectTypes[obj.type] = (objectTypes[obj.type] || 0) + 1;
    });

    console.log(`\n📦 Objects to upload:`);
    Object.entries(objectTypes).forEach(([type, count]) => {
      console.log(`   - ${count} ${type}(s)`);
    });

    // Get Kibana URL
    const kibanaUrl = getKibanaUrl(process.env.ES_URL);
    console.log(`\n🔗 Kibana URL: ${kibanaUrl}`);

    // Prepare API request
    const apiKey = process.env.API_KEY.replace(/^your_/, '');
    const apiUrl = `${kibanaUrl}/api/saved_objects/_import`;

    // Parse URL for https.request
    const parsedUrl = new URL(apiUrl);

    // Create boundary for multipart/form-data
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);

    // Build multipart body
    let body = '';
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="file"; filename="export.ndjson"\r\n`;
    body += `Content-Type: application/ndjson\r\n\r\n`;
    body += ndjsonContent;
    body += `\r\n--${boundary}--\r\n`;

    // Prepare request options
    const requestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 443,
      path: parsedUrl.pathname + parsedUrl.search + (options.overwrite ? '?overwrite=true' : ''),
      method: 'POST',
      headers: {
        'Authorization': `ApiKey ${apiKey}`,
        'kbn-xsrf': 'true',
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': Buffer.byteLength(body)
      }
    };

    console.log(`\n📤 Uploading to Kibana...`);
    if (options.overwrite) {
      console.log(`⚠️  Overwrite mode enabled - will replace existing objects`);
    }

    // Make the request
    const response = await new Promise((resolve, reject) => {
      const req = https.request(requestOptions, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data
          });
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.write(body);
      req.end();
    });

    // Parse response
    let result;
    try {
      result = JSON.parse(response.body);
    } catch (e) {
      console.error(`\n❌ Failed to parse response:`, response.body);
      throw new Error('Invalid JSON response from Kibana');
    }

    // Check for errors
    if (response.statusCode !== 200) {
      console.error(`\n❌ Upload failed with status ${response.statusCode}`);
      console.error(`Response:`, JSON.stringify(result, null, 2));
      throw new Error(`HTTP ${response.statusCode}: ${result.message || 'Unknown error'}`);
    }

    // Display results
    console.log(`\n✅ Upload successful!`);

    if (result.success) {
      console.log(`\n📊 Import Summary:`);
      console.log(`   ✓ Successful: ${result.successCount || 0}`);

      if (result.successResults && result.successResults.length > 0) {
        console.log(`\n   Created objects:`);
        result.successResults.forEach(obj => {
          console.log(`     - ${obj.type}: ${obj.meta?.title || obj.id}`);
        });
      }
    }

    if (result.errors && result.errors.length > 0) {
      console.log(`\n⚠️  Errors: ${result.errors.length}`);
      result.errors.forEach(err => {
        console.log(`   ✗ ${err.type} (${err.id}): ${err.error?.message || err.error?.type}`);
      });
    }

    if (result.warnings && result.warnings.length > 0) {
      console.log(`\n⚠️  Warnings: ${result.warnings.length}`);
      result.warnings.forEach(warn => {
        console.log(`   ! ${warn.type} (${warn.id}): ${warn.message}`);
      });
    }

    // Get dashboard URL
    const dashboardId = 'gaig-usage-dashboard';
    const dashboardUrl = `${kibanaUrl}/app/dashboards#/view/${dashboardId}`;

    console.log(`\n🎯 Dashboard URL:`);
    console.log(`   ${dashboardUrl}`);
    console.log(`\n✓ Upload complete!\n`);

  } catch (error) {
    console.error(`\n❌ Error uploading dashboard:`, error.message);
    if (error.response) {
      console.error(`   Response:`, error.response);
    }
    process.exit(1);
  }
}

/**
 * Main function - parse CLI arguments and upload dashboard
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1 || args.includes('--help') || args.includes('-h')) {
    console.log(`
📊 Kibana Dashboard Upload Utility

Usage: node elasticsearch/upload-dashboard.js <ndjson-file> [options]

Arguments:
  <ndjson-file>    Path to the NDJSON file containing Kibana saved objects

Options:
  --overwrite      Overwrite existing objects with the same IDs
  --help, -h       Show this help message

Examples:
  node elasticsearch/upload-dashboard.js ./elasticsearch/kibana-dashboard.ndjson
  node elasticsearch/upload-dashboard.js ./elasticsearch/kibana-dashboard.ndjson --overwrite

Environment Variables Required:
  ES_URL           Elasticsearch cluster URL (Kibana URL will be derived from this)
  API_KEY          Elasticsearch API key (used for Kibana authentication)
  KIBANA_URL       (Optional) Custom Kibana URL if not using Elastic Cloud

Notes:
  - For Elastic Cloud, Kibana URL is automatically derived from ES_URL
  - For self-hosted, set KIBANA_URL environment variable
  - The API key must have permissions to create Kibana saved objects
    `);
    process.exit(0);
  }

  const ndjsonFilePath = args[0];
  const overwrite = args.includes('--overwrite');

  await uploadDashboard(ndjsonFilePath, { overwrite });
}

// Run the main function
main();
