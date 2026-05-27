/**
 * Autoglass AS — Handlekurv (B2B)
 * ================================
 * localStorage-basert handlekurv for verksteder og grossistkunder.
 * Ingen innlogging kreves for å legge i kurv — pris vises etter innlogging.
 */

const CART_KEY = 'autoglass_cart_v1';

function getCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY)) || [];
  } catch {
    return [];
  }
}

function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateCartBadge();
  window.dispatchEvent(new CustomEvent('cartChanged', { detail: { cart } }));
}

function addToCart(item) {
  const cart = getCart();
  const existing = cart.find(i => i.eurocode === item.eurocode);
  if (existing) {
    existing.quantity += item.quantity || 1;
    existing.updatedAt = new Date().toISOString();
  } else {
    cart.push({
      eurocode: item.eurocode,
      description: item.description || '',
      brand: item.brand || '',
      model: item.model || '',
      category: item.category || 'frontrute',
      supplier: item.supplier || '',
      imageUrl: item.imageUrl || '',
      adas: item.adas || false,
      rain_sensor: item.rain_sensor || false,
      heated: item.heated || false,
      acoustic: item.acoustic || false,
      quantity: item.quantity || 1,
      addedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }
  saveCart(cart);
  showCartToast(item.eurocode, item.description);
}

function removeFromCart(eurocode) {
  const cart = getCart().filter(i => i.eurocode !== eurocode);
  saveCart(cart);
}

function updateQuantity(eurocode, qty) {
  const cart = getCart();
  const item = cart.find(i => i.eurocode === eurocode);
  if (!item) return;
  if (qty <= 0) {
    removeFromCart(eurocode);
    return;
  }
  item.quantity = qty;
  item.updatedAt = new Date().toISOString();
  saveCart(cart);
}

function getCartCount() {
  return getCart().reduce((sum, i) => sum + i.quantity, 0);
}

function getCartItems() {
  return getCart();
}

function clearCart() {
  localStorage.removeItem(CART_KEY);
  updateCartBadge();
}

function updateCartBadge() {
  const count = getCartCount();
  document.querySelectorAll('.cart-badge').forEach(el => {
    el.textContent = count;
    el.style.display = count > 0 ? 'flex' : 'none';
  });
}

function showCartToast(eurocode, desc) {
  let toast = document.getElementById('cart-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'cart-toast';
    toast.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;background:var(--color-primary-900);color:#fff;padding:16px 24px;border-radius:var(--radius-md);box-shadow:var(--shadow-lg);transform:translateY(100px);opacity:0;transition:all .3s ease;max-width:340px;font-size:14px;';
    document.body.appendChild(toast);
  }
  toast.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px">
      <span style="font-size:20px">🛒</span>
      <div>
        <div style="font-weight:600">Lagt i handlekurv</div>
        <div style="font-size:13px;opacity:.8;margin-top:2px">${eurocode}${desc ? ' — ' + desc.substring(0, 40) : ''}</div>
      </div>
    </div>
    <div style="display:flex;gap:8px;margin-top:12px">
      <a href="handlekurv.html" style="background:var(--color-accent);color:var(--color-primary-900);padding:8px 16px;border-radius:var(--radius-sm);font-size:13px;font-weight:600;text-decoration:none">Gå til handlekurv</a>
      <button onclick="this.closest('#cart-toast').style.opacity='0';this.closest('#cart-toast').style.transform='translateY(100px)';" style="background:rgba(255,255,255,.1);color:#fff;padding:8px 16px;border-radius:var(--radius-sm);font-size:13px;border:none;cursor:pointer">Fortsett å handle</button>
    </div>
  `;
  requestAnimationFrame(() => {
    toast.style.transform = 'translateY(0)';
    toast.style.opacity = '1';
  });
  setTimeout(() => {
    toast.style.transform = 'translateY(100px)';
    toast.style.opacity = '0';
  }, 5000);
}

// Cart drawer / modal
function openCartDrawer() {
  let drawer = document.getElementById('cart-drawer');
  if (!drawer) {
    drawer = document.createElement('div');
    drawer.id = 'cart-drawer';
    drawer.style.cssText = 'position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,0.5);display:none;align-items:flex-end;justify-content:flex-end';
    drawer.innerHTML = `
      <div style="background:var(--color-surface);width:100%;max-width:460px;height:100%;max-height:90vh;border-radius:var(--radius-lg) var(--radius-lg) 0 0;padding:24px;display:flex;flex-direction:column;transform:translateY(100%);transition:transform .3s ease;overflow:hidden">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
          <h3 style="font-size:20px">🛒 Handlekurv</h3>
          <button onclick="closeCartDrawer()" style="font-size:24px;background:none;border:none;cursor:pointer;color:var(--color-text-secondary)">&times;</button>
        </div>
        <div id="cart-drawer-items" style="flex:1;overflow-y:auto"></div>
        <div id="cart-drawer-footer" style="border-top:1px solid var(--color-border);padding-top:16px;margin-top:16px"></div>
      </div>
    `;
    drawer.addEventListener('click', e => { if (e.target === drawer) closeCartDrawer(); });
    document.body.appendChild(drawer);
  }
  renderCartDrawer();
  drawer.style.display = 'flex';
  requestAnimationFrame(() => {
    drawer.querySelector('div').style.transform = 'translateY(0)';
  });
}

function closeCartDrawer() {
  const drawer = document.getElementById('cart-drawer');
  if (!drawer) return;
  drawer.querySelector('div').style.transform = 'translateY(100%)';
  setTimeout(() => { drawer.style.display = 'none'; }, 300);
}

function renderCartDrawer() {
  const items = getCartItems();
  const itemsEl = document.getElementById('cart-drawer-items');
  const footerEl = document.getElementById('cart-drawer-footer');

  if (items.length === 0) {
    itemsEl.innerHTML = `
      <div style="text-align:center;padding:60px 20px;color:var(--color-text-secondary)">
        <div style="font-size:48px;margin-bottom:16px">🛒</div>
        <h4 style="margin-bottom:8px">Handlekurven er tom</h4>
        <p style="font-size:14px;margin-bottom:20px">Søk etter glass i katalogen og legg til produkter.</p>
        <a href="katalog.html" class="btn-primary" style="padding:10px 20px;font-size:14px">Gå til katalog</a>
      </div>`;
    footerEl.innerHTML = '';
    return;
  }

  itemsEl.innerHTML = items.map(item => `
    <div style="display:flex;gap:12px;padding:12px 0;border-bottom:1px solid var(--color-border)">
      <div style="width:60px;height:60px;background:var(--color-surface-alt);border-radius:var(--radius-sm);display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden">
        ${item.imageUrl ? `<img src="${item.imageUrl}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none';this.parentElement.innerHTML='🪟'">` : '🪟'}
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-family:monospace;font-size:14px;font-weight:600;color:var(--color-accent)">${item.eurocode}</div>
        <div style="font-size:13px;color:var(--color-text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${item.description || ''}</div>
        <div style="font-size:12px;color:var(--color-text-muted)">${item.brand || ''} ${item.model || ''}</div>
        <div style="display:flex;align-items:center;gap:8px;margin-top:8px">
          <button onclick="updateQuantity('${item.eurocode}', ${item.quantity - 1})" style="width:28px;height:28px;border-radius:var(--radius-sm);border:1px solid var(--color-border);background:var(--color-surface);cursor:pointer;font-size:14px">−</button>
          <span style="font-size:14px;font-weight:600;min-width:24px;text-align:center">${item.quantity}</span>
          <button onclick="updateQuantity('${item.eurocode}', ${item.quantity + 1})" style="width:28px;height:28px;border-radius:var(--radius-sm);border:1px solid var(--color-border);background:var(--color-surface);cursor:pointer;font-size:14px">+</button>
          <button onclick="removeFromCart('${item.eurocode}');renderCartDrawer();" style="margin-left:auto;font-size:12px;color:var(--color-error);background:none;border:none;cursor:pointer">Fjern</button>
        </div>
      </div>
    </div>
  `).join('');

  const totalQty = items.reduce((s, i) => s + i.quantity, 0);
  footerEl.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <span style="color:var(--color-text-secondary)">Totalt antall</span>
      <span style="font-weight:600">${totalQty} stk</span>
    </div>
    <div style="font-size:12px;color:var(--color-text-muted);margin-bottom:12px">Priser vises etter innlogging. Logg inn i kundeportalen for å se dine avtalte priser.</div>
    <div style="display:flex;gap:10px">
      <a href="handlekurv.html" class="btn-primary" style="flex:1;text-align:center;padding:12px;font-size:14px">Til bestilling</a>
      <button onclick="closeCartDrawer()" class="btn-secondary" style="padding:12px 20px;font-size:14px">Lukk</button>
    </div>
  `;
}

// Inject cart icon into header
function injectCartIcon() {
  const headers = document.querySelectorAll('.header-actions');
  headers.forEach(header => {
    if (header.querySelector('.cart-icon-btn')) return;
    const btn = document.createElement('button');
    btn.className = 'cart-icon-btn';
    btn.onclick = openCartDrawer;
    btn.style.cssText = 'position:relative;background:none;border:none;cursor:pointer;font-size:22px;padding:6px;color:var(--color-text-primary)';
    btn.innerHTML = `🛒<span class="cart-badge" style="position:absolute;top:-4px;right:-4px;min-width:18px;height:18px;background:var(--color-accent);color:var(--color-primary-900);font-size:11px;font-weight:700;border-radius:50%;display:none;align-items:center;justify-content:center;padding:0 4px">0</span>`;
    header.insertBefore(btn, header.firstChild);
  });
  updateCartBadge();
}

// Init
document.addEventListener('DOMContentLoaded', () => {
  injectCartIcon();
  window.addEventListener('cartChanged', updateCartBadge);
});

// Expose globally
window.addToCart = addToCart;
window.removeFromCart = removeFromCart;
window.updateQuantity = updateQuantity;
window.getCartCount = getCartCount;
window.getCartItems = getCartItems;
window.clearCart = clearCart;
window.openCartDrawer = openCartDrawer;
window.closeCartDrawer = closeCartDrawer;
window.renderCartDrawer = renderCartDrawer;
