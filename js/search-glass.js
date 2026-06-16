/* ============================================================
   Autoglass AS — Glass Search Component (optimized)
   ============================================================ */

const API_BASE = 'https://autoglass-glass-sok.autoglassnorge.workers.dev';

/* ==========================================================================
   DEDUPLICATION & IN-MEMORY CACHE
   ========================================================================== */

const _pendingSearches = new Map();
const _imageObserverCleanups = new WeakMap();

function _cacheKey(query, type) {
  return `${query}:${type || ''}`;
}

/* ==========================================================================
   TEMPLATE HELPERS
   ========================================================================== */

function tplError(msg) {
  return `<p class="no-result">${msg}</p>`;
}

function tplLoading() {
  return `<p class="loading">Søker…</p>`;
}

function tplNetworkError(err) {
  const isBlocked = err?.message?.includes('blocked') || err?.message?.includes('Failed to fetch');
  if (isBlocked) {
    return '🔒 Forespørselen ble blokkert. Sannsynlig årsak:<br>• Ad-blocker (uBlock, AdGuard)<br>• Brave Shields / Firefox Strict<br>• Bedriftsnettverk/VPN<br><br><strong>Løsning:</strong> Slå av ad-blocker for denne siden, eller prøv i inkognito-vindu.';
  }
  return 'Nettverksfeil. Sjekk tilkoblingen og prøv igjen.';
}

/* ==========================================================================
   GLASS SEARCH CLASS
   ========================================================================== */

class GlassSearch {
  constructor(options = {}) {
    this.container = typeof options.container === 'string'
      ? document.querySelector(options.container)
      : options.container;
    this.inputSelector = options.inputSelector || '.glass-search-input';
    this.resultsSelector = options.resultsSelector || '.glass-search-results';
    this.typeSelector = options.typeSelector || 'input[name="glass-type"]';
    this.onResult = options.onResult || null;
    this.mode = options.mode || 'full';
    this.showImages = options.showImages !== false;
    this.showNags = options.showNags !== false;
    this.showPrice = options.showPrice !== false;
    this.limit = options.limit || 10;

    this.inputEl = this.container?.querySelector(this.inputSelector);
    this.resultsEl = this.container?.querySelector(this.resultsSelector);

    this._abortController = null;
    this._debounceMs = this.mode === 'inline' ? 300 : 400;
    this.activeFilters = [];
    this._lastData = null;

    this.init();
  }

  init() {
    if (!this.inputEl) return;

    const debouncedSearch = debounce(() => this.search(), this._debounceMs);

    this.inputEl.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this._abortController?.abort();
        this.search();
      }
    });

    this.inputEl.addEventListener('input', debouncedSearch);

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

    // Cancel previous in-flight request
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }

    const type = this.getSelectedType();
    this.activeFilters = [];
    const key = _cacheKey(query, type);

    // 1. Check localStorage cache (TTL 1h)
    const cached = Cache.get(key, 3600000);
    if (cached) {
      this._finalizeRender(cached);
      return;
    }

    // 2. Deduplication — reuse pending promise
    if (_pendingSearches.has(key)) {
      try {
        const data = await _pendingSearches.get(key);
        this._finalizeRender(data);
      } catch (e) {
        if (e.name !== 'AbortError') {
          this.renderError(tplNetworkError(e));
        }
      }
      return;
    }

    this.setLoading(true);

    this._abortController = new AbortController();
    const { signal } = this._abortController;

    const typeParam = type ? `&category=${encodeURIComponent(type)}` : '';
    const url = `${API_BASE}/api/glass?regnr=${encodeURIComponent(query)}${typeParam}`;

    const promise = this._executeFetch(url, signal, query, type);
    _pendingSearches.set(key, promise);

    try {
      const data = await promise;
      this._finalizeRender(data);
    } catch (e) {
      if (e.name === 'AbortError') return;
      console.error('[GlassSearch] Fetch error:', e);
      this.renderError(tplNetworkError(e));
    } finally {
      _pendingSearches.delete(key);
      this.setLoading(false);
      this._abortController = null;
    }
  }

  async _executeFetch(url, signal, query, type) {
    console.log('[GlassSearch] Fetching:', url);
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal,
    });
    console.log('[GlassSearch] Response status:', res.status);

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Kunne ikke søke. Prøv igjen.' }));
      console.error('[GlassSearch] API error:', err);
      throw new Error(err.error || 'Kunne ikke søke. Prøv igjen.');
    }

    const data = await res.json();
    console.log('[GlassSearch] Response data:', {
      error: data.error,
      candidates: data.candidates?.length,
      vehicle: data.vehicle?.regnr,
    });

    // Cache successful response
    Cache.set(_cacheKey(query, type), data);
    return data;
  }

  _finalizeRender(data) {
    this.render(data);
    if (this.onResult) this.onResult(data);
  }

  setLoading(isLoading) {
    const btn = this.container.querySelector('.search-btn');
    if (btn) {
      btn.disabled = isLoading;
      btn.textContent = isLoading ? 'Søker…' : 'Søk';
    }
    if (isLoading && this.resultsEl) {
      this.resultsEl.innerHTML = tplLoading();
    }
  }

  renderError(msg) {
    if (!this.resultsEl) return;
    this.resultsEl.innerHTML = tplError(msg);
  }

  render(data) {
    if (!this.resultsEl) return;

    if (data.error || !data.candidates || data.candidates.length === 0) {
      this.resultsEl.innerHTML = tplError('Ingen treff. Prøv et annet registreringsnummer.');
      return;
    }

    // Keep full response so filter changes can re-render without a new API call
    this._lastData = data;

    const v = data.vehicle || {};
    const flags = data.flags || {};

    // Store last search vehicle for quote modal
    if (v.regnr) {
      window.__lastSearchVehicle = {
        regnr: v.regnr,
        make: v.make,
        model: v.model,
        year: v.year,
        factoryEquipment: v.factoryEquipment || null,
      };
    }

    let html = '';

    if (this.mode === 'full') {
      html += this.renderVehicleBanner(v, flags);
    }

    // Equipment filter bar
    if (typeof EquipmentFilters !== 'undefined') {
      html += this.renderFilterBar();
    }

    html += `<div class="results-list">`;

    const allCandidates = data.candidates || [];
    const filtered = typeof EquipmentFilters !== 'undefined'
      ? allCandidates.filter((c) => EquipmentFilters.matchesAll(c, this.activeFilters))
      : allCandidates;
    const candidates = filtered.slice(0, this.limit);

    if (candidates.length === 0) {
      html += tplError('Ingen treff matcher valgt filter. Fjern et filter for å se flere resultater.');
    } else {
      candidates.forEach((c, idx) => {
        html += this.renderCard(c, idx, data.confidence, data.layer);
      });
    }

    html += '</div>';
    this.resultsEl.innerHTML = html;

    this._attachFilterListeners();

    // Lazy-load images via IntersectionObserver
    this._initLazyImages();
  }

  renderFilterBar() {
    const all = (this._lastData?.candidates || []).length;
    const filtered = (this._lastData?.candidates || []).filter((c) =>
      EquipmentFilters.matchesAll(c, this.activeFilters)
    ).length;
    const countText = this.activeFilters.length > 0
      ? `Viser ${filtered} av ${all} treff`
      : `${all} treff`;

    const filterHtml = EquipmentFilters.renderControls(this.activeFilters, {
      idPrefix: 'gsf-',
      onchange: 'this.closest(\'[data-glass-search]\')._glassSearch._onFilterChange()',
      wrapperClass: '',
    });

    const resetHtml = this.activeFilters.length > 0
      ? `<button type="button" class="btn-secondary btn-sm" style="margin-left:auto;padding:6px 12px;font-size:12px" onclick="this.closest('[data-glass-search]')._glassSearch._resetFilters()">Nullstill filter</button>`
      : '';

    return `
      <div class="glass-filter-bar" style="margin:16px 0;padding:14px;background:var(--color-surface-alt);border:1px solid var(--color-border);border-radius:var(--radius-md)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px">
          <p style="font-size:13px;font-weight:600;margin:0;color:var(--color-text-primary)">🎛️ Filtrer på utstyr</p>
          ${resetHtml}
        </div>
        <div class="filter-pills" style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:8px">${filterHtml}</div>
        <p class="filter-count" style="font-size:12px;color:var(--color-text-secondary);margin:0">${countText}</p>
      </div>
    `;
  }

  _onFilterChange() {
    if (!this._lastData) return;
    const container = this.container.querySelector('.filter-pills');
    if (container) {
      this.activeFilters = Array.from(container.querySelectorAll('input[type="checkbox"]:checked')).map(
        (cb) => cb.value
      );
    }
    this.render(this._lastData);
  }

  _resetFilters() {
    this.activeFilters = [];
    if (this._lastData) this.render(this._lastData);
  }

  _attachFilterListeners() {
    // Inline onchange handles the main interaction; this is a hook for future use.
  }

  _initLazyImages() {
    // Clean up previous observer for this container
    const prevCleanup = _imageObserverCleanups.get(this.resultsEl);
    if (prevCleanup) prevCleanup();

    const cleanup = createLazyImageObserver(this.resultsEl);
    _imageObserverCleanups.set(this.resultsEl, cleanup);
  }

  /* ----------------------------------------------------------------------
     RENDER HELPERS
     ---------------------------------------------------------------------- */

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
        <h3>🚗 ${escapeHtml(v.make) || '?'} ${escapeHtml(v.model) || '?'} ${v.year ? '(' + v.year + ')' : ''}</h3>
        <p class="meta">Reg.nr: ${escapeHtml(v.regnr) || '-'} · VIN: ${escapeHtml((v.vin || '-').slice(0, 8))}…${escapeHtml((v.vin || '-').slice(-4))} · kType: ${escapeHtml(v.kType) || '-'}</p>
        <div class="flags">${flagHtml}</div>
      </div>
    `;
  }

  renderCard(c, idx, confidence, layer) {
    const isTop = idx === 0;
    const confClass = confidence || 'medium';
    const layerLabels = ['Eksakt match', 'Merke + modell + år', 'Merke + modell', 'Merke', 'Prefix4'];
    const layerLabel = layerLabels[(layer || 1) - 1] || 'Statistisk match';
    const confLabel = confClass === 'exact' ? 'Bekreftet originalrute'
      : confClass === 'high' ? 'Høy konfidens'
      : confClass === 'medium' ? 'Middels konfidens'
      : 'Lav konfidens';

    const flagTags = this._buildFlagTags(c);
    const imageHtml = this._buildImageHtml(c);
    const nagsHtml = this._buildNagsHtml(c);
    const priceHtml = this._buildPriceHtml(c);
    const stockHtml = this._buildStockHtml(c);
    const compact = this.mode === 'compact' || this.mode === 'inline';

    if (compact) {
      return this._renderCompactCard(c, idx, flagTags, imageHtml, nagsHtml, priceHtml, stockHtml);
    }
    return this._renderFullCard(c, idx, layerLabel, flagTags, imageHtml, nagsHtml, priceHtml, stockHtml, isTop, confClass, confLabel);
  }

  _buildFlagTags(c) {
    return [
      c.adas && 'ADAS',
      c.rainSensor && 'Regnsensor',
      c.heated && 'Oppvarmet',
      c.acoustic && 'Akustisk',
      c.antenna && 'Antenne',
      c.hud && 'HUD',
      c.shade && 'Solstripe',
      c.camera && 'Kamera',
      c.laneAssist && 'Filskifteass.',
      c.solar && 'Coated / IR-glass / Solfilm',
      c.tinted && 'Tonet',
    ].filter(Boolean);
  }

  _buildImageHtml(c) {
    if (!this.showImages || !c.imageUrl) return '';
    // Use data-src for IO lazy loading; native loading="lazy" as fallback
    return `<img data-src="${escapeHtml(c.imageUrl)}" alt="${escapeHtml(c.eurocode)}" class="result-image" loading="lazy" onerror="this.style.display='none'">`;
  }

  _buildNagsHtml(c) {
    if (!this.showNags || !c.nagsCodes || c.nagsCodes.length === 0) return '';
    const visible = c.nagsCodes.slice(0, 5).join(', ');
    const more = c.nagsCodes.length > 5 ? ' +' + (c.nagsCodes.length - 5) + ' flere' : '';
    return `<div class="nags-badge">🇺🇸 NAGS: ${escapeHtml(visible)}${escapeHtml(more)}</div>`;
  }

  _buildPriceHtml(c) {
    if (!this.showPrice) return '';
    const price = c.price ? c.price.toLocaleString('no-NO') + ' kr' : 'Pris på forespørsel';
    return `<span class="price">${escapeHtml(price)}</span>`;
  }

  _buildStockHtml(c) {
    const inStock = c.stockStatus > 0;
    const text = inStock ? c.stockStatus + ' på lager' : 'Bestillingsvare';
    return `<span class="stock ${inStock ? '' : 'out'}">${escapeHtml(text)}</span>`;
  }

  _renderCompactCard(c, idx, flagTags, imageHtml, nagsHtml, priceHtml, stockHtml) {
    const isTop = idx === 0;
    const flagsRow = flagTags.length > 0
      ? `<div class="flags">${flagTags.map(f => `<span class="flag on">${escapeHtml(f)}</span>`).join('')}</div>`
      : '';

    return `
      <div class="result-item ${isTop ? 'top-match' : ''}">
        <div class="result-row">
          ${imageHtml}
          <div class="result-body">
            <div class="eurocode">${escapeHtml(c.eurocode)}</div>
            <p class="desc">${escapeHtml(c.description) || ''}</p>
            <p class="meta">${escapeHtml(c.brand) || '?'} ${escapeHtml(c.model) || ''} ${c.yearFrom ? c.yearFrom + (c.yearTo ? '–' + c.yearTo : '–') : ''}</p>
            ${nagsHtml}
          </div>
          <div class="result-actions">
            ${priceHtml}
            ${stockHtml}
            <button class="btn-primary btn-sm">Be om pris</button>
          </div>
        </div>
        ${flagsRow}
      </div>
    `;
  }

  _renderFullCard(c, idx, layerLabel, flagTags, imageHtml, nagsHtml, priceHtml, stockHtml, isTop, confClass, confLabel) {
    const topBadge = isTop ? `<div class="top-badge">⭐ Mest sannsynlig riktig — ${escapeHtml(confLabel)}</div>` : '';
    const yearRange = c.yearFrom ? c.yearFrom + (c.yearTo ? '–' + c.yearTo : '–') : '';
    const meta = `${escapeHtml(c.brand) || '?'} ${escapeHtml(c.model) || ''} ${yearRange} · ${escapeHtml(layerLabel)}`;
    const flagsRow = flagTags.map(f => `<span class="flag on">${escapeHtml(f)}</span>`).join('');

    const veh = window.__lastSearchVehicle || {};
    const equipJson = JSON.stringify(veh.factoryEquipment || {}).replace(/"/g, '&quot;');

    return `
      <div class="result-item ${isTop ? 'top-match' : ''}">
        ${topBadge}
        <div class="header">
          <div>
            <div class="eurocode">${escapeHtml(c.eurocode)}</div>
            <p style="font-size:14px;color:var(--color-text-secondary);margin-top:4px">${escapeHtml(c.description) || ''}</p>
            <p style="font-size:12px;color:var(--color-text-muted);margin-top:2px">${meta}</p>
          </div>
          <span class="confidence ${confClass}">${confClass.toUpperCase()}</span>
        </div>
        ${imageHtml}
        <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center;margin-top:12px">
          ${priceHtml}
          ${stockHtml}
        </div>
        <div class="flags">${flagsRow}</div>
        ${nagsHtml}
        <div style="display:flex;gap:12px;margin-top:16px">
          <button class="btn-primary" style="padding:10px 20px;font-size:13px" onclick="openQuoteModal('${escapeHtml(c.eurocode)}', '${escapeHtml(c.brand || '').replace(/'/g, "\\'")}', '${escapeHtml(c.model || '').replace(/'/g, "\\'")}', '${equipJson}')">Be om pris</button>
          <button class="btn-secondary" style="padding:10px 20px;font-size:13px" onclick="saveVehicleFromSearch('${escapeHtml(c.eurocode)}', '${escapeHtml(c.brand || '').replace(/'/g, "\\'")}', '${escapeHtml(c.model || '').replace(/'/g, "\\'")}')">Lagre kjøretøy</button>
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

/* ==========================================================================
   QUOTE MODAL — Reusable DOM
   ========================================================================== */

const QuoteModal = {
  _backdrop: null,
  _content: null,
  _initialized: false,

  _init() {
    if (this._initialized) return;

    const backdrop = document.createElement('div');
    backdrop.id = 'quote-modal';
    backdrop.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.7);display:none;align-items:center;justify-content:center;padding:20px';
    backdrop.innerHTML = `
      <div id="quote-modal-content" style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:32px;max-width:460px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.4)">
        <div id="quote-modal-header"></div>
        <div id="quote-modal-body"></div>
        <form id="quote-form">
          <div class="form-group" style="margin-bottom:14px">
            <label style="display:block;font-size:13px;margin-bottom:6px;color:var(--color-text-secondary)">E-post *</label>
            <input type="email" id="quote-email" required style="width:100%;padding:12px 14px;border:1.5px solid var(--color-border);border-radius:var(--radius-sm);font-size:14px;background:var(--color-surface-alt);color:var(--color-text-primary)">
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
            <button type="button" class="btn-secondary" id="quote-cancel">Avbryt</button>
          </div>
        </form>
        <div id="quote-status" style="margin-top:16px;font-size:14px;text-align:center;display:none"></div>
      </div>
    `;

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) this.close();
    });

    backdrop.querySelector('#quote-cancel').addEventListener('click', () => this.close());
    backdrop.querySelector('#quote-form').addEventListener('submit', (e) => this._onSubmit(e));

    document.body.appendChild(backdrop);
    this._backdrop = backdrop;
    this._content = backdrop.querySelector('#quote-modal-content');
    this._initialized = true;
  },

  open(eurocode, brand, model, vehicleEquipment) {
    this._init();

    const eq = vehicleEquipment || {};
    const hasEq = eq.source && eq.source !== 'none';

    const headerHtml = `
      <h3 style="font-size:20px;margin-bottom:4px">Be om pris</h3>
      <p style="color:var(--color-text-secondary);font-size:14px;margin-bottom:20px">${escapeHtml(eurocode)}${brand ? ' — ' + escapeHtml(brand) + ' ' + escapeHtml(model) : ''}</p>
    `;

    const bodyHtml = hasEq ? this._tplEquipmentConfirmed(eq) : this._tplEquipmentManual();

    this._backdrop.querySelector('#quote-modal-header').innerHTML = headerHtml;
    this._backdrop.querySelector('#quote-modal-body').innerHTML = bodyHtml;

    // Pre-fill email if known
    const emailInput = this._backdrop.querySelector('#quote-email');
    emailInput.value = (typeof currentUser !== 'undefined' && currentUser?.email) || '';

    // Reset form state
    const status = this._backdrop.querySelector('#quote-status');
    const btn = this._backdrop.querySelector('button[type="submit"]');
    status.style.display = 'none';
    status.innerHTML = '';
    btn.disabled = false;
    btn.textContent = 'Send forespørsel';
    this._backdrop.querySelector('#quote-form').reset();
    emailInput.value = (typeof currentUser !== 'undefined' && currentUser?.email) || '';

    this._backdrop.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // Store current context for submit handler
    this._currentEurocode = eurocode;
  },

  close() {
    if (!this._backdrop) return;
    this._backdrop.style.display = 'none';
    document.body.style.overflow = '';
  },

  _tplEquipmentConfirmed(eq) {
    const items = [
      { label: 'Regnsensor', val: eq.rainSensor },
      { label: 'Varme', val: eq.heated },
      { label: 'Akustisk', val: eq.acoustic },
      { label: 'ADAS', val: eq.adas },
      { label: 'Kamera', val: eq.camera },
      { label: 'Antenne', val: eq.antenna },
    ].map(item => `
      <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
        <input type="checkbox" checked disabled> ${escapeHtml(item.label)}: ${item.val ? 'Ja' : 'Nei'}
      </label>
    `).join('');

    const sourceLabel = eq.source === 'bovsoft' ? 'Bovsoft REGNUM'
      : eq.source === 'biluppgifter' ? 'Biluppgifter'
      : 'Ukjent';

    return `
      <div style="margin-bottom:16px;padding:14px;background:var(--color-surface-alt);border-radius:var(--radius-sm);border:1px solid var(--color-border)">
        <p style="font-size:13px;font-weight:600;margin-bottom:8px;color:var(--color-text-primary)">✅ Bekreft utstyr (fra fabrikkdata)</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:13px">${items}</div>
        <p style="font-size:11px;color:var(--color-text-muted);margin-top:6px">Kilde: ${escapeHtml(sourceLabel)}</p>
      </div>
    `;
  },

  _tplEquipmentManual() {
    const items = ['Regnsensor', 'Varme', 'Akustisk', 'ADAS', 'Kamera', 'Antenne'];
    const inputs = items.map((label, i) => `
      <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
        <input type="checkbox" id="chk-${i}"> ${escapeHtml(label)}
      </label>
    `).join('');

    return `
      <div style="margin-bottom:16px;padding:14px;background:rgba(217,119,6,0.08);border-radius:var(--radius-sm);border:1px solid var(--color-warning)">
        <p style="font-size:13px;font-weight:600;margin-bottom:8px;color:var(--color-warning)">⚠️ Sjekk utstyr manuelt</p>
        <p style="font-size:12px;color:var(--color-text-secondary)">Vi har ikke fabrikkdata for dette kjøretøyet. Bekreft at følgende stemmer:</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:13px;margin-top:8px">${inputs}</div>
      </div>
    `;
  },

  async _onSubmit(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const status = document.getElementById('quote-status');
    const originalText = btn.textContent;

    btn.disabled = true;
    btn.textContent = 'Sender...';
    status.style.display = 'none';

    const lastSearch = window.__lastSearchVehicle || {};
    const payload = {
      email: document.getElementById('quote-email').value,
      eurocode: this._currentEurocode,
      regnr: lastSearch.regnr || '',
      quantity: parseInt(document.getElementById('quote-qty').value, 10) || 1,
      message: document.getElementById('quote-msg').value,
    };

    try {
      const result = await retryWithBackoff(async () => {
        const res = await fetch(`${API_BASE}/api/quote-request`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      }, { maxRetries: 2, baseDelay: 800 });

      if (result.success) {
        status.innerHTML = '<span style="color:var(--color-success)">✅ Forespørsel sendt! Vi kontakter deg innen 24 timer.</span>';
        btn.textContent = 'Sendt!';
        setTimeout(() => this.close(), 2500);
      } else {
        status.innerHTML = '<span style="color:var(--color-error)">❌ ' + escapeHtml(result.error || 'Noe gikk galt') + '</span>';
        btn.disabled = false;
        btn.textContent = originalText;
      }
    } catch (err) {
      status.innerHTML = '<span style="color:var(--color-error)">❌ Nettverksfeil. Prøv igjen.</span>';
      btn.disabled = false;
      btn.textContent = originalText;
    }
    status.style.display = 'block';
  },
};

function openQuoteModal(eurocode, brand, model, vehicleEquipment) {
  let eq = vehicleEquipment;
  if (typeof eq === 'string') {
    try { eq = JSON.parse(eq); } catch { eq = {}; }
  }
  QuoteModal.open(eurocode, brand, model, eq);
}

/* ==========================================================================
   SAVE VEHICLE
   ========================================================================== */

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

/* ==========================================================================
   AUTO-INIT
   ========================================================================== */

function initGlassSearch() {
  document.querySelectorAll('[data-glass-search]').forEach(el => {
    if (el._glassSearch) return;
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
