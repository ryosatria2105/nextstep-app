'use strict';

const THEME_KEY = 'nextstep_theme';

function getStoredTheme() {
  return localStorage.getItem(THEME_KEY) || 'dark';
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

// Prevent flash of wrong theme on load
(function initTheme() {
  // Apply immediately — before DOM is fully painted
  const theme = getStoredTheme();
  document.documentElement.setAttribute('data-theme', theme);
})();

// ── STATE ──────────────────────────────────────────────────

/** @type {Array<{id:string,name:string,provider:string,start:string,end:string,link:string,completed:boolean}>} */
let programs = [];
let filter = 'all';
let pendingDeleteId = null;

const STORAGE_KEY = 'ryo_scheduler_v1';

// ── PERSISTENCE ────────────────────────────────────────────

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(programs));
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) programs = JSON.parse(raw);
  } catch {
    programs = [];
  }
}

// ── HELPERS ────────────────────────────────────────────────

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function fmtDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${parseInt(d)} ${months[+m - 1]} ${y}`;
}

function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':');
  const hour = parseInt(h);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

function daysLeft(endIso) {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const end = new Date(endIso); end.setHours(0, 0, 0, 0);
  return Math.round((end - now) / 86_400_000);
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function sorted() {
  return [...programs].sort((a, b) => new Date(a.end) - new Date(b.end));
}

function visible() {
  return sorted().filter(p => {
    if (filter === 'active') return !p.completed;
    if (filter === 'completed') return p.completed;
    return true;
  });
}

// ── DOM REFS ───────────────────────────────────────────────

const $ = id => document.getElementById(id);
const cardList = $('cardList');
const emptyState = $('emptyState');
const totalNum = $('totalNum');
const doneNum = $('doneNum');
const progressFill = $('progressFill');
const progressPct = $('progressPct');

// ── RENDER ─────────────────────────────────────────────────

function render() {
  // Stats
  const done = programs.filter(p => p.completed).length;
  const total = programs.length;
  totalNum.textContent = total;
  doneNum.textContent = done;
  const pct = total ? Math.round((done / total) * 100) : 0;
  progressFill.style.width = pct + '%';
  progressPct.textContent = pct + '%';

  const items = visible();
  cardList.innerHTML = '';

  if (items.length === 0) {
    emptyState.hidden = false;
    return;
  }
  emptyState.hidden = true;

  items.forEach((p, i) => {
    const el = buildCard(p);
    el.style.animationDelay = (i * 40) + 'ms';
    cardList.appendChild(el);
  });
}

function buildCard(p) {
  const days = daysLeft(p.end);
  const isOverdue = !p.completed && days < 0;
  const isUrgent = !p.completed && days >= 0 && days <= 7;

  // Classes
  let cardClass = 'card';
  if (p.completed) cardClass += ' done';
  else if (isOverdue) cardClass += ' overdue';
  else if (isUrgent) cardClass += ' urgent';

  // Badge
  let badgeClass, badgeText;
  if (p.completed) {
    badgeClass = 'card-badge badge-done';
    badgeText = '✓ Done';
  } else if (isOverdue) {
    badgeClass = 'card-badge badge-overdue';
    badgeText = 'Overdue';
  } else if (isUrgent) {
    badgeClass = 'card-badge badge-urgent';
    badgeText = days === 0 ? 'Today' : `${days}d left`;
  } else {
    badgeClass = 'card-badge badge-normal';
    badgeText = `${days}d left`;
  }

  const card = document.createElement('article');
  card.className = cardClass;
  card.dataset.id = p.id;

  card.innerHTML = `
    <div class="card-top">
      <input type="checkbox" class="card-check" ${p.completed ? 'checked' : ''} aria-label="Mark complete" />
      <div class="card-info">
        <div class="card-name" title="${esc(p.name)}">${esc(p.name)}</div>
        <div class="card-provider">${esc(p.provider)}</div>
      </div>
      <span class="${badgeClass}">${badgeText}</span>
    </div>

    <div class="card-dates">
      <div class="date-item">
        <span class="date-lbl">Start</span>
        <span class="date-val">${fmtDate(p.start)}${p.startTime ? ' · ' + fmtTime(p.startTime) : ''}</span>
      </div>
      <div class="date-item">
        <span class="date-lbl">End</span>
        <span class="date-val">${fmtDate(p.end)}${p.endTime ? ' · ' + fmtTime(p.endTime) : ''}</span>
      </div>
    </div>

    <div class="card-actions">
      <button class="card-btn card-btn-edit" data-action="edit">
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <path d="M9.5 1.5l2 2-7 7H2.5v-2l7-7z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
        </svg>
        Edit
      </button>
      <button class="card-btn card-btn-del" data-action="delete">
        <svg width="12" height="13" viewBox="0 0 12 13" fill="none">
          <path d="M1 3h10M4 3V2h4v1M2 3l.8 8.4A1 1 0 0 0 3.8 12h4.4a1 1 0 0 0 1-.6L10 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Delete
      </button>
      ${p.link ? `
      <a href="${esc(p.link)}" target="_blank" rel="noopener noreferrer" class="card-btn card-btn-link">
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <path d="M5.5 2H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V7.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
          <path d="M8 1h4v4M12 1L6.5 6.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Open
      </a>` : ''}
    </div>
  `;

  card.querySelector('.card-check').addEventListener('change', e => {
    toggle(p.id, e.target.checked);
  });
  card.querySelector('[data-action="edit"]').addEventListener('click', () => openEdit(p.id));
  card.querySelector('[data-action="delete"]').addEventListener('click', () => askDelete(p.id));

  return card;
}

// ── CRUD ───────────────────────────────────────────────────

function addProgram(data) {
  programs.push({ id: uid(), completed: false, ...data });
  save(); render();
}

function editProgram(id, data) {
  const p = programs.find(p => p.id === id);
  if (!p) return;
  Object.assign(p, data);
  save(); render();
}

function removeProgram(id) {
  const card = cardList.querySelector(`[data-id="${id}"]`);
  if (card) {
    card.classList.add('removing');
    card.addEventListener('animationend', () => {
      programs = programs.filter(p => p.id !== id);
      save(); render();
    }, { once: true });
  } else {
    programs = programs.filter(p => p.id !== id);
    save(); render();
  }
}

function toggle(id, value) {
  const p = programs.find(p => p.id === id);
  if (!p) return;
  p.completed = value;
  save();

  // Update stats without full re-render
  const done = programs.filter(x => x.completed).length;
  const total = programs.length;
  doneNum.textContent = done;
  const pct = total ? Math.round((done / total) * 100) : 0;
  progressFill.style.width = pct + '%';
  progressPct.textContent = pct + '%';

  // Update the specific card DOM in-place (no flash)
  const card = cardList.querySelector(`[data-id="${id}"]`);
  if (!card) { render(); return; }

  const days = daysLeft(p.end);
  const isOverdue = !p.completed && days < 0;
  const isUrgent = !p.completed && days >= 0 && days <= 7;
  const badge = card.querySelector('.card-badge');
  const nameEl = card.querySelector('.card-name');

  // Toggle card state classes
  card.classList.toggle('done', p.completed);
  card.classList.toggle('overdue', isOverdue);
  card.classList.toggle('urgent', isUrgent);

  // Update badge
  if (p.completed) {
    badge.className = 'card-badge badge-done';
    badge.textContent = '✓ Done';
  } else if (isOverdue) {
    badge.className = 'card-badge badge-overdue';
    badge.textContent = 'Overdue';
  } else if (isUrgent) {
    badge.className = 'card-badge badge-urgent';
    badge.textContent = days === 0 ? 'Today' : `${days}d left`;
  } else {
    badge.className = 'card-badge badge-normal';
    badge.textContent = `${days}d left`;
  }
}

// ── FORM ───────────────────────────────────────────────────

const toggleFormBtn = $('toggleFormBtn');
const formPanel = $('formPanel');
const addBtnText = $('addBtnText');
const formTitle = $('formTitle');
const programForm = $('programForm');
const submitBtn = $('submitBtn');
const cancelBtn = $('cancelBtn');
const formCloseBtn = $('formCloseBtn');
const editIdField = $('editId');

function openForm(isEdit) {
  formPanel.classList.add('open');
  formPanel.removeAttribute('aria-hidden');
  toggleFormBtn.setAttribute('aria-expanded', 'true');
  addBtnText.textContent = isEdit ? 'Editing...' : 'Close Form';
  formTitle.textContent = isEdit ? 'Edit Program' : 'New Program';
  submitBtn.textContent = isEdit ? 'Update' : 'Save';
  $('fieldName').focus();
}

function closeForm() {
  formPanel.classList.remove('open');
  formPanel.setAttribute('aria-hidden', 'true');
  toggleFormBtn.setAttribute('aria-expanded', 'false');
  addBtnText.textContent = 'Add Program';
  resetForm();
}

function resetForm() {
  programForm.reset();
  editIdField.value = '';
  clearErrors();
}

function openEdit(id) {
  const p = programs.find(p => p.id === id);
  if (!p) return;
  editIdField.value = id;
  $('fieldName').value = p.name;
  $('fieldProvider').value = p.provider;
  $('fieldStart').value = p.start;
  $('fieldStartTime').value = p.startTime || '';
  $('fieldEnd').value = p.end;
  $('fieldEndTime').value = p.endTime || '';
  $('fieldLink').value = p.link || '';
  openForm(true);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Validation
function validate() {
  clearErrors();
  let ok = true;

  const required = [
    ['fieldName', 'errName', 'Program name is required'],
    ['fieldProvider', 'errProvider', 'Provider is required'],
    ['fieldStart', 'errStart', 'Start date is required'],
    ['fieldEnd', 'errEnd', 'End date is required'],
  ];
  required.forEach(([fid, eid, msg]) => {
    if (!$(fid).value.trim()) {
      $(fid).classList.add('err');
      const el = $(eid); el.textContent = msg; el.classList.add('show');
      ok = false;
    }
  });
  if ($('fieldStart').value && $('fieldEnd').value) {
    if ($('fieldStart').value > $('fieldEnd').value) {
      $('fieldEnd').classList.add('err');
      const el = $('errEnd'); el.textContent = 'End date must be after start'; el.classList.add('show');
      ok = false;
    }
  }
  return ok;
}

function clearErrors() {
  ['fieldName', 'fieldProvider', 'fieldStart', 'fieldEnd'].forEach(id => $(id).classList.remove('err'));
  ['errName', 'errProvider', 'errStart', 'errEnd'].forEach(id => {
    const el = $(id); el.textContent = ''; el.classList.remove('show');
  });
}

function formData() {
  return {
    name: $('fieldName').value.trim(),
    provider: $('fieldProvider').value.trim(),
    start: $('fieldStart').value,
    startTime: $('fieldStartTime').value,
    end: $('fieldEnd').value,
    endTime: $('fieldEndTime').value,
    link: $('fieldLink').value.trim(),
  };
}

// Form events
toggleFormBtn.addEventListener('click', () => {
  formPanel.classList.contains('open') ? closeForm() : openForm(false);
});
[cancelBtn, formCloseBtn].forEach(btn =>
  btn.addEventListener('click', closeForm)
);
programForm.addEventListener('submit', e => {
  e.preventDefault();
  if (!validate()) return;
  const id = editIdField.value;
  id ? editProgram(id, formData()) : addProgram(formData());
  closeForm();
});

// ── FILTERS ────────────────────────────────────────────────

document.querySelectorAll('.chip').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.chip').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    filter = btn.dataset.filter;
    render();
  });
});

// ── DELETE MODAL ───────────────────────────────────────────

const overlay = $('modalOverlay');
const confirmDeleteBtn = $('confirmDeleteBtn');
const cancelDeleteBtn = $('cancelDeleteBtn');

function askDelete(id) {
  pendingDeleteId = id;
  overlay.hidden = false;
}
function closeModal() {
  overlay.hidden = true;
  pendingDeleteId = null;
}

confirmDeleteBtn.addEventListener('click', () => {
  if (pendingDeleteId) removeProgram(pendingDeleteId);
  closeModal();
});
cancelDeleteBtn.addEventListener('click', closeModal);
overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (!resetOverlay.hidden) { closeResetModal(); return; }
  if (!overlay.hidden) { closeModal(); return; }
  if (formPanel.classList.contains('open')) closeForm();
});

// ── THEME TOGGLE EVENT ──────────────────────────────────────

document.getElementById('themeToggle').addEventListener('click', toggleTheme);

// ── RESET ALL DATA ─────────────────────────────────────────

const resetOverlay = $('resetModalOverlay');
const confirmResetBtn = $('confirmResetBtn');
const cancelResetBtn = $('cancelResetBtn');
const resetBtn = $('resetBtn');

function openResetModal() { resetOverlay.hidden = false; }
function closeResetModal() { resetOverlay.hidden = true; }

resetBtn.addEventListener('click', openResetModal);
confirmResetBtn.addEventListener('click', () => {
  programs = [];
  save();
  render();
  closeResetModal();
});
cancelResetBtn.addEventListener('click', closeResetModal);
resetOverlay.addEventListener('click', e => { if (e.target === resetOverlay) closeResetModal(); });

// ── INIT ───────────────────────────────────────────────────

(function init() {
  load();
  render();
})();
