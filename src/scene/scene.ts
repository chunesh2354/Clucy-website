// The one WebGL scene behind the whole page. It draws, in order: the paper wipe, the field, the
// spatial-intelligence layers, and the dot. Everything moves from uniforms set in frame().
import * as THREE from "three";
import { CHAPTERS, STAGE_MAX, smooth, type CameraKey } from "../scroll/chapters";
import { buildField, buildLayers } from "./geometry";
import { DOT_FRAG, DOT_VERT, FIELD_VERT, LAYER_VERT, POINT_FRAG, WIPE_FRAG, WIPE_VERT } from "./shaders";
import { INK, ON_INK, ON_PAPER, PAPER } from "./palette";

const col = (hex: string) => new THREE.Color(hex);

export interface FrameInput {
  stage: number;
  /** Accumulated flow time; stops when the flow stops. */
  phase: number;
  /** Visibility of the four spatial layers: rooms, graph, daylight, view (0..1 each). */
  layers: [number, number, number, number];
  /** Pointer parallax, -1..1. */
  px: number;
  py: number;
  waiting: boolean;
}

export class FieldScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 900);
  private scene = new THREE.Scene();
  private field: THREE.Points;
  private shared: Record<string, THREE.IUniform>;
  private fieldMat: THREE.RawShaderMaterial;
  private layerMat: THREE.RawShaderMaterial;
  private dotMat: THREE.RawShaderMaterial;
  private wipeMat: THREE.RawShaderMaterial;
  private dpr = 1;
  readonly capacity: number;

  constructor(canvas: HTMLCanvasElement, count: number, maxDpr: number) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setClearColor(col(INK), 1);
    this.dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    this.renderer.setPixelRatio(this.dpr);
    this.capacity = count;

    // uniforms shared by every material (the same objects, so one write updates all)
    this.shared = {
      uPhase: { value: 0 },
      uDpr: { value: this.dpr },
      uPxPerUnit: { value: 600 },
      uSize: { value: 0.04 },
      uRes: { value: new THREE.Vector2(1, 1) },
      uWipeC: { value: new THREE.Vector2(0, 0) },
      uWipeR: { value: 0 },
    };
    const raw = (vertexShader: string, fragmentShader: string, extra: Record<string, THREE.IUniform>) =>
      new THREE.RawShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader,
        fragmentShader,
        uniforms: { ...this.shared, ...extra },
        transparent: true,
        depthTest: false,
        depthWrite: false,
      });

    this.wipeMat = raw(WIPE_VERT, WIPE_FRAG, { uPaper: { value: col(PAPER) } });
    const wipe = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.wipeMat);
    wipe.frustumCulled = false;
    wipe.renderOrder = 0;

    this.fieldMat = raw(FIELD_VERT, POINT_FRAG, {
      uStage: { value: 0 },
      uInkWall: { value: col(ON_INK.wall) },
      uInkPeople: { value: col(ON_INK.people) },
      uInkFloor: { value: col(ON_INK.floor) },
      uInkStar: { value: col(ON_INK.star) },
      uPaperWall: { value: col(ON_PAPER.wall) },
      uPaperPeople: { value: col(ON_PAPER.people) },
      uPaperFloor: { value: col(ON_PAPER.floor) },
    });
    this.field = new THREE.Points(buildField(count), this.fieldMat);
    this.field.frustumCulled = false;
    this.field.renderOrder = 1;

    this.layerMat = raw(LAYER_VERT, POINT_FRAG, {
      uLayers: { value: new THREE.Vector4(0, 0, 0, 0) },
      uInkA: { value: col(ON_INK.wall) },
      uInkB: { value: col(ON_INK.people) },
      uPaperA: { value: col(ON_PAPER.wall) },
      uPaperB: { value: col(ON_PAPER.people) },
    });
    const layers = new THREE.Points(buildLayers(), this.layerMat);
    layers.frustumCulled = false;
    layers.renderOrder = 2;

    this.dotMat = raw(DOT_VERT, DOT_FRAG, { uDot: { value: 0.34 }, uDotCol: { value: col(ON_INK.dot) } });
    const dotGeo = new THREE.BufferGeometry();
    dotGeo.setAttribute("position", new THREE.Float32BufferAttribute([0, 0.05, 0], 3));
    const dot = new THREE.Points(dotGeo, this.dotMat);
    dot.frustumCulled = false;
    dot.renderOrder = 3;

    this.scene.add(wipe, this.field, layers, dot);
  }

  /** Draw only the first n points (the groups are mixed through the buffer, so the field keeps its look). */
  setCount(n: number) {
    this.field.geometry.setDrawRange(0, Math.min(n, this.capacity));
  }

  resize(w: number, h: number) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    (this.shared.uRes.value as THREE.Vector2).set(w * this.dpr, h * this.dpr);
  }

  private cameraAt(stage: number, px: number, py: number): CameraKey {
    const i = Math.min(STAGE_MAX - 1, Math.floor(stage));
    const t = smooth(stage - i);
    const A = CHAPTERS[i].cam;
    const B = CHAPTERS[Math.min(STAGE_MAX, i + 1)].cam;
    const mix = (a: number[], b: number[]) => a.map((v, k) => v + (b[k] - v) * t) as [number, number, number];
    const e = mix(A.e, B.e);
    const c = mix(A.c, B.c);
    // portrait screens: step back so the scene still fits the width
    const aspect = this.camera.aspect;
    if (aspect < 1.2) {
      const k = Math.pow(1.2 / aspect, 0.75);
      for (let j = 0; j < 3; j++) e[j] = c[j] + (e[j] - c[j]) * k;
    }
    e[0] += px * 1.6;
    e[1] += py * 0.9;
    return { e, c, fov: A.fov + (B.fov - A.fov) * t, shift: A.shift + (B.shift - A.shift) * t };
  }

  frame(f: FrameInput) {
    const cam = this.cameraAt(f.stage, f.px, f.py);
    this.camera.fov = cam.fov;
    const w = this.renderer.domElement.clientWidth;
    const h = this.renderer.domElement.clientHeight;
    // wide screens: the picture moves right of the text panel; phones: it moves up, above the docked panel
    const shift = w > 900 ? cam.shift : 0;
    const lift = w <= 760 && cam.shift > 0 ? 0.2 : 0;
    if (shift || lift) this.camera.setViewOffset(w, h, -shift * w, lift * h, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    this.camera.position.set(...cam.e);
    this.camera.lookAt(...cam.c);
    this.camera.updateMatrixWorld();

    const res = this.shared.uRes.value as THREE.Vector2;
    this.shared.uPhase.value = f.phase;
    this.shared.uPxPerUnit.value = res.y / (2 * Math.tan((cam.fov * Math.PI) / 360));
    this.fieldMat.uniforms.uStage.value = f.stage;
    (this.layerMat.uniforms.uLayers.value as THREE.Vector4).set(...f.layers);

    // the ink-to-paper wipe opens from the dot on the way into "rules" and closes on the way out of "space"
    const open = smooth((f.stage - 1.55) / 0.4) * (1 - smooth((f.stage - 3.55) / 0.4));
    const c = this.toScreen([0, 0.05, 0]);
    (this.shared.uWipeC.value as THREE.Vector2).set(c.x * this.dpr, res.y - c.y * this.dpr);
    this.shared.uWipeR.value = open <= 0.001 ? 0 : open * Math.hypot(res.x, res.y) * 1.05;
    const onPaper = open > 0.5;
    (this.dotMat.uniforms.uDotCol.value as THREE.Color).set(f.waiting ? (onPaper ? ON_PAPER.waiting : ON_INK.waiting) : onPaper ? ON_PAPER.dot : ON_INK.dot);

    this.renderer.render(this.scene, this.camera);
    return { paper: onPaper };
  }

  /** World point to CSS pixels in the canvas. */
  toScreen(p: [number, number, number] | number[]): { x: number; y: number; visible: boolean } {
    const v = new THREE.Vector3(p[0], p[1], p[2]).project(this.camera);
    const w = this.renderer.domElement.clientWidth;
    const h = this.renderer.domElement.clientHeight;
    return { x: (v.x * 0.5 + 0.5) * w, y: (1 - (v.y * 0.5 + 0.5)) * h, visible: v.z < 1 && v.z > -1 };
  }

  dispose() {
    this.renderer.dispose();
  }
}
