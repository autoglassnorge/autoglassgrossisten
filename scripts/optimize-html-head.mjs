#!/usr/bin/env node
/**
 * Adds performance <head> tags to all root HTML files:
 * - Anti-FOUC theme script
 * - Preconnect to API domain
 * - DNS prefetch for external resources
 */

import fs from 'fs';
import path from 'path';

const THEME_SCRIPT = `<script>(function(){var t=localStorage.getItem('ag-theme'),d=window.matchMedia('(prefers-color-scheme: dark)').matches;if(t==='dark'||(!t&&d))document.documentElement.setAttribute('data-theme','dark');})();</script>`;

const PRECONNECT_TAGS = `
<link rel="preconnect" href="https://autoglass-glass-sok.autoglassnorge.workers.dev">
<link rel="dns-prefetch" href="https://fonts.googleapis.com">
<link rel="dns-prefetch" href="https://fonts.gstatic.com">
`;

const files = fs.readdirSync('.').filter(f => f.endsWith('.html'));

for (const file of files) {
  let html = fs.readFileSync(file, 'utf-8');

  // Skip if already patched
  if (html.includes('ag-theme','dark') && html.includes('autoglass-glass-sok.autoglassnorge.workers.dev')) {
    console.log(`SKIP ${file} (already patched)`);
    continue;
  }

  // Insert theme script right after <head> or <head\n>
  if (!html.includes(THEME_SCRIPT.trim().slice(0, 40))) {
    html = html.replace(/<head>\s*\n?/i, match => match + THEME_SCRIPT + '\n');
  }

  // Insert preconnect tags before first stylesheet or before </head>
  if (!html.includes('autoglass-glass-sok.autoglassnorge.workers.dev')) {
    if (html.includes('<link rel="stylesheet"')) {
      html = html.replace(/<link rel="stylesheet"/, PRECONNECT_TAGS.trim() + '\n' + '<link rel="stylesheet"');
    } else {
      html = html.replace(/<\/head>/i, PRECONNECT_TAGS.trim() + '\n' + '</head>');
    }
  }

  fs.writeFileSync(file, html);
  console.log(`PATCHED ${file}`);
}
