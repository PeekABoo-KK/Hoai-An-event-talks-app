// ==========================================================================
// STATE MANAGEMENT & CONSTANTS
// ==========================================================================
let allUpdates = [];
let filteredUpdates = [];
let selectedIds = new Set();
let currentFilterType = 'all';
let currentSearchQuery = '';
let activeHashtags = new Set(['#BigQuery', '#GoogleCloud']);

// Emoji mapping for release note types
const TYPE_EMOJIS = {
    'Feature': '🚀',
    'Bug Fix': '🛠️',
    'Changed': '🔄',
    'Deprecated': '⚠️',
    'Update': '📢'
};

// DOM Elements
const DOM = {
    refreshBtn: document.getElementById('refresh-btn'),
    refreshIcon: document.getElementById('refresh-icon'),
    lastUpdatedText: document.getElementById('last-updated-text'),
    
    // Stats
    statTotal: document.getElementById('stat-total'),
    statFeatures: document.getElementById('stat-features'),
    statBugfixes: document.getElementById('stat-bugfixes'),
    statChanged: document.getElementById('stat-changed'),
    statDeprecated: document.getElementById('stat-deprecated'),
    statsSection: document.getElementById('stats-section'),
    
    // Controls
    searchInput: document.getElementById('search-input'),
    clearSearch: document.getElementById('clear-search'),
    typePills: document.getElementById('type-pills'),
    exportCsvBtn: document.getElementById('export-csv-btn'),
    tweetSelectedBtn: document.getElementById('tweet-selected-btn'),
    selectedCount: document.getElementById('selected-count'),
    
    // App States
    loadingState: document.getElementById('loading-state'),
    errorState: document.getElementById('error-state'),
    errorMessage: document.getElementById('error-message'),
    emptyState: document.getElementById('empty-state'),
    feedGrid: document.getElementById('feed-grid'),
    retryBtn: document.getElementById('retry-btn'),
    resetFiltersBtn: document.getElementById('reset-filters-btn'),
    
    // Modal
    tweetModal: document.getElementById('tweet-modal'),
    closeModalBtn: document.getElementById('close-modal-btn'),
    tweetTextarea: document.getElementById('tweet-textarea'),
    charCounter: document.getElementById('char-counter'),
    hashtagPills: document.querySelector('.hashtag-pills'),
    tweetPreviewText: document.getElementById('tweet-preview-text'),
    copyTweetBtn: document.getElementById('copy-tweet-btn'),
    postTweetBtn: document.getElementById('post-tweet-btn'),
    selectionSummaryContainer: document.getElementById('selection-summary-container'),
    selectionSummaryText: document.getElementById('selection-summary-text')
};

// ==========================================================================
// INITIALIZATION
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
    initEventListeners();
    fetchReleaseNotes(false);
});

// ==========================================================================
// EVENT LISTENERS SETUP
// ==========================================================================
function initEventListeners() {
    // Refresh & Retry
    DOM.refreshBtn.addEventListener('click', () => fetchReleaseNotes(true));
    DOM.retryBtn.addEventListener('click', () => fetchReleaseNotes(true));
    
    // Search
    DOM.searchInput.addEventListener('input', debounce((e) => {
        currentSearchQuery = e.target.value.trim().toLowerCase();
        DOM.clearSearch.style.display = currentSearchQuery ? 'block' : 'none';
        applyFiltersAndRender();
    }, 250));
    
    DOM.clearSearch.addEventListener('click', () => {
        DOM.searchInput.value = '';
        currentSearchQuery = '';
        DOM.clearSearch.style.display = 'none';
        applyFiltersAndRender();
        DOM.searchInput.focus();
    });
    
    // Filter Pills
    DOM.typePills.addEventListener('click', (e) => {
        const pill = e.target.closest('.pill');
        if (!pill) return;
        
        // Toggle active status
        document.querySelectorAll('#type-pills .pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        
        currentFilterType = pill.dataset.filter;
        applyFiltersAndRender();
    });
    
    // Reset Filters
    DOM.resetFiltersBtn.addEventListener('click', () => {
        DOM.searchInput.value = '';
        currentSearchQuery = '';
        DOM.clearSearch.style.display = 'none';
        
        document.querySelectorAll('#type-pills .pill').forEach(p => p.classList.remove('active'));
        document.querySelector('#type-pills .pill[data-filter="all"]').classList.add('active');
        currentFilterType = 'all';
        
        applyFiltersAndRender();
    });
    
    // Stats click filtering
    DOM.statsSection.addEventListener('click', (e) => {
        const card = e.target.closest('.stat-card');
        if (!card) return;
        
        const type = card.dataset.type;
        let targetFilter = 'all';
        
        if (type === 'feature') targetFilter = 'Feature';
        else if (type === 'bugfix') targetFilter = 'Bug Fix';
        else if (type === 'changed') targetFilter = 'Changed';
        else if (type === 'deprecated') targetFilter = 'Deprecated';
        
        document.querySelectorAll('#type-pills .pill').forEach(p => p.classList.remove('active'));
        const matchingPill = document.querySelector(`#type-pills .pill[data-filter="${targetFilter}"]`);
        if (matchingPill) {
            matchingPill.classList.add('active');
        }
        
        currentFilterType = targetFilter;
        applyFiltersAndRender();
    });
    
    // Export CSV Button
    DOM.exportCsvBtn.addEventListener('click', exportToCSV);
    
    // Tweet Selection Button
    DOM.tweetSelectedBtn.addEventListener('click', () => {
        if (selectedIds.size > 0) {
            openTweetComposer([...selectedIds]);
        }
    });
    
    // Modal Listeners
    DOM.closeModalBtn.addEventListener('click', closeTweetComposer);
    DOM.tweetModal.addEventListener('click', (e) => {
        if (e.target === DOM.tweetModal) closeTweetComposer();
    });
    
    // Modal Textarea Change
    DOM.tweetTextarea.addEventListener('input', () => {
        updateCharCounter();
        updateTweetPreview();
    });
    
    // Modal Hashtags Toggle
    DOM.hashtagPills.addEventListener('click', (e) => {
        const pill = e.target.closest('.hashtag-pill');
        if (!pill) return;
        
        const tag = pill.dataset.tag;
        if (activeHashtags.has(tag)) {
            activeHashtags.delete(tag);
            pill.classList.remove('active');
        } else {
            activeHashtags.add(tag);
            pill.classList.add('active');
        }
        
        regenerateTweetContent();
    });
    
    // Copy Tweet Content
    DOM.copyTweetBtn.addEventListener('click', copyTweetToClipboard);
    
    // Post to Twitter
    DOM.postTweetBtn.addEventListener('click', postToTwitter);
}

// ==========================================================================
// DATA FETCHING & STATE TRANSITIONS
// ==========================================================================
async function fetchReleaseNotes(forceRefresh = false) {
    // UI state: loading
    setLoadingState(true);
    
    try {
        const url = `/api/releases${forceRefresh ? '?refresh=true' : ''}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Server returned status ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.status === 'error') {
            throw new Error(result.error);
        }
        
        allUpdates = result.updates || [];
        selectedIds.clear(); // Reset selections
        updateSelectedBtn();
        
        // Format last updated text
        if (result.last_updated) {
            const date = new Date(result.last_updated * 1000);
            DOM.lastUpdatedText.textContent = `Last updated: ${formatTime(date)}`;
        } else {
            DOM.lastUpdatedText.textContent = 'Last updated: Unknown';
        }
        
        // Render view
        renderStats();
        applyFiltersAndRender();
        
        setLoadingState(false);
    } catch (error) {
        console.error('Error fetching release notes:', error);
        DOM.errorMessage.textContent = error.message || 'Unable to communicate with the Flask API server. Please retry.';
        setLoadingState(false);
        setErrorState(true);
    }
}

function setLoadingState(isLoading) {
    if (isLoading) {
        DOM.loadingState.style.display = 'flex';
        DOM.feedGrid.style.display = 'none';
        DOM.errorState.style.display = 'none';
        DOM.emptyState.style.display = 'none';
        DOM.refreshIcon.classList.add('spinning');
        DOM.refreshBtn.disabled = true;
    } else {
        DOM.loadingState.style.display = 'none';
        DOM.refreshIcon.classList.remove('spinning');
        DOM.refreshBtn.disabled = false;
    }
}

function setErrorState(isError) {
    if (isError) {
        DOM.errorState.style.display = 'flex';
        DOM.feedGrid.style.display = 'none';
        DOM.emptyState.style.display = 'none';
    } else {
        DOM.errorState.style.display = 'none';
    }
}

// ==========================================================================
// DATA RENDERING & STATS
// ==========================================================================
function renderStats() {
    let total = allUpdates.length;
    let features = 0;
    let bugfixes = 0;
    let changed = 0;
    let deprecated = 0;
    
    allUpdates.forEach(update => {
        const type = update.type;
        if (type === 'Feature') features++;
        else if (type === 'Bug Fix') bugfixes++;
        else if (type === 'Changed') changed++;
        else if (type === 'Deprecated') deprecated++;
    });
    
    DOM.statTotal.textContent = total;
    DOM.statFeatures.textContent = features;
    DOM.statBugfixes.textContent = bugfixes;
    DOM.statChanged.textContent = changed;
    DOM.statDeprecated.textContent = deprecated;
}

function applyFiltersAndRender() {
    filteredUpdates = allUpdates.filter(update => {
        // 1. Type Filter
        const matchesType = currentFilterType === 'all' || 
            (currentFilterType === 'Update' && !['Feature', 'Bug Fix', 'Changed', 'Deprecated'].includes(update.type)) ||
            update.type === currentFilterType;
            
        // 2. Search Filter
        const matchesSearch = !currentSearchQuery || 
            update.text.toLowerCase().includes(currentSearchQuery) ||
            update.type.toLowerCase().includes(currentSearchQuery) ||
            update.date.toLowerCase().includes(currentSearchQuery);
            
        return matchesType && matchesSearch;
    });
    
    renderGrid();
}

function renderGrid() {
    DOM.feedGrid.innerHTML = '';
    
    if (filteredUpdates.length === 0) {
        DOM.feedGrid.style.display = 'none';
        DOM.emptyState.style.display = 'flex';
        return;
    }
    
    DOM.emptyState.style.display = 'none';
    DOM.feedGrid.style.display = 'grid';
    
    filteredUpdates.forEach(update => {
        const isSelected = selectedIds.has(update.id);
        const card = document.createElement('article');
        card.className = `release-card ${isSelected ? 'selected' : ''}`;
        card.dataset.id = update.id;
        card.dataset.type = ['Feature', 'Bug Fix', 'Changed', 'Deprecated'].includes(update.type) ? update.type : 'Update';
        
        const emoji = TYPE_EMOJIS[card.dataset.type] || '📢';
        
        card.innerHTML = `
            <div class="card-header-row">
                <div class="header-meta">
                    <span class="type-badge">
                        ${emoji} ${update.type}
                    </span>
                    <span class="date-badge">
                        <i class="fa-regular fa-calendar-days"></i> ${update.date}
                    </span>
                </div>
                <div class="selection-action">
                    <div class="custom-checkbox" title="Select for tweeting">
                        <i class="fa-solid fa-check"></i>
                    </div>
                </div>
            </div>
            
            <div class="card-body">
                ${update.html}
            </div>
            
            <div class="card-actions-row">
                <a href="${update.link}" target="_blank" rel="noopener noreferrer" class="source-link-anchor">
                    <span>Source Feed</span>
                    <i class="fa-solid fa-arrow-up-right-from-square"></i>
                </a>
                <div class="card-actions-right">
                    <button class="btn btn-card-copy" title="Copy update to clipboard">
                        <i class="fa-regular fa-copy"></i> <span>Copy</span>
                    </button>
                    <button class="btn btn-card-tweet" title="Tweet this update">
                        <i class="fa-brands fa-x-twitter"></i> <span>Tweet</span>
                    </button>
                </div>
            </div>
        `;
        
        // Add card selection listener (excluding link clicks and button clicks)
        card.addEventListener('click', (e) => {
            if (e.target.closest('a') || e.target.closest('.btn-card-tweet') || e.target.closest('.btn-card-copy')) {
                return; // Let native link or button clicks handle it
            }
            toggleSelectUpdate(update.id, card);
        });
        
        // Individual Copy Button Listener
        const copyBtn = card.querySelector('.btn-card-copy');
        copyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            copyCardToClipboard(update, copyBtn);
        });
        
        // Individual Tweet Button Listener
        const tweetBtn = card.querySelector('.btn-card-tweet');
        tweetBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openTweetComposer([update.id]);
        });
        
        DOM.feedGrid.appendChild(card);
    });
}

function toggleSelectUpdate(id, cardElement) {
    if (selectedIds.has(id)) {
        selectedIds.delete(id);
        if (cardElement) cardElement.classList.remove('selected');
    } else {
        selectedIds.add(id);
        if (cardElement) cardElement.classList.add('selected');
    }
    updateSelectedBtn();
}

function updateSelectedBtn() {
    const count = selectedIds.size;
    DOM.selectedCount.textContent = count;
    DOM.tweetSelectedBtn.disabled = count === 0;
}

// ==========================================================================
// TWEET COMPOSER MODAL LOGIC
// ==========================================================================
let activeTweetingIds = [];

function openTweetComposer(ids) {
    activeTweetingIds = ids;
    
    // Selection Summary text
    if (ids.length > 1) {
        DOM.selectionSummaryContainer.style.display = 'flex';
        DOM.selectionSummaryText.textContent = `You are summarizing ${ids.length} selected updates into one tweet.`;
    } else {
        DOM.selectionSummaryContainer.style.display = 'none';
    }
    
    regenerateTweetContent();
    
    // Display Modal
    DOM.tweetModal.style.display = 'flex';
    DOM.tweetTextarea.focus();
}

function closeTweetComposer() {
    DOM.tweetModal.style.display = 'none';
    activeTweetingIds = [];
}

function regenerateTweetContent() {
    if (activeTweetingIds.length === 0) return;
    
    let tweetText = '';
    const hashtagsStr = [...activeHashtags].join(' ');
    
    if (activeTweetingIds.length === 1) {
        const item = allUpdates.find(u => u.id === activeTweetingIds[0]);
        if (item) {
            const emoji = TYPE_EMOJIS[item.type] || TYPE_EMOJIS['Update'];
            const headline = `${emoji} BigQuery ${item.type} (${item.date}):\n`;
            
            // Clean text representation
            let descText = cleanStringForTweet(item.text);
            
            // Max available length for text description
            // 280 (max) - headline.length - link.length (approx 23 chars on twitter) - hashtags.length - spacing
            const linkDummy = " https://docs.cloud.google.com/...";
            const currentTemplateLength = headline.length + linkDummy.length + hashtagsStr.length + 5;
            const maxDescLength = 280 - currentTemplateLength;
            
            if (descText.length > maxDescLength) {
                descText = descText.substring(0, maxDescLength - 3) + '...';
            }
            
            tweetText = `${headline}${descText}\n\nRead more: ${item.link || FEED_URL}\n\n${hashtagsStr}`;
        }
    } else {
        // Multi-select summarization
        // Sort selected items by date (in descending order/reverse chronological)
        const items = allUpdates
            .filter(u => activeTweetingIds.includes(u.id))
            .sort((a, b) => b.id.localeCompare(a.id)); // Simple reverse chronological sorting
            
        const dateStr = items[0] ? items[0].date : "Recent";
        const headline = `📢 BigQuery Releases Overview (${dateStr}):\n`;
        
        let bullets = '';
        const linkStr = `\n\nFull release notes: ${FEED_URL}\n\n${hashtagsStr}`;
        
        // Compute available space for bullets
        const allowedBulletsLength = 280 - headline.length - linkStr.length - 10;
        
        // Build bullets until capacity
        items.forEach((item, index) => {
            const emoji = TYPE_EMOJIS[item.type] || TYPE_EMOJIS['Update'];
            const bulletTitle = cleanStringForTweet(item.text.split('.')[0]); // Take first sentence
            const bulletLine = `• ${emoji} ${bulletTitle}\n`;
            bullets += bulletLine;
        });
        
        if (bullets.length > allowedBulletsLength) {
            bullets = bullets.substring(0, allowedBulletsLength - 4) + '...\n';
        }
        
        tweetText = `${headline}${bullets}${linkStr}`;
    }
    
    DOM.tweetTextarea.value = tweetText;
    updateCharCounter();
    updateTweetPreview();
}

function cleanStringForTweet(str) {
    return str
        .replace(/\s+/g, ' ')      // Collapse whitespace
        .replace(/&amp;/g, '&')     // Decode html entity
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .trim();
}

function updateCharCounter() {
    const text = DOM.tweetTextarea.value;
    
    // X (Twitter) counts all standard links as 23 characters.
    // Let's replace URLs in text with a 23-char placeholder for counting accuracy
    const urlPattern = /https?:\/\/[^\s]+/g;
    const linkPlaceholder = "12345678901234567890123";
    const countedText = text.replace(urlPattern, linkPlaceholder);
    
    const count = countedText.length;
    
    DOM.charCounter.textContent = `${count} / 280`;
    
    // Style counter based on capacity
    DOM.charCounter.className = 'char-counter';
    if (count > 280) {
        DOM.charCounter.classList.add('error');
        DOM.postTweetBtn.disabled = true;
    } else if (count > 250) {
        DOM.charCounter.classList.add('warning');
        DOM.postTweetBtn.disabled = false;
    } else {
        DOM.postTweetBtn.disabled = false;
    }
}

function updateTweetPreview() {
    const text = DOM.tweetTextarea.value;
    
    // Highlight links in preview to make it look premium
    const urlPattern = /(https?:\/\/[^\s]+)/g;
    const formattedText = text.replace(urlPattern, '<span style="color: #1d9bf0; cursor: pointer;">$1</span>');
    
    DOM.tweetPreviewText.innerHTML = formattedText || '<span style="color: var(--text-muted); font-style: italic;">No content yet...</span>';
}

function copyTweetToClipboard() {
    const text = DOM.tweetTextarea.value;
    if (!text) return;
    
    navigator.clipboard.writeText(text).then(() => {
        // Visual feedback
        const originalContent = DOM.copyTweetBtn.innerHTML;
        DOM.copyTweetBtn.innerHTML = '<i class="fa-solid fa-check" style="color: var(--color-feature);"></i> <span>Copied!</span>';
        DOM.copyTweetBtn.classList.add('btn-primary');
        
        setTimeout(() => {
            DOM.copyTweetBtn.innerHTML = originalContent;
            DOM.copyTweetBtn.classList.remove('btn-primary');
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy text: ', err);
        alert('Could not copy to clipboard. Please select text manually.');
    });
}

function postToTwitter() {
    const text = DOM.tweetTextarea.value;
    if (!text) return;
    
    const encodedText = encodeURIComponent(text);
    const twitterUrl = `https://x.com/intent/tweet?text=${encodedText}`;
    
    window.open(twitterUrl, '_blank', 'width=550,height=420,scrollbars=yes,resizable=yes');
}

// ==========================================================================
// UTILITY FUNCTIONS
// ==========================================================================
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function formatTime(date) {
    let hours = date.getHours();
    let minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // 12 instead of 0
    minutes = minutes < 10 ? '0' + minutes : minutes;
    
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[date.getMonth()];
    const day = date.getDate();
    
    return `${month} ${day}, ${hours}:${minutes} ${ampm}`;
}

// Copy single release note plain text to clipboard
function copyCardToClipboard(update, btnElement) {
    const copyText = `[BigQuery ${update.type}] (${update.date})\n\n${update.text}\n\nRead more details: ${update.link || FEED_URL}`;
    
    navigator.clipboard.writeText(copyText).then(() => {
        // Visual feedback
        const originalContent = btnElement.innerHTML;
        btnElement.innerHTML = '<i class="fa-solid fa-check" style="color: var(--color-feature);"></i> <span>Copied!</span>';
        btnElement.classList.add('copied-glow');
        
        setTimeout(() => {
            btnElement.innerHTML = originalContent;
            btnElement.classList.remove('copied-glow');
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy card to clipboard:', err);
        alert('Failed to copy to clipboard.');
    });
}

// Export the currently filtered release notes to a CSV file
function exportToCSV() {
    if (filteredUpdates.length === 0) {
        alert('No updates match the current search/filters to export.');
        return;
    }
    
    // CSV Header row
    const headers = ['Date', 'Type', 'Description', 'Link'];
    
    // Map entries to array of cells, escaping double quotes for CSV safety
    const rows = filteredUpdates.map(update => {
        const cleanDesc = update.text.replace(/"/g, '""');
        return [
            update.date,
            update.type,
            cleanDesc,
            update.link || FEED_URL
        ];
    });
    
    // Join header and rows wrapped in quotes
    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\r\n');
    
    // Create download trigger
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    const timestamp = new Date().toISOString().slice(0, 10);
    const filterSuffix = currentFilterType !== 'all' ? `_${currentFilterType.replace(' ', '_').toLowerCase()}` : '';
    const searchSuffix = currentSearchQuery ? `_filtered` : '';
    
    link.setAttribute('href', url);
    link.setAttribute('download', `bigquery_release_notes_${timestamp}${filterSuffix}${searchSuffix}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
