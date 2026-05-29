/* ============================================================
   Autoglass AS — Main JavaScript (optimized)
   ============================================================ */

// --- Theme Toggle ---
// NOTE: To prevent FOUC, theme initialization is done via inline <script>
// in <head> of each HTML page (see index.html etc). This function is kept
// for toggle interactions only.
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
  }, { threshold: 0.05, rootMargin: '0px 0px -40px 0px' });

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
  }, { threshold: 0.3 });

  stats.forEach(s => observer.observe(s));
}

// --- Language Switcher ---
function initLangSwitcher() {
  document.querySelectorAll('.lang-switcher button').forEach(btn => {
    btn.addEventListener('click', () => setLang(btn.dataset.lang));
  });
}

// --- Form handling ---
// NOTE: These are demo/simulation handlers. Wire to real endpoints
// by replacing the setTimeout with actual fetch() calls.
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
  initLangSwitcher();
  initForms();

  // Defer heavy / non-critical work
  onIdle(() => {
    animateStats();
  });
});
