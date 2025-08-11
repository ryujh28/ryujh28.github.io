#!/usr/bin/env python3
"""
Flexible Publications Updater
Shows cover images only when available, otherwise clean text-only layout
"""

import re
from pathlib import Path

class FlexiblePublicationsUpdater:
    def __init__(self):
        self.covers_dir = Path("covers")
        self.covers_dir.mkdir(exist_ok=True)
        
        # Simple mapping for journal names to cover filenames
        self.cover_mapping = {
            'Journal of Chemical Information and Modeling': 'JCIM.png',
            'arXiv preprint': 'arxiv_cover.jpg',
            'Science Advances': 'science_advances_cover.jpg',
            'Journal of Molecular Liquids': 'molecular_liquids_cover.jpg',
            'Small': 'small_cover.jpg',
            'The Journal of Physical Chemistry C': 'jpcc_cover.jpg'
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
    
    def get_cover_filename(self, journal_name):
        """Get cover filename for journal if it exists"""
        # Check if we have a mapping
        if journal_name in self.cover_mapping:
            cover_file = self.cover_mapping[journal_name]
            cover_path = self.covers_dir / cover_file
            
            if cover_path.exists():
                return cover_file
        
        # Look for any cover file that might match
        safe_name = re.sub(r'[^a-zA-Z0-9]', '_', journal_name.lower())
        possible_names = [
            f"{safe_name}_cover.jpg",
            f"{safe_name}.jpg",
            f"{journal_name.lower().replace(' ', '_')}_cover.jpg"
        ]
        
        for name in possible_names:
            if (self.covers_dir / name).exists():
                return name
        
        return None  # No cover found
    
    def generate_publication_html(self, publications):
        """Generate HTML for publications with flexible layout"""
        html_parts = []
        
        for pub in publications:
            citation = pub['citation'].replace('Ryu, J. H.', '<strong>Ryu, J. H.</strong>')
            journal = pub['journal']
            doi_url = pub['doi_url']
            cover_file = self.get_cover_filename(journal)
            
            # Generate HTML based on whether cover exists
            if cover_file:
                # With cover - use flex layout
                html = f'''                        <li class="publication-item has-cover">
                            <img src="covers/{cover_file}" alt="Journal Cover" class="publication-cover">
                            <div class="publication-content">
                                <div class="publication-title">
                                    {citation}
                                </div>
                                <div class="publication-journal">{journal}</div>
                                <a href="{doi_url}" target="_blank" class="publication-link">
                                    <svg width="16" height="16" fill="currentColor" viewBox="0 0 20 20">
                                        <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z"></path>
                                        <path d="M5 5a2 2 0 00-2 2v6a2 2 0 002 2h6a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z"></path>
                                    </svg>
                                    View Article
                                </a>
                            </div>
                        </li>'''
            else:
                # Without cover - simple text layout
                html = f'''                        <li class="publication-item">
                            <div class="publication-content">
                                <div class="publication-title">
                                    {citation}
                                </div>
                                <div class="publication-journal">{journal}</div>
                                <a href="{doi_url}" target="_blank" class="publication-link">
                                    <svg width="16" height="16" fill="currentColor" viewBox="0 0 20 20">
                                        <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z"></path>
                                        <path d="M5 5a2 2 0 00-2 2v6a2 2 0 002 2h6a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z"></path>
                                    </svg>
                                    View Article
                                </a>
                            </div>
                        </li>'''
            
            html_parts.append(html)
        
        return '\n'.join(html_parts)
    
    def create_new_css(self):
        """Create new CSS for flexible layout"""
        css = '''        .publication-item {
            background: white;
            padding: 1.5rem;
            border-radius: 12px;
            box-shadow: var(--shadow);
            margin-bottom: 1.5rem;
            transition: transform 0.2s ease, box-shadow 0.2s ease;
            border-left: 4px solid var(--accent-color);
        }
        
        .publication-item:hover {
            transform: translateY(-2px);
            box-shadow: var(--shadow-lg);
        }
        
        /* Layout with cover image */
        .publication-item.has-cover {
            display: flex;
            gap: 1rem;
        }
        
        .publication-cover {
            flex-shrink: 0;
            width: 80px;
            height: 100px;
            border-radius: 8px;
            object-fit: cover;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            transition: transform 0.2s ease;
        }
        
        .publication-cover:hover {
            transform: scale(1.05);
        }
        
        /* Content area - flexible for with/without cover */
        .publication-content {
            flex: 1;
        }'''
        return css
    
    def update_css_in_html(self, content):
        """Update CSS in HTML content"""
        new_css = self.create_new_css()
        
        # Find and replace the publication-item CSS section
        pattern = r'(\.publication-item\s*\{[^}]*\}.*?\.publication-content\s*\{\s*flex:\s*1;\s*\})'
        
        # Try to find and replace
        match = re.search(pattern, content, re.DOTALL)
        if match:
            updated_content = content[:match.start()] + new_css + content[match.end():]
            return updated_content
        
        return content  # Return unchanged if pattern not found
    
    def update_website(self, html_file="index.html"):
        """Update website with flexible publications layout"""
        try:
            # Read current HTML
            with open(html_file, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # Parse publications
            publications = self.parse_publications_file()
            
            if not publications:
                print("❌ No publications to update")
                return False
            
            # Generate new HTML
            new_html = self.generate_publication_html(publications)
            
            # Update CSS first
            content = self.update_css_in_html(content)
            
            # Find and replace publications section
            pattern = r'(<ul class="publications-list">)(.*?)(</ul>)'
            match = re.search(pattern, content, re.DOTALL)
            
            if match:
                updated_content = (content[:match.start()] + 
                                 match.group(1) + '\n' + new_html + '\n                    ' + 
                                 match.group(3) + content[match.end():])
                
                # Write updated HTML
                with open(html_file, 'w', encoding='utf-8') as f:
                    f.write(updated_content)
                
                print(f"✅ Updated {html_file} with {len(publications)} publications")
                
                # Show which publications have covers
                for pub in publications:
                    cover_file = self.get_cover_filename(pub['journal'])
                    status = "🖼️  With cover" if cover_file else "📄 Text only"
                    print(f"   {status}: {pub['journal']}")
                
                return True
            else:
                print("❌ Could not find publications section in HTML")
                return False
                
        except Exception as e:
            print(f"❌ Error updating website: {e}")
            return False
    
    def show_status(self):
        """Show current cover status"""
        print("\n📁 Cover Status:")
        print("=" * 40)
        
        for journal, filename in self.cover_mapping.items():
            cover_exists = "✅" if (self.covers_dir / filename).exists() else "❌"
            print(f"   {cover_exists} {filename} - {journal}")

if __name__ == "__main__":
    updater = FlexiblePublicationsUpdater()
    
    print("📚 Flexible Publications Updater")
    print("=" * 40)
    
    # Show current cover status
    updater.show_status()
    
    # Update website
    success = updater.update_website()
    
    if success:
        print("\n🎉 Website updated successfully!")
        print("💡 Publications with covers show images, others show clean text layout")
    else:
        print("\n❌ Update failed")