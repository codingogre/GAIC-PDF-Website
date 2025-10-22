/**
 * Telemetry Service for GAIG PDF Website
 *
 * Tracks user interactions and analytics:
 * - Page access/visits
 * - Search queries
 * - Document clicks
 *
 * Follows privacy best practices:
 * - IP address hashing
 * - Session-based tracking
 * - Anonymized user IDs
 */

const crypto = require('crypto');

class TelemetryService {
  constructor(elasticsearchClient, indexName = 'gaig-usage') {
    this.client = elasticsearchClient;
    this.indexName = indexName;
    this.enabled = true;
  }

  /**
   * Hash an IP address for privacy
   * @param {string} ip - IP address to hash
   * @returns {string} Hashed IP address
   */
  hashIP(ip) {
    if (!ip) return 'unknown';
    return crypto.createHash('sha256').update(ip).digest('hex').substring(0, 16);
  }

  /**
   * Parse User-Agent string to extract device, browser, and OS info
   * @param {string} userAgent - User agent string
   * @returns {object} Parsed user agent info
   */
  parseUserAgent(userAgent) {
    if (!userAgent) {
      return { device_type: 'unknown', browser: 'unknown', os: 'unknown' };
    }

    const ua = userAgent.toLowerCase();

    // Detect device type
    let device_type = 'desktop';
    if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(userAgent)) {
      device_type = 'tablet';
    } else if (/Mobile|iP(hone|od)|Android|BlackBerry|IEMobile|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(userAgent)) {
      device_type = 'mobile';
    }

    // Detect browser
    let browser = 'unknown';
    if (ua.includes('edg/')) browser = 'Edge';
    else if (ua.includes('chrome/')) browser = 'Chrome';
    else if (ua.includes('safari/') && !ua.includes('chrome')) browser = 'Safari';
    else if (ua.includes('firefox/')) browser = 'Firefox';
    else if (ua.includes('msie') || ua.includes('trident/')) browser = 'IE';
    else if (ua.includes('opera/') || ua.includes('opr/')) browser = 'Opera';

    // Detect OS
    let os = 'unknown';
    if (ua.includes('windows')) os = 'Windows';
    else if (ua.includes('mac os')) os = 'macOS';
    else if (ua.includes('linux')) os = 'Linux';
    else if (ua.includes('android')) os = 'Android';
    else if (ua.includes('iphone') || ua.includes('ipad')) os = 'iOS';

    return { device_type, browser, os };
  }

  /**
   * Get common tracking data from request
   * @param {object} req - Express request object
   * @returns {object} Common tracking data
   */
  getCommonData(req) {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    const { device_type, browser, os } = this.parseUserAgent(userAgent);

    return {
      timestamp: new Date().toISOString(),
      session_id: req.headers['x-session-id'] || 'unknown',
      user_id: req.headers['x-user-id'] || 'anonymous',
      ip_hash: this.hashIP(ip),
      user_agent: userAgent,
      device_type,
      browser,
      os,
      referrer: req.headers['referer'] || req.headers['referrer'] || 'direct',
      page_url: req.headers['x-page-url'] || req.originalUrl || req.url
    };
  }

  /**
   * Track a page access/visit
   * @param {object} req - Express request object
   * @param {object} data - Additional data (viewport, page_title, etc.)
   */
  async trackAccess(req, data = {}) {
    if (!this.enabled) return;

    try {
      const event = {
        event_type: 'access',
        ...this.getCommonData(req),
        page_title: data.page_title || 'GAIG Knowledge Search',
        viewport_width: data.viewport_width,
        viewport_height: data.viewport_height,
        duration_ms: data.duration_ms
      };

      await this.indexEvent(event);
      console.log('📊 Access tracked:', event.session_id);
    } catch (error) {
      console.error('Telemetry error (access):', error.message);
    }
  }

  /**
   * Track a search query
   * @param {object} req - Express request object
   * @param {object} data - Query data
   */
  async trackQuery(req, data = {}) {
    if (!this.enabled) return;

    try {
      const event = {
        event_type: 'query',
        ...this.getCommonData(req),
        query: data.query,
        query_length: data.query ? data.query.length : 0,
        filters_applied: data.filters || {},
        result_count: data.result_count || 0,
        response_time_ms: data.response_time_ms,
        document_count_requested: data.document_count_requested,
        answer_generated: data.answer_generated || false,
        answer_length: data.answer_length,
        llm_response_time_ms: data.llm_response_time_ms,
        error_occurred: data.error_occurred || false,
        error_message: data.error_message
      };

      await this.indexEvent(event);
      console.log('📊 Query tracked:', data.query);
    } catch (error) {
      console.error('Telemetry error (query):', error.message);
    }
  }

  /**
   * Track a document click
   * @param {object} req - Express request object
   * @param {object} data - Click data
   */
  async trackClick(req, data = {}) {
    if (!this.enabled) return;

    try {
      const event = {
        event_type: 'click',
        ...this.getCommonData(req),
        query: data.query,
        clicked_document_id: data.document_id,
        clicked_document_title: data.document_title,
        clicked_document_filename: data.document_filename,
        clicked_document_author: data.document_author,
        clicked_position: data.position,
        clicked_score: data.score,
        time_to_click_ms: data.time_to_click_ms
      };

      await this.indexEvent(event);
      console.log('📊 Click tracked:', data.document_id, 'at position', data.position);
    } catch (error) {
      console.error('Telemetry error (click):', error.message);
    }
  }

  /**
   * Index an event to Elasticsearch
   * @param {object} event - Event data to index
   */
  async indexEvent(event) {
    try {
      await this.client.index({
        index: this.indexName,
        body: event,
        refresh: false // Don't wait for refresh to improve performance
      });
    } catch (error) {
      // If index doesn't exist, provide helpful error message
      if (error.meta?.body?.error?.type === 'index_not_found_exception') {
        console.error(`❌ Telemetry index "${this.indexName}" not found. Please create it first:`);
        console.error(`   node elasticsearch/create-index.js ${this.indexName} ./elasticsearch/usage-index-mapping.json`);
      } else {
        throw error;
      }
    }
  }

  /**
   * Check if the usage index exists
   * @returns {boolean} True if index exists
   */
  async indexExists() {
    try {
      return await this.client.indices.exists({ index: this.indexName });
    } catch (error) {
      console.error('Error checking index existence:', error.message);
      return false;
    }
  }

  /**
   * Get telemetry statistics
   * @param {object} options - Query options (date range, etc.)
   * @returns {object} Statistics
   */
  async getStats(options = {}) {
    try {
      const { startDate, endDate } = options;
      const query = {
        bool: {
          must: []
        }
      };

      if (startDate || endDate) {
        const rangeQuery = { range: { timestamp: {} } };
        if (startDate) rangeQuery.range.timestamp.gte = startDate;
        if (endDate) rangeQuery.range.timestamp.lte = endDate;
        query.bool.must.push(rangeQuery);
      }

      const response = await this.client.search({
        index: this.indexName,
        body: {
          size: 0,
          query: query.bool.must.length > 0 ? query : { match_all: {} },
          aggs: {
            event_types: {
              terms: { field: 'event_type' }
            },
            unique_sessions: {
              cardinality: { field: 'session_id' }
            },
            unique_users: {
              cardinality: { field: 'user_id' }
            },
            devices: {
              terms: { field: 'device_type' }
            },
            browsers: {
              terms: { field: 'browser' }
            },
            top_queries: {
              terms: { field: 'query.keyword', size: 10 }
            },
            events_over_time: {
              date_histogram: {
                field: 'timestamp',
                calendar_interval: 'day'
              }
            }
          }
        }
      });

      return {
        total_events: response.hits.total.value,
        unique_sessions: response.aggregations.unique_sessions.value,
        unique_users: response.aggregations.unique_users.value,
        event_types: response.aggregations.event_types.buckets,
        devices: response.aggregations.devices.buckets,
        browsers: response.aggregations.browsers.buckets,
        top_queries: response.aggregations.top_queries.buckets,
        events_over_time: response.aggregations.events_over_time.buckets
      };
    } catch (error) {
      console.error('Error getting telemetry stats:', error.message);
      throw error;
    }
  }

  /**
   * Enable or disable telemetry
   * @param {boolean} enabled - Whether to enable telemetry
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    console.log(`📊 Telemetry ${enabled ? 'enabled' : 'disabled'}`);
  }
}

module.exports = TelemetryService;
