#!/usr/bin/env python3
import json

# Create a simpler mapping for the website
simple_mapping = {
    "Journal of Chemical Information and Modeling": "journal_of_chemical_information_and_modeling_cover.jpg",
    "arXiv preprint": "arxiv_preprint_cover.jpg", 
    "Science Advances": "science_advances__10_50___eadp9662_cover.jpg",
    "Journal of Molecular Liquids": "journal_of_molecular_liquids__397__124054_cover.jpg",
    "Small": "small__2311052_cover.jpg",
    "The Journal of Physical Chemistry C": "the_journal_of_physical_chemistry_c__127_46___22447_22456_cover.jpg"
}

with open('journal_covers_simple.json', 'w') as f:
    json.dump(simple_mapping, f, indent=2)

print("✅ Created simple mapping file: journal_covers_simple.json")