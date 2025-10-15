# Great American Insurance Group Knowledge Search

A Node.js-based knowledge search application that uses Elasticsearch for semantic search capabilities across insurance documentation and knowledge bases.

## Features

- **Semantic Search**: Powered by Elasticsearch with semantic retrieval
- **Responsive Design**: Mobile-friendly interface with Great American Insurance Group branding
- **Real-time Search**: Fast search results with highlighting
- **AI-Powered Answers**: Generates contextual answers using LLM integration
- **Faceted Search**: Filter results by author, content type, and creator tool
- **Sample Questions**: Pre-loaded insurance-specific sample questions
- **Health Monitoring**: Built-in health checks for system monitoring

## Installation

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables in `.env`:
```
ELASTICSEARCH_URL=https://your-elasticsearch-cluster-url
ELASTICSEARCH_API_KEY=your-base64-encoded-api-key
PORT=3000
```

**Note**: The API key should be the base64-encoded key without any prefix.

## Usage

1. Start the application:
```bash
npm start
```

2. For development with auto-reload:
```bash
npm run dev
```

3. Open your browser to `http://localhost:3000`

## API Endpoints

### POST /api/search
Search the insurance documents index.

**Request body:**
```json
{
  "query": "search terms",
  "filters": {
    "author": [],
    "content_type": [],
    "creator_tool": []
  },
  "size": 10
}
```

**Response:**
```json
{
  "total": 150,
  "results": [...],
  "took": 45,
  "filters": {}
}
```

### POST /api/chat-completion
Generate AI-powered answers based on search results.

**Request body:**
```json
{
  "messages": [
    {
      "role": "system",
      "content": "system prompt"
    },
    {
      "role": "user",
      "content": "user question with context"
    }
  ]
}
```

### GET /api/questions
Get sample questions for the knowledge base.

**Response:**
```json
{
  "questions": [...],
  "lastUpdated": "2024-01-01T00:00:00.000Z",
  "count": 15
}
```

### GET /api/system-prompt
Get the system prompt used for AI responses.

**Response:**
```json
{
  "content": "system prompt text",
  "lastUpdated": "2024-01-01T00:00:00.000Z",
  "length": 1234
}
```

### GET /api/facets
Get available facets for filtering search results.

**Response:**
```json
{
  "author": [...],
  "content_type": [...],
  "creator_tool": [...]
}
```

### GET /api/health
Check application and Elasticsearch health.

**Response:**
```json
{
  "status": "ok",
  "elasticsearch": "green",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Configuration

The application uses the Elasticsearch query template from `elasticsearch/main.query` for semantic search functionality.

The application searches the index name specified in the `INDEX_NAME` environment variable.

## Theme Colors

The application uses Great American Insurance Group's corporate color scheme:
- Primary Navy: #002855
- Secondary Blue: #003d7a
- Accent Red: #E31E47
- Light Blue: #0066cc

## Logo

The application displays the Great American Insurance Group logo (`gaig_logo_web_full_color.png`) in the header.

## Development

The project structure:
```
├── server.js              # Main server file
├── package.json           # Dependencies and scripts
├── .env                   # Environment configuration
├── system-prompt.txt      # LLM system prompt
├── Questions.txt          # Sample questions
├── elasticsearch/        # Query templates
│   └── main.query        # Main search query template
└── public/               # Frontend assets
    ├── index.html        # Main HTML page
    ├── style.css         # Styling and theme
    ├── app.js            # Client-side JavaScript
    ├── gaig_logo_web_full_color.png    # Company logo
    └── elasticsearch-logo-png-transparent.png  # Elasticsearch logo
```

## Security

- Helmet.js for security headers
- CORS protection
- Input validation and sanitization
- API key authentication for Elasticsearch

## Insurance Industry Focus

This application is specifically designed for the insurance industry with:
- Insurance-specific system prompts and AI responses
- Sample questions covering underwriting, claims, policy administration, and regulatory compliance
- Knowledge base optimized for insurance documentation

## License

© 2024 Great American Insurance Group. All rights reserved.
