/**
 * Autoglass AS — Search Engine v2 (smart ranking + tracking)
 * ===========================================================
 * Én gjenbrukbar motor med relevans-scoring, event delegation,
 * beslutningspanel-drawer og full tracking.
 */

const API_BASE = 'https://autoglass-glass-sok.autoglassnorge.workers.dev';

function _hashId(p) {
  const str = `${p.eurocode}:${p.brand || ''}:${p.model || ''}:${p.category || ''}`;
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return 'p_' + Math.abs(h).toString(36);
}

const SearchEngine = {
  config: {},
  allProducts: [],
  filtered: [],
  brands: [],
  categories: [],
  currentPage: 1,
  perPage: 24,
  sortCol: 'eurocode',
  sortDir: 1,
  debounceTimer: null,
  isLoading: false,
  _sessionId: '',
  _lastVehicle: null,
  _lastQuery: '',

  init(cfg = {}) {
    this._sessionId = Math.random().toString(36).slice(2) + Date.now().toString(36);
    this.config = {
      container: cfg.container || '#results-container',
      mode: cfg.mode || 'grid',
      perPage: cfg.perPage || 24,
      filters: cfg.filters || ['brand', 'category', 'adas', 'rain', 'heated', 'acoustic'],
      onAddToCart: cfg.onAddToCart || window.addToCart,
      showDetailInline: cfg.showDetailInline !== false,
      showSearchBox: cfg.showSearchBox !== false,
      showPagination: cfg.showPagination !== false,
      showFilters: cfg.showFilters !== false,
      placeholder: cfg.placeholder || 'Eurokode, merke, modell, regnr...',
      title: cfg.title || null,
      subtitle: cfg.subtitle || null,
      defaultCategory: cfg.defaultCategory || '',
      ...cfg,
    };
    this.currentPage = 1;
    this.perPage = this.config.perPage;
    this._injectUI();
    this._bindEvents();
    this._loadBrandsAndCategories();
    if (this.config.defaultCategory) {
      this._fetchByCategory(this.config.defaultCategory);
    }
    this.track('engine_init', { mode: this.config.mode, defaultCategory: this.config.defaultCategory, filters: this.config.filters });
    return this;
  },

  // ── Tracking ──────────────────────────────────────────────────────────────
  track(event, data = {}) {
    const entry = { event, data, ts: Date.now(), sessionId: this._sessionId, mode: this.config.mode };
    try {
      const buf = JSON.parse(localStorage.getItem('ag_track') || '[]');
      buf.push(entry);
      localStorage.setItem('ag_track', JSON.stringify(buf.slice(-200)));
    } catch {}
    // MemPalace diary for business-critical events
    if (['search_executed','cart_added','product_viewed','quote_submitted'].includes(event)) {
      try {
        const mpPayload = {
          type: event === 'cart_added' ? 'FEAT' : event === 'quote_submitted' ? 'FEAT' : 'ANALYSIS',
          task: `search-engine: ${event}`,
          status: 'GO',
          rating: event === 'cart_added' ? 5 : 3,
          tags: ['search-engine', this.config.mode, event, ...(data.eurocode ? [data.eurocode] : [])],
        };
        if (typeof fetch !== 'undefined') {
          fetch('/api/track', { method: 'POST', body: JSON.stringify(entry), keepalive: true }).catch(()=>{});
        }
      } catch {}
    }
    console.log('[track]', event, data);
  },

  // ── UI Injection ──────────────────────────────────────────────────────────
  _injectUI() {
    const container = document.querySelector(this.config.container);
    if (!container) return;

    let html = '';
    if (this.config.title) {
      html += `<h2 style="font-size:clamp(24px,3vw,36px);margin-bottom:8px">${this.config.title}</h2>`;
    }
    if (this.config.subtitle) {
      html += `<p style="color:var(--color-text-secondary);margin-bottom:24px">${this.config.subtitle}</p>`;
    }
    if (this.config.showFilters) html += this._renderFilterBar();
    if (this.config.showSearchBox) html += this._renderSearchBox();
    html += `<div class="se-count-bar" style="color:var(--color-text-secondary);font-size:13px;margin-bottom:12px"></div>`;
    html += `<div class="se-results"></div>`;
    if (this.config.showPagination) {
      html += `<div class="se-pagination" style="display:flex;gap:8px;justify-content:center;margin-top:32px;flex-wrap:wrap"></div>`;
    }
    container.innerHTML = html;
  },

  _renderSearchBox() {
    return `
      <div class="se-search-box" style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap">
        <input type="text" class="se-search-input" placeholder="${this.config.placeholder}" style="flex:1;min-width:200px;padding:14px 18px;border:2px solid var(--color-border);border-radius:var(--radius-lg);background:var(--color-surface);color:var(--color-text-primary);font-size:16px">
        <button class="se-search-btn btn-primary" style="padding:14px 28px;font-size:16px">Søk</button>
      </div>`;
  },

  _renderFilterBar() {
    const filters = this.config.filters;
    let html = '<div class="se-filter-bar" style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-bottom:20px;padding:16px;background:var(--color-surface-alt);border-radius:var(--radius-md)">';
    if (filters.includes('brand')) {
      html += '<select class="se-filter-brand" data-filter="brand" style="padding:10px 14px;border:1.5px solid var(--color-border);border-radius:var(--radius-sm);background:var(--color-surface);color:var(--color-text-primary);font-size:14px;min-width:160px"><option value="">Alle merker</option></select>';
    }
    if (filters.includes('category')) {
      html += '<select class="se-filter-category" data-filter="category" style="padding:10px 14px;border:1.5px solid var(--color-border);border-radius:var(--radius-sm);background:var(--color-surface);color:var(--color-text-primary);font-size:14px;min-width:160px"><option value="">Alle kategorier</option></select>';
    }
    if (filters.includes('year')) {
      html += `<select class="se-filter-year" data-filter="year" style="padding:10px 14px;border:1.5px solid var(--color-border);border-radius:var(--radius-sm);background:var(--color-surface);color:var(--color-text-primary);font-size:14px;min-width:140px">
        <option value="">Alle år</option><option value="2020-2024">2020–2024</option><option value="2015-2019">2015–2019</option><option value="2010-2014">2010–2014</option><option value="2005-2009">2005–2009</option><option value="2000-2004">2000–2004</option><option value="1980-1999">1980–1999</option>
      </select>`;
    }
    if (filters.includes('adas') || filters.includes('rain') || filters.includes('heated') || filters.includes('acoustic')) {
      html += '<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center">';
      if (filters.includes('adas')) html += '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:14px;color:var(--color-text-secondary)"><input type="checkbox" class="se-filter-adas" data-filter="adas" style="width:18px;height:18px;accent-color:var(--color-accent)"> Kun ADAS</label>';
      if (filters.includes('rain')) html += '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:14px;color:var(--color-text-secondary)"><input type="checkbox" class="se-filter-rain" data-filter="rain" style="width:18px;height:18px;accent-color:var(--color-accent)"> Regnsensor</label>';
      if (filters.includes('heated')) html += '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:14px;color:var(--color-text-secondary)"><input type="checkbox" class="se-filter-heated" data-filter="heated" style="width:18px;height:18px;accent-color:var(--color-accent)"> Oppvarmet</label>';
      if (filters.includes('acoustic')) html += '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:14px;color:var(--color-text-secondary)"><input type="checkbox" class="se-filter-acoustic" data-filter="acoustic" style="width:18px;height:18px;accent-color:var(--color-accent)"> Akustisk</label>';
      html += '</div>';
    }
    html += '</div>';
    return html;
  },

  // ── Events ────────────────────────────────────────────────────────────────
  _bindEvents() {
    const container = document.querySelector(this.config.container);
    if (!container) return;

    const searchInput = container.querySelector('.se-search-input');
    const searchBtn = container.querySelector('.se-search-btn');

    if (searchInput) {
      searchInput.addEventListener('input', () => {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => this._executeSearch(), 300);
      });
      searchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') this._executeSearch(); });
    }
    if (searchBtn) searchBtn.addEventListener('click', () => this._executeSearch());

    // Filter events
    ['brand', 'category', 'year'].forEach(f => {
      const el = container.querySelector(`.se-filter-${f}`);
      if (el) el.addEventListener('change', () => {
        this.track('filter_changed', { filterType: f, filterValue: el.value });
        this._applyFilters();
      });
    });
    ['adas', 'rain', 'heated', 'acoustic'].forEach(f => {
      const el = container.querySelector(`.se-filter-${f}`);
      if (el) el.addEventListener('change', () => {
        this.track('filter_changed', { filterType: f, filterValue: el.checked });
        this._applyFilters();
      });
    });

    // Event delegation for result actions
    const resultsEl = container.querySelector('.se-results');
    if (resultsEl) {
      resultsEl.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const pid = btn.dataset.productId;
        const action = btn.dataset.action;
        if (action === 'add-to-cart') this.addToCart(pid, 1);
        if (action === 'open-detail') this.openDetailById(pid);
      });
    }
  },

  // ── Data Loading ──────────────────────────────────────────────────────────
  async _loadBrandsAndCategories() {
    try {
      const [bRes, cRes] = await Promise.all([
        fetch(`${API_BASE}/api/catalog/brands`),
        fetch(`${API_BASE}/api/catalog/categories`),
      ]);
      const bData = await bRes.json();
      const cData = await cRes.json();
      this.brands = (bData.brands || []).filter(b => b.brand && b.brand !== 'Ukjent').sort((a, b) => b.count - a.count);
      this.categories = (cData.categories || []).sort((a, b) => a.category.localeCompare(b.category));
      this._populateFilterSelects();
    } catch (e) {
      console.error('[SearchEngine] Failed to load brands/categories:', e);
    }
  },

  _populateFilterSelects() {
    const container = document.querySelector(this.config.container);
    if (!container) return;
    const brandSel = container.querySelector('.se-filter-brand');
    const catSel = container.querySelector('.se-filter-category');
    if (brandSel) {
      this.brands.slice(0, 50).forEach(b => {
        const opt = document.createElement('option');
        opt.value = b.brand;
        opt.textContent = `${b.brand} (${b.count.toLocaleString('nb-NO')})`;
        brandSel.appendChild(opt);
      });
    }
    if (catSel) {
      this.categories.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.category;
        opt.textContent = `${c.category.charAt(0).toUpperCase() + c.category.slice(1)} (${c.count.toLocaleString('nb-NO')})`;
        catSel.appendChild(opt);
      });
    }
  },

  async _fetchByCategory(category) {
    this._setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/catalog/search?q=&category=${encodeURIComponent(category)}`);
      const data = await res.json();
      this.allProducts = (data.results || []).map(p => ({ ...p, _pid: _hashId(p) }));
      this._applyFilters();
    } catch (e) {
      this._showError('Kunne ikke laste produkter. Prøv igjen.');
    } finally {
      this._setLoading(false);
    }
  },

  async _executeSearch() {
    const container = document.querySelector(this.config.container);
    const q = container?.querySelector('.se-search-input')?.value?.trim() || '';
    this._lastQuery = q;
    if (!q) { this._showEmpty('Skriv noe i søkefeltet for å finne produkter'); return; }
    this._setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('q', q);
      const brand = container?.querySelector('.se-filter-brand')?.value;
      const category = container?.querySelector('.se-filter-category')?.value;
      if (brand) params.set('brand', brand);
      if (category) params.set('category', category);
      const res = await fetch(`${API_BASE}/api/catalog/search?${params.toString()}`);
      const data = await res.json();
      this.allProducts = (data.results || []).map(p => ({ ...p, _pid: _hashId(p) }));
      this._applyFilters();
      this.track('search_executed', { query: q, resultCount: this.allProducts.length });
    } catch (e) {
      this._showError('Nettverksfeil. Prøv igjen.');
    } finally {
      this._setLoading(false);
    }
  },

  // ── Scoring ───────────────────────────────────────────────────────────────
  _scoreProduct(p, query) {
    let score = 0;
    const q = (query || '').toLowerCase().trim();

    // 1. Query match scoring
    if (q) {
      if (p.eurocode?.toLowerCase() === q) score += 100;
      else if (p.eurocode?.toLowerCase().startsWith(q)) score += 80;
      else if (p.eurocode?.toLowerCase().includes(q)) score += 60;
      if (p.brand?.toLowerCase() === q) score += 50;
      else if (p.brand?.toLowerCase().includes(q)) score += 30;
      if (p.model?.toLowerCase().includes(q)) score += 20;
      if (p.description?.toLowerCase().includes(q)) score += 10;
      if (q.includes('adas') && p.adas) score += 15;
      if (q.includes('regnsensor') && p.rain_sensor) score += 15;
      if (q.includes('oppvarmet') && p.heated) score += 15;
      if (q.includes('akustisk') && p.acoustic) score += 15;
    }

    // 2. Business prioritization (supplier preference)
    const supplierRank = {
      'Pilkington': 8,
      'Glavista': 6,
      'Euroglass': 4,
      'Autoglass': 3,
    };
    score += supplierRank[p.supplier] || 2;

    // 3. Feature density (more features = higher value product)
    const featureCount = [p.adas, p.rain_sensor, p.heated, p.acoustic, p.antenna, p.hud, p.camera, p.laneAssist].filter(Boolean).length;
    score += featureCount * 4;

    // 4. Image presence (products with images convert better)
    if (p.image_url || p.imageUrl) score += 3;

    // 5. Vehicle match boost (if last vehicle search)
    if (this._lastVehicle && p.brand) {
      const vMake = (this._lastVehicle.make || '').toLowerCase();
      const pBrand = p.brand.toLowerCase();
      if (vMake === pBrand) score += 25;
      else if (vMake.includes(pBrand) || pBrand.includes(vMake)) score += 15;
    }

    return score;
  },

  // ── Filtering ─────────────────────────────────────────────────────────────
  _applyFilters() {
    const container = document.querySelector(this.config.container);
    if (!container) return;

    const q = container.querySelector('.se-search-input')?.value?.trim().toLowerCase() || '';
    const brand = container.querySelector('.se-filter-brand')?.value || '';
    const category = container.querySelector('.se-filter-category')?.value || '';
    const yearRange = container.querySelector('.se-filter-year')?.value || '';
    const adas = container.querySelector('.se-filter-adas')?.checked || false;
    const rain = container.querySelector('.se-filter-rain')?.checked || false;
    const heated = container.querySelector('.se-filter-heated')?.checked || false;
    const acoustic = container.querySelector('.se-filter-acoustic')?.checked || false;

    let result = [...this.allProducts];
    if (q) {
      result = result.filter(r => {
        const hay = `${r.eurocode || ''} ${r.brand || ''} ${r.model || ''} ${r.description || ''}`.toLowerCase();
        return hay.includes(q);
      });
    }
    if (brand) result = result.filter(r => r.brand === brand);
    if (category) result = result.filter(r => r.category === category);
    if (adas) result = result.filter(r => r.adas);
    if (rain) result = result.filter(r => r.rain_sensor);
    if (heated) result = result.filter(r => r.heated);
    if (acoustic) result = result.filter(r => r.acoustic);
    if (yearRange) {
      const [min, max] = yearRange.split('-').map(Number);
      result = result.filter(r => r.year_from && r.year_from >= min && r.year_from <= max);
    }

    // Score and rank
    result.forEach(p => { p._score = this._scoreProduct(p, q); });
    result.sort((a, b) => {
      if (b._score !== a._score) return b._score - a._score;
      return (a.eurocode || '').localeCompare(b.eurocode || '');
    });

    this.filtered = result;
    this.currentPage = 1;
    this._renderResults();
  },

  // ── Rendering ─────────────────────────────────────────────────────────────
  _renderResults() {
    const container = document.querySelector(this.config.container);
    if (!container) return;
    const resultsEl = container.querySelector('.se-results');
    const countEl = container.querySelector('.se-count-bar');
    const total = this.filtered.length;

    if (countEl) {
      countEl.textContent = total > 0
        ? `Viser ${Math.min((this.currentPage - 1) * this.perPage + 1, total)}–${Math.min(this.currentPage * this.perPage, total)} av ${total.toLocaleString('nb-NO')} treff`
        : (this.allProducts.length === 0 && !this.isLoading ? 'Skriv noe i søkefeltet for å finne produkter' : `${total.toLocaleString('nb-NO')} treff`);
    }

    if (total === 0 && !this.isLoading) {
      resultsEl.innerHTML = `
        <div style="text-align:center;padding:60px 20px;color:var(--color-text-secondary)">
          <div style="font-size:48px;margin-bottom:16px">🔍</div><h3>Ingen treff</h3><p>Prøv et annet søkeord eller fjern noen filtre.</p>
        </div>`;
      this._renderPagination(0);
      return;
    }

    const start = (this.currentPage - 1) * this.perPage;
    const pageData = this.filtered.slice(start, start + this.perPage);

    if (this.config.mode === 'grid') {
      resultsEl.innerHTML = `<div class="se-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px">${pageData.map(p => this._renderGridCard(p)).join('')}</div>`;
    } else if (this.config.mode === 'table') {
      resultsEl.innerHTML = this._renderTable(pageData, start);
    } else if (this.config.mode === 'compact') {
      resultsEl.innerHTML = `<div class="se-compact" style="display:flex;flex-direction:column;gap:12px">${pageData.map(p => this._renderCompactCard(p)).join('')}</div>`;
    }
    this._renderPagination(Math.ceil(total / this.perPage));
  },

  _renderGridCard(p) {
    const flags = [];
    if (p.adas) flags.push('<span style="font-size:11px;padding:3px 10px;border-radius:20px;background:#dc2626;color:#fff">ADAS</span>');
    if (p.rain_sensor) flags.push('<span style="font-size:11px;padding:3px 10px;border-radius:20px;background:#2563eb;color:#fff">Regn</span>');
    if (p.heated) flags.push('<span style="font-size:11px;padding:3px 10px;border-radius:20px;background:#ea580c;color:#fff">Varme</span>');
    if (p.acoustic) flags.push('<span style="font-size:11px;padding:3px 10px;border-radius:20px;background:var(--color-surface-alt);border:1px solid var(--color-border)">Akustisk</span>');
    const yearTxt = p.year_from && p.year_to ? `${p.year_from}–${p.year_to}` : p.year_from ? `${p.year_from}–` : '';
    return `
      <div class="se-card" data-pid="${p._pid}" style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:20px;transition:all .15s;cursor:pointer" onmouseenter="this.style.borderColor='var(--color-accent)'" onmouseleave="this.style.borderColor='var(--color-border)'">
        <div style="font-family:monospace;font-size:18px;font-weight:700;color:var(--color-accent);margin-bottom:4px">${p.eurocode}</div>
        <div style="font-size:14px;color:var(--color-text-secondary);margin-bottom:8px;line-height:1.5;min-height:42px">${p.description || ''}</div>
        <div style="font-size:12px;color:var(--color-text-muted);margin-bottom:10px">${p.brand || ''} ${p.model || ''} ${yearTxt} · ${p.supplier || 'Pilkington'}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">${flags.join('')}</div>
        <div style="display:flex;gap:8px">
          <button class="btn-primary" data-action="add-to-cart" data-product-id="${p._pid}" style="flex:1;padding:10px;font-size:13px">🛒 Legg i kurv</button>
          <button class="btn-secondary" data-action="open-detail" data-product-id="${p._pid}" style="padding:10px 16px;font-size:13px">Detaljer</button>
        </div>
      </div>`;
  },

  _renderTable(products, startIndex) {
    const rows = products.map((p, i) => {
      const flags = [];
      if (p.adas) flags.push('<span style="font-size:10px;padding:2px 8px;border-radius:12px;background:#dc2626;color:#fff">ADAS</span>');
      if (p.rain_sensor) flags.push('<span style="font-size:10px;padding:2px 8px;border-radius:12px;background:#2563eb;color:#fff">Regn</span>');
      if (p.heated) flags.push('<span style="font-size:10px;padding:2px 8px;border-radius:12px;background:#ea580c;color:#fff">Varme</span>');
      const img = p.image_url ? `<img src="${p.image_url}" style="width:50px;height:35px;object-fit:cover;border-radius:4px" loading="lazy" onerror="this.style.display='none'">` : '<div style="width:50px;height:35px;background:var(--color-surface-alt);border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:9px;color:var(--color-text-muted)">Ingen</div>';
      const year = p.year_from ? (p.year_to ? `${p.year_from}–${p.year_to}` : `${p.year_from}–`) : 'Ukjent';
      return `<tr>
        <td style="padding:8px 10px;border-bottom:1px solid var(--color-surface-alt)">${startIndex + i + 1}</td>
        <td style="padding:8px 10px;border-bottom:1px solid var(--color-surface-alt)">${img}</td>
        <td style="padding:8px 10px;border-bottom:1px solid var(--color-surface-alt);font-family:monospace;font-weight:600;color:var(--color-accent);font-size:13px">${p.eurocode}</td>
        <td style="padding:8px 10px;border-bottom:1px solid var(--color-surface-alt);color:#2563eb;font-weight:500">${p.brand || '?'}</td>
        <td style="padding:8px 10px;border-bottom:1px solid var(--color-surface-alt)">${p.model || '-'}</td>
        <td style="padding:8px 10px;border-bottom:1px solid var(--color-surface-alt)">${p.category ? p.category.charAt(0).toUpperCase() + p.category.slice(1) : '-'}</td>
        <td style="padding:8px 10px;border-bottom:1px solid var(--color-surface-alt)">${year}</td>
        <td style="padding:8px 10px;border-bottom:1px solid var(--color-surface-alt)">${flags.join('')}</td>
        <td style="padding:8px 10px;border-bottom:1px solid var(--color-surface-alt)">${p.supplier || '-'}</td>
        <td style="padding:8px 10px;border-bottom:1px solid var(--color-surface-alt)">
          <button data-action="add-to-cart" data-product-id="${p._pid}" title="Legg i kurv" style="background:none;border:none;cursor:pointer;font-size:18px">🛒</button>
          <button data-action="open-detail" data-product-id="${p._pid}" title="Detaljer" style="background:none;border:none;cursor:pointer;font-size:16px;margin-left:4px">ℹ️</button>
        </td>
      </tr>`;
    }).join('');

    return `<table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr>
      <th style="text-align:left;padding:10px;background:var(--color-surface-alt);color:var(--color-accent);font-weight:600;border-bottom:2px solid var(--color-border);font-size:11px;text-transform:uppercase">#</th>
      <th style="text-align:left;padding:10px;background:var(--color-surface-alt);color:var(--color-accent);font-weight:600;border-bottom:2px solid var(--color-border);font-size:11px;text-transform:uppercase">Bilde</th>
      <th style="text-align:left;padding:10px;background:var(--color-surface-alt);color:var(--color-accent);font-weight:600;border-bottom:2px solid var(--color-border);font-size:11px;text-transform:uppercase;cursor:pointer" onclick="SearchEngine._sort('eurocode')">Eurocode ↕</th>
      <th style="text-align:left;padding:10px;background:var(--color-surface-alt);color:var(--color-accent);font-weight:600;border-bottom:2px solid var(--color-border);font-size:11px;text-transform:uppercase;cursor:pointer" onclick="SearchEngine._sort('brand')">Merke ↕</th>
      <th style="text-align:left;padding:10px;background:var(--color-surface-alt);color:var(--color-accent);font-weight:600;border-bottom:2px solid var(--color-border);font-size:11px;text-transform:uppercase;cursor:pointer" onclick="SearchEngine._sort('model')">Modell ↕</th>
      <th style="text-align:left;padding:10px;background:var(--color-surface-alt);color:var(--color-accent);font-weight:600;border-bottom:2px solid var(--color-border);font-size:11px;text-transform:uppercase;cursor:pointer" onclick="SearchEngine._sort('category')">Kategori ↕</th>
      <th style="text-align:left;padding:10px;background:var(--color-surface-alt);color:var(--color-accent);font-weight:600;border-bottom:2px solid var(--color-border);font-size:11px;text-transform:uppercase">År</th>
      <th style="text-align:left;padding:10px;background:var(--color-surface-alt);color:var(--color-accent);font-weight:600;border-bottom:2px solid var(--color-border);font-size:11px;text-transform:uppercase">Flagg</th>
      <th style="text-align:left;padding:10px;background:var(--color-surface-alt);color:var(--color-accent);font-weight:600;border-bottom:2px solid var(--color-border);font-size:11px;text-transform:uppercase">Leverandør</th>
      <th style="text-align:left;padding:10px;background:var(--color-surface-alt);color:var(--color-accent);font-weight:600;border-bottom:2px solid var(--color-border);font-size:11px;text-transform:uppercase"></th>
    </tr></thead><tbody>${rows}</tbody></table>`;
  },

  _renderCompactCard(p) {
    const flags = [];
    if (p.adas) flags.push('ADAS');
    if (p.rain_sensor) flags.push('Regn');
    const flagStr = flags.length > 0 ? ` · ${flags.join(', ')}` : '';
    return `
      <div style="display:flex;gap:12px;padding:12px;background:var(--color-surface-alt);border-radius:var(--radius-md);border:1px solid var(--color-border);align-items:center">
        <div style="font-family:monospace;font-size:16px;font-weight:700;color:var(--color-accent);min-width:100px">${p.eurocode}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.description || ''}</div>
          <div style="font-size:12px;color:var(--color-text-muted)">${p.brand || ''} ${p.model || ''}${flagStr}</div>
        </div>
        <button class="btn-primary" data-action="add-to-cart" data-product-id="${p._pid}" style="padding:8px 16px;font-size:12px;flex-shrink:0">🛒 Legg i kurv</button>
      </div>`;
  },

  _renderPagination(totalPages) {
    const container = document.querySelector(this.config.container);
    const el = container?.querySelector('.se-pagination');
    if (!el || totalPages <= 1) { if (el) el.innerHTML = ''; return; }
    let html = '';
    if (this.currentPage > 1) html += `<button onclick="SearchEngine._goPage(${this.currentPage - 1})" style="padding:8px 16px;border-radius:var(--radius-md);border:1px solid var(--color-border);background:var(--color-surface);color:var(--color-text-primary);cursor:pointer;font-size:14px">← Forrige</button>`;
    const startPage = Math.max(1, this.currentPage - 3);
    const endPage = Math.min(totalPages, startPage + 6);
    for (let i = startPage; i <= endPage; i++) {
      const active = i === this.currentPage;
      html += `<button onclick="SearchEngine._goPage(${i})" style="padding:8px 16px;border-radius:var(--radius-md);border:1px solid ${active ? 'var(--color-accent)' : 'var(--color-border)'};background:${active ? 'var(--color-accent)' : 'var(--color-surface)'};color:${active ? 'var(--color-primary-900)' : 'var(--color-text-primary)'};cursor:pointer;font-size:14px;font-weight:${active ? '700' : '400'}">${i}</button>`;
    }
    if (this.currentPage < totalPages) html += `<button onclick="SearchEngine._goPage(${this.currentPage + 1})" style="padding:8px 16px;border-radius:var(--radius-md);border:1px solid var(--color-border);background:var(--color-surface);color:var(--color-text-primary);cursor:pointer;font-size:14px">Neste →</button>`;
    el.innerHTML = html;
  },

  _goPage(p) {
    this.currentPage = p;
    this._renderResults();
    this.track('page_changed', { page: p, totalPages: Math.ceil(this.filtered.length / this.perPage) });
    document.querySelector(this.config.container)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  _sort(col) {
    if (this.sortCol === col) this.sortDir *= -1;
    else { this.sortCol = col; this.sortDir = 1; }
    this.filtered.sort((a, b) => {
      let av = (a[col] || '').toString().toLowerCase();
      let bv = (b[col] || '').toString().toLowerCase();
      if (col === 'year_from' || col === 'year_to') { av = Number(a[col]) || 0; bv = Number(b[col]) || 0; }
      return av < bv ? -this.sortDir : av > bv ? this.sortDir : 0;
    });
    this.track('sort_changed', { sortCol: col, sortDir: this.sortDir });
    this._renderResults();
  },

  _setLoading(v) {
    this.isLoading = v;
    const container = document.querySelector(this.config.container);
    const resultsEl = container?.querySelector('.se-results');
    if (!resultsEl) return;
    if (v) resultsEl.innerHTML = '<div style="text-align:center;padding:40px;color:var(--color-text-secondary)"><div style="font-size:32px;margin-bottom:12px">⏳</div>Laster produkter...</div>';
  },

  _showError(msg) {
    const resultsEl = document.querySelector(this.config.container)?.querySelector('.se-results');
    if (resultsEl) resultsEl.innerHTML = `<div style="background:#7f1d1d;color:#fca5a5;padding:16px;border-radius:10px;margin-top:16px">❌ ${msg}</div>`;
  },

  _showEmpty(msg) {
    const resultsEl = document.querySelector(this.config.container)?.querySelector('.se-results');
    if (resultsEl) resultsEl.innerHTML = `<div style="text-align:center;padding:60px 20px;color:var(--color-text-muted)"><h3 style="color:var(--color-text-secondary);margin-bottom:8px">🔍 ${msg}</h3></div>`;
  },

  // ── Product lookup ────────────────────────────────────────────────────────
  _findProductById(pid) {
    return this.allProducts.find(p => p._pid === pid) || this.filtered.find(p => p._pid === pid);
  },

  // ── Cart gateway ──────────────────────────────────────────────────────────
  addToCart(pid, quantity = 1) {
    const p = this._findProductById(pid);
    if (!p) return;
    this.track('cart_added', { productId: pid, eurocode: p.eurocode, quantity, source: this.config.mode });
    if (typeof addToCart === 'function') {
      addToCart({
        eurocode: p.eurocode,
        description: p.description,
        brand: p.brand,
        model: p.model,
        category: p.category || 'frontrute',
        supplier: p.supplier,
        imageUrl: p.image_url || p.imageUrl,
        adas: p.adas ? 1 : 0,
        rain_sensor: p.rain_sensor ? 1 : 0,
        heated: p.heated ? 1 : 0,
        acoustic: p.acoustic ? 1 : 0,
        quantity,
      });
    }
  },

  openDetailById(pid) {
    const p = this._findProductById(pid);
    if (p) this.openDetail(p);
  },

  // ── Drawer (beslutningspanel) ─────────────────────────────────────────────
  openDetail(product) {
    this.track('product_viewed', { productId: product._pid, eurocode: product.eurocode, source: this.config.mode });
    let drawer = document.getElementById('se-product-drawer');
    if (!drawer) {
      drawer = document.createElement('div');
      drawer.id = 'se-product-drawer';
      drawer.style.cssText = 'position:fixed;inset:0;z-index:9998;display:none;align-items:flex-end;justify-content:flex-end';
      document.body.appendChild(drawer);
    }

    const flags = [];
    if (product.adas) flags.push({ label: 'ADAS', desc: 'Krever kalibrering etter montering', icon: '📷', color: '#dc2626' });
    if (product.rain_sensor) flags.push({ label: 'Regnsensor', desc: 'Automatisk vindusviskerstyring', icon: '🌧️', color: '#2563eb' });
    if (product.heated) flags.push({ label: 'Oppvarmet', desc: 'Elektrisk avising', icon: '🔥', color: '#ea580c' });
    if (product.acoustic) flags.push({ label: 'Akustisk', desc: 'Støydempende glass', icon: '🔊', color: 'var(--color-text-secondary)' });
    if (product.antenna) flags.push({ label: 'Antenne', desc: 'FM/DAB/GPS integrert', icon: '📡', color: 'var(--color-text-secondary)' });
    if (product.hud) flags.push({ label: 'HUD', desc: 'Head-Up Display kompatibel', icon: '📺', color: 'var(--color-text-secondary)' });

    const yearTxt = product.year_from && product.year_to ? `${product.year_from}–${product.year_to}` : product.year_from ? `${product.year_from}–` : '';

    // Match indicator (if last vehicle search)
    let matchIndicator = '';
    if (this._lastVehicle) {
      const v = this._lastVehicle;
      const brandMatch = v.make && product.brand && v.make.toLowerCase().includes(product.brand.toLowerCase());
      matchIndicator = brandMatch
        ? `<div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:rgba(22,163,74,.1);border-radius:var(--radius-sm);margin-bottom:16px;border-left:3px solid var(--color-success)"><span style="font-size:16px">✓</span><span style="font-size:13px;color:var(--color-success);font-weight:600">Passer din ${v.make || ''} ${v.model || ''}</span></div>`
        : `<div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:rgba(217,119,6,.1);border-radius:var(--radius-sm);margin-bottom:16px;border-left:3px solid var(--color-warning)"><span style="font-size:16px">⚠</span><span style="font-size:13px;color:var(--color-warning);font-weight:600">Bekreft kompatibilitet — sjekk at dette produktet passer ditt kjøretøy</span></div>`;
    }

    // Stock indicator (MVP: always "På lager")
    const stockBadge = `<span style="display:inline-flex;align-items:center;gap:6px;font-size:12px;padding:6px 12px;border-radius:20px;background:rgba(22,163,74,.1);color:var(--color-success);font-weight:600;margin-bottom:16px"><span style="width:8px;height:8px;background:var(--color-success);border-radius:50%"></span>På lager</span>`;

    drawer.innerHTML = `
      <div style="position:absolute;inset:0;background:rgba(0,0,0,0.5)" onclick="SearchEngine.closeDetail()"></div>
      <div style="background:var(--color-surface);width:100%;max-width:520px;height:100%;max-height:90vh;border-radius:var(--radius-lg) var(--radius-lg) 0 0;padding:28px;display:flex;flex-direction:column;position:relative;z-index:1;transform:translateY(100%);transition:transform .3s ease;overflow:hidden">
        <button onclick="SearchEngine.closeDetail()" style="position:absolute;top:16px;right:20px;font-size:28px;background:none;border:none;cursor:pointer;color:var(--color-text-secondary);z-index:2">&times;</button>

        <div style="flex:1;overflow-y:auto;padding-right:8px">
          <div style="width:100%;height:180px;background:var(--color-surface-alt);border-radius:var(--radius-md);display:flex;align-items:center;justify-content:center;overflow:hidden;margin-bottom:16px">
            ${product.image_url ? `<img src="${product.image_url}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none';this.parentElement.innerHTML='<span style=font-size:64px>🪟</span>'">` : '<span style="font-size:64px">🪟</span>'}
          </div>

          ${stockBadge}
          ${matchIndicator}

          <div style="font-family:monospace;font-size:24px;font-weight:700;color:var(--color-accent);margin-bottom:4px">${product.eurocode}</div>
          <div style="font-size:16px;color:var(--color-text-secondary);margin-bottom:12px;line-height:1.6">${product.description || ''}</div>
          <div style="font-size:14px;color:var(--color-text-muted);margin-bottom:20px">${product.brand || ''} ${product.model || ''} ${yearTxt} · ${product.supplier || 'Pilkington'}</div>

          <h4 style="font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:var(--color-text-secondary);margin-bottom:12px">Tekniske egenskaper</h4>
          <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:24px">
            ${flags.length > 0 ? flags.map(f => `
              <div style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--color-surface-alt);border-radius:var(--radius-sm);border-left:3px solid ${f.color}">
                <span style="font-size:20px">${f.icon}</span>
                <div><div style="font-size:13px;font-weight:600">${f.label}</div><div style="font-size:12px;color:var(--color-text-secondary)">${f.desc}</div></div>
              </div>
            `).join('') : '<div style="padding:12px;background:var(--color-surface-alt);border-radius:var(--radius-sm);color:var(--color-text-muted);font-size:13px">Ingen spesielle sensorer registrert for dette produktet.</div>'}
          </div>

          <h4 style="font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:var(--color-text-secondary);margin-bottom:12px">Kvalitet</h4>
          <div style="display:flex;gap:8px;margin-bottom:24px">
            <span style="font-size:12px;padding:6px 12px;border-radius:20px;background:rgba(22,163,74,.1);color:var(--color-success);font-weight:600">ECE R43 ✓</span>
            <span style="font-size:12px;padding:6px 12px;border-radius:20px;background:rgba(245,197,24,.1);color:var(--color-accent-dark);font-weight:600">OEE / OEM</span>
          </div>
        </div>

        <div style="border-top:1px solid var(--color-border);padding-top:16px;margin-top:16px">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
            <span style="font-size:14px;color:var(--color-text-secondary)">Antall:</span>
            <div style="display:flex;align-items:center;gap:8px">
              <button id="se-qty-minus" style="width:36px;height:36px;border-radius:var(--radius-sm);border:1px solid var(--color-border);background:var(--color-surface);cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center">−</button>
              <span id="se-qty" style="font-size:16px;font-weight:600;min-width:32px;text-align:center">1</span>
              <button id="se-qty-plus" style="width:36px;height:36px;border-radius:var(--radius-sm);border:1px solid var(--color-border);background:var(--color-surface);cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center">+</button>
            </div>
          </div>
          <button id="se-add-cart-btn" class="btn-primary" style="width:100%;padding:14px;font-size:16px">🛒 Legg i handlekurv</button>
        </div>
      </div>
    `;

    drawer.style.display = 'flex';
    requestAnimationFrame(() => { drawer.querySelector('div:last-child').style.transform = 'translateY(0)'; });

    let qty = 1;
    const qtyEl = document.getElementById('se-qty');
    document.getElementById('se-qty-minus').onclick = () => {
      qty = Math.max(1, qty - 1);
      qtyEl.textContent = qty;
      this.track('cart_qty_changed', { productId: product._pid, newQty: qty });
    };
    document.getElementById('se-qty-plus').onclick = () => {
      qty++;
      qtyEl.textContent = qty;
      this.track('cart_qty_changed', { productId: product._pid, newQty: qty });
    };
    document.getElementById('se-add-cart-btn').onclick = () => {
      this.addToCart(product._pid, qty);
      this.closeDetail();
    };
  },

  closeDetail() {
    const drawer = document.getElementById('se-product-drawer');
    if (!drawer) return;
    const panel = drawer.querySelector('div:last-child');
    if (panel) panel.style.transform = 'translateY(100%)';
    setTimeout(() => { drawer.style.display = 'none'; }, 300);
  },

  // ── Public search entry ───────────────────────────────────────────────────
  search(query, options = {}) {
    const container = document.querySelector(this.config.container);
    const input = container?.querySelector('.se-search-input');
    if (input) input.value = query;
    if (options.brand) { const sel = container?.querySelector('.se-filter-brand'); if (sel) sel.value = options.brand; }
    if (options.category) { const sel = container?.querySelector('.se-filter-category'); if (sel) sel.value = options.category; }
    this._executeSearch();
  },

  setVehicle(vehicle) {
    this._lastVehicle = vehicle;
  },
};

window.SearchEngine = SearchEngine;
