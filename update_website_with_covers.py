#!/usr/bin/env python3
"""
Website Updater with Journal Covers
Automatically updates your website when new publications are added
"""

import json
import re
from pathlib import Path
from auto_journal_covers import AutoJournalCoverGenerator

class WebsiteUpdater:
    def __init__(self):
        self.generator = AutoJournalCoverGenerator()
        
    def update_publications_from_file(self, publications_file="publications_list.txt", html_file="index.html"):
        """Update website with new publications from publications_list.txt"""
        
        # Generate covers for new publications
        print("🎨 Generating journal covers...")
        covers = self.generator.generate_all_covers()
        
        # Parse publications
        publications = self.generator.parse_publications_file(publications_file)
        
        if not publications:
            print("❌ No publications found in file")
            return
        
        # Read current HTML
        try:
            with open(html_file, 'r', encoding='utf-8') as f:
                html_content = f.read()
        except FileNotFoundError:
            print(f"❌ HTML file {html_file} not found")
            return
        
        # Generate HTML for new publications
        new_publications_html = self.generate_publications_html(publications, covers)
        
        # Find and replace publications section
        pattern = r'(<ul class="publications-list">)(.*?)(</ul>)'
        match = re.search(pattern, html_content, re.DOTALL)
        
        if match:
            updated_content = html_content[:match.start()] + \
                            match.group(1) + new_publications_html + \
                            match.group(3) + html_content[match.end():]
            
            # Write updated HTML
            with open(html_file, 'w', encoding='utf-8') as f:
                f.write(updated_content)
            
            print(f"✅ Updated {html_file} with {len(publications)} publications")
        else:
            print("❌ Could not find publications section in HTML")
    
    def generate_publications_html(self, publications, covers):
        """Generate HTML for publications with covers"""
        html_parts = []
        
        # Create simple mapping for covers
        cover_mapping = {
            "Journal of Chemical Information and Modeling": "journal_of_chemical_information_and_modeling_cover.jpg",
            "arXiv preprint": "arxiv_preprint_cover.jpg",
            "Science Advances": "science_advances__10_50___eadp9662_cover.jpg",
            "Journal of Molecular Liquids": "journal_of_molecular_liquids__397__124054_cover.jpg", 
            "Small": "small__2311052_cover.jpg",
            "The Journal of Physical Chemistry C": "the_journal_of_physical_chemistry_c__127_46___22447_22456_cover.jpg"
        }
        
        for pub in publications:
            journal = pub['journal']
            citation = pub['citation']
            doi_url = pub['doi_url'] or "#"
            
            # Find matching cover
            cover_file = cover_mapping.get(journal, "default_cover.jpg")
            
            # Extract author names and make Ryu, J. H. bold
            formatted_citation = citation.replace("Ryu, J. H.", "<strong>Ryu, J. H.</strong>")
            
            html = f'''
                        <li class="publication-item">
                            <img src="journal_covers/{cover_file}" alt="Journal Cover" class="publication-cover">
                            <div class="publication-content">
                                <div class="publication-title">
                                    {formatted_citation}
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

if __name__ == "__main__":
    updater = WebsiteUpdater()
    
    print("🔄 Updating website with publications and covers...")
    updater.update_publications_from_file()
    
    print("\n🎉 Website update complete!")
    print("📝 Your website now displays journal covers with publications")
    print("\n💡 To add new publications in the future:")
    print("   1. Add them to publications_list.txt")
    print("   2. Run: python3 update_website_with_covers.py")
    print("   3. The script will automatically generate covers and update your website!")