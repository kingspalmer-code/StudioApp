// The 3D viewer for STL models (3D viewer apps). Browser only: it draws with WebGL through
// three.js, so it's loaded on demand by the pages that use it.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// How the model's surface looks.
export const FINISHES = {
  clay: { label: "Clay", color: "#a99f92", metalness: 0, roughness: 0.85 },
  resin: { label: "White resin", color: "#f3f1ec", metalness: 0, roughness: 0.32 },
  gold: { label: "Gold", color: "#e3b55a", metalness: 1, roughness: 0.22 },
  silver: { label: "Silver", color: "#dadce0", metalness: 1, roughness: 0.18 },
  rose: { label: "Rose gold", color: "#e6a68c", metalness: 1, roughness: 0.25 },
  wire: { label: "Wireframe", color: "#8c8c8c", metalness: 0, roughness: 1 },
} as const;
export type Finish = keyof typeof FINISHES;

// How it's lit: the room reflected in the surface, a main light and a softer one opposite.
export const LIGHTS = {
  studio: { label: "Studio", env: 0.9, key: 1.5, fill: 0.6, ambient: 0.15 },
  soft: { label: "Soft", env: 1.4, key: 0.6, fill: 0.7, ambient: 0.45 },
  dramatic: { label: "Dramatic", env: 0.3, key: 4, fill: 0.08, ambient: 0 },
} as const;
export type Lights = keyof typeof LIGHTS;

// Reads an STL (binary or text) into a shape that stands upright and sits centred. STL files are
// drawn with Z pointing up and three.js has Y up, so it's turned to match.
// The file's own normals are ignored (many exporters leave them blank) and worked out again: smooth
// across gentle curves, with edges sharper than 30° kept crisp.
export function parseStl(data: ArrayBuffer) {
  const raw = new STLLoader().parse(data);
  if (!raw.attributes.position?.count) throw new Error("That file has no shape in it.");
  raw.deleteAttribute("normal");
  raw.rotateX(-Math.PI / 2);
  raw.center();
  const geometry = toCreasedNormals(raw, Math.PI / 6);
  raw.dispose();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

// The model's size across, deep and high in its own units (usually millimetres), and its triangles.
export function measure(geometry: THREE.BufferGeometry) {
  const size = new THREE.Vector3();
  geometry.boundingBox?.getSize(size);
  return { w: size.x, d: size.z, h: size.y, triangles: Math.round(geometry.attributes.position.count / 3) };
}

export class Viewer {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(35, 1, 0.1, 1000);
  private controls: OrbitControls;
  private material = new THREE.MeshStandardMaterial();
  private mesh: THREE.Mesh | null = null;
  private ambient = new THREE.AmbientLight(0xffffff, 0);
  private key = new THREE.DirectionalLight(0xffffff, 0);
  private fill = new THREE.DirectionalLight(0xffffff, 0);
  private envMap: THREE.Texture;
  private home = { position: new THREE.Vector3(0, 0, 10), target: new THREE.Vector3() };
  // Until someone moves the model, a change of size frames it again.
  private moved = false;

  constructor(canvas: HTMLCanvasElement, opts: { still?: boolean } = {}) {
    // A still keeps its drawing so it can be saved as a picture straight after.
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: Boolean(opts.still) });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.8;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene.environment = this.envMap;
    this.scene.add(this.ambient, this.key, this.fill, this.camera);
    // The lights move with the camera, so the side you're looking at is always lit.
    this.key.position.set(1, 1.4, 1.2);
    this.fill.position.set(-1.2, -0.3, -0.6);
    this.camera.add(this.key, this.fill);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.09;
    this.controls.autoRotateSpeed = 1.6;
    this.controls.enabled = !opts.still;
    this.controls.addEventListener("start", () => (this.moved = true));
    this.setFinish("clay");
    this.setLights("studio");
  }

  setModel(geometry: THREE.BufferGeometry) {
    if (this.mesh) this.scene.remove(this.mesh);
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.scene.add(this.mesh);
    this.frame();
    this.reset();
  }

  private frame() {
    const geometry = this.mesh?.geometry;
    if (!geometry) return;
    // Back far enough that the whole model fits, looking from the front, a little above and to one side.
    const r = geometry.boundingSphere?.radius || 1;
    // Whichever way is narrower decides, so a tall phone screen still shows the whole width.
    const vfov = THREE.MathUtils.degToRad(this.camera.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    const dist = (r / Math.sin(Math.min(vfov, hfov) / 2)) * 1.08;
    this.camera.near = dist / 100;
    this.camera.far = dist * 100;
    this.camera.updateProjectionMatrix();
    this.controls.minDistance = r * 0.3;
    this.controls.maxDistance = dist * 6;
    this.home.position.copy(new THREE.Vector3(0.55, 0.42, 1).normalize().multiplyScalar(dist));
  }

  setFinish(name: Finish) {
    const f = FINISHES[name];
    this.material.color.set(f.color);
    this.material.metalness = f.metalness;
    this.material.roughness = f.roughness;
    this.material.wireframe = name === "wire";
    this.material.needsUpdate = true;
  }

  setLights(name: Lights) {
    const l = LIGHTS[name];
    this.scene.environmentIntensity = l.env;
    this.key.intensity = l.key;
    this.fill.intensity = l.fill;
    this.ambient.intensity = l.ambient;
  }

  setSpin(on: boolean) {
    this.controls.autoRotate = on;
  }

  reset() {
    this.moved = false;
    this.camera.position.copy(this.home.position);
    this.controls.target.copy(this.home.target);
    this.controls.update();
  }

  resize(width: number, height: number) {
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.frame();
    if (!this.moved) this.reset();
  }

  render() {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  start() {
    this.renderer.setAnimationLoop(() => this.render());
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    this.controls.dispose();
    this.material.dispose();
    this.envMap.dispose();
    this.renderer.dispose();
  }
}

// A small picture of the model in clay, for the gallery. Transparent around the model.
export async function snapshot(geometry: THREE.BufferGeometry, size = 480) {
  const canvas = document.createElement("canvas");
  const viewer = new Viewer(canvas, { still: true });
  try {
    viewer.renderer.setPixelRatio(1);
    viewer.resize(size, size);
    viewer.setModel(geometry);
    viewer.render();
    return await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("no picture"))), "image/png"));
  } finally {
    viewer.dispose();
    viewer.renderer.forceContextLoss();
  }
}
