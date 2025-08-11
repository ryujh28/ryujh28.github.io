#!/usr/bin/env python3
"""
Simple and safe publications updater
Only updates the publications list, keeps everything else intact
"""

import re
from pathlib import Path

class SimplePublicationsUpdater:
    def __init__(self):
        self.covers_dir = Path("covers")
        self.covers_dir.mkdir(exist_ok=True)
        
        # Mapping for available covers
        self.cover_mapping = {
            'Journal of Chemical Information and Modeling': 'JCIM.png',
        }
    
    def parse_publications_file(self, filepath="publications_list.txt"):
        """Parse publications from publications_list.txt"""
        publications = []
        
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # Split by publication headers
            sections = re.split(r'#\s*New publication\s*\d+', content)[1:]
            
            for section in sections:
                lines = [line.strip() for line in section.split('\n') if line.strip()]
                if len(lines) >= 2:
                    citation = lines[0]
                    doi_url = lines[1] if lines[1].startswith('http') else None
                    
                    # Extract journal name from citation
                    journal = self.extract_journal_name(citation)
                    
                    publications.append({
                        'citation': citation,
                        'journal': journal,
                        'doi_url': doi_url or '#'
                    })
                    
        except FileNotFoundError:
            print("❌ publications_list.txt not found")
        except Exception as e:
            print(f"❌ Error parsing: {e}")
        
        return publications
    
    def extract_journal_name(self, citation):
        """Extract journal name from citation"""
        # Look for journal patterns
        patterns = [
            r'\.\s*([^.]+)\.\s*$',  # Pattern: . Journal Name .
            r'\.\s*([^.]+),\s*\d+',  # Pattern: . Journal Name , Volume
            r'\.\s*([^.]+)\s*\d+',   # Pattern: . Journal Name Volume
        ]
        
        for pattern in patterns:
            match = re.search(pattern, citation)
            if match:
                journal = match.group(1).strip()
                # Clean up
                journal = re.sub(r'\(\d{4}\)', '', journal).strip()
                if journal and len(journal) > 3:
                    return journal
        
        # Fallback patterns
        if 'arXiv' in citation or 'arxiv' in citation:
            return 'arXiv preprint'
        
        return 'Unknown Journal'
    
    def has_cover(self, journal_name):
        """Check if journal has a cover available"""
        if journal_name in self.cover_mapping:
            cover_file = self.cover_mapping[journal_name]
            return (self.covers_dir / cover_file).exists()
        return False
    
    def get_cover_filename(self, journal_name):
        """Get cover filename if available"""
        if self.has_cover(journal_name):
            return self.cover_mapping[journal_name]
        return None
    
    def generate_publication_li(self, pub):
        """Generate a single publication <li> element"""
        citation = pub['citation'].replace('Ryu, J. H.', '<strong>Ryu, J. H.</strong>')
        journal = pub['journal']
        doi_url = pub['doi_url']
        cover_file = self.get_cover_filename(journal)
        
        if cover_file:
            # With cover - flex layout
            html = f'''                        <li style="background: white; padding: 1.5rem; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); margin-bottom: 1.5rem; border-left: 4px solid #3b82f6; display: flex; gap: 1rem;">
                            <img src="covers/{cover_file}" alt="Journal Cover" style="flex-shrink: 0; width: 80px; height: 100px; border-radius: 8px; object-fit: cover; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                            <div style="flex: 1;">
                                <div style="font-weight: 500; line-height: 1.5; margin-bottom: 0.5rem;">
                                    {citation}
                                </div>
                                <div style="color: #6b7280; font-style: italic; margin-bottom: 0.5rem;">{journal}</div>
                                <a href="{doi_url}" target="_blank" style="color: #3b82f6; text-decoration: none; font-weight: 500;">Read More</a>
                            </div>
                        </li>'''
        else:
            # Without cover - simple layout
            html = f'''                        <li style="background: white; padding: 1.5rem; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); margin-bottom: 1.5rem; border-left: 4px solid #3b82f6;">
                            <div style="font-weight: 500; line-height: 1.5; margin-bottom: 0.5rem;">
                                {citation}
                            </div>
                            <div style="color: #6b7280; font-style: italic; margin-bottom: 0.5rem;">{journal}</div>
                            <a href="{doi_url}" target="_blank" style="color: #3b82f6; text-decoration: none; font-weight: 500;">Read More</a>
                        </li>'''
        
        return html
    
    def update_publications(self, html_file="index.html"):
        """Update only the publications section"""
        try:
            # Read current HTML
            with open(html_file, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # Parse publications
            publications = self.parse_publications_file()
            if not publications:
                print("❌ No publications to update")
                return False
            
            # Generate new publication HTML
            pub_htmls = []
            for pub in publications:
                pub_htmls.append(self.generate_publication_li(pub))
            
            new_publications_html = '\n'.join(pub_htmls)
            
            # Find and replace just the <li> elements inside publications <ul>
            pattern = r'(<div class="publications">.*?<ul>)(.*?)(</ul>.*?</div>)'
            match = re.search(pattern, content, re.DOTALL)
            
            if match:
                updated_content = (content[:match.start()] + 
                                 match.group(1) + '\n' + new_publications_html + '\n                    ' + 
                                 match.group(3) + content[match.end():])
                
                # Write updated HTML
                with open(html_file, 'w', encoding='utf-8') as f:
                    f.write(updated_content)
                
                print(f"✅ Updated {len(publications)} publications:")
                for pub in publications:
                    cover_status = "🖼️" if self.has_cover(pub['journal']) else "📄"
                    print(f"   {cover_status} {pub['journal']}")
                
                return True
            else:
                print("❌ Could not find publications section")
                return False
                
        except Exception as e:
            print(f"❌ Error: {e}")
            return False

if __name__ == "__main__":
    updater = SimplePublicationsUpdater()
    
    print("📚 Simple Publications Updater")
    print("=" * 40)
    
    # Show available covers
    print("\n📁 Available covers:")
    for journal, filename in updater.cover_mapping.items():
        exists = (updater.covers_dir / filename).exists()
        status = "✅" if exists else "❌"
        print(f"   {status} {journal}: {filename}")
    
    # Update
    success = updater.update_publications()
    
    if success:
        print(f"\n🎉 Publications updated successfully!")
    else:
        print(f"\n❌ Update failed")