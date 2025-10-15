class KnowledgeSearch {
    constructor() {
        this.searchInput = document.getElementById('searchInput');
        this.searchBtn = document.getElementById('searchBtn');
        this.resultsContainer = document.getElementById('resultsContainer');
        this.loading = document.getElementById('loading');
        this.answerContainer = document.getElementById('answerContainer');
        this.answerContent = document.getElementById('answerContent');
        this.answerLoading = document.getElementById('answerLoading');
        this.docCountSelect = document.getElementById('docCount');
        this.sidebar = document.querySelector('.sidebar');

        // Facet containers
        this.authorFacets = document.getElementById('authorFacets');
        this.contentTypeFacets = document.getElementById('contentTypeFacets');
        this.creatorToolFacets = document.getElementById('creatorToolFacets');

        // Selected filters
        this.selectedFilters = {
            author: [],
            content_type: [],
            creator_tool: []
        };

        // System prompt will be loaded from server
        this.systemPrompt = '';

        this.bindEvents();
        this.loadFacets();
        this.loadSystemPrompt();
        this.setupSampleQuestionsModal();
        this.setupSystemPromptModal();
        this.loadSampleQuestions(); // Load questions at startup
    }

    bindEvents() {
        this.searchBtn.addEventListener('click', () => this.performSearch());

        this.searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.performSearch();
            }
        });

        this.searchInput.addEventListener('input', () => {
            if (this.searchInput.value.trim() === '') {
                this.showWelcomeMessage();
                this.hideAnswer();
            }
        });
    }

    async performSearch() {
        const query = this.searchInput.value.trim();

        if (!query) {
            this.showError('Please enter a search query');
            return;
        }

        this.showLoading();
        this.hideAnswer(); // Hide answer section at start of new search

        try {
            const response = await fetch('/api/search', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    query: query,
                    filters: this.selectedFilters,
                    size: this.getSelectedDocumentCount()
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Search failed');
            }

            // Immediately display search results
            this.displayResults(data, query);
            this.hideLoading(); // Hide loading immediately after displaying results

            // Generate answer using search results - start immediately
            if (data.results.length > 0) {
                this.generateAnswer(query, data.results);
            }

        } catch (error) {
            console.error('Search error:', error);
            this.showError(`Search failed: ${error.message}`);
            this.hideLoading();
        }
    }

    displayResults(data, query) {
        const { total, results, took } = data;

        if (results.length === 0) {
            this.showNoResults(query);
            return;
        }

        const resultsHtml = `
            <div class="results-header">
                <h2>Search Results</h2>
                <div class="results-info">
                    Found ${total.toLocaleString()} results in ${took}ms
                </div>
            </div>
            ${results.map(result => this.renderResult(result)).join('')}
        `;

        this.resultsContainer.innerHTML = resultsHtml;

        // Show sidebar now that we have search results
        this.showSidebar();

        // Bind highlight toggle events after HTML is inserted
        this.bindHighlightEvents();
    }

    getFileTypeIcon(filename) {
        const extension = filename.split('.').pop().toLowerCase();
        const iconColor = 'var(--gaig-accent)';

        const icons = {
            pdf: `<svg width="16" height="16" viewBox="0 0 24 24" fill="${iconColor}" style="vertical-align: middle; margin-right: 0.5rem;">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/>
                <path d="M14 2v6h6" stroke="white" stroke-width="2" fill="none"/>
                <text x="12" y="18" font-size="8" fill="white" text-anchor="middle" font-weight="bold">PDF</text>
            </svg>`,
            doc: `<svg width="16" height="16" viewBox="0 0 24 24" fill="#2B579A" style="vertical-align: middle; margin-right: 0.5rem;">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/>
                <path d="M14 2v6h6" stroke="white" stroke-width="2" fill="none"/>
            </svg>`,
            docx: `<svg width="16" height="16" viewBox="0 0 24 24" fill="#2B579A" style="vertical-align: middle; margin-right: 0.5rem;">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/>
                <path d="M14 2v6h6" stroke="white" stroke-width="2" fill="none"/>
            </svg>`,
            xls: `<svg width="16" height="16" viewBox="0 0 24 24" fill="#217346" style="vertical-align: middle; margin-right: 0.5rem;">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/>
                <path d="M14 2v6h6" stroke="white" stroke-width="2" fill="none"/>
            </svg>`,
            xlsx: `<svg width="16" height="16" viewBox="0 0 24 24" fill="#217346" style="vertical-align: middle; margin-right: 0.5rem;">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/>
                <path d="M14 2v6h6" stroke="white" stroke-width="2" fill="none"/>
            </svg>`,
            txt: `<svg width="16" height="16" viewBox="0 0 24 24" fill="#666666" style="vertical-align: middle; margin-right: 0.5rem;">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/>
                <path d="M14 2v6h6" stroke="white" stroke-width="2" fill="none"/>
            </svg>`,
            default: `<svg width="16" height="16" viewBox="0 0 24 24" fill="var(--gaig-primary)" style="vertical-align: middle; margin-right: 0.5rem;">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/>
                <path d="M14 2v6h6" stroke="white" stroke-width="2" fill="none"/>
            </svg>`
        };

        return icons[extension] || icons.default;
    }

    renderResult(result) {
        const { id, score, source, highlight } = result;

        const title = source.attachment?.title || source.title || source.attachment?.filename || source.filename || 'No title available';
        const author = source.attachment?.author || 'Unknown author';
        const content = source.attachment?.content || source.content || 'No content available';
        const url = source.url || source.link || '#';

        // Check for highlights in semantic_content field
        const highlights = highlight.semantic_content || highlight.content || [];
        const highlightHtml = highlights.length > 0
            ? highlights.map((h, index) => `
                <div class="highlight-container">
                    <button class="highlight-toggle" data-highlight-id="${id}-${index}">
                        <span class="highlight-label">chunk</span>
                        <span class="highlight-icon">▶</span>
                    </button>
                    <div class="result-highlight collapsed" data-highlight-content="${id}-${index}">${h}</div>
                </div>
            `).join('')
            : '';

        const filename = source.filename || source.attachment?.filename || 'Unknown file';
        const fileIcon = this.getFileTypeIcon(filename);

        return `
            <div class="result-item">
                <div class="result-title" onclick="window.open('${url}', '_blank')">${this.escapeHtml(title)}</div>
                <div class="result-author" style="color: var(--gaig-gray); font-size: 0.9rem; margin-bottom: 0.5rem;">Author: ${this.escapeHtml(author)}</div>
                <div class="result-filename" style="color: var(--gaig-gray); font-size: 0.9rem; margin-bottom: 0.5rem; display: flex; align-items: center;">${fileIcon}Filename: ${this.escapeHtml(filename)}</div>
                <div class="result-content">${this.escapeHtml(this.truncateText(content, 300))}</div>
                ${highlightHtml}
                <div class="result-meta">
                    <span>ID: ${id}</span>
                    <span class="result-score">Score: ${score.toFixed(2)}</span>
                </div>
            </div>
        `;
    }

    showWelcomeMessage() {
        this.resultsContainer.innerHTML = `
            <div class="welcome-message">
                <h2>Welcome to Great American Insurance Group Knowledge Search</h2>
                <p>Enter your search query above to find relevant information from our knowledge base.</p>
            </div>
        `;
        this.hideSidebar();
    }

    showNoResults(query) {
        this.resultsContainer.innerHTML = `
            <div class="no-results">
                <h3>No Results Found</h3>
                <p>No results found for "<strong>${this.escapeHtml(query)}</strong>"</p>
                <p>Try different keywords or check the spelling of your search terms.</p>
            </div>
        `;
    }

    showError(message) {
        this.resultsContainer.innerHTML = `
            <div class="error-message">
                <strong>Error:</strong> ${this.escapeHtml(message)}
            </div>
        `;
    }

    showLoading() {
        this.loading.style.display = 'flex';
        this.resultsContainer.style.opacity = '0.5';
        this.searchBtn.disabled = true;
        this.searchBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <path d="m9 12 2 2 4-4"/>
            </svg>
            Searching...
        `;
    }

    hideLoading() {
        this.loading.style.display = 'none';
        this.resultsContainer.style.opacity = '1';
        this.searchBtn.disabled = false;
        this.searchBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"/>
                <path d="21 21l-4.35-4.35"/>
            </svg>
            Search
        `;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    truncateText(text, maxLength) {
        if (text.length <= maxLength) return text;
        return text.substr(0, maxLength) + '...';
    }

    async generateAnswer(query, searchResults) {
        try {
            console.log('generateAnswer called with:', { query, searchResults });

            // Extract context from all results with document titles
            const documentsContext = searchResults
                .filter(result => {
                    const highlights = result.highlight?.semantic_content || result.highlight?.content;
                    return highlights && highlights.length > 0;
                })
                .map(result => {
                    const highlights = result.highlight?.semantic_content || result.highlight?.content;
                    const documentTitle = result.source?.attachment?.title || result.source?.title || result.source?.attachment?.filename || result.source?.filename || 'Unknown Document';
                    const contextText = highlights.join(' ');
                    return `Document: "${documentTitle}"\nContent: ${contextText}`;
                })
                .join('\n\n---\n\n');

            console.log('Documents context:', documentsContext);

            if (!documentsContext) {
                console.log('No highlights available for answer generation');
                return; // Don't show answer section if no context
            }

            console.log('Making API call to /api/chat-completion...');

            // Show answer section immediately when LLM request starts
            this.showAnswerLoading();

            const response = await fetch('/api/chat-completion', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    messages: [
                        {
                            role: 'system',
                            content: this.systemPrompt
                        },
                        {
                            role: 'user',
                            content: `Please answer the following question using only the information provided in the search results context below. Do not use any external knowledge.

Question: "${query}"

Search Results Context:
${documentsContext}`
                        }
                    ]
                })
            });

            console.log('API response status:', response.status);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('API error response:', errorText);
                throw new Error(`Chat completion failed: ${response.status} - ${errorText}`);
            }

            // Simplified streaming - server sends plain text chunks (based on PG_Search pattern)
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let answer = '';
            let firstChunkReceived = false;

            console.log('Starting to read streaming response...');

            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    console.log('Stream reading complete. Final answer length:', answer.length);
                    break;
                }

                // Decode the plain text chunk
                const chunk = decoder.decode(value, { stream: true });
                console.log('Received chunk:', JSON.stringify(chunk), 'length:', chunk.length);

                // Hide loading and show content on first chunk
                if (!firstChunkReceived && chunk.trim()) {
                    firstChunkReceived = true;
                    this.hideAnswerLoading();
                    this.answerContent.innerHTML = '';
                    console.log('First LLM chunk received, hiding loading and showing content');
                }

                answer += chunk;

                // Update the display in real-time with just the new chunk
                this.answerContent.innerHTML = this.formatAnswer(answer);
                console.log('Accumulated answer so far:', JSON.stringify(answer.substring(0, 100)) + (answer.length > 100 ? '...' : ''));
            }

            console.log('Final answer:', JSON.stringify(answer));

            // Final cleanup
            if (answer.trim()) {
                this.answerContent.innerHTML = this.formatAnswer(answer.trim());
                console.log('Answer displayed successfully');
            } else {
                console.log('No content received, showing fallback message');
                this.answerContent.innerHTML = '<p>Sorry, I could not generate a readable answer from the available information.</p>';
            }

        } catch (error) {
            console.error('Answer generation error:', error);
            // Don't show answer section if there was an error
        }
    }

    formatAnswer(text) {
        // Convert GitHub markdown to HTML5
        return this.markdownToHtml(text);
    }

    markdownToHtml(markdown) {
        if (!markdown || !markdown.trim()) return '';

        let html = markdown;

        // Headers (support #### as well)
        html = html.replace(/^#### (.*$)/gim, '<h4 class="answer-h4">$1</h4>');
        html = html.replace(/^### (.*$)/gim, '<h3 class="answer-h3">$1</h3>');
        html = html.replace(/^## (.*$)/gim, '<h2 class="answer-h2">$1</h2>');
        html = html.replace(/^# (.*$)/gim, '<h1 class="answer-h1">$1</h1>');

        // Bold (**text** or __text__) - fix conflicting regex
        html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');

        // Italic (*text* or _text_) - avoid conflicts with bold
        html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
        html = html.replace(/(?<!_)_([^_]+)_(?!_)/g, '<em>$1</em>');

        // Code blocks (```code```)
        html = html.replace(/```([\s\S]*?)```/g, '<pre class="answer-code-block"><code>$1</code></pre>');

        // Inline code (`code`)
        html = html.replace(/`([^`]+)`/g, '<code class="answer-inline-code">$1</code>');

        // Links [text](url)
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="answer-link">$1</a>');

        // Process lists with better parsing
        html = this.processLists(html);

        // Blockquotes (> text)
        html = html.replace(/^>\s(.+)$/gm, '<blockquote class="answer-blockquote">$1</blockquote>');

        // Process source citations - look for (Source: ...) patterns
        html = html.replace(/\*\(Source:\s*([^)]+)\)\*/g, '<span class="source-citation"><em>(Source: $1)</em></span>');

        // Line breaks and paragraphs
        html = html.replace(/\n\s*\n/g, '</p><p>');

        // Wrap in paragraphs if not already wrapped
        if (!html.match(/^<(h[1-6]|ul|ol|pre|blockquote)/)) {
            html = `<p>${html}</p>`;
        }

        // Clean up extra paragraph tags around block elements
        html = html.replace(/<p>(<(h[1-6]|ul|ol|pre|blockquote)[^>]*>.*?<\/\2>)<\/p>/g, '$1');

        // Fix empty paragraphs
        html = html.replace(/<p>\s*<\/p>/g, '');

        // Add proper spacing between sections
        html = html.replace(/(<\/h[1-6]>)/g, '$1<div class="section-spacing"></div>');
        html = html.replace(/(<\/ul>|<\/ol>)(\s*)(<h[1-6])/g, '$1<div class="section-spacing"></div>$3');

        return html;
    }

    processLists(html) {
        const lines = html.split('\n');
        let result = [];
        let i = 0;

        while (i < lines.length) {
            const line = lines[i];

            // Check for unordered list items
            if (line.match(/^\s*[-*]\s/)) {
                const listItems = [];
                let currentIndent = line.match(/^(\s*)/)[1].length;

                // Collect all consecutive list items
                while (i < lines.length && lines[i].match(/^\s*[-*]\s/)) {
                    const itemMatch = lines[i].match(/^\s*[-*]\s(.+)/);
                    if (itemMatch) {
                        const indent = lines[i].match(/^(\s*)/)[1].length;
                        listItems.push({
                            content: itemMatch[1],
                            indent: Math.floor(indent / 2)
                        });
                    }
                    i++;
                }

                // Generate nested HTML
                result.push(this.generateNestedList(listItems));
                continue;
            }

            // Check for ordered list items
            else if (line.match(/^\s*\d+\.\s/)) {
                const listItems = [];

                // Collect all consecutive numbered items
                while (i < lines.length && lines[i].match(/^\s*\d+\.\s/)) {
                    const itemMatch = lines[i].match(/^\s*\d+\.\s(.+)/);
                    if (itemMatch) {
                        listItems.push(itemMatch[1]);
                    }
                    i++;
                }

                // Generate ordered list HTML
                const items = listItems.map(item => `<li>${item}</li>`).join('');
                result.push(`<ol class="answer-ordered-list">${items}</ol>`);
                continue;
            }

            result.push(line);
            i++;
        }

        return result.join('\n');
    }

    generateNestedList(items) {
        if (items.length === 0) return '';

        let html = '<ul class="answer-unordered-list">';
        let i = 0;

        while (i < items.length) {
            const item = items[i];
            html += `<li>${item.content}`;

            // Check if next items are nested
            if (i + 1 < items.length && items[i + 1].indent > item.indent) {
                const nestedItems = [];
                let j = i + 1;

                while (j < items.length && items[j].indent > item.indent) {
                    nestedItems.push({
                        content: items[j].content,
                        indent: items[j].indent - item.indent - 1
                    });
                    j++;
                }

                html += this.generateNestedList(nestedItems);
                i = j;
            } else {
                i++;
            }

            html += '</li>';
        }

        html += '</ul>';
        return html;
    }

    showAnswer() {
        this.answerContainer.style.display = 'block';
    }

    hideAnswer() {
        this.answerContainer.style.display = 'none';
        this.answerContent.innerHTML = '';
    }

    showAnswerLoading() {
        this.answerLoading.style.display = 'flex';
        this.answerContent.style.display = 'none';
        this.showAnswer();
    }

    hideAnswerLoading() {
        this.answerLoading.style.display = 'none';
        this.answerContent.style.display = 'block';
    }

    async loadSystemPrompt() {
        try {
            const response = await fetch('/api/system-prompt');

            if (!response.ok) {
                if (response.status === 503) {
                    console.log('System prompt not available on server yet');
                    this.systemPrompt = '';
                    return;
                } else {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
            }

            const data = await response.json();
            this.systemPrompt = data.content || '';
            console.log(`System prompt loaded successfully (${data.length} characters)`);
        } catch (error) {
            console.error('Failed to load system prompt:', error);
            this.systemPrompt = '';
        }
    }

    async loadFacets() {
        try {
            console.log('=== FRONTEND: Loading facets ===');
            const response = await fetch('/api/facets');
            const facets = await response.json();

            console.log('=== FRONTEND: Received facets ===');
            console.log('Full facets object:', JSON.stringify(facets, null, 2));
            console.log('Author facets:', facets.author);
            console.log('Content Type facets:', facets.content_type);
            console.log('Creator Tool facets:', facets.creator_tool);

            this.renderFacets('author', facets.author, this.authorFacets);
            this.renderFacets('content_type', facets.content_type, this.contentTypeFacets);
            this.renderFacets('creator_tool', facets.creator_tool, this.creatorToolFacets);

        } catch (error) {
            console.error('Failed to load facets:', error);
            this.authorFacets.innerHTML = '<div class="facet-loading">Failed to load</div>';
            this.contentTypeFacets.innerHTML = '<div class="facet-loading">Failed to load</div>';
            this.creatorToolFacets.innerHTML = '<div class="facet-loading">Failed to load</div>';
        }
    }

    renderFacets(facetType, facetData, container) {
        console.log(`=== FRONTEND: Rendering ${facetType} facets ===`);
        console.log('facetData:', facetData);
        console.log('container:', container);
        console.log('facetData is array?', Array.isArray(facetData));
        console.log('facetData length:', facetData?.length);

        if (!facetData || facetData.length === 0) {
            console.log(`No data for ${facetType}, showing "No data available"`);
            container.innerHTML = '<div class="facet-loading">No data available</div>';
            return;
        }

        const html = facetData.map(facet => `
            <div class="facet-item" data-facet-type="${facetType}" data-facet-value="${this.escapeHtml(facet.value)}">
                <span class="facet-label" title="${this.escapeHtml(facet.value)}">${this.escapeHtml(facet.value || 'Unknown')}</span>
                <span class="facet-count">${facet.count}</span>
            </div>
        `).join('');

        console.log(`Generated HTML for ${facetType}:`, html.substring(0, 200));
        container.innerHTML = html;

        // Add click handlers
        container.querySelectorAll('.facet-item').forEach(item => {
            item.addEventListener('click', () => {
                const facetType = item.dataset.facetType;
                const facetValue = item.dataset.facetValue;
                this.toggleFacet(facetType, facetValue, item);
            });
        });

        console.log(`Rendered ${facetType} successfully, added ${container.querySelectorAll('.facet-item').length} items`);
    }

    toggleFacet(facetType, facetValue, element) {
        const isSelected = element.classList.contains('active');

        if (isSelected) {
            // Remove from selected filters
            element.classList.remove('active');
            this.selectedFilters[facetType] = this.selectedFilters[facetType].filter(v => v !== facetValue);
        } else {
            // Add to selected filters
            element.classList.add('active');
            this.selectedFilters[facetType].push(facetValue);
        }

        // Re-run search if there's an active query
        if (this.searchInput.value.trim()) {
            this.performSearch();
        }
    }

    getSelectedDocumentCount() {
        return parseInt(this.docCountSelect.value) || 3;
    }

    bindHighlightEvents() {
        const toggleButtons = this.resultsContainer.querySelectorAll('.highlight-toggle');
        toggleButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                this.toggleHighlight(button);
            });
        });
    }

    toggleHighlight(button) {
        const highlight = button.nextElementSibling;
        const icon = button.querySelector('.highlight-icon');

        if (highlight.classList.contains('collapsed')) {
            highlight.classList.remove('collapsed');
            button.classList.add('expanded');
            highlight.style.maxHeight = highlight.scrollHeight + 'px';
        } else {
            highlight.classList.add('collapsed');
            button.classList.remove('expanded');
            highlight.style.maxHeight = '0px';
        }
    }

    showSidebar() {
        this.sidebar.classList.add('visible');
    }

    hideSidebar() {
        this.sidebar.classList.remove('visible');
    }

    setupSampleQuestionsModal() {
        this.sampleQuestionsBtn = document.getElementById('sampleQuestionsBtn');
        this.sampleQuestionsModal = document.getElementById('sampleQuestionsModal');
        this.closeSampleModal = document.getElementById('closeSampleModal');
        this.sampleQuestionsList = document.getElementById('sampleQuestionsList');

        // Sample questions will be loaded from GitHub
        this.sampleQuestions = [];
        this.questionsLoaded = false;

        // Event listeners
        this.sampleQuestionsBtn.addEventListener('click', () => this.showSampleQuestionsModal());
        this.closeSampleModal.addEventListener('click', () => this.hideSampleQuestionsModal());
        this.sampleQuestionsModal.addEventListener('click', (e) => {
            if (e.target === this.sampleQuestionsModal || e.target.classList.contains('modal-overlay')) {
                this.hideSampleQuestionsModal();
            }
        });

    }

    async loadSampleQuestions() {
        if (this.questionsLoaded) {
            return this.sampleQuestions;
        }

        try {
            console.log('Loading sample questions from server...');
            const response = await fetch('/api/questions');

            if (!response.ok) {
                if (response.status === 503) {
                    // Questions not loaded yet on server
                    console.log('Questions not available on server yet, will retry...');
                    this.questionsLoaded = false;
                    this.populateModalIfOpen();
                    return null;
                } else {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
            }

            const data = await response.json();
            this.sampleQuestions = data; // Store the entire data structure including categories
            this.questionsLoaded = true;

            const totalQuestions = data.categories ? data.categories.reduce((sum, cat) => sum + cat.questions.length, 0) : 0;
            console.log(`Loaded ${totalQuestions} questions in ${data.categories ? data.categories.length : 0} categories from server cache (last updated: ${data.lastUpdated})`);

            // Update modal if it's currently open
            this.populateModalIfOpen();

            return this.sampleQuestions;

        } catch (error) {
            console.error('Failed to load sample questions from server:', error);

            // No fallback questions - only use server endpoint
            this.sampleQuestions = null;
            this.questionsLoaded = false; // Mark as failed to load

            // Update modal if it's currently open to show error state
            this.populateModalIfOpen();

            return this.sampleQuestions;
        }
    }

    showSampleQuestionsModal() {
        // Show modal
        this.sampleQuestionsModal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';

        // Check if questions are loaded
        if (!this.questionsLoaded) {
            this.sampleQuestionsList.innerHTML = '<div class="loading-questions">Loading sample questions...</div>';
            // Questions will be populated when they finish loading
            return;
        }

        // Check if questions are available
        if (!this.sampleQuestions || !this.sampleQuestions.categories || this.sampleQuestions.categories.length === 0) {
            this.sampleQuestionsList.innerHTML = '<div class="error-questions">Unable to load sample questions. Please try again later.</div>';
            return;
        }

        // Populate questions list with categories
        const categoriesHtml = this.sampleQuestions.categories.map(category => {
            const questionsHtml = category.questions.map(questionObj => {
                const question = typeof questionObj === 'string' ? questionObj : questionObj.question;
                return `
                    <div class="question-item" data-question="${this.escapeHtml(question)}">
                        <span class="question-bullet">•</span>
                        <span class="question-text">${this.escapeHtml(question)}</span>
                    </div>
                `;
            }).join('');

            return `
                <div class="question-category">
                    <h4 class="category-name">${this.escapeHtml(category.categoryName)}</h4>
                    <div class="category-questions">
                        ${questionsHtml}
                    </div>
                </div>
            `;
        }).join('');

        this.sampleQuestionsList.innerHTML = categoriesHtml;

        // Add click handlers to questions
        this.sampleQuestionsList.querySelectorAll('.question-item').forEach(item => {
            item.addEventListener('click', () => {
                const question = item.dataset.question;
                this.selectQuestion(question);
            });
        });
    }

    populateModalIfOpen() {
        // If modal is open and questions just finished loading, populate it
        if (!this.sampleQuestionsModal.classList.contains('hidden') && this.questionsLoaded) {
            this.showSampleQuestionsModal();
        }
    }

    hideSampleQuestionsModal() {
        this.sampleQuestionsModal.classList.add('hidden');
        document.body.style.overflow = '';
    }

    selectQuestion(question) {
        // Populate search input
        this.searchInput.value = question;

        // Hide modal
        this.hideSampleQuestionsModal();

        // Submit search
        this.performSearch();

        // Focus on search input and scroll to top
        setTimeout(() => {
            this.searchInput.focus();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }, 100);
    }

    setupSystemPromptModal() {
        this.systemPromptBtn = document.getElementById('systemPromptBtn');
        this.systemPromptModal = document.getElementById('systemPromptModal');
        this.closeSystemPromptModal = document.getElementById('closeSystemPromptModal');
        this.systemPromptContent = document.getElementById('systemPromptContent');

        // Event listeners
        this.systemPromptBtn.addEventListener('click', () => this.showSystemPromptModal());
        this.closeSystemPromptModal.addEventListener('click', () => this.hideSystemPromptModal());
        this.systemPromptModal.addEventListener('click', (e) => {
            if (e.target === this.systemPromptModal || e.target.classList.contains('modal-overlay')) {
                this.hideSystemPromptModal();
            }
        });

        // ESC key to close modal (update existing listener to handle both modals)
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (!this.sampleQuestionsModal.classList.contains('hidden')) {
                    this.hideSampleQuestionsModal();
                } else if (!this.systemPromptModal.classList.contains('hidden')) {
                    this.hideSystemPromptModal();
                }
            }
        });
    }

    showSystemPromptModal() {
        // Show modal
        this.systemPromptModal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';

        // Check if system prompt is loaded
        if (!this.systemPrompt || this.systemPrompt.length === 0) {
            this.systemPromptContent.innerHTML = '<div class="loading-prompt">System instructions not available. Please try again later.</div>';
            return;
        }

        // Format and display the system prompt in a user-friendly way
        const formattedPrompt = this.formatSystemPromptForDisplay(this.systemPrompt);
        this.systemPromptContent.innerHTML = formattedPrompt;
    }

    hideSystemPromptModal() {
        this.systemPromptModal.classList.add('hidden');
        document.body.style.overflow = '';
    }

    formatSystemPromptForDisplay(promptText) {
        // Convert the system prompt to a more user-friendly HTML format
        let formatted = promptText
            // Convert section headers (all caps followed by colon)
            .replace(/^([A-Z\s]+):/gm, '<h3>$1</h3>')
            // Convert bullet points
            .replace(/^- (.+)$/gm, '<li>$1</li>')
            // Wrap consecutive list items in ul tags (non-greedy to avoid capturing across sections)
            .replace(/(<li>.*?<\/li>\s*)+/gs, '<ul>$&</ul>')
            // Convert line breaks to HTML
            .replace(/\n\n/g, '</p><p>')
            .replace(/\n/g, '<br>');

        // Wrap in paragraph tags
        formatted = '<p>' + formatted + '</p>';

        // Clean up empty paragraphs and fix formatting
        formatted = formatted
            .replace(/<p><\/p>/g, '')
            .replace(/<p><h3>/g, '<h3>')
            .replace(/<\/h3><\/p>/g, '</h3>')
            .replace(/<p><ul>/g, '<ul>')
            .replace(/<\/ul><\/p>/g, '</ul>')
            .replace(/<br>\s*<h3>/g, '<h3>')
            .replace(/<br>\s*<ul>/g, '<ul>');

        return formatted;
    }
}

class HealthChecker {
    constructor() {
        this.checkHealth();
        setInterval(() => this.checkHealth(), 300000); // Check every 5 minutes
    }

    async checkHealth() {
        try {
            const response = await fetch('/api/health');
            const data = await response.json();

            if (data.status === 'ok') {
                console.log('✓ Application health check passed:', data);
            } else {
                console.warn('⚠ Application health check failed:', data);
            }
        } catch (error) {
            console.error('✗ Health check error:', error);
        }
    }
}


document.addEventListener('DOMContentLoaded', () => {
    new KnowledgeSearch();
    new HealthChecker();

    console.log('🔍 Great American Insurance Group Knowledge Search initialized');
});