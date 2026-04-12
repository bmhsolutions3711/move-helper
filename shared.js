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

// Export human-readable summary grouped by room
function exportSummaryHTML() {
  if (!db) { toast('Database not loaded'); return; }

  // Gather projects
  const projRows = db.exec('SELECT id, name FROM projects ORDER BY sort_order, id');
  const projects = projRows.length ? projRows[0].values : [];

  // Gather tasks grouped by project
  const taskRows = db.exec('SELECT project_id, text, notes, completed FROM tasks ORDER BY completed, sort_order, id');
  const tasksByProject = {};
  if (taskRows.length) {
    taskRows[0].values.forEach(([pid, text, notes, completed]) => {
      if (!tasksByProject[pid]) tasksByProject[pid] = [];
      tasksByProject[pid].push({ text, notes, completed });
    });
  }

  // Gather boxes grouped by room
  const boxRows = db.exec('SELECT box_number, contents, destination_room, thumbnail FROM boxes ORDER BY box_number');
  const boxesByRoom = {};
  if (boxRows.length) {
    boxRows[0].values.forEach(([num, contents, room, thumb]) => {
      const key = room || 'Unassigned';
      if (!boxesByRoom[key]) boxesByRoom[key] = [];
      boxesByRoom[key].push({ num, contents, thumb });
    });
  }

  // Gather timeline events grouped by category
  const tlRows = db.exec('SELECT title, event_date, category, completed, notes FROM timeline_events ORDER BY event_date, id');
  const tlByCategory = {};
  if (tlRows.length) {
    tlRows[0].values.forEach(([title, date, cat, completed, notes]) => {
      const key = cat || 'Other';
      if (!tlByCategory[key]) tlByCategory[key] = [];
      tlByCategory[key].push({ title, date, completed, notes });
    });
  }

  // Gather expenses
  const expRows = db.exec('SELECT amount, vendor, category, expense_date, notes FROM expenses ORDER BY expense_date, id');
  const expenses = expRows.length ? expRows[0].values : [];
  const totalExpenses = expenses.reduce((sum, r) => sum + (r[0] || 0), 0);

  // Build HTML
  const e = (s) => s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') : '';
  const date = new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });
  let html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Move Helper Summary — ${e(date)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f172a;color:#e2e8f0;padding:20px;max-width:800px;margin:0 auto;line-height:1.5}
h1{font-size:1.6rem;margin-bottom:4px;color:#fff}
.date{color:#94a3b8;font-size:.85rem;margin-bottom:24px}
h2{font-size:1.2rem;color:#f97066;margin:24px 0 12px;padding-bottom:6px;border-bottom:1px solid #1e293b}
h3{font-size:1rem;color:#93c5fd;margin:16px 0 8px}
.task{display:flex;gap:8px;align-items:flex-start;padding:6px 0}
.check{color:#22c55e;flex-shrink:0}
.open{color:#475569;flex-shrink:0}
.task.done{opacity:.5;text-decoration:line-through}
.task-notes{font-size:.8rem;color:#94a3b8;margin-left:24px}
.box-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;margin:8px 0}
.box-card{background:#1e293b;border-radius:10px;overflow:hidden;padding:0}
.box-card img{width:100%;aspect-ratio:1;object-fit:cover;display:block}
.box-card .no-photo{width:100%;aspect-ratio:1;display:flex;align-items:center;justify-content:center;font-size:2rem;background:#1e293b;color:#475569}
.box-info{padding:10px}
.box-num{font-weight:700;color:#f97066;font-size:.95rem}
.box-contents{font-size:.8rem;color:#e2e8f0;margin-top:2px}
.tl-item{display:flex;gap:8px;padding:4px 0}
.tl-item .check,.tl-item .open{margin-top:2px}
.tl-date{font-size:.75rem;color:#94a3b8;min-width:80px}
table{width:100%;border-collapse:collapse;margin:8px 0}
th{text-align:left;font-size:.75rem;color:#94a3b8;padding:6px 8px;border-bottom:1px solid #334155}
td{padding:6px 8px;font-size:.85rem;border-bottom:1px solid #1e293b}
.total-row td{font-weight:700;border-top:2px solid #334155;color:#f97066}
.empty{color:#475569;font-style:italic;font-size:.85rem;padding:4px 0}
@media print{body{background:#fff;color:#111}h2{color:#dc2626}h3{color:#2563eb}.box-card{background:#f1f5f9;border:1px solid #e2e8f0}.box-card .no-photo{background:#f1f5f9;color:#cbd5e1}th{color:#64748b}td{border-color:#e2e8f0}.total-row td{border-color:#94a3b8;color:#dc2626}.task.done{color:#94a3b8}.date{color:#64748b}.tl-date{color:#64748b}.empty{color:#94a3b8}.task-notes{color:#64748b}}
</style></head><body>
<h1>Move Helper Summary</h1>
<div class="date">${e(date)}</div>`;

  // Rooms section — tasks + boxes per room
  projects.forEach(([pid, name]) => {
    const tasks = tasksByProject[pid] || [];
    const boxes = boxesByRoom[name] || [];
    if (!tasks.length && !boxes.length) return;

    html += `<h2>${e(name)}</h2>`;

    if (tasks.length) {
      html += `<h3>Tasks</h3>`;
      tasks.forEach(t => {
        const icon = t.completed ? '<span class="check">&#10003;</span>' : '<span class="open">&#9675;</span>';
        html += `<div class="task${t.completed ? ' done' : ''}">${icon} ${e(t.text)}</div>`;
        if (t.notes) html += `<div class="task-notes">${e(t.notes)}</div>`;
      });
    }

    if (boxes.length) {
      html += `<h3>Boxes</h3><div class="box-grid">`;
      boxes.forEach(b => {
        html += `<div class="box-card">`;
        if (b.thumb) {
          html += `<img src="${b.thumb}" alt="Box ${b.num}">`;
        } else {
          html += `<div class="no-photo">&#128230;</div>`;
        }
        html += `<div class="box-info"><div class="box-num">Box #${b.num}</div><div class="box-contents">${e(b.contents || 'No contents listed')}</div></div></div>`;
      });
      html += `</div>`;
    }
  });

  // Boxes with no matching project (unassigned or room name doesn't match a project)
  const projectNames = new Set(projects.map(p => p[1]));
  Object.keys(boxesByRoom).forEach(room => {
    if (projectNames.has(room)) return;
    const boxes = boxesByRoom[room];
    html += `<h2>${e(room)}</h2><h3>Boxes</h3><div class="box-grid">`;
    boxes.forEach(b => {
      html += `<div class="box-card">`;
      if (b.thumb) {
        html += `<img src="${b.thumb}" alt="Box ${b.num}">`;
      } else {
        html += `<div class="no-photo">&#128230;</div>`;
      }
      html += `<div class="box-info"><div class="box-num">Box #${b.num}</div><div class="box-contents">${e(b.contents || 'No contents listed')}</div></div></div>`;
    });
    html += `</div>`;
  });

  // Timeline section
  const tlCategories = Object.keys(tlByCategory);
  if (tlCategories.length) {
    html += `<h2>Timeline</h2>`;
    tlCategories.forEach(cat => {
      html += `<h3>${e(cat)}</h3>`;
      tlByCategory[cat].forEach(t => {
        const icon = t.completed ? '<span class="check">&#10003;</span>' : '<span class="open">&#9675;</span>';
        const dateStr = t.date ? `<span class="tl-date">${e(t.date)}</span>` : '';
        html += `<div class="tl-item">${icon} ${dateStr} ${e(t.title)}</div>`;
        if (t.notes) html += `<div class="task-notes">${e(t.notes)}</div>`;
      });
    });
  }

  // Budget section
  if (expenses.length) {
    html += `<h2>Budget</h2><table><tr><th>Vendor</th><th>Category</th><th>Date</th><th>Notes</th><th style="text-align:right">Amount</th></tr>`;
    expenses.forEach(([amount, vendor, category, expDate, notes]) => {
      html += `<tr><td>${e(vendor)}</td><td>${e(category)}</td><td>${e(expDate)}</td><td>${e(notes)}</td><td style="text-align:right">$${(amount||0).toFixed(2)}</td></tr>`;
    });
    html += `<tr class="total-row"><td colspan="4">Total</td><td style="text-align:right">$${totalExpenses.toFixed(2)}</td></tr></table>`;
  }

  html += `</body></html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `move-helper-summary-${new Date().toISOString().slice(0,10)}.html`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Summary exported');
}

// Service worker
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
