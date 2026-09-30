/* Kothar Médical — comptes Firebase individuels et données Firestore séparées. */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getFirestore, doc, getDoc, getDocs, setDoc, onSnapshot, runTransaction, addDoc, collection, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

const app = initializeApp({
  apiKey: 'AIzaSyCBrGqrZZV-T6c7dc5fpqLbvKrJiG9WvG4',
  authDomain: 'gs-kotharmed.firebaseapp.com', projectId: 'gs-kotharmed',
  appId: '1:311583059679:web:ebf5cd2f889e058863c36a'
});
const DIRECTOR_UID = 'zhrUhfKfUPe8uY786I2GLOzUIET2';
const auth = getAuth(app), db = getFirestore(app);
const KEY = 'kothar_medical_inventory_v5';
const BACKUP_KEY = 'kothar_medical_before_roles_backup';
const clientId = crypto.randomUUID();
const ref = name => doc(db, 'kothar', name);
const rawSet = Storage.prototype.setItem;
const versions = { inventory: 0, settings: 0, logo: 0 };
const pending = { inventory: null, settings: null, logo: null };
const busy = { inventory: false, settings: false, logo: false };
const timers = {};
let inventoryJson = null, settingsJson = null, logo = '', started = false, conflict = false, badge;
window.__kotharFirebaseAuth = true;
window.__kotharIdentity = null;
window.__kotharSignOut = async () => { await signOut(auth); location.reload(); };
window.__kotharAudit = entry => {
  if (!auth.currentUser || !entry) return;
  addDoc(collection(db, 'kothar_audit'), {
    by: auth.currentUser.uid,
    at: serverTimestamp(),
    action: String(entry.action || '').slice(0, 150),
    details: String(entry.details || '').slice(0, 500),
    name: String(window.__kotharIdentity?.name || '').slice(0, 100)
  }).catch(e => { console.error(e); status('☁ Journal non synchronisé', '#b63838'); });
};

function status(message, color = '#7B3452') {
  if (!badge) {
    badge = document.createElement('div');
    badge.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:999998;padding:7px 12px;border-radius:20px;font:600 12px system-ui;color:white';
    document.body.append(badge);
  }
  badge.textContent = message; badge.style.background = color;
}
function panel(title, description, build) {
  document.getElementById('cloudPanel')?.remove();
  const o = document.createElement('div'); o.id = 'cloudPanel';
  o.style.cssText = 'position:fixed;inset:0;background:#f5f6f8;z-index:9999999;display:grid;place-items:center;font-family:system-ui';
  const c = document.createElement('div');
  c.style.cssText = 'width:min(390px,92vw);box-sizing:border-box;background:white;padding:28px;border-radius:16px;box-shadow:0 20px 60px #0002';
  const h = document.createElement('h2'); h.textContent = title;
  const p = document.createElement('p'); p.textContent = description;
  c.append(h, p); build?.(c); o.append(c); document.body.append(o);
}
function button(parent, label, action) {
  const b = document.createElement('button'); b.textContent = label; b.type = 'button';
  b.style.cssText = 'display:block;width:100%;padding:11px;margin-top:10px;background:#7B3452;color:white;border:0;border-radius:8px;cursor:pointer';
  b.onclick = action; parent.append(b); return b;
}
function login() {
  if (started) return;
  panel('☁ Kothar Médical', 'Connectez-vous avec votre compte Firebase personnel.', c => {
    const email = document.createElement('input'), pass = document.createElement('input'), error = document.createElement('p');
    email.type = 'email'; email.placeholder = 'Adresse e-mail'; pass.type = 'password'; pass.placeholder = 'Mot de passe';
    for (const el of [email, pass]) { el.style.cssText = 'box-sizing:border-box;width:100%;height:42px;margin:5px 0;padding:0 12px'; c.append(el); }
    error.style.color = '#b42318'; c.append(error);
    const submit = async () => {
      error.textContent = '';
      try { await signInWithEmailAndPassword(auth, email.value.trim(), pass.value); }
      catch (e) { console.error(e); error.textContent = 'Connexion refusée. Vérifiez vos identifiants.'; }
    };
    pass.onkeydown = e => { if (e.key === 'Enter') submit(); };
    button(c, 'Se connecter', submit);
  });
}
function deny() {
  panel('Accès non autorisé', 'Le Directeur doit activer ce compte dans Firestore avant son utilisation.', c => button(c, 'Changer de compte', window.__kotharSignOut));
}
function split(raw) {
  const data = JSON.parse(raw), settings = { ...(data.settings || {}) };
  const image = settings.logo || '';
  settings.logo = ''; delete settings.recoveryCode; delete data.settings;
  return { inventory: JSON.stringify(data), settings: JSON.stringify(settings), image };
}
function combine() {
  if (!inventoryJson) return;
  const data = JSON.parse(inventoryJson);
  data.settings = { ...(settingsJson ? JSON.parse(settingsJson) : {}), logo, recoveryCode: '' };
  rawSet.call(localStorage, KEY, JSON.stringify(data));
}
async function write(name, value, expected = versions[name]) {
  if (new TextEncoder().encode(value).length > 950000) throw new Error('Document trop volumineux');
  const next = await runTransaction(db, async tx => {
    const snap = await tx.get(ref(name)), current = snap.exists() ? (snap.data().version || 0) : 0;
    if (current !== expected) { const e = new Error('Version modifiée'); e.code = 'kothar/conflict'; throw e; }
    tx.set(ref(name), { value, version: current + 1, by: auth.currentUser.uid, session: clientId });
    return current + 1;
  });
  versions[name] = next;
}
function showConflict() {
  if (conflict) return;
  conflict = true; status('☁ Conflit : sauvegardez votre copie locale', '#b63838');
  panel('Conflit de synchronisation', 'Une autre session a modifié le stock. Téléchargez votre copie locale avant de recharger.', c => {
    button(c, 'Télécharger ma copie locale', () => {
      const url = URL.createObjectURL(new Blob([localStorage.getItem(KEY) || '{}'], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = 'kothar-copie-locale.json'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    });
    button(c, 'Recharger', () => location.reload());
  });
}
function queue(name, value) {
  if (conflict) return;
  pending[name] = value; clearTimeout(timers[name]);
  status('☁ Enregistrement…', '#b47712'); timers[name] = setTimeout(() => flush(name), 700);
}
async function flush(name) {
  if (busy[name] || pending[name] == null || conflict) return;
  busy[name] = true; const value = pending[name];
  try {
    await write(name, value);
    if (pending[name] === value) pending[name] = null;
    if (name === 'inventory') inventoryJson = value;
    if (name === 'settings') settingsJson = value;
    if (name === 'logo') logo = value;
    status('☁ Synchronisé', '#237a49');
  } catch (e) {
    console.error(e);
    if (e.code === 'kothar/conflict') showConflict();
    else status('☁ Échec : connexion ou règles Firestore', '#b63838');
  } finally {
    busy[name] = false;
    if (pending[name] != null && !conflict && navigator.onLine) {
      clearTimeout(timers[name]); timers[name] = setTimeout(() => flush(name), 2000);
    }
  }
}
async function load() {
  const [inv, settings, image] = await Promise.all(['inventory', 'settings', 'logo'].map(n => getDoc(ref(n))));
  for (const [n, s] of [['inventory', inv], ['settings', settings], ['logo', image]]) versions[n] = s.exists() ? (s.data().version || 0) : 0;
  logo = image.exists() ? image.data().value || '' : '';
  const director = auth.currentUser.uid === DIRECTOR_UID;
  const legacy = inv.exists() ? JSON.parse(inv.data().value) : null;
  const source = legacy || (director && localStorage.getItem(KEY) ? JSON.parse(localStorage.getItem(KEY)) : null);
  if (director && source?.settings && !settings.exists() && !localStorage.getItem(BACKUP_KEY)) {
    rawSet.call(localStorage, BACKUP_KEY, JSON.stringify({
      inventory: inv.exists() ? inv.data() : { value: JSON.stringify(source) },
      logo: image.exists() ? image.data() : null,
      savedAt: new Date().toISOString()
    }));
  }
  if (settings.exists()) settingsJson = settings.data().value;
  else if (director && source?.settings) {
    const parts = split(JSON.stringify(source));
    await write('settings', parts.settings); settingsJson = parts.settings;
    if (!image.exists() && parts.image) { await write('logo', parts.image); logo = parts.image; }
  }
  if (inv.exists()) {
    if (legacy?.settings && director) {
      const parts = split(inv.data().value);
      await write('inventory', parts.inventory); inventoryJson = parts.inventory;
    } else inventoryJson = inv.data().value;
  } else if (source && director) {
    const parts = split(JSON.stringify(source));
    await write('inventory', parts.inventory); inventoryJson = parts.inventory;
  }
  combine();
}
function watch(name) {
  onSnapshot(ref(name), snap => {
    if (!snap.exists() || snap.metadata.hasPendingWrites || conflict) return;
    const data = snap.data();
    if (data.session === clientId) return;
    if ((data.version || 0) <= versions[name]) return;
    if (Object.values(pending).some(v => v != null) || Object.values(busy).some(Boolean) || document.getElementById('modalOverlay')?.classList.contains('open')) { showConflict(); return; }
    versions[name] = data.version || 0;
    if (name === 'inventory') inventoryJson = data.value;
    if (name === 'settings') settingsJson = data.value;
    if (name === 'logo') logo = data.value || '';
    combine(); window.__kotharReload?.();
    status('☁ Mis à jour depuis un autre appareil', '#3c70a8');
  }, e => { console.error(e); status('☁ Lecture cloud interrompue', '#b63838'); });
}
function hookStorage() {
  Storage.prototype.setItem = function (key, value) {
    rawSet.call(this, key, value);
    if (this !== localStorage || key !== KEY || conflict) return;
    const data = split(value);
    if (data.inventory !== inventoryJson) queue('inventory', data.inventory);
    if (auth.currentUser?.uid === DIRECTOR_UID) {
      if (data.settings !== settingsJson) queue('settings', data.settings);
      if (data.image !== logo) queue('logo', data.image);
    }
  };
}
function label(tag, value) {
  const el = document.createElement(tag); el.textContent = value; return el;
}
async function renderUsers() {
  const page = document.getElementById('page-settings');
  if (!page || auth.currentUser?.uid !== DIRECTOR_UID) return;
  let box = document.getElementById('kotharUserManagement');
  if (!box) {
    box = document.createElement('div'); box.id = 'kotharUserManagement';
    box.className = 'panel'; box.style.cssText = 'margin-top:20px;padding:20px'; page.append(box);
  }
  box.replaceChildren(label('h3', 'Comptes des responsables'), label('p', 'Créez d’abord leur compte dans Firebase Authentication → Utilisateurs, puis copiez ici leur UID.'));
  if (localStorage.getItem(BACKUP_KEY)) button(box, 'Télécharger la sauvegarde avant migration', () => {
    const url = URL.createObjectURL(new Blob([localStorage.getItem(BACKUP_KEY)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'kothar-sauvegarde-avant-comptes.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  });
  const uid = document.createElement('input'), name = document.createElement('input');
  uid.placeholder = 'UID Firebase'; name.placeholder = 'Nom affiché';
  for (const field of [uid, name]) {
    field.style.cssText = 'box-sizing:border-box;width:100%;padding:10px;margin:5px 0'; box.append(field);
  }
  button(box, 'Autoriser le responsable', async () => {
    const id = uid.value.trim(), displayName = name.value.trim();
    if (!/^[A-Za-z0-9]{15,128}$/.test(id) || id === DIRECTOR_UID || !displayName) { alert('Vérifiez l’UID et le nom.'); return; }
    try {
      await setDoc(doc(db, 'kothar_users', id), { role: 'responsable', name: displayName.slice(0, 100), active: true });
      renderUsers();
    } catch (e) { console.error(e); alert('Accès non enregistré. Vérifiez les règles Firestore.'); }
  });
  try {
    const records = await getDocs(collection(db, 'kothar_users'));
    for (const record of records.docs) {
      const profile = record.data(), row = document.createElement('div');
      row.style.cssText = 'padding:10px 0;border-top:1px solid #ddd';
      row.append(label('strong', profile.name || record.id), label('small', ' — ' + record.id + (profile.active ? ' · actif' : ' · désactivé')));
      const toggle = document.createElement('button'); toggle.type = 'button';
      toggle.textContent = profile.active ? 'Désactiver' : 'Activer'; toggle.style.marginLeft = '12px';
      toggle.onclick = async () => {
        try {
          await setDoc(doc(db, 'kothar_users', record.id), { role: 'responsable', name: profile.name, active: !profile.active });
          renderUsers();
        } catch (e) { console.error(e); alert('Modification refusée.'); }
      };
      row.append(toggle); box.append(row);
    }
  } catch (e) { console.error(e); box.append(label('p', 'Impossible de lire les comptes.')); }
}
window.__kotharRenderUsers = renderUsers;
async function start() {
  if (started) return; started = true; status('☁ Chargement…', '#3c70a8');
  try {
    const user = auth.currentUser;
    if (user.uid === DIRECTOR_UID) window.__kotharIdentity = { uid: user.uid, username: user.email, name: 'Directeur', role: 'director' };
    else {
      const profile = await getDoc(doc(db, 'kothar_users', user.uid));
      if (!profile.exists() || profile.data().role !== 'responsable' || profile.data().active !== true) { started = false; deny(); return; }
      window.__kotharIdentity = { uid: user.uid, username: user.email, name: profile.data().name, role: 'responsable' };
      onSnapshot(doc(db, 'kothar_users', user.uid), s => { if (!s.exists() || s.data().active !== true) window.__kotharSignOut(); });
    }
    await load(); hookStorage();
    document.getElementById('cloudPanel')?.remove();
    const script = document.createElement('script'); script.src = 'app.js';
    script.onerror = () => status('Impossible de charger app.js', '#b63838');
    document.body.append(script);
    for (const n of ['inventory', 'settings', 'logo']) watch(n);
    status('☁ Synchronisé', '#237a49');
  } catch (e) {
    started = false; console.error(e);
    panel('Chargement impossible', 'Vérifiez la connexion et les règles Firestore. La copie locale est conservée.', c => button(c, 'Réessayer', () => { document.getElementById('cloudPanel')?.remove(); start(); }));
    status('☁ Erreur de connexion', '#b63838');
  }
}
window.addEventListener('online', () => { if (started) for (const n of ['inventory', 'settings', 'logo']) flush(n); });
function begin() { onAuthStateChanged(auth, user => user ? start() : login()); }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', begin);
else begin();
