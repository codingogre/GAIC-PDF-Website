#!/usr/bin/env node

/**
 * Elasticsearch Index Management Utility
 *
 * Creates an Elasticsearch index from a JSON mapping file.
 * Usage: node elasticsearch/create-index.js <index-name> <mapping-file>
 * Example: node elasticsearch/create-index.js gaig-usage ./elasticsearch/usage-index-mapping.json
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

/**
 * Create an index from a mapping file
 * @param {string} indexName - Name of the index to create
 * @param {string} mappingFilePath - Path to the JSON mapping file
 * @param {boolean} deleteExisting - Whether to delete existing index if it exists
 */
async function createIndexFromMapping(indexName, mappingFilePath, deleteExisting = false) {
  try {
    console.log(`\n🔍 Creating index: ${indexName}`);
    console.log(`📄 Using mapping file: ${mappingFilePath}\n`);

    // Check if mapping file exists
    if (!fs.existsSync(mappingFilePath)) {
      throw new Error(`Mapping file not found: ${mappingFilePath}`);
    }

    // Read and parse mapping file
    const mappingContent = fs.readFileSync(mappingFilePath, 'utf8');
    const mapping = JSON.parse(mappingContent);

    console.log(`✓ Mapping file loaded successfully`);
    console.log(`  - Number of properties: ${Object.keys(mapping.mappings?.properties || {}).length}`);

    // Check if index exists
    const indexExists = await client.indices.exists({ index: indexName });

    if (indexExists) {
      console.log(`\n⚠️  Index "${indexName}" already exists`);

      if (deleteExisting) {
        console.log(`🗑️  Deleting existing index...`);
        await client.indices.delete({ index: indexName });
        console.log(`✓ Existing index deleted`);
      } else {
        console.log(`\n❌ Index already exists. Use --force to delete and recreate.`);
        console.log(`   Or use a different index name.\n`);
        process.exit(1);
      }
    }

    // Create the index
    console.log(`\n📝 Creating index with mapping...`);
    const response = await client.indices.create({
      index: indexName,
      body: mapping
    });

    console.log(`\n✅ Index created successfully!`);
    console.log(`   Index name: ${indexName}`);
    console.log(`   Acknowledged: ${response.acknowledged}`);
    console.log(`   Shards acknowledged: ${response.shards_acknowledged}`);

    // Verify the index
    const indexInfo = await client.indices.get({ index: indexName });
    const settings = indexInfo[indexName].settings.index || {};
    const mappings = indexInfo[indexName].mappings;

    console.log(`\n📊 Index Details:`);
    if (settings.number_of_shards) {
      console.log(`   Number of shards: ${settings.number_of_shards}`);
    }
    if (settings.number_of_replicas) {
      console.log(`   Number of replicas: ${settings.number_of_replicas}`);
    }
    console.log(`   Number of fields: ${Object.keys(mappings.properties).length}`);

    console.log(`\n✓ Index "${indexName}" is ready for use!\n`);

  } catch (error) {
    console.error(`\n❌ Error creating index:`, error.message);
    if (error.meta?.body?.error) {
      console.error(`   Elasticsearch error:`, JSON.stringify(error.meta.body.error, null, 2));
    }
    process.exit(1);
  }
}

/**
 * Main function - parse CLI arguments and create index
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2 || args.includes('--help') || args.includes('-h')) {
    console.log(`
📚 Elasticsearch Index Management Utility

Usage: node elasticsearch/create-index.js <index-name> <mapping-file> [options]

Arguments:
  <index-name>     Name of the index to create
  <mapping-file>   Path to the JSON mapping file

Options:
  --force          Delete existing index if it exists and recreate
  --help, -h       Show this help message

Examples:
  node elasticsearch/create-index.js gaig-usage ./elasticsearch/usage-index-mapping.json
  node elasticsearch/create-index.js gaig-usage ./elasticsearch/usage-index-mapping.json --force

Environment Variables Required:
  ES_URL           Elasticsearch cluster URL
  API_KEY          Elasticsearch API key
    `);
    process.exit(0);
  }

  const indexName = args[0];
  const mappingFilePath = args[1];
  const deleteExisting = args.includes('--force');

  // Verify Elasticsearch connection
  try {
    console.log(`\n🔌 Connecting to Elasticsearch...`);
    const info = await client.info();
    console.log(`✓ Connected to Elasticsearch ${info.version.number}`);
  } catch (error) {
    console.error(`\n❌ Failed to connect to Elasticsearch:`, error.message);
    console.error(`   Please check your ES_URL and API_KEY in .env file\n`);
    process.exit(1);
  }

  // Create the index
  await createIndexFromMapping(indexName, mappingFilePath, deleteExisting);
}

// Run the main function
main();
