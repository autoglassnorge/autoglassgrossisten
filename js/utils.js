/* ============================================================
   Autoglass AS — Shared Utilities
   ============================================================ */

/**
 * Debounce a function — wait `ms` after last call before executing.
 */
function debounce(fn, ms = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

/**
 * Throttle a function — execute at most once per `ms`.
 */
function throttle(fn, ms = 300) {
  let last = 0;
  return (...args) => {
    const now = Date.now();
    if (now - last >= ms) {
      last = now;
      fn.apply(this, args);
    }
  };
}

/**
 * Simple TTL cache backed by localStorage.
 */
const Cache = {
  prefix: 'ag_cache_',
  get(key, ttlMs = 3600000) {
    try {
      const raw = localStorage.getItem(this.prefix + key);
      if (!raw) return null;
      const { ts, data } = JSON.parse(raw);
      if (Date.now() - ts > ttlMs) {
        localStorage.removeItem(this.prefix + key);
        return null;
      }
      return data;
    } catch {
      return null;
    }
  },
  set(key, data) {
    try {
      localStorage.setItem(this.prefix + key, JSON.stringify({ ts: Date.now(), data }));
    } catch {
      // Quota exceeded — silently fail
    }
  },
  clear() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(this.prefix)) keys.push(k);
    }
    keys.forEach(k => localStorage.removeItem(k));
  },
};

/**
 * Retry an async operation with exponential backoff.
 */
async function retryWithBackoff(fn, { maxRetries = 3, baseDelay = 1000, maxDelay = 8000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === maxRetries) break;
      const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

/**
 * Create an IntersectionObserver that swaps data-src → src when visible.
 * Returns a cleanup function.
 */
function createLazyImageObserver(container) {
  if (!('IntersectionObserver' in window)) {
    // Fallback: load all immediately
    container.querySelectorAll('img[data-src]').forEach(img => {
      img.src = img.dataset.src;
      img.removeAttribute('data-src');
    });
    return () => {};
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        if (img.dataset.src) {
          img.src = img.dataset.src;
          img.removeAttribute('data-src');
        }
        observer.unobserve(img);
      }
    });
  }, { rootMargin: '200px 0px', threshold: 0.01 });

  container.querySelectorAll('img[data-src]').forEach(img => observer.observe(img));

  return () => observer.disconnect();
}

/**
 * Escape HTML for safe injection.
 */
function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m]));
}

/**
 * Request idle callback wrapper with setTimeout fallback.
 */
function onIdle(fn, timeout = 2000) {
  if ('requestIdleCallback' in window) {
    requestIdleCallback(fn, { timeout });
  } else {
    setTimeout(fn, 1);
  }
}
