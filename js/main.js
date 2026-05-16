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

async function searchGlass() {
  const input = document.getElementById('vin-input');
  const resultsEl = document.getElementById('vin-results');
  const query = input.value.trim().toUpperCase();
  if (!query) return;

  resultsEl.innerHTML = `<p class="loading">${t('vin.loading')}</p>`;

  try {
    const res = await fetch(`${API_BASE}/api/glass?regnr=${encodeURIComponent(query)}`, { headers: { 'Accept': 'application/json' } });

    if (res.ok) {
      const data = await res.json();
      renderResults(data, resultsEl);
      return;
    }

    // API svarte, men med feilstatus
    const err = await res.json().catch(() => ({ error: 'Kunne ikke søke. Prøv igjen.' }));
    resultsEl.innerHTML = `<p class="no-result">${err.error || 'Kunne ikke søke. Prøv igjen.'}</p>`;
  } catch (e) {
    // Nettverksfeil — API utilgjengelig
    resultsEl.innerHTML = `<p class="no-result">Nettverksfeil. Sjekk tilkoblingen og prøv igjen.</p>`;
  }
}

function mockSearch(query, resultsEl) {
  // Simulate delay
  setTimeout(() => {
    const mockData = {
      vehicle: { regnr: query, make: 'BMW', model: '3-serie', year: 2021, kType: 12345 },
      candidates: [
        { eurocode: '5351AGNMVHAD', description: 'BMW 3-serie G20 frontrute m/ADAS+regnsensor+oppv.+akustisk+antenne+HUD+solstripe', brand: 'BMW', model: '3-serie', yearFrom: 2019, price: 5850, stockStatus: 3, adas: true, rainSensor: true, heated: true, acoustic: true, antenna: true, hud: true },
        { eurocode: '5351AGNMVHA', description: 'BMW 3-serie G20 frontrute m/ADAS+regnsensor+oppv.+akustisk+antenne+solstripe', brand: 'BMW', model: '3-serie', yearFrom: 2019, price: 5450, stockStatus: 5, adas: true, rainSensor: true, heated: true, acoustic: true, antenna: true, hud: false },
        { eurocode: '5351AGNMVH', description: 'BMW 3-serie G20 frontrute m/ADAS+regnsensor+oppv.+akustisk+solstripe', brand: 'BMW', model: '3-serie', yearFrom: 2019, price: 5200, stockStatus: 8, adas: true, rainSensor: true, heated: true, acoustic: true, antenna: false, hud: false },
      ],
      confidence: 'medium',
      layer: 2,
      flags: { adas: true, rainSensor: true, heated: true, acoustic: true, antenna: true, hud: false },
      sources: ['biluppgifter.tecdoc', 'biluppgifter.oem']
    };
    renderResults(mockData, resultsEl);
  }, 800);
}

function renderResults(data, container) {
  if (data.error || !data.candidates || data.candidates.length === 0) {
    container.innerHTML = `<p class="no-result">${t('vin.noResult')}</p>`;
    return;
  }

  const v = data.vehicle;
  const flags = data.flags || {};

  let html = `
    <div class="result-vehicle" style="padding:20px;background:var(--color-surface-alt);border-radius:var(--radius-md);margin-bottom:20px">
      <h3 style="font-family:var(--font-display);font-size:20px;margin-bottom:8px">${v.make} ${v.model} (${v.year})</h3>
      <p style="font-size:14px;color:var(--color-text-secondary)">Reg.nr: ${v.regnr} · kType: ${v.kType}</p>
      <div class="flags" style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
        ${flags.adas ? '<span class="flag on">ADAS</span>' : ''}
        ${flags.rainSensor ? '<span class="flag on">Regnsensor</span>' : ''}
        ${flags.heated ? '<span class="flag on">Oppvarmet</span>' : ''}
        ${flags.acoustic ? '<span class="flag on">Akustisk</span>' : ''}
        ${flags.antenna ? '<span class="flag on">Antenne</span>' : ''}
        ${flags.hud ? '<span class="flag on">HUD</span>' : ''}
      </div>
    </div>
    <div class="results-list">
  `;

  for (const c of data.candidates) {
    const confClass = data.confidence || 'medium';
    const flagTags = [
      c.adas && 'ADAS', c.rainSensor && 'Regnsensor', c.heated && 'Oppvarmet',
      c.acoustic && 'Akustisk', c.antenna && 'Antenne', c.hud && 'HUD'
    ].filter(Boolean);

    html += `
      <div class="result-item">
        <div class="header">
          <div>
            <div class="eurocode">${c.eurocode}</div>
            <p style="font-size:14px;color:var(--color-text-secondary);margin-top:4px">${c.description}</p>
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
        <div style="display:flex;gap:12px;margin-top:16px">
          <button class="btn-primary" style="padding:10px 20px;font-size:13px">Be om pris</button>
          <button class="btn-secondary" style="padding:10px 20px;font-size:13px">Se detaljer</button>
        </div>
      </div>
    `;
  }

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
