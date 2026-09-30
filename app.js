(function () {
  'use strict';

  /* =========================================================
     CONFIGURATION
     ========================================================= */

  const KEY = 'kothar_medical_inventory_v5';
  const SECURITY_KEY = 'kothar_medical_security_v1';

  const CATS = [
    'Machines médicales',
    'Dispositifs médicaux',
    'Laboratoire',
    'Consommables',
    'Réactifs',
    'Équipements'
  ];

  const DEFAULT = {
    settings: {
      director: 'Mohamed Mahmoud / Amar',
      engineer: 'Abderrahmane / said',
      threshold: 5,
      color: '#7B3452',
      logo: '',
      lastOrderNumber: 0,
      supplierOrderCounters: {},
      recoveryCode: '0000'
    },
    manufacturers: [],
    products: [],
    entries: [],
    exits: [],
    clients: [],
    orders: []
  };

  const SECURITY_DEFAULT = {
    users: [
      {
        id: 'director',
        username: 'directeur',
        password: '2468',
        role: 'director',
        name: 'Directeur',
        active: true
      },
      {
        id: 'responsable',
        username: 'responsable',
        password: '1357',
        role: 'responsable',
        name: 'Responsable',
        active: true
      }
    ],
    current: null,
    audit: []
  };

  let db = load();
  let security = loadSecurity();
  let selectedManufacturer = null;

  /* =========================================================
     OUTILS
     ========================================================= */

  function clone(x) {
    return JSON.parse(JSON.stringify(x));
  }

  function $(id) {
    return document.getElementById(id);
  }

  function id(prefix) {
    return (
      prefix +
      '_' +
      Date.now().toString(36) +
      '_' +
      Math.random().toString(36).slice(2, 8)
    );
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>'"]/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[c]));
  }

  function today() {
    const d = new Date();

    return (
      d.getFullYear() +
      '-' +
      String(d.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(d.getDate()).padStart(2, '0')
    );
  }

  function toast(text, type = 'success') {
    const box = $('toastContainer');
    if (!box) return;

    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = text;
    box.appendChild(el);

    setTimeout(() => el.remove(), 3000);
  }

  /* =========================================================
     SAUVEGARDE
     ========================================================= */

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return clone(DEFAULT);

      const x = JSON.parse(raw);

      return {
        settings: {
          ...DEFAULT.settings,
          ...(x.settings || {})
        },
        manufacturers: Array.isArray(x.manufacturers)
          ? x.manufacturers : [],
        products: Array.isArray(x.products) ? x.products : [],
        entries: Array.isArray(x.entries) ? x.entries : [],
        exits: Array.isArray(x.exits) ? x.exits : [],
        clients: Array.isArray(x.clients) ? x.clients : [],
        orders: Array.isArray(x.orders) ? x.orders : []
      };
    } catch (e) {
      return clone(DEFAULT);
    }
  }

  function loadSecurity() {
    try {
      const raw = localStorage.getItem(SECURITY_KEY);
      if (!raw) return clone(SECURITY_DEFAULT);

      const x = JSON.parse(raw);

      return {
        users: Array.isArray(x.users) && x.users.length
          ? x.users
          : clone(SECURITY_DEFAULT.users),
        current: null,
        audit: Array.isArray(x.audit) ? x.audit : []
      };
    } catch (e) {
      return clone(SECURITY_DEFAULT);
    }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch (e) {
      toast('Erreur de sauvegarde', 'error');
    }
  }

  function saveSecurity() {
    try {
      localStorage.setItem(
        SECURITY_KEY,
        JSON.stringify({
          users: security.users,
          current: null,
          audit: security.audit.slice(-500)
        })
      );
    } catch (e) {}
  }

  /* =========================================================
     UTILISATEUR / SÉCURITÉ
     ========================================================= */

  function currentUser() {
    return security.current;
  }

  function isLoggedIn() {
    return !!security.current;
  }

  function isDirector() {
    return security.current?.role === 'director';
  }

  function connectedUserName() {
    return (
      security.current?.name ||
      security.current?.username ||
      '—'
    );
  }

  function connectedUserRoleLabel() {
    if (security.current?.role === 'director') {
      return 'Directeur';
    }

    if (security.current?.role === 'responsable') {
      return 'Responsable';
    }

    return '—';
  }

  function audit(action, details = '') {
    security.audit.push({
      id: id('audit'),
      dateTime: new Date().toISOString(),
      username: security.current?.username || '—',
      name: security.current?.name || '—',
      role: security.current?.role || '—',
      action,
      details
    });

    saveSecurity();
  }

  function requireLogin() {
    if (isLoggedIn()) return true;
    ensureSecurityUI();
    return false;
  }

  function requireDirector(action = 'cette action') {
    if (!requireLogin()) return false;
    if (isDirector()) return true;

    toast(
      'Accès refusé : seul le Directeur peut effectuer ' +
      action + '.',
      'error'
    );

    audit('Accès refusé', action);
    return false;
  }

  /* =========================================================
     CONNEXION
     ========================================================= */

  function ensureSecurityUI() {
    if ($('kotharSecurityOverlay')) {
      showLoginUsers();
      return;
    }

    const style = document.createElement('style');
    style.id = 'kotharSecurityStyle';

    style.textContent = `
      #kotharSecurityOverlay {
        position:fixed;
        inset:0;
        background:rgba(0,0,0,.60);
        display:flex;
        align-items:center;
        justify-content:center;
        z-index:999999;
      }

      #kotharSecurityBox {
        width:min(420px,92vw);
        background:#fff;
        border-radius:16px;
        padding:28px;
        box-shadow:0 25px 70px rgba(0,0,0,.30);
      }

      #kotharSecurityBox h2 {
        margin:0 0 8px;
        color:var(--primary,#7B3452);
      }

      #kotharSecurityBox p {
        margin:0 0 20px;
        color:#666;
        font-size:13px;
      }

      #kotharSecurityBox label {
        display:block;
        font-size:12px;
        font-weight:700;
        margin:10px 0 5px;
      }

      #kotharSecurityBox input {
        width:100%;
        box-sizing:border-box;
        height:43px;
        border:1px solid #ddd;
        border-radius:8px;
        padding:0 12px;
      }

      #kotharSecurityLogin {
        width:100%;
        height:43px;
        margin-top:10px;
        border:0;
        border-radius:8px;
        background:var(--primary,#7B3452);
        color:#fff;
        font-weight:700;
        cursor:pointer;
      }

      #kotharForgotLink {
        display:block;
        text-align:center;
        margin-top:12px;
        font-size:12px;
        color:var(--primary,#7B3452);
        cursor:pointer;
        font-weight:600;
        text-decoration:underline;
        background:none;
        border:0;
        width:100%;
      }

      #kotharSecurityQuickUsers {
        display:flex;
        flex-direction:column;
        gap:6px;
        max-height:260px;
        overflow-y:auto;
      }

      #kotharSecurityQuickUsers.kothar-users-collapsed {
        display:none;
      }

      .kothar-users-label-row {
        display:flex;
        align-items:center;
        justify-content:space-between;
      }

      #kotharToggleUsersBtn {
        border:0;
        background:none;
        cursor:pointer;
        font-size:14px;
        color:var(--primary,#7B3452);
        font-weight:700;
        transition:transform .15s ease;
        padding:2px 6px;
      }

      #kotharToggleUsersBtn.kothar-arrow-open {
        transform:rotate(180deg);
      }

      .kothar-login-user {
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:10px;
        width:100%;
        border:1px solid #eee;
        background:#fff;
        border-radius:6px;
        padding:9px 12px;
        cursor:pointer;
        text-align:left;
      }

      .kothar-login-user:hover {
        background:#f7f7f8;
      }

      .kothar-login-user.selected {
        color:#fff;
        background:var(--primary,#7B3452);
        border-color:var(--primary,#7B3452);
      }

      .kothar-login-user-name {
        font-weight:700;
        font-size:13px;
      }

      .kothar-login-user-role {
        font-size:10px;
        opacity:.75;
        white-space:nowrap;
      }

      #kotharSecurityError {
        min-height:20px;
        color:#b42318;
        font-size:12px;
        margin-top:8px;
      }

      #kotharConnectedUserTop {
        position:fixed;
        top:10px;
        right:15px;
        z-index:9998;
        display:flex;
        align-items:center;
        gap:8px;
        background:var(--primary,#7B3452);
        color:#fff;
        padding:8px 12px;
        border-radius:8px;
        font-size:12px;
        font-weight:600;
        box-shadow:0 4px 15px rgba(0,0,0,.15);
      }

      #kotharConnectedUserTop .connected-role {
        opacity:.8;
        font-size:10px;
      }

      #kotharConnectedLogout {
        border:0;
        border-radius:5px;
        padding:4px 7px;
        cursor:pointer;
      }

      .order-lines {
        margin-top:8px;
      }

      .order-line {
        padding:10px 0;
        border-bottom:1px solid #eee;
        font-size:13px;
        color:#333;
      }

      .order-line:last-child {
        border-bottom:0;
      }

      .order-line b {
        margin-right:6px;
      }
    `;

    document.head.appendChild(style);

    const overlay = document.createElement('div');
    overlay.id = 'kotharSecurityOverlay';

    overlay.innerHTML = `
      <div id="kotharSecurityBox">
        <h2>🔐 Kothar Médical</h2>

        <p>
          Connectez-vous pour accéder à la gestion du stock.
        </p>

        <div class="kothar-users-label-row">
          <label style="margin:0;">Utilisateur</label>

          <button
            type="button"
            id="kotharToggleUsersBtn"
            class="kothar-arrow-open"
            title="Afficher / masquer tous les utilisateurs">
            ▾
          </button>
        </div>

        <div id="kotharSecurityQuickUsers"></div>

        <input id="kotharSecurityUsername" type="hidden">

        <label>Code / mot de passe</label>

        <input
          id="kotharSecurityPassword"
          type="password"
          placeholder="Saisir votre code"
          autocomplete="current-password">

        <div id="kotharSecurityError"></div>

        <button id="kotharSecurityLogin">
          Se connecter
        </button>

        <button type="button" id="kotharForgotLink">
          Mot de passe oublié ?
        </button>
      </div>
    `;

    document.body.appendChild(overlay);
    showLoginUsers();

    $('kotharSecurityLogin').onclick = loginSecurity;

    $('kotharSecurityPassword').onkeydown = e => {
      if (e.key === 'Enter') loginSecurity();
    };

    $('kotharForgotLink').onclick = forgotPasswordFlow;

    $('kotharToggleUsersBtn').onclick = () => {
      const box = $('kotharSecurityQuickUsers');
      const btn = $('kotharToggleUsersBtn');

      const collapsed = box.classList.toggle(
        'kothar-users-collapsed'
      );

      btn.classList.toggle('kothar-arrow-open', !collapsed);
    };
  }

  function showLoginUsers() {
    const box = $('kotharSecurityQuickUsers');
    if (!box) return;

    const users = security.users.filter(u => u.active !== false);

    box.innerHTML = users.map(u => `
      <button
        type="button"
        class="kothar-login-user"
        data-login-user="${esc(u.username)}">

        <span class="kothar-login-user-name">
          ${esc(u.name)}
        </span>

        <span class="kothar-login-user-role">
          ${u.role === 'director' ? 'Directeur' : 'Responsable'}
        </span>
      </button>
    `).join('') || '<div>Aucun utilisateur actif.</div>';

    box.querySelectorAll('[data-login-user]').forEach(btn => {
      btn.onclick = () => {
        $('kotharSecurityUsername').value = btn.dataset.loginUser;
        $('kotharSecurityPassword').value = '';
        $('kotharSecurityError').textContent = '';

        box.querySelectorAll('.kothar-login-user').forEach(x => {
          x.classList.remove('selected');
        });

        btn.classList.add('selected');
        $('kotharSecurityPassword')?.focus();
      };
    });

    if (users.length && !$('kotharSecurityUsername')?.value) {
      box.querySelector('[data-login-user]')?.click();
    }
  }

  function loginSecurity() {
    const username = (
      $('kotharSecurityUsername')?.value || ''
    ).trim();

    const password = $('kotharSecurityPassword')?.value || '';

    if (!username) {
      $('kotharSecurityError').textContent =
        'Choisissez un utilisateur.';
      return;
    }

    const user = security.users.find(u =>
      String(u.username).toLowerCase() === username.toLowerCase() &&
      u.password === password &&
      u.active !== false
    );

    if (!user) {
      $('kotharSecurityError').textContent =
        'Code / mot de passe incorrect.';
      return;
    }

    security.current = {
      id: user.id,
      username: user.username,
      role: user.role,
      name: user.name
    };

    audit('Connexion', 'Connexion réussie');

    $('kotharSecurityOverlay')?.remove();

    addSecurityUserBadge();
    updateConnectedUserHeader();
    render();

    toast('Bienvenue ' + user.name);
  }

  function forgotPasswordFlow() {
    const box = document.createElement('div');
    box.id = 'kotharForgotOverlay';

    box.style = `
      position:fixed;
      inset:0;
      background:rgba(0,0,0,.60);
      display:flex;
      align-items:center;
      justify-content:center;
      z-index:1000000;
    `;

    box.innerHTML = `
      <div style="width:min(420px,92vw);background:#fff;border-radius:16px;padding:28px;box-shadow:0 25px 70px rgba(0,0,0,.30);">

        <h2 style="margin:0 0 8px;color:var(--primary,#7B3452);">
          🔑 Mot de passe oublié
        </h2>

        <p style="margin:0 0 16px;color:#666;font-size:13px;">
          Demandez le code de récupération au Directeur,
          choisissez votre compte puis définissez un nouveau
          mot de passe.
        </p>

        <label style="display:block;font-size:12px;font-weight:700;margin:10px 0 5px;">
          Utilisateur *
        </label>

        <select
          id="forgotUsername"
          style="width:100%;box-sizing:border-box;height:43px;border:1px solid #ddd;border-radius:8px;padding:0 12px;">

          <option value="">Choisir un utilisateur</option>

          ${security.users
            .filter(u => u.active !== false)
            .map(u => `
              <option value="${esc(u.username)}">
                ${esc(u.name)}
                (${u.role === 'director' ? 'Directeur' : 'Responsable'})
              </option>
            `).join('')}
        </select>

        <label style="display:block;font-size:12px;font-weight:700;margin:10px 0 5px;">
          Code de récupération *
        </label>

        <input
          id="forgotRecoveryCode"
          type="password"
          placeholder="Code de récupération (fourni par le Directeur)"
          style="width:100%;box-sizing:border-box;height:43px;border:1px solid #ddd;border-radius:8px;padding:0 12px;">

        <label style="display:block;font-size:12px;font-weight:700;margin:10px 0 5px;">
          Nouveau mot de passe *
        </label>

        <input
          id="forgotNewPassword"
          type="password"
          placeholder="Nouveau mot de passe"
          style="width:100%;box-sizing:border-box;height:43px;border:1px solid #ddd;border-radius:8px;padding:0 12px;">

        <div
          id="forgotError"
          style="min-height:20px;color:#b42318;font-size:12px;margin-top:8px;">
        </div>

        <div style="display:flex;gap:10px;margin-top:10px;">
          <button
            type="button"
            id="forgotCancel"
            style="flex:1;height:43px;border:1px solid #ddd;border-radius:8px;background:#fff;cursor:pointer;font-weight:600;">
            Annuler
          </button>

          <button
            type="button"
            id="forgotConfirm"
            style="flex:1;height:43px;border:0;border-radius:8px;background:var(--primary,#7B3452);color:#fff;font-weight:700;cursor:pointer;">
            Réinitialiser
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(box);
    $('forgotCancel').onclick = () => box.remove();

    $('forgotConfirm').onclick = () => {
      const username = $('forgotUsername').value;
      const code = $('forgotRecoveryCode').value;
      const newPassword = $('forgotNewPassword').value;

      if (!username) {
        $('forgotError').textContent = 'Choisissez un utilisateur.';
        return;
      }

      if (!newPassword) {
        $('forgotError').textContent =
          'Saisissez un nouveau mot de passe.';
        return;
      }

      if (code !== String(db.settings.recoveryCode || '')) {
        $('forgotError').textContent =
          'Code de récupération incorrect.';
        return;
      }

      const user = security.users.find(u =>
        u.username.toLowerCase() === username.toLowerCase()
      );

      if (!user) {
        $('forgotError').textContent = 'Utilisateur introuvable.';
        return;
      }

      user.password = newPassword;
      saveSecurity();

      audit(
        'Réinitialisation mot de passe (oublié)',
        user.username
      );

      box.remove();
      toast('Mot de passe réinitialisé, connectez-vous.');
    };
  }

  function addSecurityUserBadge() {
    let el = $('kotharConnectedUserTop');

    if (!el) {
      el = document.createElement('div');
      el.id = 'kotharConnectedUserTop';
      document.body.appendChild(el);
    }

    if (!security.current) {
      el.style.display = 'none';
      return;
    }

    el.style.display = 'flex';

    el.innerHTML = `
      <span>👤</span>
      <span>
        ${esc(security.current.name)}
        <span class="connected-role">
          · ${
            security.current.role === 'director'
              ? 'Directeur'
              : 'Responsable'
          }
        </span>
      </span>

      <button id="kotharConnectedLogout">
        Déconnexion
      </button>
    `;

    $('kotharConnectedLogout').onclick = logout;
  }

  function logout() {
    audit('Déconnexion');
    security.current = null;

    const el = $('kotharConnectedUserTop');
    if (el) el.style.display = 'none';

    updateConnectedUserHeader();
    ensureSecurityUI();
  }

  function updateConnectedUserHeader() {
    const header = $('headerResponsible');
    if (!header) return;
    header.textContent = security.current?.name || '—';
  }

  /* =========================================================
     COULEURS ET PARAMÈTRES VISUELS
     ========================================================= */

  function safeColor(c) {
    return /^#[0-9a-f]{6}$/i.test(c || '') ? c : '#7B3452';
  }

  function hex(c) {
    c = safeColor(c).slice(1);

    return [
      parseInt(c.slice(0, 2), 16),
      parseInt(c.slice(2, 4), 16),
      parseInt(c.slice(4, 6), 16)
    ];
  }

  function mix(c, p, to) {
    return '#' + hex(c)
      .map(v => Math.round(v + (to - v) * p))
      .map(v => v.toString(16).padStart(2, '0'))
      .join('');
  }

  function apply() {
    const s = db.settings;
    const color = safeColor(s.color);

    document.documentElement.style.setProperty('--primary', color);

    document.documentElement.style.setProperty(
      '--primary-dark',
      mix(color, .8, 0)
    );

    document.documentElement.style.setProperty(
      '--primary-light',
      mix(color, .92, 255)
    );

    if ($('sidebarDirector')) {
      $('sidebarDirector').textContent = s.director || '—';
    }

    if ($('sidebarEngineer')) {
      $('sidebarEngineer').textContent = s.engineer || '—';
    }

    updateConnectedUserHeader();

    if ($('settingDirector')) {
      $('settingDirector').value = s.director || '';
    }

    if ($('settingEngineer')) {
      $('settingEngineer').value = s.engineer || '';
    }

    if ($('settingResponsible')) {
      (
        $('settingResponsible').closest('.form-group') ||
        $('settingResponsible')
      ).remove();
    }

    if ($('settingThreshold')) {
      $('settingThreshold').value = s.threshold ?? 5;
    }

    if ($('settingColor')) {
      $('settingColor').value = color;
    }

    if ($('settingColorText')) {
      $('settingColorText').value = color;
    }

    if ($('settingRecoveryCode')) {
      $('settingRecoveryCode').value = s.recoveryCode || '';
    }

    if ($('brandLogo')) {
      if (s.logo) {
        $('brandLogo').src = s.logo;
      } else {
        $('brandLogo').removeAttribute('src');
      }
    }

    if ($('logoPreview')) {
      if (s.logo) {
        $('logoPreview').src = s.logo;
      } else {
        $('logoPreview').removeAttribute('src');
      }
    }

    addSecurityUserBadge();
  }

  /* =========================================================
     STOCK ET PRODUITS
     ========================================================= */

  function pname(pid) {
    return db.products.find(p => p.id === pid);
  }

  function mname(mid) {
    return db.manufacturers.find(m => m.id === mid)?.name || '—';
  }

  function stock(p) {
    return (p?.lots || []).reduce(
      (sum, lot) => sum + Number(lot.qty || 0),
      0
    );
  }

  function pruneEmptyLots(product) {
    if (!product) return;

    product.lots = (product.lots || []).filter(
      l => Number(l.qty || 0) > 0
    );
  }

  function dates(p) {
    return (p?.lots || [])
      .map(l => l.expiry)
      .filter(Boolean)
      .sort();
  }

  function startOfToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function futureExpiries(p) {
    const now = startOfToday();
    const limit = new Date(now.getTime() + 90 * 86400000);

    return dates(p).filter(date => {
      const d = new Date(date + 'T00:00:00');

      return (
        !isNaN(d.getTime()) &&
        d >= now &&
        d <= limit
      );
    });
  }

  function nearestExpiry(p) {
    return dates(p)[0] || '—';
  }

  function nearestFutureExpiry(p) {
    return futureExpiries(p)[0] || '—';
  }

  function expiring(p) {
    return futureExpiries(p).length > 0;
  }

  function productThreshold(p) {
    const t = Number(p?.threshold);

    if (
      !isNaN(t) &&
      p?.threshold !== '' &&
      p?.threshold !== null &&
      p?.threshold !== undefined
    ) {
      return t;
    }

    return Number(db.settings.threshold || 0);
  }

  function status(p) {
    const s = stock(p);

    if (s <= 0) return ['Terminé', 'out'];

    if (s <= productThreshold(p)) {
      return ['Stock faible', 'low'];
    }

    return ['Disponible', 'ok'];
  }

  /* =========================================================
     STYLES DES TABLEAUX
     ========================================================= */

  const TH_STYLE = `
    padding:8px;
    text-align:left;
    font-size:11px;
    background:#f7f7f8;
    border-bottom:2px solid #e5e7eb;
    white-space:normal;
  `;

  const TD_STYLE = `
    padding:8px;
    font-size:12px;
    border-bottom:1px solid #eee;
    vertical-align:middle;
    white-space:normal;
    overflow-wrap:anywhere;
  `;

  const CENTER_TD_STYLE = `
    ${TD_STYLE}
    text-align:center;
  `;

  const WRAP_TD_STYLE = `${TD_STYLE}`;

  const ACTION_TD_STYLE = `
    ${TD_STYLE}
    text-align:center;
    white-space:nowrap;
  `;

  /* =========================================================
     TABLEAU PRODUITS
     ========================================================= */

  function filteredProductsList() {
    const q = ($('productSearch')?.value || '').toLowerCase();
    const cat = $('productCategoryFilter')?.value || '';
    const mf = $('productManufacturerFilter')?.value || '';

    return db.products.filter(p => {
      const text = [
        p.name,
        p.ref,
        p.category,
        mname(p.manufacturerId),
        ...(p.lots || []).map(l => l.number)
      ].join(' ').toLowerCase();

      return (
        (!q || text.includes(q)) &&
        (!cat || p.category === cat) &&
        (!mf || p.manufacturerId === mf)
      );
    });
  }

  const PRODUCT_COLUMNS = [
    'Référence',
    'Nom du produit',
    'Catégorie',
    'Lot',
    'Fabricant',
    'Stock',
    'Date exp.',
    'État',
    'Actions'
  ];

  function renderProducts() {
    const el = $('productsTable');
    if (!el) return;

    const table = el.tagName === 'TABLE'
      ? el
      : el.closest('table');

    const tbody = el.tagName === 'TABLE'
      ? (
          el.querySelector('tbody') ||
          (() => {
            const tb = document.createElement('tbody');
            el.appendChild(tb);
            return tb;
          })()
        )
      : el;

    if (table) {
      let thead = table.querySelector('thead');

      if (!thead) {
        thead = document.createElement('thead');
        table.insertBefore(thead, table.firstChild);
      }

      thead.innerHTML = `
        <tr>
          ${PRODUCT_COLUMNS.map(c =>
            `<th style="${TH_STYLE}">${c}</th>`
          ).join('')}
        </tr>
      `;
    }

    const products = filteredProductsList();

    tbody.innerHTML = products.map(p => {
      const st = status(p);

      return `
        <tr>
          <td style="${CENTER_TD_STYLE}">
            ${esc(p.ref)}
          </td>

          <td style="${WRAP_TD_STYLE}">
            <b>${esc(p.name)}</b>
            <br>
            <small>
              ${esc(p.block || '')}
              ${p.shelf ? ' · Étagère ' + esc(p.shelf) : ''}
            </small>
          </td>

          <td style="${WRAP_TD_STYLE}">
            ${esc(p.category || '—')}
          </td>

          <td style="${CENTER_TD_STYLE}">
            ${(p.lots || []).map(l => `
              <span>
                ${esc(l.number)} (${Number(l.qty || 0)})
              </span><br>
            `).join('') || '—'}
          </td>

          <td style="${WRAP_TD_STYLE}">
            ${esc(mname(p.manufacturerId))}
          </td>

          <td style="${CENTER_TD_STYLE}">
            <b>${stock(p)}</b>
          </td>

          <td style="${CENTER_TD_STYLE}">
            ${esc(nearestExpiry(p))}
          </td>

          <td style="${CENTER_TD_STYLE}">
            <span class="badge ${st[1]}">${st[0]}</span>
          </td>

          <td style="${ACTION_TD_STYLE}">
            <button
              class="action"
              data-act="editProduct"
              data-id="${p.id}">
              Modifier
            </button>

            ${isDirector() ? `
              <button
                class="action"
                data-act="deleteProduct"
                data-id="${p.id}">
                Suppr.
              </button>
            ` : ''}
          </td>
        </tr>
      `;
    }).join('') || `
      <tr>
        <td
          colspan="${PRODUCT_COLUMNS.length}"
          class="empty"
          style="padding:20px;text-align:center;">
          Aucun produit.
        </td>
      </tr>
    `;
  }

  function productForm(product = null) {
    if (
      product &&
      !requireDirector('modifier un produit')
    ) {
      return;
    }

    const edit = !!product;

    const lots = product?.lots?.length
      ? product.lots
      : [{ number: '', qty: 0, expiry: '' }];

    openModal(
      edit ? 'Modifier le produit' : 'Nouveau produit',
      `
        <form id="productForm">
          <div class="form-grid">
            <div class="form-group">
              <label>Produit *</label>
              <input
                name="name"
                value="${esc(product?.name || '')}"
                required>
            </div>

            <div class="form-group">
              <label>Référence *</label>
              <input
                name="ref"
                value="${esc(product?.ref || '')}"
                required>
            </div>

            <div class="form-group">
              <label>Catégorie *</label>
              <select name="category" required>
                <option value="">Choisir</option>

                ${CATS.map(c => `
                  <option
                    value="${esc(c)}"
                    ${product?.category === c ? 'selected' : ''}>
                    ${esc(c)}
                  </option>
                `).join('')}
              </select>
            </div>

            <div class="form-group">
              <label>Fabricant *</label>
              <select name="manufacturerId" required>
                <option value="">Choisir</option>

                ${db.manufacturers.map(m => `
                  <option
                    value="${m.id}"
                    ${product?.manufacturerId === m.id ? 'selected' : ''}>
                    ${esc(m.name)}
                  </option>
                `).join('')}
              </select>
            </div>

            <div class="form-group">
              <label>Bloc</label>
              <input
                name="block"
                value="${esc(product?.block || '')}">
            </div>

            <div class="form-group">
              <label>Étagère</label>
              <input
                name="shelf"
                value="${esc(product?.shelf || '')}">
            </div>

            <div class="form-group">
              <label>Seuil stock faible</label>
              <input
                name="threshold"
                type="number"
                min="0"
                placeholder="Par défaut : ${Number(db.settings.threshold || 0)}"
                value="${
                  product &&
                  product.threshold !== undefined &&
                  product.threshold !== null &&
                  product.threshold !== ''
                    ? Number(product.threshold)
                    : ''
                }">
            </div>
          </div>

          <div class="form-group">
            <label>Lots</label>

            <div id="lotsContainer">
              ${lots.map(l => `
                <div class="lot-row" data-lot-row>
                  <input
                    name="lotNumber"
                    placeholder="N° lot"
                    value="${esc(l.number || '')}"
                    required>

                  <input
                    name="lotQty"
                    type="number"
                    min="0"
                    value="${Number(l.qty || 0)}"
                    required>

                  <input
                    name="lotExpiry"
                    type="date"
                    value="${esc(l.expiry || '')}">

                  <button
                    type="button"
                    class="action"
                    data-remove-lot>
                    Suppr.
                  </button>
                </div>
              `).join('')}
            </div>

            <button
              type="button"
              id="addLotBtn"
              class="btn secondary">
              ＋ Ajouter un lot
            </button>
          </div>

          <div class="form-actions-modal">
            <button
              type="button"
              class="btn secondary"
              id="cancelModal">
              Annuler
            </button>

            <button class="btn primary">
              ${edit ? 'Modifier' : 'Enregistrer'}
            </button>
          </div>
        </form>
      `
    );

    $('cancelModal').onclick = closeModal;

    $('addLotBtn').onclick = () => {
      const row = document.createElement('div');
      row.className = 'lot-row';
      row.setAttribute('data-lot-row', '');

      row.innerHTML = `
        <input name="lotNumber" placeholder="N° lot" required>

        <input
          name="lotQty"
          type="number"
          min="0"
          value="0"
          required>

        <input name="lotExpiry" type="date">

        <button
          type="button"
          class="action"
          data-remove-lot>
          Suppr.
        </button>
      `;

      $('lotsContainer').appendChild(row);
    };

    $('productForm').onsubmit = e => {
      e.preventDefault();

      const form = new FormData(e.target);

      const numbers = [
        ...document.querySelectorAll('[name="lotNumber"]')
      ];

      const qtys = [
        ...document.querySelectorAll('[name="lotQty"]')
      ];

      const expiries = [
        ...document.querySelectorAll('[name="lotExpiry"]')
      ];

      const lots = [];

      for (let i = 0; i < numbers.length; i++) {
        const number = numbers[i].value.trim();

        if (!number) {
          toast('Le numéro de lot est obligatoire.', 'error');
          return;
        }

        lots.push({
          number,
          qty: Math.max(0, Number(qtys[i].value || 0)),
          expiry: expiries[i].value || ''
        });
      }

      const thresholdRaw = form.get('threshold');

      const data = {
        name: form.get('name').trim(),
        ref: form.get('ref').trim(),
        category: form.get('category'),
        manufacturerId: form.get('manufacturerId'),
        block: form.get('block').trim(),
        shelf: form.get('shelf').trim(),
        threshold:
          thresholdRaw !== null &&
          thresholdRaw !== undefined &&
          String(thresholdRaw).trim() !== ''
            ? Math.max(0, Number(thresholdRaw))
            : '',
        responsible: connectedUserName(),
        lots
      };

      if (
        !data.name ||
        !data.ref ||
        !data.category ||
        !data.manufacturerId
      ) {
        toast('Remplissez tous les champs obligatoires.', 'error');
        return;
      }

      if (edit) {
        Object.assign(product, data);
        audit('Modification produit', data.name);
      } else {
        db.products.push({
          id: id('product'),
          createdAt: today(),
          ...data
        });

        audit('Création produit', data.name);
      }

      save();
      closeModal();
      render();

      toast(edit ? 'Produit modifié' : 'Produit ajouté');
    };
  }

  function deleteProduct(product) {
    if (!requireDirector('supprimer un produit')) return;
    if (!product) return;

    if (!confirm('Supprimer définitivement ce produit ?')) return;

    db.products = db.products.filter(p => p.id !== product.id);

    audit('Suppression produit', product.name);
    save();
    render();

    toast('Produit supprimé');
  }

  /* =========================================================
     FABRICANTS
     ========================================================= */

  function renderManufacturers() {
    const box = $('manufacturerCards');
    if (!box) return;

    box.innerHTML = db.manufacturers.map(m => {
      const count = db.products.filter(
        p => p.manufacturerId === m.id
      ).length;

      return `
        <div class="card">
          <h3>${esc(m.name)}</h3>
          <p>${count} produit(s)</p>
          <p>${esc(m.phone || '')}</p>

          <div class="card-actions">
            <button
              class="btn secondary"
              data-act="viewManufacturer"
              data-id="${m.id}">
              Produits
            </button>

            ${isDirector() ? `
              <button
                class="action"
                data-act="editManufacturer"
                data-id="${m.id}">
                Modifier
              </button>

              <button
                class="action"
                data-act="deleteManufacturer"
                data-id="${m.id}">
                Suppr.
              </button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('') || '<div class="empty">Aucun fabricant.</div>';

    if (selectedManufacturer) {
      showManufacturer(selectedManufacturer);
    }
  }

  function manufacturerForm(manufacturer = null) {
    if (!requireDirector(
      manufacturer
        ? 'modifier un fabricant'
        : 'ajouter un fabricant'
    )) return;

    const edit = !!manufacturer;

    openModal(
      edit ? 'Modifier le fabricant' : 'Nouveau fabricant',
      `
        <form id="manufacturerForm">
          <div class="form-grid">
            <div class="form-group">
              <label>Nom *</label>
              <input
                name="name"
                value="${esc(manufacturer?.name || '')}"
                required>
            </div>

            <div class="form-group">
              <label>Téléphone</label>
              <input
                name="phone"
                value="${esc(manufacturer?.phone || '')}">
            </div>
          </div>

          <div class="form-actions-modal">
            <button
              type="button"
              class="btn secondary"
              id="cancelModal">
              Annuler
            </button>

            <button class="btn primary">
              ${edit ? 'Modifier' : 'Enregistrer'}
            </button>
          </div>
        </form>
      `
    );

    $('cancelModal').onclick = closeModal;

    $('manufacturerForm').onsubmit = e => {
      e.preventDefault();

      const f = new FormData(e.target);

      const data = {
        name: f.get('name').trim(),
        phone: f.get('phone').trim()
      };

      if (!data.name) {
        toast('Le nom est obligatoire.', 'error');
        return;
      }

      if (edit) {
        Object.assign(manufacturer, data);
        audit('Modification fabricant', data.name);
      } else {
        db.manufacturers.push({
          id: id('manufacturer'),
          ...data
        });

        audit('Création fabricant', data.name);
      }

      save();
      closeModal();
      render();

      toast(edit ? 'Fabricant modifié' : 'Fabricant ajouté');
    };
  }

  function showManufacturer(mid) {
    selectedManufacturer = mid;

    const m = db.manufacturers.find(x => x.id === mid);
    if (!m) return;

    $('manufacturerProductsPanel')?.classList.remove('hidden');

    if ($('selectedManufacturerTitle')) {
      $('selectedManufacturerTitle').textContent = m.name;
    }

    if (!$('manufacturerProductsTable')) return;

    $('manufacturerProductsTable').innerHTML = db.products
      .filter(p => p.manufacturerId === mid)
      .map(p => `
        <tr>
          <td style="${CENTER_TD_STYLE}">
            ${esc(p.ref)}
          </td>

          <td style="${WRAP_TD_STYLE}">
            ${esc(p.name)}
          </td>

          <td style="${WRAP_TD_STYLE}">
            ${esc(p.category || '—')}
          </td>

          <td style="${CENTER_TD_STYLE}">
            ${(p.lots || []).map(l =>
              esc(l.number) + ' (' + Number(l.qty || 0) + ')'
            ).join('<br>')}
          </td>

          <td style="${CENTER_TD_STYLE}">
            <b>${stock(p)}</b>
          </td>

          <td style="${ACTION_TD_STYLE}">
            <button
              class="action"
              data-act="editProduct"
              data-id="${p.id}">
              Modifier
            </button>
          </td>
        </tr>
      `).join('') || `
        <tr>
          <td colspan="6" class="empty">
            Aucun produit.
          </td>
        </tr>
      `;
  }

  function deleteManufacturer(m) {
    if (!requireDirector('supprimer un fabricant')) return;
    if (!m) return;

    const used = db.products.some(
      p => p.manufacturerId === m.id
    );

    if (used) {
      toast('Ce fabricant possède encore des produits.', 'error');
      return;
    }

    if (!confirm('Supprimer ce fabricant ?')) return;

    db.manufacturers = db.manufacturers.filter(x => x.id !== m.id);

    audit('Suppression fabricant', m.name);
    save();
    render();

    toast('Fabricant supprimé');
  }

  /* =========================================================
     ENTRÉES
     ========================================================= */

  function filteredEntriesList() {
    const q = ($('entrySearch')?.value || '').toLowerCase();

    return db.entries.filter(e => {
      const p = pname(e.productId);

      return [
        e.date,
        e.lot,
        e.expiry,
        e.createdByName,
        p?.name,
        p?.ref
      ].join(' ').toLowerCase().includes(q);
    });
  }

  function renderEntries() {
    const table = $('entriesTable');
    if (!table) return;

    const entries = filteredEntriesList().slice().reverse();

    table.innerHTML = entries.map(e => {
      const p = pname(e.productId);

      return `
        <tr>
          <td style="${CENTER_TD_STYLE}">
            ${esc(p?.ref || '')}
          </td>

          <td style="${CENTER_TD_STYLE}">
            ${esc(e.date)}
          </td>

          <td style="${WRAP_TD_STYLE}">
            <b>${esc(p?.name || 'Produit supprimé')}</b>
          </td>

          <td style="${CENTER_TD_STYLE}">
            ${esc(e.lot)}
          </td>

          <td style="${CENTER_TD_STYLE}">
            <b>${e.qty}</b>
          </td>

          <td style="${CENTER_TD_STYLE}">
            ${esc(e.expiry || '—')}
          </td>

          <td style="${WRAP_TD_STYLE}">
            ${esc(e.createdByName || '—')}
          </td>

          <td style="${ACTION_TD_STYLE}">
            ${isDirector() ? `
              <button
                class="action"
                data-act="deleteEntry"
                data-id="${e.id}">
                Suppr.
              </button>
            ` : '—'}
          </td>
        </tr>
      `;
    }).join('') || `
      <tr>
        <td colspan="8" class="empty">Aucune entrée.</td>
      </tr>
    `;
  }

  function attachProductSearch(searchInput, selectEl) {
    if (!searchInput || !selectEl) return;

    searchInput.addEventListener('input', () => {
      const q = searchInput.value.toLowerCase();

      [...selectEl.options].forEach(opt => {
        if (!opt.value) return;

        const match = opt.textContent.toLowerCase().includes(q);
        opt.hidden = !match;
      });
    });
  }

  function addEntry() {
    if (!requireLogin()) return;

    if (!db.products.length) {
      toast('Ajoutez d’abord un produit.', 'error');
      return;
    }

    openModal(
      'Nouvelle entrée',
      `
        <form id="entryForm">
          <div class="form-grid">
            <div class="form-group">
              <label>Date *</label>
              <input
                name="date"
                type="date"
                value="${today()}"
                required>
            </div>
          </div>

          <h4>Produits entrants</h4>

          <div id="entryItems"></div>

          <button
            type="button"
            id="addEntryItem"
            class="btn secondary">
            ＋ Ajouter un produit
          </button>

          <div class="form-actions-modal">
            <button
              type="button"
              class="btn secondary"
              id="cancelModal">
              Annuler
            </button>

            <button class="btn primary">
              Enregistrer
            </button>
          </div>
        </form>
      `
    );

    $('cancelModal').onclick = closeModal;

    function addItem() {
      const row = document.createElement('div');
      row.className = 'entry-item-row';

      row.style =
        'border:1px solid #eee;border-radius:8px;padding:8px;margin:8px 0;';

      row.innerHTML = `
        <input
          type="text"
          class="entry-item-search"
          placeholder="Rechercher un produit (nom ou référence)..."
          style="width:100%;margin-bottom:6px;">

        <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr auto;gap:8px;">
          <select name="productId" required>
            <option value="">Choisir un produit</option>

            ${db.products.map(p => `
              <option value="${p.id}">
                ${esc(p.name)} — Réf. ${esc(p.ref)}
              </option>
            `).join('')}
          </select>

          <input name="lot" placeholder="N° lot" required>

          <input
            name="qty"
            type="number"
            min="1"
            placeholder="Quantité"
            required>

          <input name="expiry" type="date">

          <button
            type="button"
            class="action"
            data-remove-entry-item>
            Suppr.
          </button>
        </div>
      `;

      const productSelect = row.querySelector('[name="productId"]');
      const productSearch = row.querySelector('.entry-item-search');

      attachProductSearch(productSearch, productSelect);
      $('entryItems').appendChild(row);
    }

    $('addEntryItem').onclick = addItem;
    addItem();

    $('entryForm').onsubmit = e => {
      e.preventDefault();

      const f = new FormData(e.target);
      const date = f.get('date');

      if (!date) {
        toast('La date est obligatoire.', 'error');
        return;
      }

      const rows = [
        ...document.querySelectorAll('.entry-item-row')
      ];

      if (!rows.length) {
        toast('Ajoutez au moins un produit.', 'error');
        return;
      }

      const items = [];

      for (const row of rows) {
        const productId = row.querySelector('[name="productId"]').value;
        const lotNumber = row.querySelector('[name="lot"]').value.trim();
        const qty = Number(row.querySelector('[name="qty"]').value);
        const expiry = row.querySelector('[name="expiry"]').value || '';
        const product = pname(productId);

        if (!product || !lotNumber || qty <= 0) {
          toast('Produit, lot et quantité obligatoires.', 'error');
          return;
        }

        items.push({
          product,
          productId,
          lot: lotNumber,
          qty,
          expiry
        });
      }

      items.forEach(item => {
        const product = item.product;
        product.lots = product.lots || [];

        const existingIndex = product.lots.findIndex(
          l => l.number === item.lot
        );

        let previousQty = 0;
        let previousExpiry = '';

        if (existingIndex !== -1) {
          previousQty = Number(
            product.lots[existingIndex].qty || 0
          );

          previousExpiry =
            product.lots[existingIndex].expiry || '';

          product.lots.splice(existingIndex, 1);
        }

        const lot = {
          number: item.lot,
          qty: previousQty + item.qty,
          expiry: item.expiry || previousExpiry || ''
        };

        product.lots.push(lot);

        db.entries.push({
          id: id('entry'),
          date,
          productId: product.id,
          lot: item.lot,
          qty: item.qty,
          expiry: item.expiry || '',
          createdAt: new Date().toISOString(),
          createdBy: security.current?.username || '—',
          createdByName: connectedUserName(),
          createdByRole: connectedUserRoleLabel()
        });

        audit(
          'Entrée stock',
          product.name + ' / ' + item.lot + ' / ' + item.qty
        );
      });

      save();
      closeModal();
      render();

      toast('Entrée(s) enregistrée(s)');
    };
  }

  function deleteEntry(entry) {
    if (!requireDirector('supprimer une entrée')) return;

    const product = pname(entry.productId);

    if (product) {
      const lot = product.lots?.find(
        l => l.number === entry.lot
      );

      if (lot) {
        lot.qty = Math.max(
          0,
          Number(lot.qty || 0) - Number(entry.qty || 0)
        );
      }

      pruneEmptyLots(product);
    }

    db.entries = db.entries.filter(e => e.id !== entry.id);

    audit('Suppression entrée', entry.id);
    save();
    render();

    toast('Entrée supprimée');
  }

  /* =========================================================
     SORTIES
     ========================================================= */

  function filteredExitsList() {
    const q = ($('exitSearch')?.value || '').toLowerCase();

    return db.exits.filter(e => {
      const p = pname(e.productId);

      return [
        e.date,
        e.client,
        e.orderName,
        e.lot,
        e.createdByName,
        p?.name,
        p?.ref
      ].join(' ').toLowerCase().includes(q);
    });
  }

  function renderExits() {
    const table = $('exitsTable');
    if (!table) return;

    const exits = filteredExitsList().slice().reverse();

    table.innerHTML = exits.map(e => {
      const p = pname(e.productId);

      return `
        <tr>
          <td style="${CENTER_TD_STYLE}">
            ${esc(p?.ref || '')}
          </td>

          <td style="${CENTER_TD_STYLE}">
            ${esc(e.date)}
          </td>

          <td style="${WRAP_TD_STYLE}">
            ${esc(e.client)}
          </td>

          <td style="${WRAP_TD_STYLE}">
            ${esc(e.orderName)}
          </td>

          <td style="${WRAP_TD_STYLE}">
            <b>${esc(p?.name || 'Produit supprimé')}</b>
          </td>

          <td style="${CENTER_TD_STYLE}">
            ${esc(e.lot)}
          </td>

          <td style="${CENTER_TD_STYLE}">
            <b>${e.qty}</b>
          </td>

          <td style="${WRAP_TD_STYLE}">
            ${esc(e.createdByName || '—')}
          </td>

          <td style="${ACTION_TD_STYLE}">
            <button
              class="action"
              data-act="deleteExit"
              data-id="${e.id}">
              Suppr.
            </button>
          </td>
        </tr>
      `;
    }).join('') || `
      <tr>
        <td colspan="9" class="empty">Aucune sortie.</td>
      </tr>
    `;
  }

  function productOptions() {
    return db.products
      .filter(p => stock(p) > 0)
      .map(p => `
        <option value="${p.id}">
          ${esc(p.name)} — Réf. ${esc(p.ref)} — Stock ${stock(p)}
        </option>
      `).join('');
  }

  function addExit() {
    if (!requireLogin()) return;

    const available = db.products.filter(p => stock(p) > 0);

    if (!available.length) {
      toast('Aucun produit disponible en stock.', 'error');
      return;
    }

    openModal(
      'Nouvelle sortie',
      `
        <form id="exitForm">
          <div class="form-grid">
            <div class="form-group">
              <label>Client / Hôpital *</label>

              <input name="client" list="clientList" required>

              <datalist id="clientList">
                ${db.clients.map(c =>
                  `<option value="${esc(c.name)}">`
                ).join('')}
              </datalist>
            </div>

            <div class="form-group">
              <label>Commande *</label>
              <input name="orderName" required>
            </div>

            <div class="form-group">
              <label>Date *</label>
              <input
                name="date"
                type="date"
                value="${today()}"
                required>
            </div>
          </div>

          <h4>Produits sortants</h4>

          <div id="exitItems"></div>

          <button
            type="button"
            id="addExitItem"
            class="btn secondary">
            ＋ Ajouter un produit
          </button>

          <div class="form-actions-modal">
            <button
              type="button"
              class="btn secondary"
              id="cancelModal">
              Annuler
            </button>

            <button class="btn primary">
              Enregistrer la sortie
            </button>
          </div>
        </form>
      `
    );

    $('cancelModal').onclick = closeModal;

    function addItem() {
      const row = document.createElement('div');
      row.className = 'exit-item-row';

      row.style =
        'border:1px solid #eee;border-radius:8px;padding:8px;margin:8px 0;';

      row.innerHTML = `
        <input
          type="text"
          class="exit-item-search"
          placeholder="Rechercher un produit (nom ou référence)..."
          style="width:100%;margin-bottom:6px;">

        <div style="display:grid;grid-template-columns:2fr 1fr 1fr auto;gap:8px;">
          <select name="productId" required>
            <option value="">Choisir produit</option>
            ${productOptions()}
          </select>

          <select name="lot" required>
            <option value="">Choisir lot</option>
          </select>

          <input
            name="qty"
            type="number"
            min="1"
            placeholder="Quantité"
            required>

          <button
            type="button"
            class="action"
            data-remove-exit-item>
            Suppr.
          </button>
        </div>
      `;

      const productSelect = row.querySelector('[name="productId"]');
      const lotSelect = row.querySelector('[name="lot"]');
      const productSearch = row.querySelector('.exit-item-search');

      attachProductSearch(productSearch, productSelect);

      productSelect.onchange = () => {
        const p = pname(productSelect.value);

        lotSelect.innerHTML =
          '<option value="">Choisir lot</option>' +
          (p?.lots || [])
            .filter(l => Number(l.qty || 0) > 0)
            .map(l => `
              <option value="${esc(l.number)}">
                ${esc(l.number)} — Stock ${Number(l.qty || 0)}
              </option>
            `).join('');
      };

      $('exitItems').appendChild(row);
    }

    $('addExitItem').onclick = addItem;
    addItem();

    $('exitForm').onsubmit = e => {
      e.preventDefault();

      const f = new FormData(e.target);
      const client = f.get('client').trim();
      const orderName = f.get('orderName').trim();
      const date = f.get('date');

      const rows = [
        ...document.querySelectorAll('.exit-item-row')
      ];

      if (!client || !orderName || !date) {
        toast('Remplissez les informations obligatoires.', 'error');
        return;
      }

      const items = [];

      for (const row of rows) {
        const productId = row.querySelector('[name="productId"]').value;
        const lot = row.querySelector('[name="lot"]').value;
        const qty = Number(row.querySelector('[name="qty"]').value);
        const product = pname(productId);

        if (!product || !lot || qty <= 0) {
          toast('Produit, lot et quantité obligatoires.', 'error');
          return;
        }

        const lotObj = product.lots?.find(l => l.number === lot);

        if (!lotObj || Number(lotObj.qty || 0) < qty) {
          toast(
            'Stock insuffisant pour ' + product.name + ' / lot ' + lot,
            'error'
          );
          return;
        }

        items.push({ product, productId, lot, qty });
      }

      if (!items.length) {
        toast('Ajoutez au moins un produit.', 'error');
        return;
      }

      items.forEach(item => {
        const lot = item.product.lots.find(
          l => l.number === item.lot
        );

        lot.qty = Number(lot.qty || 0) - item.qty;
        pruneEmptyLots(item.product);

        db.exits.push({
          id: id('exit'),
          date,
          client,
          orderName,
          productId: item.productId,
          lot: item.lot,
          qty: item.qty,
          createdAt: new Date().toISOString(),
          createdBy: security.current?.username || '—',
          createdByName: connectedUserName(),
          createdByRole: connectedUserRoleLabel()
        });
      });

      audit(
        'Sortie stock',
        client + ' / ' + items.length + ' produit(s)'
      );

      save();
      closeModal();
      render();

      toast('Sortie enregistrée');
    };
  }

  function deleteExit(exit) {
    if (!requireDirector('supprimer une sortie')) return;
    if (!exit) return;

    const product = pname(exit.productId);

    if (product) {
      product.lots = product.lots || [];

      let lot = product.lots.find(l => l.number === exit.lot);

      if (!lot) {
        lot = {
          number: exit.lot,
          qty: 0,
          expiry: ''
        };

        product.lots.push(lot);
      }

      lot.qty = Number(lot.qty || 0) + Number(exit.qty || 0);
    }

    db.exits = db.exits.filter(x => x.id !== exit.id);

    audit(
      'Suppression sortie',
      exit.client + ' / ' + exit.orderName
    );

    save();
    render();

    toast('Sortie supprimée');
  }

  /* =========================================================
     CLIENTS
     ========================================================= */

  function filteredClientsList() {
    const q = ($('clientSearch')?.value || '').toLowerCase();

    return db.clients.filter(c => {
      const text = [
        c.name,
        c.phone,
        c.contact,
        c.address
      ].join(' ').toLowerCase();

      return !q || text.includes(q);
    });
  }

  function renderClients() {
    const box = $('clientsCards');
    if (!box) return;

    const clients = filteredClientsList().slice().sort((a, b) =>
      (a.name || '').localeCompare(
        b.name || '',
        'fr',
        { sensitivity: 'base', numeric: true }
      )
    );

    box.innerHTML = `
      <div class="table-wrap">
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr>
              <th style="${TH_STYLE}">Nom du client</th>
              <th style="${TH_STYLE}">Numéro de téléphone</th>
              <th style="${TH_STYLE}">Actions</th>
            </tr>
          </thead>

          <tbody>
            ${clients.map(c => `
              <tr>
                <td style="${WRAP_TD_STYLE}">
                  <b>${esc(c.name)}</b>
                </td>

                <td style="${CENTER_TD_STYLE}">
                  ${esc(c.phone || '—')}
                </td>

                <td style="${ACTION_TD_STYLE}">
                  <button
                    class="action"
                    data-act="editClient"
                    data-id="${c.id}">
                    Modifier
                  </button>

                  ${isDirector() ? `
                    <button
                      class="action"
                      data-act="deleteClient"
                      data-id="${c.id}">
                      Suppr.
                    </button>
                  ` : ''}
                </td>
              </tr>
            `).join('') || `
              <tr>
                <td
                  colspan="3"
                  class="empty"
                  style="padding:20px;text-align:center;">
                  Aucun client.
                </td>
              </tr>
            `}
          </tbody>
        </table>
      </div>
    `;
  }

  function clientForm(client = null) {
    const edit = !!client;

    openModal(
      edit ? 'Modifier le client' : 'Nouveau client',
      `
        <form id="clientForm">
          <div class="form-grid">
            <div class="form-group">
              <label>Client / Hôpital *</label>
              <input
                name="name"
                value="${esc(client?.name || '')}"
                required>
            </div>

            <div class="form-group">
              <label>Téléphone</label>
              <input
                name="phone"
                value="${esc(client?.phone || '')}">
            </div>

            <div class="form-group">
              <label>Adresse</label>
              <input
                name="address"
                value="${esc(client?.address || '')}">
            </div>

            <div class="form-group">
              <label>Contact</label>
              <input
                name="contact"
                value="${esc(client?.contact || '')}">
            </div>
          </div>

          <div class="form-actions-modal">
            <button
              type="button"
              class="btn secondary"
              id="cancelModal">
              Annuler
            </button>

            <button class="btn primary">
              ${edit ? 'Modifier' : 'Enregistrer'}
            </button>
          </div>
        </form>
      `
    );

    $('cancelModal').onclick = closeModal;

    $('clientForm').onsubmit = e => {
      e.preventDefault();

      const f = new FormData(e.target);

      const data = {
        name: f.get('name').trim(),
        phone: f.get('phone').trim(),
        address: f.get('address').trim(),
        contact: f.get('contact').trim()
      };

      if (!data.name) {
        toast('Le nom du client est obligatoire.', 'error');
        return;
      }

      if (edit) {
        Object.assign(client, data);
        audit('Modification client', data.name);
      } else {
        db.clients.push({
          id: id('client'),
          createdAt: today(),
          ...data
        });

        audit('Création client', data.name);
      }

      save();
      closeModal();
      render();

      toast(edit ? 'Client modifié' : 'Client ajouté');
    };
  }

  function deleteClient(client) {
    if (!requireDirector('supprimer un client')) return;
    if (!confirm('Supprimer ce client ?')) return;

    db.clients = db.clients.filter(x => x.id !== client.id);

    audit('Suppression client', client.name);
    save();
    render();

    toast('Client supprimé');
  }

  /* =========================================================
     COMMANDES
     ========================================================= */

  function normalizeSupplierKey(name) {
    return String(name || '').trim().toUpperCase();
  }

  function supplierPrefix(name) {
    const letters = String(name || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z]/g, '');

    return letters.slice(0, 3) || 'CMD';
  }

  function nextOrderNumberForSupplier(supplierName) {
    const key = normalizeSupplierKey(supplierName);
    if (!key) return '';

    if (!db.settings.supplierOrderCounters) {
      db.settings.supplierOrderCounters = {};
    }

    const last = Number(
      db.settings.supplierOrderCounters[key] || 0
    );

    const prefix = supplierPrefix(supplierName);

    return prefix + '-' + String(last + 1).padStart(4, '0');
  }

  function registerSupplierOrderNumber(supplierName, number) {
    const key = normalizeSupplierKey(supplierName);
    if (!key) return;

    if (!db.settings.supplierOrderCounters) {
      db.settings.supplierOrderCounters = {};
    }

    const numericPart = Number(
      String(number || '').replace(/\D/g, '')
    );

    if (
      !isNaN(numericPart) &&
      numericPart > Number(db.settings.supplierOrderCounters[key] || 0)
    ) {
      db.settings.supplierOrderCounters[key] = numericPart;
    }
  }

  function renderOrders() {
    const box = $('currentOrderList');
    if (!box) return;

    box.innerHTML = db.orders.slice().reverse().map(o => `
      <div class="panel" style="margin-bottom:12px;">
        <div class="panel-head">
          <div>
            <h3>
              ${
                o.type === 'supplier'
                  ? 'Bon de commande'
                  : 'Expression de besoin'
              }
            </h3>

            <p>Date : ${esc(o.date || '—')}</p>

            ${o.type === 'supplier' ? `
              <p>Fournisseur : ${esc(o.supplier || '—')}</p>
              <p>N° commande : ${esc(o.number || '—')}</p>
            ` : ''}

            <p>Utilisateur : ${esc(o.createdByName || '—')}</p>

            ${o.type === 'supplier' && o.needId ? `
              <p style="font-size:11px;color:#888;">
                Généré depuis une expression de besoin
              </p>
            ` : ''}
          </div>

          <div>
            <button
              class="btn secondary"
              data-act="pdfOrder"
              data-id="${o.id}">
              PDF
            </button>

            ${o.type === 'need' && isDirector() ? `
              <button
                class="btn primary"
                data-act="createBCFromNeed"
                data-id="${o.id}">
                Bon de commande
              </button>
            ` : ''}

            ${o.type === 'supplier' && isDirector() ? `
              <button
                class="btn primary"
                data-act="editOrder"
                data-id="${o.id}">
                Modifier
              </button>
            ` : ''}

            <button
              class="action"
              data-act="deleteOrder"
              data-id="${o.id}">
              Suppr.
            </button>
          </div>
        </div>

        <div class="order-lines">
          ${(o.items || []).map(item => {
            const p = pname(item.productId);
            const productName =
              item.name || p?.name || 'Produit supprimé';
            const ref = item.ref || p?.ref || '';
            const currentStock = p ? stock(p) : '—';
            const qty = Number(item.qty || item.requested || 0);

            if (o.type === 'supplier') {
              return `
                <div class="order-line">
                  Réf. ${esc(ref)}
                  <b>${esc(productName)}</b>
                  Stock actuel : ${currentStock}
                  Quantité : ${qty}
                </div>
              `;
            }

            const category = item.category || p?.category || '—';

            return `
              <div class="order-line">
                Réf. ${esc(ref)}
                <b>${esc(productName)}</b>
                Catégorie : ${esc(category)}
                Stock actuel : ${currentStock}
                Stock demandé : ${qty}
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `).join('') || '<div class="empty">Aucune commande.</div>';
  }

  function makeOrder(order = null) {
    const edit = !!order;

    if (edit) {
      if (!requireDirector('modifier une commande')) return;
    } else if (!requireLogin()) {
      return;
    }

    openModal(
      edit ? 'Modifier la commande' : 'Nouvelle demande',
      `
        <form id="orderForm">
          <div class="form-grid">
            <div class="form-group">
              <label>Type de document *</label>

              ${edit ? `
                <input
                  type="hidden"
                  name="type"
                  id="orderType"
                  value="${esc(order.type)}">

                <p style="margin:6px 0 0;font-weight:600;">
                  ${
                    order.type === 'supplier'
                      ? 'Bon de commande'
                      : 'Expression de besoin'
                  }
                  <small style="font-weight:400;color:#888;">
                    (le type ne peut pas être changé après création)
                  </small>
                </p>
              ` : `
                <select name="type" id="orderType" required>
                  <option value="need">Expression de besoin</option>
                  <option value="supplier">Bon de commande</option>
                </select>
              `}
            </div>

            <div
              class="form-group"
              id="supplierGroup"
              style="display:none;">
              <label>Fournisseur *</label>
              <input
                name="supplier"
                id="orderSupplier"
                value="${esc(order?.supplier || '')}">
            </div>

            <div
              class="form-group"
              id="numberGroup"
              style="display:none;">
              <label>
                Numéro de commande *
                <small style="font-weight:400;color:#888;">
                  (numéro suivant du fournisseur proposé automatiquement)
                </small>
              </label>

              <input
                name="number"
                id="orderNumber"
                value="${esc(order?.number || '')}">
            </div>

            <div class="form-group">
              <label>Date *</label>
              <input
                type="date"
                name="date"
                value="${order?.date || today()}"
                required>
            </div>
          </div>

          <div class="form-group">
            <label>Produits</label>
            <div id="orderItems"></div>

            <button
              type="button"
              class="btn secondary"
              id="addOrderItem">
              ＋ Ajouter un produit
            </button>
          </div>

          <div class="form-actions-modal">
            <button
              type="button"
              class="btn secondary"
              id="cancelModal">
              Annuler
            </button>

            <button class="btn primary">
              ${edit ? 'Enregistrer les modifications' : 'Créer'}
            </button>
          </div>
        </form>
      `
    );

    $('cancelModal').onclick = closeModal;

    function updateType() {
      const supplier = $('orderType').value === 'supplier';

      $('supplierGroup').style.display = supplier ? '' : 'none';
      $('numberGroup').style.display = supplier ? '' : 'none';
      $('orderSupplier').required = supplier;
      $('orderNumber').required = supplier;

      if (
        supplier &&
        !edit &&
        !$('orderNumber').value &&
        $('orderSupplier').value
      ) {
        $('orderNumber').value = nextOrderNumberForSupplier(
          $('orderSupplier').value
        );
      }
    }

    $('orderType').onchange = updateType;

    if (!edit) {
      $('orderSupplier')?.addEventListener('input', () => {
        if ($('orderType').value === 'supplier') {
          $('orderNumber').value = nextOrderNumberForSupplier(
            $('orderSupplier').value
          );
        }
      });
    }

    $('orderType').value = order?.type || 'need';
    updateType();

    function addItem(itemData = null) {
      const row = document.createElement('div');
      row.className = 'order-item-row';

      row.style =
        'display:grid;grid-template-columns:2fr 1fr 1fr auto;gap:8px;margin:8px 0;align-items:center;';

      row.innerHTML = `
        <input
          type="text"
          class="order-item-search"
          placeholder="Rechercher un produit (nom ou référence)..."
          style="grid-column:1/-1;">

        <select name="productId" required>
          <option value="">Choisir un produit</option>

          ${db.products.map(p => `
            <option
              value="${p.id}"
              ${itemData?.productId === p.id ? 'selected' : ''}>
              ${esc(p.name)} — ${esc(p.ref)}
            </option>
          `).join('')}
        </select>

        <span
          class="order-item-stock"
          style="font-size:11px;color:#666;">
          Stock : —
        </span>

        <input
          name="qty"
          type="number"
          min="1"
          placeholder="Quantité"
          value="${itemData?.qty ? Number(itemData.qty) : ''}"
          required>

        <button
          type="button"
          class="action"
          data-remove-order-item>
          Suppr.
        </button>
      `;

      const productSelect = row.querySelector('[name="productId"]');
      const productSearch = row.querySelector('.order-item-search');
      const stockSpan = row.querySelector('.order-item-stock');

      attachProductSearch(productSearch, productSelect);

      function updateStock() {
        const p = pname(productSelect.value);
        stockSpan.textContent = p ? 'Stock : ' + stock(p) : 'Stock : —';
      }

      productSelect.onchange = updateStock;
      updateStock();

      $('orderItems').appendChild(row);
    }

    $('addOrderItem').onclick = () => addItem();

    if (edit && order?.items?.length) {
      order.items.forEach(item => addItem(item));
    } else {
      addItem();
    }

    $('orderForm').onsubmit = e => {
      e.preventDefault();

      const f = new FormData(e.target);
      const type = f.get('type');

      const rows = [
        ...document.querySelectorAll('.order-item-row')
      ];

      const items = [];

      for (const row of rows) {
        const product = pname(
          row.querySelector('[name="productId"]').value
        );

        const qty = Number(
          row.querySelector('[name="qty"]').value
        );

        if (!product || qty <= 0) {
          toast('Produit et quantité obligatoires.', 'error');
          return;
        }

        items.push({
          productId: product.id,
          name: product.name,
          ref: product.ref,
          category: product.category || '',
          qty
        });
      }

      if (!items.length) {
        toast('Ajoutez au moins un produit.', 'error');
        return;
      }

      if (
        type === 'supplier' &&
        (!f.get('supplier').trim() || !f.get('number').trim())
      ) {
        toast(
          'Fournisseur et numéro de commande obligatoires.',
          'error'
        );
        return;
      }

      if (edit) {
        order.date = f.get('date');

        if (order.type === 'supplier') {
          order.supplier = f.get('supplier')?.trim() || '';
          order.number = f.get('number')?.trim() || '';

          registerSupplierOrderNumber(
            order.supplier,
            order.number
          );
        }

        order.items = items;
        order.modifiedAt = new Date().toISOString();
        order.modifiedBy = connectedUserName();

        audit(
          'Modification commande',
          order.type === 'supplier'
            ? 'Bon de commande ' + order.number
            : 'Expression de besoin'
        );

        save();
        closeModal();
        render();

        toast('Commande modifiée');
        return;
      }

      const order2 = {
        id: id('order'),
        type,
        date: f.get('date'),
        supplier: f.get('supplier')?.trim() || '',
        number: f.get('number')?.trim() || '',
        items,
        createdAt: new Date().toISOString(),
        createdBy: security.current?.username || '—',
        createdByName: connectedUserName(),
        createdByRole: connectedUserRoleLabel()
      };

      db.orders.push(order2);

      if (type === 'supplier') {
        registerSupplierOrderNumber(
          order2.supplier,
          order2.number
        );
      }

      audit(
        'Création commande',
        type === 'supplier'
          ? 'Bon de commande ' + order2.number
          : 'Expression de besoin'
      );

      save();
      closeModal();
      render();

      toast('Commande créée');
    };
  }

  function createSupplierOrderFromNeed(needOrder) {
    if (!requireDirector('créer un bon de commande')) return;
    if (!needOrder || needOrder.type !== 'need') return;

    openModal(
      'Bon de commande depuis l’expression de besoin',
      `
        <form id="bcFromNeedForm">
          <div class="form-grid">
            <div class="form-group">
              <label>Fournisseur *</label>
              <input name="supplier" id="bcSupplier" required>
            </div>

            <div class="form-group">
              <label>
                Numéro de commande *
                <small style="font-weight:400;color:#888;">
                  (numéro suivant du fournisseur proposé automatiquement)
                </small>
              </label>
              <input name="number" id="bcNumber" required>
            </div>

            <div class="form-group">
              <label>Date *</label>
              <input
                type="date"
                name="date"
                value="${today()}"
                required>
            </div>
          </div>

          <h4>
            Produits
            <small style="font-weight:400;color:#888;">
              (repris de l'expression de besoin, quantités modifiables)
            </small>
          </h4>

          <div id="bcItems"></div>

          <button
            type="button"
            id="addBcItem"
            class="btn secondary">
            ＋ Ajouter un produit
          </button>

          <div class="form-actions-modal">
            <button
              type="button"
              class="btn secondary"
              id="cancelModal">
              Annuler
            </button>

            <button class="btn primary">
              Créer le bon de commande
            </button>
          </div>
        </form>
      `
    );

    $('cancelModal').onclick = closeModal;

    $('bcSupplier').addEventListener('input', () => {
      $('bcNumber').value = nextOrderNumberForSupplier(
        $('bcSupplier').value
      );
    });

    function addItem(itemData = null) {
      const row = document.createElement('div');
      row.className = 'bc-item-row';

      row.style =
        'display:grid;grid-template-columns:2fr 1fr 1fr auto;gap:8px;margin:8px 0;align-items:center;';

      row.innerHTML = `
        <input
          type="text"
          class="bc-item-search"
          placeholder="Rechercher un produit (nom ou référence)..."
          style="grid-column:1/-1;">

        <select name="productId" required>
          <option value="">Choisir un produit</option>

          ${db.products.map(p => `
            <option
              value="${p.id}"
              ${itemData?.productId === p.id ? 'selected' : ''}>
              ${esc(p.name)} — ${esc(p.ref)}
            </option>
          `).join('')}
        </select>

        <span
          class="bc-item-stock"
          style="font-size:11px;color:#666;">
          Stock actuel : —
        </span>

        <span
          class="bc-item-requested"
          style="font-size:11px;color:#666;">
          Stock demandé : ${itemData?.qty ? Number(itemData.qty) : 0}
        </span>

        <button
          type="button"
          class="action"
          data-remove-bc-item>
          Suppr.
        </button>

        <input
          name="qty"
          type="number"
          min="1"
          placeholder="Quantité à commander"
          value="${itemData?.qty ? Number(itemData.qty) : ''}"
          style="grid-column:1/-1;"
          required>
      `;

      const select = row.querySelector('[name="productId"]');
      const search = row.querySelector('.bc-item-search');
      const stockSpan = row.querySelector('.bc-item-stock');

      attachProductSearch(search, select);

      function updateStock() {
        const p = pname(select.value);

        stockSpan.textContent = p
          ? 'Stock actuel : ' + stock(p)
          : 'Stock actuel : —';
      }

      select.onchange = updateStock;
      updateStock();

      row.querySelector('[data-remove-bc-item]').onclick = () => {
        row.remove();
      };

      $('bcItems').appendChild(row);
    }

    $('addBcItem').onclick = () => addItem();

    if (needOrder.items?.length) {
      needOrder.items.forEach(item => addItem(item));
    } else {
      addItem();
    }

    $('bcFromNeedForm').onsubmit = e => {
      e.preventDefault();

      const f = new FormData(e.target);
      const supplier = f.get('supplier').trim();
      const number = f.get('number').trim();
      const date = f.get('date');

      if (!supplier || !number || !date) {
        toast(
          'Fournisseur, numéro et date sont obligatoires.',
          'error'
        );
        return;
      }

      const rows = [
        ...document.querySelectorAll('.bc-item-row')
      ];

      const items = [];

      for (const row of rows) {
        const product = pname(
          row.querySelector('[name="productId"]').value
        );

        const qty = Number(
          row.querySelector('[name="qty"]').value
        );

        if (!product || qty <= 0) {
          toast(
            'Produit et quantité obligatoires pour chaque ligne.',
            'error'
          );
          return;
        }

        items.push({
          productId: product.id,
          name: product.name,
          ref: product.ref,
          category: product.category || '',
          qty
        });
      }

      if (!items.length) {
        toast('Ajoutez au moins un produit.', 'error');
        return;
      }

      const bc = {
        id: id('order'),
        type: 'supplier',
        needId: needOrder.id,
        date,
        supplier,
        number,
        items,
        createdAt: new Date().toISOString(),
        createdBy: security.current?.username || '—',
        createdByName: connectedUserName(),
        createdByRole: connectedUserRoleLabel()
      };

      db.orders.push(bc);

      registerSupplierOrderNumber(supplier, number);

      audit(
        'Création bon de commande',
        'BC ' + number + ' depuis expression de besoin'
      );

      save();
      closeModal();
      render();

      toast(
        'Bon de commande créé (l’expression de besoin est conservée)'
      );
    };
  }

  function deleteOrder(order) {
    if (!requireDirector('supprimer une commande')) return;
    if (!confirm('Supprimer cette commande ?')) return;

    db.orders = db.orders.filter(o => o.id !== order.id);

    audit('Suppression commande', order.id);
    save();
    render();

    toast('Commande supprimée');
  }

  /* =========================================================
     FILTRES DES RAPPORTS
     ========================================================= */

  function inDateRange(dateStr, from, to) {
    if (!from && !to) return true;
    if (!dateStr) return false;

    return (
      (!from || dateStr >= from) &&
      (!to || dateStr <= to)
    );
  }

  function reportFilters(title, callback, withScope = true) {
    openModal(
      title,
      `
        <form id="reportFilterForm">
          <div class="form-grid">
            <div class="form-group">
              <label>Date début</label>
              <input type="date" name="from">
            </div>

            <div class="form-group">
              <label>Date fin</label>
              <input type="date" name="to">
            </div>

            ${withScope ? `
              <div class="form-group" style="grid-column:1/-1;">
                <label>Contenu du PDF</label>

                <label style="font-weight:400;display:flex;align-items:center;gap:6px;margin-top:4px;">
                  <input
                    type="radio"
                    name="scope"
                    value="all"
                    checked>
                  Tous les résultats
                </label>

                <label style="font-weight:400;display:flex;align-items:center;gap:6px;margin-top:4px;">
                  <input
                    type="radio"
                    name="scope"
                    value="filtered">
                  Uniquement le résultat filtré actuellement affiché
                  (recherche / catégorie / fabricant)
                </label>
              </div>
            ` : ''}
          </div>

          <div class="form-actions-modal">
            <button
              type="button"
              class="btn secondary"
              id="cancelModal">
              Annuler
            </button>

            <button class="btn primary">
              Générer PDF
            </button>
          </div>
        </form>
      `
    );

    $('cancelModal').onclick = closeModal;

    $('reportFilterForm').onsubmit = e => {
      e.preventDefault();

      const f = new FormData(e.target);
      closeModal();

      callback(
        f.get('from') || '',
        f.get('to') || '',
        f.get('scope') || 'all'
      );
    };
  }

  /* =========================================================
     OUTILS PDF
     ========================================================= */

  function getJsPDF() {
    return window.jspdf?.jsPDF || null;
  }

  function pdfBase(title, subtitle = '', showUser = true) {
    const JsPDF = getJsPDF();

    if (!JsPDF) {
      toast('Bibliothèque PDF indisponible.', 'error');
      return null;
    }

    const doc = new JsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const color = safeColor(db.settings.color);
    const rgb = hex(color);

    doc.setFillColor(rgb[0], rgb[1], rgb[2]);
    doc.rect(0, 0, 210, 24, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont(undefined, 'bold');
    doc.setFontSize(16);
    doc.text('KOTHAR MÉDICAL', 15, 12);

    doc.setFont(undefined, 'normal');
    doc.setFontSize(12);
    doc.text(title, 15, 20);

    doc.setFontSize(8);

    doc.text(
      'Date : ' + today(),
      195,
      showUser ? 9 : 12,
      { align: 'right' }
    );

    if (showUser) {
      doc.text(
        'Utilisateur : ' +
        connectedUserName() +
        ' (' +
        connectedUserRoleLabel() +
        ')',
        195,
        15,
        { align: 'right' }
      );
    }

    doc.setTextColor(80, 80, 80);
    doc.setFontSize(9);

    if (subtitle) {
      doc.text(subtitle, 15, 30);
    }

    doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
    doc.setLineWidth(0.4);
    doc.line(15, 33, 195, 33);
    doc.setTextColor(0, 0, 0);

    return doc;
  }

  function pdfLogo(doc) {
    if (!db.settings.logo) return;

    try {
      doc.addImage(
        db.settings.logo,
        'PNG',
        170,
        27,
        25,
        18
      );
    } catch (e) {}
  }

  function pdfSignature(doc) {
    const y = 270;
    const color = hex(safeColor(db.settings.color));

    doc.setDrawColor(color[0], color[1], color[2]);
    doc.line(145, y - 4, 195, y - 4);

    doc.setFontSize(9);
    doc.setTextColor(50, 50, 50);

    doc.text(
      'Le Directeur',
      170,
      y + 2,
      { align: 'center' }
    );

    doc.text(
      db.settings.director || 'Directeur',
      170,
      y + 8,
      { align: 'center' }
    );

    doc.text(
      'Signature',
      170,
      y + 16,
      { align: 'center' }
    );
  }

  function pdfTable(
    doc,
    head,
    body,
    startY = 38,
    showUserFooter = true
  ) {
    if (typeof doc.autoTable !== 'function') {
      toast('AutoTable est indisponible.', 'error');
      return;
    }

    const color = hex(safeColor(db.settings.color));

    doc.autoTable({
      startY,
      head: [head],
      body,
      theme: 'grid',

      styles: {
        fontSize: 8,
        cellPadding: 2.5,
        valign: 'middle'
      },

      headStyles: {
        fillColor: color,
        textColor: 255,
        fontSize: 8
      },

      alternateRowStyles: {
        fillColor: [248, 248, 250]
      },

      margin: {
        left: 10,
        right: 10,
        top: 35,
        bottom: 35
      },

      didDrawPage: data => {
        const pageHeight = doc.internal.pageSize.height;

        doc.setFontSize(7);
        doc.setTextColor(100, 100, 100);

        doc.text('Kothar Médical', 10, pageHeight - 10);

        if (showUserFooter) {
          doc.text(
            'Utilisateur : ' + connectedUserName(),
            105,
            pageHeight - 10,
            { align: 'center' }
          );
        }

        doc.text(
          'Page ' + data.pageNumber,
          200,
          pageHeight - 10,
          { align: 'right' }
        );
      }
    });
  }

  function savePDF(doc, filename) {
    pdfSignature(doc);
    doc.save(filename);
  }

  /* =========================================================
     PDF PRODUITS
     ========================================================= */

  function pdfProducts() {
    if (!requireLogin()) return;

    reportFilters('Historique des produits', (from, to, scope) => {
      const source = scope === 'filtered'
        ? filteredProductsList()
        : db.products;

      const rows = source
        .filter(p => inDateRange(p.createdAt || '', from, to))
        .map(p => {
          const st = status(p);

          const lotsLabel = (p.lots || []).map(l =>
            l.number + ' (' + Number(l.qty || 0) + ')'
          ).join('\n') || '—';

          return [
            p.ref,
            p.name,
            p.category,
            lotsLabel,
            mname(p.manufacturerId),
            stock(p),
            nearestExpiry(p),
            st[0]
          ];
        });

      const doc = pdfBase(
        'Historique des produits',
        from || to
          ? `Période : ${from || '—'} → ${to || '—'}`
          : ''
      );

      if (!doc) return;

      pdfLogo(doc);

      pdfTable(
        doc,
        [
          'Référence',
          'Désignation',
          'Catégorie',
          'Lot',
          'Fabricant',
          'Stock',
          'Date exp.',
          'État'
        ],
        rows
      );

      savePDF(doc, 'historique-produits.pdf');
    });
  }

  /* =========================================================
     PDF SORTIES
     ========================================================= */

  function pdfExits() {
    if (!requireLogin()) return;

    reportFilters('Rapport des sorties', (from, to, scope) => {
      const source = scope === 'filtered'
        ? filteredExitsList()
        : db.exits;

      const rows = source
        .filter(e =>
          (!from || e.date >= from) &&
          (!to || e.date <= to)
        )
        .map(e => {
          const p = pname(e.productId);

          return [
            p?.ref || '',
            e.date,
            e.client,
            e.orderName,
            p?.name || 'Produit supprimé',
            e.lot,
            e.qty,
            e.createdByName || '—'
          ];
        });

      const doc = pdfBase(
        'Historique des sorties',
        `Période : ${from || '—'} → ${to || '—'}`
      );

      if (!doc) return;

      pdfLogo(doc);

      pdfTable(
        doc,
        [
          'Référence',
          'Date',
          'Client',
          'Commande',
          'Produit',
          'Lot',
          'Qté',
          'Responsable'
        ],
        rows
      );

      savePDF(doc, 'historique-sorties.pdf');
    });
  }

  /* =========================================================
     PDF CLIENTS
     ========================================================= */

  function pdfClients() {
    if (!requireLogin()) return;

    reportFilters('Rapport clients', (from, to, scope) => {
      const source = scope === 'filtered'
        ? filteredClientsList()
        : db.clients;

      const rows = source
        .filter(c => inDateRange(c.createdAt || '', from, to))
        .map(c => [
          c.name,
          c.phone || '',
          c.address || '',
          c.contact || ''
        ]);

      const doc = pdfBase(
        'Clients / Hôpitaux',
        `Période : ${from || '—'} → ${to || '—'}`
      );

      if (!doc) return;

      pdfLogo(doc);

      pdfTable(
        doc,
        ['Client / Hôpital', 'Téléphone', 'Adresse', 'Contact'],
        rows
      );

      savePDF(doc, 'rapport-clients.pdf');
    });
  }

  /* =========================================================
     PDF COMMANDES
     ========================================================= */

  function pdfOrder(order) {
    if (!requireLogin()) return;
    if (!order) return;

    if (order.type === 'supplier') {
      pdfSupplierOrder(order);
    } else {
      pdfDirectorOrder(order);
    }
  }

  function pdfDirectorOrder(order) {
    const doc = pdfBase(
      'EXPRESSION DE BESOIN',
      'Demande de réapprovisionnement',
      false
    );

    if (!doc) return;

    pdfLogo(doc);

    pdfTable(
      doc,
      [
        'Référence',
        'Nom du produit',
        'Stock actuel',
        'Stock demandé'
      ],
      (order.items || []).map(item => {
        const p = pname(item.productId);

        return [
          item.ref || p?.ref || '',
          item.name || p?.name || '',
          p ? stock(p) : 0,
          item.qty || item.requested || 0
        ];
      }),
      38,
      false
    );

    savePDF(
      doc,
      'expression-de-besoin-' + order.id + '.pdf'
    );
  }

  function pdfSupplierOrder(order) {
    const doc = pdfBase('BON DE COMMANDE', '', false);
    if (!doc) return;

    pdfLogo(doc);

    doc.setFontSize(10);
    doc.setTextColor(40, 40, 40);

    doc.text(
      'Fournisseur : ' + (order.supplier || '—'),
      15,
      38
    );

    doc.text(
      'N° commande : ' + (order.number || '—'),
      15,
      44
    );

    doc.text(
      'Date : ' + (order.date || '—'),
      15,
      50
    );

    pdfTable(
      doc,
      ['Référence', 'Produit', 'Quantité'],
      (order.items || []).map(item => [
        item.ref || pname(item.productId)?.ref || '',
        item.name || pname(item.productId)?.name || '',
        item.qty || 0
      ]),
      56,
      false
    );

    savePDF(
      doc,
      'bon-de-commande-' + order.number + '.pdf'
    );
  }

  function pdfOrdersReport() {
    if (!requireLogin()) return;

    reportFilters(
      'Historique des commandes',
      (from, to) => {
        const orders = db.orders.filter(o =>
          (!from || o.date >= from) &&
          (!to || o.date <= to)
        );

        const rows = [];

        orders.forEach(order => {
          (order.items || []).forEach(item => {
            rows.push([
              order.date,
              order.type === 'supplier'
                ? 'Bon de commande'
                : 'Expression de besoin',
              order.number || '—',
              order.supplier || '—',
              item.ref || '',
              item.name || '',
              item.qty || 0
            ]);
          });
        });

        const doc = pdfBase(
          'Historique des commandes',
          `Période : ${from || '—'} → ${to || '—'}`,
          false
        );

        if (!doc) return;

        pdfLogo(doc);

        pdfTable(
          doc,
          [
            'Date',
            'Type',
            'N° commande',
            'Fournisseur',
            'Référence',
            'Produit',
            'Qté'
          ],
          rows,
          38,
          false
        );

        savePDF(doc, 'historique-commandes.pdf');
      },
      false
    );
  }

  /* =========================================================
     PDF ENTRÉES
     ========================================================= */

  function pdfEntries() {
    if (!requireLogin()) return;

    reportFilters('Historique des entrées', (from, to, scope) => {
      const source = scope === 'filtered'
        ? filteredEntriesList()
        : db.entries;

      const rows = source
        .filter(e =>
          (!from || e.date >= from) &&
          (!to || e.date <= to)
        )
        .map(e => {
          const p = pname(e.productId);

          return [
            p?.ref || '',
            e.date,
            p?.name || 'Produit supprimé',
            e.lot,
            e.qty,
            e.expiry || '—',
            e.createdByName || '—'
          ];
        });

      const doc = pdfBase(
        'Historique des entrées',
        `Période : ${from || '—'} → ${to || '—'}`
      );

      if (!doc) return;

      pdfLogo(doc);

      pdfTable(
        doc,
        [
          'Référence',
          'Date',
          'Produit',
          'Lot',
          'Qté',
          'Expiration',
          'Responsable'
        ],
        rows
      );

      savePDF(doc, 'historique-entrees.pdf');
    });
  }

  /* =========================================================
     INTERFACE RAPPORTS
     ========================================================= */

  function renderHistory() {
    // Conservé pour compatibilité.
  }

  function ensureReportsButtons() {
    const reports = $('page-reports');
    if (!reports) return;

    const grid = reports.querySelector('.report-grid');
    if (!grid) return;

    const buttons = [
      {
        id: 'dynamicReportProducts',
        title: 'Historique des produits',
        text: 'Produits et stock actuel',
        fn: pdfProducts
      },
      {
        id: 'dynamicReportEntries',
        title: 'Historique des entrées',
        text: 'Entrées filtrées par date',
        fn: pdfEntries
      },
      {
        id: 'dynamicReportExits',
        title: 'Historique des sorties',
        text: 'Sorties filtrées par date',
        fn: pdfExits
      },
      {
        id: 'dynamicReportClients',
        title: 'Rapport clients',
        text: 'Clients et hôpitaux',
        fn: pdfClients
      },
      {
        id: 'dynamicReportOrders',
        title: 'Historique des commandes',
        text: 'Commandes filtrées par date',
        fn: pdfOrdersReport
      }
    ];

    buttons.forEach(item => {
      if ($(item.id)) return;

      const b = document.createElement('button');
      b.id = item.id;
      b.className = 'report-card';

      b.innerHTML = `
        <span class="report-icon">▤</span>
        <span>
          <b>${item.title}</b>
          <small>${item.text}</small>
        </span>
        <i>→</i>
      `;

      b.onclick = item.fn;
      grid.appendChild(b);
    });
  }

  /* =========================================================
     GESTION DES UTILISATEURS
     ========================================================= */

  function ensureUserManagementUI() {
    if (!isDirector()) {
      $('kotharUserManagement')?.remove();
      return;
    }

    const page = $('page-settings');
    if (!page) return;

    let panel = $('kotharUserManagement');

    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'kotharUserManagement';
      panel.className = 'panel';
      panel.style.marginTop = '20px';

      panel.innerHTML = `
        <div class="panel-head">
          <div>
            <h3>Gestion des utilisateurs</h3>
            <p>
              Le Directeur peut ajouter plusieurs responsables et
              modifier le mot de passe de n'importe quel compte
              (y compris le sien).
            </p>
          </div>

          <button class="btn primary" id="kotharAddUserBtn">
            ＋ Ajouter utilisateur
          </button>
        </div>

        <div
          id="kotharUserManagementBody"
          style="overflow-x:auto;">
        </div>
      `;

      page.appendChild(panel);
      $('kotharAddUserBtn').onclick = () => userForm();
    }

    renderUserManagement();
  }

  function renderUserManagement() {
    const box = $('kotharUserManagementBody');
    if (!box) return;

    box.innerHTML = `
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr>
            <th style="${TH_STYLE}">Nom</th>
            <th style="${TH_STYLE}">Utilisateur</th>
            <th style="${TH_STYLE}">Rôle</th>
            <th style="${TH_STYLE}">État</th>
            <th style="${TH_STYLE}">Actions</th>
          </tr>
        </thead>

        <tbody>
          ${security.users.map(u => `
            <tr>
              <td style="${WRAP_TD_STYLE}">${esc(u.name)}</td>
              <td style="${WRAP_TD_STYLE}">${esc(u.username)}</td>

              <td style="${CENTER_TD_STYLE}">
                ${u.role === 'director' ? 'Directeur' : 'Responsable'}
              </td>

              <td style="${CENTER_TD_STYLE}">
                ${u.active !== false ? 'Actif' : 'Inactif'}
              </td>

              <td style="${ACTION_TD_STYLE}">
                <button
                  class="action"
                  data-user-act="edit"
                  data-id="${u.id}">
                  Modifier
                </button>

                <button
                  class="action"
                  data-user-act="password"
                  data-id="${u.id}">
                  Mot de passe
                </button>

                ${u.role !== 'director' ? `
                  <button
                    class="action"
                    data-user-act="toggle"
                    data-id="${u.id}">
                    ${u.active !== false ? 'Désactiver' : 'Activer'}
                  </button>

                  <button
                    class="action"
                    data-user-act="delete"
                    data-id="${u.id}">
                    Suppr.
                  </button>
                ` : ''}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    box.querySelectorAll('[data-user-act]').forEach(btn => {
      btn.onclick = () => {
        const user = security.users.find(u => u.id === btn.dataset.id);
        if (!user) return;

        if (btn.dataset.userAct === 'edit') {
          userForm(user);
        }

        if (btn.dataset.userAct === 'password') {
          changePasswordForm(user);
        }

        if (btn.dataset.userAct === 'delete') {
          deleteUser(user);
        }

        if (btn.dataset.userAct === 'toggle') {
          toggleUser(user);
        }
      };
    });
  }

  function changePasswordForm(user) {
    if (!requireDirector(
      'modifier le mot de passe d’un utilisateur'
    )) return;

    openModal(
      'Modifier le mot de passe — ' + user.name,
      `
        <form id="changePasswordForm">
          <div class="form-group">
            <label>Nouveau mot de passe *</label>
            <input name="password" type="password" required>
          </div>

          <div class="form-group">
            <label>Confirmer le mot de passe *</label>
            <input name="passwordConfirm" type="password" required>
          </div>

          <div class="form-actions-modal">
            <button
              type="button"
              class="btn secondary"
              id="cancelModal">
              Annuler
            </button>

            <button class="btn primary">Enregistrer</button>
          </div>
        </form>
      `
    );

    $('cancelModal').onclick = closeModal;

    $('changePasswordForm').onsubmit = e => {
      e.preventDefault();

      const f = new FormData(e.target);
      const password = f.get('password');
      const confirm2 = f.get('passwordConfirm');

      if (!password) {
        toast('Saisissez un mot de passe.', 'error');
        return;
      }

      if (password !== confirm2) {
        toast('Les mots de passe ne correspondent pas.', 'error');
        return;
      }

      user.password = password;

      audit('Modification mot de passe', user.username);
      saveSecurity();
      closeModal();
      renderUserManagement();

      toast('Mot de passe modifié');
    };
  }

  function userForm(user = null) {
    if (!requireDirector('gérer les utilisateurs')) return;

    const edit = !!user;

    openModal(
      edit ? 'Modifier utilisateur' : 'Ajouter utilisateur',
      `
        <form id="securityUserForm">
          <div class="form-grid">
            <div class="form-group">
              <label>Nom *</label>
              <input
                name="name"
                value="${esc(user?.name || '')}"
                required>
            </div>

            <div class="form-group">
              <label>Nom utilisateur *</label>
              <input
                name="username"
                value="${esc(user?.username || '')}"
                required>
            </div>

            ${!edit ? `
              <div class="form-group">
                <label>Code / mot de passe *</label>
                <input name="password" type="password" required>
              </div>
            ` : `
              <div class="form-group">
                <label>Code / mot de passe</label>
                <p style="margin:0;font-size:12px;color:#888;">
                  Utilisez le bouton « Mot de passe » dans la liste
                  pour changer le mot de passe.
                </p>
              </div>
            `}

            <div class="form-group">
              <label>Rôle</label>
              <select name="role">
                <option
                  value="responsable"
                  ${user?.role === 'responsable' ? 'selected' : ''}>
                  Responsable
                </option>

                ${user?.role === 'director' ? `
                  <option value="director" selected>
                    Directeur
                  </option>
                ` : ''}
              </select>
            </div>
          </div>

          <div class="form-actions-modal">
            <button
              type="button"
              class="btn secondary"
              id="cancelModal">
              Annuler
            </button>

            <button class="btn primary">
              ${edit ? 'Modifier' : 'Créer'}
            </button>
          </div>
        </form>
      `
    );

    $('cancelModal').onclick = closeModal;

    $('securityUserForm').onsubmit = e => {
      e.preventDefault();

      const f = new FormData(e.target);
      const name = f.get('name').trim();
      const username = f.get('username').trim();
      const role = f.get('role');

      if (!name || !username || (!edit && !f.get('password'))) {
        toast('Tous les champs sont obligatoires.', 'error');
        return;
      }

      const duplicate = security.users.find(u =>
        u.id !== user?.id &&
        u.username.toLowerCase() === username.toLowerCase()
      );

      if (duplicate) {
        toast('Ce nom utilisateur existe déjà.', 'error');
        return;
      }

      if (edit) {
        user.name = name;
        user.username = username;

        if (user.id !== 'director') {
          user.role = role;
        }

        audit('Modification utilisateur', username);
      } else {
        security.users.push({
          id: id('user'),
          name,
          username,
          password: f.get('password'),
          role,
          active: true
        });

        audit('Création utilisateur', username);
      }

      saveSecurity();
      closeModal();
      renderUserManagement();

      toast(edit ? 'Utilisateur modifié' : 'Utilisateur créé');
    };
  }

  function deleteUser(user) {
    if (!requireDirector('supprimer un utilisateur')) return;

    if (user.role === 'director') {
      toast('Le Directeur ne peut pas être supprimé.', 'error');
      return;
    }

    if (!confirm('Supprimer définitivement cet utilisateur ?')) {
      return;
    }

    security.users = security.users.filter(u => u.id !== user.id);

    audit('Suppression utilisateur', user.username);
    saveSecurity();
    renderUserManagement();

    toast('Utilisateur supprimé');
  }

  function toggleUser(user) {
    if (!requireDirector('modifier un utilisateur')) return;
    if (user.role === 'director') return;

    user.active = user.active === false;

    audit(
      user.active
        ? 'Activation utilisateur'
        : 'Désactivation utilisateur',
      user.username
    );

    saveSecurity();
    renderUserManagement();

    toast(user.active ? 'Utilisateur activé' : 'Utilisateur désactivé');
  }

  /* =========================================================
     RÉINITIALISATION
     ========================================================= */

  function resetApplication() {
    if (!requireDirector('réinitialiser l’application')) return;

    if (!confirm(
      'Réinitialiser complètement l’application ? Tous les produits, ' +
      'fabricants, entrées, sorties, clients et commandes seront ' +
      'définitivement supprimés. Cette action est irréversible.'
    )) return;

    audit('Réinitialisation application');

    db = clone(DEFAULT);
    save();

    toast('Application réinitialisée');

    setTimeout(() => location.reload(), 600);
  }

  function ensureResetUI() {
    if (!isDirector()) {
      $('kotharResetPanel')?.remove();
      return;
    }

    const page = $('page-settings');
    if (!page || $('kotharResetPanel')) return;

    const panel = document.createElement('div');
    panel.id = 'kotharResetPanel';
    panel.className = 'panel';
    panel.style.marginTop = '20px';
    panel.style.borderColor = '#b42318';

    panel.innerHTML = `
      <div class="panel-head">
        <div>
          <h3 style="color:#b42318;">Zone de danger</h3>
          <p>
            Réinitialise complètement l’application
            (produits, fabricants, entrées, sorties,
            clients, commandes).
            Réservé au Directeur.
          </p>
        </div>

        <button
          id="kotharResetBtn"
          class="btn"
          style="background:#b42318;color:#fff;">
          ⟳ Réinitialiser l’application
        </button>
      </div>
    `;

    page.appendChild(panel);
    $('kotharResetBtn').onclick = resetApplication;
  }

  /* =========================================================
     PARAMÈTRES
     ========================================================= */

  function saveSettings() {
    if (!requireDirector('modifier les paramètres')) return;

    db.settings.director =
      $('settingDirector')?.value.trim() ||
      DEFAULT.settings.director;

    db.settings.engineer =
      $('settingEngineer')?.value.trim() ||
      DEFAULT.settings.engineer;

    db.settings.threshold = Math.max(
      0,
      Number($('settingThreshold')?.value || 5)
    );

    db.settings.color = safeColor(
      $('settingColorText')?.value.trim() ||
      $('settingColor')?.value ||
      DEFAULT.settings.color
    );

    if ($('settingRecoveryCode')) {
      db.settings.recoveryCode =
        $('settingRecoveryCode').value.trim() ||
        DEFAULT.settings.recoveryCode;
    }

    save();
    apply();

    audit('Modification paramètres');
    toast('Paramètres enregistrés');
  }

  function setupLogo() {
    $('logoInput')?.addEventListener('change', async e => {
      if (!requireDirector('modifier le logo')) return;

      const file = e.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        toast('Choisissez une image pour le logo', 'error');
        return;
      }

      const url = URL.createObjectURL(file);
      try {
        const image = new Image();
        image.src = url;
        await image.decode();
        const canvas = document.createElement('canvas');
        const ratio = Math.min(1, 512 / Math.max(image.naturalWidth, image.naturalHeight));
        let prepared = '';
        for (const scale of [1, 0.75, 0.5, 0.375]) {
          canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio * scale));
          canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio * scale));
          canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
          const compressed = canvas.toDataURL('image/webp', 0.8);
          if (new TextEncoder().encode(compressed).length > 500000) continue;
          prepared = compressed;
          break;
        }
        if (!prepared) {
          throw new Error('Logo trop volumineux après compression');
        }
        db.settings.logo = prepared;
        save();
        apply();
        audit('Modification logo');
        toast('Logo enregistré');
      } catch (error) {
        console.error(error);
        toast('Impossible de préparer ce logo. Choisissez une image plus petite.', 'error');
      } finally {
        URL.revokeObjectURL(url);
        e.target.value = '';
      }
    });
  }

  function ensureRecoveryCodeUI() {
    if (!isDirector()) {
      $('kotharRecoveryPanel')?.remove();
      return;
    }

    const page = $('page-settings');
    if (!page) return;

    if ($('kotharRecoveryPanel')) {
      if ($('settingRecoveryCode')) {
        $('settingRecoveryCode').value =
          db.settings.recoveryCode || '';
      }
      return;
    }

    const panel = document.createElement('div');
    panel.id = 'kotharRecoveryPanel';
    panel.className = 'panel';
    panel.style.marginTop = '20px';

    panel.innerHTML = `
      <div class="panel-head">
        <div>
          <h3>Code de récupération</h3>
          <p>
            Ce code permet à un utilisateur de réinitialiser
            son mot de passe depuis l'écran de connexion
            (« Mot de passe oublié ? »).
            Communiquez-le uniquement aux personnes de confiance.
          </p>
        </div>
      </div>

      <div class="form-group" style="max-width:260px;">
        <label>Code de récupération</label>
        <input
          id="settingRecoveryCode"
          value="${esc(db.settings.recoveryCode || '')}">
      </div>
    `;

    page.appendChild(panel);
  }

  /* =========================================================
     MODALE
     ========================================================= */

  function openModal(title, html) {
    if (!$('modalOverlay')) return;

    $('modalTitle').textContent = title;
    $('modalBody').innerHTML = html;
    $('modalOverlay').classList.add('open');

    document.querySelectorAll('[data-remove-lot]').forEach(btn => {
      btn.onclick = () => btn.closest('[data-lot-row]')?.remove();
    });

    document.querySelectorAll('[data-remove-exit-item]').forEach(btn => {
      btn.onclick = () => btn.closest('.exit-item-row')?.remove();
    });

    document.querySelectorAll('[data-remove-entry-item]').forEach(btn => {
      btn.onclick = () => btn.closest('.entry-item-row')?.remove();
    });

    document.querySelectorAll('[data-remove-order-item]').forEach(btn => {
      btn.onclick = () => btn.closest('.order-item-row')?.remove();
    });
  }

  function closeModal() {
    $('modalOverlay')?.classList.remove('open');

    if ($('modalBody')) {
      $('modalBody').innerHTML = '';
    }
  }

  /* =========================================================
     TABLEAU DE BORD
     ========================================================= */

  function renderDashboard() {
    const ps = db.products;

    if ($('statProducts')) {
      $('statProducts').textContent = ps.length;
    }

    if ($('statManufacturers')) {
      $('statManufacturers').textContent = db.manufacturers.length;
    }

    if ($('statClients')) {
      $('statClients').textContent = db.clients.length;
    }

    if ($('statLowStock')) {
      $('statLowStock').textContent = ps.filter(p =>
        stock(p) > 0 && stock(p) <= productThreshold(p)
      ).length;
    }

    if ($('statFinished')) {
      $('statFinished').textContent =
        ps.filter(p => stock(p) <= 0).length;
    }

    if ($('statExpiring')) {
      $('statExpiring').textContent = ps.filter(expiring).length;
    }

    const alerts = [];

    ps.filter(p => stock(p) <= 0).forEach(p => {
      alerts.push(`
        <div class="alert-item">
          <b>${esc(p.name)}</b> : stock terminé
        </div>
      `);
    });

    ps.filter(p =>
      stock(p) > 0 && stock(p) <= productThreshold(p)
    ).forEach(p => {
      alerts.push(`
        <div class="alert-item">
          <b>${esc(p.name)}</b> : stock faible (${stock(p)})
        </div>
      `);
    });

    ps.filter(expiring).forEach(p => {
      alerts.push(`
        <div class="alert-item">
          <b>${esc(p.name)}</b> :
          expiration ${esc(nearestFutureExpiry(p))}
        </div>
      `);
    });

    if ($('dashboardAlerts')) {
      $('dashboardAlerts').innerHTML =
        alerts.join('') ||
        '<div class="empty">Aucune alerte.</div>';
    }

    if ($('dashboardOrder')) {
      $('dashboardOrder').innerHTML = db.orders
        .slice(-5)
        .reverse()
        .map(o => `
          <div class="order-item">
            <b>
              ${
                o.type === 'supplier'
                  ? 'Bon de commande'
                  : 'Expression de besoin'
              }
            </b>
            — ${esc(o.date || '')}
            <br>
            ${o.items?.length || 0} produit(s)
          </div>
        `).join('') ||
        '<div class="empty">Aucune commande.</div>';
    }
  }

  /* =========================================================
     NAVIGATION
     ========================================================= */

  function page(p) {
    document.querySelectorAll('.page').forEach(x => {
      x.classList.remove('active');
    });

    $('page-' + p)?.classList.add('active');

    document.querySelectorAll('.nav-item').forEach(x => {
      x.classList.toggle('active', x.dataset.page === p);
    });

    const names = {
      dashboard: ['Tableau de bord', 'Vue générale du stock'],
      products: ['Produits', 'Produits, lots et emplacement'],
      manufacturers: ['Fabricants', 'Produits par fabricant'],
      entries: ['Entrées', 'Réceptions et lots'],
      exits: ['Sorties', 'Livraisons clients'],
      clients: ['Clients / Hôpitaux', 'Clients enregistrés'],
      orders: ['Commandes', 'Demandes de réapprovisionnement'],
      reports: ['Rapports', 'Documents PDF'],
      settings: ['Paramètres', 'Configuration']
    };

    if ($('pageTitle')) {
      $('pageTitle').textContent = names[p]?.[0] || '';
    }

    if ($('pageSubtitle')) {
      $('pageSubtitle').textContent = names[p]?.[1] || '';
    }

    render();

    if (p === 'settings') {
      ensureUserManagementUI();
      ensureRecoveryCodeUI();
    }
  }

  /* =========================================================
     ACTUALISATION GLOBALE
     ========================================================= */

  function fillManufacturerFilter() {
    const select = $('productManufacturerFilter');
    if (!select) return;

    const old = select.value;

    select.innerHTML =
      '<option value="">Tous les fabricants</option>' +
      db.manufacturers.map(m => `
        <option value="${m.id}">${esc(m.name)}</option>
      `).join('');

    select.value = old;
  }

  function render() {
    apply();
    renderProducts();
    renderManufacturers();
    renderEntries();
    renderExits();
    renderClients();
    renderOrders();
    renderDashboard();
    fillManufacturerFilter();
    ensureReportsButtons();

    if (isDirector()) {
      renderUserManagement();
      ensureResetUI();
      ensureRecoveryCodeUI();
    } else {
      $('kotharResetPanel')?.remove();
      $('kotharRecoveryPanel')?.remove();
    }
  }

  /* =========================================================
     ÉVÉNEMENTS
     ========================================================= */

  function setupEvents() {
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.onclick = () => page(btn.dataset.page);
    });

    $('addProductBtn')?.addEventListener('click', () => {
      if (!requireLogin()) return;
      productForm();
    });

    $('productsPdfBtn')?.addEventListener('click', pdfProducts);
    $('productSearch')?.addEventListener('input', renderProducts);
    $('productCategoryFilter')?.addEventListener('change', renderProducts);
    $('productManufacturerFilter')?.addEventListener('change', renderProducts);

    $('addManufacturerBtn')?.addEventListener(
      'click',
      () => manufacturerForm()
    );

    $('closeManufacturerProducts')?.addEventListener('click', () => {
      selectedManufacturer = null;
      $('manufacturerProductsPanel')?.classList.add('hidden');
    });

    $('addEntryBtn')?.addEventListener('click', addEntry);
    $('entriesPdfBtn')?.addEventListener('click', pdfEntries);
    $('entrySearch')?.addEventListener('input', renderEntries);

    $('addExitBtn')?.addEventListener('click', addExit);
    $('exitsPdfBtn')?.addEventListener('click', pdfExits);
    $('exitSearch')?.addEventListener('input', renderExits);

    $('addClientBtn')?.addEventListener('click', () => clientForm());
    $('clientSearch')?.addEventListener('input', renderClients);

    $('makeOrderBtn')?.addEventListener('click', () => makeOrder());

    $('reportProductsBtn')?.addEventListener('click', pdfProducts);
    $('reportEntriesBtn')?.addEventListener('click', pdfEntries);
    $('reportExitsBtn')?.addEventListener('click', pdfExits);

    $('headerSettingsBtn')?.addEventListener(
      'click',
      () => page('settings')
    );

    $('settingColor')?.addEventListener('input', e => {
      if ($('settingColorText')) {
        $('settingColorText').value = e.target.value;
      }
    });

    $('settingColorText')?.addEventListener('input', e => {
      const color = safeColor(e.target.value);

      if ($('settingColor')) {
        $('settingColor').value = color;
      }
    });

    setupLogo();

    $('modalClose')?.addEventListener('click', closeModal);

    $('modalOverlay')?.addEventListener('click', e => {
      if (e.target === $('modalOverlay')) {
        closeModal();
      }
    });
  }

  /* =========================================================
     ACTIONS DES BOUTONS
     ========================================================= */

  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;

    const action = btn.dataset.act;
    const target = btn.dataset.id;

    if (action === 'editProduct') {
      const p = pname(target);
      if (p) productForm(p);
    }

    if (action === 'deleteProduct') {
      const p = pname(target);
      if (p) deleteProduct(p);
    }

    if (action === 'viewManufacturer') {
      showManufacturer(target);
    }

    if (action === 'editManufacturer') {
      const m = db.manufacturers.find(x => x.id === target);
      if (m) manufacturerForm(m);
    }

    if (action === 'deleteManufacturer') {
      const m = db.manufacturers.find(x => x.id === target);
      if (m) deleteManufacturer(m);
    }

    if (action === 'deleteEntry') {
      const entry = db.entries.find(x => x.id === target);
      if (entry) deleteEntry(entry);
    }

    if (action === 'deleteExit') {
      const exit = db.exits.find(x => x.id === target);
      if (exit) deleteExit(exit);
    }

    if (action === 'editClient') {
      const c = db.clients.find(x => x.id === target);
      if (c) clientForm(c);
    }

    if (action === 'deleteClient') {
      const c = db.clients.find(x => x.id === target);
      if (c) deleteClient(c);
    }

    if (action === 'pdfOrder') {
      const o = db.orders.find(x => x.id === target);
      if (o) pdfOrder(o);
    }

    if (action === 'createBCFromNeed') {
      const o = db.orders.find(x => x.id === target);
      if (o) createSupplierOrderFromNeed(o);
    }

    if (action === 'editOrder') {
      const o = db.orders.find(x => x.id === target);
      if (o) makeOrder(o);
    }

    if (action === 'deleteOrder') {
      const o = db.orders.find(x => x.id === target);
      if (o) deleteOrder(o);
    }
  });

  /* =========================================================
     INITIALISATION
     ========================================================= */
  window.__kotharReload = function () {
    const cur = security.current;   // إبقاء المستخدم الحالي متصلًا
    db = load();
    security = loadSecurity();
    security.current = security.users.find(u =>
      u.username === cur?.username &&
      u.role === cur?.role &&
      u.active !== false
    ) ? cur : null;
    render();
    if (!security.current) ensureSecurityUI();
  };
  
  function init() {
    setupEvents();
    apply();
    render();
    initSettingsSave();
    initSecurity();

    setTimeout(() => {
      ensureReportsButtons();
      render();
    }, 100);
  }

  function initSecurity() {
    if (!isLoggedIn()) {
      ensureSecurityUI();
    } else {
      addSecurityUserBadge();
    }
  }

  function initSettingsSave() {
    const panel = $('page-settings');
    if (!panel) return;

    if (panel.querySelector('#saveKotharSettings')) return;

    const btn = document.createElement('button');
    btn.id = 'saveKotharSettings';
    btn.className = 'btn primary';
    btn.textContent = 'Enregistrer les paramètres';
    btn.style.marginTop = '15px';

    panel.querySelector('.settings-layout')?.appendChild(btn);

    btn.onclick = saveSettings;
  }

  /* =========================================================
     DÉMARRAGE
     ========================================================= */

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
