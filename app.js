/* ═══════════════════════════════════════════════
   BANANI JAI — App Logic
   GitHub-backed Personal Finance PWA
═══════════════════════════════════════════════ */

'use strict';

// ══════════════════════ STATE ══════════════════════
const STATE = {
  token: null,
  repo: null,
  filePath: null,
  entries: [],
  reminders: [],
  fileSha: null,
  currentDetail: null,   // type currently shown in detail page
  currentViewEntry: null, // entry being viewed
  lastSync: null,
  editingReminderId: null,
};

// ══════════════════════ INIT ══════════════════════
document.addEventListener('DOMContentLoaded', () => {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('entry-date').value = today;
  document.getElementById('rem-date').value = today;
  populateMonthFilter();
  registerSW();
  autoConnect();
});

async function autoConnect() {
  // Check URL parameters first for auto-login links
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('token') && urlParams.has('repo')) {
    localStorage.setItem('bj_token', urlParams.get('token'));
    localStorage.setItem('bj_repo', urlParams.get('repo'));
    localStorage.setItem('bj_file', urlParams.get('file') || 'data.json');
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  // CONFIG file se lo (PC pe hardcoded), warna localStorage
  const savedToken = (typeof CONFIG !== 'undefined' && CONFIG.token && !CONFIG.token.includes('YAHAN'))
                     ? CONFIG.token
                     : localStorage.getItem('bj_token');
  const savedRepo  = (typeof CONFIG !== 'undefined' && CONFIG.repo && !CONFIG.repo.includes('YAHAN'))
                     ? CONFIG.repo
                     : localStorage.getItem('bj_repo');
  const savedFile  = (typeof CONFIG !== 'undefined' && CONFIG.filePath)
                     ? CONFIG.filePath
                     : (localStorage.getItem('bj_file') || 'data.json');

  const tokenGroup = document.getElementById('token-group');

  // Repo pre-fill karo agar saved hai
  if (savedRepo) document.getElementById('repo-input').value = savedRepo;
  if (savedFile) document.getElementById('file-input').value = savedFile;

  // Agar dono hain toh seedha connect karo
  if (!savedToken || !savedRepo) {
    if (tokenGroup) tokenGroup.style.display = '';
    return;
  }

  STATE.token    = savedToken;
  STATE.repo     = savedRepo;
  STATE.filePath = savedFile;

  document.getElementById('setup-screen').classList.add('hidden');
  document.getElementById('setup-screen').classList.remove('active');

  try {
    await loadFromGitHub();
    localStorage.setItem('bj_token', savedToken);
    localStorage.setItem('bj_repo', savedRepo);
    localStorage.setItem('bj_file', savedFile);
    launchApp();
  } catch (err) {
    // Fail ho gaya (jaise invalid/revoked token), toh setup screen dikhao aur token field unhide karo
    document.getElementById('setup-screen').classList.remove('hidden');
    document.getElementById('setup-screen').classList.add('active');
    document.getElementById('setup-error').textContent = '❌ Connect fail: ' + err.message + ' (Token invalid ya expire ho gaya hai)';
    document.getElementById('setup-error').classList.remove('hidden');
    if (tokenGroup) tokenGroup.style.display = '';
  }
}

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

// ══════════════════════ SETUP / GITHUB ═══════════════

async function connectGitHub() {
  // Token: pehle pat-input se lo (mobile), nahi toh localStorage/CONFIG se
  const inputToken = document.getElementById('pat-input').value.trim();
  const savedToken = (typeof CONFIG !== 'undefined' && CONFIG.token && !CONFIG.token.includes('YAHAN'))
                     ? CONFIG.token : localStorage.getItem('bj_token');
  const token    = inputToken || savedToken;
  const repo     = document.getElementById('repo-input').value.trim();
  const filePath = document.getElementById('file-input').value.trim() || 'data.json';
  const errEl    = document.getElementById('setup-error');
  const btn      = document.getElementById('connect-btn');
  const btnTxt   = document.getElementById('connect-btn-text');
  const spinner  = document.getElementById('connect-spinner');

  errEl.classList.add('hidden');

  if (!token)  { showSetupError('⚠️ GitHub Token daalo (ghp_...)'); return; }
  if (!repo || !repo.includes('/')) { showSetupError('Repo format: username/repo-name'); return; }

  STATE.token    = token;
  STATE.repo     = repo;
  STATE.filePath = filePath;

  btn.disabled = true;
  btnTxt.textContent = 'Connecting…';
  spinner.classList.remove('hidden');

  try {
    await loadFromGitHub();
    // Hamesha ke liye save karo
    localStorage.setItem('bj_token', token);
    localStorage.setItem('bj_repo', repo);
    localStorage.setItem('bj_file', filePath);
    launchApp();
  } catch (err) {
    showSetupError(err.message || 'Connect fail. Token aur repo check karo.');
    STATE.token = null;
  } finally {
    btn.disabled = false;
    btnTxt.textContent = '🔗 Connect & Load Data';
    spinner.classList.add('hidden');
  }
}

function showSetupError(msg) {
  const el = document.getElementById('setup-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

async function loadFromGitHub() {
  const url = `https://api.github.com/repos/${STATE.repo}/contents/${STATE.filePath}`;
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${STATE.token}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });

  if (resp.status === 404) {
    // File doesn't exist yet — create it
    STATE.entries = [];
    STATE.reminders = [];
    STATE.fileSha = null;
    await pushToGitHub('Initial data.json created by Banani Jai');
    return;
  }

  if (!resp.ok) {
    const j = await resp.json().catch(() => ({}));
    throw new Error(j.message || `GitHub API error: ${resp.status}`);
  }

  const data = await resp.json();
  STATE.fileSha = data.sha;

  const decoded = atob(data.content.replace(/\n/g, ''));
  const parsed  = JSON.parse(decoded);

  STATE.entries   = parsed.entries   || [];
  STATE.reminders = parsed.reminders || [];
}

async function pushToGitHub(message = 'Update via Banani Jai') {
  const payload = {
    entries:   STATE.entries,
    reminders: STATE.reminders,
    updatedAt: new Date().toISOString(),
  };

  const content = btoa(unescape(encodeURIComponent(JSON.stringify(payload, null, 2))));
  const body = {
    message,
    content,
    ...(STATE.fileSha ? { sha: STATE.fileSha } : {}),
  };

  const url = `https://api.github.com/repos/${STATE.repo}/contents/${STATE.filePath}`;
  const resp = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${STATE.token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const j = await resp.json().catch(() => ({}));
    throw new Error(j.message || `GitHub push error: ${resp.status}`);
  }

  const result = await resp.json();
  STATE.fileSha = result.content.sha;
  STATE.lastSync = new Date().toLocaleString('en-IN');
  document.getElementById('settings-sync').textContent = STATE.lastSync;
}

async function syncNow() {
  showSyncBar('Syncing with GitHub…');
  try {
    await loadFromGitHub();
    updateDashboard();
    renderCurrentPage();
    showToast('✅ Synced successfully', 'success');
  } catch (err) {
    showToast('❌ Sync failed: ' + err.message, 'error');
  } finally {
    hideSyncBar();
  }
}

function disconnectGitHub() {
  if (!confirm('Disconnect from GitHub? App will return to setup screen.')) return;
  localStorage.removeItem('bj_token');
  localStorage.removeItem('bj_repo');
  localStorage.removeItem('bj_file');
  STATE.token = STATE.repo = STATE.filePath = STATE.fileSha = null;
  STATE.entries = [];
  STATE.reminders = [];
  document.getElementById('main-app').classList.add('hidden');
  document.getElementById('setup-screen').classList.remove('hidden');
  document.getElementById('setup-screen').classList.add('active');
}

function changeToken() {
  const newToken = prompt('Naya GitHub Personal Access Token daalo (ghp_...):');
  if (!newToken || !newToken.trim()) return;
  localStorage.setItem('bj_token', newToken.trim());
  STATE.token = newToken.trim();
  showToast('✅ Token update ho gaya!', 'success');
}

// ══════════════════════ LAUNCH APP ══════════════════

function launchApp() {
  document.getElementById('setup-screen').classList.remove('active');
  document.getElementById('setup-screen').classList.add('hidden');
  document.getElementById('main-app').classList.remove('hidden');
  document.getElementById('settings-repo').textContent = STATE.repo;
  document.getElementById('settings-file').textContent = STATE.filePath;
  updateDashboard();
  renderHome();
  renderReminders();
  navigateTo('home');
}

// ══════════════════════ NAVIGATION ══════════════════

const PAGES = ['home', 'reports', 'reminders', 'settings'];

function navigateTo(page) {
  PAGES.forEach(p => {
    document.getElementById(`page-${p}`).classList.toggle('active', p === page);
    document.getElementById(`page-${p}`).classList.toggle('hidden', p !== page);
    const navEl = document.getElementById(`nav-${p}`);
    if (navEl) navEl.classList.toggle('active', p === page);
  });

  if (page === 'reports') renderReports();
  if (page === 'home')    renderHome();
  if (page === 'settings') {
    document.getElementById('settings-count').textContent = STATE.entries.length;
    document.getElementById('settings-sync').textContent = STATE.lastSync || 'Never';
  }

  // Hide detail page if going to main page
  document.getElementById('page-detail').classList.add('hidden');
  document.getElementById('page-detail').classList.remove('active');
  document.getElementById('fab-btn').style.display = 'flex';
  document.getElementById('bottom-nav').style.display = 'flex';
}

function openSettings() { navigateTo('settings'); }

function renderCurrentPage() {
  const active = PAGES.find(p => document.getElementById(`page-${p}`).classList.contains('active'));
  if (active) navigateTo(active);
}

// ══════════════════════ DASHBOARD ══════════════════

function updateDashboard() {
  const totals = calcTotals();
  document.getElementById('borrowed-total').textContent = fmt(totals.borrowed);
  document.getElementById('lent-total').textContent     = fmt(totals.lent);
  document.getElementById('spent-total').textContent    = fmt(totals.spent);
  document.getElementById('income-total').textContent   = fmt(totals.income);

  const net = totals.income - totals.spent;
  const netEl = document.getElementById('net-balance');
  const subEl = document.getElementById('net-sub-label');
  const headerEl = document.getElementById('header-balance');

  netEl.textContent = fmt(net);
  headerEl.textContent = fmt(net);
  netEl.classList.toggle('negative', net < 0);

  if (net > 0)      { subEl.textContent = '📈 You\'re in profit!'; }
  else if (net < 0) { subEl.textContent = '📉 You\'re overspending'; }
  else              { subEl.textContent = '⚖️ You\'re balanced'; }
}

function calcTotals(entries = STATE.entries) {
  return entries.reduce((acc, e) => {
    const t = e.type;
    acc[t] = (acc[t] || 0) + Number(e.amount);
    return acc;
  }, { borrowed: 0, lent: 0, spent: 0, income: 0 });
}

// ══════════════════════ HOME PAGE ══════════════════

function renderHome() {
  const list   = document.getElementById('recent-list');
  const emptyEl = document.getElementById('home-empty');
  const recent = [...STATE.entries].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);

  if (recent.length === 0) {
    list.innerHTML = '';
    emptyEl.classList.remove('hidden');
  } else {
    emptyEl.classList.add('hidden');
    list.innerHTML = recent.map(entryHTML).join('');
  }
  updateDashboard();
}

// ══════════════════════ DETAIL PAGE ════════════════

function openDetail(type) {
  STATE.currentDetail = type;
  const labels = { borrowed: 'Borrowed Money', lent: 'Lent Money', spent: 'Spent Money', income: 'Income Earned' };
  document.getElementById('detail-title').textContent = labels[type];
  document.getElementById('detail-search').value = '';
  document.getElementById('detail-month').value = '';

  // Switch to detail page
  PAGES.forEach(p => {
    document.getElementById(`page-${p}`).classList.add('hidden');
    document.getElementById(`page-${p}`).classList.remove('active');
  });
  document.getElementById('page-detail').classList.remove('hidden');
  document.getElementById('page-detail').classList.add('active');

  renderDetail();
}

function closeDetail() {
  document.getElementById('page-detail').classList.add('hidden');
  document.getElementById('page-detail').classList.remove('active');
  navigateTo('home');
}

function renderDetail() {
  const type   = STATE.currentDetail;
  const search = document.getElementById('detail-search').value.toLowerCase();
  const month  = document.getElementById('detail-month').value;

  let filtered = STATE.entries.filter(e => e.type === type);
  if (search) filtered = filtered.filter(e =>
    (e.person || '').toLowerCase().includes(search) ||
    (e.note   || '').toLowerCase().includes(search)
  );
  if (month) filtered = filtered.filter(e => e.date && e.date.startsWith(month));
  filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

  const list  = document.getElementById('detail-list');
  const empty = document.getElementById('detail-empty');
  if (filtered.length === 0) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
  } else {
    empty.classList.add('hidden');
    list.innerHTML = filtered.map(entryHTML).join('');
  }
}

// ══════════════════════ ENTRY HTML ═════════════════

const TYPE_ICONS = { borrowed: '📥', lent: '📤', spent: '💸', income: '💰' };
const TYPE_LABELS = { borrowed: 'Borrowed', lent: 'Lent', spent: 'Spent', income: 'Income' };

function entryHTML(e) {
  return `
  <div class="entry-item type-${e.type}" onclick="viewEntry('${e.id}')">
    <div class="entry-icon">${TYPE_ICONS[e.type]}</div>
    <div class="entry-info">
      <div class="entry-name">${escHtml(e.person || 'Unnamed')}</div>
      <div class="entry-note">${escHtml(e.note || '—')}</div>
      <div class="entry-date">${fmtDate(e.date)}</div>
    </div>
    <div style="text-align:right">
      <div class="entry-amount">${fmt(e.amount)}</div>
      <div class="entry-type-badge">${TYPE_LABELS[e.type]}</div>
    </div>
  </div>`;
}

// ══════════════════════ ADD / EDIT ENTRY ═══════════

function openAddEntry() {
  document.getElementById('entry-modal-title').textContent = 'Add Entry';
  document.getElementById('entry-id').value = '';
  document.getElementById('entry-amount').value = '';
  document.getElementById('entry-person').value = '';
  document.getElementById('entry-note').value = '';
  document.getElementById('entry-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('entry-error').classList.add('hidden');

  // Set default type from current detail or 'borrowed'
  const defaultType = STATE.currentDetail || 'borrowed';
  document.querySelectorAll('.type-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.type === defaultType);
  });
  document.getElementById('entry-type').value = defaultType;

  openModal('entry-modal');
}

function selectType(el, type) {
  document.querySelectorAll('.type-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('entry-type').value = type;
}

async function saveEntry() {
  const id      = document.getElementById('entry-id').value;
  const type    = document.getElementById('entry-type').value;
  const amount  = parseFloat(document.getElementById('entry-amount').value);
  const person  = document.getElementById('entry-person').value.trim();
  const note    = document.getElementById('entry-note').value.trim();
  const date    = document.getElementById('entry-date').value;
  const errEl   = document.getElementById('entry-error');

  errEl.classList.add('hidden');

  if (!amount || amount <= 0) { showEntryError('Please enter a valid amount.'); return; }
  if (!person)                { showEntryError('Please enter a name or party.'); return; }
  if (!date)                  { showEntryError('Please select a date.'); return; }

  const entry = { id: id || uid(), type, amount, person, note, date, createdAt: new Date().toISOString() };

  if (id) {
    const idx = STATE.entries.findIndex(e => e.id === id);
    if (idx > -1) STATE.entries[idx] = entry;
  } else {
    STATE.entries.push(entry);
  }

  const saveTxt     = document.getElementById('save-btn-text');
  const saveSpinner = document.getElementById('save-spinner');
  saveTxt.textContent = 'Saving…';
  saveSpinner.classList.remove('hidden');

  showSyncBar('Pushing to GitHub…');
  try {
    await pushToGitHub(`${id ? 'Update' : 'Add'} ${type} entry: ${person}`);
    closeModal('entry-modal');
    updateDashboard();
    renderHome();
    if (STATE.currentDetail) renderDetail();
    showToast(id ? '✅ Entry updated' : '✅ Entry added', 'success');
  } catch (err) {
    // Rollback
    if (id) {
      const idx = STATE.entries.findIndex(e => e.id === id);
      if (idx > -1) STATE.entries[idx] = STATE.currentViewEntry;
    } else {
      STATE.entries = STATE.entries.filter(e => e.id !== entry.id);
    }
    showEntryError('Failed to save: ' + err.message);
    showToast('❌ Save failed', 'error');
  } finally {
    saveTxt.textContent = 'Save Entry';
    saveSpinner.classList.add('hidden');
    hideSyncBar();
  }
}

function showEntryError(msg) {
  const el = document.getElementById('entry-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

// ══════════════════════ VIEW / EDIT / DELETE ════════

function viewEntry(id) {
  const e = STATE.entries.find(e => e.id === id);
  if (!e) return;
  STATE.currentViewEntry = e;

  document.getElementById('view-modal-body').innerHTML = `
    <div class="view-entry-row">
      <span class="view-entry-label">Type</span>
      <span class="view-entry-val" style="color:${typeColor(e.type)}">${TYPE_ICONS[e.type]} ${TYPE_LABELS[e.type]}</span>
    </div>
    <div class="view-entry-row">
      <span class="view-entry-label">Amount</span>
      <span class="view-entry-val" style="color:${typeColor(e.type)};font-size:18px">${fmt(e.amount)}</span>
    </div>
    <div class="view-entry-row">
      <span class="view-entry-label">Name / Party</span>
      <span class="view-entry-val">${escHtml(e.person)}</span>
    </div>
    <div class="view-entry-row">
      <span class="view-entry-label">Date</span>
      <span class="view-entry-val">${fmtDate(e.date)}</span>
    </div>
    <div class="view-entry-row">
      <span class="view-entry-label">Note</span>
      <span class="view-entry-val">${escHtml(e.note || '—')}</span>
    </div>
  `;
  openModal('view-modal');
}

function editCurrentEntry() {
  const e = STATE.currentViewEntry;
  if (!e) return;
  closeModal('view-modal');

  document.getElementById('entry-modal-title').textContent = 'Edit Entry';
  document.getElementById('entry-id').value     = e.id;
  document.getElementById('entry-amount').value = e.amount;
  document.getElementById('entry-person').value = e.person;
  document.getElementById('entry-note').value   = e.note || '';
  document.getElementById('entry-date').value   = e.date;
  document.getElementById('entry-type').value   = e.type;
  document.querySelectorAll('.type-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.type === e.type);
  });
  document.getElementById('entry-error').classList.add('hidden');
  openModal('entry-modal');
}

async function deleteCurrentEntry() {
  const e = STATE.currentViewEntry;
  if (!e) return;
  if (!confirm(`Delete this ${TYPE_LABELS[e.type]} entry of ${fmt(e.amount)}?`)) return;

  const prevEntries = [...STATE.entries];
  STATE.entries = STATE.entries.filter(x => x.id !== e.id);

  const delTxt     = document.getElementById('delete-btn-text');
  const delSpinner = document.getElementById('delete-spinner');
  delTxt.textContent = 'Deleting…';
  delSpinner.classList.remove('hidden');

  showSyncBar('Deleting from GitHub…');
  try {
    await pushToGitHub(`Delete ${e.type} entry: ${e.person}`);
    closeModal('view-modal');
    updateDashboard();
    renderHome();
    if (STATE.currentDetail) renderDetail();
    showToast('🗑️ Entry deleted', 'success');
  } catch (err) {
    STATE.entries = prevEntries;
    showToast('❌ Delete failed: ' + err.message, 'error');
  } finally {
    delTxt.textContent = '🗑️ Delete';
    delSpinner.classList.add('hidden');
    hideSyncBar();
  }
}

// ══════════════════════ REPORTS ════════════════════

function renderReports() {
  const monthFilter = document.getElementById('report-month-filter').value;
  const typeFilter  = document.getElementById('report-type-filter').value;

  let filtered = [...STATE.entries];
  if (monthFilter !== 'all') filtered = filtered.filter(e => e.date && e.date.startsWith(monthFilter));
  if (typeFilter  !== 'all') filtered = filtered.filter(e => e.type === typeFilter);
  filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

  // Totals
  const totals = calcTotals(filtered);
  document.getElementById('report-totals').innerHTML = `
    <div class="report-total-item">
      <div class="rt-label">Borrowed</div>
      <div class="rt-amount" style="color:var(--orange)">${fmt(totals.borrowed)}</div>
    </div>
    <div class="report-total-item">
      <div class="rt-label">Lent</div>
      <div class="rt-amount" style="color:var(--blue)">${fmt(totals.lent)}</div>
    </div>
    <div class="report-total-item">
      <div class="rt-label">Spent</div>
      <div class="rt-amount" style="color:var(--red)">${fmt(totals.spent)}</div>
    </div>
    <div class="report-total-item">
      <div class="rt-label">Income</div>
      <div class="rt-amount" style="color:var(--emerald)">${fmt(totals.income)}</div>
    </div>
  `;

  // List
  const list  = document.getElementById('reports-list');
  const empty = document.getElementById('reports-empty');
  if (filtered.length === 0) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
  } else {
    empty.classList.add('hidden');
    list.innerHTML = filtered.map(entryHTML).join('');
  }

  drawBarChart(filtered);
}

function populateMonthFilter() {
  const sel = document.getElementById('report-month-filter');
  const months = new Set();
  STATE.entries.forEach(e => { if (e.date) months.add(e.date.slice(0, 7)); });
  // Also add current + past 11 months
  for (let i = 0; i < 12; i++) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    months.add(d.toISOString().slice(0, 7));
  }
  const sorted = [...months].sort().reverse();
  sorted.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = fmtMonth(m);
    sel.appendChild(opt);
  });
}

function drawBarChart(entries) {
  const canvas = document.getElementById('bar-chart');
  const ctx    = canvas.getContext('2d');
  const dpr    = window.devicePixelRatio || 1;

  // Group by month
  const monthMap = {};
  entries.forEach(e => {
    if (!e.date) return;
    const m = e.date.slice(0, 7);
    if (!monthMap[m]) monthMap[m] = { income: 0, spent: 0 };
    if (e.type === 'income') monthMap[m].income += Number(e.amount);
    if (e.type === 'spent')  monthMap[m].spent  += Number(e.amount);
  });

  const months = Object.keys(monthMap).sort().slice(-6);
  if (months.length === 0) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#656d76';
    ctx.font = '14px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No data for chart', canvas.width / 2, canvas.height / 2);
    return;
  }

  const W = canvas.offsetWidth * dpr;
  const H = 180 * dpr;
  canvas.width  = W;
  canvas.height = H;
  ctx.scale(dpr, dpr);

  const w = canvas.offsetWidth;
  const h = 180;
  ctx.clearRect(0, 0, w, h);

  const pad  = { top: 10, bottom: 36, left: 50, right: 14 };
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;

  const maxVal = Math.max(...months.map(m => Math.max(monthMap[m].income, monthMap[m].spent)), 1);

  const groupW  = chartW / months.length;
  const barW    = Math.min(groupW * 0.3, 22);
  const barGap  = 4;

  // Grid lines
  ctx.strokeStyle = 'rgba(48,54,61,0.6)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + chartH - (chartH * i / 4);
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(w - pad.right, y);
    ctx.stroke();

    ctx.fillStyle = '#656d76';
    ctx.font = `10px Inter, sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillText(shortFmt(maxVal * i / 4), pad.left - 4, y + 3.5);
  }

  months.forEach((m, i) => {
    const cx = pad.left + groupW * i + groupW / 2;
    const d  = monthMap[m];

    // Income bar
    const iH = (d.income / maxVal) * chartH;
    ctx.fillStyle = '#10b981';
    ctx.beginPath();
    ctx.roundRect(cx - barW - barGap / 2, pad.top + chartH - iH, barW, iH, [3, 3, 0, 0]);
    ctx.fill();

    // Spent bar
    const sH = (d.spent / maxVal) * chartH;
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.roundRect(cx + barGap / 2, pad.top + chartH - sH, barW, sH, [3, 3, 0, 0]);
    ctx.fill();

    // Month label
    ctx.fillStyle = '#8b949e';
    ctx.font = '9px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(shortMonth(m), cx, h - 6);
  });

  // Legend
  ctx.font = '10px Inter, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#10b981';
  ctx.fillRect(pad.left, h - 16, 10, 8);
  ctx.fillStyle = '#8b949e';
  ctx.fillText('Income', pad.left + 14, h - 9);

  ctx.fillStyle = '#ef4444';
  ctx.fillRect(pad.left + 70, h - 16, 10, 8);
  ctx.fillStyle = '#8b949e';
  ctx.fillText('Spent', pad.left + 84, h - 9);
}

// ══════════════════════ REMINDERS ══════════════════

function renderReminders() {
  const list  = document.getElementById('reminders-list');
  const empty = document.getElementById('reminders-empty');
  const today = new Date().toISOString().split('T')[0];

  if (STATE.reminders.length === 0) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
  } else {
    empty.classList.add('hidden');
    list.innerHTML = STATE.reminders
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
      .map(r => `
        <div class="reminder-item ${r.dueDate < today ? 'rem-overdue' : ''}">
          <div class="rem-icon">🔔</div>
          <div class="rem-info">
            <div class="rem-title">${escHtml(r.title)}</div>
            <div class="rem-date">${r.dueDate < today ? '⚠️ Overdue · ' : ''}Due: ${fmtDate(r.dueDate)}</div>
            ${r.note ? `<div class="rem-date">${escHtml(r.note)}</div>` : ''}
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
            ${r.amount ? `<div class="rem-amount">${fmt(r.amount)}</div>` : ''}
            <button class="rem-delete" onclick="deleteReminder('${r.id}')">🗑</button>
          </div>
        </div>
      `).join('');
  }
}

function openAddReminder() {
  document.getElementById('rem-title').value = '';
  document.getElementById('rem-amount').value = '';
  document.getElementById('rem-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('rem-note').value = '';
  openModal('reminder-modal');
}

async function saveReminder() {
  const title  = document.getElementById('rem-title').value.trim();
  const amount = document.getElementById('rem-amount').value;
  const date   = document.getElementById('rem-date').value;
  const note   = document.getElementById('rem-note').value.trim();

  if (!title) { showToast('Please enter a reminder title', 'error'); return; }

  const r = { id: uid(), title, amount: amount ? parseFloat(amount) : null, dueDate: date, note };
  STATE.reminders.push(r);

  try {
    await pushToGitHub('Add reminder: ' + title);
    closeModal('reminder-modal');
    renderReminders();
    showToast('🔔 Reminder added', 'success');
  } catch (err) {
    STATE.reminders = STATE.reminders.filter(x => x.id !== r.id);
    showToast('❌ Failed to save reminder', 'error');
  }
}

async function deleteReminder(id) {
  if (!confirm('Delete this reminder?')) return;
  const prev = [...STATE.reminders];
  STATE.reminders = STATE.reminders.filter(r => r.id !== id);
  try {
    await pushToGitHub('Delete reminder');
    renderReminders();
    showToast('🗑️ Reminder deleted', 'success');
  } catch (err) {
    STATE.reminders = prev;
    showToast('❌ Failed to delete', 'error');
  }
}

// ══════════════════════ EXPORT ════════════════════

function exportData() {
  const data = JSON.stringify({ entries: STATE.entries, reminders: STATE.reminders }, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'banani-jai-data.json';
  a.click();
  URL.revokeObjectURL(url);
  showToast('📤 Exported!', 'success');
}

// ══════════════════════ MODALS ═════════════════════

function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
  document.body.style.overflow = '';
}

function closeModalOnBackdrop(e, id) {
  if (e.target.classList.contains('modal-overlay')) closeModal(id);
}

// ══════════════════════ TOAST / SYNC ══════════════

function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type} show`;
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => { t.classList.remove('show'); }, 2800);
}

function showSyncBar(msg = 'Syncing…') {
  const bar = document.getElementById('sync-bar');
  document.getElementById('sync-msg').textContent = msg;
  bar.classList.remove('hidden');
}

function hideSyncBar() {
  document.getElementById('sync-bar').classList.add('hidden');
}

// ══════════════════════ HELPERS ═══════════════════

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function fmt(n) {
  const num = Number(n) || 0;
  return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function shortFmt(n) {
  if (n >= 100000) return '₹' + (n/100000).toFixed(1) + 'L';
  if (n >= 1000)   return '₹' + (n/1000).toFixed(1) + 'k';
  return '₹' + Math.round(n);
}

function fmtDate(d) {
  if (!d) return '—';
  try {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return d; }
}

function fmtMonth(m) {
  try {
    const [y, mo] = m.split('-');
    return new Date(y, mo - 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  } catch { return m; }
}

function shortMonth(m) {
  try {
    const [y, mo] = m.split('-');
    return new Date(y, mo - 1).toLocaleDateString('en-IN', { month: 'short' });
  } catch { return m; }
}

function escHtml(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function typeColor(t) {
  return { borrowed: 'var(--orange)', lent: 'var(--blue)', spent: 'var(--red)', income: 'var(--emerald)' }[t] || 'var(--text)';
}

function togglePassword(id, btn) {
  const inp = document.getElementById(id);
  const shown = inp.type === 'text';
  inp.type = shown ? 'password' : 'text';
  btn.textContent = shown ? '👁' : '🙈';
}
