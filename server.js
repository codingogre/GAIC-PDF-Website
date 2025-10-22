require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const { Client } = require('@elastic/elasticsearch');
const fs = require('fs');
const https = require('https');
const TelemetryService = require('./telemetry');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"]
    }
  }
}));
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

if (!process.env.ES_URL || !process.env.API_KEY || !process.env.INDEX_NAME) {
  console.error('Error: ES_URL, API_KEY, and INDEX_NAME must be set in .env file');
  process.exit(1);
}

const apiKey = process.env.API_KEY.replace(/^your_/, '');
const INDEX_NAME = process.env.INDEX_NAME;

const client = new Client({
  node: process.env.ES_URL,
  auth: {
    apiKey: apiKey
  },
  requestTimeout: 60000,  // Increased to 60 seconds
  pingTimeout: 3000
});

const mainQuery = JSON.parse(fs.readFileSync('./elasticsearch/main.query', 'utf8'));
const systemPrompt = fs.readFileSync('./system-prompt.txt', 'utf8');

// Initialize telemetry service
const USAGE_INDEX = process.env.USAGE_INDEX || 'gaig-usage';
const telemetry = new TelemetryService(client, USAGE_INDEX);

// Questions cache
let questionsCache = {
  questions: [],
  lastUpdated: null,
  loaded: false
};

// System prompt cache
let systemPromptCache = {
  content: '',
  lastUpdated: null,
  loaded: false
};

// Function to load questions from local JSON file
async function loadSampleQuestions() {
  try {
    const data = fs.readFileSync('./Questions.json', 'utf8');
    const questionsData = JSON.parse(data);

    questionsCache = {
      questions: questionsData,
      lastUpdated: new Date(),
      loaded: true
    };

    const totalQuestions = questionsData.categories.reduce((sum, cat) => sum + cat.questions.length, 0);
    console.log(`✓ Loaded ${totalQuestions} questions from ${questionsData.categories.length} categories`);
    return questionsData;
  } catch (error) {
    console.error('✗ Error loading questions:', error);
    questionsCache.loaded = false;
    throw error;
  }
}

// Function to load system prompt from local file
async function loadSystemPrompt() {
  try {
    const data = fs.readFileSync('./system-prompt.txt', 'utf8');
    systemPromptCache = {
      content: data,
      lastUpdated: new Date(),
      loaded: true
    };

    console.log(`✓ Loaded system prompt (${data.length} characters)`);
    return data;
  } catch (error) {
    console.error('✗ Error loading system prompt:', error);
    systemPromptCache.loaded = false;
    throw error;
  }
}

// Function to warm up the ELSER model
async function warmupElserModel() {
  try {
    console.log('Warming up ELSER model...');
    const queryTemplate = JSON.stringify(mainQuery);
    const searchQueryString = queryTemplate.replace('{{query}}', 'insurance');
    const searchQuery = JSON.parse(searchQueryString);

    await client.search({
      index: INDEX_NAME,
      body: searchQuery,
      size: 1
    });

    console.log('✓ ELSER model warmed up successfully');
  } catch (error) {
    console.error('✗ ELSER model warmup failed:', error.message);
    console.error('The model may need more time to start. First searches might be slow.');
  }
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API endpoint to get sample questions
app.get('/api/questions', (req, res) => {
  try {
    if (!questionsCache.loaded) {
      return res.status(503).json({
        error: 'Questions not available',
        message: 'Sample questions are still loading or failed to load'
      });
    }

    res.json({
      ...questionsCache.questions,
      lastUpdated: questionsCache.lastUpdated
    });
  } catch (error) {
    console.error('Error serving questions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// API endpoint to get system prompt
app.get('/api/system-prompt', (req, res) => {
  try {
    if (!systemPromptCache.loaded) {
      return res.status(503).json({
        error: 'System prompt not available',
        message: 'System prompt is still loading or failed to load'
      });
    }

    res.json({
      content: systemPromptCache.content,
      lastUpdated: systemPromptCache.lastUpdated,
      length: systemPromptCache.content.length
    });
  } catch (error) {
    console.error('Error serving system prompt:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/search', async (req, res) => {
  const startTime = Date.now();

  try {
    const { query, filters = {}, size = 10 } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    const queryTemplate = JSON.stringify(mainQuery);
    const escapedQuery = JSON.stringify(query).slice(1, -1);
    const searchQueryString = queryTemplate.replace('{{query}}', escapedQuery);
    const searchQuery = JSON.parse(searchQueryString);

    // Add filters if provided
    if (filters && Object.keys(filters).length > 0) {
      const filterClauses = [];

      if (filters.author && filters.author.length > 0) {
        filterClauses.push({
          terms: { "attachment.author.keyword": filters.author }
        });
      }

      if (filters.content_type && filters.content_type.length > 0) {
        filterClauses.push({
          terms: { "attachment.content_type.keyword": filters.content_type }
        });
      }

      if (filters.creator_tool && filters.creator_tool.length > 0) {
        filterClauses.push({
          terms: { "attachment.creator_tool.keyword": filters.creator_tool }
        });
      }

      if (filterClauses.length > 0) {
        const originalRetriever = searchQuery.retriever;
        searchQuery.retriever = {
          standard: {
            query: {
              bool: {
                must: originalRetriever.standard.query,
                filter: filterClauses
              }
            }
          }
        };
      }
    }

    const response = await client.search({
      index: INDEX_NAME,
      body: searchQuery,
      size: parseInt(size)
    });

    const results = response.hits.hits.map(hit => ({
      id: hit._id,
      score: hit._score,
      source: hit._source,
      highlight: hit.highlight || {}
    }));

    const responseTime = Date.now() - startTime;

    // Track the query
    telemetry.trackQuery(req, {
      query,
      filters,
      result_count: response.hits.total.value,
      response_time_ms: responseTime,
      document_count_requested: parseInt(size)
    });

    res.json({
      total: response.hits.total.value,
      results: results,
      took: response.took,
      filters: filters
    });

  } catch (error) {
    console.error('Search error:', error);

    const responseTime = Date.now() - startTime;

    // Track the error
    telemetry.trackQuery(req, {
      query: req.body.query,
      filters: req.body.filters,
      response_time_ms: responseTime,
      error_occurred: true,
      error_message: error.message
    });

    // Check if it's a model timeout error
    if (error.message && error.message.includes('model_deployment_timeout_exception')) {
      return res.status(503).json({
        error: 'Search temporarily unavailable',
        message: 'The search model is starting up. Please try again in a few seconds.',
        retryable: true
      });
    }

    res.status(500).json({
      error: 'Search failed',
      message: error.message
    });
  }
});

app.post('/api/chat-completion', async (req, res) => {
  try {
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    // Set headers for plain text streaming
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Make streaming request to Elasticsearch
    const llmUrl = `${process.env.ES_URL}/_inference/chat_completion/.rainbow-sprinkles-elastic/_stream`;

    const llmResponse = await fetch(llmUrl, {
      method: 'POST',
      headers: {
        'Authorization': `ApiKey ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: messages
      })
    });

    if (!llmResponse.ok) {
      throw new Error(`LLM request failed: ${llmResponse.status}`);
    }

    // Stream processing with buffer management
    const reader = llmResponse.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let totalContentSent = 0;

    console.log('Starting to process LLM stream...');

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        console.log('LLM stream complete. Total content sent:', totalContentSent, 'characters');
        break;
      }

      const chunk = decoder.decode(value);
      console.log('Received LLM chunk:', chunk.substring(0, 200) + (chunk.length > 200 ? '...' : ''));

      buffer += chunk;
      const lines = buffer.split('\n');

      buffer = lines.pop() || '';

      for (const line of lines) {
        console.log('Processing line:', line);

        if (!line.trim() || !line.startsWith('data: ')) {
          console.log('Skipping non-data line');
          continue;
        }

        const jsonStr = line.substring(6);

        if (jsonStr.trim() === '[DONE]') {
          console.log('Reached [DONE] marker');
          continue;
        }

        try {
          const parsed = JSON.parse(jsonStr);
          console.log('Parsed JSON structure:', JSON.stringify(parsed, null, 2));

          if (parsed.choices &&
              parsed.choices[0] &&
              parsed.choices[0].delta &&
              parsed.choices[0].delta.content) {

            const content = parsed.choices[0].delta.content;
            console.log('Extracted content:', JSON.stringify(content));

            res.write(content);
            totalContentSent += content.length;
          } else {
            console.log('No content found in expected structure');
          }
        } catch (parseError) {
          console.log('JSON parse error:', parseError.message, 'for line:', jsonStr);
          continue;
        }
      }
    }

    res.end();

  } catch (error) {
    console.error('Chat completion error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Chat completion failed',
        message: error.message
      });
    } else {
      res.end();
    }
  }
});

app.get('/api/facets', async (req, res) => {
  try {
    const facetQuery = {
      size: 0,
      aggs: {
        author_facet: {
          terms: {
            field: "attachment.author.keyword",
            size: 5,
            order: { _count: "desc" },
            missing: "Unknown Author"
          }
        },
        content_type_facet: {
          terms: {
            field: "attachment.content_type.keyword",
            size: 5,
            order: { _count: "desc" },
            missing: "Unknown Type"
          }
        },
        creator_tool_facet: {
          terms: {
            field: "attachment.creator_tool.keyword",
            size: 5,
            order: { _count: "desc" },
            missing: "Unknown Tool"
          }
        }
      }
    };

    const response = await client.search({
      index: INDEX_NAME,
      body: facetQuery
    });

    console.log('=== FULL AGGREGATION RESPONSE ===');
    console.log(JSON.stringify(response.aggregations, null, 2));

    console.log('=== AGGREGATION BUCKETS COUNT ===');
    console.log('Author buckets:', response.aggregations?.author_facet?.buckets?.length || 0);
    console.log('Content Type buckets:', response.aggregations?.content_type_facet?.buckets?.length || 0);
    console.log('Creator Tool buckets:', response.aggregations?.creator_tool_facet?.buckets?.length || 0);

    if (response.aggregations?.author_facet?.buckets?.length > 0) {
      console.log('Sample author bucket:', response.aggregations.author_facet.buckets[0]);
    }
    if (response.aggregations?.content_type_facet?.buckets?.length > 0) {
      console.log('Sample content_type bucket:', response.aggregations.content_type_facet.buckets[0]);
    }
    if (response.aggregations?.creator_tool_facet?.buckets?.length > 0) {
      console.log('Sample creator_tool bucket:', response.aggregations.creator_tool_facet.buckets[0]);
    }

    // Process creator_tool to collapse Adobe/Acrobat entries to first two words
    const creatorToolMap = new Map();
    response.aggregations.creator_tool_facet.buckets.forEach(bucket => {
      let displayValue = bucket.key;

      // If it starts with "Adobe" or contains "Acrobat", collapse to first two words
      if (displayValue.startsWith('Adobe') || displayValue.includes('Acrobat')) {
        const words = displayValue.split(' ');
        if (words.length >= 2) {
          displayValue = words.slice(0, 2).join(' ');
        }
      }

      // Aggregate counts for collapsed values
      if (creatorToolMap.has(displayValue)) {
        creatorToolMap.set(displayValue, creatorToolMap.get(displayValue) + bucket.doc_count);
      } else {
        creatorToolMap.set(displayValue, bucket.doc_count);
      }
    });

    // Convert map to array and sort by count descending
    const creatorToolFacets = Array.from(creatorToolMap.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count);

    const facets = {
      author: response.aggregations.author_facet.buckets
        .filter(bucket => bucket.key && bucket.key.trim() !== '')
        .map(bucket => ({
          value: bucket.key,
          count: bucket.doc_count
        })),
      content_type: response.aggregations.content_type_facet.buckets
        .filter(bucket => bucket.key && bucket.key.trim() !== '')
        .map(bucket => ({
          value: bucket.key,
          count: bucket.doc_count
        })),
      creator_tool: creatorToolFacets
    };

    console.log('=== FACETS BEING SENT TO FRONTEND ===');
    console.log('Author facets count:', facets.author.length);
    console.log('Author facets:', JSON.stringify(facets.author, null, 2));
    console.log('Content Type facets count:', facets.content_type.length);
    console.log('Content Type facets:', JSON.stringify(facets.content_type, null, 2));
    console.log('Creator Tool facets count:', facets.creator_tool.length);
    console.log('Creator Tool facets:', JSON.stringify(facets.creator_tool, null, 2));

    res.json(facets);

  } catch (error) {
    console.error('Facets error:', error);
    res.status(500).json({
      error: 'Failed to load facets',
      message: error.message
    });
  }
});

// Telemetry API endpoints
app.post('/api/telemetry/access', async (req, res) => {
  try {
    await telemetry.trackAccess(req, req.body);
    res.json({ success: true });
  } catch (error) {
    console.error('Error tracking access:', error);
    res.status(500).json({ error: 'Failed to track access' });
  }
});

app.post('/api/telemetry/click', async (req, res) => {
  try {
    await telemetry.trackClick(req, req.body);
    res.json({ success: true });
  } catch (error) {
    console.error('Error tracking click:', error);
    res.status(500).json({ error: 'Failed to track click' });
  }
});

app.get('/api/telemetry/stats', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const stats = await telemetry.getStats({ startDate, endDate });
    res.json(stats);
  } catch (error) {
    console.error('Error getting telemetry stats:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

app.get('/api/health', async (req, res) => {
  try {
    const health = await client.cluster.health();
    res.json({
      status: 'ok',
      elasticsearch: health.status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.listen(PORT, async () => {
  console.log(`Great American Insurance Group Knowledge Search running on port ${PORT}`);

  try {
    const info = await client.info();
    console.log('✓ Connected to Elasticsearch:', info.version.number);
  } catch (error) {
    console.error('✗ Failed to connect to Elasticsearch:', error.message);
    console.error('Please check your ES_URL and API_KEY in .env file');
  }

  // Load sample questions and system prompt at startup
  try {
    await loadSampleQuestions();
  } catch (error) {
    console.error('✗ Failed to load sample questions at startup:', error.message);
  }

  try {
    await loadSystemPrompt();
  } catch (error) {
    console.error('✗ Failed to load system prompt at startup:', error.message);
  }

  // Check telemetry index
  try {
    const indexExists = await telemetry.indexExists();
    if (indexExists) {
      console.log(`✓ Telemetry index "${USAGE_INDEX}" exists`);
    } else {
      console.log(`⚠️  Telemetry index "${USAGE_INDEX}" not found`);
      console.log(`   Create it with: node elasticsearch/create-index.js ${USAGE_INDEX} ./elasticsearch/usage-index-mapping.json`);
    }
  } catch (error) {
    console.error('✗ Failed to check telemetry index:', error.message);
  }

  // Warm up ELSER model
  await warmupElserModel();
});
