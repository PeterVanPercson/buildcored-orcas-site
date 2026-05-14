/* ═══════════════════════════════════════════════════════════════════════════
   Project DB — fetch projects.json, render gallery, run admin (#admin).
   Local edits live in localStorage; Export downloads a fresh projects.json
   plus any newly-uploaded image files for the admin to commit to /uploads/.
   ═══════════════════════════════════════════════════════════════════════════ */

(() => {
  const LS_KEY = 'bc-projects-overrides-v1';
  const LS_IMG_KEY = 'bc-projects-new-images-v1';

  /** @type {{version:number,updatedAt:string,projects:any[]}} */
  let dbBase = null;     // canonical projects.json content from server
  let db = null;         // merged: server + localStorage overrides
  let overrides = {};    // { [id]: partial project }
  let newImages = {};    // { [filename]: dataURL } — uploaded but not yet committed
  let activeFilter = 'all';
  let editingId = null;

  // ─────────────────────────────────────────────────────────────────────────
  // Storage helpers
  // ─────────────────────────────────────────────────────────────────────────
  function loadLocal() {
    try { overrides = JSON.parse(localStorage.getItem(LS_KEY) || '{}'); }
    catch { overrides = {}; }
    try { newImages = JSON.parse(localStorage.getItem(LS_IMG_KEY) || '{}'); }
    catch { newImages = {}; }
  }
  function saveLocal() {
    localStorage.setItem(LS_KEY, JSON.stringify(overrides));
    localStorage.setItem(LS_IMG_KEY, JSON.stringify(newImages));
  }

  function merge() {
    db = {
      version: dbBase.version,
      updatedAt: dbBase.updatedAt,
      projects: dbBase.projects.map(p => ({ ...p, ...(overrides[p.id] || {}) })),
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Load
  // ─────────────────────────────────────────────────────────────────────────
  async function load() {
    const r = await fetch('projects.json?t=' + Date.now(), { cache: 'no-cache' });
    if (!r.ok) throw new Error('projects.json missing');
    dbBase = await r.json();
    loadLocal();
    merge();
    renderGallery();
    updateShippedCount();
    if (location.hash === '#admin') openAdmin();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Gallery
  // ─────────────────────────────────────────────────────────────────────────
  function resolveImage(project) {
    if (!project.image) return '';
    // If admin uploaded a new image this session, prefer the data URL preview.
    if (newImages[project.image]) return newImages[project.image];
    return 'uploads/' + project.image;
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c]);
  }

  function diffLabel(d) {
    return d ? d[0].toUpperCase() + d.slice(1) : '';
  }

  function tagPills(tags, max = 4) {
    if (!Array.isArray(tags) || tags.length === 0) return '';
    const shown = tags.slice(0, max);
    const extra = tags.length - shown.length;
    return `
      <div class="pcard-tags">
        ${shown.map(t => `<span class="pcard-tag">${escapeHtml(t)}</span>`).join('')}
        ${extra > 0 ? `<span class="pcard-tag pcard-tag-extra">+${extra}</span>` : ''}
      </div>
    `;
  }

  function createCard(p) {
    const isShipped = !!p.shipped;
    const img = resolveImage(p);
    const card = document.createElement('article');
    const classes = ['project-card-db', 'reveal', 'in'];
    classes.push(isShipped ? 'is-shipped' : 'is-pending');
    if (p.featured) classes.push('is-featured');
    if (p.winner) classes.push('is-winner');
    card.className = classes.join(' ');
    card.dataset.week = String(p.week);
    card.dataset.id = p.id;
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `${p.title} — Day ${p.day}${p.winner ? ' (Day winner)' : ''}`);
    card.innerHTML = `
      <div class="pcard-media">
        ${img
          ? `<img src="${escapeHtml(img)}" alt="" loading="lazy" />`
          : `<div class="pcard-media-empty" aria-hidden="true">
               <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                 <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.2"/>
                 <path d="M3 16l5-4 4 3 3-2 6 5" stroke="currentColor" stroke-width="1.2" fill="none"/>
                 <circle cx="9" cy="10" r="1.5" stroke="currentColor" stroke-width="1.2"/>
               </svg>
             </div>`}
        ${p.featured
          ? `<span class="pcard-featured" aria-label="Featured"><svg width="11" height="11" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true"><path d="M7 .5l1.94 4.13 4.56.6-3.36 3.13.85 4.49L7 10.65 2.99 12.85l.85-4.49L.5 5.23l4.56-.6L7 .5z"/></svg> Featured</span>`
          : `<span class="pcard-day">D·${String(p.day).padStart(2, '0')}</span>`}
        ${isShipped
          ? (p.winner ? `<span class="pcard-ship pcard-ship-winner">🏆 Day ${p.day} Winner</span>` : `<span class="pcard-ship">Shipped</span>`)
          : `<span class="pcard-ship pcard-ship-pending">Awaiting submission</span>`}
      </div>
      <div class="pcard-body">
        <h3 class="pcard-title">${escapeHtml(p.title)}</h3>
        <p class="pcard-desc">${escapeHtml(p.description)}</p>
        ${tagPills(p.tags)}
        <div class="pcard-foot">
          ${p.builder ? `<span class="pcard-builder">by ${escapeHtml(p.builder)}</span>` : `<span class="pcard-builder pcard-builder-empty">${escapeHtml(p.category)}</span>`}
          ${(isShipped && (p.githubUrl || p.demoUrl))
            ? `<span class="pcard-links">
                ${p.githubUrl ? `<a class="pcard-link" href="${escapeHtml(p.githubUrl)}" target="_blank" rel="noopener" onclick="event.stopPropagation()" aria-label="GitHub repo"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 1.5A10.5 10.5 0 0 0 1.5 12c0 4.64 3 8.58 7.18 9.97.53.1.72-.23.72-.5 0-.25-.01-1.09-.01-1.98-2.92.63-3.54-1.24-3.54-1.24-.48-1.21-1.17-1.53-1.17-1.53-.96-.65.07-.64.07-.64 1.06.07 1.62 1.09 1.62 1.09.95 1.6 2.48 1.14 3.08.87.1-.68.37-1.14.67-1.4-2.33-.27-4.78-1.17-4.78-5.2 0-1.15.4-2.09 1.08-2.83-.11-.27-.47-1.34.1-2.78 0 0 .88-.28 2.88 1.08a9.7 9.7 0 0 1 5.24 0c2-1.36 2.88-1.08 2.88-1.08.57 1.44.21 2.51.1 2.78.68.74 1.08 1.68 1.08 2.83 0 4.04-2.46 4.93-4.8 5.19.38.33.72.96.72 1.95 0 1.41-.01 2.55-.01 2.89 0 .28.19.61.73.5A10.51 10.51 0 0 0 22.5 12 10.5 10.5 0 0 0 12 1.5Z"/></svg> Repo</a>` : ''}
                ${p.demoUrl  ? `<a class="pcard-link" href="${escapeHtml(p.demoUrl)}"  target="_blank" rel="noopener" onclick="event.stopPropagation()">Demo ↗</a>` : ''}
              </span>`
            : ''}
        </div>
      </div>
    `;
    card.addEventListener('click', () => openModal(p.id));
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal(p.id); }
    });
    return card;
  }

  function renderGallery() {
    const host = document.getElementById('projectsDB');
    if (!host) return;
    host.innerHTML = '';
    const projects = db.projects
      .filter(p => activeFilter === 'all' || String(p.week) === activeFilter)
      .sort((a, b) => a.day - b.day);
    if (projects.length === 0) {
      host.innerHTML = '<div class="db-empty">No projects in this view yet.</div>';
      return;
    }
    const frag = document.createDocumentFragment();
    for (const p of projects) frag.appendChild(createCard(p));
    host.appendChild(frag);
  }

  function updateShippedCount() {
    const el = document.getElementById('dbShippedCount');
    if (el) el.textContent = String(db.projects.filter(p => p.shipped).length);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Filters
  // ─────────────────────────────────────────────────────────────────────────
  function bindFilters() {
    document.querySelectorAll('.db-filter').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.db-filter').forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        activeFilter = btn.dataset.week;
        renderGallery();
      });
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Modal (project detail)
  // ─────────────────────────────────────────────────────────────────────────
  function openModal(id) {
    const p = db.projects.find(x => x.id === id);
    if (!p) return;
    const body = document.getElementById('projectModalBody');
    const img = resolveImage(p);
    body.innerHTML = `
      <div class="pmodal-grid">
        <div class="pmodal-media">
          ${img
            ? `<img src="${escapeHtml(img)}" alt="${escapeHtml(p.title)}" />`
            : `<div class="pcard-media-empty" aria-hidden="true">No image yet</div>`}
        </div>
        <div class="pmodal-body">
          <div class="pmodal-meta">
            ${p.featured ? `<span class="pmodal-featured"><svg width="10" height="10" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true"><path d="M7 .5l1.94 4.13 4.56.6-3.36 3.13.85 4.49L7 10.65 2.99 12.85l.85-4.49L.5 5.23l4.56-.6L7 .5z"/></svg> Featured</span>` : ''}
            <span class="diff diff-${escapeHtml(p.difficulty)}">${escapeHtml(diffLabel(p.difficulty))}</span>
            <span class="pmodal-day">Day ${p.day} · Week ${p.week}</span>
            <span class="pcard-cat">${escapeHtml(p.category)}</span>
          </div>
          <h2 class="pmodal-title">${escapeHtml(p.title)}</h2>
          ${p.builder
            ? `<div class="pmodal-builder-line">by ${p.builderUrl
                ? `<a href="${escapeHtml(p.builderUrl)}" target="_blank" rel="noopener">${escapeHtml(p.builder)}</a>`
                : escapeHtml(p.builder)}</div>`
            : ''}
          ${p.winner ? `<div class="pmodal-winner">Day ${p.day} Winner <span aria-hidden="true">🏆</span></div>` : ''}
          <p class="pmodal-desc">${escapeHtml(p.description)}</p>
          ${Array.isArray(p.tags) && p.tags.length
            ? `<div class="pmodal-tags">${p.tags.map(t => `<span class="pcard-tag">${escapeHtml(t)}</span>`).join('')}</div>`
            : ''}
          ${p.shipped
            ? `<div class="pmodal-foot">
                <div class="pmodal-links">
                  ${p.githubUrl ? `<a class="btn btn-ghost" href="${escapeHtml(p.githubUrl)}" target="_blank" rel="noopener"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="margin-right:6px;vertical-align:-2px"><path d="M12 1.5A10.5 10.5 0 0 0 1.5 12c0 4.64 3 8.58 7.18 9.97.53.1.72-.23.72-.5 0-.25-.01-1.09-.01-1.98-2.92.63-3.54-1.24-3.54-1.24-.48-1.21-1.17-1.53-1.17-1.53-.96-.65.07-.64.07-.64 1.06.07 1.62 1.09 1.62 1.09.95 1.6 2.48 1.14 3.08.87.1-.68.37-1.14.67-1.4-2.33-.27-4.78-1.17-4.78-5.2 0-1.15.4-2.09 1.08-2.83-.11-.27-.47-1.34.1-2.78 0 0 .88-.28 2.88 1.08a9.7 9.7 0 0 1 5.24 0c2-1.36 2.88-1.08 2.88-1.08.57 1.44.21 2.51.1 2.78.68.74 1.08 1.68 1.08 2.83 0 4.04-2.46 4.93-4.8 5.19.38.33.72.96.72 1.95 0 1.41-.01 2.55-.01 2.89 0 .28.19.61.73.5A10.51 10.51 0 0 0 22.5 12 10.5 10.5 0 0 0 12 1.5Z"/></svg>Source Code</a>` : ''}
                  ${p.demoUrl  ? `<a class="btn btn-primary" href="${escapeHtml(p.demoUrl)}" target="_blank" rel="noopener">Open demo</a>` : ''}
                </div>
              </div>`
            : `<div class="pmodal-foot pmodal-foot-pending">Awaiting submission for this project.</div>`}
        </div>
      </div>
    `;
    const modal = document.getElementById('projectModal');
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
  }

  function closeModal() {
    const modal = document.getElementById('projectModal');
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
  }

  function bindModal() {
    document.getElementById('projectModalClose')?.addEventListener('click', closeModal);
    document.getElementById('projectModalBackdrop')?.addEventListener('click', closeModal);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && document.getElementById('projectModal').classList.contains('open')) closeModal();
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Admin panel
  // ─────────────────────────────────────────────────────────────────────────
  function openAdmin() {
    const panel = document.getElementById('adminPanel');
    if (!panel) return;
    panel.hidden = false;
    document.body.classList.add('admin-open');
    renderAdminList();
  }
  function closeAdmin() {
    const panel = document.getElementById('adminPanel');
    if (!panel) return;
    panel.hidden = true;
    document.body.classList.remove('admin-open');
    editingId = null;
  }

  function renderAdminList() {
    const list = document.getElementById('adminList');
    if (!list) return;
    const items = db.projects.map(p => {
      const dirty = !!overrides[p.id];
      return `<button type="button" class="admin-list-item${editingId === p.id ? ' is-active' : ''}${p.shipped ? ' is-shipped' : ''}${dirty ? ' is-dirty' : ''}" data-id="${p.id}">
        <span class="admin-list-d">D·${String(p.day).padStart(2, '0')}</span>
        <span class="admin-list-title">${escapeHtml(p.title)}</span>
        <span class="admin-list-status">${p.shipped ? '●' : '○'}</span>
      </button>`;
    }).join('');
    list.innerHTML = items;
    list.querySelectorAll('.admin-list-item').forEach(btn => {
      btn.addEventListener('click', () => loadIntoForm(btn.dataset.id));
    });
  }

  function loadIntoForm(id) {
    editingId = id;
    const p = db.projects.find(x => x.id === id);
    if (!p) return;
    document.getElementById('adminFormTitle').textContent = `Day ${p.day} · ${p.title}`;
    document.getElementById('adminFormGrid').hidden = false;
    const f = document.getElementById('adminForm');
    f.title.value = p.title || '';
    f.description.value = p.description || '';
    f.builder.value = p.builder || '';
    f.builderUrl.value = p.builderUrl || '';
    f.githubUrl.value = p.githubUrl || '';
    f.demoUrl.value = p.demoUrl || '';
    f.difficulty.value = p.difficulty || 'moderate';
    f.tags.value = Array.isArray(p.tags) ? p.tags.join(', ') : '';
    f.shipped.checked = !!p.shipped;
    f.featured.checked = !!p.featured;
    f.winner.checked = !!p.winner;
    // Image preview
    const preview = document.getElementById('adminImagePreview');
    const name = document.getElementById('adminImageName');
    if (p.image) {
      preview.innerHTML = `<img src="${escapeHtml(resolveImage(p))}" alt="" />`;
      name.textContent = p.image + (newImages[p.image] ? ' · new, not yet committed' : '');
    } else {
      preview.innerHTML = '';
      name.textContent = 'No file chosen';
    }
    document.getElementById('adminImageInput').value = '';
    renderAdminList();
    setSaved('Loaded.');
  }

  function readForm() {
    const f = document.getElementById('adminForm');
    return {
      title: f.title.value.trim(),
      description: f.description.value.trim(),
      builder: f.builder.value.trim(),
      builderUrl: f.builderUrl.value.trim(),
      githubUrl: f.githubUrl.value.trim(),
      demoUrl: f.demoUrl.value.trim(),
      difficulty: f.difficulty.value,
      tags: f.tags.value.split(',').map(s => s.trim()).filter(Boolean),
      shipped: f.shipped.checked,
      featured: f.featured.checked,
      winner: f.winner.checked,
    };
  }

  // Compute the diff from the canonical base for a given id; store ONLY changed fields.
  function commitOverride(id, patch) {
    const base = dbBase.projects.find(x => x.id === id);
    if (!base) return;
    const current = { ...base, ...(overrides[id] || {}), ...patch };
    const next = {};
    for (const k of Object.keys(current)) {
      const a = current[k], b = base[k];
      const sameArr = Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i]);
      if (sameArr) continue;
      if (a === b) continue;
      next[k] = a;
    }
    if (Object.keys(next).length === 0) delete overrides[id];
    else overrides[id] = next;
    saveLocal();
    merge();
    renderGallery();
    updateShippedCount();
    renderAdminList();
  }

  function setSaved(msg) {
    const el = document.getElementById('adminSaved');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('is-on');
    clearTimeout(setSaved._t);
    setSaved._t = setTimeout(() => el.classList.remove('is-on'), 1200);
  }

  function bindAdminForm() {
    const f = document.getElementById('adminForm');
    if (!f) return;

    // Autosave on input
    f.addEventListener('input', e => {
      if (!editingId) return;
      if (e.target.name === 'image') return; // handled separately
      commitOverride(editingId, readForm());
      setSaved('Saved.');
    });
    f.addEventListener('change', e => {
      if (!editingId) return;
      if (e.target.name === 'image') return;
      commitOverride(editingId, readForm());
      setSaved('Saved.');
    });

    // Image upload
    const input = document.getElementById('adminImageInput');
    const preview = document.getElementById('adminImagePreview');
    const nameEl = document.getElementById('adminImageName');

    input.addEventListener('change', () => {
      if (!editingId) return;
      const file = input.files && input.files[0];
      if (!file) return;
      const p = db.projects.find(x => x.id === editingId);
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const filename = `${p.id}.${ext}`;
      const reader = new FileReader();
      reader.onload = () => {
        newImages[filename] = reader.result;
        commitOverride(editingId, { image: filename });
        preview.innerHTML = `<img src="${reader.result}" alt="" />`;
        nameEl.textContent = filename + ' · new, not yet committed';
        setSaved('Image attached. Use "Download new images" to get the file for /uploads/.');
      };
      reader.readAsDataURL(file);
    });

    document.getElementById('adminImageClear').addEventListener('click', () => {
      if (!editingId) return;
      const p = db.projects.find(x => x.id === editingId);
      if (p.image && newImages[p.image]) delete newImages[p.image];
      commitOverride(editingId, { image: '' });
      preview.innerHTML = '';
      nameEl.textContent = 'No file chosen';
      input.value = '';
      saveLocal();
      setSaved('Image cleared.');
    });

    document.getElementById('adminRevert').addEventListener('click', () => {
      if (!editingId) return;
      const p = db.projects.find(x => x.id === editingId);
      if (p.image && newImages[p.image]) delete newImages[p.image];
      delete overrides[editingId];
      saveLocal();
      merge();
      loadIntoForm(editingId);
      renderGallery();
      updateShippedCount();
      setSaved('Reverted to projects.json.');
    });

    document.getElementById('adminExport').addEventListener('click', exportJson);
    document.getElementById('adminDownloadImages').addEventListener('click', downloadNewImages);
    document.getElementById('adminReset').addEventListener('click', () => {
      if (!confirm('Discard ALL local changes (overrides + uploaded images)? This cannot be undone unless you exported them.')) return;
      overrides = {}; newImages = {};
      saveLocal();
      merge();
      renderGallery();
      updateShippedCount();
      renderAdminList();
      if (editingId) loadIntoForm(editingId);
      setSaved('Local changes cleared.');
    });
    document.getElementById('adminClose').addEventListener('click', e => {
      e.preventDefault();
      history.replaceState(null, '', location.pathname);
      closeAdmin();
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Export
  // ─────────────────────────────────────────────────────────────────────────
  function exportJson() {
    const out = {
      version: dbBase.version,
      updatedAt: new Date().toISOString().slice(0, 10),
      projects: db.projects.map(p => {
        // Only include the fields that exist in the schema, in stable order.
        return {
          id: p.id, day: p.day, week: p.week, category: p.category,
          title: p.title, description: p.description, difficulty: p.difficulty,
          builder: p.builder || '', builderUrl: p.builderUrl || '',
          image: p.image || '', githubUrl: p.githubUrl || '', demoUrl: p.demoUrl || '',
          shipped: !!p.shipped,
          tags: Array.isArray(p.tags) ? p.tags : [],
          featured: !!p.featured,
          winner: !!p.winner,
        };
      }),
    };
    const blob = new Blob([JSON.stringify(out, null, 2) + '\n'], { type: 'application/json' });
    triggerDownload(blob, 'projects.json');
    setSaved('Exported projects.json. Drop it at the repo root and commit.');
  }

  function dataURLToBlob(dataURL) {
    const [meta, b64] = dataURL.split(',');
    const mime = (meta.match(/data:([^;]+)/) || [])[1] || 'application/octet-stream';
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  function downloadNewImages() {
    const names = Object.keys(newImages);
    if (names.length === 0) { setSaved('No new images to download.'); return; }
    for (const name of names) {
      triggerDownload(dataURLToBlob(newImages[name]), name);
    }
    setSaved(`Downloaded ${names.length} image${names.length === 1 ? '' : 's'}. Drop them in /uploads/ and commit.`);
  }

  function triggerDownload(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Routing
  // ─────────────────────────────────────────────────────────────────────────
  function bindRouting() {
    window.addEventListener('hashchange', () => {
      if (location.hash === '#admin') openAdmin();
      else closeAdmin();
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Boot
  // ─────────────────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    bindFilters();
    bindModal();
    bindAdminForm();
    bindRouting();
    load().catch(err => {
      console.error('[projects] failed to load', err);
      const host = document.getElementById('projectsDB');
      if (host) host.innerHTML = '<div class="db-empty db-empty-error">Couldn\'t load projects.json. Check the file is at the repo root.</div>';
    });
  });
})();
