/* Kothar Médical — chargement et synchronisation Firestore.
   Les données locales existantes sont importées si la base est vide. */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getFirestore, doc, getDoc, onSnapshot, runTransaction } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyCBrGqrZZV-T6c7dc5fpqLbvKrJiG9WvG4',
  authDomain: 'gs-kotharmed.firebaseapp.com',
  databaseURL: 'https://gs-kotharmed-default-rtdb.firebaseio.com',
  projectId: 'gs-kotharmed',
  storageBucket: 'gs-kotharmed.firebasestorage.app',
  messagingSenderId: '311583059679',
  appId: '1:311583059679:web:ebf5cd2f889e058863c36a',
  measurementId: 'G-WMVLJV420W'
};

const INVENTORY = 'kothar_medical_inventory_v5';
const SECURITY = 'kothar_medical_security_v1';
const names = { [INVENTORY]: 'inventory', [SECURITY]: 'security' };
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const ref = name => doc(db, 'kothar', name);
const clientId = crypto.randomUUID();
const versions = { inventory: 0, security: 0, logo: 0 };
const pending = { inventory: null, security: null, logo: null };
const timers = {};
const busy = { inventory: false, security: false, logo: false };
const originalSet = Storage.prototype.setItem;
let logo = '';
let inventoryJson = null;
let started = false;
let conflict = false;
let badge;

function setLocal(key, value) { originalSet.call(localStorage, key, value); }
function el(tag, attributes = {}, content = '') {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  node.textContent = content;
  return node;
}
function status(message, color = '#7B3452') {
  if (!badge) {
    badge = el('div');
    badge.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:999998;padding:7px 12px;border-radius:20px;font:600 12px system-ui;color:white';
    document.body.appendChild(badge);
  }
  badge.textContent = message;
  badge.style.background = color;
}
function panel(title, description, buttons) {
  document.getElementById('cloudPanel')?.remove();
  const overlay = el('div', { id: 'cloudPanel' });
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999999;background:#f5f6f8;display:grid;place-items:center;font-family:system-ui';
  const card = el('div');
  card.style.cssText = 'width:min(390px,92vw);box-sizing:border-box;background:white;padding:28px;border-radius:16px;box-shadow:0 20px 60px #0002';
  const heading = el('h2', {}, title);
  heading.style.cssText = 'margin:0 0 8px;color:#7B3452';
  const note = el('p', {}, description);
  note.style.cssText = 'color:#555;font-size:14px;line-height:1.5';
  card.append(heading, note);
  buttons(card);
  overlay.append(card);
  document.body.appendChild(overlay);
  return card;
}
function button(parent, caption, action) {
  const b = el('button', { type: 'button' }, caption);
  b.style.cssText = 'display:block;width:100%;margin-top:10px;padding:11px;border:0;border-radius:8px;background:#7B3452;color:white;font-weight:700;cursor:pointer';
  b.onclick = action;
  parent.appendChild(b);
  return b;
}
function showLogin() {
  if (started || document.getElementById('cloudPanel')) return;
  panel('☁ Kothar Médical', 'Connectez-vous au compte Firebase autorisé pour accéder au stock.', card => {
    const email = el('input', { type: 'email', placeholder: 'Email', autocomplete: 'username' });
    const password = el('input', { type: 'password', placeholder: 'Mot de passe', autocomplete: 'current-password' });
    for (const input of [email, password]) {
      input.style.cssText = 'box-sizing:border-box;width:100%;height:42px;margin:5px 0;padding:0 12px;border:1px solid #ddd;border-radius:8px';
      card.appendChild(input);
    }
    const error = el('div'); error.style.cssText = 'color:#b42318;font-size:12px;min-height:18px'; card.appendChild(error);
    async function submit() {
      error.textContent = '';
      try { await signInWithEmailAndPassword(auth, email.value.trim(), password.value); }
      catch (e) { error.textContent = 'Connexion refusée. Vérifiez le compte et le mot de passe Firebase.'; console.error(e); }
    }
    password.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    button(card, 'Se connecter', submit);
  });
}
function exportLocal() {
  const backup = { inventory: localStorage.getItem(INVENTORY), security: localStorage.getItem(SECURITY), createdAt: new Date().toISOString() };
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
  const a = el('a', { href: url, download: 'kothar-copie-locale.json' });
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function showConflict() {
  if (conflict) return;
  conflict = true;
  status('☁ Conflit : copie locale à vérifier', '#b63838');
  panel('Conflit de synchronisation', 'Une autre session a modifié les données pendant votre travail. Exportez votre copie locale avant de charger les données du cloud. La fusion devra être faite manuellement.', card => {
    button(card, 'Télécharger ma copie locale', exportLocal);
    button(card, 'Charger la version cloud', () => location.reload());
  });
}
function safeJson(value) { JSON.parse(value); return value; }
function splitInventory(raw) {
  const value = JSON.parse(raw);
  value.settings ||= {};
  const image = value.settings.logo || '';
  value.settings.logo = '';
  return { json: JSON.stringify(value), image };
}
function combineInventory() {
  if (!inventoryJson) return;
  const value = JSON.parse(inventoryJson);
  value.settings ||= {};
  value.settings.logo = logo;
  setLocal(INVENTORY, JSON.stringify(value));
}
async function write(name, value, expected = versions[name]) {
  if (new TextEncoder().encode(value).length > 950000) throw new Error('Document trop volumineux pour Firestore (logo ou stock).');
  const next = await runTransaction(db, async transaction => {
    const snap = await transaction.get(ref(name));
    const current = snap.exists() ? (snap.data().version || 0) : 0;
    if (current !== expected) { const error = new Error('Version cloud modifiée'); error.code = 'kothar/conflict'; throw error; }
    transaction.set(ref(name), { value, version: current + 1, by: clientId });
    return current + 1;
  });
  versions[name] = next;
}
function queue(name, value) {
  if (conflict) return;
  pending[name] = value;
  clearTimeout(timers[name]);
  status('☁ Enregistrement…', '#b47712');
  timers[name] = setTimeout(() => flush(name), 700);
}
async function flush(name) {
  if (busy[name] || pending[name] == null || conflict) return;
  busy[name] = true;
  const value = pending[name];
  try {
    await write(name, value);
    if (pending[name] === value) pending[name] = null;
    status('☁ Synchronisé', '#237a49');
  } catch (e) {
    console.error(e);
    if (e.code === 'kothar/conflict') showConflict();
    else status('☁ Échec : vérifiez la connexion et les règles Firestore', '#b63838');
  } finally {
    busy[name] = false;
    if (pending[name] != null && !conflict && navigator.onLine) {
      clearTimeout(timers[name]);
      timers[name] = setTimeout(() => flush(name), 2000);
    }
  }
}
async function loadCloud() {
  const [inv, sec, mark] = await Promise.all(['inventory', 'security', 'logo'].map(n => getDoc(ref(n))));
  for (const [name, snap] of [['inventory', inv], ['security', sec], ['logo', mark]]) {
    versions[name] = snap.exists() ? (snap.data().version || 0) : 0;
  }
  logo = mark.exists() ? (mark.data().value || '') : '';
  if (inv.exists()) {
    inventoryJson = safeJson(inv.data().value);
    combineInventory();
  } else if (localStorage.getItem(INVENTORY)) {
    const { json, image } = splitInventory(localStorage.getItem(INVENTORY));
    if (image) { await write('logo', image); logo = image; }
    await write('inventory', json);
    inventoryJson = json;
  }
  if (sec.exists()) setLocal(SECURITY, safeJson(sec.data().value));
  else if (localStorage.getItem(SECURITY)) await write('security', safeJson(localStorage.getItem(SECURITY)));
}
function watch(name) {
  onSnapshot(ref(name), snap => {
    if (!snap.exists() || snap.metadata.hasPendingWrites || conflict) return;
    const data = snap.data();
    const version = data.version || 0;
    if (version <= versions[name] || data.by === clientId) return;
    if (Object.values(pending).some(v => v != null) || Object.values(busy).some(Boolean) || document.getElementById('modalOverlay')?.classList.contains('open')) { showConflict(); return; }
    versions[name] = version;
    if (name === 'security') setLocal(SECURITY, safeJson(data.value));
    if (name === 'inventory') inventoryJson = safeJson(data.value);
    if (name === 'logo') logo = data.value || '';
    if (name !== 'security') combineInventory();
    window.__kotharReload?.();
    status('☁ Mis à jour depuis un autre appareil', '#3c70a8');
  }, e => { console.error(e); status('☁ Lecture cloud interrompue', '#b63838'); });
}
function hookStorage() {
  Storage.prototype.setItem = function (key, value) {
    originalSet.call(this, key, value);
    if (this !== localStorage || !(key in names) || conflict) return;
    if (key === SECURITY) { queue('security', value); return; }
    const { json, image } = splitInventory(value);
    queue('inventory', json);
    if (image !== logo) queue('logo', image);
  };
}
async function start() {
  if (started) return;
  started = true;
  document.getElementById('cloudPanel')?.remove();
  status('☁ Chargement…', '#3c70a8');
  try {
    await loadCloud();
    hookStorage();
    const script = el('script', { src: 'app.js' });
    script.onerror = () => status('Impossible de charger app.js', '#b63838');
    document.body.appendChild(script);
    for (const name of ['inventory', 'security', 'logo']) watch(name);
    status('☁ Synchronisé', '#237a49');
  } catch (e) {
    started = false;
    console.error(e);
    panel('Chargement impossible', 'Vérifiez la connexion, la configuration Firebase et les règles Firestore. Aucune donnée locale n’a été écrasée.', card => button(card, 'Réessayer', () => { document.getElementById('cloudPanel')?.remove(); start(); }));
    status('☁ Erreur de connexion', '#b63838');
  }
}
window.addEventListener('online', () => {
  if (!started) return;
  for (const name of ['inventory', 'security', 'logo']) flush(name);
});
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => onAuthStateChanged(auth, user => user ? start() : showLogin()));
} else onAuthStateChanged(auth, user => user ? start() : showLogin());
