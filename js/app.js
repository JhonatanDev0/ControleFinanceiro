/* ============================================================
   MEU FINANCEIRO v2 — app.js
   ============================================================ */
'use strict';

/* ---- Constants ---- */

const DEFAULT_EXPENSES = [
  { id:1,  name:'Nubank',      category:'cartoes',  value:1799.35, person:'jhonatan', dueDate:'2026-05-10', paid:false },
  { id:2,  name:'Inter',       category:'cartoes',  value:0,       person:'jhonatan', dueDate:'',           paid:false },
  { id:3,  name:'Next',        category:'cartoes',  value:325.25,  person:'camila',   dueDate:'2026-05-15', paid:false },
  { id:4,  name:'Santander',   category:'cartoes',  value:0,       person:'camila',   dueDate:'',           paid:false },
  { id:5,  name:'Faculdade',   category:'educacao', value:245.14,  person:'camila',   dueDate:'2026-05-05', paid:true  },
  { id:6,  name:'Claro',       category:'servicos', value:0,       person:'jhonatan', dueDate:'',           paid:false },
  { id:7,  name:'Internet',    category:'servicos', value:130,     person:'jhonatan', dueDate:'2026-05-20', paid:false },
  { id:8,  name:'Condomínio',  category:'moradia',  value:173.99,  person:'jhonatan', dueDate:'2026-05-05', paid:true  },
  { id:9,  name:'Apartamento', category:'moradia',  value:1713.12, person:'jhonatan', dueDate:'2026-05-10', paid:false },
  { id:10, name:'Caixa',       category:'outros',   value:69,      person:'camila',   dueDate:'2026-05-25', paid:false },
];

const DEFAULT_METAS = [
  { id:1, name:'Reserva de emergência', target:10000, current:2500 },
  { id:2, name:'Viagem de férias',      target:3000,  current:800 },
  { id:3, name:'Notebook novo',         target:4500,  current:4500 },
];

const CATEGORIES = {
  moradia:  { label:'Moradia',  icon:'ti-home',        color:'#1D9E75' },
  cartoes:  { label:'Cartões',  icon:'ti-credit-card', color:'#2D6BE4' },
  servicos: { label:'Serviços', icon:'ti-wifi',        color:'#E8874A' },
  educacao: { label:'Educação', icon:'ti-school',      color:'#4A9AE8' },
  outros:   { label:'Outros',   icon:'ti-box',         color:'#9B59B6' },
};

const META_COLORS = ['#1D9E75','#2D6BE4','#6C47E8','#E8874A','#D97706','#DC2626'];

/* ---- State ---- */
let allData        = {};
let metas          = [];
let allSalary      = {};
let allAllocations = {};
let _skipNextSync  = false; // guard against onValue overwriting pending local writes
const _now       = new Date();
let curMonth     = `${_now.getFullYear()}-${String(_now.getMonth()+1).padStart(2,'0')}`;
let histMonth    = curMonth;
let activeFilter  = 'all';
let personFilter  = 'all';
let statusFilter  = 'all';
let searchQuery   = '';
let isDirty       = false;
let sortCol       = null;
let sortDir       = 'asc';
let contasMonth   = curMonth;
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

/* ---- Firebase Config ---- */
const firebaseConfig = {
  apiKey:            "AIzaSyBVmc7pQIsw9g_ZdLnLS1Uy1TNW7QxWZDc",
  authDomain:        "meufinanceiro-6d027.firebaseapp.com",
  databaseURL:       "https://meufinanceiro-6d027-default-rtdb.firebaseio.com",
  projectId:         "meufinanceiro-6d027",
  storageBucket:     "meufinanceiro-6d027.firebasestorage.app",
  messagingSenderId: "215194985969",
  appId:             "1:215194985969:web:4b984fd287e5863e81d050"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

/* ---- Firebase Helpers ---- */
function objToArr(obj) {
  if (!obj || typeof obj !== 'object') return [];
  return Object.values(obj).filter(Boolean);
}

function arrToObj(arr) {
  const obj = {};
  (arr || []).forEach(e => { if (e?.id != null) obj[String(e.id)] = e; });
  return obj;
}

/* ---- Storage (Firebase) ---- */
function expOfMonth(key) { return allData[key] || []; }

function setExpOfMonth(key, arr) {
  allData[key] = arr;
  db.ref(`financeiro/expenses/${key}`).set(arrToObj(arr));
}

function persistMetas() {
  db.ref('financeiro/metas').set(arrToObj(metas));
}

function persistAll() {
  const expObj = {};
  Object.keys(allData).forEach(month => { expObj[month] = arrToObj(allData[month]); });
  db.ref('financeiro').set({
    expenses:         expObj,
    metas:            arrToObj(metas),
    salary:           allSalary,
    goalAllocations:  allAllocations
  });
}

function renderCurrentPage() {
  ['dashboard','contas','metas','historico'].forEach(p => {
    if (document.getElementById('page-' + p)?.classList.contains('active')) {
      if (p === 'dashboard') renderDashboard();
      if (p === 'contas')    renderContas();
      if (p === 'metas')     renderMetas();
      if (p === 'historico') renderHistorico();
    }
  });
}

function showLoading() {
  document.getElementById('loading-overlay').style.display = 'flex';
}

function hideLoading() {
  document.getElementById('loading-overlay').style.display = 'none';
}

function loadData() {
  showLoading();
  db.ref('financeiro').on('value', snapshot => {
    if (_skipNextSync) { _skipNextSync = false; return; }
    const raw = snapshot.val();

    if (!raw) {
      // Primeira vez — seed com dados padrão
      allData = { [curMonth]: DEFAULT_EXPENSES.map(e => ({...e})) };
      metas   = DEFAULT_METAS.map(m => ({...m}));
      persistAll();
      return; // listener vai disparar novamente após o persistAll
    }

    // Carregar expenses
    const rawExp = raw.expenses || {};
    allData = {};
    Object.keys(rawExp).forEach(month => {
      allData[month] = objToArr(rawExp[month]);
    });
    if (!allData[curMonth]) allData[curMonth] = [];

    // Carregar metas
    metas = objToArr(raw.metas);

    // Carregar salary e alocações
    allSalary      = raw.salary      || {};
    allAllocations = raw.goalAllocations || {};

    document.getElementById('sb-month').textContent = monthLabel(curMonth);
    hideLoading();
    checkRecurring();
    renderCurrentPage();

  }, () => {
    hideLoading();
    showToast('Erro ao conectar com o banco de dados.', true);
  });
}

function getGreeting() {
  const h = new Date().getHours();
  if (h >= 6  && h < 12) return { text: 'Bom dia!',   icon: 'ti-sun' };
  if (h >= 12 && h < 18) return { text: 'Boa tarde!',  icon: 'ti-sun-high' };
  return                         { text: 'Boa noite!',  icon: 'ti-moon' };
}
const expModal  = () => bootstrap.Modal.getOrCreateInstance(document.getElementById('expModal'));
const metaModal = () => bootstrap.Modal.getOrCreateInstance(document.getElementById('metaModal'));
const delModal  = () => bootstrap.Modal.getOrCreateInstance(document.getElementById('delModal'));

/* ============================================================
   DIRTY TRACKING
   ============================================================ */
function markDirty() { isDirty = true; }

function forceCloseModal() {
  isDirty = false;
  bootstrap.Modal.getOrCreateInstance(document.getElementById('discardModal')).hide();
  expModal().hide();
}

function updateRecurringLabel(cb) {
  document.getElementById('recurring-label').textContent = cb.checked ? 'Sim' : 'Não';
}

/* ============================================================
   RECURRING ACCOUNTS
   ============================================================ */
function checkRecurring() {
  if (allData[curMonth] && allData[curMonth].length > 0) return;

  const [y, m] = curMonth.split('-').map(Number);
  const prevKey = monthKey(new Date(y, m - 2, 1).getFullYear(), new Date(y, m - 2, 1).getMonth());
  const recurring = expOfMonth(prevKey).filter(e => e.recurring);
  if (!recurring.length) return;

  const seeded = recurring.map((e, i) => ({
    ...e,
    id:      i + 1,
    paid:    false,
    dueDate: e.dueDate ? curMonth + e.dueDate.slice(7) : '',
  }));
  setExpOfMonth(curMonth, seeded);
  showToast(`${seeded.length} conta(s) recorrente(s) adicionadas para ${monthLabel(curMonth)}!`);
}

/* ============================================================
   SALARY
   ============================================================ */
function getSalary(month) {
  return allSalary[month] || { jhonatan: 0, camila: 0 };
}

function getSalaryTotal(month) {
  const s = getSalary(month);
  return (s.jhonatan || 0) + (s.camila || 0);
}

function getPrevCarryover(month) {
  const [y, m] = month.split('-').map(Number);
  const prevKey = monthKey(new Date(y, m - 2, 1).getFullYear(), new Date(y, m - 2, 1).getMonth());
  const s = getSalaryTotal(prevKey) - total(expOfMonth(prevKey));
  return s > 0 ? Math.round(s * 100) / 100 : 0;
}

function getTotalAvailable(month) {
  const allocated = allAllocations[month] || 0;
  return getSalaryTotal(month) + getPrevCarryover(month) - total(expOfMonth(month)) - allocated;
}

function getSurplus(month) {
  return getTotalAvailable(month);
}

function saveSalary() {
  const j = parseVal(document.getElementById('salary-j').value || '0');
  const c = parseVal(document.getElementById('salary-c').value || '0');
  allSalary[curMonth] = { jhonatan: j, camila: c };
  db.ref(`financeiro/salary/${curMonth}`).set({ jhonatan: j, camila: c });
  renderBalanceCard();
  renderAllocationPanel();
}

function selectAll(el) { el.select(); }

function resetAllocations() {
  if (!confirm(`Zerar o valor "Aplicado em metas" de ${monthLabel(curMonth)}?\nIsso não altera os valores das metas, apenas libera o saldo.`)) return;
  allAllocations[curMonth] = 0;
  _skipNextSync = true;
  db.ref(`financeiro/goalAllocations/${curMonth}`).set(0);
  renderBalanceCard();
  renderAllocationPanel();
  showToast('Alocações zeradas para ' + monthLabel(curMonth));
}

function renderSalaryCard() {
  const s = getSalary(curMonth);
  const jEl = document.getElementById('salary-j');
  const cEl = document.getElementById('salary-c');
  if (jEl && document.activeElement !== jEl)
    jEl.value = s.jhonatan > 0 ? s.jhonatan.toFixed(2).replace('.', ',') : '';
  if (cEl && document.activeElement !== cEl)
    cEl.value = s.camila > 0 ? s.camila.toFixed(2).replace('.', ',') : '';
  const totalSal = getSalaryTotal(curMonth);
  const dispEl = document.getElementById('salary-total-display');
  if (dispEl) dispEl.textContent = fmt(totalSal);
  const lbl = document.getElementById('salary-month-lbl');
  if (lbl) lbl.textContent = monthLabel(curMonth);
}

function renderBalanceCard() {
  const totalSal  = getSalaryTotal(curMonth);
  const carryover = getPrevCarryover(curMonth);
  const totalExp  = total(expOfMonth(curMonth));
  const allocated = allAllocations[curMonth] || 0;
  const available = totalSal + carryover - totalExp - allocated;
  const base      = totalSal + carryover;
  const pct       = base > 0 ? Math.min(100, Math.round((totalExp + allocated) / base * 100)) : 0;

  const salEl   = document.getElementById('bal-salary');
  const expEl   = document.getElementById('bal-expenses');
  const carryEl = document.getElementById('bal-carryover');
  const carryRow= document.getElementById('bal-carry-row');
  const prog    = document.getElementById('bal-progress');
  const pctEl   = document.getElementById('bal-pct');
  const surEl   = document.getElementById('bal-surplus');
  const lblEl   = document.getElementById('bal-label');
  const result  = document.getElementById('bal-result');
  if (!salEl) return;

  salEl.textContent = fmt(totalSal);
  expEl.textContent = fmt(totalExp);

  if (carryover > 0 && carryRow && carryEl) {
    carryRow.style.display = '';
    carryEl.textContent = '+ ' + fmt(carryover);
  } else if (carryRow) {
    carryRow.style.display = 'none';
  }

  const allocRow = document.getElementById('bal-alloc-row');
  const allocEl  = document.getElementById('bal-allocated');
  if (allocRow && allocEl) {
    if (allocated > 0) { allocRow.style.display = ''; allocEl.textContent = '- ' + fmt(allocated); }
    else               { allocRow.style.display = 'none'; }
  }

  let color, cls, label;
  if (totalSal === 0 && carryover === 0) {
    color = 'var(--text3)'; cls = ''; label = 'Insira o salário para calcular';
  } else if (available >= 0) {
    color = pct > 90 ? '#D97706' : 'var(--green)';
    cls   = pct > 90 ? 'balance-warn' : 'balance-ok';
    label = pct > 90 ? 'Margem apertada' : 'Salário cobre as contas';
  } else {
    color = '#DC2626'; cls = 'balance-bad'; label = 'Déficit — salário insuficiente';
  }

  prog.style.width      = pct + '%';
  prog.style.background = color;
  if (pctEl) pctEl.textContent = pct + '%';
  surEl.textContent     = fmt(Math.abs(available));
  lblEl.textContent     = available < 0 ? 'de déficit' : label;
  result.className      = 'balance-result ' + cls;
}

/* ============================================================
   ALLOCATION
   ============================================================ */
function renderAllocationPanel() {
  const surplus = getSurplus(curMonth);
  const panel   = document.getElementById('alloc-panel');
  if (!panel || !metas.length) { if (panel) panel.style.display = 'none'; return; }
  panel.style.display = '';

  const surplusEl = document.getElementById('alloc-surplus-val');
  if (surplusEl) surplusEl.textContent = fmt(Math.max(0, surplus));

  const rows = document.getElementById('alloc-rows');

  if (surplus <= 0) {
    rows.innerHTML = `<div class="empty-state" style="padding:1.25rem">
      <i class="ti ti-mood-sad"></i> Sem saldo disponível para distribuir este mês.
    </div>`;
    updateAllocTotals();
    return;
  }

  rows.innerHTML = metas.map(m => {
    const pct    = m.allocation || 0;
    const amount = surplus * (pct / 100);
    const color  = META_COLORS[metas.indexOf(m) % META_COLORS.length];
    const isAuto = m.autoAlloc && m.autoAllocPct > 0;
    return `<div class="alloc-row">
      <div class="alloc-row-dot" style="background:${color}"></div>
      <div class="alloc-row-name">
        ${m.name}
        ${isAuto ? '<span class="recurring-badge" title="Alocação automática"><i class="ti ti-refresh"></i> Auto</span>' : ''}
      </div>
      <div class="alloc-pct-wrap">
        <input type="number" class="alloc-pct-input" min="0" max="100"
          value="${pct}" ${isAuto ? 'readonly style="opacity:.6"' : ''}
          oninput="updateAllocation(${m.id}, this.value)" placeholder="0"/>
        <span class="alloc-pct-symbol">%</span>
      </div>
      <span class="alloc-val" id="alloc-val-${m.id}">${pct > 0 ? fmt(amount) : '—'}</span>
    </div>`;
  }).join('');

  updateAllocTotals();
}

function updateAllocation(id, val) {
  const pct     = Math.min(100, Math.max(0, parseFloat(val) || 0));
  const surplus = getSurplus(curMonth);
  const idx     = metas.findIndex(m => m.id === id);
  if (idx > -1) metas[idx].allocation = pct;
  const valEl = document.getElementById('alloc-val-' + id);
  if (valEl) valEl.textContent = pct > 0 ? fmt(surplus * (pct / 100)) : '—';
  updateAllocTotals();
}

function updateAllocTotals() {
  const totalPct = metas.reduce((s, m) => s + (m.allocation || 0), 0);
  const badge    = document.getElementById('alloc-pct-total');
  if (!badge) return;
  badge.textContent = totalPct + '% alocado';
  badge.className   = 'alloc-pct-total' + (totalPct > 100 ? ' over' : totalPct === 100 ? ' full' : '');
}

function applyAllocation() {
  const surplus  = getSurplus(curMonth);
  const totalPct = metas.reduce((s, m) => s + (m.allocation || 0), 0);
  if (totalPct > 100) { showToast('Total de alocação ultrapassa 100%.', true); return; }
  if (surplus <= 0)   { showToast('Sem saldo disponível para distribuir.', true); return; }

  let applied    = 0;
  let totalMoved = 0;

  metas = metas.map(m => {
    if (!m.allocation || m.allocation <= 0) return m;
    const add      = Math.round(surplus * (m.allocation / 100) * 100) / 100;
    const hasLimit = m.target > 0;
    applied++;
    totalMoved += add;
    return { ...m, current: hasLimit ? Math.min(m.target, m.current + add) : m.current + add };
  });

  allAllocations[curMonth] = Math.round(((allAllocations[curMonth] || 0) + totalMoved) * 100) / 100;

  // Single atomic write — flag prevents onValue from overwriting local state
  _skipNextSync = true;
  db.ref('financeiro').update({
    metas:                           arrToObj(metas),
    [`goalAllocations/${curMonth}`]: allAllocations[curMonth]
  });

  showToast(`R$ ${fmt(totalMoved).replace('R$ ', '')} distribuído em ${applied} meta(s)!`);
  renderMetas();
  renderBalanceCard();
  renderAllocationPanel();
}

function applyAutoAllocations() {
  const surplus = getSurplus(curMonth);
  if (surplus <= 0) return;
  const autoMetas = metas.filter(m => m.autoAlloc && m.autoAllocPct > 0);
  if (!autoMetas.length) return;

  // Pre-fill allocation % from autoAllocPct
  metas = metas.map(m => m.autoAlloc && m.autoAllocPct > 0
    ? { ...m, allocation: m.autoAllocPct }
    : m
  );
  persistMetas();
}

function toggleAutoAlloc(cb) {
  const wrap = document.getElementById('auto-alloc-pct-wrap');
  const lbl  = document.getElementById('meta-auto-label');
  if (wrap) wrap.style.display = cb.checked ? 'flex' : 'none';
  if (lbl)  lbl.textContent    = cb.checked ? 'Ativada' : 'Desativada';
}

/* ============================================================
   DASHBOARD COMPARISON
   ============================================================ */
/* ============================================================
   DARK MODE
   ============================================================ */
function applyDark(on) {
  document.documentElement.setAttribute('data-theme', on ? 'dark' : 'light');
  document.getElementById('dark-icon-sb').className = on ? 'ti ti-sun' : 'ti ti-moon';
  document.getElementById('dark-icon-mb').className = on ? 'ti ti-sun' : 'ti ti-moon';
  const lbl = document.getElementById('dark-label-sb');
  if (lbl) lbl.textContent = on ? 'Modo claro' : 'Modo escuro';
}

function toggleDarkMode() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  applyDark(!isDark);
  localStorage.setItem('mf_dark', isDark ? '0' : '1');
}

/* ============================================================
   UPCOMING BILLS
   ============================================================ */
function renderUpcoming() {
  const exp   = expOfMonth(curMonth);
  const today = new Date(); today.setHours(0,0,0,0);
  const in7   = new Date(today); in7.setDate(in7.getDate() + 7);

  const overdue  = exp
    .filter(e => e.dueDate && !e.paid)
    .map(e => ({ ...e, _due: new Date(e.dueDate + 'T00:00:00') }))
    .filter(e => e._due < today)
    .sort((a, b) => a._due - b._due);

  const upcoming = exp
    .filter(e => e.dueDate && !e.paid)
    .map(e => ({ ...e, _due: new Date(e.dueDate + 'T00:00:00') }))
    .filter(e => e._due >= today && e._due <= in7)
    .sort((a, b) => a._due - b._due);

  const panel = document.getElementById('upcoming-panel');
  const list  = document.getElementById('upcoming-list');

  if (!overdue.length && !upcoming.length) { panel.style.display = 'none'; return; }
  panel.style.display = '';

  const overdueHtml = overdue.length ? `
    <div class="upcoming-section-label overdue-label">
      <i class="ti ti-alert-circle"></i> Vencidas (${overdue.length})
    </div>
    ${overdue.map(e => {
      const days = Math.abs(Math.ceil((e._due - today) / 86400000));
      const label = days === 0 ? 'Hoje' : days === 1 ? 'Há 1 dia' : `Há ${days} dias`;
      return `<div class="upcoming-item">
        <div class="upcoming-dot" style="background:${catColor(e.category)}"></div>
        <span class="upcoming-name">${e.name}</span>
        <div class="upcoming-right">
          <span class="due-badge overdue"><i class="ti ti-alert-circle"></i> ${label}</span>
          <span class="upcoming-val ${e.value === 0 ? 'val-zero' : ''}">${fmt(e.value)}</span>
        </div>
      </div>`;
    }).join('')}` : '';

  const upcomingHtml = upcoming.length ? `
    <div class="upcoming-section-label">
      <i class="ti ti-clock"></i> Vencem em 7 dias (${upcoming.length})
    </div>
    ${upcoming.map(e => {
      const diff  = Math.ceil((e._due - today) / 86400000);
      const label = diff === 0 ? 'Hoje!' : diff === 1 ? 'Amanhã' : `Em ${diff} dias`;
      const cls   = diff === 0 ? 'overdue' : diff <= 2 ? 'soon' : 'ok';
      return `<div class="upcoming-item">
        <div class="upcoming-dot" style="background:${catColor(e.category)}"></div>
        <span class="upcoming-name">${e.name}</span>
        <div class="upcoming-right">
          <span class="due-badge ${cls}"><i class="ti ti-clock"></i> ${label}</span>
          <span class="upcoming-val ${e.value === 0 ? 'val-zero' : ''}">${fmt(e.value)}</span>
        </div>
      </div>`;
    }).join('')}` : '';

  list.innerHTML = overdueHtml + upcomingHtml;
}

/* ============================================================
   SEARCH
   ============================================================ */
function clearSearch() {
  document.getElementById('search-input').value = '';
  searchQuery = '';
  document.getElementById('search-clear').style.display = 'none';
  renderContas();
}

/* ============================================================
   COPY PREVIOUS MONTH
   ============================================================ */
function copyPrevMonth() {
  const [y, m] = curMonth.split('-').map(Number);
  const prevDate = new Date(y, m - 2, 1);
  const prevKey  = monthKey(prevDate.getFullYear(), prevDate.getMonth());
  const prevExp  = expOfMonth(prevKey);

  if (!prevExp.length) { showToast('Nenhuma conta encontrada no mês anterior.', true); return; }

  document.getElementById('copy-modal-desc').textContent =
    `${prevExp.length} conta(s) de ${monthLabel(prevKey)} serão copiadas para ${monthLabel(contasMonth)} com status pendente.`;
  bootstrap.Modal.getOrCreateInstance(document.getElementById('copyModal')).show();
}

function confirmCopyPrev() {
  const [y, m] = contasMonth.split('-').map(Number);
  const prevDate = new Date(y, m - 2, 1);
  const prevKey  = monthKey(prevDate.getFullYear(), prevDate.getMonth());
  const prevExp  = expOfMonth(prevKey);
  const current  = expOfMonth(contasMonth);
  const maxId    = current.length ? Math.max(...current.map(e => e.id)) : 0;
  const copied   = prevExp.map((e, i) => ({ ...e, id: maxId + i + 1, paid: false }));
  setExpOfMonth(contasMonth, [...current, ...copied]);
  bootstrap.Modal.getOrCreateInstance(document.getElementById('copyModal')).hide();
  renderContas();
  showToast(`${copied.length} conta(s) copiadas com sucesso!`);
}

/* ============================================================
   INIT
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  loadData();
  if (localStorage.getItem('mf_dark') === '1') applyDark(true);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

  document.getElementById('sb-month').textContent = monthLabel(curMonth);

  // Dark mode
  if (localStorage.getItem('mf_dark') === '1') applyDark(true);

  // PWA service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // Navigation
  document.querySelectorAll('[data-page]').forEach(el => {
    el.addEventListener('click', e => { e.preventDefault(); navigateTo(el.dataset.page); });
  });

  // Status segmented control
  document.querySelectorAll('.seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      statusFilter = btn.dataset.status;
      renderContas();
    });
  });

  // Dirty tracking — intercept modal close
  const expModalEl = document.getElementById('expModal');
  expModalEl.addEventListener('hide.bs.modal', e => {
    if (isDirty) {
      e.preventDefault();
      bootstrap.Modal.getOrCreateInstance(document.getElementById('discardModal')).show();
    }
  });
  if (searchEl) {
    searchEl.addEventListener('input', () => {
      searchQuery = searchEl.value.trim().toLowerCase();
      document.getElementById('search-clear').style.display = searchQuery ? '' : 'none';
      renderContas();
    });
  }

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
  if (page === 'contas') {
    contasMonth = contasMonth || curMonth;
    renderContas();
  }
  if (page === 'metas')     renderMetas();
  if (page === 'historico') renderHistorico();
}

/* ============================================================
   DASHBOARD
   ============================================================ */
function renderDashboard() {
  const exp = expOfMonth(curMonth);
  const tot = total(exp);
  const greeting = getGreeting();

  document.querySelector('.hero-eyebrow').innerHTML = `<i class="ti ${greeting.icon}"></i> ${greeting.text}`;
  document.getElementById('dash-subtitle').textContent =
    fmt(tot) + ' em ' + monthLabel(curMonth);
  animateNumber(document.getElementById('dash-total'), tot);
  document.getElementById('dash-active').textContent = exp.filter(e => e.value > 0).length;
  document.getElementById('dash-goals').textContent  = metas.filter(m => m.current < m.target).length;
  document.getElementById('dash-zero').textContent   = exp.filter(e => e.value === 0).length;

  renderUpcoming();
  renderSalaryCard();
  renderBalanceCard();
}

/* History Bar Chart */
function renderHistoryChartFor(selectedMonth) {
  const [y, m] = selectedMonth.split('-').map(Number);
  const months6 = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(y, m - 1 - (5 - i), 1);
    return monthKey(d.getFullYear(), d.getMonth());
  });

  const labels = months6.map(monthLabelShort);
  const values = months6.map(k => Math.round(total(allData[k] || []) * 100) / 100);
  const colors = months6.map(k => k === selectedMonth ? '#1D9E75' : '#E1F5EE');

  const ctx = document.getElementById('chart-history')?.getContext('2d');
  if (!ctx) return;

  if (chartHistory) chartHistory.destroy();

  chartHistory = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ data: values, backgroundColor: colors, borderRadius: 8, borderSkipped: false }] },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { font: { family: 'Sora', size: 11 }, color: '#96A89E' }, border: { display: false } },
        y: { grid: { color: '#F0F4F1' }, ticks: { font: { family: 'DM Mono', size: 11 }, color: '#96A89E', callback: v => 'R$ ' + v.toLocaleString('pt-BR') }, border: { display: false } },
      },
    },
  });
}

function renderComparisonFor(month) {
  const [y, m] = month.split('-').map(Number);
  const prevKey = monthKey(new Date(y, m - 2, 1).getFullYear(), new Date(y, m - 2, 1).getMonth());

  const curExp  = expOfMonth(month);
  const prevExp = expOfMonth(prevKey);
  const curTot  = total(curExp);
  const prevTot = total(prevExp);

  document.getElementById('comp-cur-month').textContent  = monthLabel(month);
  document.getElementById('comp-prev-month').textContent = monthLabel(prevKey);
  document.getElementById('comp-cur-total').textContent  = fmt(curTot);
  document.getElementById('comp-prev-total').textContent = fmt(prevTot);
  document.getElementById('comp-cur-j').textContent  = fmt(total(curExp.filter(e => e.person === 'jhonatan')));
  document.getElementById('comp-cur-c').textContent  = fmt(total(curExp.filter(e => e.person === 'camila')));
  document.getElementById('comp-prev-j').textContent = fmt(total(prevExp.filter(e => e.person === 'jhonatan')));
  document.getElementById('comp-prev-c').textContent = fmt(total(prevExp.filter(e => e.person === 'camila')));

  const badge = document.getElementById('comp-diff-badge');
  if (prevTot === 0) {
    badge.textContent = '—'; badge.className = 'comp-diff-badge comp-diff-zero';
  } else {
    const diff = curTot - prevTot;
    const pct  = Math.round(Math.abs(diff) / prevTot * 100);
    badge.textContent = (diff >= 0 ? '▲ +' : '▼ -') + pct + '%';
    badge.className   = 'comp-diff-badge ' + (diff > 0 ? 'comp-diff-up' : diff < 0 ? 'comp-diff-down' : 'comp-diff-zero');
  }
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
      <span class="cat-name"><i class="ti ${CATEGORIES[cat]?.icon || 'ti-tag'}" style="color:${catColor(cat)}"></i> ${CATEGORIES[cat]?.label || cat}</span>
      <div class="cat-bar-wrap">
        <div class="cat-bar" style="width:${Math.round(val/maxVal*100)}%;background:${catColor(cat)}"></div>
      </div>
      <span class="cat-val">${fmt(val)}</span>
    </div>
  `).join('');
}

const personBadge = p => p === 'camila'
  ? '<span class="person-badge person-c-badge"><i class="ti ti-user-heart"></i> Camila</span>'
  : '<span class="person-badge person-j-badge"><i class="ti ti-user"></i> Jhonatan</span>';

const catBadge = cat => {
  const c = CATEGORIES[cat] || { label: cat, icon: 'ti-tag', color: '#888' };
  return `<span class="cat-badge" style="background:${c.color}22;color:${c.color}">
    <i class="ti ${c.icon}"></i> ${c.label}
  </span>`;
};

function dueBadge(dueDate, paid) {
  if (!dueDate) return '<span class="due-badge none"><i class="ti ti-minus"></i> —</span>';
  const today = new Date(); today.setHours(0,0,0,0);
  const due   = new Date(dueDate + 'T00:00:00');
  const diff  = Math.ceil((due - today) / 86400000);
  const label = due.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' });
  if (paid) return `<span class="due-badge ok"><i class="ti ti-check"></i> ${label}</span>`;
  if (diff < 0)  return `<span class="due-badge overdue"><i class="ti ti-alert-circle"></i> ${label}</span>`;
  if (diff <= 3) return `<span class="due-badge soon"><i class="ti ti-clock"></i> ${label}</span>`;
  return `<span class="due-badge ok"><i class="ti ti-calendar"></i> ${label}</span>`;
}

function paidBtn(id, paid) {
  return paid
    ? `<button class="paid-badge paid" onclick="togglePaid(${id})" title="Marcar como pendente"><i class="ti ti-circle-check-filled"></i> Pago</button>`
    : `<button class="paid-badge unpaid" onclick="togglePaid(${id})" title="Marcar como pago"><i class="ti ti-circle"></i> Pendente</button>`;
}

function updatePaidLabel(cb) {
  document.getElementById('paid-label').textContent = cb.checked ? 'Pago' : 'Pendente';
}

async function togglePaid(id) {
  const exp = expOfMonth(curMonth);
  const idx = exp.findIndex(e => e.id === id);
  if (idx > -1) exp[idx].paid = !exp[idx].paid;
  setExpOfMonth(curMonth, exp);
  renderContas();
}

/* ============================================================
   NUMBER ANIMATION
   ============================================================ */
function animateNumber(el, toValue, duration = 700) {
  if (!el) return;
  const text = el.textContent.replace(/[^\d,.]/g, '').replace('.', '').replace(',', '.');
  const from = parseFloat(text) || 0;
  if (Math.abs(from - toValue) < 0.01) { el.textContent = fmt(toValue); return; }
  const start = performance.now();
  const ease  = t => 1 - Math.pow(1 - t, 3);
  const tick  = now => {
    const p = Math.min((now - start) / duration, 1);
    el.textContent = fmt(from + (toValue - from) * ease(p));
    if (p < 1) requestAnimationFrame(tick);
    else el.textContent = fmt(toValue);
  };
  requestAnimationFrame(tick);
}

/* ============================================================
   COLUMN SORTING
   ============================================================ */
function setSort(col) {
  sortDir = sortCol === col && sortDir === 'asc' ? 'desc' : 'asc';
  sortCol = col;
  // Update indicators
  document.querySelectorAll('.sort-ind').forEach(el => {
    el.className = 'sort-ind' + (el.dataset.col === col ? ' ' + sortDir : '');
  });
  renderContas();
}

/* ============================================================
   CONTAS
   ============================================================ */
function renderContas() {
  // Update month nav label
  const navLbl = document.getElementById('contas-month-lbl');
  if (navLbl) navLbl.textContent = monthLabel(contasMonth);

  const exp = expOfMonth(contasMonth);

  // Totals (always from full list, not filtered)
  const totalAll = total(exp);
  const totalJ   = total(exp.filter(e => e.person === 'jhonatan'));
  const totalC   = total(exp.filter(e => e.person === 'camila'));
  // Totals with animation
  animateNumber(document.getElementById('contas-total'),   totalAll);
  animateNumber(document.getElementById('contas-total-j'), totalJ);
  animateNumber(document.getElementById('contas-total-c'), totalC);

  // Apply filters
  let filtered = exp;
  if (activeFilter !== 'all')  filtered = filtered.filter(e => e.category === activeFilter);
  if (personFilter !== 'all')  filtered = filtered.filter(e => e.person === personFilter);
  if (statusFilter === 'paid')    filtered = filtered.filter(e => e.paid);
  if (statusFilter === 'pending') filtered = filtered.filter(e => !e.paid);
  if (searchQuery)             filtered = filtered.filter(e => e.name.toLowerCase().includes(searchQuery));

  document.getElementById('contas-subtitle').textContent =
    filtered.length + ' conta' + (filtered.length !== 1 ? 's' : '') + ' · ' + monthLabel(contasMonth);

  const emptyHtml = `<div class="empty-state"><i class="ti ti-receipt-off"></i>Nenhuma conta encontrada.</div>`;

  if (!filtered.length) {
    document.getElementById('exp-tbody').innerHTML = `<tr><td colspan="5">${emptyHtml}</td></tr>`;
    document.getElementById('exp-cards').innerHTML = emptyHtml;
    return;
  }

  // Apply sort
  const sortedFiltered = [...filtered].sort((a, b) => {
    if (!sortCol) {
      if (a.paid !== b.paid) return a.paid ? 1 : -1;
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      return a.dueDate ? -1 : 1;
    }
    let va = sortCol === 'name' ? a.name.toLowerCase() : sortCol === 'value' ? a.value : (a.dueDate || '');
    let vb = sortCol === 'name' ? b.name.toLowerCase() : sortCol === 'value' ? b.value : (b.dueDate || '');
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  document.getElementById('exp-tbody').innerHTML = sortedFiltered.map(e => {
    const zero = e.value === 0;
    return `<tr class="${e.paid ? 'exp-row-paid' : ''}">
      <td><div class="name-cell">
        <div class="row-dot" style="background:${catColor(e.category)}"></div>
        <span class="exp-name-text">${e.name}</span>
        ${e.recurring ? '<span class="recurring-badge"><i class="ti ti-refresh"></i> Recorrente</span>' : ''}
      </div></td>
      <td>${catBadge(e.category)}</td>
      <td>${personBadge(e.person)}</td>
      <td>${dueBadge(e.dueDate, e.paid)}</td>
      <td class="text-end val-mono ${zero ? 'val-zero' : ''}">${fmt(e.value)}</td>
      <td class="text-end">
        ${paidBtn(e.id, e.paid)}
        <button class="tbl-btn" onclick="openEditModal(${e.id},contasMonth)" title="Editar"><i class="ti ti-pencil"></i></button>
        <button class="tbl-btn del" onclick="openDelModal(${e.id},'expense')" title="Remover"><i class="ti ti-trash"></i></button>
      </td>
    </tr>`;
  }).join('');

  // Mobile cards
  document.getElementById('exp-cards').innerHTML = sortedFiltered.map(e => {
    const zero = e.value === 0;
    return `<div class="exp-card-item ${e.paid ? 'exp-row-paid' : ''}">
      <div class="exp-card-dot" style="background:${catColor(e.category)}"></div>
      <div class="exp-card-info">
        <div class="exp-card-name exp-name-text">${e.name} ${e.recurring ? '<span class="recurring-badge"><i class="ti ti-refresh"></i></span>' : ''}</div>
        <div class="exp-card-meta">
          ${catBadge(e.category)}
          ${personBadge(e.person)}
          ${dueBadge(e.dueDate, e.paid)}
        </div>
      </div>
      <div class="exp-card-right">
        <span class="exp-card-val ${zero ? 'zero' : ''}">${fmt(e.value)}</span>
        <div class="exp-card-actions">
          ${paidBtn(e.id, e.paid)}
          <button class="tbl-btn" onclick="openEditModal(${e.id},contasMonth)"><i class="ti ti-pencil"></i></button>
          <button class="tbl-btn del" onclick="openDelModal(${e.id},'expense')"><i class="ti ti-trash"></i></button>
        </div>
      </div>
    </div>`;
  }).join('');
}

/* Add / Edit expense modal */
function openAddModal() {
  isDirty = false;
  document.getElementById('modal-id').value              = '';
  document.getElementById('modal-original-month').value  = contasMonth;
  document.getElementById('modal-month').value           = contasMonth;
  document.getElementById('modal-name').value            = '';
  document.getElementById('modal-cat').value             = 'moradia';
  document.getElementById('modal-val').value             = '';
  document.getElementById('modal-due').value             = '';
  document.getElementById('modal-paid').checked          = false;
  document.getElementById('modal-recurring').checked     = false;
  document.getElementById('paid-label').textContent      = 'Pendente';
  document.getElementById('recurring-label').textContent = 'Não';
  document.querySelectorAll('input[name="modal-person"]').forEach(r => { r.checked = r.value === 'jhonatan'; });
  document.getElementById('modal-title').textContent = 'Nova conta';
  expModal().show();
  setTimeout(() => document.getElementById('modal-name').focus(), 350);
}

function openEditModal(id, month) {
  const m   = month || curMonth;
  const exp = expOfMonth(m);
  const e   = exp.find(x => x.id === id);
  if (!e) return;
  isDirty = false;
  document.getElementById('modal-id').value              = id;
  document.getElementById('modal-original-month').value  = m;
  document.getElementById('modal-month').value           = m;
  document.getElementById('modal-name').value            = e.name;
  document.getElementById('modal-cat').value             = e.category;
  document.getElementById('modal-val').value             = e.value.toFixed(2).replace('.', ',');
  document.getElementById('modal-due').value             = e.dueDate || '';
  document.getElementById('modal-paid').checked          = !!e.paid;
  document.getElementById('modal-recurring').checked     = !!e.recurring;
  document.getElementById('paid-label').textContent      = e.paid ? 'Pago' : 'Pendente';
  document.getElementById('recurring-label').textContent = e.recurring ? 'Sim' : 'Não';
  document.querySelectorAll('input[name="modal-person"]').forEach(r => {
    r.checked = r.value === (e.person || 'jhonatan');
  });
  document.getElementById('modal-title').textContent = 'Editar conta';
  expModal().show();
}

function saveExp() {
  const id           = document.getElementById('modal-id').value;
  const origMonth    = document.getElementById('modal-original-month').value || curMonth;
  const targetMonth  = document.getElementById('modal-month').value || curMonth;
  const name         = document.getElementById('modal-name').value.trim();
  const cat          = document.getElementById('modal-cat').value;
  const value        = parseVal(document.getElementById('modal-val').value);
  const person       = document.querySelector('input[name="modal-person"]:checked')?.value || 'jhonatan';
  const dueDate      = document.getElementById('modal-due').value;
  const paid         = document.getElementById('modal-paid').checked;
  const recurring    = document.getElementById('modal-recurring').checked;
  if (!name) { document.getElementById('modal-name').focus(); return; }

  isDirty = false;

  if (id) {
    if (origMonth !== targetMonth) {
      // Remove from original month, add to target month
      setExpOfMonth(origMonth, expOfMonth(origMonth).filter(e => e.id !== +id));
      const tExp  = expOfMonth(targetMonth);
      const newId = tExp.length ? Math.max(...tExp.map(e => e.id)) + 1 : 1;
      setExpOfMonth(targetMonth, [...tExp, { id: newId, name, category: cat, value, person, dueDate, paid, recurring }]);
    } else {
      setExpOfMonth(targetMonth, expOfMonth(targetMonth).map(e =>
        e.id === +id ? { ...e, name, category: cat, value, person, dueDate, paid, recurring } : e
      ));
    }
  } else {
    const exp   = expOfMonth(targetMonth);
    const newId = exp.length ? Math.max(...exp.map(e => e.id)) + 1 : 1;
    setExpOfMonth(targetMonth, [...exp, { id: newId, name, category: cat, value, person, dueDate, paid, recurring }]);
  }

  expModal().hide();
  if (targetMonth === curMonth || origMonth === curMonth) renderContas();
  if (document.getElementById('page-dashboard').classList.contains('active')) renderDashboard();
}

/* ============================================================
   METAS (GOALS)
   ============================================================ */
function renderMetas() {
  renderAllocationPanel();
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
    const color    = META_COLORS[idx % META_COLORS.length];
    const hasTarget = m.target > 0;
    const done     = hasTarget && m.current >= m.target;
    const pct      = hasTarget ? Math.min(100, Math.round(m.current / m.target * 100)) || 0 : null;
    const badgeBg  = done ? '#E1F5EE' : pct === null ? '#EDE9FD' : '#EDE9FD';
    const badgeFg  = done ? '#085041' : '#6C47E8';
    const badgeTxt = done ? '✓ Concluída' : pct !== null ? pct + '%' : 'Aberta';
    return `
    <div class="col-12 col-md-6 col-xl-4">
      <div class="meta-card">
        <div class="meta-card-accent" style="background:${color}"></div>
        <div class="meta-top">
          <div>
            <div class="meta-name">${m.name}
              ${m.autoAlloc ? ' <span class="recurring-badge"><i class="ti ti-refresh"></i> Auto ' + m.autoAllocPct + '%</span>' : ''}
            </div>
          </div>
          <span class="meta-pct-badge" style="background:${badgeBg};color:${badgeFg}">${badgeTxt}</span>
        </div>
        <div class="meta-values">
          <span>Atual: <strong>${fmt(m.current)}</strong></span>
          ${hasTarget ? `<span>Meta: <strong>${fmt(m.target)}</strong></span>` : '<span style="color:var(--text3);font-size:11px">Sem limite definido</span>'}
        </div>
        ${hasTarget ? `<div class="meta-progress-track"><div class="meta-progress-fill" style="width:${pct}%;background:${color}"></div></div>` : ''}
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
  document.getElementById('meta-modal-auto').checked  = false;
  document.getElementById('meta-modal-auto-pct').value= '';
  document.getElementById('auto-alloc-pct-wrap').style.display = 'none';
  document.getElementById('meta-auto-label').textContent = 'Desativada';
  document.getElementById('meta-modal-title').textContent = 'Nova meta';
  metaModal().show();
  setTimeout(() => document.getElementById('meta-modal-name').focus(), 350);
}

function openEditMeta(id) {
  const m = metas.find(x => x.id === id);
  if (!m) return;
  document.getElementById('meta-modal-id').value      = id;
  document.getElementById('meta-modal-name').value    = m.name;
  document.getElementById('meta-modal-target').value  = m.target > 0 ? m.target.toFixed(2).replace('.', ',') : '';
  document.getElementById('meta-modal-current').value = m.current > 0 ? m.current.toFixed(2).replace('.', ',') : '';
  document.getElementById('meta-modal-auto').checked  = !!m.autoAlloc;
  document.getElementById('meta-modal-auto-pct').value= m.autoAllocPct || '';
  document.getElementById('auto-alloc-pct-wrap').style.display = m.autoAlloc ? 'flex' : 'none';
  document.getElementById('meta-auto-label').textContent = m.autoAlloc ? 'Ativada' : 'Desativada';
  document.getElementById('meta-modal-title').textContent = 'Editar meta';
  metaModal().show();
}

function saveMeta() {
  const id          = document.getElementById('meta-modal-id').value;
  const name        = document.getElementById('meta-modal-name').value.trim();
  const targetRaw   = document.getElementById('meta-modal-target').value;
  const target      = targetRaw ? parseVal(targetRaw) : 0;
  const current     = parseVal(document.getElementById('meta-modal-current').value);
  const autoAlloc   = document.getElementById('meta-modal-auto').checked;
  const autoAllocPct= parseFloat(document.getElementById('meta-modal-auto-pct').value) || 0;
  if (!name) { document.getElementById('meta-modal-name').focus(); return; }

  if (id) {
    const oldMeta = metas.find(m => m.id === +id);
    const idx = metas.findIndex(m => m.id === +id);
    if (idx > -1) metas[idx] = { ...metas[idx], name, target, current, autoAlloc, autoAllocPct,
      allocation: autoAlloc ? autoAllocPct : (metas[idx].allocation || 0) };

    // If current was reduced, return the difference to available balance
    if (oldMeta && current < oldMeta.current) {
      const returned = Math.round((oldMeta.current - current) * 100) / 100;
      allAllocations[curMonth] = Math.max(0, Math.round(((allAllocations[curMonth] || 0) - returned) * 100) / 100);
      _skipNextSync = true;
      db.ref('financeiro').update({
        metas: arrToObj(metas),
        [`goalAllocations/${curMonth}`]: allAllocations[curMonth]
      });
    } else {
      persistMetas();
    }
  } else {
    const newId = metas.length ? Math.max(...metas.map(m => m.id)) + 1 : 1;
    metas.push({ id: newId, name, target, current, autoAlloc, autoAllocPct, allocation: autoAlloc ? autoAllocPct : 0 });
    persistMetas();
  }
  metaModal().hide();
  renderMetas();
  renderBalanceCard();
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
    setExpOfMonth(contasMonth, expOfMonth(contasMonth).filter(e => e.id !== pendingDelId));
    delModal().hide();
    renderContas();
    if (document.getElementById('page-dashboard').classList.contains('active')) renderDashboard();
  } else {
    // Return the meta's current value back to available balance
    const deletedMeta = metas.find(m => m.id === pendingDelId);
    if (deletedMeta && deletedMeta.current > 0 && allAllocations[curMonth] > 0) {
      const returned = Math.min(deletedMeta.current, allAllocations[curMonth]);
      allAllocations[curMonth] = Math.max(0, Math.round((allAllocations[curMonth] - returned) * 100) / 100);
    }
    metas = metas.filter(m => m.id !== pendingDelId);
    _skipNextSync = true;
    db.ref('financeiro').update({
      metas: arrToObj(metas),
      [`goalAllocations/${curMonth}`]: allAllocations[curMonth] || 0
    });
    delModal().hide();
    renderMetas();
    renderBalanceCard();
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

  // Charts use histMonth as selected month
  renderHistoryChartFor(histMonth);
  renderCatBreakdown(exp);
  renderComparisonFor(histMonth);

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
    const zero = e.value === 0;
    return `<tr>
      <td><div class="name-cell"><div class="row-dot" style="background:${catColor(e.category)}"></div>${e.name}</div></td>
      <td>${catBadge(e.category)}</td>
      <td>${personBadge(e.person)}</td>
      <td class="text-end val-mono ${zero ? 'val-zero' : ''}">${fmt(e.value)}</td>
    </tr>`;
  }).join('');

  cards.innerHTML = sorted.map(e => {
    const zero = e.value === 0;
    return `<div class="exp-card-item">
      <div class="exp-card-dot" style="background:${catColor(e.category)}"></div>
      <div class="exp-card-info">
        <div class="exp-card-name">${e.name}</div>
        <div class="exp-card-meta">${catBadge(e.category)} ${personBadge(e.person)}</div>
      </div>
      <div class="exp-card-right"><span class="exp-card-val ${zero ? 'zero' : ''}">${fmt(e.value)}</span></div>
    </div>`;
  }).join('');
}
function changeContasMonth(dir) {
  const [y, m] = contasMonth.split('-').map(Number);
  const d = new Date(y, m - 1 + dir, 1);
  contasMonth = monthKey(d.getFullYear(), d.getMonth());
  renderContas();
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
    version: 3,
    exportedAt: new Date().toISOString(),
    expenses: allData,
    metas:    metas,
    salary:   allSalary,
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

  const imported = pendingImportData;

  // Mesclar expenses por mês
  const impExp = imported.expenses || {};
  Object.keys(impExp).forEach(month => {
    const existing = allData[month] || [];
    const toAdd    = (Array.isArray(impExp[month]) ? impExp[month] : Object.values(impExp[month] || {}));
    const maxId    = existing.length ? Math.max(...existing.map(e => e.id)) : 0;

    // Adicionar apenas itens que não existem pelo nome+categoria no mesmo mês
    const existingKeys = new Set(existing.map(e => `${e.name}|${e.category}`));
    let nextId = maxId + 1;
    const merged = [...existing];
    toAdd.forEach(e => {
      const key = `${e.name}|${e.category}`;
      if (!existingKeys.has(key)) {
        merged.push({ ...e, id: nextId++ });
        existingKeys.add(key);
      }
    });

    allData[month] = merged;
  });

  // Mesclar metas
  const impMetas = Array.isArray(imported.metas)
    ? imported.metas
    : Object.values(imported.metas || {});
  const existingMetaNames = new Set(metas.map(m => m.name));
  const maxMetaId = metas.length ? Math.max(...metas.map(m => m.id)) : 0;
  let nextMetaId  = maxMetaId + 1;
  impMetas.forEach(m => {
    if (!existingMetaNames.has(m.name)) {
      metas.push({ ...m, id: nextMetaId++ });
      existingMetaNames.add(m.name);
    }
  });

  persistAll();
  pendingImportData = null;
  bootstrap.Modal.getOrCreateInstance(document.getElementById('importModal')).hide();
  navigateTo('dashboard');
  showToast('Dados mesclados com sucesso!');
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