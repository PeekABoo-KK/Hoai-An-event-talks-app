import sys
import os

# Ensure we can load app
sys.path.append(os.path.abspath(os.path.dirname(__file__)))

try:
    from app import fetch_and_parse_feed
    print("Successfully imported app.py")
    
    print("Fetching and parsing release notes feed...")
    updates = fetch_and_parse_feed()
    print(f"Success! Fetched {len(updates)} individual updates.")
    
    if updates:
        print("\nSample parsed update:")
        print(f"ID: {updates[0]['id']}")
        print(f"Date: {updates[0]['date']}")
        print(f"Type: {updates[0]['type']}")
        print(f"Text Preview: {updates[0]['text'][:150]}...")
        print(f"Link: {updates[0]['link']}")
    else:
        print("Warning: No updates returned from the parser.")
        
except Exception as e:
    print(f"Error during verification: {e}")
    sys.exit(1)
