/* ═══════════════════════════════════════════════════════════════════════════
   Buildcored — Project DB + Admin + Newsletter (Supabase-backed)
   ─────────────────────────────────────────────────────────────────────────
   - If supabase-config.js has SUPABASE_ANON_KEY set → live mode: reads from
     Supabase, magic-link auth gates admin writes, images go to Storage.
   - If not configured → fallback mode: reads projects.json, admin edits
     stay in localStorage and export to JSON for git-commit.
   ═══════════════════════════════════════════════════════════════════════════ */

(() => {
  const LS_KEY      = 'bc-projects-overrides-v1';
  const LS_IMG_KEY  = 'bc-projects-new-images-v1';
  const CFG         = window.BC_CONFIG || {};
  const HAS_SB      = !!(CFG.SUPABASE_ANON_KEY && CFG.SUPABASE_URL);

  /** @type {any} Supabase client, lazily loaded */
  let sb = null;
  let currentUser = null;

  let dbBase = null;     // canonical projects (server source of truth)
  let db = null;         // dbBase with local overrides merged
  let overrides = {};
  let newImages = {};
  let activeFilter = 'all';
  let editingId = null;

  // ─────────────────────────────────────────────────────────────────────────
  // Boot
  // ─────────────────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', async () => {
    bindFilters();
    bindModal();
    bindAdminForm();
    bindRouting();
    bindNewsletter();
    bindGalleryAudio();

    if (HAS_SB) {
      try {
        const mod = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
        sb = mod.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
          auth: { persistSession: true, autoRefreshToken: true },
        });
        const { data: { session } } = await sb.auth.getSession();
        currentUser = session?.user || null;
        sb.auth.onAuthStateChange((event, s) => {
          currentUser = s?.user || null;
          updateAuthUI();
          if (event === 'SIGNED_IN') renderAdminList();
        });
        updateAuthUI();
      } catch (err) {
        console.error('[supabase] init failed, falling back to projects.json', err);
        sb = null;
      }
    }

    try {
      loadLocal();
      await load();
      if (location.hash === '#admin') openAdmin();
    } catch (err) {
      console.error('[projects] load failed', err);
      const host = document.getElementById('projectsDB');
      if (host) host.innerHTML = `<div class="db-empty db-empty-error">Couldn't load projects. ${escapeHtml(err.message || err)}</div>`;
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Storage helpers (local overrides for fallback mode)
  // ─────────────────────────────────────────────────────────────────────────
  function loadLocal() {
    try { overrides = JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { overrides = {}; }
    try { newImages = JSON.parse(localStorage.getItem(LS_IMG_KEY) || '{}'); } catch { newImages = {}; }
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
  // Supabase row <-> local project mapping (snake_case <-> camelCase)
  // ─────────────────────────────────────────────────────────────────────────
  function rowToProject(row) {
    return {
      id: row.id,
      day: row.day,
      week: row.week,
      category: row.category,
      title: row.title,
      description: row.description,
      difficulty: row.difficulty,
      builder: row.builder || '',
      builderUrl: row.builder_url || '',
      image: row.image || '',
      githubUrl: row.github_url || '',
      demoUrl: row.demo_url || '',
      shipped: !!row.shipped,
      featured: !!row.featured,
      winner: !!row.winner,
      tags: row.tags || [],
      updatedAt: row.updated_at || '',
    };
  }
  function projectToRow(p) {
    return {
      id: p.id,
      day: p.day,
      week: p.week,
      category: p.category,
      title: p.title,
      description: p.description,
      difficulty: p.difficulty,
      builder: p.builder || '',
      builder_url: p.builderUrl || '',
      image: p.image || '',
      github_url: p.githubUrl || '',
      demo_url: p.demoUrl || '',
      shipped: !!p.shipped,
      featured: !!p.featured,
      winner: !!p.winner,
      tags: p.tags || [],
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Load
  // ─────────────────────────────────────────────────────────────────────────
  async function load() {
    if (sb) {
      const { data, error } = await sb.from('projects').select('*').order('day', { ascending: true });
      if (error) throw error;
      dbBase = {
        version: 1,
        updatedAt: new Date().toISOString().slice(0, 10),
        projects: (data || []).map(rowToProject),
      };
    } else {
      const r = await fetch('projects.json?t=' + Date.now(), { cache: 'no-cache' });
      if (!r.ok) throw new Error('projects.json missing');
      dbBase = await r.json();
    }
    merge();
    renderGallery();
    updateShippedCount();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Image URL resolution
  // ─────────────────────────────────────────────────────────────────────────
  function resolveImage(project) {
    if (!project.image) return '';
    // Fresh local upload this session (data URL) — show immediately
    if (newImages[project.image]) return newImages[project.image];
    const ver = project.updatedAt ? `?v=${encodeURIComponent(project.updatedAt)}` : '';
    // Designed SVG covers ship in the repo and are served same-origin.
    // (Supabase Storage forces `content-disposition: attachment` +
    //  `content-security-policy: default-src 'none'; sandbox` on SVGs,
    //  which blocks their fonts/animations and inline-document rendering.)
    if (/\.svg$/i.test(project.image)) {
      return `covers/${project.image}${ver}`;
    }
    // Raster uploads (admin GIF/PNG/JPG) live in Supabase Storage
    if (sb) {
      return `${CFG.SUPABASE_URL}/storage/v1/object/public/project-images/${project.image}${ver}`;
    }
    return 'uploads/' + project.image;
  }

  // Cover markup. Animated SVGs only run their CSS keyframes when embedded as
  // a document (<object>), NOT as <img> (which freezes them on frame 0 and
  // often looks empty). So: SVG → <object> (pointer-events:none so the card
  // stays clickable), GIF/PNG/JPG → <img loading=lazy> (those animate fine).
  function coverMedia(project, ctx) {
    const url = resolveImage(project);
    if (!url) return '';
    const isSvg = /\.svg(\?|$)/i.test(project.image || '') || url.startsWith('data:image/svg');
    if (isSvg) {
      return `<object class="pcard-anim" type="image/svg+xml" data="${escapeHtml(url)}" aria-label="${escapeHtml(project.title)} cover" tabindex="-1"></object>`;
    }
    const lazy = ctx === 'card' ? ' loading="lazy"' : '';
    return `<img src="${escapeHtml(url)}" alt="${ctx === 'modal' ? escapeHtml(project.title) : ''}"${lazy} />`;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render helpers
  // ─────────────────────────────────────────────────────────────────────────
  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c]);
  }
  function diffLabel(d) { return d ? d[0].toUpperCase() + d.slice(1) : ''; }

  function tagPills(tags, max = 4) {
    if (!Array.isArray(tags) || tags.length === 0) return '';
    const shown = tags.slice(0, max);
    const extra = tags.length - shown.length;
    return `<div class="pcard-tags">
      ${shown.map(t => `<span class="pcard-tag">${escapeHtml(t)}</span>`).join('')}
      ${extra > 0 ? `<span class="pcard-tag pcard-tag-extra">+${extra}</span>` : ''}
    </div>`;
  }

  function createCard(p) {
    const isShipped = !!p.shipped;
    const img = resolveImage(p);
    const card = document.createElement('article');
    const classes = ['project-card-db', 'reveal', 'in'];
    classes.push(isShipped ? 'is-shipped' : 'is-pending');
    if (p.featured) classes.push('is-featured');
    if (p.winner)   classes.push('is-winner');
    card.className = classes.join(' ');
    card.dataset.week = String(p.week);
    card.dataset.id = p.id;
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `${p.title} — Day ${p.day}${p.winner ? ' (Day winner)' : ''}`);
    card.innerHTML = `
      <div class="pcard-media">
        ${img
          ? coverMedia(p, 'card')
          : `<div class="pcard-media-empty" aria-hidden="true">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.2"/>
                <path d="M3 16l5-4 4 3 3-2 6 5" stroke="currentColor" stroke-width="1.2" fill="none"/>
                <circle cx="9" cy="10" r="1.5" stroke="currentColor" stroke-width="1.2"/>
              </svg>
            </div>`}
        ${p.featured
          ? `<span class="pcard-featured"><svg width="11" height="11" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true"><path d="M7 .5l1.94 4.13 4.56.6-3.36 3.13.85 4.49L7 10.65 2.99 12.85l.85-4.49L.5 5.23l4.56-.6L7 .5z"/></svg> Featured</span>`
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
  // Modal
  // ─────────────────────────────────────────────────────────────────────────
  function openModal(id) {
    const p = db.projects.find(x => x.id === id);
    if (!p) return;
    const body = document.getElementById('projectModalBody');
    const img = resolveImage(p);
    body.innerHTML = `
      <div class="pmodal-grid">
        <div class="pmodal-media">
          ${img ? coverMedia(p, 'modal') : `<div class="pcard-media-empty" aria-hidden="true">No image yet</div>`}
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
            ? `<div class="pmodal-builder-line">by ${p.builderUrl ? `<a href="${escapeHtml(p.builderUrl)}" target="_blank" rel="noopener">${escapeHtml(p.builder)}</a>` : escapeHtml(p.builder)}</div>`
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
      </div>`;
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
      if (e.key === 'Escape' && document.getElementById('projectModal')?.classList.contains('open')) closeModal();
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Auth (Supabase magic link)
  // ─────────────────────────────────────────────────────────────────────────
  function isAdmin() {
    if (!sb || !currentUser) return false;
    if (!CFG.ADMIN_EMAIL) return false;
    return currentUser.email?.toLowerCase() === CFG.ADMIN_EMAIL.toLowerCase();
  }

  function updateAuthUI() {
    const signedOut = document.getElementById('adminAuthSignedOut');
    const signedIn  = document.getElementById('adminAuthSignedIn');
    const who       = document.getElementById('adminAuthWho');
    const formGrid  = document.getElementById('adminFormGrid');
    const formTitle = document.getElementById('adminFormTitle');
    if (!signedOut) return;

    if (!sb) {
      // Fallback mode — show the local-export hint, don't show auth controls
      signedOut.hidden = true;
      signedIn.hidden  = true;
      return;
    }

    if (currentUser && isAdmin()) {
      signedOut.hidden = true;
      signedIn.hidden  = false;
      who.innerHTML    = `signed in as <em>${escapeHtml(currentUser.email)}</em>`;
    } else if (currentUser) {
      // Signed in but not admin
      signedOut.hidden = true;
      signedIn.hidden  = false;
      who.innerHTML    = `signed in as <em>${escapeHtml(currentUser.email)}</em> — not the admin`;
      if (formGrid) formGrid.hidden = true;
      if (formTitle) formTitle.textContent = 'You\'re signed in, but not as the admin.';
    } else {
      signedOut.hidden = false;
      signedIn.hidden  = true;
      if (formGrid) formGrid.hidden = true;
      if (formTitle) formTitle.textContent = 'Sign in to edit projects';
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Admin panel
  // ─────────────────────────────────────────────────────────────────────────
  function openAdmin() {
    const panel = document.getElementById('adminPanel');
    if (!panel) return;
    panel.hidden = false;
    document.body.classList.add('admin-open');
    updateAuthUI();
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
    list.innerHTML = db.projects.map(p => {
      const dirty = !sb && !!overrides[p.id];
      return `<button type="button" class="admin-list-item${editingId === p.id ? ' is-active' : ''}${p.shipped ? ' is-shipped' : ''}${dirty ? ' is-dirty' : ''}" data-id="${p.id}">
        <span class="admin-list-d">D·${String(p.day).padStart(2,'0')}</span>
        <span class="admin-list-title">${escapeHtml(p.title)}</span>
        <span class="admin-list-status">${p.shipped ? '●' : '○'}</span>
      </button>`;
    }).join('');
    list.querySelectorAll('.admin-list-item').forEach(btn => {
      btn.addEventListener('click', () => loadIntoForm(btn.dataset.id));
    });
  }

  function loadIntoForm(id) {
    editingId = id;
    const p = db.projects.find(x => x.id === id);
    if (!p) return;
    document.getElementById('adminFormTitle').textContent = `Day ${p.day} · ${p.title}`;
    const grid = document.getElementById('adminFormGrid');
    if (sb && !isAdmin()) { grid.hidden = true; updateAuthUI(); return; }
    grid.hidden = false;
    const f = document.getElementById('adminForm');
    f.title.value       = p.title || '';
    f.description.value = p.description || '';
    f.builder.value     = p.builder || '';
    f.builderUrl.value  = p.builderUrl || '';
    f.githubUrl.value   = p.githubUrl || '';
    f.demoUrl.value     = p.demoUrl || '';
    f.difficulty.value  = p.difficulty || 'moderate';
    f.tags.value        = Array.isArray(p.tags) ? p.tags.join(', ') : '';
    f.shipped.checked   = !!p.shipped;
    f.featured.checked  = !!p.featured;
    f.winner.checked    = !!p.winner;
    const preview = document.getElementById('adminImagePreview');
    const name    = document.getElementById('adminImageName');
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
      title:       f.title.value.trim(),
      description: f.description.value.trim(),
      builder:     f.builder.value.trim(),
      builderUrl:  f.builderUrl.value.trim(),
      githubUrl:   f.githubUrl.value.trim(),
      demoUrl:     f.demoUrl.value.trim(),
      difficulty:  f.difficulty.value,
      tags:        f.tags.value.split(',').map(s => s.trim()).filter(Boolean),
      shipped:     f.shipped.checked,
      featured:    f.featured.checked,
      winner:      f.winner.checked,
    };
  }

  // saveProject — Supabase or fallback to local override
  async function saveProject(id, patch) {
    if (sb) {
      if (!isAdmin()) { setSaved('Sign in as the admin to save.'); return; }
      const current = db.projects.find(p => p.id === id);
      const updated = { ...current, ...patch };
      const { error } = await sb.from('projects').upsert(projectToRow(updated));
      if (error) { console.error(error); setSaved('Save failed: ' + error.message); return; }
      Object.assign(current, patch);
      // DB trigger bumps updated_at; mirror it locally so resolveImage()
      // produces a fresh ?v= immediately (cache-bust without a reload)
      current.updatedAt = new Date().toISOString();
      renderGallery();
      updateShippedCount();
      renderAdminList();
      setSaved('Saved.');
      return;
    }
    // Fallback: local override (existing behavior)
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
    setSaved('Saved locally — export when ready.');
  }

  function setSaved(msg) {
    const el = document.getElementById('adminSaved');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('is-on');
    clearTimeout(setSaved._t);
    setSaved._t = setTimeout(() => el.classList.remove('is-on'), 1800);
  }

  function bindAdminForm() {
    const f = document.getElementById('adminForm');
    if (!f) return;

    // Autosave
    const onChange = e => {
      if (!editingId) return;
      if (e.target.name === 'image') return;
      saveProject(editingId, readForm());
    };
    f.addEventListener('input', onChange);
    f.addEventListener('change', onChange);

    // Image
    const input    = document.getElementById('adminImageInput');
    const preview  = document.getElementById('adminImagePreview');
    const nameEl   = document.getElementById('adminImageName');
    const dropZone = document.getElementById('adminImageDrop');
    const pickBtn  = document.getElementById('adminImagePick');

    // "Pick a file" button opens the file picker
    pickBtn?.addEventListener('click', () => input.click());

    // Drag-drop on the image area
    if (dropZone) {
      ['dragenter', 'dragover'].forEach(ev => dropZone.addEventListener(ev, e => {
        e.preventDefault();
        dropZone.classList.add('is-dragging');
      }));
      ['dragleave', 'drop'].forEach(ev => dropZone.addEventListener(ev, e => {
        e.preventDefault();
        if (ev === 'dragleave' && dropZone.contains(e.relatedTarget)) return;
        dropZone.classList.remove('is-dragging');
      }));
      dropZone.addEventListener('drop', e => {
        const f = e.dataTransfer?.files?.[0];
        if (!f || !(f.type.startsWith('image/') || f.type === 'image/gif')) return;
        // Transfer the file to the input and fire change
        const dt = new DataTransfer();
        dt.items.add(f);
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }

    input.addEventListener('change', async () => {
      if (!editingId) return;
      const file = input.files && input.files[0];
      if (!file) return;
      const p = db.projects.find(x => x.id === editingId);
      const ext = (file.name.split('.').pop() || 'gif').toLowerCase();
      const filename = `${p.id}.${ext}`;
      const prevImage = p.image; // may differ in extension (e.g. d03.jpg → d03.gif)

      if (sb && isAdmin()) {
        nameEl.hidden = false;
        nameEl.textContent = `Uploading ${(file.size / 1048576).toFixed(1)}MB…`;
        // Direct upload — raw bytes, no re-encode, full quality preserved.
        // Short cacheControl so swaps propagate fast; resolveImage() also
        // appends ?v=updated_at to hard-bust on every change.
        const { error } = await sb.storage.from('project-images').upload(filename, file, {
          upsert: true,
          contentType: file.type || 'image/gif',
          cacheControl: '60',
        });
        if (error) { setSaved('Upload failed: ' + error.message); console.error(error); return; }
        // If the extension changed, the old object is now orphaned — delete it
        if (prevImage && prevImage !== filename) {
          sb.storage.from('project-images').remove([prevImage]).catch(() => {});
        }
        await saveProject(editingId, { image: filename });
        const url = `${CFG.SUPABASE_URL}/storage/v1/object/public/project-images/${filename}?t=${Date.now()}`;
        preview.innerHTML = `<img src="${url}" alt="" />`;
        nameEl.textContent = `${filename} · uploaded (${(file.size / 1048576).toFixed(1)}MB)`;
        setSaved('Uploaded. Live on the card now.');
      } else {
        // Fallback: data URL in localStorage. Big GIFs blow the ~5MB quota,
        // so guard the write and tell the user instead of throwing.
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            newImages[filename] = reader.result;
            saveLocal();
          } catch (e) {
            delete newImages[filename];
            setSaved('Too big for offline mode — sign in so it uploads to Storage instead.');
            return;
          }
          await saveProject(editingId, { image: filename });
          preview.innerHTML = `<img src="${reader.result}" alt="" />`;
          nameEl.hidden = false;
          nameEl.textContent = filename + ' · new, not yet committed';
          setSaved('Image attached. Use "Download new images" for the file.');
        };
        reader.readAsDataURL(file);
      }
    });

    document.getElementById('adminImageClear').addEventListener('click', async () => {
      if (!editingId) return;
      const p = db.projects.find(x => x.id === editingId);
      const filename = p.image;

      if (sb && isAdmin() && filename) {
        await sb.storage.from('project-images').remove([filename]).catch(()=>{});
      }
      if (filename && newImages[filename]) delete newImages[filename];
      saveLocal();
      await saveProject(editingId, { image: '' });
      preview.innerHTML = '';
      nameEl.textContent = 'No file chosen';
      input.value = '';
      setSaved('Image cleared.');
    });

    document.getElementById('adminRevert').addEventListener('click', () => {
      if (!editingId) return;
      if (sb) { setSaved('Revert is only for local-mode edits.'); return; }
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
      if (!confirm('Discard ALL local-only changes? (Has no effect on Supabase data.)')) return;
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

    // Auth — magic link + sign out
    const authForm = document.getElementById('adminAuthForm');
    authForm?.addEventListener('submit', async e => {
      e.preventDefault();
      if (!sb) return;
      const email = authForm.email.value.trim();
      if (!email) return;
      const status = document.getElementById('adminAuthStatus');
      status.textContent = 'Sending magic link…';
      const { error } = await sb.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: location.origin + location.pathname + '#admin' },
      });
      if (error) { status.textContent = 'Failed: ' + error.message; return; }
      status.textContent = `Check ${email} for the sign-in link.`;
    });
    document.getElementById('adminSignOut')?.addEventListener('click', async () => {
      if (!sb) return;
      await sb.auth.signOut();
      setSaved('Signed out.');
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Export (fallback mode)
  // ─────────────────────────────────────────────────────────────────────────
  function exportJson() {
    if (sb) { setSaved('Already saving to Supabase — no export needed.'); return; }
    const out = {
      version: dbBase.version, updatedAt: new Date().toISOString().slice(0, 10),
      projects: db.projects.map(p => ({
        id: p.id, day: p.day, week: p.week, category: p.category,
        title: p.title, description: p.description, difficulty: p.difficulty,
        builder: p.builder || '', builderUrl: p.builderUrl || '',
        image: p.image || '', githubUrl: p.githubUrl || '', demoUrl: p.demoUrl || '',
        shipped: !!p.shipped,
        tags: Array.isArray(p.tags) ? p.tags : [],
        featured: !!p.featured, winner: !!p.winner,
      })),
    };
    const blob = new Blob([JSON.stringify(out, null, 2) + '\n'], { type: 'application/json' });
    triggerDownload(blob, 'projects.json');
    setSaved('Exported. Drop at repo root and commit.');
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
    if (sb) { setSaved('Images go straight to Storage now — nothing to download.'); return; }
    const names = Object.keys(newImages);
    if (names.length === 0) { setSaved('No new images.'); return; }
    for (const name of names) triggerDownload(dataURLToBlob(newImages[name]), name);
    setSaved(`Downloaded ${names.length} image${names.length === 1 ? '' : 's'}.`);
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
  // Newsletter signup
  // ─────────────────────────────────────────────────────────────────────────
  // Gallery ambience — ONE pass while the Project DB is on screen.
  // Armed 300px before the section enters (no late start). Plays once
  // through at 50% (no loop); when it ends OR you scroll away it fades
  // to silence and will not replay this session ("pass it once").
  // Keeps playing while a project modal is open (modal doesn't scroll).
  // ─────────────────────────────────────────────────────────────────────────
  function bindGalleryAudio() {
    const audio = document.getElementById('bgAudio');
    const section = document.getElementById('projects');
    if (!audio || !section) return;

    const MAX_VOL = 0.5;
    let unlocked = false;
    let played = false;   // had its single pass — never auto-plays again
    let active = false;   // currently playing in-section
    let inView = false;
    let fadeTimer = null;

    audio.loop = false;
    audio.volume = 0;

    function fadeTo(target, ms, thenPause) {
      clearInterval(fadeTimer);
      const start = audio.volume;
      const steps = Math.max(1, Math.round(ms / 40));
      let i = 0;
      fadeTimer = setInterval(() => {
        i++;
        audio.volume = Math.min(1, Math.max(0, start + (target - start) * (i / steps)));
        if (i >= steps) {
          clearInterval(fadeTimer);
          audio.volume = Math.max(0, Math.min(1, target));
          if (thenPause && target === 0) audio.pause();
        }
      }, 40);
    }

    function startOnce() {
      if (played || active || !unlocked || !inView) return;
      active = true;
      try { audio.currentTime = 0; } catch (_) {}
      const p = audio.play();
      if (p && p.catch) p.catch(() => { active = false; });
      fadeTo(MAX_VOL, 250);   // tiny ramp, effectively immediate
    }
    function stopFade() {
      if (!active) return;
      active = false;
      played = true;          // used up its one pass
      fadeTo(0, 1000, true);  // 1s fade → silence → pause
    }

    audio.addEventListener('ended', () => { active = false; played = true; });

    // First real gesture unlocks audio (browser autoplay policy)
    const evs = ['pointerdown', 'keydown', 'touchstart', 'wheel'];
    const unlock = () => {
      if (unlocked) return;
      unlocked = true;
      startOnce();
      evs.forEach(e => window.removeEventListener(e, unlock));
    };
    evs.forEach(e => window.addEventListener(e, unlock, { passive: true }));

    // rootMargin 300px → arms before the section is even visible (no lag).
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) { inView = true; startOnce(); }
        else { inView = false; stopFade(); }
      }
    }, { threshold: 0, rootMargin: '300px 0px 300px 0px' });
    io.observe(section);
  }

  // ─────────────────────────────────────────────────────────────────────────
  function bindNewsletter() {
    const form = document.getElementById('newsletterForm');
    if (!form) return;
    const status = document.getElementById('newsletterStatus');
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const email = form.email.value.trim();
      if (!email) return;
      if (!sb) {
        status.textContent = 'Newsletter isn\'t configured yet — try again soon.';
        return;
      }
      status.textContent = 'Subscribing…';
      const source = form.dataset.source || 'site';
      const { error } = await sb.from('newsletter_signups').insert({ email, source });
      if (error) {
        // 23505 = unique violation
        if (error.code === '23505') {
          status.textContent = 'You\'re already on the list — see you in v2.0.';
        } else {
          status.textContent = 'Hmm: ' + error.message;
        }
        return;
      }
      form.reset();
      status.textContent = 'You\'re in. We\'ll email when v2.0 opens.';
    });
  }
})();
