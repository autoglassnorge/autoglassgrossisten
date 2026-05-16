/* ============================================================
   Autoglass AS — Main JavaScript
   ============================================================ */

// --- Theme Toggle ---
function initTheme() {
  const saved = localStorage.getItem('ag-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (saved === 'dark' || (!saved && prefersDark)) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
}

function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  if (isDark) {
    document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('ag-theme', 'light');
  } else {
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.setItem('ag-theme', 'dark');
  }
}

// --- Mobile Menu ---
function toggleMobileMenu() {
  const nav = document.querySelector('.mobile-nav');
  nav.classList.toggle('open');
}

// --- Scroll Reveal ---
function initReveal() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
}

// --- Animated Stats ---
function animateStats() {
  const stats = document.querySelectorAll('.stat-number[data-target]');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        const target = parseInt(el.dataset.target, 10);
        const suffix = el.dataset.suffix || '';
        const duration = 2000;
        const start = performance.now();

        function update(now) {
          const elapsed = now - start;
          const progress = Math.min(elapsed / duration, 1);
          const ease = 1 - Math.pow(1 - progress, 3);
          const current = Math.floor(ease * target);
          el.textContent = current.toLocaleString('no-NO') + suffix;
          if (progress < 1) requestAnimationFrame(update);
        }
        requestAnimationFrame(update);
        observer.unobserve(el);
      }
    });
  }, { threshold: 0.5 });

  stats.forEach(s => observer.observe(s));
}

// --- Language Switcher ---
function initLangSwitcher() {
  document.querySelectorAll('.lang-switcher button').forEach(btn => {
    btn.addEventListener('click', () => setLang(btn.dataset.lang));
  });
}

// --- VIN Search ---
const API_BASE = 'https://autoglass-glass-sok.autoglassnorge.workers.dev';

// --- Type selector ---
function updateTypePill(radio) {
  document.querySelectorAll('.type-pill').forEach(pill => pill.classList.remove('active'));
  radio.closest('.type-pill').classList.add('active');
}

function getSelectedType() {
  const checked = document.querySelector('input[name="glass-type"]:checked');
  return checked ? checked.value : '';
}

async function searchGlass() {
  const input = document.getElementById('vin-input');
  const resultsEl = document.getElementById('vin-results');
  const query = input.value.trim().toUpperCase();
  if (!query) return;

  resultsEl.innerHTML = `<p class="loading">${t('vin.loading')}</p>`;

  const type = getSelectedType();
  const typeParam = type ? `&type=${encodeURIComponent(type)}` : '';

  try {
    const res = await fetch(`${API_BASE}/api/glass?regnr=${encodeURIComponent(query)}${typeParam}`, { headers: { 'Accept': 'application/json' } });

    if (res.ok) {
      const data = await res.json();
      renderResults(data, resultsEl);
      return;
    }

    const err = await res.json().catch(() => ({ error: 'Kunne ikke søke. Prøv igjen.' }));
    resultsEl.innerHTML = `<p class="no-result">${err.error || 'Kunne ikke søke. Prøv igjen.'}</p>`;
  } catch (e) {
    resultsEl.innerHTML = `<p class="no-result">Nettverksfeil. Sjekk tilkoblingen og prøv igjen.</p>`;
  }
}

function renderResults(data, container) {
  if (data.error || !data.candidates || data.candidates.length === 0) {
    container.innerHTML = `<p class="no-result">${t('vin.noResult')}</p>`;
    return;
  }

  const v = data.vehicle || {};
  const flags = data.flags || {};
  const layerLabels = ['', 'Eksakt match', 'År + merke', 'Merke', 'Prefix4'];
  const layerLabel = layerLabels[data.layer || 0] || 'Statistisk match';

  // Vehicle info banner
  let html = `
    <div class="vehicle-banner">
      <h3>🚗 ${v.make || '?'} ${v.model || '?'} ${v.year ? '(' + v.year + ')' : ''}</h3>
      <p class="meta">Reg.nr: ${v.regnr || '-'} · VIN: ${(v.vin || '-').slice(0, 8)}…${(v.vin || '-').slice(-4)} · kType: ${v.kType || '-'}</p>
      <div class="flags">
        <span class="flag ${flags.adas ? 'on' : 'off'}">ADAS ${flags.adas ? '✓' : '✗'}</span>
        <span class="flag ${flags.rainSensor ? 'on' : 'off'}">Regnsensor ${flags.rainSensor ? '✓' : '✗'}</span>
        <span class="flag ${flags.heated ? 'on' : 'off'}">Oppvarmet ${flags.heated ? '✓' : '✗'}</span>
        <span class="flag ${flags.acoustic ? 'on' : 'off'}">Akustisk ${flags.acoustic ? '✓' : '✗'}</span>
        <span class="flag ${flags.antenna ? 'on' : 'off'}">Antenne ${flags.antenna ? '✓' : '✗'}</span>
        <span class="flag ${flags.hud ? 'on' : 'off'}">HUD ${flags.hud ? '✓' : '✗'}</span>
      </div>
    </div>
    <div class="results-list">
  `;

  data.candidates.forEach((c, idx) => {
    const isTop = idx === 0;
    const confClass = data.confidence || 'medium';
    const confLabel = confClass === 'high' ? 'Høy konfidens' : confClass === 'medium' ? 'Middels konfidens' : 'Lav konfidens';
    const flagTags = [
      c.adas && 'ADAS', c.rainSensor && 'Regnsensor', c.heated && 'Oppvarmet',
      c.acoustic && 'Akustisk', c.antenna && 'Antenne', c.hud && 'HUD',
      c.shade && 'Solstripe', c.camera && 'Kamera', c.laneAssist && 'Filskifteass.'
    ].filter(Boolean);

    html += `
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
        <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center;margin-top:12px">
          <span style="font-family:var(--font-display);font-size:22px;font-weight:700">${c.price ? c.price.toLocaleString('no-NO') + ' kr' : 'Pris på forespørsel'}</span>
          <span class="stock ${c.stockStatus > 0 ? '' : 'out'}">${c.stockStatus > 0 ? c.stockStatus + ' på lager' : 'Bestillingsvare'}</span>
        </div>
        <div class="flags">
          ${flagTags.map(f => `<span class="flag on">${f}</span>`).join('')}
        </div>
        ${c.nagsCodes && c.nagsCodes.length > 0 ? `<div style="margin-top:8px;font-size:11px;color:var(--color-text-muted);font-family:monospace">🇺🇸 NAGS: ${c.nagsCodes.join(', ')}</div>` : ''}
        <div style="display:flex;gap:12px;margin-top:16px">
          <button class="btn-primary" style="padding:10px 20px;font-size:13px">Be om pris</button>
          <button class="btn-secondary" style="padding:10px 20px;font-size:13px">Se detaljer</button>
        </div>
      </div>
    `;
  });

  html += '</div>';
  container.innerHTML = html;
}

// --- Form handling ---
function initForms() {
  document.querySelectorAll('form[data-form]').forEach(form => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const btn = form.querySelector('button[type="submit"]');
      const original = btn.textContent;
      btn.textContent = 'Sender...';
      btn.disabled = true;

      setTimeout(() => {
        btn.textContent = 'Sendt!';
        btn.style.background = 'var(--color-success)';
        form.reset();
        setTimeout(() => {
          btn.textContent = original;
          btn.style.background = '';
          btn.disabled = false;
        }, 2000);
      }, 1200);
    });
  });
}

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initReveal();
  animateStats();
  initLangSwitcher();
  initForms();
});
