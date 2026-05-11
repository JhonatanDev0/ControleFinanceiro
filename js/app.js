/* ============================================================
   MEU FINANCEIRO v2 — app.js
   ============================================================ */
'use strict';

/* ---- Constants ---- */
const EXPENSES_KEY = 'mf_expenses_v2';
const METAS_KEY    = 'mf_metas_v2';

const DEFAULT_EXPENSES = [
  { id:1,  name:'Nubank',      category:'cartoes',  value:1799.35, person:'jhonatan' },
  { id:2,  name:'Inter',       category:'cartoes',  value:0,       person:'jhonatan' },
  { id:3,  name:'Next',        category:'cartoes',  value:325.25,  person:'camila' },
  { id:4,  name:'Santander',   category:'cartoes',  value:0,       person:'camila' },
  { id:5,  name:'Faculdade',   category:'educacao', value:245.14,  person:'camila' },
  { id:6,  name:'Claro',       category:'servicos', value:0,       person:'jhonatan' },
  { id:7,  name:'Internet',    category:'servicos', value:130,     person:'jhonatan' },
  { id:8,  name:'Condomínio',  category:'moradia',  value:173.99,  person:'jhonatan' },
  { id:9,  name:'Apartamento', category:'moradia',  value:1713.12, person:'jhonatan' },
  { id:10, name:'Caixa',       category:'outros',   value:69,      person:'camila' },
];

const DEFAULT_METAS = [
  { id:1, name:'Reserva de emergência', target:10000, current:2500 },
  { id:2, name:'Viagem de férias',      target:3000,  current:800 },
  { id:3, name:'Notebook novo',         target:4500,  current:4500 },
];

const CATEGORIES = {
  moradia:  { label:'Moradia',  emoji:'🏠', color:'#1D9E75', icon:'ti-home' },
  cartoes:  { label:'Cartões',  emoji:'💳', color:'#2D6BE4', icon:'ti-credit-card' },
  servicos: { label:'Serviços', emoji:'📡', color:'#E8874A', icon:'ti-wifi' },
  educacao: { label:'Educação', emoji:'🎓', color:'#4A9AE8', icon:'ti-school' },
  outros:   { label:'Outros',   emoji:'📦', color:'#9B59B6', icon:'ti-box' },
};

const META_COLORS = ['#1D9E75','#2D6BE4','#6C47E8','#E8874A','#D97706','#DC2626'];

/* ---- State ---- */
let allData      = {};
let metas        = [];
let curMonth     = '';
let histMonth    = '';
let activeFilter = 'all';
let pendingDelId = null;
let pendingDelType = 'expense';
let chartHistory = null;

/* ---- Helpers ---- */
const fmt = v =>
  'R$ ' + v.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');

const parseVal = s => {
  const n = parseFloat(String(s).replace(/[^\d,.]/g, '').replace(',', '.'));
  return isNaN(n) ? 0 : Math.round(n * 100) / 100;
};

const monthKey = (y, m) =>
  `${y}-${String(m + 1).padStart(2, '0')}`;

const monthLabel = key => {
  const [y, m] = key.split('-');
  return new Date(+y, +m - 1, 1)
    .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
};

const monthLabelShort = key => {
  const [y, m] = key.split('-');
  return new Date(+y, +m - 1, 1)
    .toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
};

const total    = list => list.reduce((s, e) => s + e.value, 0);
const catColor = cat  => CATEGORIES[cat]?.color || '#888';

/* ---- Storage ---- */
function loadData() {
  const rawExpenses = localStorage.getItem(EXPENSES_KEY);
  const rawMetas    = localStorage.getItem(METAS_KEY);

  // Se a chave nunca existiu, é a primeira vez — carrega os padrões
  // Se existiu (mesmo vazia), respeita o que o usuário salvou
  if (rawExpenses === null) {
    allData = {};
    const now = new Date();
    curMonth  = monthKey(now.getFullYear(), now.getMonth());
    allData[curMonth] = DEFAULT_EXPENSES.map(e => ({ ...e }));
  } else {
    try { allData = JSON.parse(rawExpenses) || {}; } catch { allData = {}; }
  }

  if (rawMetas === null) {
    metas = DEFAULT_METAS.map(m => ({ ...m }));
  } else {
    try { metas = JSON.parse(rawMetas) || []; } catch { metas = []; }
  }

  const now = new Date();
  curMonth  = monthKey(now.getFullYear(), now.getMonth());
  histMonth = curMonth;

  saveData();
}

function saveData() {
  localStorage.setItem(EXPENSES_KEY, JSON.stringify(allData));
  localStorage.setItem(METAS_KEY, JSON.stringify(metas));
}

function expOfMonth(key) { return allData[key] || []; }
function setExpOfMonth(key, arr) { allData[key] = arr; saveData(); }

/* ---- Modal helpers ---- */
const expModal  = () => bootstrap.Modal.getOrCreateInstance(document.getElementById('expModal'));
const metaModal = () => bootstrap.Modal.getOrCreateInstance(document.getElementById('metaModal'));
const delModal  = () => bootstrap.Modal.getOrCreateInstance(document.getElementById('delModal'));

/* ============================================================
   INIT
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  loadData();

  document.getElementById('sb-month').textContent = monthLabel(curMonth);

  // Navigation
  document.querySelectorAll('[data-page]').forEach(el => {
    el.addEventListener('click', e => { e.preventDefault(); navigateTo(el.dataset.page); });
  });

  // Filter pills
  document.querySelectorAll('.filter-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.dataset.cat;
      renderContas();
    });
  });

  navigateTo('dashboard');
});

/* ============================================================
   NAVIGATION
   ============================================================ */
function navigateTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + page)?.classList.add('active');

  document.querySelectorAll('[data-page]').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });

  if (page === 'dashboard') renderDashboard();
  if (page === 'contas')    renderContas();
  if (page === 'metas')     renderMetas();
  if (page === 'historico') renderHistorico();
}

/* ============================================================
   DASHBOARD
   ============================================================ */
function renderDashboard() {
  const exp = expOfMonth(curMonth);
  const tot = total(exp);

  document.getElementById('dash-subtitle').textContent =
    fmt(tot) + ' em ' + monthLabel(curMonth);
  document.getElementById('dash-total').textContent  = fmt(tot);
  document.getElementById('dash-active').textContent = exp.filter(e => e.value > 0).length;
  document.getElementById('dash-goals').textContent  = metas.filter(m => m.current < m.target).length;
  document.getElementById('dash-zero').textContent   = exp.filter(e => e.value === 0).length;

  renderHistoryChart();
  renderCatBreakdown(exp);
}

/* History Bar Chart */
function renderHistoryChart() {
  const now   = new Date();
  const months6 = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    return monthKey(d.getFullYear(), d.getMonth());
  });

  const labels = months6.map(monthLabelShort);
  const values = months6.map(k => Math.round(total(allData[k] || []) * 100) / 100);
  const colors = months6.map(k => k === curMonth ? '#1D9E75' : '#E1F5EE');

  const ctx = document.getElementById('chart-history')?.getContext('2d');
  if (!ctx) return;

  if (chartHistory) chartHistory.destroy();

  chartHistory = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderRadius: 8,
        borderSkipped: false,
      }],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { family: 'Sora', size: 11 }, color: '#96A89E' },
          border: { display: false },
        },
        y: {
          grid: { color: '#F0F4F1' },
          ticks: {
            font: { family: 'DM Mono', size: 11 }, color: '#96A89E',
            callback: v => 'R$ ' + v.toLocaleString('pt-BR'),
          },
          border: { display: false },
        },
      },
    },
  });
}

/* Category Breakdown */
function renderCatBreakdown(exp) {
  const bycat = {};
  exp.filter(e => e.value > 0).forEach(e => {
    bycat[e.category] = (bycat[e.category] || 0) + e.value;
  });

  const sorted = Object.entries(bycat).sort((a, b) => b[1] - a[1]);
  const maxVal = sorted[0]?.[1] || 1;
  const el = document.getElementById('cat-breakdown');

  if (!sorted.length) {
    el.innerHTML = '<div class="empty-state"><i class="ti ti-chart-pie-off"></i>Sem dados.</div>';
    return;
  }

  el.innerHTML = sorted.map(([cat, val]) => `
    <div class="cat-row">
      <div class="cat-dot" style="background:${catColor(cat)}"></div>
      <span class="cat-name">${CATEGORIES[cat]?.emoji || ''} ${CATEGORIES[cat]?.label || cat}</span>
      <div class="cat-bar-wrap">
        <div class="cat-bar" style="width:${Math.round(val/maxVal*100)}%;background:${catColor(cat)}"></div>
      </div>
      <span class="cat-val">${fmt(val)}</span>
    </div>
  `).join('');
}

const personBadge = p => p === 'camila'
  ? '<span class="person-badge person-c-badge">👩 Camila</span>'
  : '<span class="person-badge person-j-badge">👨 Jhonatan</span>';

/* ============================================================
   CONTAS
   ============================================================ */
function renderContas() {
  const exp = expOfMonth(curMonth);
  const filtered = activeFilter === 'all' ? exp : exp.filter(e => e.category === activeFilter);

  document.getElementById('contas-subtitle').textContent =
    filtered.length + ' conta' + (filtered.length !== 1 ? 's' : '') + ' · ' + monthLabel(curMonth);

  const empty = `<tr><td colspan="5"><div class="empty-state"><i class="ti ti-receipt-off"></i>Nenhuma conta encontrada.</div></td></tr>`;
  const emptyCard = `<div class="empty-state"><i class="ti ti-receipt-off"></i>Nenhuma conta encontrada.</div>`;

  if (!filtered.length) {
    document.getElementById('exp-tbody').innerHTML = empty;
    document.getElementById('exp-cards').innerHTML = emptyCard;
    return;
  }

  // Desktop table rows
  document.getElementById('exp-tbody').innerHTML = filtered.map(e => {
    const cat  = CATEGORIES[e.category] || {};
    const zero = e.value === 0;
    return `
    <tr>
      <td><div class="name-cell">
        <div class="row-dot" style="background:${catColor(e.category)}"></div>
        ${e.name}
      </div></td>
      <td><span class="cat-badge" style="background:${catColor(e.category)}22;color:${catColor(e.category)}">
        ${cat.emoji || ''} ${cat.label || e.category}
      </span></td>
      <td>${personBadge(e.person)}</td>
      <td class="text-end val-mono ${zero ? 'val-zero' : ''}">${fmt(e.value)}</td>
      <td class="text-end">
        <button class="tbl-btn" onclick="openEditModal(${e.id})" title="Editar"><i class="ti ti-pencil"></i></button>
        <button class="tbl-btn del" onclick="openDelModal(${e.id},'expense')" title="Remover"><i class="ti ti-trash"></i></button>
      </td>
    </tr>`;
  }).join('');

  // Mobile cards
  document.getElementById('exp-cards').innerHTML = filtered.map(e => {
    const cat  = CATEGORIES[e.category] || {};
    const zero = e.value === 0;
    return `
    <div class="exp-card-item">
      <div class="exp-card-dot" style="background:${catColor(e.category)}"></div>
      <div class="exp-card-info">
        <div class="exp-card-name">${e.name}</div>
        <div class="exp-card-meta">
          <span class="cat-badge" style="background:${catColor(e.category)}22;color:${catColor(e.category)};font-size:10px">
            ${cat.emoji || ''} ${cat.label || e.category}
          </span>
          ${personBadge(e.person)}
        </div>
      </div>
      <div class="exp-card-right">
        <span class="exp-card-val ${zero ? 'zero' : ''}">${fmt(e.value)}</span>
        <div class="exp-card-actions">
          <button class="tbl-btn" onclick="openEditModal(${e.id})"><i class="ti ti-pencil"></i></button>
          <button class="tbl-btn del" onclick="openDelModal(${e.id},'expense')"><i class="ti ti-trash"></i></button>
        </div>
      </div>
    </div>`;
  }).join('');
}

/* Add / Edit expense modal */
function openAddModal() {
  document.getElementById('modal-id').value   = '';
  document.getElementById('modal-name').value = '';
  document.getElementById('modal-cat').value  = 'moradia';
  document.getElementById('modal-val').value  = '';
  document.getElementById('modal-title').textContent = 'Nova conta';
  expModal().show();
  setTimeout(() => document.getElementById('modal-name').focus(), 350);
}

function openEditModal(id) {
  const e = expOfMonth(curMonth).find(x => x.id === id);
  if (!e) return;
  document.getElementById('modal-id').value   = id;
  document.getElementById('modal-name').value = e.name;
  document.getElementById('modal-cat').value  = e.category;
  document.getElementById('modal-val').value  = e.value.toFixed(2).replace('.', ',');
  document.querySelectorAll('input[name="modal-person"]').forEach(r => {
    r.checked = r.value === (e.person || 'jhonatan');
  });
  document.getElementById('modal-title').textContent = 'Editar conta';
  expModal().show();
}

function saveExp() {
  const id     = document.getElementById('modal-id').value;
  const name   = document.getElementById('modal-name').value.trim();
  const cat    = document.getElementById('modal-cat').value;
  const value  = parseVal(document.getElementById('modal-val').value);
  const person = document.querySelector('input[name="modal-person"]:checked')?.value || 'jhonatan';
  if (!name) { document.getElementById('modal-name').focus(); return; }

  let exp = expOfMonth(curMonth);
  if (id) {
    exp = exp.map(e => e.id === +id ? { ...e, name, category: cat, value, person } : e);
  } else {
    const newId = exp.length ? Math.max(...exp.map(e => e.id)) + 1 : 1;
    exp.push({ id: newId, name, category: cat, value, person });
  }
  setExpOfMonth(curMonth, exp);
  expModal().hide();
  renderContas();
  if (document.getElementById('page-dashboard').classList.contains('active')) renderDashboard();
}

/* ============================================================
   METAS (GOALS)
   ============================================================ */
function renderMetas() {
  const total_target  = metas.reduce((s, m) => s + m.target, 0);
  const total_current = metas.reduce((s, m) => s + m.current, 0);
  const completed     = metas.filter(m => m.current >= m.target).length;

  // Summary row
  document.getElementById('metas-summary').innerHTML = `
    <div class="col-6 col-md-4">
      <div class="meta-summary-card">
        <div class="meta-summary-icon" style="background:#EDE9FD;color:#6C47E8"><i class="ti ti-target"></i></div>
        <div><div class="meta-summary-label">Total de metas</div><div class="meta-summary-val">${metas.length}</div></div>
      </div>
    </div>
    <div class="col-6 col-md-4">
      <div class="meta-summary-card">
        <div class="meta-summary-icon" style="background:#E1F5EE;color:#1D9E75"><i class="ti ti-circle-check"></i></div>
        <div><div class="meta-summary-label">Concluídas</div><div class="meta-summary-val">${completed}</div></div>
      </div>
    </div>
    <div class="col-12 col-md-4">
      <div class="meta-summary-card">
        <div class="meta-summary-icon" style="background:#E8F0FD;color:#2D6BE4"><i class="ti ti-wallet"></i></div>
        <div><div class="meta-summary-label">Total poupado</div><div class="meta-summary-val">${fmt(total_current)}</div></div>
      </div>
    </div>
  `;

  const grid = document.getElementById('metas-grid');

  if (!metas.length) {
    grid.innerHTML = `<div class="col-12 meta-empty">
      <i class="ti ti-target"></i>
      <p>Nenhuma meta cadastrada.<br>Crie sua primeira meta financeira!</p>
    </div>`;
    return;
  }

  grid.innerHTML = metas.map((m, idx) => {
    const color   = META_COLORS[idx % META_COLORS.length];
    const pct     = Math.min(100, Math.round(m.current / m.target * 100)) || 0;
    const done    = m.current >= m.target;
    const badgeBg = done ? '#E1F5EE' : '#EDE9FD';
    const badgeFg = done ? '#085041' : '#6C47E8';
    return `
    <div class="col-12 col-md-6 col-xl-4">
      <div class="meta-card">
        <div class="meta-card-accent" style="background:${color}"></div>
        <div class="meta-top">
          <div>
            <div class="meta-name">${m.name}</div>
          </div>
          <span class="meta-pct-badge" style="background:${badgeBg};color:${badgeFg}">
            ${done ? '✓ Concluída' : pct + '%'}
          </span>
        </div>
        <div class="meta-values">
          <span>Atual: <strong>${fmt(m.current)}</strong></span>
          <span>Meta: <strong>${fmt(m.target)}</strong></span>
        </div>
        <div class="meta-progress-track">
          <div class="meta-progress-fill" style="width:${pct}%;background:${color}"></div>
        </div>
        <div class="meta-actions">
          <button class="tbl-btn" onclick="openEditMeta(${m.id})" title="Editar"><i class="ti ti-pencil"></i></button>
          <button class="tbl-btn del" onclick="openDelModal(${m.id},'meta')" title="Remover"><i class="ti ti-trash"></i></button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function openMetaModal() {
  document.getElementById('meta-modal-id').value      = '';
  document.getElementById('meta-modal-name').value    = '';
  document.getElementById('meta-modal-target').value  = '';
  document.getElementById('meta-modal-current').value = '';
  document.getElementById('meta-modal-title').textContent = 'Nova meta';
  metaModal().show();
  setTimeout(() => document.getElementById('meta-modal-name').focus(), 350);
}

function openEditMeta(id) {
  const m = metas.find(x => x.id === id);
  if (!m) return;
  document.getElementById('meta-modal-id').value      = id;
  document.getElementById('meta-modal-name').value    = m.name;
  document.getElementById('meta-modal-target').value  = m.target.toFixed(2).replace('.', ',');
  document.getElementById('meta-modal-current').value = m.current.toFixed(2).replace('.', ',');
  document.getElementById('meta-modal-title').textContent = 'Editar meta';
  metaModal().show();
}

function saveMeta() {
  const id      = document.getElementById('meta-modal-id').value;
  const name    = document.getElementById('meta-modal-name').value.trim();
  const target  = parseVal(document.getElementById('meta-modal-target').value);
  const current = parseVal(document.getElementById('meta-modal-current').value);
  if (!name) { document.getElementById('meta-modal-name').focus(); return; }

  if (id) {
    const idx = metas.findIndex(m => m.id === +id);
    if (idx > -1) metas[idx] = { ...metas[idx], name, target, current };
  } else {
    const newId = metas.length ? Math.max(...metas.map(m => m.id)) + 1 : 1;
    metas.push({ id: newId, name, target, current });
  }
  saveData();
  metaModal().hide();
  renderMetas();
  if (document.getElementById('page-dashboard').classList.contains('active')) renderDashboard();
}

/* ============================================================
   DELETE MODAL (shared)
   ============================================================ */
function openDelModal(id, type) {
  pendingDelId   = id;
  pendingDelType = type;

  let label = 'Esta ação não pode ser desfeita.';
  if (type === 'expense') {
    const e = expOfMonth(curMonth).find(x => x.id === id);
    if (e) label = `"${e.name}" será removida.`;
  } else {
    const m = metas.find(x => x.id === id);
    if (m) label = `"${m.name}" será removida.`;
  }

  document.getElementById('del-name-lbl').textContent = label;
  document.getElementById('del-confirm-btn').onclick  = confirmDel;
  delModal().show();
}

function confirmDel() {
  if (pendingDelType === 'expense') {
    setExpOfMonth(curMonth, expOfMonth(curMonth).filter(e => e.id !== pendingDelId));
    delModal().hide();
    renderContas();
    if (document.getElementById('page-dashboard').classList.contains('active')) renderDashboard();
  } else {
    metas = metas.filter(m => m.id !== pendingDelId);
    saveData();
    delModal().hide();
    renderMetas();
    if (document.getElementById('page-dashboard').classList.contains('active')) renderDashboard();
  }
  pendingDelId = null;
}

/* ============================================================
   HISTÓRICO
   ============================================================ */
function renderHistorico() {
  const exp = expOfMonth(histMonth);
  const tot = total(exp);

  document.getElementById('hist-total').textContent = fmt(tot);
  document.getElementById('hist-count').textContent = exp.length;
  document.getElementById('hist-month-lbl').textContent = monthLabel(histMonth);

  const biggest = [...exp].sort((a, b) => b.value - a.value)[0];
  document.getElementById('hist-biggest').textContent = biggest ? biggest.name : '—';

  // vs previous month
  const [y, m] = histMonth.split('-').map(Number);
  const prevKey = monthKey(new Date(y, m - 2, 1).getFullYear(), new Date(y, m - 2, 1).getMonth());
  const prevTot = total(expOfMonth(prevKey));
  const diffEl  = document.getElementById('hist-diff');

  if (prevTot > 0) {
    const diff = tot - prevTot;
    const pct  = Math.round(Math.abs(diff) / prevTot * 100);
    diffEl.textContent = (diff >= 0 ? '+' : '-') + pct + '%';
    diffEl.style.color = diff > 0 ? '#DC2626' : '#1D9E75';
  } else {
    diffEl.textContent = '—'; diffEl.style.color = '';
  }

  const tbody = document.getElementById('hist-tbody');
  const cards  = document.getElementById('hist-cards');

  if (!exp.length) {
    const empty = `<div class="empty-state"><i class="ti ti-calendar-off"></i>Sem registros neste mês.</div>`;
    tbody.innerHTML = `<tr><td colspan="4">${empty}</td></tr>`;
    cards.innerHTML = empty;
    return;
  }

  const sorted = [...exp].sort((a, b) => b.value - a.value);

  tbody.innerHTML = sorted.map(e => {
    const cat  = CATEGORIES[e.category] || {};
    const zero = e.value === 0;
    return `
    <tr>
      <td><div class="name-cell">
        <div class="row-dot" style="background:${catColor(e.category)}"></div>
        ${e.name}
      </div></td>
      <td><span class="cat-badge" style="background:${catColor(e.category)}22;color:${catColor(e.category)}">
        ${cat.emoji || ''} ${cat.label || e.category}
      </span></td>
      <td>${personBadge(e.person)}</td>
      <td class="text-end val-mono ${zero ? 'val-zero' : ''}">${fmt(e.value)}</td>
    </tr>`;
  }).join('');

  cards.innerHTML = sorted.map(e => {
    const cat  = CATEGORIES[e.category] || {};
    const zero = e.value === 0;
    return `
    <div class="exp-card-item">
      <div class="exp-card-dot" style="background:${catColor(e.category)}"></div>
      <div class="exp-card-info">
        <div class="exp-card-name">${e.name}</div>
        <div class="exp-card-meta">
          <span class="cat-badge" style="background:${catColor(e.category)}22;color:${catColor(e.category)};font-size:10px">
            ${cat.emoji || ''} ${cat.label || e.category}
          </span>
          ${personBadge(e.person)}
        </div>
      </div>
      <div class="exp-card-right">
        <span class="exp-card-val ${zero ? 'zero' : ''}">${fmt(e.value)}</span>
      </div>
    </div>`;
  }).join('');
}

function changeMonth(dir) {
  const [y, m] = histMonth.split('-').map(Number);
  const d = new Date(y, m - 1 + dir, 1);
  histMonth = monthKey(d.getFullYear(), d.getMonth());
  renderHistorico();
}

/* ============================================================
   EXPORT / IMPORT
   ============================================================ */
function exportData() {
  const payload = {
    version: 2,
    exportedAt: new Date().toISOString(),
    expenses: allData,
    metas: metas,
  };

  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const date = new Date().toISOString().slice(0, 10);

  const a = document.createElement('a');
  a.href     = url;
  a.download = `meu-financeiro-backup-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);

  showToast('Backup exportado com sucesso!');
}

let pendingImportData = null;

function importData(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = e => {
    try {
      const parsed = JSON.parse(e.target.result);
      if (!parsed.expenses || !parsed.metas) throw new Error('Formato inválido');
      pendingImportData = parsed;
      bootstrap.Modal.getOrCreateInstance(document.getElementById('importModal')).show();
    } catch {
      showToast('Arquivo inválido ou corrompido.', true);
    }
    event.target.value = '';
  };
  reader.readAsText(file);
}

function confirmImport() {
  if (!pendingImportData) return;
  allData = pendingImportData.expenses;
  metas   = pendingImportData.metas;
  saveData();
  pendingImportData = null;
  bootstrap.Modal.getOrCreateInstance(document.getElementById('importModal')).hide();
  navigateTo('dashboard');
  showToast('Dados importados com sucesso!');
}

function cancelImport() {
  pendingImportData = null;
}

function showToast(msg, isError = false) {
  const toast = document.getElementById('appToast');
  const icon  = document.getElementById('toastIcon');
  document.getElementById('toastMsg').textContent = msg;
  toast.classList.toggle('error', isError);
  icon.className = isError ? 'ti ti-alert-circle' : 'ti ti-check-circle';
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}
