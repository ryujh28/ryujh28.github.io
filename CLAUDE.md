# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a personal academic homepage for Jae Hyun Ryu, hosted on GitHub Pages. The site is a single-page static HTML website showcasing academic profile, publications, and contact information.

## Architecture

- **Single file structure**: The entire website is contained in `index.html` with embedded CSS
- **Static assets**: Profile photos (`Photo1.jpg`, `Photo.jpg`, `figure_1.jpg`) are referenced directly
- **Layout**: Two-column responsive design with left sidebar for profile info and right section for about/publications
- **External links**: Integration with Google Scholar, ResearchGate, and ORCID profiles

## Development

Since this is a static HTML site, no build process or package management is required. Changes can be made directly to:

- `index.html` - Main website content and styling
- Image files - Profile photos and figures

## Deployment

The site is automatically deployed via GitHub Pages when changes are pushed to the main branch. The repository follows the standard GitHub Pages naming convention (`username.github.io`).

## Content Updates

When updating publications or personal information:
- Publications are listed in the `.publications` section as `<li>` elements
- Profile information is in the `.left-column` section
- Academic links (Scholar, ResearchGate, ORCID) are in the links section with SVG icons

## Styling Notes

The CSS uses a flex-based layout with:
- Left column (profile): 25% width, centered content
- Right column: 75% width, split into top (33%) and bottom (67%) sections
- Color scheme: Light background (#f4f4f9), dark text (#0F0F0F), accent purple (#6c63ff)