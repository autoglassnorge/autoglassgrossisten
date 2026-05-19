/**
 * Autoglass AS — Cloudflare Access Auth Integration
 * ==================================================
 * Byttet fra Supabase til Cloudflare Access (Mai 2026).
 *
 * CF Access håndterer:
 *   - Identity (Google, Microsoft, One-time PIN)
 *   - Session-cookies
 *   - Login/logout redirects
 *
 * Denne filen:
 *   - Sjekker /api/me for å vite om bruker er innlogget
 *   - Viser brukerinfo eller login-knapp
 *   - Lagrer siste søk i localStorage (knyttet til e-post)
 */

const AUTH_API = '/api/me';

// ============================================================================
// STATE
// ============================================================================

let currentUser = null;

// ============================================================================
// API
// ============================================================================

async function fetchUser() {
  try {
    const res = await fetch(AUTH_API, { credentials: 'include' });
    if (!res.ok) return null;
    const data = await res.json();
    return data.authenticated ? data : null;
  } catch {
    return null;
  }
}

// ============================================================================
// UI — Header auth widget
// ============================================================================

function renderAuthWidget(user) {
  const container = document.getElementById('auth-widget');
  if (!container) return;

  if (user) {
    container.innerHTML = `
      <div class="auth-user" style="display:flex;align-items:center;gap:12px">
        <span style="font-size:13px;color:var(--color-text-secondary)">${escapeHtml(user.email)}</span>
        <button class="btn-secondary btn-sm" onclick="handleLogout()">Logg ut</button>
      </div>
    `;
  } else {
    container.innerHTML = `
      <a href="kundeportal.html" class="btn-login" data-i18n="nav.login">Logg inn</a>
    `;
  }
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m]));
}

// ============================================================================
// ACTIONS
// ============================================================================

function handleLogout() {
  // Cloudflare Access: redirect til logout-URL eller bare reload
  // Når CF Access er konfigurert, vil /cdn-cgi/access/logout fungere
  const logoutUrl = '/cdn-cgi/access/logout';
  window.location.href = logoutUrl;
}

// ============================================================================
// PORTAL — kundeportal.html
// ============================================================================

async function initPortal() {
  const user = await fetchUser();
  currentUser = user;

  const authSection = document.getElementById('auth-section');
  const portalSection = document.getElementById('portal-section');
  const loginPrompt = document.getElementById('login-prompt');

  if (!user) {
    if (authSection) authSection.style.display = 'block';
    if (portalSection) portalSection.style.display = 'none';
    if (loginPrompt) loginPrompt.style.display = 'flex';
    return;
  }

  if (authSection) authSection.style.display = 'none';
  if (portalSection) portalSection.style.display = 'block';
  if (loginPrompt) loginPrompt.style.display = 'none';

  // Vis brukerinfo
  const userEmail = document.getElementById('user-email');
  if (userEmail) userEmail.textContent = user.email;

  // Lagrede kjøretøy
  renderSavedVehicles(user.email);

  // Siste søk
  renderRecentSearches(user.email);
}

function renderSavedVehicles(email) {
  const container = document.getElementById('saved-vehicles');
  if (!container) return;
  const key = `ag_vehicles_${email}`;
  const vehicles = JSON.parse(localStorage.getItem(key) || '[]');

  if (vehicles.length === 0) {
    container.innerHTML = '<p class="empty-hint">Ingen lagrede kjøretøy ennå. Søk på et regnr og klikk "Lagre kjøretøy".</p>';
    return;
  }

  container.innerHTML = vehicles.map((v, i) => `
    <div class="vehicle-card" style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px;background:var(--color-surface);border-radius:var(--radius-md);border:1px solid var(--color-border)">
      <div>
        <strong>${escapeHtml(v.make)} ${escapeHtml(v.model)}</strong>
        <span style="color:var(--color-text-secondary);font-size:13px"> · ${escapeHtml(v.regnr)} · ${v.year}</span>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn-primary btn-sm" onclick="quickSearch('${escapeHtml(v.regnr)}')">Søk igjen</button>
        <button class="btn-secondary btn-sm" onclick="removeVehicle(${i}, '${escapeHtml(email)}')">Fjern</button>
      </div>
    </div>
  `).join('');
}

function renderRecentSearches(email) {
  const container = document.getElementById('recent-searches');
  if (!container) return;
  const key = `ag_searches_${email}`;
  const searches = JSON.parse(localStorage.getItem(key) || '[]');

  if (searches.length === 0) {
    container.innerHTML = '<p class="empty-hint">Ingen nylige søk.</p>';
    return;
  }

  container.innerHTML = searches.slice(0, 5).map((s) => `
    <button class="btn-secondary" style="font-size:13px;padding:8px 14px" onclick="quickSearch('${escapeHtml(s.regnr)}')">
      ${escapeHtml(s.regnr)} — ${escapeHtml(s.make)} ${escapeHtml(s.model)}
    </button>
  `).join('');
}

function saveVehicle(email, vehicle) {
  const key = `ag_vehicles_${email}`;
  const vehicles = JSON.parse(localStorage.getItem(key) || '[]');
  // Uniquify by regnr
  const filtered = vehicles.filter((v) => v.regnr !== vehicle.regnr);
  filtered.unshift(vehicle);
  localStorage.setItem(key, JSON.stringify(filtered.slice(0, 20)));
}

function removeVehicle(index, email) {
  const key = `ag_vehicles_${email}`;
  const vehicles = JSON.parse(localStorage.getItem(key) || '[]');
  vehicles.splice(index, 1);
  localStorage.setItem(key, JSON.stringify(vehicles));
  renderSavedVehicles(email);
}

function addRecentSearch(email, search) {
  const key = `ag_searches_${email}`;
  const searches = JSON.parse(localStorage.getItem(key) || '[]');
  const filtered = searches.filter((s) => s.regnr !== search.regnr);
  filtered.unshift(search);
  localStorage.setItem(key, JSON.stringify(filtered.slice(0, 10)));
}

// ============================================================================
// INTEGRATION — GlassSearch lagrer automatisk
// ============================================================================

// Hook into search results to save searches
function initSearchTracking() {
  // Patch the existing GlassSearch class if available
  if (typeof GlassSearch !== 'undefined') {
    const originalRender = GlassSearch.prototype.render;
    GlassSearch.prototype.render = function(data) {
      originalRender.call(this, data);
      if (data.vehicle && data.vehicle.regnr && currentUser) {
        addRecentSearch(currentUser.email, {
          regnr: data.vehicle.regnr,
          make: data.vehicle.make,
          model: data.vehicle.model,
          year: data.vehicle.year,
          ts: Date.now(),
        });
      }
    };
  }
}

// ============================================================================
// INIT
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  // Alltid sjekk bruker først
  const user = await fetchUser();
  currentUser = user;

  // Render header widget hvis den finnes
  renderAuthWidget(user);

  // Init portal hvis vi er på kundeportal
  if (document.getElementById('portal-section')) {
    initPortal();
  }

  // Init search tracking
  initSearchTracking();
});
