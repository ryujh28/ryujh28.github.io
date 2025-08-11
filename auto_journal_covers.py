#!/usr/bin/env python3
"""
Automatic Journal Cover Generator
Automatically reads publications and generates/fetches journal covers
"""

import requests
import json
import re
from urllib.parse import urlparse
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import textwrap

class AutoJournalCoverGenerator:
    def __init__(self):
        self.covers_dir = Path("journal_covers")
        self.covers_dir.mkdir(exist_ok=True)
        
        # Journal color schemes for generated covers
        self.journal_colors = {
            "Science Advances": {"bg": "#1f3a93", "text": "#ffffff"},
            "Journal of Chemical Information and Modeling": {"bg": "#0066cc", "text": "#ffffff"},
            "Journal of Molecular Liquids": {"bg": "#ff6b35", "text": "#ffffff"},
            "Small": {"bg": "#009639", "text": "#ffffff"},
            "The Journal of Physical Chemistry C": {"bg": "#dc143c", "text": "#ffffff"},
            "arXiv preprint": {"bg": "#b31b1b", "text": "#ffffff"},
            "default": {"bg": "#2563eb", "text": "#ffffff"}
        }
        
        # Common journal cover image patterns (some may work)
        self.cover_patterns = {
            "Science Advances": [
                "https://www.science.org/cms/asset/*/science-advances-journal-cover.jpg",
                "https://www.science.org/pb-assets/images/journals/sciadv-*"
            ],
            "Journal of Chemical Information and Modeling": [
                "https://pubs.acs.org/cms/*/jcim.*cover*.jpg"
            ]
        }
    
    def parse_publications_file(self, file_path="publications_list.txt"):
        """Parse the publications list file to extract journal names"""
        publications = []
        
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # Extract publications using regex patterns
            pub_pattern = r'#\s*New publication\s*\d+\s*\n([^#]*?)(?=\n#|\Z)'
            matches = re.findall(pub_pattern, content, re.DOTALL)
            
            for match in matches:
                lines = [line.strip() for line in match.split('\n') if line.strip()]
                if len(lines) >= 2:
                    citation = lines[0]
                    doi_url = lines[1] if lines[1].startswith('http') else None
                    
                    # Extract journal name from citation
                    journal = self.extract_journal_name(citation)
                    publications.append({
                        'citation': citation,
                        'journal': journal,
                        'doi_url': doi_url
                    })
        
        except FileNotFoundError:
            print(f"Publications file {file_path} not found")
        
        return publications
    
    def extract_journal_name(self, citation):
        """Extract journal name from citation"""
        # Common patterns for journal names in citations
        patterns = [
            r'\.\s*([^.]+)\s*\.\s*\d+',  # Pattern: . Journal Name . Volume
            r'\.\s*([^.]+)\s*,\s*\d+',   # Pattern: . Journal Name , Volume
            r'\.\s*([^.]+)\s*$',         # Pattern: . Journal Name (at end)
        ]
        
        for pattern in patterns:
            match = re.search(pattern, citation)
            if match:
                journal = match.group(1).strip()
                # Clean up common artifacts
                journal = re.sub(r'\(\d{4}\)', '', journal).strip()
                if journal and len(journal) > 5:  # Basic validation
                    return journal
        
        return "Unknown Journal"
    
    def generate_cover_placeholder(self, journal_name, width=300, height=400):
        """Generate a placeholder cover image for a journal"""
        colors = self.journal_colors.get(journal_name, self.journal_colors["default"])
        
        # Create image
        img = Image.new('RGB', (width, height), colors["bg"])
        draw = ImageDraw.Draw(img)
        
        # Try to load a font, fallback to default
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 24)
            small_font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 16)
        except:
            font = ImageFont.load_default()
            small_font = ImageFont.load_default()
        
        # Wrap text for long journal names
        wrapped_text = textwrap.fill(journal_name, width=20)
        
        # Calculate text position
        text_lines = wrapped_text.split('\n')
        total_height = len(text_lines) * 30
        y_start = (height - total_height) // 2
        
        # Draw text
        for i, line in enumerate(text_lines):
            text_width = draw.textlength(line, font=font)
            x = (width - text_width) // 2
            y = y_start + i * 30
            draw.text((x, y), line, fill=colors["text"], font=font)
        
        # Add "JOURNAL" text at bottom
        journal_text = "JOURNAL"
        journal_width = draw.textlength(journal_text, font=small_font)
        journal_x = (width - journal_width) // 2
        draw.text((journal_x, height - 40), journal_text, fill=colors["text"], font=small_font)
        
        return img
    
    def try_fetch_real_cover(self, journal_name, doi_url=None):
        """Try to fetch real journal cover using various methods"""
        # This is where you could add more sophisticated crawling logic
        # For now, return None to use placeholder
        return None
    
    def generate_all_covers(self):
        """Generate covers for all publications"""
        publications = self.parse_publications_file()
        
        # Also get journals from the current HTML file
        html_journals = self.extract_journals_from_html()
        
        all_journals = set()
        for pub in publications:
            all_journals.add(pub['journal'])
        for journal in html_journals:
            all_journals.add(journal)
        
        generated_covers = {}
        
        for journal in all_journals:
            if journal and journal != "Unknown Journal":
                # Try to fetch real cover first
                cover_path = self.try_fetch_real_cover(journal)
                
                if not cover_path:
                    # Generate placeholder cover
                    cover_img = self.generate_cover_placeholder(journal)
                    safe_name = re.sub(r'[^a-zA-Z0-9_]', '_', journal.lower())
                    cover_path = self.covers_dir / f"{safe_name}_cover.jpg"
                    cover_img.save(cover_path, 'JPEG', quality=90)
                    print(f"✅ Generated placeholder cover for: {journal}")
                
                generated_covers[journal] = str(cover_path.name)
        
        # Save mapping to JSON file
        with open('journal_covers_mapping.json', 'w') as f:
            json.dump(generated_covers, f, indent=2)
        
        return generated_covers
    
    def extract_journals_from_html(self):
        """Extract journal names from current HTML file"""
        journals = []
        try:
            with open('index.html', 'r', encoding='utf-8') as f:
                content = f.read()
            
            # Find publication journals in HTML
            pattern = r'<div class="publication-journal">([^<]+)</div>'
            matches = re.findall(pattern, content)
            journals.extend(matches)
            
        except FileNotFoundError:
            pass
        
        return journals

if __name__ == "__main__":
    generator = AutoJournalCoverGenerator()
    
    print("🎨 Generating journal covers...")
    covers = generator.generate_all_covers()
    
    print(f"\n📊 Generated {len(covers)} covers:")
    for journal, filename in covers.items():
        print(f"   {journal}: {filename}")
    
    print(f"\n💾 Cover mapping saved to: journal_covers_mapping.json")
    print(f"📁 Cover images saved to: journal_covers/")
    print("\n✨ You can now update your website to display these covers!")