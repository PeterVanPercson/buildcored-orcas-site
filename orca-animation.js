// ─────────────────────────────────────────────────────────────────────────
// Buildcored — hero canvas intro
// Plays the 3-layer orca formation animation once, then holds the final frame
// as the static hero logo. Used by both the intro overlay and the hero art slot.
// ─────────────────────────────────────────────────────────────────────────

(function () {
  'use strict';

  // ── Animation params (mirrors scenes.jsx) ───────────────────────────────
  const LOGO_W = 589, LOGO_H = 613;
  const STAGE_W = 1080, STAGE_H = 1080;
  const CX = (STAGE_W - LOGO_W) / 2;
  const CY = (STAGE_H - LOGO_H) / 2;
  const BG = '#d6dee0';
  const DURATION = 3.0;

  const LAYERS = [
    { src: 'layer-light.png', start: 0.05, dur: 1.5, fromX: 140,  fromY: 260,  fromRot: -8, fromScale: 0.78, blurStart: 14 },
    { src: 'layer-dark.png',  start: 0.25, dur: 1.5, fromX: -220, fromY: 60,   fromRot:  6, fromScale: 0.82, blurStart: 12 },
    { src: 'layer-black.png', start: 0.45, dur: 1.5, fromX: 40,   fromY: -280, fromRot: -4, fromScale: 0.86, blurStart: 10 },
  ];

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const easeOutQuad = (t) => t * (2 - t);
  const easeOutBack = (t) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  };

  // Single shared image preload — reused across instances
  const images = {};
  let imagesReady = null;
  function preload() {
    if (imagesReady) return imagesReady;
    imagesReady = Promise.all(LAYERS.map(L => new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => { images[L.src] = img; res(); };
      img.onerror = rej;
      img.src = L.src;
    })));
    return imagesReady;
  }

  function renderFrame(ctx, time, w, h) {
    // Background fills its canvas (the canvas itself is the gray frame in hero)
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, w, h);

    // Subtle breath at end
    let breath = 1;
    if (time > 1.8) breath = 1 + 0.012 * Math.sin((time - 1.8) * 1.8);

    // Map stage coordinates to canvas size
    const sx = w / STAGE_W;
    const sy = h / STAGE_H;

    for (const L of LAYERS) {
      const img = images[L.src];
      if (!img) continue;
      const t = clamp((time - L.start) / L.dur, 0, 1);
      if (t <= 0) continue;
      const eased = easeOutBack(t);
      const x = L.fromX * (1 - eased);
      const y = L.fromY * (1 - eased);
      const rot = L.fromRot * (1 - eased);
      const scl = L.fromScale + (1 - L.fromScale) * eased;
      const op = clamp(t / 0.4, 0, 1);
      const blur = L.blurStart * (1 - easeOutQuad(clamp(t / 0.6, 0, 1)));

      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.scale(breath, breath);
      ctx.translate(-w / 2, -h / 2);

      const layerCX = (CX + LOGO_W / 2) * sx;
      const layerCY = (CY + LOGO_H / 2) * sy;
      ctx.translate(layerCX + x * sx, layerCY + y * sy);
      ctx.rotate(rot * Math.PI / 180);
      ctx.scale(scl, scl);
      ctx.globalAlpha = op;
      if (blur > 0.1) ctx.filter = `blur(${blur * sx}px)`;
      ctx.drawImage(img, -LOGO_W * sx / 2, -LOGO_H * sy / 2, LOGO_W * sx, LOGO_H * sy);
      ctx.filter = 'none';
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // Assembly glow
    const bloom = clamp((time - 0.4) / 1.6, 0, 1);
    const fade = clamp((time - 1.9) / 0.9, 0, 1);
    const glowOp = bloom * (1 - fade) * 0.55;
    if (glowOp > 0.01) {
      ctx.save();
      ctx.globalCompositeOperation = 'soft-light';
      ctx.globalAlpha = glowOp;
      const r = 480 * sx;
      const grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, r);
      grad.addColorStop(0, 'rgba(255,255,255,0.85)');
      grad.addColorStop(0.6, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(w / 2 - r, h / 2 - r, r * 2, r * 2);
      ctx.restore();
    }
  }

  // Setup a canvas at device pixel ratio with a logical size
  function sizeCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    return { w: canvas.width, h: canvas.height, dpr };
  }

  // Play once, end on final frame
  async function playOnce(canvas, { onComplete } = {}) {
    await preload();
    const ctx = canvas.getContext('2d');
    let dims = sizeCanvas(canvas);

    // re-size on viewport change
    const onResize = () => { dims = sizeCanvas(canvas); renderFrame(ctx, DURATION, dims.w, dims.h); };
    window.addEventListener('resize', onResize);

    return new Promise(resolve => {
      const start = performance.now();
      function frame() {
        const t = (performance.now() - start) / 1000;
        if (t >= DURATION) {
          renderFrame(ctx, DURATION, dims.w, dims.h);
          window.removeEventListener('resize', onResize);
          // Keep the resize handler so re-renders work after completion.
          window.addEventListener('resize', () => {
            const d = sizeCanvas(canvas);
            renderFrame(ctx, DURATION, d.w, d.h);
          });
          if (onComplete) onComplete();
          resolve();
          return;
        }
        renderFrame(ctx, t, dims.w, dims.h);
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
  }

  // Render only the final frame (used when the intro is skipped or for the hero
  // canvas after intro completes).
  async function showFinalFrame(canvas) {
    await preload();
    const ctx = canvas.getContext('2d');
    const dims = sizeCanvas(canvas);
    renderFrame(ctx, DURATION, dims.w, dims.h);
    // Keep responsive on resize
    window.addEventListener('resize', () => {
      const d = sizeCanvas(canvas);
      renderFrame(ctx, DURATION, d.w, d.h);
    });
  }

  window.OrcaAnimation = { playOnce, showFinalFrame, preload };
})();
