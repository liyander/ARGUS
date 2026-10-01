import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import type { Hop, Scenario, Station, StationKind } from './flows';

/**
 * The Dots stage: stations as small holographic 3D models on platforms, hops as
 * arcs, and glowing dots that carry each request through the layers and back.
 */

export interface DotsCallbacks {
  onStep: (index: number) => void;
  onPick: (station: Station | null) => void;
}

interface StationView {
  station: Station;
  group: THREE.Group;
  model: THREE.Group;
  pos: THREE.Vector3;
  tick: (t: number) => void;
  pulse: number;
  ring: THREE.Mesh;
  label: CSS2DObject;
}

interface HopView {
  hop: Hop;
  curve: THREE.QuadraticBezierCurve3;
  line: THREE.Line;
}

interface Particle {
  mesh: THREE.Mesh;
  trail: THREE.Line;
  history: THREE.Vector3[];
  hop: number;
  t: number;
  speed: number;
  ambient: boolean;
}

const SPACING = 3.6;
const LANE = 2.7;
const TRAIL = 22;

export class DotsScene {
  private renderer: THREE.WebGLRenderer;
  private labels: CSS2DRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 1, 0.1, 400);
  private controls: OrbitControls;
  private composer: EffectComposer | null = null;
  private world = new THREE.Group();
  private stations = new Map<string, StationView>();
  private hops: HopView[] = [];
  private particles: Particle[] = [];
  private scenario: Scenario | null = null;
  private colors: Record<string, THREE.Color> = {};
  private light = false;
  private raf = 0;
  private timer = new THREE.Timer();
  private ro: ResizeObserver;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private hovered: StationView | null = null;

  /** stepper state */
  playing = true;
  speed = 1;
  private step = 0;
  private stepT = 0;
  private holdUntil = 0;
  private traffic = false;
  private trafficAcc = 0;
  private selected: string | null = null;
  private active = true;

  /** Hidden (kept-alive) views stop rendering: no WebGL work in the background. */
  setActive(active: boolean) {
    this.active = active;
    if (active) this.resize();
  }

  constructor(private host: HTMLElement, private cb: DotsCallbacks, private reduceMotion = false) {
    this.readTheme();
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.domElement.style.display = 'block';
    host.appendChild(this.renderer.domElement);

    this.labels = new CSS2DRenderer();
    Object.assign(this.labels.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
    host.appendChild(this.labels.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.48;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 80;

    this.scene.add(this.world);
    this.scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x0a0f1e, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(6, 12, 8);
    this.scene.add(key);
    this.setupPost();

    this.renderer.domElement.addEventListener('pointermove', this.onMove);
    this.renderer.domElement.addEventListener('click', this.onClick);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    this.loop();
  }

  // ── theme ──────────────────────────────────────────────────────────────
  readTheme() {
    this.light = document.documentElement.dataset.theme === 'light';
    const cs = getComputedStyle(document.documentElement);
    for (const l of ['frontend', 'api', 'service', 'data', 'infra', 'external']) this.colors[l] = new THREE.Color(cs.getPropertyValue(`--l-${l}`).trim() || '#94a3b8');
    this.colors.accent = new THREE.Color(cs.getPropertyValue('--accent').trim() || '#22e6ff');
    this.colors.lime = new THREE.Color(cs.getPropertyValue('--lime').trim() || '#b4ff39');
    this.colors.bg = new THREE.Color(cs.getPropertyValue('--bg').trim() || '#070b16');
    this.colors.line = new THREE.Color(this.light ? '#94a3b8' : '#334155');
  }

  setTheme() {
    this.readTheme();
    this.setupPost();
    if (this.scenario) this.setScenario(this.scenario, this.step);
  }

  private setupPost() {
    this.scene.background = this.light ? null : this.colors.bg;
    this.scene.fog = this.light ? null : new THREE.FogExp2(this.colors.bg.getHex(), 0.022);
    if (this.light) {
      this.composer = null;
      return;
    }
    const size = this.renderer.getSize(new THREE.Vector2());
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(size.x || 1, size.y || 1), 0.7, 0.5, 0.2));
    this.composer.addPass(new OutputPass());
    this.composer.setSize(size.x || 1, size.y || 1);
  }

  private resize() {
    const w = this.host.clientWidth || 1;
    const h = this.host.clientHeight || 1;
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ── scenario ───────────────────────────────────────────────────────────
  setScenario(s: Scenario, startStep = 0) {
    this.scenario = s;
    this.clearWorld();
    const positions = layoutStations(s);
    for (const st of s.stations) this.addStation(st, positions.get(st.id)!);
    // floor
    const grid = new THREE.GridHelper(80, 80, this.colors.line, this.colors.line);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = this.light ? 0.14 : 0.22;
    grid.position.y = -0.02;
    this.world.add(grid);
    // arcs
    s.hops.forEach((hop) => {
      const a = this.stations.get(hop.from)?.pos;
      const b = this.stations.get(hop.to)?.pos;
      if (!a || !b) return;
      const resp = hop.direction === 'response';
      const p0 = a.clone().setY(1.0);
      const p1 = b.clone().setY(1.0);
      const mid = p0.clone().lerp(p1, 0.5);
      const dist = p0.distanceTo(p1);
      mid.y += Math.max(0.9, dist * (resp ? 0.22 : 0.36));
      // offset request/response arcs sideways so they don't overlap
      const side = new THREE.Vector3().subVectors(p1, p0).cross(new THREE.Vector3(0, 1, 0)).normalize().multiplyScalar(resp ? 0.35 : -0.35);
      mid.add(side);
      const curve = new THREE.QuadraticBezierCurve3(p0, mid, p1);
      const geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(48));
      const color = (resp ? this.colors.lime : this.colors[this.stations.get(hop.to)!.station.layer]).clone();
      const mat = hop.confidence === 'inferred'
        ? new THREE.LineDashedMaterial({ color, dashSize: 0.18, gapSize: 0.14, transparent: true, opacity: 0.25 })
        : new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.25 });
      const line = new THREE.Line(geo, mat);
      if (hop.confidence === 'inferred') line.computeLineDistances();
      this.world.add(line);
      this.hops.push({ hop, curve, line });
    });
    this.frame();
    this.setStep(startStep);
  }

  private clearWorld() {
    for (const p of this.particles) {
      this.scene.remove(p.mesh, p.trail);
      p.trail.geometry.dispose();
    }
    this.particles = [];
    for (const v of this.stations.values()) v.label.element.remove();
    this.world.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose?.();
    });
    this.world.clear();
    this.stations.clear();
    this.hops = [];
  }

  private addStation(st: Station, pos: THREE.Vector3) {
    const color = this.colors[st.layer] ?? this.colors.accent;
    const group = new THREE.Group();
    group.position.copy(pos);
    // platform
    const plat = new THREE.Mesh(
      new THREE.CylinderGeometry(1.05, 1.15, 0.12, 6),
      new THREE.MeshStandardMaterial({ color: this.light ? 0xf1f5fb : 0x0d1427, metalness: 0.4, roughness: 0.6, emissive: color, emissiveIntensity: this.light ? 0.04 : 0.08 }),
    );
    plat.position.y = 0.06;
    group.add(plat);
    const rim = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.CylinderGeometry(1.06, 1.16, 0.12, 6)), new THREE.LineBasicMaterial({ color, transparent: true, opacity: st.confidence === 'inferred' ? 0.4 : 0.9 }));
    rim.position.y = 0.06;
    group.add(rim);
    // arrival ripple
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.0, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.14;
    group.add(ring);

    const { model, tick } = buildModel(st.kind, color, this.light, st.confidence === 'inferred');
    model.position.y = 0.14;
    group.add(model);
    group.traverse((o) => (o.userData.stationId = st.id));

    const el = document.createElement('div');
    el.className = 'dots-label';
    el.innerHTML = `<div class="dots-label-title"></div><div class="dots-label-sub"></div>`;
    (el.firstChild as HTMLElement).textContent = st.label;
    (el.lastChild as HTMLElement).textContent = st.sub;
    el.style.setProperty('--c', `#${color.getHexString()}`);
    if (st.confidence === 'inferred') el.classList.add('inferred');
    const label = new CSS2DObject(el);
    label.position.set(0, 2.25, 0);
    group.add(label);

    this.world.add(group);
    this.stations.set(st.id, { station: st, group, model, pos, tick, pulse: 0, ring, label });
  }

  /** Fit the camera to the stations, using both the horizontal and vertical field of view. */
  frame() {
    const box = new THREE.Box3();
    for (const v of this.stations.values()) box.expandByPoint(v.pos);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const vFov = (this.camera.fov * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect);
    const halfW = size.x / 2 + 2.4;
    const halfD = size.z / 2 + 2.6;
    const dist = Math.max(halfW / Math.tan(hFov / 2), halfD / Math.tan(vFov / 2), 9) * 1.08;
    const elev = 0.86; // ~50° above the floor: rows of branches stay readable
    this.controls.target.copy(center).setY(0.9);
    this.camera.position.set(center.x, 0.9 + dist * Math.sin(elev), center.z + dist * Math.cos(elev));
    this.controls.update();
  }

  // ── stepping ───────────────────────────────────────────────────────────
  setStep(i: number) {
    if (!this.scenario || !this.hops.length) return;
    this.step = ((i % this.hops.length) + this.hops.length) % this.hops.length;
    this.stepT = this.reduceMotion ? 1 : 0;
    this.holdUntil = 0;
    this.highlight();
    this.cb.onStep(this.step);
    if (!this.reduceMotion) this.spawn(this.step, false);
    else this.arrive(this.hops[this.step].hop.to);
  }

  next() {
    this.setStep(this.step + 1);
  }

  prev() {
    this.setStep(this.step - 1);
  }

  setTraffic(on: boolean) {
    this.traffic = on;
  }

  setSelected(id: string | null) {
    this.selected = id;
    this.highlight();
  }

  private highlight() {
    const active = this.hops[this.step];
    for (const h of this.hops) {
      const on = h === active;
      (h.line.material as THREE.LineBasicMaterial).opacity = on ? 1 : h.hop.direction === 'response' ? 0.14 : 0.3;
    }
    for (const v of this.stations.values()) {
      const involved = active && (active.hop.from === v.station.id || active.hop.to === v.station.id);
      v.label.element.classList.toggle('active', Boolean(involved));
      v.label.element.classList.toggle('selected', v.station.id === this.selected);
    }
  }

  private spawn(hopIndex: number, ambient: boolean) {
    const hv = this.hops[hopIndex];
    if (!hv) return;
    const resp = hv.hop.direction === 'response';
    const color = resp ? this.colors.lime : this.colors.accent;
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(ambient ? 0.08 : 0.14, 16, 12),
      new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(this.light ? 0.8 : 2.2) }),
    );
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL * 3), 3));
    const colors = new Float32Array(TRAIL * 3);
    for (let k = 0; k < TRAIL; k++) {
      const f = 1 - k / TRAIL;
      colors.set([color.r * f, color.g * f, color.b * f], k * 3);
    }
    trailGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: ambient ? 0.5 : 0.9 }));
    const start = hv.curve.getPoint(0);
    mesh.position.copy(start);
    this.scene.add(mesh, trail);
    if (!ambient) {
      // only one "main" dot at a time
      for (const p of this.particles.filter((x) => !x.ambient)) this.kill(p);
    }
    this.particles.push({ mesh, trail, history: Array.from({ length: TRAIL }, () => start.clone()), hop: hopIndex, t: 0, speed: ambient ? 0.5 + Math.random() * 0.6 : 1, ambient });
  }

  private kill(p: Particle) {
    this.scene.remove(p.mesh, p.trail);
    p.mesh.geometry.dispose();
    (p.mesh.material as THREE.Material).dispose();
    p.trail.geometry.dispose();
    (p.trail.material as THREE.Material).dispose();
    this.particles = this.particles.filter((x) => x !== p);
  }

  private arrive(stationId: string) {
    const v = this.stations.get(stationId);
    if (v) v.pulse = 1;
  }

  // ── interaction ────────────────────────────────────────────────────────
  private pick(e: MouseEvent): StationView | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.world.children, true).find((h) => h.object.userData.stationId);
    return hit ? this.stations.get(hit.object.userData.stationId) ?? null : null;
  }

  private onMove = (e: PointerEvent) => {
    const v = this.pick(e);
    if (v !== this.hovered) {
      this.hovered = v;
      this.renderer.domElement.style.cursor = v ? 'pointer' : 'grab';
    }
  };

  private onClick = (e: MouseEvent) => {
    this.cb.onPick(this.pick(e)?.station ?? null);
  };

  // ── loop ───────────────────────────────────────────────────────────────
  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    this.timer.update();
    if (!this.active) return;
    const dt = Math.min(0.05, this.timer.getDelta());
    const time = this.timer.getElapsed();
    this.controls.update();

    // main stepper
    if (this.scenario && this.hops.length && this.playing && !this.reduceMotion) {
      const hv = this.hops[this.step];
      const duration = Math.max(0.55, Math.min(1.6, hv.curve.getLength() / 6)) / this.speed;
      if (this.holdUntil) {
        if (time >= this.holdUntil) this.setStep(this.step + 1);
      } else {
        this.stepT += dt / duration;
        if (this.stepT >= 1) {
          this.stepT = 1;
          this.arrive(hv.hop.to);
          // pause at the end of the trace, otherwise a short beat between hops
          this.holdUntil = time + (this.step === this.hops.length - 1 ? 1.4 : 0.18) / this.speed;
        }
      }
    }

    // ambient traffic: dots on every hop
    if (this.traffic && this.hops.length && !this.reduceMotion) {
      this.trafficAcc += dt * 9 * this.speed;
      while (this.trafficAcc > 1) {
        this.trafficAcc -= 1;
        if (this.particles.length < 140) this.spawn(Math.floor(Math.random() * this.hops.length), true);
      }
    }

    // particles
    for (const p of [...this.particles]) {
      const hv = this.hops[p.hop];
      if (!hv) {
        this.kill(p);
        continue;
      }
      if (p.ambient) {
        const duration = Math.max(0.6, hv.curve.getLength() / 6) / (this.speed * p.speed);
        p.t += dt / duration;
      } else {
        p.t = this.stepT;
      }
      const e = easeInOut(Math.min(1, p.t));
      const pos = hv.curve.getPoint(e);
      p.mesh.position.copy(pos);
      p.history.unshift(pos.clone());
      p.history.length = TRAIL;
      const attr = p.trail.geometry.getAttribute('position') as THREE.BufferAttribute;
      p.history.forEach((v, k) => attr.setXYZ(k, v.x, v.y, v.z));
      attr.needsUpdate = true;
      if (p.ambient && p.t >= 1) {
        this.arrive(hv.hop.to);
        this.kill(p);
      }
    }

    // station idle animation + arrival pulse
    for (const v of this.stations.values()) {
      v.tick(time);
      if (v.pulse > 0) {
        v.pulse = Math.max(0, v.pulse - dt * 1.6);
        const k = 1 - v.pulse;
        v.ring.scale.setScalar(1 + k * 0.9);
        (v.ring.material as THREE.MeshBasicMaterial).opacity = v.pulse * 0.9;
        v.model.scale.setScalar(1 + Math.sin(k * Math.PI) * 0.12);
      }
      const sel = v.station.id === this.selected;
      v.model.position.y = 0.14 + (sel ? 0.12 + Math.sin(time * 3) * 0.05 : 0);
    }

    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
  };

  snapshot(): string {
    return this.renderer.domElement.toDataURL('image/png');
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.clearWorld();
    this.controls.dispose();
    this.renderer.domElement.removeEventListener('pointermove', this.onMove);
    this.renderer.domElement.removeEventListener('click', this.onClick);
    this.composer?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labels.domElement.remove();
  }
}

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// ── layout ─────────────────────────────────────────────────────────────────

/**
 * Tidy tree: the first request hop into a station defines its parent. Depth runs
 * left → right (client … database), branches fan out in rows, parents sit centred
 * on their children.
 */
function layoutStations(s: Scenario): Map<string, THREE.Vector3> {
  const children = new Map<string, string[]>();
  const parent = new Map<string, string>();
  const root = s.stations[0]?.id;
  for (const h of s.hops) {
    if (h.direction !== 'request' || h.to === root || parent.has(h.to) || h.from === h.to) continue;
    parent.set(h.to, h.from);
    if (!children.has(h.from)) children.set(h.from, []);
    children.get(h.from)!.push(h.to);
  }
  const depth = new Map<string, number>();
  const row = new Map<string, number>();
  let nextRow = 0;
  const walk = (id: string, d: number) => {
    depth.set(id, d);
    const kids = children.get(id) ?? [];
    if (!kids.length) {
      row.set(id, nextRow++);
      return;
    }
    for (const k of kids) walk(k, d + 1);
    row.set(id, (row.get(kids[0])! + row.get(kids[kids.length - 1])!) / 2);
  };
  if (root) walk(root, 0);
  for (const st of s.stations) if (!depth.has(st.id)) walk(st.id, 1); // orphans
  const maxD = Math.max(0, ...depth.values());
  const rows = Math.max(1, nextRow);
  const out = new Map<string, THREE.Vector3>();
  for (const st of s.stations) {
    out.set(st.id, new THREE.Vector3((depth.get(st.id)! - maxD / 2) * SPACING, 0, (row.get(st.id)! - (rows - 1) / 2) * LANE));
  }
  return out;
}

// ── models ─────────────────────────────────────────────────────────────────

type Built = { model: THREE.Group; tick: (t: number) => void };

function materials(color: THREE.Color, light: boolean, ghost: boolean) {
  const body = new THREE.MeshStandardMaterial({
    color: light ? new THREE.Color('#ffffff') : new THREE.Color('#0f1a33'),
    metalness: 0.55,
    roughness: 0.35,
    emissive: color,
    emissiveIntensity: light ? 0.08 : 0.18,
    transparent: ghost,
    opacity: ghost ? 0.45 : 1,
  });
  const glow = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: light ? 0.6 : 1.6, metalness: 0.2, roughness: 0.4, transparent: ghost, opacity: ghost ? 0.5 : 1 });
  const edge = new THREE.LineBasicMaterial({ color, transparent: true, opacity: ghost ? 0.5 : 0.95 });
  return { body, glow, edge };
}

function withEdges(mesh: THREE.Mesh, edge: THREE.LineBasicMaterial) {
  const lines = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 25), edge);
  lines.position.copy(mesh.position);
  lines.rotation.copy(mesh.rotation);
  lines.scale.copy(mesh.scale);
  return lines;
}

function buildModel(kind: StationKind, color: THREE.Color, light: boolean, ghost: boolean): Built {
  const g = new THREE.Group();
  const { body, glow, edge } = materials(color, light, ghost);
  const add = (m: THREE.Mesh, edges = true) => {
    g.add(m);
    if (edges) g.add(withEdges(m, edge));
    return m;
  };
  let tick: (t: number) => void = () => {};

  switch (kind) {
    case 'client': {
      // laptop: base + tilted screen with a glowing UI
      const base = add(new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 1.0), body));
      base.position.y = 0.06;
      const screen = add(new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.95, 0.06), body));
      screen.position.set(0, 0.58, -0.46);
      screen.rotation.x = -0.18;
      const ui = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.78), glow);
      ui.position.set(0, 0.58, -0.42);
      ui.rotation.x = -0.18;
      g.add(ui);
      tick = (t) => ((glow.emissiveIntensity = (light ? 0.5 : 1.6) + Math.sin(t * 2) * 0.25));
      break;
    }
    case 'component':
    case 'bundle': {
      // stacked UI cards
      const cards: THREE.Mesh[] = [];
      for (let i = 0; i < 3; i++) {
        const c = add(new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.75), i === 2 ? glow : body));
        c.position.y = 0.25 + i * 0.32;
        cards.push(c);
      }
      tick = (t) => cards.forEach((c, i) => (c.position.y = 0.25 + i * 0.32 + Math.sin(t * 1.6 + i) * 0.05));
      break;
    }
    case 'dns': {
      const post = add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.3, 8), body));
      post.position.y = 0.65;
      const sign = add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.06), glow));
      sign.position.set(0.25, 1.1, 0);
      const sign2 = add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.26, 0.06), body));
      sign2.position.set(-0.2, 0.72, 0);
      sign2.rotation.y = 0.5;
      break;
    }
    case 'edge': {
      // wireframe globe with an orbit ring (CDN / edge network)
      const globe = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 1), body);
      globe.position.y = 0.85;
      g.add(globe);
      const wire = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(0.64, 1)), edge);
      wire.position.y = 0.85;
      g.add(wire);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.025, 8, 64), glow);
      ring.position.y = 0.85;
      ring.rotation.x = Math.PI / 2.4;
      g.add(ring);
      tick = (t) => {
        globe.rotation.y = wire.rotation.y = t * 0.4;
        ring.rotation.z = t * 0.8;
      };
      break;
    }
    case 'origin':
    case 'handler': {
      // router / API gateway: hex prism with glowing ports
      const prism = add(new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.5, 6), body));
      prism.position.y = 0.4;
      const top = add(new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.62, 0.22, 6), body));
      top.position.y = 0.76;
      const ports: THREE.Mesh[] = [];
      for (let i = 0; i < 6; i++) {
        const p = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), glow);
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        p.position.set(Math.cos(a) * 0.55, 0.4, Math.sin(a) * 0.55);
        g.add(p);
        ports.push(p);
      }
      const beacon = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), glow);
      beacon.position.y = 1.12;
      g.add(beacon);
      tick = (t) => {
        beacon.rotation.y = t * 1.5;
        beacon.position.y = 1.12 + Math.sin(t * 2) * 0.05;
        ports.forEach((p, i) => p.scale.setScalar(0.8 + 0.4 * Math.max(0, Math.sin(t * 4 - i))));
      };
      break;
    }
    case 'service':
    case 'repository': {
      // processor chip with pins and a spinning core
      const chip = add(new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.16, 1.0), body));
      chip.position.y = 0.3;
      for (let i = 0; i < 4; i++) {
        for (const side of [-1, 1]) {
          const pin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.22), glow);
          pin.position.set(-0.36 + i * 0.24, 0.26, side * 0.6);
          g.add(pin);
          const pin2 = pin.clone();
          pin2.rotation.y = Math.PI / 2;
          pin2.position.set(side * 0.6, 0.26, -0.36 + i * 0.24);
          g.add(pin2);
        }
      }
      const core = new THREE.Mesh(kind === 'repository' ? new THREE.TorusKnotGeometry(0.22, 0.06, 64, 8) : new THREE.OctahedronGeometry(0.3, 0), glow);
      core.position.y = 0.78;
      g.add(core);
      tick = (t) => {
        core.rotation.y = t * 1.2;
        core.rotation.x = t * 0.6;
      };
      break;
    }
    case 'orm': {
      // translator: two offset prisms connected by a glowing bar
      const a = add(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), body));
      a.position.set(-0.35, 0.5, 0);
      const b = add(new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.48, 16), body));
      b.position.set(0.35, 0.5, 0);
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 8), glow);
      bar.rotation.z = Math.PI / 2;
      bar.position.y = 0.5;
      g.add(bar);
      tick = (t) => {
        a.rotation.y = t * 0.8;
        bar.scale.y = 0.8 + Math.sin(t * 3) * 0.2;
      };
      break;
    }
    case 'db': {
      // classic stacked database cylinders
      const disks: THREE.Mesh[] = [];
      for (let i = 0; i < 3; i++) {
        const d = add(new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.3, 32), body));
        d.position.y = 0.22 + i * 0.36;
        disks.push(d);
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.02, 6, 48), glow);
        band.rotation.x = Math.PI / 2;
        band.position.y = 0.38 + i * 0.36;
        g.add(band);
      }
      tick = (t) => disks.forEach((d, i) => (d.rotation.y = t * (0.2 + i * 0.1)));
      break;
    }
    case 'cache': {
      // fast in-memory store: wire cube with a spinning glowing core
      const shell = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.95, 0.95, 0.95)), edge);
      shell.position.y = 0.66;
      g.add(shell);
      const core = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.45), glow);
      core.position.y = 0.66;
      g.add(core);
      const bolt = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.35, 4), glow);
      bolt.position.y = 1.35;
      g.add(bolt);
      tick = (t) => {
        core.rotation.set(t * 1.4, t * 1.1, 0);
        shell.rotation.y = -t * 0.3;
        bolt.position.y = 1.35 + Math.sin(t * 5) * 0.04;
      };
      break;
    }
    case 'queue': {
      // conveyor with boxes moving along it
      const belt = add(new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.5), body));
      belt.position.y = 0.3;
      const boxes: THREE.Mesh[] = [];
      for (let i = 0; i < 4; i++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), glow);
        b.position.y = 0.46;
        g.add(b);
        boxes.push(b);
      }
      tick = (t) => boxes.forEach((b, i) => (b.position.x = (((t * 0.35 + i / 4) % 1) - 0.5) * 1.4));
      break;
    }
    case 'external':
    case 'thirdparty': {
      // satellite: body + solar panels + dish
      const sat = add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), body));
      sat.position.y = 0.95;
      for (const s of [-1, 1]) {
        const panel = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.02, 0.32), glow);
        panel.position.set(s * 0.55, 0.95, 0);
        g.add(panel);
      }
      const dish = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.16, 16, 1, true), glow);
      dish.position.set(0, 0.7, 0);
      dish.rotation.x = Math.PI;
      g.add(dish);
      const holder = g.children.slice(-5);
      tick = (t) => {
        const y = Math.sin(t * 1.3) * 0.08;
        holder.forEach((o) => (o.position.y = (o === dish ? 0.7 : 0.95) + y));
        g.rotation.y = Math.sin(t * 0.4) * 0.5;
      };
      break;
    }
  }
  return { model: g, tick };
}
