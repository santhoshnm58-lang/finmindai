/* =========================================================
   FinMind AI — Application Logic
   Sections:
   1. Config & helpers        6. Budgets & goals
   2. State & storage         7. AI engine (insights/forecast/score)
   3. Demo data               8. Chat assistant
   4. Navigation & intro      9. Modals & forms
   5. Rendering & charts     10. Init
   ========================================================= */

/* ---------- 1. CONFIG & HELPERS ---------- */
const CATEGORIES = {
  expense: {
    Food: { icon: '🍔', color: '#fb923c' },
    Rent: { icon: '🏠', color: '#a78bfa' },
    Transport: { icon: '🚕', color: '#38bdf8' },
    Shopping: { icon: '🛍️', color: '#f472b6' },
    Bills: { icon: '💡', color: '#fbbf24' },
    Entertainment: { icon: '🎬', color: '#34d399' },
    Health: { icon: '💊', color: '#f87171' },
    Education: { icon: '📚', color: '#60a5fa' },
    Other: { icon: '📦', color: '#94a3b8' },
  },
  income: {
    Salary: { icon: '💼', color: '#34d399' },
    Freelance: { icon: '💻', color: '#22d3ee' },
    Investment: { icon: '📈', color: '#a3e635' },
    Gift: { icon: '🎁', color: '#f472b6' },
    Other: { icon: '💵', color: '#94a3b8' },
  },
};

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const money = (n) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
const pad = (n) => String(n).padStart(2, '0');
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const monthKey = (d) => (typeof d === 'string' ? d.slice(0, 7) : `${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
const today = () => new Date();
const catInfo = (type, name) => (CATEGORIES[type] && CATEGORIES[type][name]) || { icon: '📦', color: '#94a3b8' };
const escapeHTML = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const prettyDate = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2600);
}

function animateNumber(el, to, formatter = money, dur = 1000) {
  const from = Number(el.dataset.val) || 0;
  el.dataset.val = to;
  const start = performance.now();
  const step = (now) => {
    const p = Math.min((now - start) / dur, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = formatter(from + (to - from) * eased);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ---------- 2. STATE & STORAGE ---------- */
// Local-browser demo accounts. For a real finance product, replace this with
// Firebase Authentication + Firestore or another trusted backend.
const LEGACY_KEY = 'finmind-ai-v1';
const ACCOUNTS_KEY = 'finmind-ai-accounts-v1';
const SESSION_KEY = 'finmind-ai-session-v1';
let currentEmail = null;

function blankState() {
  return {
    user: { name: '', opening: 0, target: 20 },
    theme: 'dark',
    transactions: [],
    budgets: {},
    goals: [],
    seeded: false,
  };
}
let state = blankState();

function accountDataKey(email) {
  return 'finmind-ai-data-' + encodeURIComponent(String(email).trim().toLowerCase());
}
function getAccounts() {
  try {
    const value = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch (e) { return []; }
}
function saveAccounts(accounts) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}
function save() {
  if (!currentEmail) return;
  try { localStorage.setItem(accountDataKey(currentEmail), JSON.stringify(state)); }
  catch (e) { toast('Could not save data. Browser storage may be full.'); }
}
function load() {
  state = blankState();
  try {
    const raw = localStorage.getItem(accountDataKey(currentEmail));
    if (raw) state = Object.assign(blankState(), JSON.parse(raw));
  } catch (e) { state = blankState(); }
  if (!state.user || typeof state.user !== 'object') state.user = { name: '', opening: 0, target: 20 };
  if (!Array.isArray(state.transactions)) state.transactions = [];
  if (!state.budgets || typeof state.budgets !== 'object') state.budgets = {};
  if (!Array.isArray(state.goals)) state.goals = [];
}

function toHex(bytes) {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function passwordDigest(password, salt) {
  if (!window.crypto?.subtle) throw new Error('Secure password hashing is unavailable. Open this app using localhost in a modern browser.');
  const data = new TextEncoder().encode(salt + password);
  return toHex(await crypto.subtle.digest('SHA-256', data));
}
function createSalt() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}
function setAuthMode(mode) {
  const creating = mode === 'create';
  $('#authForm').dataset.mode = creating ? 'create' : 'login';
  $('#authTitle').textContent = creating ? 'Create your account' : 'Welcome back';
  $('#authSubtitle').textContent = creating ? 'Start with a clean personal finance dashboard.' : 'Sign in to open your personal finance dashboard.';
  $('#authNameWrap').hidden = !creating;
  $('#authName').required = creating;
  $('#authPassword').autocomplete = creating ? 'new-password' : 'current-password';
  $('#authSubmit').textContent = creating ? 'Create account' : 'Login';
  $('#authToggle').textContent = creating ? 'Already have an account? Login' : 'New to FinMind? Create an account';
  $('#authError').textContent = '';
}
function openAuthModal(mode = 'login') {
  setAuthMode(mode);
  $('#authModal').hidden = false;
  setTimeout(() => (mode === 'create' ? $('#authName') : $('#authEmail')).focus(), 50);
}
function updateAuthButton() {
  $('#authBtn').textContent = currentEmail ? 'Logout' : 'Login';
  $('#authBtn').title = currentEmail ? 'Sign out of this account' : 'Sign in to FinMind';
}
function activateAccount(email, welcome = true) {
  currentEmail = email;
  localStorage.setItem(SESSION_KEY, email);
  load();
  const account = getAccounts().find((a) => a.email === email);
  if (!state.user.name && account?.name) state.user.name = account.name;
  $('#authModal').hidden = true;
  $('#chatBox').innerHTML = '';
  applyTheme();
  renderView('dashboard');
  botSay(`Hi${state.user.name ? ' ' + state.user.name : ''}! I'm your FinMind assistant 🤖 Ask about your money or add transactions, for example “add 250 food lunch”.`, 150);
  updateAuthButton();
  save();
  runIntro();
  if (welcome) toast('You are signed in. Start adding your income and expenses.');
}
function logout() {
  save();
  currentEmail = null;
  localStorage.removeItem(SESSION_KEY);
  state = blankState();
  updateAuthButton();
  openAuthModal('login');
}
async function handleAuthSubmit(event) {
  event.preventDefault();
  const mode = $('#authForm').dataset.mode || 'login';
  const email = $('#authEmail').value.trim().toLowerCase();
  const password = $('#authPassword').value;
  const name = $('#authName').value.trim();
  const error = $('#authError');
  error.textContent = '';
  if (!email || !password || (mode === 'create' && !name)) return;
  try {
    const accounts = getAccounts();
    const existing = accounts.find((a) => a.email === email);
    if (mode === 'create') {
      if (existing) { error.textContent = 'An account with this email already exists. Please log in.'; return; }
      if (password.length < 6) { error.textContent = 'Use a password with at least 6 characters.'; return; }
      const salt = createSalt();
      const passwordHash = await passwordDigest(password, salt);
      accounts.push({ email, name, salt, passwordHash, createdAt: new Date().toISOString() });
      saveAccounts(accounts);
      state = blankState();
      state.user.name = name;
      currentEmail = email;
      save();
      activateAccount(email, true);
    } else {
      if (!existing) { error.textContent = 'No account found for this email. Create an account first.'; return; }
      const passwordHash = await passwordDigest(password, existing.salt);
      if (passwordHash !== existing.passwordHash) { error.textContent = 'Incorrect password. Please try again.'; return; }
      activateAccount(email, true);
    }
  } catch (err) {
    error.textContent = err.message || 'Could not sign in. Please try again.';
  }
}

/* ---------- 3. DEMO DATA ---------- */
function seedDemo() {
  let seed = 42;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const tx = [];
  const now = today();
  const add = (date, type, category, description, amount, recurring = false) =>
    tx.push({ id: uid(), date: toISO(date), type, category, description, amount: Math.round(amount), recurring });

  for (let m = 5; m >= 0; m--) {
    const base = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const lastDay = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    const limit = m === 0 ? Math.min(now.getDate(), lastDay) : lastDay;
    const D = (day) => new Date(base.getFullYear(), base.getMonth(), Math.min(day, limit));

    if (m > 0 || now.getDate() >= 1) add(D(1), 'income', 'Salary', 'Monthly salary', 52000 + (m % 2) * 1500, true);
    if (limit >= 5) add(D(5), 'expense', 'Rent', 'House rent', 14000, true);
    if (limit >= 7) add(D(7), 'expense', 'Bills', 'Electricity bill', 1200 + rnd() * 600);
    if (limit >= 8) add(D(8), 'expense', 'Bills', 'Internet & mobile', 999, true);
    if (limit >= 10) add(D(10), 'expense', 'Entertainment', 'Netflix subscription', 649, true);
    if (limit >= 11) add(D(11), 'expense', 'Entertainment', 'Spotify subscription', 119, true);
    if (limit >= 12 && rnd() > 0.35) add(D(12), 'income', 'Freelance', 'Freelance project', 4000 + rnd() * 9000);
    if (limit >= 20 && rnd() > 0.5) add(D(20), 'income', 'Investment', 'Mutual fund returns', 1200 + rnd() * 1800);

    const foods = ['Lunch at cafe', 'Groceries', 'Swiggy order', 'Dinner out', 'Zomato order', 'Snacks'];
    for (let d = 1; d <= limit; d++) {
      if (rnd() > 0.35) add(D(d), 'expense', 'Food', foods[Math.floor(rnd() * foods.length)], 120 + rnd() * 520);
      if (rnd() > 0.7) add(D(d), 'expense', 'Transport', rnd() > 0.5 ? 'Uber ride' : 'Metro recharge', 60 + rnd() * 340);
    }
    if (limit >= 14 && rnd() > 0.3) add(D(14), 'expense', 'Shopping', 'Clothes & accessories', 1200 + rnd() * 3200);
    if (limit >= 18 && rnd() > 0.5) add(D(18), 'expense', 'Health', 'Pharmacy', 300 + rnd() * 900);
    if (limit >= 22 && rnd() > 0.5) add(D(22), 'expense', 'Education', 'Online course', 499 + rnd() * 1500);
    if (limit >= 25 && rnd() > 0.5) add(D(25), 'expense', 'Entertainment', 'Movie night', 500 + rnd() * 900);
  }
  // one deliberate unusual transaction so the AI anomaly detector has something to find
  add(new Date(now.getFullYear(), now.getMonth(), Math.max(1, now.getDate() - 2)), 'expense', 'Shopping', 'Headphones', 6499);

  state.transactions = tx;
  state.budgets = { Food: 7000, Transport: 2500, Shopping: 4000, Entertainment: 2000, Bills: 3000 };
  const nextYear = new Date(now.getFullYear() + 1, now.getMonth(), 1);
  state.goals = [
    { id: uid(), name: 'Emergency fund', emoji: '🛟', target: 100000, saved: 38000, date: toISO(nextYear) },
    { id: uid(), name: 'New laptop', emoji: '💻', target: 65000, saved: 21000, date: toISO(new Date(now.getFullYear(), now.getMonth() + 6, 1)) },
    { id: uid(), name: 'Goa trip', emoji: '🏖️', target: 25000, saved: 9500, date: toISO(new Date(now.getFullYear(), now.getMonth() + 4, 1)) },
  ];
  state.seeded = true;
  save();
}

/* ---------- Data selectors ---------- */
const txOf = (type, mk) => state.transactions.filter((t) => t.type === type && (!mk || monthKey(t.date) === mk));
const sum = (arr) => arr.reduce((a, t) => a + t.amount, 0);
const curMonth = () => monthKey(today());
const prevMonth = () => monthKey(new Date(today().getFullYear(), today().getMonth() - 1, 1));

function totals(mk) {
  const income = sum(txOf('income', mk));
  const expense = sum(txOf('expense', mk));
  return { income, expense, savings: income - expense, rate: income > 0 ? ((income - expense) / income) * 100 : 0 };
}
function balance() {
  return (Number(state.user.opening) || 0) + sum(txOf('income')) - sum(txOf('expense'));
}
function byCategory(mk) {
  const map = {};
  txOf('expense', mk).forEach((t) => (map[t.category] = (map[t.category] || 0) + t.amount));
  return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}
function lastMonths(n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today().getFullYear(), today().getMonth() - i, 1);
    const mk = monthKey(d);
    out.push({ mk, label: d.toLocaleDateString('en-IN', { month: 'short' }), ...totals(mk) });
  }
  return out;
}

/* ---------- 4. NAVIGATION & INTRO ---------- */
function go(view) {
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + view));
  $$('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  renderView(view);
}

function runIntro() {
  const splash = $('#splash');
  if (sessionStorage.getItem('finmind-intro')) { splash.classList.add('hide'); return; }
  const lines = ['Your personal AI money manager', 'Tracking income & expenses…', 'Learning your spending habits…', 'Ready. Let’s grow your savings.'];
  let i = 0, pct = 0;
  const fill = $('#splashFill');
  const tick = setInterval(() => {
    pct = Math.min(pct + 3.4, 100);
    fill.style.width = pct + '%';
    const idx = Math.min(Math.floor(pct / 26), lines.length - 1);
    if (idx !== i) { i = idx; $('#splashTag').textContent = lines[i]; }
    if (pct >= 100) { clearInterval(tick); setTimeout(closeIntro, 500); }
  }, 100);
  function closeIntro() {
    sessionStorage.setItem('finmind-intro', '1');
    splash.classList.add('hide');
    renderView('dashboard');
  }
  $('#skipIntro').addEventListener('click', () => { clearInterval(tick); closeIntro(); });
}

/* ---------- 5. RENDERING & CHARTS ---------- */
function renderView(view) {
  const v = view || ($('.view.active') || {}).id?.replace('view-', '') || 'dashboard';
  renderHeader();
  if (v === 'dashboard') renderDashboard();
  if (v === 'transactions') renderTransactions();
  if (v === 'budgets') renderBudgets();
  if (v === 'goals') renderGoals();
  if (v === 'insights') renderInsights();
  if (v === 'settings') renderSettings();
  renderSideScore();
}
const rerender = () => renderView();

function renderHeader() {
  const h = today().getHours();
  const part = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const name = state.user.name ? ', ' + state.user.name : '';
  $('#greeting').textContent = `${part}${name} 👋`;
  $('#subGreeting').textContent = today().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function renderDashboard() {
  const t = totals(curMonth());
  const p = totals(prevMonth());
  animateNumber($('#stBalance'), balance());
  animateNumber($('#stIncome'), t.income);
  animateNumber($('#stExpense'), t.expense);
  animateNumber($('#stSavings'), Math.max(t.rate, 0), (v) => v.toFixed(1) + '%');

  const delta = (cur, prev, goodIfUp) => {
    if (!prev) return '<span class="muted">No data last month</span>';
    const pct = ((cur - prev) / prev) * 100;
    const good = goodIfUp ? pct >= 0 : pct <= 0;
    return `<span class="${good ? 'up' : 'down'}">${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(1)}%</span> vs last month`;
  };
  $('#stBalanceSub').textContent = 'Opening balance + all income − expenses';
  $('#stIncomeSub').innerHTML = delta(t.income, p.income, true);
  $('#stExpenseSub').innerHTML = delta(t.expense, p.expense, false);
  $('#stSavingsSub').textContent = `Target: ${state.user.target}% · Saved ${money(Math.max(t.savings, 0))}`;

  const top = generateInsights()[0];
  $('#aiBannerText').textContent = top ? top.text : 'Add a few transactions and I will start analysing your habits.';

  drawBars($('#barChart'), lastMonths(6));
  renderDonut();
  renderRecent();
  renderMiniBudgets();
}

function renderRecent() {
  const list = [...state.transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);
  $('#recentList').innerHTML = list.length ? list.map((t) => {
    const c = catInfo(t.type, t.category);
    return `<div class="tx-item">
      <div class="tx-ic" style="background:${c.color}26">${c.icon}</div>
      <div class="tx-info"><b>${escapeHTML(t.description)}</b><small>${t.category} · ${prettyDate(t.date)}</small></div>
      <div class="tx-amt ${t.type === 'income' ? 'up' : 'down'}">${t.type === 'income' ? '+' : '−'}${money(t.amount)}</div>
    </div>`;
  }).join('') : '<div class="empty">No transactions yet. Click “＋ Expense” to begin.</div>';
}

function renderMiniBudgets() {
  const spent = Object.fromEntries(byCategory(curMonth()).map((c) => [c.name, c.value]));
  const items = Object.entries(state.budgets);
  $('#miniBudgets').innerHTML = items.length ? items.slice(0, 5).map(([cat, limit]) => {
    const used = spent[cat] || 0, pct = Math.min((used / limit) * 100, 100);
    return `<div class="mini-b"><div class="row"><span>${catInfo('expense', cat).icon} ${cat}</span><span>${money(used)} / ${money(limit)}</span></div>
      <div class="bar"><div style="width:${pct}%;background:${barColor(used / limit)}"></div></div></div>`;
  }).join('') : '<div class="empty">No budgets set. Go to Budgets to create one.</div>';
}
const barColor = (r) => (r >= 1 ? 'var(--red)' : r >= 0.8 ? 'var(--amber)' : 'var(--green)');

/* --- Donut --- */
function setupCanvas(c) {
  const r = c.getBoundingClientRect();
  const d = window.devicePixelRatio || 1;
  c.width = r.width * d; c.height = r.height * d;
  const ctx = c.getContext('2d');
  ctx.setTransform(d, 0, 0, d, 0, 0);
  return { ctx, w: r.width, h: r.height };
}
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

function renderDonut() {
  const data = byCategory(curMonth());
  const total = data.reduce((a, c) => a + c.value, 0);
  $('#donutTotal').textContent = money(total);
  $('#catLegend').innerHTML = data.slice(0, 8).map((c) =>
    `<div><i style="background:${catInfo('expense', c.name).color}"></i>${c.name}<b>${total ? Math.round((c.value / total) * 100) : 0}%</b></div>`).join('');
  const canvas = $('#donutChart');
  const { ctx, w, h } = setupCanvas(canvas);
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 8, r = R * 0.64;
  const start = performance.now();
  (function frame(now) {
    const p = Math.min((now - start) / 900, 1), e = 1 - Math.pow(1 - p, 3);
    ctx.clearRect(0, 0, w, h);
    if (!total) {
      ctx.beginPath(); ctx.arc(cx, cy, (R + r) / 2, 0, Math.PI * 2);
      ctx.lineWidth = R - r; ctx.strokeStyle = 'rgba(150,150,190,.2)'; ctx.stroke(); return;
    }
    let a = -Math.PI / 2;
    data.forEach((c) => {
      const ang = (c.value / total) * Math.PI * 2 * e;
      ctx.beginPath(); ctx.arc(cx, cy, (R + r) / 2, a, a + Math.max(ang - 0.03, 0));
      ctx.lineWidth = R - r; ctx.lineCap = 'butt'; ctx.strokeStyle = catInfo('expense', c.name).color; ctx.stroke();
      a += ang;
    });
    if (p < 1) requestAnimationFrame(frame);
  })(start);
}

/* --- Grouped bars --- */
function drawBars(canvas, months) {
  const { ctx, w, h } = setupCanvas(canvas);
  const pad = { l: 46, r: 10, t: 14, b: 28 };
  const max = Math.max(1, ...months.flatMap((m) => [m.income, m.expense])) * 1.12;
  const cw = w - pad.l - pad.r, ch = h - pad.t - pad.b;
  const start = performance.now();
  (function frame(now) {
    const e = 1 - Math.pow(1 - Math.min((now - start) / 900, 1), 3);
    ctx.clearRect(0, 0, w, h);
    ctx.font = '11px system-ui'; ctx.fillStyle = css('--muted'); ctx.strokeStyle = 'rgba(150,150,190,.18)'; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + (ch / 4) * i;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
      ctx.textAlign = 'right'; ctx.fillText(shortMoney(max - (max / 4) * i), pad.l - 8, y + 4);
    }
    const gw = cw / months.length, bw = Math.min(26, gw * 0.3);
    months.forEach((m, i) => {
      const x = pad.l + gw * i + gw / 2;
      [[m.income, css('--green'), -bw - 2], [m.expense, css('--red'), 2]].forEach(([v, col, off]) => {
        const bh = (v / max) * ch * e;
        ctx.fillStyle = col;
        roundRect(ctx, x + off, pad.t + ch - bh, bw, bh, 6); ctx.fill();
      });
      ctx.fillStyle = css('--muted'); ctx.textAlign = 'center'; ctx.fillText(m.label, x, h - 8);
    });
    if (e < 1) requestAnimationFrame(frame);
  })(start);
}
function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, Math.max(h, 0) / 2);
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, 0);
  ctx.arcTo(x, y + h, x, y, 0); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
const shortMoney = (n) => (n >= 100000 ? (n / 100000).toFixed(1) + 'L' : n >= 1000 ? (n / 1000).toFixed(0) + 'k' : Math.round(n));

/* --- Line chart (daily spend) --- */
function drawLine(canvas, values, labels) {
  const { ctx, w, h } = setupCanvas(canvas);
  const pad = { l: 46, r: 14, t: 16, b: 26 };
  const max = Math.max(1, ...values) * 1.15;
  const cw = w - pad.l - pad.r, ch = h - pad.t - pad.b;
  const pts = values.map((v, i) => [pad.l + (cw / Math.max(values.length - 1, 1)) * i, pad.t + ch - (v / max) * ch]);
  const start = performance.now();
  (function frame(now) {
    const e = 1 - Math.pow(1 - Math.min((now - start) / 1100, 1), 3);
    ctx.clearRect(0, 0, w, h);
    ctx.font = '11px system-ui'; ctx.strokeStyle = 'rgba(150,150,190,.18)'; ctx.fillStyle = css('--muted');
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + (ch / 4) * i;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
      ctx.textAlign = 'right'; ctx.fillText(shortMoney(max - (max / 4) * i), pad.l - 8, y + 4);
    }
    const n = Math.max(2, Math.floor(pts.length * e));
    const vis = pts.slice(0, n);
    const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + ch);
    grad.addColorStop(0, 'rgba(124,92,255,.45)'); grad.addColorStop(1, 'rgba(124,92,255,0)');
    ctx.beginPath(); vis.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.lineTo(vis[vis.length - 1][0], pad.t + ch); ctx.lineTo(vis[0][0], pad.t + ch); ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
    ctx.beginPath(); vis.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.strokeStyle = '#7c5cff'; ctx.stroke();
    ctx.fillStyle = css('--muted'); ctx.textAlign = 'center';
    [0, Math.floor(values.length / 2), values.length - 1].forEach((i) => ctx.fillText(labels[i], pts[i][0], h - 6));
    if (e < 1) requestAnimationFrame(frame);
  })(start);
}

/* --- Transactions table --- */
function populateFilters() {
  const cats = new Set([...Object.keys(CATEGORIES.expense), ...Object.keys(CATEGORIES.income)]);
  $('#fCat').innerHTML = '<option value="all">All categories</option>' + [...cats].map((c) => `<option>${c}</option>`).join('');
  const months = [...new Set(state.transactions.map((t) => monthKey(t.date)))].sort().reverse();
  const keep = $('#fMonth').value;
  $('#fMonth').innerHTML = '<option value="all">All time</option>' + months.map((m) => {
    const [y, mo] = m.split('-');
    return `<option value="${m}">${new Date(y, mo - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</option>`;
  }).join('');
  if (months.includes(keep)) $('#fMonth').value = keep;
}
function filteredTx() {
  const q = $('#fSearch').value.trim().toLowerCase(), ty = $('#fType').value, ca = $('#fCat').value, mo = $('#fMonth').value;
  return state.transactions.filter((t) =>
    (ty === 'all' || t.type === ty) && (ca === 'all' || t.category === ca) && (mo === 'all' || monthKey(t.date) === mo) &&
    (!q || t.description.toLowerCase().includes(q) || t.category.toLowerCase().includes(q)))
    .sort((a, b) => b.date.localeCompare(a.date));
}
function renderTransactions() {
  populateFilters();
  const list = filteredTx();
  $('#txBody').innerHTML = list.map((t) => {
    const c = catInfo(t.type, t.category);
    return `<tr>
      <td>${prettyDate(t.date)}</td>
      <td>${escapeHTML(t.description)} ${t.recurring ? '🔁' : ''}</td>
      <td>${c.icon} ${t.category}</td>
      <td><span class="pill ${t.type}">${t.type}</span></td>
      <td class="r ${t.type === 'income' ? 'up' : 'down'}"><b>${t.type === 'income' ? '+' : '−'}${money(t.amount)}</b></td>
      <td class="r"><button class="del" data-del="${t.id}" title="Delete">🗑</button></td></tr>`;
  }).join('');
  $('#txEmpty').hidden = list.length > 0;
  const inc = sum(list.filter((t) => t.type === 'income')), exp = sum(list.filter((t) => t.type === 'expense'));
  $('#txSummary').innerHTML = `<span>${list.length} records</span><span>Income: <b class="up">${money(inc)}</b></span><span>Expenses: <b class="down">${money(exp)}</b></span><span>Net: <b>${money(inc - exp)}</b></span>`;
}
function exportCSV() {
  const rows = [['Date', 'Description', 'Category', 'Type', 'Amount']].concat(
    filteredTx().map((t) => [t.date, `"${t.description.replace(/"/g, '""')}"`, t.category, t.type, t.amount]));
  const blob = new Blob([rows.map((r) => r.join(',')).join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'finmind-transactions.csv'; a.click();
  URL.revokeObjectURL(a.href);
  toast('CSV exported ✅');
}

/* ---------- 6. BUDGETS & GOALS ---------- */
function renderBudgets() {
  const spent = Object.fromEntries(byCategory(curMonth()).map((c) => [c.name, c.value]));
  const daysLeft = new Date(today().getFullYear(), today().getMonth() + 1, 0).getDate() - today().getDate();
  const entries = Object.entries(state.budgets);
  $('#budgetList').innerHTML = entries.length ? entries.map(([cat, limit]) => {
    const used = spent[cat] || 0, ratio = used / limit, left = limit - used;
    const status = ratio >= 1 ? '🚨 Over budget' : ratio >= 0.8 ? '⚠️ Almost there' : '✅ On track';
    return `<div class="b-card">
      <div class="b-top"><div class="tx-ic" style="background:${catInfo('expense', cat).color}26">${catInfo('expense', cat).icon}</div>
        <div><b>${cat}</b><small>${status}</small></div><button class="del" data-delb="${cat}">🗑</button></div>
      <div class="bar"><div data-w="${Math.min(ratio * 100, 100)}" style="background:${barColor(ratio)}"></div></div>
      <div class="b-foot"><span>${money(used)} of ${money(limit)}</span><span>${left >= 0 ? money(left) + ' left' : money(-left) + ' over'}</span></div>
      <div class="b-foot"><span>${daysLeft} days left</span><span>${left > 0 && daysLeft ? '≈ ' + money(left / daysLeft) + '/day' : ''}</span></div></div>`;
  }).join('') : '<div class="empty">No budgets yet — click “Set Budget”.</div>';
  requestAnimationFrame(() => $$('#budgetList .bar > div').forEach((b) => (b.style.width = b.dataset.w + '%')));
}

function renderGoals() {
  $('#goalList').innerHTML = state.goals.length ? state.goals.map((g) => {
    const pct = Math.min((g.saved / g.target) * 100, 100);
    const months = Math.max((new Date(g.date) - today()) / (1000 * 60 * 60 * 24 * 30), 0.5);
    const need = Math.max(g.target - g.saved, 0) / months;
    return `<div class="g-card">
      <div class="b-top"><span class="g-emoji">${escapeHTML(g.emoji || '🎯')}</span><div><b>${escapeHTML(g.name)}</b><small>By ${prettyDate(g.date)}</small></div><button class="del" data-delg="${g.id}">🗑</button></div>
      <div class="bar"><div data-w="${pct}" style="background:var(--grad)"></div></div>
      <div class="b-foot"><span>${money(g.saved)} / ${money(g.target)}</span><span>${pct.toFixed(0)}%</span></div>
      <div class="b-foot"><span>${pct >= 100 ? '🎉 Goal reached!' : 'Save ' + money(need) + '/month'}</span></div>
      <button class="btn ghost sm" data-fund="${g.id}">＋ Add funds</button></div>`;
  }).join('') : '<div class="empty">No goals yet — create your first one!</div>';
  requestAnimationFrame(() => $$('#goalList .bar > div').forEach((b) => (b.style.width = b.dataset.w + '%')));
}

/* ---------- 7. AI ENGINE ---------- */
function forecast() {
  const now = today(), day = now.getDate();
  const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const t = totals(curMonth());
  const projected = day ? (t.expense / day) * dim : 0;
  const avg = lastMonths(4).slice(0, 3).filter((m) => m.expense > 0);
  const histAvg = avg.length ? avg.reduce((a, m) => a + m.expense, 0) / avg.length : 0;
  const incomeRef = t.income || (totals(prevMonth()).income);
  return { projected, histAvg, day, dim, spent: t.expense, income: incomeRef, projSavings: incomeRef - projected };
}

function financialScore() {
  if (!state.transactions.length) return { score: 0, label: 'Add data to get your score' };
  const t = totals(curMonth()), ref = t.income ? t : totals(prevMonth());
  let score = 0;
  const target = Math.max(Number(state.user.target) || 20, 1);
  score += Math.max(0, Math.min(ref.rate / target, 1)) * 40;                      // savings rate vs target
  const bs = Object.entries(state.budgets);
  if (bs.length) {
    const sp = Object.fromEntries(byCategory(curMonth()).map((c) => [c.name, c.value]));
    const ok = bs.filter(([c, l]) => (sp[c] || 0) <= l).length;
    score += (ok / bs.length) * 30;                                                // budget adherence
  } else score += 12;
  if (state.goals.length) score += (state.goals.reduce((a, g) => a + Math.min(g.saved / g.target, 1), 0) / state.goals.length) * 15; else score += 5;
  const f = forecast();
  if (f.histAvg) score += Math.max(0, 15 - Math.max(0, (f.projected - f.histAvg) / f.histAvg) * 30);   // spending consistency
  else score += 8;
  score = Math.round(Math.max(0, Math.min(score, 100)));
  const label = score >= 80 ? 'Excellent — keep it up!' : score >= 60 ? 'Good, room to improve' : score >= 40 ? 'Needs attention' : 'Let’s fix this together';
  return { score, label };
}

function generateInsights() {
  const out = [];
  const t = totals(curMonth()), p = totals(prevMonth());
  const cats = byCategory(curMonth());
  const f = forecast();

  if (!state.transactions.length) return [{ type: 'info', icon: '👋', title: 'Welcome!', text: 'Add your first income or expense and I will start learning your habits.' }];

  // 1. Savings rate
  const target = Number(state.user.target) || 20;
  if (t.income > 0) {
    if (t.rate >= target) out.push({ type: 'good', icon: '🌱', title: 'Savings target on track', text: `You are saving ${t.rate.toFixed(1)}% of income this month — above your ${target}% target. Consider moving ${money(t.savings * 0.5)} into a goal or SIP.` });
    else out.push({ type: 'warn', icon: '📉', title: 'Savings below target', text: `Savings rate is ${Math.max(t.rate, 0).toFixed(1)}% vs your ${target}% target. You need to cut roughly ${money(t.income * (target / 100) - t.savings)} to reach it.` });
  }
  // 2. Top category
  if (cats[0]) {
    const share = (cats[0].value / (t.expense || 1)) * 100;
    out.push({ type: share > 40 ? 'warn' : 'info', icon: catInfo('expense', cats[0].name).icon, title: `Top spend: ${cats[0].name}`, text: `${cats[0].name} takes ${share.toFixed(0)}% of this month's spending (${money(cats[0].value)}). ${share > 40 ? 'That is concentrated — look for savings here first.' : 'Looks balanced.'}` });
  }
  // 3. Month-over-month category changes
  const prevCats = Object.fromEntries(byCategory(prevMonth()).map((c) => [c.name, c.value]));
  const jump = cats.map((c) => ({ ...c, prev: prevCats[c.name] || 0 })).filter((c) => c.prev > 500 && c.value > c.prev * 1.3).sort((a, b) => b.value - b.prev - (a.value - a.prev))[0];
  if (jump) out.push({ type: 'warn', icon: '📈', title: `${jump.name} spending jumped`, text: `${jump.name} is up ${(((jump.value - jump.prev) / jump.prev) * 100).toFixed(0)}% vs last month (${money(jump.prev)} → ${money(jump.value)}).` });
  // 4. Budget alerts
  Object.entries(state.budgets).forEach(([cat, limit]) => {
    const used = (cats.find((c) => c.name === cat) || {}).value || 0, r = used / limit;
    if (r >= 1) out.push({ type: 'bad', icon: '🚨', title: `${cat} budget exceeded`, text: `You spent ${money(used)} against a ${money(limit)} limit — ${money(used - limit)} over.` });
    else if (r >= 0.8) out.push({ type: 'warn', icon: '⚠️', title: `${cat} budget at ${Math.round(r * 100)}%`, text: `Only ${money(limit - used)} left for ${f.dim - f.day} more days.` });
  });
  // 5. Forecast
  if (f.day >= 3 && f.income) {
    out.push({ type: f.projSavings >= 0 ? 'info' : 'bad', icon: '🔮', title: 'Month-end forecast', text: `At this pace you will spend about ${money(f.projected)} this month${f.histAvg ? ` (your usual is ~${money(f.histAvg)})` : ''}, leaving ${money(f.projSavings)}.` });
  }
  // 6. Anomaly detection (unusually large expense vs category average)
  const all = txOf('expense');
  const anomaly = txOf('expense', curMonth()).map((tx) => {
    const same = all.filter((x) => x.category === tx.category && x.id !== tx.id);
    const avg = same.length ? sum(same) / same.length : 0;
    return { tx, avg };
  }).filter((a) => a.avg && a.tx.amount > a.avg * 2.5 && a.tx.amount > 1500).sort((a, b) => b.tx.amount - a.tx.amount)[0];
  if (anomaly) out.push({ type: 'warn', icon: '🔍', title: 'Unusual expense detected', text: `“${anomaly.tx.description}” (${money(anomaly.tx.amount)}) is ${(anomaly.tx.amount / anomaly.avg).toFixed(1)}× your typical ${anomaly.tx.category} transaction.` });
  // 7. Subscriptions
  const subs = state.transactions.filter((x) => x.recurring && x.type === 'expense' && monthKey(x.date) === curMonth() && x.category !== 'Rent');
  if (subs.length) out.push({ type: 'info', icon: '🔁', title: 'Recurring charges', text: `${subs.length} recurring payments total ${money(sum(subs))}/month (${subs.map((s) => s.description).slice(0, 3).join(', ')}). Cancel anything you don't use.` });
  // 8. Income trend
  if (p.income && t.income && Math.abs(t.income - p.income) / p.income > 0.1)
    out.push({ type: t.income > p.income ? 'good' : 'warn', icon: '💼', title: 'Income changed', text: `Income is ${t.income > p.income ? 'up' : 'down'} ${(Math.abs((t.income - p.income) / p.income) * 100).toFixed(0)}% from last month.` });
  // 9. Weekend vs weekday
  const we = txOf('expense', curMonth()).filter((x) => [0, 6].includes(new Date(x.date + 'T00:00:00').getDay()));
  if (we.length >= 3 && t.expense && sum(we) / t.expense > 0.4)
    out.push({ type: 'info', icon: '🎉', title: 'Weekend spender', text: `${Math.round((sum(we) / t.expense) * 100)}% of your spending happens on weekends. Setting a weekend cap could trim your bill.` });
  // 10. Goals
  const lag = state.goals.find((g) => g.saved / g.target < 0.3);
  if (lag) out.push({ type: 'info', icon: lag.emoji || '🎯', title: `Goal: ${lag.name}`, text: `Only ${Math.round((lag.saved / lag.target) * 100)}% funded. A small automatic transfer each payday keeps it moving.` });

  return out;
}

function renderInsights() {
  const list = generateInsights();
  $('#insightList').innerHTML = list.map((i, n) => `<div class="insight ${i.type}" style="animation-delay:${n * 0.06}s"><h4>${i.icon} ${i.title}</h4><p>${i.text}</p></div>`).join('');
  // line chart: last 30 days
  const vals = [], labels = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today().getFullYear(), today().getMonth(), today().getDate() - i), iso = toISO(d);
    vals.push(sum(state.transactions.filter((t) => t.type === 'expense' && t.date === iso)));
    labels.push(d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }));
  }
  drawLine($('#lineChart'), vals, labels);
  // forecast box
  const f = forecast(), pct = f.income ? Math.min((f.projected / f.income) * 100, 100) : 0;
  $('#forecastBox').innerHTML = `<small class="muted">Projected spend by month end</small>
    <div class="big grad">${money(f.projected)}</div>
    <div class="bar"><div style="width:${pct}%;background:${f.projSavings >= 0 ? 'var(--grad)' : 'var(--red)'}"></div></div>
    <p>Spent so far: <b>${money(f.spent)}</b> (day ${f.day} of ${f.dim})<br/>
    Expected income: <b>${money(f.income)}</b><br/>
    Projected savings: <b class="${f.projSavings >= 0 ? 'up' : 'down'}">${money(f.projSavings)}</b></p>`;
}

function renderSideScore() {
  const { score, label } = financialScore();
  $('#sideScore').textContent = score;
  $('#sideScoreText').textContent = label;
  const ring = $('#sideRing');
  ring.style.strokeDashoffset = 314 - (314 * score) / 100;
  ring.style.stroke = score >= 70 ? 'var(--green)' : score >= 45 ? 'var(--amber)' : 'var(--red)';
}

/* ---------- 8. CHAT ASSISTANT ---------- */
function botSay(text, delay = 650) {
  const box = $('#chatBox');
  const typing = document.createElement('div');
  typing.className = 'msg bot typing'; typing.innerHTML = '<span></span><span></span><span></span>';
  box.appendChild(typing); box.scrollTop = box.scrollHeight;
  setTimeout(() => {
    typing.className = 'msg bot'; typing.textContent = text; box.scrollTop = box.scrollHeight;
  }, delay);
}
function userSay(text) {
  const m = document.createElement('div'); m.className = 'msg user'; m.textContent = text;
  $('#chatBox').appendChild(m); $('#chatBox').scrollTop = 1e6;
}
function findCategory(q) {
  const all = new Set([...Object.keys(CATEGORIES.expense), ...Object.keys(CATEGORIES.income)]);
  const alias = { food: 'Food', eat: 'Food', grocer: 'Food', rent: 'Rent', transport: 'Transport', cab: 'Transport', uber: 'Transport', shop: 'Shopping', bill: 'Bills', movie: 'Entertainment', entertain: 'Entertainment', health: 'Health', medic: 'Health', educat: 'Education', course: 'Education', salary: 'Salary', freelance: 'Freelance' };
  for (const c of all) if (q.includes(c.toLowerCase())) return c;
  for (const [k, v] of Object.entries(alias)) if (q.includes(k)) return v;
  return null;
}
function answer(raw) {
  const q = raw.toLowerCase().trim();
  const t = totals(curMonth());
  const cats = byCategory(curMonth());

  // add transaction by chat:  add 250 food lunch  |  add income 5000 freelance logo
  const m = q.match(/^add\s+(income\s+)?(\d+(?:\.\d+)?)\s*(\w+)?\s*(.*)$/);
  if (m) {
    const type = m[1] ? 'income' : 'expense';
    const amount = parseFloat(m[2]);
    const cat = (m[3] && findCategory(m[3])) || (type === 'income' ? 'Other' : 'Other');
    const desc = (m[4] || '').trim() || (m[3] && !findCategory(m[3]) ? m[3] : cat);
    const isCatInType = CATEGORIES[type][cat] ? cat : 'Other';
    state.transactions.push({ id: uid(), date: toISO(today()), type, category: isCatInType, description: desc.charAt(0).toUpperCase() + desc.slice(1), amount, recurring: false });
    save(); rerender();
    return `Done ✅ Added ${type} of ${money(amount)} under ${isCatInType}.`;
  }
  if (/balance|how much (money )?do i have/.test(q)) return `Your total balance is ${money(balance())}. This month: ${money(t.income)} in, ${money(t.expense)} out.`;
  if (/forecast|predict|month.?end|project/.test(q)) { const f = forecast(); return `At your current pace you'll spend ~${money(f.projected)} by month end, leaving about ${money(f.projSavings)} in savings.`; }
  if (/biggest|largest|highest|top expense/.test(q)) {
    const big = txOf('expense', curMonth()).sort((a, b) => b.amount - a.amount)[0];
    return big ? `Your biggest expense this month is “${big.description}” — ${money(big.amount)} (${big.category}).` : 'No expenses recorded this month yet.';
  }
  if (/budget/.test(q)) {
    const over = Object.entries(state.budgets).filter(([c, l]) => ((cats.find((x) => x.name === c) || {}).value || 0) > l).map(([c]) => c);
    return Object.keys(state.budgets).length ? (over.length ? `You're over budget in: ${over.join(', ')}. Review the Budgets tab.` : 'All your budgets are on track. 👏') : 'You have no budgets yet. Open the Budgets tab to create one.';
  }
  if (/score|health/.test(q)) { const s = financialScore(); return `Your financial health score is ${s.score}/100 — ${s.label}`; }
  if (/tip|advice|save|saving|suggest/.test(q)) {
    const tips = [
      'Follow the 50/30/20 rule: 50% needs, 30% wants, 20% savings.',
      'Automate savings on payday — what you never see, you never spend.',
      'Wait 24 hours before any non-essential purchase above ₹2,000.',
      cats[0] ? `Your biggest category is ${cats[0].name}. Trimming just 10% there saves ${money(cats[0].value * 0.1)} a month.` : 'Track every expense for 30 days to find your hidden leaks.',
      'Review subscriptions every quarter and cancel what you don’t use.',
    ];
    return tips[Math.floor(Math.random() * tips.length)];
  }
  if (/income|earn/.test(q)) return `You earned ${money(t.income)} this month. Last month: ${money(totals(prevMonth()).income)}.`;
  if (/spen|expense|how much/.test(q)) {
    const c = findCategory(q);
    if (c) { const v = (cats.find((x) => x.name === c) || {}).value || 0; return `You've spent ${money(v)} on ${c} this month.`; }
    return `Total spending this month: ${money(t.expense)}. Top categories: ${cats.slice(0, 3).map((c) => `${c.name} (${money(c.value)})`).join(', ') || 'none yet'}.`;
  }
  if (/hello|hi\b|hey/.test(q)) return `Hi${state.user.name ? ' ' + state.user.name : ''}! 👋 Ask about your balance, spending, budgets, forecast — or add a transaction like “add 300 food dinner”.`;
  return 'I can help with: balance, spending by category, budgets, forecast, biggest expense, savings tips, or adding transactions (e.g. “add 250 food lunch”, “add income 5000 freelance”).';
}
function initChat() {
  $('#chatForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = $('#chatInput').value.trim(); if (!v) return;
    userSay(v); $('#chatInput').value = ''; botSay(answer(v));
  });
  $$('#chatSuggest button').forEach((b) => b.addEventListener('click', () => { userSay(b.textContent); botSay(answer(b.textContent)); }));
}

/* ---------- 9. MODALS & FORMS ---------- */
let txType = 'expense', fundId = null;
const openModal = (id) => { $('#' + id).hidden = false; };
const closeModals = () => $$('.modal').forEach((m) => (m.hidden = true));

function fillCategorySelect(sel, type) {
  sel.innerHTML = Object.keys(CATEGORIES[type]).map((c) => `<option>${c}</option>`).join('');
}
function openTx(type = 'expense') {
  setTxType(type);
  $('#txForm').reset(); $('#txDate').value = toISO(today());
  $('#txModalTitle').textContent = type === 'income' ? 'Add Income' : 'Add Expense';
  openModal('txModal'); setTimeout(() => $('#txAmount').focus(), 60);
}
function setTxType(type) {
  txType = type;
  $$('#typeSeg button').forEach((b) => b.classList.toggle('active', b.dataset.type === type));
  fillCategorySelect($('#txCat'), type);
  $('#txModalTitle').textContent = type === 'income' ? 'Add Income' : 'Add Expense';
}

function bindEvents() {
  // nav
  $$('.nav-btn').forEach((b) => b.addEventListener('click', () => go(b.dataset.view)));
  document.addEventListener('click', (e) => {
    const g = e.target.closest('[data-goto]'); if (g) go(g.dataset.goto);
    const d = e.target.closest('[data-del]'); if (d && confirm('Delete this transaction?')) { state.transactions = state.transactions.filter((t) => t.id !== d.dataset.del); save(); rerender(); toast('Transaction deleted'); }
    const db = e.target.closest('[data-delb]'); if (db) { delete state.budgets[db.dataset.delb]; save(); rerender(); toast('Budget removed'); }
    const dg = e.target.closest('[data-delg]'); if (dg && confirm('Delete this goal?')) { state.goals = state.goals.filter((x) => x.id !== dg.dataset.delg); save(); rerender(); }
    const f = e.target.closest('[data-fund]'); if (f) { fundId = f.dataset.fund; $('#fundTitle').textContent = 'Add to “' + state.goals.find((x) => x.id === fundId).name + '”'; $('#fundForm').reset(); openModal('fundModal'); }
    if (e.target.closest('[data-close]') || (e.target.classList.contains('modal') && e.target.id !== 'authModal')) closeModals();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') $$('.modal').forEach((m) => { if (m.id !== 'authModal') m.hidden = true; });
  });

  // top buttons
  $('#addExpenseTop').onclick = () => openTx('expense');
  $('#addIncomeTop').onclick = () => openTx('income');
  $('#addTxBtn').onclick = () => openTx('expense');
  $$('#typeSeg button').forEach((b) => (b.onclick = () => setTxType(b.dataset.type)));

  // transaction form
  $('#txForm').addEventListener('submit', (e) => {
    e.preventDefault();
    state.transactions.push({ id: uid(), type: txType, amount: parseFloat($('#txAmount').value), description: $('#txDesc').value.trim(), category: $('#txCat').value, date: $('#txDate').value, recurring: $('#txRecurring').checked });
    save(); closeModals(); rerender(); toast(txType === 'income' ? 'Income added 💰' : 'Expense added 🧾');
    const b = state.budgets[$('#txCat').value];
    if (txType === 'expense' && b) {
      const used = (byCategory(curMonth()).find((c) => c.name === $('#txCat').value) || {}).value || 0;
      if (used > b) setTimeout(() => toast(`⚠️ ${$('#txCat').value} budget exceeded!`), 2800);
    }
  });

  // budgets
  $('#addBudgetBtn').onclick = () => { fillCategorySelect($('#bCat'), 'expense'); $('#budgetForm').reset(); openModal('budgetModal'); };
  $('#budgetForm').addEventListener('submit', (e) => { e.preventDefault(); state.budgets[$('#bCat').value] = parseFloat($('#bLimit').value); save(); closeModals(); rerender(); toast('Budget saved 🎯'); });

  // goals
  $('#addGoalBtn').onclick = () => { $('#goalForm').reset(); $('#gDate').value = toISO(new Date(today().getFullYear() + 1, today().getMonth(), today().getDate())); openModal('goalModal'); };
  $('#goalForm').addEventListener('submit', (e) => {
    e.preventDefault();
    state.goals.push({ id: uid(), name: $('#gName').value.trim(), emoji: $('#gEmoji').value || '🎯', target: parseFloat($('#gTarget').value), saved: parseFloat($('#gSaved').value) || 0, date: $('#gDate').value });
    save(); closeModals(); rerender(); toast('Goal created 🏆');
  });
  $('#fundForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const g = state.goals.find((x) => x.id === fundId); g.saved += parseFloat($('#fundAmount').value);
    save(); closeModals(); rerender(); toast(g.saved >= g.target ? '🎉 Goal completed!' : 'Funds added 💸');
  });

  // filters
  ['fSearch', 'fType', 'fCat', 'fMonth'].forEach((id) => $('#' + id).addEventListener('input', renderTransactions));
  $('#exportBtn').onclick = exportCSV;
  $('#refreshInsights').onclick = () => { renderInsights(); toast('Re-analysed ✨'); };

  // theme
  $('#themeBtn').onclick = () => { state.theme = state.theme === 'dark' ? 'light' : 'dark'; applyTheme(); save(); rerender(); };

  // settings
  $('#saveSettings').onclick = () => {
    state.user.name = $('#setName').value.trim();
    state.user.opening = parseFloat($('#setOpening').value) || 0;
    state.user.target = Math.min(Math.max(parseFloat($('#setTarget').value) || 20, 0), 90);
    save(); rerender(); toast('Settings saved ✅');
  };
  $('#loadDemo').onclick = () => { if (confirm('Replace current data with demo data?')) { seedDemo(); rerender(); toast('Demo data loaded'); } };
  $('#resetAll').onclick = () => {
    if (confirm('This permanently removes all transactions, budgets, goals, and your opening balance for this account. Continue?')) {
      const keepName = state.user.name || '';
      const keepTheme = state.theme;
      state = blankState();
      state.user.name = keepName;
      state.theme = keepTheme;
      applyTheme();
      save();
      renderView('dashboard');
      renderSettings();
      toast('All financial data cleared. You can now add new data.');
    }
  };

  // Local demo login / logout
  $('#authForm').addEventListener('submit', handleAuthSubmit);
  $('#authToggle').onclick = () => setAuthMode($('#authForm').dataset.mode === 'create' ? 'login' : 'create');
  $('#authBtn').onclick = () => {
    if (currentEmail) {
      if (confirm('Sign out of FinMind? Your saved data will remain in this browser.')) logout();
    } else openAuthModal('login');
  };

  // redraw charts on resize
  let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(rerender, 200); });
}

function renderSettings() {
  $('#setName').value = state.user.name || '';
  $('#setOpening').value = state.user.opening || '';
  $('#setTarget').value = state.user.target || 20;
}
function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
  $('#themeBtn').textContent = state.theme === 'dark' ? '🌙' : '☀️';
}

/* ---------- 10. INIT ---------- */
document.addEventListener('DOMContentLoaded', () => {
  // The previous version automatically inserted sample transactions. Remove that
  // old shared dataset once so this updated version starts with a clean account.
  localStorage.removeItem(LEGACY_KEY);
  applyTheme();
  bindEvents();
  initChat();
  updateAuthButton();

  const savedEmail = localStorage.getItem(SESSION_KEY);
  const account = getAccounts().find((a) => a.email === savedEmail);
  if (savedEmail && account) {
    activateAccount(savedEmail, false);
  } else {
    localStorage.removeItem(SESSION_KEY);
    state = blankState();
    renderView('dashboard');
    openAuthModal(getAccounts().length ? 'login' : 'create');
  }
});
