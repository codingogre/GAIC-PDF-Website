#!/usr/bin/env node

/**
 * Load Generation Script for GAIG PDF Website
 *
 * Simulates realistic user behavior:
 * - Generates unique visitors with session IDs
 * - Performs randomized searches from Questions.json
 * - Randomly clicks on search results
 * - Tracks all interactions via telemetry
 */

const fetch = require('node-fetch');
const fs = require('fs');
const crypto = require('crypto');

// Configuration
const WEBSITE_URL = 'https://gaig-pdf-website-41066827466.us-central1.run.app';
const QUESTIONS_FILE = './Questions.json';
const MIN_DELAY_BETWEEN_SEARCHES_MS = 5000;  // 5 seconds
const MAX_DELAY_BETWEEN_SEARCHES_MS = 30000; // 30 seconds
const CLICK_PROBABILITY = 0.7; // 70% chance of clicking a result
const MIN_TIME_TO_CLICK_MS = 2000;  // Minimum 2 seconds to click
const MAX_TIME_TO_CLICK_MS = 15000; // Maximum 15 seconds to click

// User agent rotation for realistic traffic
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/120.0.0.0',
  'Mozilla/5.0 (iPad; CPU OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1'
];

/**
 * Generate a unique session ID
 */
function generateSessionId() {
  return `sess_${crypto.randomBytes(16).toString('hex')}`;
}

/**
 * Generate a unique user ID
 */
function generateUserId() {
  return `user_${crypto.randomBytes(16).toString('hex')}`;
}

/**
 * Get a random user agent
 */
function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Generate random delay
 */
function getRandomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Load questions from Questions.json
 */
function loadQuestions() {
  try {
    const data = fs.readFileSync(QUESTIONS_FILE, 'utf8');
    const questionsData = JSON.parse(data);

    // Extract all questions from all categories
    const allQuestions = [];
    if (questionsData.categories && Array.isArray(questionsData.categories)) {
      questionsData.categories.forEach(category => {
        if (category.questions && Array.isArray(category.questions)) {
          category.questions.forEach(q => {
            const question = typeof q === 'string' ? q : q.question;
            if (question) {
              allQuestions.push(question);
            }
          });
        }
      });
    }

    console.log(`✓ Loaded ${allQuestions.length} questions from ${questionsData.categories.length} categories`);
    return allQuestions;
  } catch (error) {
    console.error(`❌ Error loading questions: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Get a random question
 */
function getRandomQuestion(questions) {
  return questions[Math.floor(Math.random() * questions.length)];
}

/**
 * Simulate a user session
 */
class UserSession {
  constructor(questions) {
    this.questions = questions;
    this.sessionId = generateSessionId();
    this.userId = generateUserId();
    this.userAgent = getRandomUserAgent();
    this.searchCount = 0;
    this.clickCount = 0;

    console.log(`\n👤 New User Session Started`);
    console.log(`   Session ID: ${this.sessionId.substring(0, 20)}...`);
    console.log(`   User ID: ${this.userId.substring(0, 20)}...`);
    console.log(`   User Agent: ${this.userAgent.substring(0, 60)}...`);
  }

  /**
   * Perform a search
   */
  async performSearch(query) {
    try {
      const searchStartTime = Date.now();

      console.log(`\n🔍 Searching: "${query}"`);

      const response = await fetch(`${WEBSITE_URL}/api/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': this.userAgent,
          'X-Session-Id': this.sessionId,
          'X-User-Id': this.userId,
          'X-Page-Url': WEBSITE_URL
        },
        body: JSON.stringify({
          query: query,
          filters: {
            author: [],
            content_type: [],
            creator_tool: []
          },
          size: 5
        })
      });

      if (!response.ok) {
        console.error(`   ❌ Search failed: ${response.status} ${response.statusText}`);
        return null;
      }

      const data = await response.json();
      const searchTime = Date.now() - searchStartTime;

      this.searchCount++;
      console.log(`   ✓ Found ${data.results.length} results in ${searchTime}ms`);

      // Decide whether to click on a result
      if (data.results.length > 0 && Math.random() < CLICK_PROBABILITY) {
        // Wait a random "thinking" time before clicking
        const timeToClick = getRandomDelay(MIN_TIME_TO_CLICK_MS, MAX_TIME_TO_CLICK_MS);
        await sleep(timeToClick);

        // Click on a random result (weighted towards top results)
        const position = this.getWeightedRandomPosition(data.results.length);
        await this.clickResult(query, data.results[position], position, timeToClick);
      }

      return data;
    } catch (error) {
      console.error(`   ❌ Search error: ${error.message}`);
      return null;
    }
  }

  /**
   * Get a weighted random position (favors top results)
   */
  getWeightedRandomPosition(maxResults) {
    // Exponential distribution favoring top results
    const weights = [];
    for (let i = 0; i < maxResults; i++) {
      weights.push(Math.pow(0.5, i)); // Each position is 50% as likely as the previous
    }

    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let random = Math.random() * totalWeight;

    for (let i = 0; i < weights.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        return i;
      }
    }

    return 0; // Fallback to first result
  }

  /**
   * Click on a search result
   */
  async clickResult(query, result, position, timeToClick) {
    try {
      const { id, score, source } = result;

      const documentTitle = source.attachment?.title || source.title || source.attachment?.filename || source.filename || 'Unknown';
      const documentFilename = source.filename || source.attachment?.filename || 'unknown.pdf';
      const documentAuthor = source.attachment?.author || 'Unknown';

      console.log(`   👆 Clicking result #${position + 1}: "${documentTitle.substring(0, 50)}${documentTitle.length > 50 ? '...' : ''}"`);

      const response = await fetch(`${WEBSITE_URL}/api/telemetry/click`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': this.userAgent,
          'X-Session-Id': this.sessionId,
          'X-User-Id': this.userId
        },
        body: JSON.stringify({
          query: query,
          document_id: id,
          document_title: documentTitle,
          document_filename: documentFilename,
          document_author: documentAuthor,
          position: position,
          score: score,
          time_to_click_ms: timeToClick
        })
      });

      if (response.ok) {
        this.clickCount++;
        console.log(`   ✓ Click tracked (position: ${position}, time: ${timeToClick}ms)`);
      } else {
        console.error(`   ❌ Click tracking failed: ${response.status}`);
      }
    } catch (error) {
      console.error(`   ❌ Click error: ${error.message}`);
    }
  }

  /**
   * Run the user session for a specified number of searches
   */
  async run(numSearches = Infinity) {
    console.log(`\n🚀 Starting session with ${numSearches === Infinity ? 'infinite' : numSearches} searches...`);

    let searchesPerformed = 0;

    while (searchesPerformed < numSearches) {
      try {
        // Pick a random question
        const question = getRandomQuestion(this.questions);

        // Perform the search
        await this.performSearch(question);
        searchesPerformed++;

        // Random delay before next search (simulating user behavior)
        const delay = getRandomDelay(MIN_DELAY_BETWEEN_SEARCHES_MS, MAX_DELAY_BETWEEN_SEARCHES_MS);
        console.log(`   ⏳ Waiting ${(delay / 1000).toFixed(1)}s before next search...`);
        await sleep(delay);

      } catch (error) {
        console.error(`❌ Session error: ${error.message}`);
      }
    }

    console.log(`\n✅ Session completed`);
    console.log(`   Searches: ${this.searchCount}`);
    console.log(`   Clicks: ${this.clickCount}`);
    console.log(`   Click-through rate: ${(this.clickCount / this.searchCount * 100).toFixed(1)}%`);
  }
}

/**
 * Main function
 */
async function main() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║      GAIG PDF Website - Load Generation Script              ║
╚══════════════════════════════════════════════════════════════╝
  `);

  console.log(`📊 Configuration:`);
  console.log(`   Target URL: ${WEBSITE_URL}`);
  console.log(`   Questions File: ${QUESTIONS_FILE}`);
  console.log(`   Search Interval: ${MIN_DELAY_BETWEEN_SEARCHES_MS / 1000}-${MAX_DELAY_BETWEEN_SEARCHES_MS / 1000}s`);
  console.log(`   Click Probability: ${CLICK_PROBABILITY * 100}%`);
  console.log(`   User Agents: ${USER_AGENTS.length} variants`);

  // Load questions
  const questions = loadQuestions();

  if (questions.length === 0) {
    console.error('❌ No questions loaded. Exiting.');
    process.exit(1);
  }

  // Create a new user session and run indefinitely
  const session = new UserSession(questions);
  await session.run(Infinity);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Received SIGINT. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n⚠️  Received SIGTERM. Shutting down gracefully...');
  process.exit(0);
});

// Run the script
main().catch(error => {
  console.error(`\n❌ Fatal error: ${error.message}`);
  process.exit(1);
});
