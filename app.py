import os
import time
import ssl
import logging
import urllib.request
import xml.etree.ElementTree as ET
from bs4 import BeautifulSoup
from flask import Flask, jsonify, render_template, request

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__)

FEED_URL = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"
CACHE_DURATION = 600  # Cache for 10 minutes (600 seconds)

# In-memory cache for parsed release notes
cache = {
    "data": None,
    "last_updated": 0
}

def fetch_and_parse_feed():
    logger.info("Fetching release notes feed from: %s", FEED_URL)
    
    # Bypass SSL issues if present
    ssl_context = ssl._create_unverified_context()
    
    try:
        req = urllib.request.Request(
            FEED_URL, 
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
        )
        with urllib.request.urlopen(req, context=ssl_context, timeout=15) as response:
            xml_data = response.read()
    except Exception as e:
        logger.error("Error downloading feed: %s", e)
        raise Exception(f"Failed to download feed: {str(e)}")
        
    try:
        # Parse XML
        # Atom namespaces mapping
        namespaces = {
            'atom': 'http://www.w3.org/2005/Atom'
        }
        
        root = ET.fromstring(xml_data)
        entries = root.findall('atom:entry', namespaces)
        
        parsed_updates = []
        
        for entry in entries:
            # Get common entry properties
            date_title = entry.find('atom:title', namespaces)
            date_title = date_title.text.strip() if date_title is not None else "Unknown Date"
            
            updated_time = entry.find('atom:updated', namespaces)
            updated_time = updated_time.text.strip() if updated_time is not None else ""
            
            entry_id = entry.find('atom:id', namespaces)
            entry_id = entry_id.text.strip() if entry_id is not None else ""
            
            # Find alternate link
            link_url = ""
            for l in entry.findall('atom:link', namespaces):
                if l.attrib.get('rel') == 'alternate' or not l.attrib.get('rel'):
                    link_url = l.attrib.get('href', '')
                    break
            
            content_elem = entry.find('atom:content', namespaces)
            content_html = content_elem.text if content_elem is not None else ""
            
            if not content_html:
                continue
                
            # Parse HTML content with BeautifulSoup to segment by <h3> headings
            soup = BeautifulSoup(content_html, 'html.parser')
            h3_tags = soup.find_all('h3')
            
            if not h3_tags:
                # If there are no <h3> tags, parse the entire content block as one update
                text_content = soup.get_text(separator=' ', strip=True)
                item_id = f"{entry_id}_0" if entry_id else str(hash(text_content))
                parsed_updates.append({
                    "id": item_id,
                    "date": date_title,
                    "updated_time": updated_time,
                    "type": "Update",
                    "html": content_html,
                    "text": text_content,
                    "link": link_url
                })
            else:
                for idx, h3 in enumerate(h3_tags):
                    update_type = h3.get_text(strip=True)
                    
                    # Gather all following sibling elements until the next h3
                    siblings = []
                    sibling = h3.next_sibling
                    while sibling and sibling.name != 'h3':
                        siblings.append(sibling)
                        sibling = sibling.next_sibling
                    
                    # Construct description HTML for this specific segment
                    segment_soup = BeautifulSoup("", 'html.parser')
                    for sib in siblings:
                        segment_soup.append(BeautifulSoup(str(sib), 'html.parser'))
                    
                    segment_html = str(segment_soup).strip()
                    segment_text = segment_soup.get_text(separator=' ', strip=True)
                    
                    # Make a unique ID for this update
                    item_id = f"{entry_id}_{idx}" if entry_id else f"{date_title.replace(' ', '_')}_{idx}"
                    
                    parsed_updates.append({
                        "id": item_id,
                        "date": date_title,
                        "updated_time": updated_time,
                        "type": update_type,
                        "html": segment_html,
                        "text": segment_text,
                        "link": link_url
                    })
                    
        logger.info("Successfully parsed %d individual updates", len(parsed_updates))
        return parsed_updates
        
    except Exception as e:
        logger.error("Error parsing feed XML: %s", e)
        raise Exception(f"Failed to parse feed data: {str(e)}")

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/releases')
def api_releases():
    force_refresh = request.args.get('refresh', 'false').lower() == 'true'
    now = time.time()
    
    if force_refresh or not cache['data'] or (now - cache['last_updated'] > CACHE_DURATION):
        try:
            updates = fetch_and_parse_feed()
            cache['data'] = updates
            cache['last_updated'] = now
            status = "fresh"
        except Exception as e:
            # If fetch fails but we have cached data, return cached data with an warning
            if cache['data']:
                logger.warning("Fetch failed, returning cached data. Error: %s", e)
                return jsonify({
                    "status": "cached_error",
                    "error": str(e),
                    "last_updated": cache['last_updated'],
                    "updates": cache['data']
                })
            else:
                return jsonify({
                    "status": "error",
                    "error": str(e)
                }), 500
    else:
        status = "cached"
        
    return jsonify({
        "status": status,
        "last_updated": cache['last_updated'],
        "updates": cache['data']
    })

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000, debug=True)
