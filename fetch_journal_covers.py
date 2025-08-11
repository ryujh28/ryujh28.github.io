#!/usr/bin/env python3
"""
Journal Cover Fetcher
A script to help fetch journal cover images for publications.
Since many journals block automated access, this script provides
guidance on manually obtaining cover images.
"""

import requests
import json
from urllib.parse import urlparse
from pathlib import Path

class JournalCoverFetcher:
    def __init__(self):
        self.covers_dir = Path("journal_covers")
        self.covers_dir.mkdir(exist_ok=True)
        
        # Known journal cover URLs (these may change)
        self.journal_cover_urls = {
            "Science Advances": "https://www.science.org/pb-assets/images/journals/sciadv-cover-1676562127488.jpg",
            "Journal of Chemical Information and Modeling": "https://pubs.acs.org/cms/10.1021/jcim.2022.1004.cover/asset/jcim.2022.1004.cover.jpg",
            "Journal of Molecular Liquids": "https://ars.els-cdn.com/content/image/1-s2.0-S0167732224X00032-cov150h.gif",
            "Small": "https://onlinelibrary.wiley.com/pb-assets/hub-assets/onlinelibrary/journal-cover-images/15213099-1671528399035.jpg",
            "The Journal of Physical Chemistry C": "https://pubs.acs.org/cms/10.1021/jp.2023.127.c23.cover/asset/jp.2023.127.c23.cover.jpg"
        }
    
    def fetch_cover(self, journal_name, url=None):
        """Fetch journal cover image"""
        if url is None:
            url = self.journal_cover_urls.get(journal_name)
        
        if not url:
            print(f"No URL found for {journal_name}")
            return None
        
        try:
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
            response = requests.get(url, headers=headers, timeout=10)
            
            if response.status_code == 200:
                filename = f"{journal_name.lower().replace(' ', '_')}_cover.jpg"
                filepath = self.covers_dir / filename
                
                with open(filepath, 'wb') as f:
                    f.write(response.content)
                
                print(f"✅ Successfully downloaded cover for {journal_name}")
                return filepath
            else:
                print(f"❌ Failed to fetch {journal_name}: {response.status_code}")
                return None
                
        except Exception as e:
            print(f"❌ Error fetching {journal_name}: {e}")
            return None
    
    def fetch_all_covers(self):
        """Fetch all journal covers"""
        results = {}
        for journal_name in self.journal_cover_urls:
            result = self.fetch_cover(journal_name)
            results[journal_name] = str(result) if result else None
        return results
    
    def print_manual_instructions(self):
        """Print instructions for manually obtaining covers"""
        print("\n📋 Manual Journal Cover Fetching Instructions:")
        print("=" * 50)
        
        journals = [
            ("Science Advances", "https://www.science.org/journal/sciadv"),
            ("Journal of Chemical Information and Modeling", "https://pubs.acs.org/journal/jcisd8"),
            ("Journal of Molecular Liquids", "https://www.sciencedirect.com/journal/journal-of-molecular-liquids"),
            ("Small", "https://onlinelibrary.wiley.com/journal/16136829"),
            ("The Journal of Physical Chemistry C", "https://pubs.acs.org/journal/jpccck")
        ]
        
        for journal, url in journals:
            print(f"\n🔗 {journal}:")
            print(f"   Visit: {url}")
            print(f"   1. Right-click on the journal cover image")
            print(f"   2. Select 'Save image as...'")
            print(f"   3. Save as: {journal.lower().replace(' ', '_')}_cover.jpg")
            print(f"   4. Place in the journal_covers/ directory")

if __name__ == "__main__":
    fetcher = JournalCoverFetcher()
    
    print("🔍 Attempting to fetch journal covers...")
    results = fetcher.fetch_all_covers()
    
    print("\n📊 Results:")
    for journal, result in results.items():
        status = "✅ Downloaded" if result else "❌ Failed"
        print(f"   {journal}: {status}")
    
    print("\n" + "="*50)
    fetcher.print_manual_instructions()