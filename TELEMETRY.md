# Usage Telemetry System

This document describes the usage telemetry and analytics system for the GAIG PDF Website.

## Overview

The telemetry system tracks user interactions with the search application and stores them in Elasticsearch for analysis via Kibana dashboards. It follows privacy best practices including IP hashing and anonymized user IDs.

## Components

### 1. Telemetry Service (`telemetry.js`)

Core service that handles:
- **Page Access Tracking**: Records visits with device/browser info
- **Query Tracking**: Logs searches with filters, results count, and response times
- **Click Tracking**: Captures document clicks with position and timing data

**Privacy Features:**
- IP address hashing (SHA-256)
- Anonymous session IDs
- Anonymous user IDs
- No PII collection

### 2. Elasticsearch Index

**Index Name:** `gaig-usage`

**Mapping File:** `elasticsearch/usage-index-mapping.json`

**Event Types:**
- `access` - Page visits
- `query` - Search queries
- `click` - Document clicks

**Key Fields:**
```
- event_type: Type of event (access/query/click)
- timestamp: Event time
- session_id: Unique session identifier
- user_id: Anonymous user identifier
- ip_hash: Hashed IP address
- device_type: desktop/mobile/tablet
- browser: Browser name
- os: Operating system
- query: Search query text
- result_count: Number of search results
- response_time_ms: Query response time
- clicked_document_*: Document click details
```

### 3. Kibana Dashboard

**Dashboard Name:** GAIG Knowledge Search Analytics

**Visualizations:**

1. **User Activity Metrics** - Unique sessions, users, and total events
2. **Events Over Time** - Timeline of all events by type
3. **Top Search Queries** - Most popular searches with metrics
4. **Device Types** - Device distribution (pie chart)
5. **Browser Distribution** - Browser usage (pie chart)
6. **Response Time Trend** - Search performance over time
7. **Query Success vs Errors** - Error rate monitoring
8. **Document Clicks by Position** - CTR analysis by position
9. **Top Clicked Documents** - Most popular documents

## Setup Instructions

### Step 1: Create the Usage Index

```bash
node elasticsearch/create-index.js gaig-usage ./elasticsearch/usage-index-mapping.json
```

This creates the `gaig-usage` index with the proper mapping.

### Step 2: Upload Kibana Dashboard

```bash
node elasticsearch/upload-dashboard.js ./elasticsearch/kibana-dashboard.ndjson
```

This uploads the dashboard and all visualizations to Kibana using the Saved Objects API.

**Dashboard URL:**
```
https://insurance-f41a6d.kb.eastus.azure.elastic.cloud/app/dashboards#/view/gaig-usage-dashboard
```

### Step 3: Configure Environment Variables

Add to `.env` file (optional):
```bash
USAGE_INDEX=gaig-usage          # Telemetry index name (default: gaig-usage)
KIBANA_URL=https://...          # Custom Kibana URL (auto-detected for Elastic Cloud)
```

### Step 4: Start the Server

The telemetry service automatically initializes when the server starts. It will:
- Check if the usage index exists
- Track queries automatically via the search API
- Provide telemetry API endpoints

## API Endpoints

### Track Page Access
```http
POST /api/telemetry/access
Content-Type: application/json
X-Session-Id: <session-id>
X-User-Id: <user-id>
X-Page-Url: <page-url>

{
  "page_title": "GAIG Knowledge Search",
  "viewport_width": 1920,
  "viewport_height": 1080
}
```

### Track Document Click
```http
POST /api/telemetry/click
Content-Type: application/json
X-Session-Id: <session-id>
X-User-Id: <user-id>

{
  "query": "insurance policy",
  "document_id": "doc123",
  "document_title": "Policy Guidelines",
  "document_filename": "policy.pdf",
  "document_author": "John Doe",
  "position": 1,
  "score": 15.3,
  "time_to_click_ms": 2500
}
```

### Get Telemetry Stats
```http
GET /api/telemetry/stats?startDate=2025-01-01&endDate=2025-01-31
```

Returns aggregated statistics about usage patterns.

## Data Tracked

### Automatically Tracked
- All search queries (via `/api/search` endpoint)
- Query filters applied
- Search result counts
- Response times
- Errors

### Manual Tracking Required
- Page access events (call `/api/telemetry/access`)
- Document clicks (call `/api/telemetry/click`)

## Privacy & Compliance

### Privacy Best Practices
1. **IP Hashing**: IP addresses are hashed using SHA-256
2. **No PII**: No personally identifiable information is stored
3. **Anonymous IDs**: User/session IDs are randomly generated
4. **Aggregated Analytics**: Dashboard shows aggregated data only

### GDPR Considerations
- Data is anonymized at collection
- No tracking cookies required
- User IDs are not linkable to real identities
- Data retention can be controlled via Elasticsearch ILM policies

## Utilities

### Create Index from Mapping
```bash
node elasticsearch/create-index.js <index-name> <mapping-file> [--force]

Options:
  --force    Delete existing index if it exists and recreate

Example:
  node elasticsearch/create-index.js gaig-usage ./elasticsearch/usage-index-mapping.json --force
```

### Upload Dashboard
```bash
node elasticsearch/upload-dashboard.js <ndjson-file> [--overwrite]

Options:
  --overwrite    Overwrite existing dashboard/visualizations

Example:
  node elasticsearch/upload-dashboard.js ./elasticsearch/kibana-dashboard.ndjson --overwrite
```

## Monitoring

### Check if Telemetry is Working

1. **Check server logs** for telemetry messages:
```
📊 Query tracked: insurance policy
📊 Access tracked: sess_12345...
```

2. **Query the usage index** directly:
```bash
curl -X GET "https://<es-url>/gaig-usage/_search?size=10" \
  -H "Authorization: ApiKey <api-key>" \
  -H "Content-Type: application/json" \
  -d '{"query": {"match_all": {}}, "sort": [{"timestamp": "desc"}]}'
```

3. **View dashboard** in Kibana:
```
https://<kibana-url>/app/dashboards#/view/gaig-usage-dashboard
```

## Troubleshooting

### Index Not Found Error
```
❌ Telemetry index "gaig-usage" not found
```
**Solution:** Create the index:
```bash
node elasticsearch/create-index.js gaig-usage ./elasticsearch/usage-index-mapping.json
```

### Dashboard Upload Fails
**Solution:** Check that:
- `ES_URL` and `API_KEY` are set in `.env`
- API key has permissions to create Kibana saved objects
- Kibana URL is accessible (auto-detected for Elastic Cloud)

### No Data in Dashboard
**Solution:**
1. Perform some searches to generate data
2. Wait a few seconds for data to be indexed
3. Refresh the dashboard in Kibana
4. Check the time range in Kibana (default: last 7 days)

### Serverless Mode Errors
If using Elasticsearch Serverless, certain index settings are not supported:
- `number_of_shards`
- `number_of_replicas`
- `max_result_window`

The mapping file has been updated to work with serverless mode.

## Metrics & KPIs

The dashboard provides insights into:

### Usage Metrics
- Total sessions and unique users
- Event volume over time
- Peak usage hours/days

### Search Performance
- Average response time
- P95/P99 latency
- Error rates

### Content Performance
- Most searched queries
- Most clicked documents
- Click-through rates by position
- Average position of clicks

### User Demographics
- Device type distribution
- Browser preferences
- Operating system breakdown

## Future Enhancements

Potential additions to the telemetry system:

1. **Real-time Alerts**: Set up alerting for error spikes or slow queries
2. **A/B Testing**: Track experiment variants
3. **Search Refinement**: Track query modifications and filters
4. **LLM Analytics**: Track answer generation quality and usage
5. **Conversion Tracking**: Track user goals (downloads, etc.)
6. **Heatmaps**: Visual click patterns
7. **Session Recording**: Full session playback (with privacy controls)

## Contributing

To modify the telemetry system:

1. **Update mapping**: Edit `elasticsearch/usage-index-mapping.json`
2. **Update dashboard**: Export from Kibana as NDJSON or edit `kibana-dashboard.ndjson`
3. **Update service**: Modify `telemetry.js` to track additional events
4. **Recreate index**: Use `--force` flag to delete and recreate
5. **Re-upload dashboard**: Use `--overwrite` flag to update visualizations

## Support

For issues or questions:
1. Check server logs for telemetry errors
2. Verify index exists in Elasticsearch
3. Check Kibana dashboard for data flow
4. Review this documentation

## License

This telemetry system is part of the GAIG PDF Website application.
