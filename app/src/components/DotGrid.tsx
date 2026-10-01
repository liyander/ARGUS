import { useEffect, useRef } from 'react';

/** Subtle dot grid that drifts slightly with the cursor (parallax), plus a soft accent glow. */
export function DotGrid() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    let tx = 0;
    let ty = 0;
    let x = 0;
    let y = 0;
    const onMove = (e: PointerEvent) => {
      tx = (e.clientX / innerWidth - 0.5) * -14;
      ty = (e.clientY / innerHeight - 0.5) * -14;
      if (!raf) raf = requestAnimationFrame(step);
    };
    const step = () => {
      x += (tx - x) * 0.08;
      y += (ty - y) * 0.08;
      if (ref.current) ref.current.style.backgroundPosition = `${x}px ${y}px`;
      raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.05 ? requestAnimationFrame(step) : 0;
    };
    addEventListener('pointermove', onMove, { passive: true });
    return () => {
      removeEventListener('pointermove', onMove);
      cancelAnimationFrame(raf);
    };
  }, []);
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-0 overflow-hidden">
      <div ref={ref} className="dot-grid absolute -inset-8" />
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(60rem 30rem at 50% -10%, var(--accent-soft), transparent 70%), radial-gradient(40rem 30rem at 100% 100%, color-mix(in srgb, var(--l-frontend) 8%, transparent), transparent 70%)',
        }}
      />
    </div>
  );
}
