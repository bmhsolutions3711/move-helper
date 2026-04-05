// Move Helper — Shared utilities
// IDB, voice dictation, toast, esc, closeModal

const IDB_NAME = 'MoveHelperStore';
const IDB_STORE = 'meta';
const IDB_BLOBS = 'blobs';
const DB_KEY = 'move-helper-db';

// IndexedDB
function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 2);
    req.onupgradeneeded = () => {
      const idb = req.result;
      if (!idb.objectStoreNames.contains(IDB_STORE)) idb.createObjectStore(IDB_STORE);
      if (!idb.objectStoreNames.contains(IDB_BLOBS)) idb.createObjectStore(IDB_BLOBS);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function persistDB() {
  const data = db.export();
  const idb = await openIDB();
  const tx = idb.transaction(IDB_STORE, 'readwrite');
  tx.objectStore(IDB_STORE).put(data.buffer, DB_KEY);
}
async function loadFromIDB() {
  try {
    const idb = await openIDB();
    return new Promise((resolve) => {
      const tx = idb.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(DB_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch(e) { return null; }
}
async function saveBlobToIDB(key, blob) {
  const idb = await openIDB();
  const tx = idb.transaction(IDB_BLOBS, 'readwrite');
  tx.objectStore(IDB_BLOBS).put(blob, key);
}
async function loadBlobFromIDB(key) {
  try {
    const idb = await openIDB();
    return new Promise((resolve) => {
      const tx = idb.transaction(IDB_BLOBS, 'readonly');
      const req = tx.objectStore(IDB_BLOBS).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch(e) { return null; }
}
async function deleteBlobFromIDB(key) {
  try {
    const idb = await openIDB();
    const tx = idb.transaction(IDB_BLOBS, 'readwrite');
    tx.objectStore(IDB_BLOBS).delete(key);
  } catch(e) {}
}

// Utilities
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 1500);
}
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

// Voice dictation
let activeRecognition = null;
let activeBtn = null;
function voiceDictate(btn, inputId) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { toast('Voice not supported in this browser'); return; }
  if (activeBtn === btn) { stopDictation(); return; }
  if (activeRecognition) stopDictation();
  const input = document.getElementById(inputId);
  if (!input) return;
  const rec = new SR();
  rec.continuous = false;
  rec.interimResults = true;
  rec.lang = 'en-US';
  const startVal = input.value;
  btn.classList.add('recording');
  activeRecognition = rec;
  activeBtn = btn;
  rec.onresult = (e) => {
    const result = e.results[0];
    const text = result[0].transcript;
    input.value = startVal + (startVal ? ' ' : '') + text;
    if (result.isFinal) stopDictation();
  };
  rec.onerror = (e) => { if (e.error !== 'aborted' && e.error !== 'no-speech') toast('Voice error: ' + e.error); stopDictation(); };
  rec.onend = () => { if (activeBtn === btn) stopDictation(); };
  rec.start();
}
function stopDictation() {
  if (activeRecognition) { try { activeRecognition.stop(); } catch(e){} activeRecognition = null; }
  if (activeBtn) { activeBtn.classList.remove('recording'); activeBtn = null; }
}

// Data export/import for sharing between devices
function exportAllData() {
  if (!db) { toast('Database not loaded'); return; }
  const data = {};
  const tables = ['projects','tasks','timeline_events','boxes','expenses'];
  tables.forEach(t => {
    try {
      const rows = db.exec(`SELECT * FROM ${t}`);
      if (rows.length) {
        data[t] = { columns: rows[0].columns, values: rows[0].values };
      }
    } catch(e) {}
  });
  data._exported = new Date().toISOString();
  data._version = 'move-helper-v1';
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `move-helper-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Data exported');
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (data._version !== 'move-helper-v1') { toast('Invalid backup file'); return; }
      if (!confirm('This will REPLACE all current data. Continue?')) return;
      const tables = ['projects','tasks','timeline_events','boxes','expenses'];
      tables.forEach(t => {
        if (data[t]) {
          db.run(`DELETE FROM ${t}`);
          const cols = data[t].columns;
          data[t].values.forEach(row => {
            const placeholders = cols.map(() => '?').join(',');
            db.run(`INSERT INTO ${t} (${cols.join(',')}) VALUES (${placeholders})`, row);
          });
        }
      });
      persistDB();
      toast('Data imported — reloading...');
      setTimeout(() => location.reload(), 800);
    } catch(err) {
      toast('Import failed: ' + err.message);
    }
  };
  reader.readAsText(file);
}

// Service worker
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
