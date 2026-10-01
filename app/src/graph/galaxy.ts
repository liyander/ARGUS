import {
  forceCollide, forceManyBody, forceSimulation, forceX, forceY, quadtree, select, zoom, zoomIdentity,
  type Quadtree, type Simulation, type SimulationNodeDatum, type ZoomBehavior, type ZoomTransform,
} from 'd3';
import type { GraphEdge, GraphNode, Layer } from '../core/model';
import { hashString, languageColor, mulberry32 } from '../lib/util';

/**
 * The codebase galaxy: every file is a star, modules are constellations, imports are light trails.
 * Canvas 2D + d3-force; streams in new stars while the scan is still running.
 */

export type ColorMode = 'layer' | 'language' | 'module';

interface Star extends SimulationNodeDatum {
  id: string;
  node: GraphNode;
  module: string;
  r: number;
  born: number;
  x: number;
  y: number;
}

interface Cluster {
  name: string;
  cx: number;
  cy: number;
  size: number;
  /** live centroid of member stars, for labels */
  lx: number;
  ly: number;
}

export interface GalaxyCallbacks {
  onHover: (node: GraphNode | null, screen: { x: number; y: number } | null) => void;
  onClick: (node: GraphNode | null) => void;
}

const LAYER_VARS: Layer[] = ['frontend', 'api', 'service', 'data', 'infra', 'external'];

export class GalaxyEngine {
  private ctx: CanvasRenderingContext2D;
  private stars = new Map<string, Star>();
  private list: Star[] = [];
  private clusters = new Map<string, Cluster>();
  private edges: { s: Star; t: Star; e: GraphEdge }[] = [];
  private sim: Simulation<Star, undefined>;
  private transform: ZoomTransform = zoomIdentity;
  private zoomBehavior: ZoomBehavior<HTMLCanvasElement, unknown>;
  private raf = 0;
  private dirty = true;
  private t0 = performance.now();
  private edgesFrom = Infinity;
  private qt: Quadtree<Star> | null = null;
  private qtStale = true;
  private hovered: Star | null = null;
  private selectedId: string | null = null;
  private neighbours: Set<string> | null = null;
  private focus = false;
  private colorMode: ColorMode = 'layer';
  private colors: Record<string, string> = {};
  private light = false;
  private fitted = false;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private destroyed = false;
  private active = true;
  private resizeObs: ResizeObserver;

  constructor(private canvas: HTMLCanvasElement, private cb: GalaxyCallbacks, private reduceMotion = false) {
    this.ctx = canvas.getContext('2d')!;
    this.readTheme();
    this.sim = forceSimulation<Star>([])
      .force('x', forceX<Star>((d) => this.clusters.get(d.module)?.cx ?? 0).strength(0.09))
      .force('y', forceY<Star>((d) => this.clusters.get(d.module)?.cy ?? 0).strength(0.09))
      .force('charge', forceManyBody<Star>().strength(-3.2).distanceMax(70))
      .force('collide', forceCollide<Star>((d) => d.r + 1.1).iterations(1))
      .alphaDecay(0.018)
      .velocityDecay(0.32)
      .stop();

    this.zoomBehavior = zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.08, 12])
      .on('zoom', (ev) => {
        this.transform = ev.transform;
        this.dirty = true;
      });
    select(canvas).call(this.zoomBehavior).on('dblclick.zoom', null);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerleave', this.onLeave);
    canvas.addEventListener('click', this.onClick);
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(canvas.parentElement ?? canvas);
    this.resize();
    this.loop();
  }

  readTheme() {
    const cs = getComputedStyle(document.documentElement);
    for (const l of LAYER_VARS) this.colors[l] = cs.getPropertyValue(`--l-${l}`).trim() || '#94a3b8';
    this.colors.accent = cs.getPropertyValue('--accent').trim() || '#22e6ff';
    this.colors.text = cs.getPropertyValue('--text').trim() || '#e7eef9';
    this.colors.muted = cs.getPropertyValue('--muted').trim() || '#8e9cb5';
    this.light = document.documentElement.dataset.theme === 'light';
    this.dirty = true;
  }

  private resize() {
    const parent = this.canvas.parentElement!;
    const rect = parent.getBoundingClientRect();
    this.dpr = Math.min(2, devicePixelRatio || 1);
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = Math.max(1, Math.floor(rect.width * this.dpr));
    this.canvas.height = Math.max(1, Math.floor(rect.height * this.dpr));
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
    if (!this.fitted && this.list.length) this.fit(false);
    this.dirty = true;
  }

  /** Add / update stars and trails. Existing stars keep their positions (streaming). */
  setData(nodes: GraphNode[], edges: GraphEdge[]) {
    const files = nodes.filter((n) => n.kind === 'file');
    const isFirst = this.stars.size === 0;
    const now = performance.now();
    const rand = mulberry32(hashString(files[0]?.id ?? 'x'));

    // clusters: modules on a golden-angle spiral, biggest at the centre
    const sizes = new Map<string, number>();
    for (const f of files) sizes.set(String(f.meta.module), (sizes.get(String(f.meta.module)) ?? 0) + 1);
    const ordered = [...sizes.entries()].sort((a, b) => b[1] - a[1]);
    let acc = 0;
    ordered.forEach(([name, size], i) => {
      const ang = i * 2.399963;
      acc += Math.sqrt(size);
      const radius = i === 0 ? 0 : 34 * Math.sqrt(acc) + 40;
      const prev = this.clusters.get(name);
      this.clusters.set(name, { name, cx: Math.cos(ang) * radius, cy: Math.sin(ang) * radius, size, lx: prev?.lx ?? 0, ly: prev?.ly ?? 0 });
    });

    const spread = 260 + Math.sqrt(files.length) * 22;
    let born = 0;
    for (const f of files) {
      const existing = this.stars.get(f.id);
      if (existing) {
        existing.node = f;
        continue;
      }
      const module = String(f.meta.module);
      const c = this.clusters.get(module)!;
      const ang = rand() * Math.PI * 2;
      const dist = isFirst ? Math.sqrt(rand()) * spread : 60 + rand() * 120;
      const star: Star = {
        id: f.id,
        node: f,
        module,
        r: 1.6 + Math.min(5.5, Math.sqrt(Number(f.meta.loc ?? 20)) / 7),
        born: this.reduceMotion ? 0 : now + (isFirst ? born++ * Math.min(2.2, 1600 / Math.max(1, files.length)) : 0),
        x: (isFirst ? 0 : c.cx) + Math.cos(ang) * dist,
        y: (isFirst ? 0 : c.cy) + Math.sin(ang) * dist,
      };
      this.stars.set(f.id, star);
    }
    this.list = [...this.stars.values()];

    this.edges = [];
    for (const e of edges) {
      if (e.kind !== 'imports') continue;
      const s = this.stars.get(e.source);
      const t = this.stars.get(e.target);
      if (s && t) this.edges.push({ s, t, e });
      if (this.edges.length > 9000) break;
    }

    this.sim.nodes(this.list);
    if (this.reduceMotion) {
      this.sim.alpha(1);
      for (let i = 0; i < 320; i++) this.sim.tick();
      this.sim.alpha(0);
      this.edgesFrom = 0;
    } else {
      this.sim.alpha(isFirst ? 1 : Math.max(this.sim.alpha(), 0.35));
      if (isFirst) {
        this.t0 = now;
        this.edgesFrom = now + 2300;
      }
    }
    this.qtStale = true;
    if (isFirst || !this.fitted) this.fit(!isFirst);
    this.dirty = true;
  }

  /** Replay the reveal sequence. */
  replay() {
    if (this.reduceMotion) return;
    const rand = mulberry32(7);
    const now = performance.now();
    const spread = 260 + Math.sqrt(this.list.length) * 22;
    this.list.forEach((s, i) => {
      const ang = rand() * Math.PI * 2;
      const dist = Math.sqrt(rand()) * spread;
      s.x = Math.cos(ang) * dist;
      s.y = Math.sin(ang) * dist;
      s.vx = 0;
      s.vy = 0;
      s.born = now + i * Math.min(2.2, 1600 / Math.max(1, this.list.length));
    });
    this.t0 = now;
    this.edgesFrom = now + 2300;
    this.sim.alpha(1);
    this.fit(true);
  }

  /** Hidden (kept-alive) views stop drawing entirely. */
  setActive(active: boolean) {
    this.active = active;
    this.dirty = true;
    if (!active) return;
    // the window may have changed size while this view was hidden: re-measure and re-centre
    const { width, height } = this;
    this.resize();
    if (Math.abs(width - this.width) > 2 || Math.abs(height - this.height) > 2) this.fit(false);
  }

  setColorMode(mode: ColorMode) {
    this.colorMode = mode;
    this.dirty = true;
  }

  setSelection(id: string | null, neighbours: Set<string> | null, focus: boolean) {
    this.selectedId = id;
    this.neighbours = neighbours;
    this.focus = focus;
    this.dirty = true;
    const s = id ? this.stars.get(id) : null;
    if (s) {
      const k = Math.max(this.transform.k, 1.6);
      const t = zoomIdentity.translate(this.width / 2 - s.x * k, this.height / 2 - s.y * k).scale(k);
      select(this.canvas).transition().duration(this.reduceMotion ? 0 : 650).call(this.zoomBehavior.transform, t);
    }
  }

  fit(animate: boolean) {
    if (!this.list.length || !this.width) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const c of this.clusters.values()) {
      const r = Math.sqrt(c.size) * 9 + 30;
      x0 = Math.min(x0, c.cx - r); y0 = Math.min(y0, c.cy - r);
      x1 = Math.max(x1, c.cx + r); y1 = Math.max(y1, c.cy + r);
    }
    const k = Math.min(2.5, 0.9 * Math.min(this.width / (x1 - x0), this.height / (y1 - y0)));
    const t = zoomIdentity.translate(this.width / 2 - ((x0 + x1) / 2) * k, this.height / 2 - ((y0 + y1) / 2) * k).scale(k);
    const sel = select(this.canvas);
    if (animate && !this.reduceMotion) sel.transition().duration(800).call(this.zoomBehavior.transform, t);
    else sel.call(this.zoomBehavior.transform, t);
    this.fitted = true;
  }

  stats() {
    return { stars: this.list.length, clusters: this.clusters.size, trails: this.edges.length };
  }

  private colorOf(s: Star): string {
    if (this.colorMode === 'language') return languageColor(String(s.node.meta.language));
    if (this.colorMode === 'module') return `hsl(${hashString(s.module) % 360} 75% ${this.light ? 45 : 65}%)`;
    return this.colors[s.node.layer ?? 'service'];
  }

  private screenToWorld(x: number, y: number) {
    return this.transform.invert([x, y]);
  }

  private findStar(clientX: number, clientY: number): Star | null {
    const rect = this.canvas.getBoundingClientRect();
    const [wx, wy] = this.screenToWorld(clientX - rect.left, clientY - rect.top);
    if (this.qtStale || !this.qt) {
      this.qt = quadtree<Star>().x((d) => d.x).y((d) => d.y).addAll(this.list);
      this.qtStale = false;
    }
    const found = this.qt.find(wx, wy, 14 / this.transform.k + 4);
    return found ?? null;
  }

  private onMove = (e: PointerEvent) => {
    const s = this.findStar(e.clientX, e.clientY);
    if (s !== this.hovered) {
      this.hovered = s;
      this.canvas.style.cursor = s ? 'pointer' : 'grab';
      this.dirty = true;
    }
    const rect = this.canvas.getBoundingClientRect();
    this.cb.onHover(s?.node ?? null, s ? { x: e.clientX - rect.left, y: e.clientY - rect.top } : null);
  };

  private onLeave = () => {
    this.hovered = null;
    this.cb.onHover(null, null);
    this.dirty = true;
  };

  private onClick = (e: MouseEvent) => {
    const s = this.findStar(e.clientX, e.clientY);
    this.cb.onClick(s?.node ?? null);
  };

  private loop = () => {
    if (this.destroyed) return;
    if (!this.active) {
      this.raf = requestAnimationFrame(this.loop);
      return;
    }
    const now = performance.now();
    const animating = this.sim.alpha() > 0.004 || now < this.edgesFrom + 1800 || this.list.some((s) => s.born > now - 450);
    if (this.sim.alpha() > 0.004 && now > this.t0 + 500) {
      this.sim.tick();
      this.qtStale = true;
    }
    if (animating || this.dirty) {
      this.draw(now);
      this.dirty = false;
    }
    this.raf = requestAnimationFrame(this.loop);
  };

  private draw(now: number) {
    const { ctx, transform: tr } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.save();
    ctx.translate(tr.x, tr.y);
    ctx.scale(tr.k, tr.k);
    const additive = !this.light;
    const focusSet = this.neighbours;
    const dimOthers = Boolean(focusSet && (this.focus || this.selectedId));

    // ── light trails
    const edgeP = Math.max(0, Math.min(1, (now - this.edgesFrom) / 1500));
    if (edgeP > 0 && this.edges.length) {
      ctx.globalCompositeOperation = additive ? 'lighter' : 'source-over';
      const baseAlpha = (additive ? 0.09 : 0.14) * Math.min(1, 900 / Math.max(300, this.edges.length) + 0.25);
      ctx.lineWidth = 0.6 / Math.sqrt(tr.k);
      for (const { s, t } of this.edges) {
        const hot = this.selectedId && (s.id === this.selectedId || t.id === this.selectedId);
        if (dimOthers && !hot) {
          if (this.focus) continue;
          ctx.globalAlpha = baseAlpha * 0.35 * edgeP;
        } else {
          ctx.globalAlpha = hot ? 0.9 : baseAlpha * edgeP;
        }
        ctx.strokeStyle = hot ? this.colors.accent : this.colorOf(s);
        const mx = (s.x + t.x) / 2 + (t.y - s.y) * 0.18;
        const my = (s.y + t.y) / 2 - (t.x - s.x) * 0.18;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        if (edgeP < 1) {
          // trail drawing itself in
          const p = edgeP;
          const qx = (1 - p) * (1 - p) * s.x + 2 * (1 - p) * p * mx + p * p * t.x;
          const qy = (1 - p) * (1 - p) * s.y + 2 * (1 - p) * p * my + p * p * t.y;
          ctx.quadraticCurveTo((s.x + mx) / 2, (s.y + my) / 2, qx, qy);
        } else {
          ctx.quadraticCurveTo(mx, my, t.x, t.y);
        }
        ctx.stroke();
      }
    }

    // ── stars
    for (const s of this.list) {
      const age = now - s.born;
      if (age < 0) continue;
      const fade = Math.min(1, age / 420);
      const inFocus = !dimOthers || focusSet!.has(s.id);
      const color = this.colorOf(s);
      const r = s.r * (0.6 + 0.4 * fade) + (age < 420 ? (1 - fade) * 3 : 0);
      ctx.globalCompositeOperation = additive ? 'lighter' : 'source-over';
      ctx.globalAlpha = (inFocus ? 0.16 : 0.03) * fade;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r * 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = (inFocus ? 1 : 0.12) * fade;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.fill();
      if (additive && inFocus && s.r > 3.5) {
        ctx.globalAlpha = 0.85 * fade;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(s.x, s.y, r * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // ── selection + hover rings
    for (const [s, color] of [[this.selectedId ? this.stars.get(this.selectedId) : null, this.colors.accent], [this.hovered, this.colors.text]] as const) {
      if (!s) continue;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5 / tr.k;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r + 4 / tr.k, 0, Math.PI * 2);
      ctx.stroke();
    }

    // ── constellation labels (centroids), after stars settle
    const settle = Math.max(0, Math.min(1, (now - this.t0 - 1600) / 900));
    if (settle > 0) {
      const sums = new Map<string, [number, number, number]>();
      for (const s of this.list) {
        const v = sums.get(s.module) ?? [0, 0, 0];
        v[0] += s.x; v[1] += s.y; v[2]++;
        sums.set(s.module, v);
      }
      const ranked = [...this.clusters.values()].sort((a, b) => b.size - a.size);
      const showCount = tr.k > 1.6 ? ranked.length : tr.k > 0.8 ? 24 : 12;
      ctx.textAlign = 'center';
      ranked.slice(0, showCount).forEach((c) => {
        const v = sums.get(c.name);
        if (!v || v[2] < 2) return;
        const x = v[0] / v[2];
        const y = v[1] / v[2] - Math.sqrt(c.size) * 7 - 12;
        const dim = dimOthers && !this.list.some((s) => s.module === c.name && focusSet!.has(s.id));
        ctx.globalAlpha = settle * (dim ? 0.15 : 0.75);
        ctx.font = `500 ${11 / Math.sqrt(tr.k)}px "JetBrains Mono", monospace`;
        ctx.fillStyle = this.colors.muted;
        ctx.fillText(c.name.split('/').slice(-2).join('/'), x, y);
      });
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.sim.stop();
    this.resizeObs.disconnect();
    this.canvas.removeEventListener('pointermove', this.onMove);
    this.canvas.removeEventListener('pointerleave', this.onLeave);
    this.canvas.removeEventListener('click', this.onClick);
    select(this.canvas).on('.zoom', null);
  }
}
