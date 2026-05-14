// scenes.jsx — Orca logo formation intro

const LOGO_W = 589;
const LOGO_H = 613;
const STAGE_W = 1080;
const STAGE_H = 1080;
const CX = (STAGE_W - LOGO_W) / 2; // 245.5
const CY = (STAGE_H - LOGO_H) / 2; // 233.5

// Each layer enters from a different vector and settles to (0,0) over its own window.
// Stagger so back layers land first.
function LogoLayer({ src, start, dur, fromX, fromY, fromRot, fromScale, blurStart }) {
  const { time } = useTimeline();
  const t = clamp((time - start) / dur, 0, 1);

  // Two-phase: 0..0.75 drift in with eased curve, 0.75..1 settle with overshoot
  const driftEase = Easing.easeOutCubic;
  const settleEase = Easing.easeOutBack;

  // Combine: use easeOutBack across the full window for a satisfying arrival
  const eased = Easing.easeOutBack(t);

  const x = fromX * (1 - eased);
  const y = fromY * (1 - eased);
  const rot = fromRot * (1 - eased);
  const scale = fromScale + (1 - fromScale) * eased;

  // Opacity: ramp in over first 40% of window
  const op = clamp(t / 0.4, 0, 1);

  // Slight blur during drift, clears by arrival
  const blur = blurStart * (1 - Easing.easeOutQuad(clamp(t / 0.6, 0, 1)));

  return (
    <img
      src={src}
      style={{
        position: 'absolute',
        left: CX,
        top: CY,
        width: LOGO_W,
        height: LOGO_H,
        transform: `translate(${x}px, ${y}px) rotate(${rot}deg) scale(${scale})`,
        transformOrigin: 'center center',
        opacity: op,
        filter: blur > 0.1 ? `blur(${blur}px)` : 'none',
        willChange: 'transform, opacity, filter',
        pointerEvents: 'none',
      }}
    />
  );
}

// Subtle final breath after assembly: gentle scale pulse on the whole composition
function LogoBreath({ children }) {
  const { time } = useTimeline();
  // Breath kicks in once assembly is "done" around t=1.8s
  let s = 1;
  if (time > 1.8) {
    const k = (time - 1.8);
    s = 1 + 0.012 * Math.sin(k * 1.8);
  }
  return (
    <div style={{
      position: 'absolute', inset: 0,
      transform: `scale(${s})`,
      transformOrigin: 'center center',
    }}>
      {children}
    </div>
  );
}

// Soft radial glow that blooms with assembly
function AssemblyGlow() {
  const { time } = useTimeline();
  const bloom = clamp((time - 0.4) / 1.6, 0, 1);
  const fade = clamp((time - 1.9) / 0.9, 0, 1);
  const op = bloom * (1 - fade) * 0.55;
  return (
    <div style={{
      position: 'absolute',
      left: STAGE_W / 2 - 480,
      top: STAGE_H / 2 - 480,
      width: 960,
      height: 960,
      background: 'radial-gradient(circle, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0) 60%)',
      opacity: op,
      pointerEvents: 'none',
      mixBlendMode: 'soft-light',
    }} />
  );
}

function OrcaIntro() {
  const { time } = useTimeline();

  // Update root data-screen-label for comment context
  React.useEffect(() => {
    const root = document.querySelector('[data-screen-label]');
    if (root) {
      root.setAttribute('data-screen-label', `t=${time.toFixed(1)}s`);
    }
  }, [Math.floor(time * 10)]);

  return (
    <>
      <AssemblyGlow />
      <LogoBreath>
        {/* Light gray (bottom layer) — drifts up from below-right */}
        <LogoLayer
          src="layer-light.png"
          start={0.05}
          dur={1.5}
          fromX={140}
          fromY={260}
          fromRot={-8}
          fromScale={0.78}
          blurStart={14}
        />
        {/* Dark gray (middle layer) — slides in from the left */}
        <LogoLayer
          src="layer-dark.png"
          start={0.25}
          dur={1.5}
          fromX={-220}
          fromY={60}
          fromRot={6}
          fromScale={0.82}
          blurStart={12}
        />
        {/* Black (top layer) — descends from above */}
        <LogoLayer
          src="layer-black.png"
          start={0.45}
          dur={1.5}
          fromX={40}
          fromY={-280}
          fromRot={-4}
          fromScale={0.86}
          blurStart={10}
        />
      </LogoBreath>
    </>
  );
}

window.OrcaIntro = OrcaIntro;
