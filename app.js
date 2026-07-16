/* ---------- Estado & persistência ---------- */

const LS_DATA_KEY = 'nf_data_v1';
const LS_CONFIG_KEY = 'nf_config_v1';
const LS_THEME_KEY = 'nf_theme_v1';
const LS_PIN_KEY = 'nf_pin_hash_v1';
const SS_UNLOCKED_KEY = 'nf_unlocked_v1';

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function defaultState() {
  return {
    version: 1,
    people: [
      { id: 'p1', name: 'Waldeir' },
      { id: 'p2', name: 'Naira' }
    ],
    accounts: [
      { id: uid(), name: 'Nubank', colorIndex: 0 },
      { id: uid(), name: 'Inter', colorIndex: 1 },
      { id: uid(), name: 'Santander', colorIndex: 2 },
      { id: uid(), name: 'Itaú', colorIndex: 3 },
      { id: uid(), name: 'Mercado Pago', colorIndex: 4 }
    ],
    categories: [
      { id: uid(), name: 'Salário', kind: 'entrada' },
      { id: uid(), name: 'Moradia', kind: 'despesa' },
      { id: uid(), name: 'Alimentação', kind: 'despesa' },
      { id: uid(), name: 'Transporte', kind: 'despesa' },
      { id: uid(), name: 'Pensão alimentícia', kind: 'despesa' },
      { id: uid(), name: 'Estacionamento', kind: 'despesa' },
      { id: uid(), name: 'Educação', kind: 'despesa' },
      { id: uid(), name: 'Cartão de crédito', kind: 'despesa' },
      { id: uid(), name: 'Financiamento', kind: 'despesa' },
      { id: uid(), name: 'Ajuda família', kind: 'despesa' }
    ],
    transactions: [],
    investments: [],
    updatedAt: new Date().toISOString()
  };
}

let state = loadLocal() || defaultState();
let config = loadConfig();
let currentView = 'dashboard';
let personFilter = 'all';
let currentMonth = new Date().toISOString().slice(0, 7);
let charts = {};
let editingId = null;

function loadLocal() {
  try {
    const raw = localStorage.getItem(LS_DATA_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function saveLocal() {
  state.updatedAt = new Date().toISOString();
  localStorage.setItem(LS_DATA_KEY, JSON.stringify(state));
}
function loadConfig() {
  try {
    const raw = localStorage.getItem(LS_CONFIG_KEY);
    return raw ? JSON.parse(raw) : { apiKey: '', binId: '', lastSync: null };
  } catch (e) { return { apiKey: '', binId: '', lastSync: null }; }
}
function saveConfig() {
  localStorage.setItem(LS_CONFIG_KEY, JSON.stringify(config));
}

/* ---------- Sincronização JSONBin ---------- */

let syncTimer = null;
function scheduleSync() {
  saveLocal();
  if (!config.apiKey || !config.binId) return;
  setSyncStatus('pending', 'sincronizando…');
  clearTimeout(syncTimer);
  syncTimer = setTimeout(pushToJsonBin, 1000);
}

function setSyncStatus(kind, text) {
  const el = document.getElementById('syncStatus');
  el.className = 'sync-status ' + kind;
  el.textContent = '● ' + text;
}

async function pushToJsonBin() {
  if (!config.apiKey || !config.binId) return;
  try {
    const res = await fetch(`https://api.jsonbin.io/v3/b/${config.binId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': config.apiKey
      },
      body: JSON.stringify(state)
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    config.lastSync = new Date().toISOString();
    saveConfig();
    setSyncStatus('ok', 'sincronizado às ' + new Date().toLocaleTimeString('pt-BR'));
    renderSettingsSyncInfo();
  } catch (e) {
    setSyncStatus('error', 'erro ao enviar');
    toast('Falha ao enviar para o JSONBin: ' + e.message, 'error');
  }
}

async function pullFromJsonBin(showToast = true) {
  if (!config.apiKey || !config.binId) {
    toast('Configure a API Key e o Bin ID primeiro.', 'error');
    return;
  }
  setSyncStatus('pending', 'buscando…');
  try {
    const res = await fetch(`https://api.jsonbin.io/v3/b/${config.binId}/latest`, {
      headers: { 'X-Master-Key': config.apiKey }
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    const remote = json.record;
    if (remote && remote.transactions) {
      state = remote;
      saveLocal();
      renderAll();
      if (showToast) toast('Dados atualizados a partir do JSONBin.', 'success');
    }
    config.lastSync = new Date().toISOString();
    saveConfig();
    setSyncStatus('ok', 'sincronizado às ' + new Date().toLocaleTimeString('pt-BR'));
    renderSettingsSyncInfo();
  } catch (e) {
    setSyncStatus('error', 'erro ao buscar');
    toast('Falha ao buscar do JSONBin: ' + e.message, 'error');
  }
}

/* ---------- Utilidades ---------- */

function formatCurrency(v) {
  return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function formatDate(d) {
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}
function monthKey(dateStr) { return dateStr.slice(0, 7); }
function monthLabel(mk) {
  const [y, m] = mk.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
}
function lastNMonths(n, endMonth) {
  const [y, m] = endMonth.split('-').map(Number);
  const arr = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1);
    arr.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
  }
  return arr;
}
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
function toast(msg, kind = '') {
  const c = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = 'toast ' + kind;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 4200);
}
function personName(id) {
  if (!id) return 'Compartilhado';
  const p = state.people.find(p => p.id === id);
  return p ? p.name : '—';
}
function accountName(id) {
  const a = state.accounts.find(a => a.id === id);
  return a ? a.name : '—';
}
function categoryName(id) {
  const c = state.categories.find(c => c.id === id);
  return c ? c.name : '—';
}
function accountColor(acc) {
  const idx = (acc.colorIndex || 0) % 8;
  return cssVar('--series-' + (idx + 1));
}
function matchesPerson(recordPersonId) {
  if (personFilter === 'all') return true;
  return recordPersonId === personFilter || recordPersonId === null || recordPersonId === undefined;
}

/* ---------- Cálculos ---------- */

function monthTotals(mk) {
  let entradas = 0, despesas = 0, rendimento = 0;
  state.transactions.forEach(t => {
    if (monthKey(t.date) !== mk) return;
    if (!matchesPerson(t.personId)) return;
    if (t.kind === 'entrada') entradas += t.amount; else despesas += t.amount;
  });
  state.investments.forEach(inv => {
    if (monthKey(inv.date) !== mk) return;
    if (!matchesPerson(inv.personId)) return;
    if (inv.movKind === 'rendimento') rendimento += inv.amount;
  });
  return { entradas, despesas, rendimento, ganhoReal: entradas - despesas + rendimento };
}

function expensesByAccount(mk) {
  const map = {};
  state.transactions.forEach(t => {
    if (t.kind !== 'despesa') return;
    if (monthKey(t.date) !== mk) return;
    if (!matchesPerson(t.personId)) return;
    map[t.accountId] = (map[t.accountId] || 0) + t.amount;
  });
  return map;
}

function investmentBalance() {
  let aportes = 0, retiradas = 0, rendimento = 0;
  state.investments.forEach(inv => {
    if (!matchesPerson(inv.personId)) return;
    if (inv.movKind === 'aporte') aportes += inv.amount;
    else if (inv.movKind === 'retirada') retiradas += inv.amount;
    else if (inv.movKind === 'rendimento') rendimento += inv.amount;
  });
  return { aportes, retiradas, rendimento, total: aportes - retiradas + rendimento };
}

/* ---------- Render: shell ---------- */

function renderAll() {
  renderPeopleFilters();
  renderDashboard();
  renderTransactions();
  renderInvestments();
  renderAccountsView();
  renderSettingsSyncInfo();
}

function renderPeopleFilters() {
  const group = document.getElementById('personFilterGroup');
  group.innerHTML = '';
  const opts = [{ id: 'all', name: 'Todos' }, ...state.people];
  opts.forEach(p => {
    const b = document.createElement('button');
    b.className = 'chip' + (personFilter === p.id ? ' active' : '');
    b.textContent = p.name;
    b.dataset.person = p.id;
    b.addEventListener('click', () => { personFilter = p.id; renderAll(); });
    group.appendChild(b);
  });
}

/* ---------- Dashboard ---------- */

function renderDashboard() {
  const t = monthTotals(currentMonth);
  const kpiGrid = document.getElementById('kpiGrid');
  kpiGrid.innerHTML = `
    <div class="kpi-card"><div class="kpi-label">Entradas do mês</div><div class="kpi-value good">${formatCurrency(t.entradas)}</div></div>
    <div class="kpi-card"><div class="kpi-label">Despesas do mês</div><div class="kpi-value critical">${formatCurrency(t.despesas)}</div></div>
    <div class="kpi-card"><div class="kpi-label">Rendimento investido</div><div class="kpi-value good">${formatCurrency(t.rendimento)}</div></div>
    <div class="kpi-card"><div class="kpi-label">Ganho real do mês</div><div class="kpi-value ${t.ganhoReal >= 0 ? 'good' : 'critical'}">${formatCurrency(t.ganhoReal)}</div></div>
  `;

  renderGainChart();
  renderAccountsChart();
  renderFlowChart();
}

function renderGainChart() {
  const months = lastNMonths(12, currentMonth);
  const data = months.map(mk => monthTotals(mk).ganhoReal);
  const good = cssVar('--status-good'), critical = cssVar('--status-critical');
  const colors = data.map(v => v >= 0 ? good : critical);

  if (charts.gain) charts.gain.destroy();
  const ctx = document.getElementById('chartGain').getContext('2d');
  charts.gain = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: months.map(monthLabel),
      datasets: [{ data, backgroundColor: colors, borderRadius: 4, maxBarThickness: 34 }]
    },
    options: baseChartOptions({ legend: false, currency: true })
  });

  const rows = months.map((mk, i) => `<tr><td>${monthLabel(mk)}</td><td>${formatCurrency(data[i])}</td></tr>`).join('');
  document.getElementById('tableGain').innerHTML = `<table><thead><tr><th>Mês</th><th>Ganho real</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderAccountsChart() {
  document.getElementById('expenseByAccountMonthLabel').textContent = 'Mês: ' + monthLabel(currentMonth);
  const map = expensesByAccount(currentMonth);
  let entries = state.accounts
    .map(a => ({ name: a.name, value: map[a.id] || 0, color: accountColor(a) }))
    .filter(e => e.value > 0)
    .sort((a, b) => b.value - a.value);

  let rest = 0;
  if (entries.length > 8) {
    rest = entries.slice(7).reduce((s, e) => s + e.value, 0);
    entries = entries.slice(0, 7);
    entries.push({ name: 'Outras', value: rest, color: cssVar('--text-muted') });
  }

  if (charts.accounts) charts.accounts.destroy();
  const ctx = document.getElementById('chartAccounts').getContext('2d');
  if (entries.length === 0) {
    charts.accounts = null;
    ctx.clearRect(0, 0, 999, 999);
    document.getElementById('tableAccounts').innerHTML = '<p class="muted-text">Sem despesas neste mês.</p>';
    return;
  }
  charts.accounts = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: entries.map(e => e.name),
      datasets: [{ data: entries.map(e => e.value), backgroundColor: entries.map(e => e.color), borderRadius: 4 }]
    },
    options: { ...baseChartOptions({ legend: false, currency: true }), indexAxis: 'y' }
  });

  const rows = entries.map(e => `<tr><td>${e.name}</td><td>${formatCurrency(e.value)}</td></tr>`).join('');
  document.getElementById('tableAccounts').innerHTML = `<table><thead><tr><th>Conta</th><th>Despesas</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderFlowChart() {
  const months = lastNMonths(12, currentMonth);
  const totals = months.map(monthTotals);
  if (charts.flow) charts.flow.destroy();
  const ctx = document.getElementById('chartFlow').getContext('2d');
  charts.flow = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: months.map(monthLabel),
      datasets: [
        { label: 'Entradas', data: totals.map(t => t.entradas), backgroundColor: cssVar('--series-1'), borderRadius: 4 },
        { label: 'Despesas', data: totals.map(t => t.despesas), backgroundColor: cssVar('--series-6'), borderRadius: 4 },
        { label: 'Rendimento', data: totals.map(t => t.rendimento), backgroundColor: cssVar('--series-2'), borderRadius: 4 }
      ]
    },
    options: baseChartOptions({ legend: true, currency: true })
  });

  const rows = months.map((mk, i) => `<tr><td>${monthLabel(mk)}</td><td>${formatCurrency(totals[i].entradas)}</td><td>${formatCurrency(totals[i].despesas)}</td><td>${formatCurrency(totals[i].rendimento)}</td></tr>`).join('');
  document.getElementById('tableFlow').innerHTML = `<table><thead><tr><th>Mês</th><th>Entradas</th><th>Despesas</th><th>Rendimento</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function baseChartOptions({ legend, currency }) {
  const grid = cssVar('--gridline');
  const muted = cssVar('--text-muted');
  const surface = cssVar('--surface-1');
  const text = cssVar('--text-primary');
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: !!legend, position: 'top', labels: { color: muted, boxWidth: 12, usePointStyle: true } },
      tooltip: {
        backgroundColor: surface, titleColor: text, bodyColor: text,
        borderColor: grid, borderWidth: 1, padding: 10,
        callbacks: currency ? { label: (ctx) => `${ctx.dataset.label ? ctx.dataset.label + ': ' : ''}${formatCurrency(ctx.parsed.y ?? ctx.parsed.x)}` } : undefined
      }
    },
    scales: {
      x: { grid: { color: grid, display: true }, ticks: { color: muted }, border: { color: cssVar('--baseline') } },
      y: { grid: { color: grid }, ticks: { color: muted, callback: (v) => currency ? formatCurrency(v) : v }, border: { color: cssVar('--baseline') } }
    }
  };
}

/* ---------- Lançamentos ---------- */

function renderTransactions() {
  const rows = state.transactions
    .filter(t => matchesPerson(t.personId))
    .sort((a, b) => b.date.localeCompare(a.date))
    .filter(t => monthKey(t.date) === currentMonth);

  const tbody = document.querySelector('#transactionsTable tbody');
  tbody.innerHTML = '';
  document.getElementById('transactionsEmpty').classList.toggle('hidden', rows.length > 0);

  rows.forEach(t => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${formatDate(t.date)}</td>
      <td>${t.kind === 'entrada' ? 'Entrada' : 'Despesa'}</td>
      <td>${categoryName(t.categoryId)}</td>
      <td>${accountName(t.accountId)}</td>
      <td>${personName(t.personId)}</td>
      <td>${t.note || ''}</td>
      <td class="${t.kind === 'entrada' ? 'amount-in' : 'amount-out'}">${t.kind === 'entrada' ? '+' : '−'} ${formatCurrency(t.amount)}</td>
      <td class="row-actions">
        <button data-edit="${t.id}" title="Editar">✏️</button>
        <button data-del="${t.id}" title="Excluir">🗑️</button>
      </td>`;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => openTransactionModal(b.dataset.edit)));
  tbody.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
    if (confirm('Excluir este lançamento?')) {
      state.transactions = state.transactions.filter(t => t.id !== b.dataset.del);
      scheduleSync(); renderAll();
    }
  }));
}

function openTransactionModal(id) {
  editingId = id || null;
  const t = id ? state.transactions.find(x => x.id === id) : null;
  const kind = t ? t.kind : 'despesa';

  showModal(`
    <h3>${t ? 'Editar' : 'Novo'} lançamento</h3>
    <form class="modal-form" id="txForm">
      <div class="type-toggle" id="txTypeToggle">
        <button type="button" data-value="entrada" class="${kind === 'entrada' ? 'active' : ''}">Entrada</button>
        <button type="button" data-value="despesa" class="${kind === 'despesa' ? 'active' : ''}">Despesa</button>
      </div>
      <label>Data <input type="date" name="date" required value="${t ? t.date : new Date().toISOString().slice(0,10)}"></label>
      <label>Valor (R$) <input type="number" step="0.01" min="0" name="amount" required value="${t ? t.amount : ''}"></label>
      <label>Categoria
        <select name="categoryId">${categoryOptions(kind, t?.categoryId)}</select>
      </label>
      <label>Conta
        <select name="accountId">${accountOptions(t?.accountId)}</select>
      </label>
      <label>Pessoa
        <select name="personId">${personOptions(t?.personId)}</select>
      </label>
      <label>Descrição <input type="text" name="note" value="${t ? (t.note || '') : ''}"></label>
      <div class="modal-actions">
        ${t ? '<button type="button" class="btn danger" id="txDelete">Excluir</button>' : ''}
        <button type="button" class="btn" id="modalCancel">Cancelar</button>
        <button type="submit" class="btn primary">Salvar</button>
      </div>
    </form>
  `);

  let selectedKind = kind;
  const toggle = document.getElementById('txTypeToggle');
  toggle.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    toggle.querySelectorAll('button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    selectedKind = b.dataset.value;
    document.querySelector('#txForm select[name="categoryId"]').innerHTML = categoryOptions(selectedKind);
  }));

  document.getElementById('modalCancel').addEventListener('click', closeModal);
  if (t) document.getElementById('txDelete').addEventListener('click', () => {
    if (confirm('Excluir este lançamento?')) {
      state.transactions = state.transactions.filter(x => x.id !== t.id);
      scheduleSync(); closeModal(); renderAll();
    }
  });

  document.getElementById('txForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const record = {
      id: t ? t.id : uid(),
      kind: selectedKind,
      date: fd.get('date'),
      amount: parseFloat(fd.get('amount')) || 0,
      categoryId: fd.get('categoryId') || null,
      accountId: fd.get('accountId') || null,
      personId: fd.get('personId') || null,
      note: fd.get('note') || ''
    };
    if (t) {
      const idx = state.transactions.findIndex(x => x.id === t.id);
      state.transactions[idx] = record;
    } else {
      state.transactions.push(record);
    }
    scheduleSync(); closeModal(); renderAll();
  });
}

function categoryOptions(kind, selected) {
  return state.categories.filter(c => c.kind === kind)
    .map(c => `<option value="${c.id}" ${c.id === selected ? 'selected' : ''}>${c.name}</option>`).join('')
    || '<option value="">(cadastre uma categoria)</option>';
}
function accountOptions(selected) {
  return state.accounts.map(a => `<option value="${a.id}" ${a.id === selected ? 'selected' : ''}>${a.name}</option>`).join('');
}
function personOptions(selected) {
  const opts = state.people.map(p => `<option value="${p.id}" ${p.id === selected ? 'selected' : ''}>${p.name}</option>`).join('');
  return opts + `<option value="" ${!selected ? 'selected' : ''}>Compartilhado</option>`;
}

/* ---------- Investimentos ---------- */

function renderInvestments() {
  const bal = investmentBalance();
  document.getElementById('investKpiGrid').innerHTML = `
    <div class="kpi-card"><div class="kpi-label">Total aportado</div><div class="kpi-value">${formatCurrency(bal.aportes)}</div></div>
    <div class="kpi-card"><div class="kpi-label">Total retirado</div><div class="kpi-value">${formatCurrency(bal.retiradas)}</div></div>
    <div class="kpi-card"><div class="kpi-label">Rendimento acumulado</div><div class="kpi-value good">${formatCurrency(bal.rendimento)}</div></div>
    <div class="kpi-card"><div class="kpi-label">Patrimônio investido</div><div class="kpi-value good">${formatCurrency(bal.total)}</div></div>
  `;

  const rows = state.investments
    .filter(i => matchesPerson(i.personId))
    .sort((a, b) => b.date.localeCompare(a.date));

  const tbody = document.querySelector('#investmentsTable tbody');
  tbody.innerHTML = '';
  document.getElementById('investmentsEmpty').classList.toggle('hidden', rows.length > 0);

  const kindLabel = { aporte: 'Aporte', retirada: 'Retirada', rendimento: 'Rendimento' };
  rows.forEach(inv => {
    const tr = document.createElement('tr');
    const positive = inv.movKind !== 'retirada';
    tr.innerHTML = `
      <td>${formatDate(inv.date)}</td>
      <td>${kindLabel[inv.movKind]}</td>
      <td>${accountName(inv.accountId)}</td>
      <td>${personName(inv.personId)}</td>
      <td>${inv.note || ''}</td>
      <td class="${positive ? 'amount-in' : 'amount-out'}">${positive ? '+' : '−'} ${formatCurrency(inv.amount)}</td>
      <td class="row-actions">
        <button data-edit="${inv.id}" title="Editar">✏️</button>
        <button data-del="${inv.id}" title="Excluir">🗑️</button>
      </td>`;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => openInvestmentModal(b.dataset.edit)));
  tbody.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
    if (confirm('Excluir esta movimentação?')) {
      state.investments = state.investments.filter(i => i.id !== b.dataset.del);
      scheduleSync(); renderAll();
    }
  }));
}

function openInvestmentModal(id) {
  const inv = id ? state.investments.find(x => x.id === id) : null;
  const kind = inv ? inv.movKind : 'aporte';

  showModal(`
    <h3>${inv ? 'Editar' : 'Nova'} movimentação de investimento</h3>
    <form class="modal-form" id="invForm">
      <div class="type-toggle" id="invTypeToggle">
        <button type="button" data-value="aporte" class="${kind === 'aporte' ? 'active' : ''}">Aporte</button>
        <button type="button" data-value="retirada" class="${kind === 'retirada' ? 'active' : ''}">Retirada</button>
        <button type="button" data-value="rendimento" class="${kind === 'rendimento' ? 'active' : ''}">Rendimento</button>
      </div>
      <label>Data <input type="date" name="date" required value="${inv ? inv.date : new Date().toISOString().slice(0,10)}"></label>
      <label>Valor (R$) <input type="number" step="0.01" min="0" name="amount" required value="${inv ? inv.amount : ''}"></label>
      <label>Conta / Corretora
        <select name="accountId">${accountOptions(inv?.accountId)}</select>
      </label>
      <label>Pessoa
        <select name="personId">${personOptions(inv?.personId)}</select>
      </label>
      <label>Descrição <input type="text" name="note" value="${inv ? (inv.note || '') : ''}"></label>
      <div class="modal-actions">
        ${inv ? '<button type="button" class="btn danger" id="invDelete">Excluir</button>' : ''}
        <button type="button" class="btn" id="modalCancel">Cancelar</button>
        <button type="submit" class="btn primary">Salvar</button>
      </div>
    </form>
  `);

  let selectedKind = kind;
  const toggle = document.getElementById('invTypeToggle');
  toggle.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    toggle.querySelectorAll('button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    selectedKind = b.dataset.value;
  }));

  document.getElementById('modalCancel').addEventListener('click', closeModal);
  if (inv) document.getElementById('invDelete').addEventListener('click', () => {
    if (confirm('Excluir esta movimentação?')) {
      state.investments = state.investments.filter(x => x.id !== inv.id);
      scheduleSync(); closeModal(); renderAll();
    }
  });

  document.getElementById('invForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const record = {
      id: inv ? inv.id : uid(),
      movKind: selectedKind,
      date: fd.get('date'),
      amount: parseFloat(fd.get('amount')) || 0,
      accountId: fd.get('accountId') || null,
      personId: fd.get('personId') || null,
      note: fd.get('note') || ''
    };
    if (inv) {
      const idx = state.investments.findIndex(x => x.id === inv.id);
      state.investments[idx] = record;
    } else {
      state.investments.push(record);
    }
    scheduleSync(); closeModal(); renderAll();
  });
}

/* ---------- Contas & Categorias ---------- */

function renderAccountsView() {
  const accList = document.getElementById('accountsList');
  accList.innerHTML = '';
  state.accounts.forEach(a => {
    const li = document.createElement('li');
    li.innerHTML = `<span><i class="swatch" style="background:${accountColor(a)}"></i>${a.name}</span>
      <span class="row-actions"><button data-del="${a.id}" title="Excluir">🗑️</button></span>`;
    accList.appendChild(li);
  });
  accList.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
    const inUse = state.transactions.some(t => t.accountId === b.dataset.del) || state.investments.some(i => i.accountId === b.dataset.del);
    if (inUse && !confirm('Essa conta tem lançamentos vinculados. Excluir mesmo assim?')) return;
    state.accounts = state.accounts.filter(a => a.id !== b.dataset.del);
    scheduleSync(); renderAll();
  }));

  const catList = document.getElementById('categoriesList');
  catList.innerHTML = '';
  state.categories.forEach(c => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${c.name}<span class="tag">${c.kind === 'entrada' ? 'Entrada' : 'Despesa'}</span></span>
      <span class="row-actions"><button data-del="${c.id}" title="Excluir">🗑️</button></span>`;
    catList.appendChild(li);
  });
  catList.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
    const inUse = state.transactions.some(t => t.categoryId === b.dataset.del);
    if (inUse && !confirm('Essa categoria tem lançamentos vinculados. Excluir mesmo assim?')) return;
    state.categories = state.categories.filter(c => c.id !== b.dataset.del);
    scheduleSync(); renderAll();
  }));

  const peopleEdit = document.getElementById('peopleEdit');
  peopleEdit.innerHTML = state.people.map(p => `
    <label>${p.id === 'p1' ? 'Pessoa 1' : 'Pessoa 2'}
      <input type="text" data-person-name="${p.id}" value="${p.name}">
    </label>`).join('');
  peopleEdit.querySelectorAll('[data-person-name]').forEach(inp => {
    inp.addEventListener('change', () => {
      const p = state.people.find(x => x.id === inp.dataset.personName);
      p.name = inp.value.trim() || p.name;
      scheduleSync(); renderAll();
    });
  });
}

function openAccountModal() {
  showModal(`
    <h3>Nova conta</h3>
    <form class="modal-form" id="accForm">
      <label>Nome <input type="text" name="name" required placeholder="Ex: Nubank, Carteira, Poupança"></label>
      <div class="modal-actions">
        <button type="button" class="btn" id="modalCancel">Cancelar</button>
        <button type="submit" class="btn primary">Salvar</button>
      </div>
    </form>
  `);
  document.getElementById('modalCancel').addEventListener('click', closeModal);
  document.getElementById('accForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = new FormData(e.target).get('name').trim();
    if (!name) return;
    state.accounts.push({ id: uid(), name, colorIndex: state.accounts.length });
    scheduleSync(); closeModal(); renderAll();
  });
}

function openCategoryModal() {
  showModal(`
    <h3>Nova categoria</h3>
    <form class="modal-form" id="catForm">
      <label>Nome <input type="text" name="name" required placeholder="Ex: Lazer, Saúde, Freelance"></label>
      <div class="type-toggle" id="catTypeToggle">
        <button type="button" data-value="despesa" class="active">Despesa</button>
        <button type="button" data-value="entrada">Entrada</button>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn" id="modalCancel">Cancelar</button>
        <button type="submit" class="btn primary">Salvar</button>
      </div>
    </form>
  `);
  let kind = 'despesa';
  const toggle = document.getElementById('catTypeToggle');
  toggle.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    toggle.querySelectorAll('button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    kind = b.dataset.value;
  }));
  document.getElementById('modalCancel').addEventListener('click', closeModal);
  document.getElementById('catForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = new FormData(e.target).get('name').trim();
    if (!name) return;
    state.categories.push({ id: uid(), name, kind });
    scheduleSync(); closeModal(); renderAll();
  });
}

/* ---------- Configurações ---------- */

function renderSettingsSyncInfo() {
  document.getElementById('jsonbinKey').value = config.apiKey || '';
  document.getElementById('jsonbinBinId').value = config.binId || '';
  const info = document.getElementById('lastSyncInfo');
  info.textContent = config.lastSync
    ? 'Última sincronização: ' + new Date(config.lastSync).toLocaleString('pt-BR')
    : 'Ainda não sincronizado.';
  if (config.apiKey && config.binId) {
    setSyncStatus(config.lastSync ? 'ok' : 'pending', config.lastSync ? 'sincronizado' : 'aguardando primeira sincronização');
  } else {
    setSyncStatus('', 'offline (configure o JSONBin)');
  }
}

/* ---------- Modal genérico ---------- */

function showModal(html) {
  document.getElementById('modalBox').innerHTML = html;
  document.getElementById('modalOverlay').classList.remove('hidden');
}
function closeModal() {
  document.getElementById('modalOverlay').classList.add('hidden');
  document.getElementById('modalBox').innerHTML = '';
}

/* ---------- Navegação ---------- */

function setView(view) {
  currentView = view;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + view));
}

/* ---------- Tema ---------- */

function applyTheme(theme) {
  if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  else if (theme === 'light') document.documentElement.setAttribute('data-theme', 'light');
  else document.documentElement.removeAttribute('data-theme');
  document.getElementById('themeToggle').textContent = theme === 'dark' ? '☀️' : '🌙';
}

/* ---------- Backup local ---------- */

function exportBackup() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `nosso-financeiro-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importBackup(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!parsed.transactions || !parsed.accounts) throw new Error('Arquivo inválido');
      state = parsed;
      scheduleSync();
      renderAll();
      toast('Backup importado com sucesso.', 'success');
    } catch (e) {
      toast('Não foi possível importar o arquivo: ' + e.message, 'error');
    }
  };
  reader.readAsText(file);
}

/* ---------- Inicialização ---------- */

function startApp() {
  const savedTheme = localStorage.getItem(LS_THEME_KEY) || 'auto';
  applyTheme(savedTheme);

  document.getElementById('monthPicker').value = currentMonth;
  document.getElementById('monthPicker').addEventListener('change', (e) => {
    currentMonth = e.target.value || currentMonth;
    renderAll();
  });

  document.querySelectorAll('.tab-btn').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));

  document.getElementById('themeToggle').addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme');
    const next = cur === 'dark' ? 'light' : (cur === 'light' ? 'auto' : 'dark');
    localStorage.setItem(LS_THEME_KEY, next);
    applyTheme(next);
    renderAll();
  });

  document.getElementById('btnNewTransaction').addEventListener('click', () => openTransactionModal(null));
  document.getElementById('btnNewInvestment').addEventListener('click', () => openInvestmentModal(null));
  document.getElementById('btnNewAccount').addEventListener('click', openAccountModal);
  document.getElementById('btnNewCategory').addEventListener('click', openCategoryModal);

  document.getElementById('modalOverlay').addEventListener('click', (e) => { if (e.target.id === 'modalOverlay') closeModal(); });

  document.querySelectorAll('[data-table-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById(btn.dataset.tableToggle).classList.toggle('hidden');
    });
  });

  document.getElementById('btnSaveConfig').addEventListener('click', () => {
    config.apiKey = document.getElementById('jsonbinKey').value.trim();
    config.binId = document.getElementById('jsonbinBinId').value.trim();
    saveConfig();
    toast('Configuração salva neste navegador.', 'success');
    renderSettingsSyncInfo();
  });
  document.getElementById('btnPullNow').addEventListener('click', () => pullFromJsonBin(true));
  document.getElementById('btnPushNow').addEventListener('click', pushToJsonBin);
  document.getElementById('btnExport').addEventListener('click', exportBackup);
  document.getElementById('importFile').addEventListener('change', (e) => {
    if (e.target.files[0]) importBackup(e.target.files[0]);
    e.target.value = '';
  });

  document.getElementById('btnChangePin').addEventListener('click', changePin);
  document.getElementById('btnRemovePin').addEventListener('click', removePin);

  renderAll();
  if (config.apiKey && config.binId) pullFromJsonBin(false);
}

/* ---------- Bloqueio por PIN ---------- */

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function showAppShell() {
  document.getElementById('lockOverlay').classList.add('hidden');
  document.getElementById('appShell').classList.remove('hidden');
}

function initLock() {
  const overlay = document.getElementById('lockOverlay');
  const title = document.getElementById('lockTitle');
  const subtitle = document.getElementById('lockSubtitle');
  const input = document.getElementById('lockInput');
  const confirmInput = document.getElementById('lockInputConfirm');
  const error = document.getElementById('lockError');
  const submitBtn = document.getElementById('lockSubmit');
  const forgotBtn = document.getElementById('lockForgot');

  const savedHash = localStorage.getItem(LS_PIN_KEY);
  const alreadyUnlocked = savedHash && sessionStorage.getItem(SS_UNLOCKED_KEY) === '1';

  if (!savedHash) {
    // Primeiro uso: pedir para criar um PIN
    title.textContent = 'Crie um PIN';
    subtitle.textContent = 'Use 4 a 6 dígitos para proteger o app neste aparelho';
    confirmInput.classList.remove('hidden');
    forgotBtn.classList.add('hidden');
  } else if (alreadyUnlocked) {
    showAppShell();
    startApp();
    return;
  } else {
    title.textContent = 'Digite o PIN';
    subtitle.textContent = 'Para acessar o Nosso Financeiro';
    confirmInput.classList.add('hidden');
    forgotBtn.classList.remove('hidden');
  }

  overlay.classList.remove('hidden');
  input.value = '';
  confirmInput.value = '';
  error.classList.add('hidden');
  input.focus();

  function showError(msg) {
    error.textContent = msg;
    error.classList.remove('hidden');
  }

  async function handleSubmit() {
    const pin = input.value.trim();
    if (!/^\d{4,6}$/.test(pin)) {
      showError('O PIN deve ter de 4 a 6 números.');
      return;
    }
    if (!savedHash) {
      if (pin !== confirmInput.value.trim()) {
        showError('Os PINs não conferem.');
        return;
      }
      localStorage.setItem(LS_PIN_KEY, await sha256Hex(pin));
      sessionStorage.setItem(SS_UNLOCKED_KEY, '1');
      showAppShell();
      startApp();
      return;
    }
    const hash = await sha256Hex(pin);
    if (hash === savedHash) {
      sessionStorage.setItem(SS_UNLOCKED_KEY, '1');
      showAppShell();
      startApp();
    } else {
      showError('PIN incorreto. Tente novamente.');
      input.value = '';
      input.focus();
    }
  }

  submitBtn.onclick = handleSubmit;
  confirmInput.onkeydown = (e) => { if (e.key === 'Enter') handleSubmit(); };
  input.onkeydown = (e) => { if (e.key === 'Enter') { confirmInput.classList.contains('hidden') ? handleSubmit() : confirmInput.focus(); } };
  forgotBtn.onclick = () => {
    if (confirm('Isso remove o PIN deste aparelho (os dados continuam salvos e sincronizados). Deseja continuar?')) {
      localStorage.removeItem(LS_PIN_KEY);
      sessionStorage.removeItem(SS_UNLOCKED_KEY);
      initLock();
    }
  };
}

function changePin() {
  const current = localStorage.getItem(LS_PIN_KEY);
  showModal(`
    <h3>Alterar PIN</h3>
    <form class="modal-form" id="pinForm">
      ${current ? '<label>PIN atual <input type="password" inputmode="numeric" name="oldPin" maxlength="6" required></label>' : ''}
      <label>Novo PIN <input type="password" inputmode="numeric" name="newPin" maxlength="6" required></label>
      <label>Confirmar novo PIN <input type="password" inputmode="numeric" name="newPinConfirm" maxlength="6" required></label>
      <div class="modal-actions">
        <button type="button" class="btn" id="modalCancel">Cancelar</button>
        <button type="submit" class="btn primary">Salvar</button>
      </div>
    </form>
  `);
  document.getElementById('modalCancel').addEventListener('click', closeModal);
  document.getElementById('pinForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    if (current) {
      const oldHash = await sha256Hex((fd.get('oldPin') || '').trim());
      if (oldHash !== current) { toast('PIN atual incorreto.', 'error'); return; }
    }
    const newPin = (fd.get('newPin') || '').trim();
    if (!/^\d{4,6}$/.test(newPin)) { toast('O novo PIN deve ter de 4 a 6 números.', 'error'); return; }
    if (newPin !== (fd.get('newPinConfirm') || '').trim()) { toast('Os PINs não conferem.', 'error'); return; }
    localStorage.setItem(LS_PIN_KEY, await sha256Hex(newPin));
    closeModal();
    toast('PIN atualizado.', 'success');
  });
}

function removePin() {
  const current = localStorage.getItem(LS_PIN_KEY);
  if (!current) { toast('Nenhum PIN está ativo.', ''); return; }
  showModal(`
    <h3>Remover PIN</h3>
    <form class="modal-form" id="pinRemoveForm">
      <label>PIN atual <input type="password" inputmode="numeric" name="oldPin" maxlength="6" required></label>
      <div class="modal-actions">
        <button type="button" class="btn" id="modalCancel">Cancelar</button>
        <button type="submit" class="btn danger">Remover</button>
      </div>
    </form>
  `);
  document.getElementById('modalCancel').addEventListener('click', closeModal);
  document.getElementById('pinRemoveForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const oldHash = await sha256Hex((new FormData(e.target).get('oldPin') || '').trim());
    if (oldHash !== current) { toast('PIN atual incorreto.', 'error'); return; }
    localStorage.removeItem(LS_PIN_KEY);
    sessionStorage.removeItem(SS_UNLOCKED_KEY);
    closeModal();
    toast('PIN removido deste aparelho.', 'success');
  });
}

document.addEventListener('DOMContentLoaded', initLock);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
