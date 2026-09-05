import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/**
 * Parametric 3D model of a wood portable building.
 *
 * Everything is modelled in feet at 1:1 and the camera is framed from the
 * footprint, so a 6x6 coop and a 12x32 garage both arrive on screen correctly
 * without per-model tuning. Geometry is rebuilt from scratch on every change
 * rather than mutated: the models are small enough that it costs nothing, and
 * it removes a whole class of bug where a stale door survives a size change.
 */

export type RoofProfile = 'gable' | 'gambrel' | 'lean-to';
export type WallId = 'front' | 'back' | 'left' | 'right';

export interface PlacedAddOn {
  slug: string;
  kind: 'door' | 'window' | 'ramp';
  wall: WallId;
  /** Opening size in feet. */
  w: number;
  h: number;
}

export interface DesignState {
  widthFt: number;
  lengthFt: number;
  wallFt: number;
  ridgeFt: number;
  roof: RoofProfile;
  paintHex: string;
  trimHex: string;
  roofHex: string;
  roofTexture?: string;
  addOns: PlacedAddOn[];
}

const TRIM_DEPTH = 0.12;
/** Wall thickness. Deep enough that an opening has a reveal you can see. */
const WALL_DEPTH = 0.34;

/**
 * Whether a colour is light, by relative luminance.
 *
 * Openings used to be filled with a fixed cream panel, which vanished against
 * Delicate White and Waves of Grain -- a visitor placed a garage door and the
 * building looked unchanged. The fill now flips with the wall behind it.
 */
function isLight(hex: string) {
  const c = new THREE.Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b > 0.45;
}

export class BuildingScene {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private group = new THREE.Group();
  private host: HTMLElement;
  private texLoader = new THREE.TextureLoader();
  private texCache = new Map<string, THREE.Texture>();
  private raf = 0;
  private state!: DesignState;
  /** Where the camera is gliding to, while it is gliding there. */
  private flyTo: THREE.Vector3 | null = null;

  constructor(host: HTMLElement) {
    this.host = host;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 400);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 8;
    this.controls.maxDistance = 140;
    // Stop the camera dropping below the ground plane, which reads as a bug.
    this.controls.maxPolarAngle = Math.PI / 2 - 0.04;
    // A drag wins over an in-flight camera move; otherwise the two fight.
    this.controls.addEventListener('start', () => { this.flyTo = null; });

    this.addLighting();
    this.scene.add(this.group);

    this.onResize = this.onResize.bind(this);
    addEventListener('resize', this.onResize);
    this.onResize();
    this.tick();
  }

  private addLighting() {
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x9a8f80, 2.0));
    const sun = new THREE.DirectionalLight(0xfff6e8, 2.4);
    sun.position.set(26, 34, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const d = 34;
    Object.assign(sun.shadow.camera, { left: -d, right: d, top: d, bottom: -d, near: 1, far: 120 });
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xdfe8ff, 0.5);
    fill.position.set(-20, 14, -16);
    this.scene.add(fill);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(90, 64).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x8ea06d, roughness: 1 })
    );
    ground.receiveShadow = true;
    ground.position.y = -0.01;
    this.scene.add(ground);
  }

  private texture(url: string, repeat: number) {
    const key = `${url}@${repeat}`;
    const hit = this.texCache.get(key);
    if (hit) return hit;
    const t = this.texLoader.load(url);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.colorSpace = THREE.SRGBColorSpace;
    this.texCache.set(key, t);
    return t;
  }

  private clear() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
    this.group.clear();
  }

  /** Rebuild everything from the current state. */
  render(state: DesignState) {
    this.state = state;
    this.clear();

    const { widthFt: w, lengthFt: l, wallFt: wallH, ridgeFt: ridgeH, roof } = state;
    const paint = new THREE.MeshStandardMaterial({ color: state.paintHex, roughness: 0.86 });
    const trim = new THREE.MeshStandardMaterial({ color: state.trimHex, roughness: 0.7 });
    const isMetal = !state.roofTexture;
    const roofMat = new THREE.MeshStandardMaterial({
      color: state.roofTexture ? 0xffffff : state.roofHex,
      roughness: state.roofTexture ? 0.92 : 0.42,
      metalness: isMetal ? 0.28 : 0.0,
      ...(state.roofTexture ? { map: this.texture(state.roofTexture, Math.max(2, Math.round(l / 3))) } : {}),
    });

    // ---- skids and floor ----
    const skid = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.5, 0.42), trim);
    for (const z of [-l / 2 + 0.8, 0, l / 2 - 0.8]) {
      const s = skid.clone();
      s.position.set(0, 0.25, z);
      s.castShadow = true;
      this.group.add(s);
    }
    const deck = new THREE.Mesh(new THREE.BoxGeometry(w, 0.22, l), trim);
    deck.position.y = 0.61;
    deck.castShadow = deck.receiveShadow = true;
    this.group.add(deck);

    const y0 = 0.72;

    // ---- walls, with openings cut for each placed add-on ----
    for (const wall of ['front', 'back', 'left', 'right'] as WallId[]) {
      this.group.add(this.buildWall(wall, w, l, wallH, y0, paint, trim, state));
    }

    // ---- gable ends and roof ----
    this.group.add(...this.buildRoof(w, l, wallH, ridgeH, roof, y0, roofMat, paint));

    // ---- corner trim ----
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, wallH, 0.3), trim);
      post.position.set(sx * (w / 2 - 0.14), y0 + wallH / 2, sz * (l / 2 - 0.14));
      post.castShadow = true;
      this.group.add(post);
    }

    // ---- ramps sit on the ground in front of their wall ----
    for (const a of state.addOns.filter((x) => x.kind === 'ramp')) {
      this.group.add(this.buildRamp(a, w, l, y0));
    }

    this.frameCamera(w, l, ridgeH);
  }

  /**
   * A wall with rectangular holes punched for its openings, built as a shape
   * with holes rather than by stacking panels around each opening — that keeps
   * the geometry correct no matter how many are placed or how they overlap the
   * edges.
   */
  private buildWall(
    wall: WallId, w: number, l: number, wallH: number, y0: number,
    paint: THREE.Material, trim: THREE.Material, state: DesignState
  ) {
    const horizontal = wall === 'front' || wall === 'back';
    const span = horizontal ? w : l;
    const items = state.addOns.filter((a) => a.wall === wall && a.kind !== 'ramp');

    const shape = new THREE.Shape();
    shape.moveTo(-span / 2, 0);
    shape.lineTo(span / 2, 0);
    shape.lineTo(span / 2, wallH);
    shape.lineTo(-span / 2, wallH);
    shape.closePath();

    const placements = this.layout(items, span);
    placements.forEach(({ item, x }) => {
      const sill = item.kind === 'door' ? 0.02 : Math.max(0.9, wallH * 0.42);
      const hole = new THREE.Path();
      hole.moveTo(x - item.w / 2, sill);
      hole.lineTo(x + item.w / 2, sill);
      hole.lineTo(x + item.w / 2, Math.min(sill + item.h, wallH - 0.25));
      hole.lineTo(x - item.w / 2, Math.min(sill + item.h, wallH - 0.25));
      hole.closePath();
      shape.holes.push(hole);
    });

    const geo = new THREE.ExtrudeGeometry(shape, { depth: WALL_DEPTH, bevelEnabled: false });
    const mesh = new THREE.Mesh(geo, paint);
    mesh.castShadow = mesh.receiveShadow = true;

    const g = new THREE.Group();
    g.add(mesh);

    // Fill each opening so it reads as a door or a window from any angle:
    // a dark cavity for depth, the leaf recessed into it, and the casing
    // standing proud of the cladding the way a real trim board does.
    const wallIsLight = isLight(state.paintHex);
    const leafHex = wallIsLight ? 0x6f6a63 : 0xe8e4dc;
    placements.forEach(({ item, x }) => {
      const sill = item.kind === 'door' ? 0.02 : Math.max(0.9, wallH * 0.42);
      const h = Math.min(item.h, wallH - 0.25 - sill);
      const isGlass = item.kind === 'window' || item.slug === 'nine-lite-door';

      // Cavity: closes the hole and gives the reveal something dark to shade
      // against, so the opening is legible even on a white building.
      const cavity = new THREE.Mesh(
        new THREE.BoxGeometry(item.w, h, 0.06),
        new THREE.MeshStandardMaterial({ color: 0x241f1c, roughness: 1 })
      );
      cavity.position.set(x, sill + h / 2, 0.03);
      g.add(cavity);

      const leaf = new THREE.Mesh(
        new THREE.BoxGeometry(item.w - 0.12, h - 0.12, 0.08),
        isGlass
          ? new THREE.MeshStandardMaterial({
              color: 0x8fb6cc, roughness: 0.08, metalness: 0.25,
              transparent: true, opacity: 0.86,
            })
          : new THREE.MeshStandardMaterial({ color: leafHex, roughness: 0.55 })
      );
      leaf.position.set(x, sill + h / 2, 0.13);
      leaf.castShadow = true;
      g.add(leaf);

      // Casing, mitred look: four boards rather than one slab, so the corners
      // read and the opening keeps its outline against same-tone paint.
      const board = 0.16;
      const casing: [number, number, number, number][] = [
        [item.w + board * 2, board, x, sill + h + board / 2],
        [item.w + board * 2, board, x, sill - board / 2],
        [board, h, x - item.w / 2 - board / 2, sill + h / 2],
        [board, h, x + item.w / 2 + board / 2, sill + h / 2],
      ];
      for (const [bw, bh, bx, by] of casing) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, TRIM_DEPTH), trim);
        m.position.set(bx, by, WALL_DEPTH + TRIM_DEPTH / 2 - 0.02);
        m.castShadow = m.receiveShadow = true;
        g.add(m);
      }
    });

    if (horizontal) {
      g.position.z = (wall === 'front' ? 1 : -1) * (l / 2);
      g.rotation.y = wall === 'front' ? 0 : Math.PI;
    } else {
      g.position.x = (wall === 'right' ? 1 : -1) * (w / 2);
      g.rotation.y = wall === 'right' ? Math.PI / 2 : -Math.PI / 2;
    }
    g.position.y = y0;
    return g;
  }

  /** Spread openings evenly along a wall, widest first so a garage door centres. */
  private layout(items: PlacedAddOn[], span: number) {
    const sorted = [...items].sort((a, b) => b.w - a.w);
    const usable = span - 1.2;
    const total = sorted.reduce((n, i) => n + i.w, 0);
    const gap = sorted.length > 1 ? Math.max(0.4, (usable - total) / (sorted.length - 1)) : 0;
    let cursor = -Math.min(total + gap * (sorted.length - 1), usable) / 2;
    return sorted.map((item) => {
      const x = cursor + item.w / 2;
      cursor += item.w + gap;
      return { item, x };
    });
  }

  private buildRoof(
    w: number, l: number, wallH: number, ridgeH: number,
    roof: RoofProfile, y0: number, roofMat: THREE.Material, paint: THREE.Material
  ) {
    const out: THREE.Object3D[] = [];
    const over = 0.55;              // eave overhang
    const top = y0 + wallH;
    const rise = ridgeH - wallH;

    // Cross-section profile in the width axis, from left eave to right eave.
    let profile: [number, number][];
    if (roof === 'gambrel') {
      profile = [
        [-w / 2 - over, 0], [-w / 2 * 0.62, rise * 0.62], [0, rise],
        [w / 2 * 0.62, rise * 0.62], [w / 2 + over, 0],
      ];
    } else if (roof === 'lean-to') {
      profile = [[-w / 2 - over, 0], [w / 2 + over, rise]];
    } else {
      profile = [[-w / 2 - over, 0], [0, rise], [w / 2 + over, 0]];
    }

    // roof planes
    for (let i = 0; i < profile.length - 1; i++) {
      const [x1, y1] = profile[i];
      const [x2, y2] = profile[i + 1];
      const len = Math.hypot(x2 - x1, y2 - y1);
      const plane = new THREE.Mesh(new THREE.BoxGeometry(len, 0.16, l + over * 2), roofMat);
      plane.position.set((x1 + x2) / 2, top + (y1 + y2) / 2, 0);
      plane.rotation.z = Math.atan2(y2 - y1, x2 - x1);
      plane.castShadow = plane.receiveShadow = true;
      out.push(plane);
    }

    // gable ends, filling the triangle (or trapezoid) above the wall line
    if (roof !== 'lean-to' || true) {
      for (const z of [l / 2, -l / 2]) {
        const shape = new THREE.Shape();
        shape.moveTo(-w / 2, 0);
        profile.forEach(([x, y], i) => {
          const cx = Math.max(-w / 2, Math.min(w / 2, x));
          if (i === 0) shape.lineTo(cx, y); else shape.lineTo(cx, y);
        });
        shape.lineTo(w / 2, 0);
        shape.closePath();
        const end = new THREE.Mesh(
          new THREE.ExtrudeGeometry(shape, { depth: 0.2, bevelEnabled: false }),
          paint
        );
        end.position.set(0, top, z - (z > 0 ? 0 : 0.2));
        end.castShadow = true;
        out.push(end);
      }
    }
    return out;
  }

  private buildRamp(a: PlacedAddOn, w: number, l: number, y0: number) {
    const rampW = a.w;
    const run = a.h;                       // "h" carries the run for ramps
    const geo = new THREE.BoxGeometry(rampW, 0.12, Math.hypot(run, y0));
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x6b7076, roughness: 0.55, metalness: 0.5 }));
    const angle = Math.atan2(y0, run);
    const horizontal = a.wall === 'front' || a.wall === 'back';
    const outward = a.wall === 'front' || a.wall === 'right' ? 1 : -1;
    if (horizontal) {
      mesh.position.set(0, y0 / 2, outward * (l / 2 + run / 2));
      mesh.rotation.x = outward * angle;
    } else {
      mesh.position.set(outward * (w / 2 + run / 2), y0 / 2, 0);
      mesh.rotation.z = -outward * angle;
      mesh.rotation.y = Math.PI / 2;
    }
    mesh.castShadow = true;
    return mesh;
  }

  /** Distance at which the whole building fits the frame. */
  private fitDistance(w: number, l: number, ridge: number) {
    const radius = Math.hypot(w, l) * 0.5 + ridge * 0.4;
    return (radius / Math.tan((this.camera.fov * Math.PI) / 360)) * 1.35;
  }

  private frameCamera(w: number, l: number, ridge: number) {
    const radius = Math.hypot(w, l) * 0.5 + ridge * 0.4;
    const dist = this.fitDistance(w, l, ridge);
    this.controls.target.set(0, ridge * 0.42, 0);
    if (!this.camera.userData.placed) {
      this.camera.position.set(dist * 0.72, dist * 0.46, dist * 0.72);
      this.camera.userData.placed = true;
    }
    this.controls.minDistance = radius * 0.9;
    this.controls.maxDistance = dist * 2.6;
    this.controls.update();
  }

  /** Frame the model again — used by the "reset view" control. */
  resetView() {
    this.camera.userData.placed = false;
    this.flyTo = null;
    if (this.state) this.frameCamera(this.state.widthFt, this.state.lengthFt, this.state.ridgeFt);
  }

  /**
   * Swing round to look at one wall.
   *
   * Without this the configurator looks broken: openings are placed on the
   * chosen wall, and three of the four faces are away from the default camera,
   * so adding a garage door changed nothing on screen. Called when the wall
   * selector moves and when an opening lands, three-quarter on rather than
   * straight on so the roof and the return wall stay in frame.
   */
  faceWall(wall: WallId) {
    if (!this.state) return;
    const { widthFt: w, lengthFt: l, ridgeFt: ridge } = this.state;
    const bearing: Record<WallId, number> = {
      front: 0,
      back: Math.PI,
      right: Math.PI / 2,
      left: -Math.PI / 2,
    };
    // A quarter turn off square so it reads as a building rather than an
    // elevation drawing, swung toward the near corner of the long side.
    const skew = (w > l ? 1 : -1) * 0.42;
    const a = bearing[wall] + skew;

    // Sit on the same orbit shell the default view uses, derived from the
    // footprint. Deriving it from the camera's current distance instead let
    // the radius shrink on each turn until the camera was inside the wall.
    const fit = this.fitDistance(w, l, ridge);
    const held = this.camera.position.distanceTo(this.controls.target);
    const dist = Math.min(Math.max(held, fit * 0.8), fit * 1.6);
    this.flyTo = new THREE.Vector3(
      Math.sin(a) * dist * 0.9,
      this.controls.target.y + Math.max(dist * 0.4, ridge * 0.3),
      Math.cos(a) * dist * 0.9
    );
  }

  private onResize() {
    const { clientWidth: w, clientHeight: h } = this.host;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private tick = () => {
    this.raf = requestAnimationFrame(this.tick);
    if (this.flyTo) {
      this.camera.position.lerp(this.flyTo, 0.12);
      // Close enough that another frame would not move a pixel.
      if (this.camera.position.distanceTo(this.flyTo) < 0.05) this.flyTo = null;
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  /** Data URL of the current view, for attaching to a quote. */
  snapshot(): string {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/png');
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    removeEventListener('resize', this.onResize);
    this.clear();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
