/**
 * Autoglass AS — Supabase Auth Integration
 * ==========================================
 * Håndterer innlogging med magic link + session-håndtering.
 *
 * Krever:
 *   SUPABASE_URL=https://xxxx.supabase.co
 *   SUPABASE_ANON_KEY=eyJ...
 *
 * Settes som miljøvariabler ved build, eller hardkodes (anon key er safe å eksponere).
 */

const SUPABASE_URL = window.__AG_CONFIG__?.supabaseUrl || "";
const SUPABASE_KEY = window.__AG_CONFIG__?.supabaseKey || "";

// Lazy-load Supabase client (CDN)
let supabase = null;
async function getSupabase() {
  if (supabase) return supabase;
  if (!window.supabase) {
    await loadScript("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js");
  }
  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  return supabase;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

// ============================================================================
// AUTH FUNKSJONER
// ============================================================================

async function sendMagicLink(email) {
  const sb = await getSupabase();
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${window.location.origin}/kundeportal.html`,
    },
  });
  if (error) throw error;
  return true;
}

async function signInWithPassword(email, password) {
  const sb = await getSupabase();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

async function signOut() {
  const sb = await getSupabase();
  await sb.auth.signOut();
  window.location.href = "index.html";
}

async function getSession() {
  const sb = await getSupabase();
  const { data } = await sb.auth.getSession();
  return data.session;
}

async function getUser() {
  const sb = await getSupabase();
  const { data } = await sb.auth.getUser();
  return data.user;
}

// ============================================================================
// PORTAL BESKYTTELSE
// ============================================================================

async function requireAuth() {
  const session = await getSession();
  if (!session) {
    window.location.href = "kundeportal.html?redirect=" + encodeURIComponent(window.location.pathname);
    return null;
  }
  return session;
}

async function initPortal() {
  const user = await getUser();
  const authSection = document.getElementById("auth-section");
  const portalSection = document.getElementById("portal-section");

  if (!user) {
    if (authSection) authSection.style.display = "block";
    if (portalSection) portalSection.style.display = "none";
    return;
  }

  if (authSection) authSection.style.display = "none";
  if (portalSection) portalSection.style.display = "block";

  // Vis brukerinfo
  const userEmail = document.getElementById("user-email");
  if (userEmail) userEmail.textContent = user.email;
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

document.addEventListener("DOMContentLoaded", () => {
  // Magic link form
  const magicForm = document.getElementById("magic-link-form");
  if (magicForm) {
    magicForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = magicForm.querySelector('input[type="email"]').value;
      const btn = magicForm.querySelector("button");
      const original = btn.textContent;
      try {
        btn.textContent = "Sender...";
        btn.disabled = true;
        await sendMagicLink(email);
        btn.textContent = "Link sendt! Sjekk e-posten.";
        btn.style.background = "var(--color-success)";
      } catch (err) {
        btn.textContent = "Feil: " + err.message;
        btn.style.background = "var(--color-error)";
      }
      setTimeout(() => {
        btn.textContent = original;
        btn.style.background = "";
        btn.disabled = false;
      }, 3000);
    });
  }

  // Password form
  const loginForm = document.getElementById("login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.getElementById("login-email").value;
      const password = document.getElementById("login-password").value;
      const btn = loginForm.querySelector("button[type='submit']");
      const original = btn.textContent;
      try {
        btn.textContent = "Logger inn...";
        btn.disabled = true;
        await signInWithPassword(email, password);
        btn.textContent = "Innlogget!";
        btn.style.background = "var(--color-success)";
        setTimeout(() => {
          const params = new URLSearchParams(window.location.search);
          const redirect = params.get("redirect") || "kundeportal.html";
          window.location.href = redirect;
        }, 800);
      } catch (err) {
        btn.textContent = "Feil: " + err.message;
        btn.style.background = "var(--color-error)";
        setTimeout(() => {
          btn.textContent = original;
          btn.style.background = "";
          btn.disabled = false;
        }, 3000);
      }
    });
  }

  // Init portal hvis vi er på kundeportal
  if (document.getElementById("portal-section")) {
    initPortal();
  }
});
