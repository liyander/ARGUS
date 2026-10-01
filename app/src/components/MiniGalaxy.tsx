import { useEffect, useRef } from 'react';
import type { Analysis } from '../core/model';
import { hashString, mulberry32 } from '../lib/util';

interface Pt { x: number; y: number; z: number; r: number; layer: string }

const FALLBACK_LAYERS = ['frontend', 'frontend', 'api', 'service', 'service', 'data', 'infra'];

/** Slowly rotating constellation of a real repo (or a procedural one before showcase data loads). */
export function MiniGalaxy({ analysis, className = '' }: { analysis: Analysis | null; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const cs = getComputedStyle(document.documentElement);
    const colors: Record<string, string> = {};
    for (const l of ['frontend', 'api', 'service', 'data', 'infra', 'external']) colors[l] = cs.getPropertyValue(`--l-${l}`).trim();
    const light = document.documentElement.dataset.theme === 'light';

    // points: files clustered by module on a disc
    const rand = mulberry32(hashString(analysis?.target ?? 'stackscope'));
    const files = analysis?.nodes.filter((n) => n.kind === 'file').slice(0, 1400) ?? [];
    const modules = files.length ? [...new Set(files.map((f) => String(f.meta.module)))] : Array.from({ length: 22 }, (_, i) => `m${i}`);
    const centers = new Map(modules.map((m, i) => {
      const a = i * 2.39996;
      const r = 22 * Math.sqrt(i + 1);
      return [m, [Math.cos(a) * r, Math.sin(a) * r, (rand() - 0.5) * 40]];
    }));
    const pts: Pt[] = [];
    const src = files.length ? files : Array.from({ length: 900 }, (_, i) => ({ meta: { module: modules[Math.floor(Math.pow(rand(), 1.7) * modules.length)], loc: 30 + rand() * 400 }, layer: FALLBACK_LAYERS[i % FALLBACK_LAYERS.length] }));
    for (const f of src) {
      const [cx, cy, cz] = centers.get(String(f.meta.module))!;
      const a = rand() * Math.PI * 2;
      const d = Math.sqrt(rand()) * 18;
      pts.push({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, z: cz + (rand() - 0.5) * 14, r: 0.7 + Math.min(2.4, Math.sqrt(Number(f.meta.loc ?? 50)) / 12), layer: String(f.layer ?? 'service') });
    }
    const maxR = Math.max(...pts.map((p) => Math.hypot(p.x, p.y))) || 1;
    const idxById = new Map(files.map((f, i) => [f.id, i]));
    const links = (analysis?.edges ?? []).filter((e) => e.kind === 'imports').map((e) => [idxById.get(e.source), idxById.get(e.target)]).filter(([a, b]) => a !== undefined && b !== undefined).slice(0, 1600) as [number, number][];

    let angle = 0;
    let raf = 0;
    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(canvas);

    const draw = () => {
      const dpr = Math.min(2, devicePixelRatio || 1);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.floor(w * dpr)) {
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const scale = (Math.min(w, h * 1.9) / 2 / maxR) * 0.92;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const tilt = 0.42;
      const proj = pts.map((p) => {
        const x = p.x * cos - p.y * sin;
        const y = p.x * sin + p.y * cos;
        return { sx: w / 2 + x * scale, sy: h / 2 + (y * tilt + p.z * 0.6) * scale, depth: y };
      });
      ctx.globalCompositeOperation = light ? 'source-over' : 'lighter';
      ctx.lineWidth = 0.5;
      for (const [a, b] of links) {
        ctx.globalAlpha = light ? 0.08 : 0.05;
        ctx.strokeStyle = colors[pts[a].layer];
        ctx.beginPath();
        ctx.moveTo(proj[a].sx, proj[a].sy);
        ctx.lineTo(proj[b].sx, proj[b].sy);
        ctx.stroke();
      }
      pts.forEach((p, i) => {
        const { sx, sy, depth } = proj[i];
        const near = 0.55 + 0.45 * ((depth / maxR + 1) / 2);
        ctx.globalAlpha = 0.14 * near;
        ctx.fillStyle = colors[p.layer];
        ctx.beginPath();
        ctx.arc(sx, sy, p.r * 3 * near, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.95 * near;
        ctx.beginPath();
        ctx.arc(sx, sy, p.r * near, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    };
    const loop = () => {
      if (visible) {
        angle += 0.0012;
        draw();
      }
      raf = requestAnimationFrame(loop);
    };
    if (reduce) draw();
    else loop();
    const onResize = () => draw();
    addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      removeEventListener('resize', onResize);
    };
  }, [analysis]);

  return <canvas ref={ref} className={`block h-full w-full ${className}`} aria-hidden />;
}
