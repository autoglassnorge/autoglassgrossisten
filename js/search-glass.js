/* ============================================================
   Autoglass AS — Glass Search Component (reusable)
   ============================================================ */

const API_BASE = '';  // Same domain — Worker serves both static files and API

class GlassSearch {
  constructor(options = {}) {
    this.container = typeof options.container === 'string'
      ? document.querySelector(options.container)
      : options.container;
    this.inputSelector = options.inputSelector || '.glass-search-input';
    this.resultsSelector = options.resultsSelector || '.glass-search-results';
    this.typeSelector = options.typeSelector || 'input[name="glass-type"]';
    this.onResult = options.onResult || null;
    this.mode = options.mode || 'full'; // 'full' | 'compact' | 'inline'
    this.showImages = options.showImages !== false;
    this.showNags = options.showNags !== false;
    this.showPrice = options.showPrice !== false;
    this.limit = options.limit || 10;

    this.inputEl = this.container.querySelector(this.inputSelector);
    this.resultsEl = this.container.querySelector(this.resultsSelector);

    this.init();
  }

  init() {
    if (!this.inputEl) return;

    // Enter key
    this.inputEl.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.search();
    });

    // Optional: debounced live search
    if (this.mode === 'inline') {
      let debounce;
      this.inputEl.addEventListener('input', () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => this.search(), 400);
      });
    }

    // Type pills
    this.container.querySelectorAll('.type-pill input').forEach(radio => {
      radio.addEventListener('change', () => {
        this.container.querySelectorAll('.type-pill').forEach(p => p.classList.remove('active'));
        radio.closest('.type-pill').classList.add('active');
      });
    });
  }

  getSelectedType() {
    const checked = this.container.querySelector(`${this.typeSelector}:checked`);
    return checked ? checked.value : '';
  }

  async search(queryOverride) {
    const query = (queryOverride || this.inputEl.value).trim().toUpperCase();
    if (!query) return;

    this.setLoading(true);

    const type = this.getSelectedType();
    const typeParam = type ? `&type=${encodeURIComponent(type)}` : '';

    try {
      const res = await fetch(
        `${API_BASE}/api/glass?regnr=${encodeURIComponent(query)}${typeParam}`,
        { headers: { 'Accept': 'application/json' } }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Kunne ikke søke. Prøv igjen.' }));
        this.renderError(err.error || 'Kunne ikke søke. Prøv igjen.');
        return;
      }

      const data = await res.json();
      this.render(data);
      if (this.onResult) this.onResult(data);
    } catch (e) {
      this.renderError('Nettverksfeil. Sjekk tilkoblingen og prøv igjen.');
    } finally {
      this.setLoading(false);
    }
  }

  setLoading(isLoading) {
    const btn = this.container.querySelector('.search-btn');
    if (btn) {
      btn.disabled = isLoading;
      btn.textContent = isLoading ? 'Søker…' : 'Søk';
    }
    if (isLoading && this.resultsEl) {
      this.resultsEl.innerHTML = `<p class="loading">Søker…</p>`;
    }
  }

  renderError(msg) {
    if (!this.resultsEl) return;
    this.resultsEl.innerHTML = `<p class="no-result">${msg}</p>`;
  }

  render(data) {
    if (!this.resultsEl) return;

    if (data.error || !data.candidates || data.candidates.length === 0) {
      this.resultsEl.innerHTML = `<p class="no-result">Ingen treff. Prøv et annet registreringsnummer.</p>`;
      return;
    }

    const v = data.vehicle || {};
    const flags = data.flags || {};
    const layerLabels = ['', 'Eksakt match', 'År + merke', 'Merke', 'Prefix4'];
    const layerLabel = layerLabels[data.layer || 0] || 'Statistisk match';

    let html = '';

    // Vehicle banner (only in full mode)
    if (this.mode === 'full') {
      html += this.renderVehicleBanner(v, flags);
    }

    html += `<div class="results-list">`;

    const candidates = data.candidates.slice(0, this.limit);
    candidates.forEach((c, idx) => {
      html += this.renderCard(c, idx, data.confidence, layerLabel);
    });

    html += '</div>';
    this.resultsEl.innerHTML = html;
  }

  renderVehicleBanner(v, flags) {
    const flagHtml = [
      { key: 'adas', label: 'ADAS' },
      { key: 'rainSensor', label: 'Regnsensor' },
      { key: 'heated', label: 'Oppvarmet' },
      { key: 'acoustic', label: 'Akustisk' },
      { key: 'antenna', label: 'Antenne' },
      { key: 'hud', label: 'HUD' },
    ].map(f => `<span class="flag ${flags[f.key] ? 'on' : 'off'}">${f.label} ${flags[f.key] ? '✓' : '✗'}</span>`).join('');

    return `
      <div class="vehicle-banner">
        <h3>🚗 ${v.make || '?'} ${v.model || '?'} ${v.year ? '(' + v.year + ')' : ''}</h3>
        <p class="meta">Reg.nr: ${v.regnr || '-'} · VIN: ${(v.vin || '-').slice(0, 8)}…${(v.vin || '-').slice(-4)} · kType: ${v.kType || '-'}</p>
        <div class="flags">${flagHtml}</div>
      </div>
    `;
  }

  renderCard(c, idx, confidence, layerLabel) {
    const isTop = idx === 0;
    const confClass = confidence || 'medium';
    const confLabel = confClass === 'high' ? 'Høy konfidens' : confClass === 'medium' ? 'Middels konfidens' : 'Lav konfidens';

    const flagTags = [
      c.adas && 'ADAS',
      c.rainSensor && 'Regnsensor',
      c.heated && 'Oppvarmet',
      c.acoustic && 'Akustisk',
      c.antenna && 'Antenne',
      c.hud && 'HUD',
      c.shade && 'Solstripe',
      c.camera && 'Kamera',
      c.laneAssist && 'Filskifteass.',
    ].filter(Boolean);

    const imageHtml = this.showImages && c.imageUrl
      ? `<img src="${c.imageUrl}" alt="${c.eurocode}" class="result-image" loading="lazy" onerror="this.style.display='none'">`
      : '';

    const nagsHtml = this.showNags && c.nagsCodes && c.nagsCodes.length > 0
      ? `<div class="nags-badge">🇺🇸 NAGS: ${c.nagsCodes.slice(0, 5).join(', ')}${c.nagsCodes.length > 5 ? ' +' + (c.nagsCodes.length - 5) + ' flere' : ''}</div>`
      : '';

    const priceHtml = this.showPrice
      ? `<span class="price">${c.price ? c.price.toLocaleString('no-NO') + ' kr' : 'Pris på forespørsel'}</span>`
      : '';

    const stockHtml = `<span class="stock ${c.stockStatus > 0 ? '' : 'out'}">${c.stockStatus > 0 ? c.stockStatus + ' på lager' : 'Bestillingsvare'}</span>`;

    const compact = this.mode === 'compact' || this.mode === 'inline';

    if (compact) {
      return `
        <div class="result-item ${isTop ? 'top-match' : ''}">
          <div class="result-row">
            ${imageHtml}
            <div class="result-body">
              <div class="eurocode">${c.eurocode}</div>
              <p class="desc">${c.description || ''}</p>
              <p class="meta">${c.brand || '?'} ${c.model || ''} ${c.yearFrom ? c.yearFrom + (c.yearTo ? '–' + c.yearTo : '–') : ''}</p>
              ${nagsHtml}
            </div>
            <div class="result-actions">
              ${priceHtml}
              ${stockHtml}
              <button class="btn-primary btn-sm">Be om pris</button>
            </div>
          </div>
          ${flagTags.length > 0 ? `<div class="flags">${flagTags.map(f => `<span class="flag on">${f}</span>`).join('')}</div>` : ''}
        </div>
      `;
    }

    // Full mode
    return `
      <div class="result-item ${isTop ? 'top-match' : ''}">
        ${isTop ? `<div class="top-badge">⭐ Mest sannsynlig riktig — ${confLabel}</div>` : ''}
        <div class="header">
          <div>
            <div class="eurocode">${c.eurocode}</div>
            <p style="font-size:14px;color:var(--color-text-secondary);margin-top:4px">${c.description || ''}</p>
            <p style="font-size:12px;color:var(--color-text-muted);margin-top:2px">${c.brand || '?'} ${c.model || ''} ${c.yearFrom ? c.yearFrom + (c.yearTo ? '–' + c.yearTo : '–') : ''} · ${layerLabel}</p>
          </div>
          <span class="confidence ${confClass}">${confClass.toUpperCase()}</span>
        </div>
        ${imageHtml}
        <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center;margin-top:12px">
          ${priceHtml}
          ${stockHtml}
        </div>
        <div class="flags">
          ${flagTags.map(f => `<span class="flag on">${f}</span>`).join('')}
        </div>
        ${nagsHtml}
        <div style="display:flex;gap:12px;margin-top:16px">
          <button class="btn-primary" style="padding:10px 20px;font-size:13px">Be om pris</button>
          <button class="btn-secondary" style="padding:10px 20px;font-size:13px">Se detaljer</button>
        </div>
      </div>
    `;
  }

  // Static helper: quick search
  static quickSearch(regnr, containerSelector) {
    const container = document.querySelector(containerSelector);
    if (!container) return;
    const input = container.querySelector('.glass-search-input');
    if (input) input.value = regnr;
    const instance = container._glassSearch;
    if (instance) instance.search(regnr);
  }
}

// Auto-init any data-glass-search elements
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-glass-search]').forEach(el => {
    const options = {
      container: el,
      inputSelector: el.dataset.input || '.glass-search-input',
      resultsSelector: el.dataset.results || '.glass-search-results',
      mode: el.dataset.mode || 'full',
      showImages: el.dataset.images !== 'false',
      showNags: el.dataset.nags !== 'false',
      showPrice: el.dataset.price !== 'false',
      limit: parseInt(el.dataset.limit, 10) || 10,
    };
    el._glassSearch = new GlassSearch(options);
  });
});
