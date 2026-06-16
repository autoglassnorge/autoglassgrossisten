/* ============================================================
   Autoglass AS — Shared equipment filters
   Shared by vin-sok.html (search-glass.js) and katalog.html.
   ============================================================ */

const EquipmentFilters = (function () {
  const FILTER_DEFS = [
    { key: 'adas', fieldNames: ['adas'], labels: { no: 'ADAS', sv: 'ADAS', en: 'ADAS' }, class: 'flag-adas' },
    { key: 'rainSensor', fieldNames: ['rain_sensor', 'rainSensor'], labels: { no: 'Regnsensor', sv: 'Regnsensor', en: 'Rain sensor' }, class: 'flag-rain' },
    { key: 'heated', fieldNames: ['heated'], labels: { no: 'Oppvarmet', sv: 'Uppvärmd', en: 'Heated' }, class: 'flag-heat' },
    { key: 'acoustic', fieldNames: ['acoustic'], labels: { no: 'Akustisk', sv: 'Akustisk', en: 'Acoustic' } },
    { key: 'antenna', fieldNames: ['antenna'], labels: { no: 'Antenne', sv: 'Antenn', en: 'Antenna' } },
    { key: 'hud', fieldNames: ['hud'], labels: { no: 'HUD', sv: 'HUD', en: 'HUD' } },
    { key: 'camera', fieldNames: ['camera'], labels: { no: 'Kamera', sv: 'Kamera', en: 'Camera' } },
    { key: 'shade', fieldNames: ['shade'], labels: { no: 'Solskjerm', sv: 'Solskydd', en: 'Sunshade' } },
    { key: 'laneAssist', fieldNames: ['lane_assist', 'laneAssist'], labels: { no: 'Filskifteass.', sv: 'Filbytarass.', en: 'Lane assist' } },
    { key: 'solar', fieldNames: ['solar'], labels: { no: 'Coated / IR-glass / Solfilm', sv: 'Coated / IR-glass / Solfilm', en: 'Coated / IR-glass / Solar' } },
    { key: 'tinted', fieldNames: ['tinted'], labels: { no: 'Tonet', sv: 'Tonad', en: 'Tinted' } },
  ];

  function getLang() {
    return typeof currentLang !== 'undefined' ? currentLang : 'no';
  }

  function _isTruthy(value) {
    return value === 1 || value === true || value === '1';
  }

  function getValue(candidate, filterKey) {
    const def = FILTER_DEFS.find((f) => f.key === filterKey);
    if (!def) return false;
    const fields = def.fieldNames || [def.key];

    for (const name of fields) {
      if (_isTruthy(candidate[name])) return true;
    }

    const bags = [candidate.properties, candidate._equipment, candidate.equipment];
    for (const bag of bags) {
      if (!bag || typeof bag !== 'object') continue;
      for (const name of fields) {
        if (_isTruthy(bag[name])) return true;
      }
    }

    return false;
  }

  function matchesAll(candidate, selectedKeys) {
    if (!selectedKeys || selectedKeys.length === 0) return true;
    for (const key of selectedKeys) {
      if (!getValue(candidate, key)) return false;
    }
    return true;
  }

  function _esc(str) {
    if (typeof escapeHtml === 'function') return escapeHtml(str);
    if (str == null) return '';
    return String(str).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  function renderControls(selectedKeys, options = {}) {
    const lang = options.lang || getLang();
    const idPrefix = options.idPrefix || 'ef-';
    const onchange = options.onchange || '';
    const wrapperClass = options.wrapperClass === undefined ? 'equipment-filters' : options.wrapperClass;
    const itemClass = options.itemClass || '';

    const items = FILTER_DEFS.map((def) => {
      const label = def.labels[lang] || def.labels.no || def.key;
      const checked = selectedKeys && selectedKeys.includes(def.key) ? 'checked' : '';
      const cls = itemClass ? ` class="${_esc(itemClass)}"` : '';
      return `<label${cls} data-filter="${_esc(def.key)}"><input type="checkbox" id="${_esc(idPrefix + def.key)}" value="${_esc(def.key)}" onchange="${_esc(onchange)}" ${checked}> <span>${_esc(label)}</span></label>`;
    }).join('');

    return wrapperClass ? `<div class="${_esc(wrapperClass)}">${items}</div>` : items;
  }

  function renderPills(selectedKeys, options = {}) {
    const lang = options.lang || getLang();
    const onchange = options.onchange || '';
    const itemClass = options.itemClass || 'type-pill filter-pill';

    return FILTER_DEFS.map((def) => {
      const label = def.labels[lang] || def.labels.no || def.key;
      const checked = selectedKeys && selectedKeys.includes(def.key) ? 'checked' : '';
      return `<label class="${_esc(itemClass)}" data-filter="${_esc(def.key)}"><input type="checkbox" value="${_esc(def.key)}" onchange="${_esc(onchange)}" ${checked}> <span>${_esc(label)}</span></label>`;
    }).join('');
  }

  function collectChecked(prefix) {
    const selected = [];
    FILTER_DEFS.forEach((def) => {
      const el = document.getElementById(prefix + def.key);
      if (el && el.checked) selected.push(def.key);
    });
    return selected;
  }

  return {
    FILTER_DEFS,
    getValue,
    matchesAll,
    renderControls,
    renderPills,
    collectChecked,
  };
})();
