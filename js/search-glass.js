/* ============================================================
   Autoglass AS — Glass Search Component (reusable)
   ============================================================ */

const API_BASE = 'https://autoglass-glass-sok.autoglassnorge.workers.dev';  // Cloudflare Worker API

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
    const url = `${API_BASE}/api/glass?regnr=${encodeURIComponent(query)}${typeParam}`;
    console.log('[GlassSearch] Fetching:', url);

    try {
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      console.log('[GlassSearch] Response status:', res.status);

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Kunne ikke søke. Prøv igjen.' }));
        console.error('[GlassSearch] API error:', err);
        this.renderError(err.error || 'Kunne ikke søke. Prøv igjen.');
        return;
      }

      const data = await res.json();
      console.log('[GlassSearch] Response data:', { error: data.error, candidates: data.candidates?.length, vehicle: data.vehicle?.regnr });
      this.render(data);
      if (this.onResult) this.onResult(data);
    } catch (e) {
      console.error('[GlassSearch] Fetch error:', e);
      const isBlocked = e.message?.includes('blocked') || e.message?.includes('Failed to fetch');
      const msg = isBlocked
        ? '🔒 Forespørselen ble blokkert. Sannsynlig årsak:<br>• Ad-blocker (uBlock, AdGuard)<br>• Brave Shields / Firefox Strict<br>• Bedriftsnettverk/VPN<br><br><strong>Løsning:</strong> Slå av ad-blocker for denne siden, eller prøv i inkognito-vindu.'
        : 'Nettverksfeil. Sjekk tilkoblingen og prøv igjen.';
      this.renderError(msg);
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

    // Store last search vehicle for quote modal
    if (v.regnr) {
      window.__lastSearchVehicle = {
        regnr: v.regnr,
        make: v.make,
        model: v.model,
        year: v.year,
      };
    }

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
          <button class="btn-primary" style="padding:10px 20px;font-size:13px" onclick="openQuoteModal('${c.eurocode}', '${(c.brand || '').replace(/'/g, "\\'")}', '${(c.model || '').replace(/'/g, "\\'")}')">Be om pris</button>
          <button class="btn-secondary" style="padding:10px 20px;font-size:13px" onclick="saveVehicleFromSearch('${c.eurocode}', '${(c.brand || '').replace(/'/g, "\\'")}', '${(c.model || '').replace(/'/g, "\\'")}')">Lagre kjøretøy</button>
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

// ============================================================================
// QUOTE MODAL
// ============================================================================

function openQuoteModal(eurocode, brand, model) {
  const existing = document.getElementById('quote-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'quote-modal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;padding:20px';
  modal.innerHTML = `
    <div style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:32px;max-width:460px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.4)">
      <h3 style="font-size:20px;margin-bottom:4px">Be om pris</h3>
      <p style="color:var(--color-text-secondary);font-size:14px;margin-bottom:20px">${eurocode}${brand ? ' — ' + brand + ' ' + model : ''}</p>
      <form id="quote-form">
        <div class="form-group" style="margin-bottom:14px">
          <label style="display:block;font-size:13px;margin-bottom:6px;color:var(--color-text-secondary)">E-post *</label>
          <input type="email" id="quote-email" required style="width:100%;padding:12px 14px;border:1.5px solid var(--color-border);border-radius:var(--radius-sm);font-size:14px;background:var(--color-surface-alt);color:var(--color-text-primary)"
            value="${(typeof currentUser !== 'undefined' && currentUser?.email) || ''}">
        </div>
        <div class="form-group" style="margin-bottom:14px">
          <label style="display:block;font-size:13px;margin-bottom:6px;color:var(--color-text-secondary)">Antall</label>
          <input type="number" id="quote-qty" value="1" min="1" style="width:100%;padding:12px 14px;border:1.5px solid var(--color-border);border-radius:var(--radius-sm);font-size:14px;background:var(--color-surface-alt);color:var(--color-text-primary)">
        </div>
        <div class="form-group" style="margin-bottom:20px">
          <label style="display:block;font-size:13px;margin-bottom:6px;color:var(--color-text-secondary)">Beskjed (valgfritt)</label>
          <textarea id="quote-msg" rows="3" style="width:100%;padding:12px 14px;border:1.5px solid var(--color-border);border-radius:var(--radius-sm);font-size:14px;background:var(--color-surface-alt);color:var(--color-text-primary);resize:vertical"></textarea>
        </div>
        <div style="display:flex;gap:10px">
          <button type="submit" class="btn-primary" style="flex:1">Send forespørsel</button>
          <button type="button" class="btn-secondary" onclick="document.getElementById('quote-modal').remove()">Avbryt</button>
        </div>
      </form>
      <div id="quote-status" style="margin-top:16px;font-size:14px;text-align:center;display:none"></div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });

  document.getElementById('quote-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const status = document.getElementById('quote-status');
    const originalText = btn.textContent;

    btn.disabled = true;
    btn.textContent = 'Sender...';
    status.style.display = 'none';

    const lastSearch = window.__lastSearchVehicle || {};

    try {
      const res = await fetch('https://autoglass-glass-sok.autoglassnorge.workers.dev/api/quote-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: document.getElementById('quote-email').value,
          eurocode: eurocode,
          regnr: lastSearch.regnr || '',
          quantity: parseInt(document.getElementById('quote-qty').value, 10) || 1,
          message: document.getElementById('quote-msg').value,
        }),
      });
      const data = await res.json();
      if (data.success) {
        status.innerHTML = '<span style="color:var(--color-success)">✅ Forespørsel sendt! Vi kontakter deg innen 24 timer.</span>';
        btn.textContent = 'Sendt!';
        setTimeout(() => modal.remove(), 2500);
      } else {
        status.innerHTML = '<span style="color:var(--color-error)">❌ ' + (data.error || 'Noe gikk galt') + '</span>';
        btn.disabled = false;
        btn.textContent = originalText;
      }
    } catch (err) {
      status.innerHTML = '<span style="color:var(--color-error)">❌ Nettverksfeil. Prøv igjen.</span>';
      btn.disabled = false;
      btn.textContent = originalText;
    }
    status.style.display = 'block';
  });
}

// ============================================================================
// SAVE VEHICLE
// ============================================================================

function saveVehicleFromSearch(eurocode, brand, model) {
  if (typeof currentUser === 'undefined' || !currentUser) {
    alert('Logg inn for å lagre kjøretøy. Gå til Kundeportal → Logg inn.');
    return;
  }
  const lastSearch = window.__lastSearchVehicle || {};
  const vehicle = {
    regnr: lastSearch.regnr || '',
    make: lastSearch.make || brand || '',
    model: lastSearch.model || model || '',
    year: lastSearch.year || 0,
    eurocode: eurocode,
  };
  if (!vehicle.regnr) {
    alert('Ingen regnr å lagre. Utfør et søk først.');
    return;
  }
  saveVehicle(currentUser.email, vehicle);
  alert('🚗 ' + vehicle.make + ' ' + vehicle.model + ' (' + vehicle.regnr + ') lagret!');
}

// Auto-init any data-glass-search elements
function initGlassSearch() {
  document.querySelectorAll('[data-glass-search]').forEach(el => {
    if (el._glassSearch) return; // Already initialized
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
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initGlassSearch);
} else {
  initGlassSearch();
}
