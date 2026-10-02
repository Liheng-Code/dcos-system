"use client";

import { useRef, useCallback, useEffect, useState } from "react";
import * as THREE from "three";
import type CameraControls from "camera-controls";
import { Home, RotateCcw, RotateCw } from "lucide-react";
import { useBimWorld } from "./ifc-viewer";

const SIZE = 130;
const CUBE_DIST = 3.2;
const CUBE_FOV = 32;
const CUBELET_SIZE = 0.32;
const CUBELET_SPACING = 1 / 3;
const HIGHLIGHT_COLOR = 0x3b82f6;
const FACE_COLOR = 0xffffff;
const EDGE_COLOR = 0xcbd5e1;
const CORNER_COLOR = 0x94a3b8;

// (i, j, k) axis convention matches the app's world axes: i -> X (Left/Right),
// j -> Y (Bottom/Top), k -> Z (Back/Front).
const FACE_LABELS: Record<string, string> = {
  "1,0,0": "RIGHT",
  "-1,0,0": "LEFT",
  "0,1,0": "TOP",
  "0,-1,0": "BOTTOM",
  "0,0,1": "FRONT",
  "0,0,-1": "BACK",
};

interface Cubelet {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  dir: THREE.Vector3;
  baseColor: number;
  kind: "face" | "edge" | "corner";
}

function makeFaceTexture(label: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#eef1f5";
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = "#94a3b8";
  ctx.lineWidth = 3;
  ctx.strokeRect(2, 2, 124, 124);
  ctx.fillStyle = "#1f2937";
  ctx.font = "bold 16px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Builds a 26-piece cube (6 faces + 12 edges + 8 corners — a Rubik's-cube-style
// subdivision with the invisible center cell removed), the same clickable
// layout Revit's ViewCube uses: click a face for an orthogonal view, an edge
// for a 45° view, a corner for an isometric-style view.
function buildCubelets(): Cubelet[] {
  const cubelets: Cubelet[] = [];
  const offsets = [-1, 0, 1];
  for (const i of offsets) {
    for (const j of offsets) {
      for (const k of offsets) {
        if (i === 0 && j === 0 && k === 0) continue;
        const nonZero = [i, j, k].filter((v) => v !== 0).length;
        const kind: Cubelet["kind"] = nonZero === 1 ? "face" : nonZero === 2 ? "edge" : "corner";
        const dir = new THREE.Vector3(i, j, k).normalize();
        const geometry = new THREE.BoxGeometry(CUBELET_SIZE, CUBELET_SIZE, CUBELET_SIZE);

        let material: THREE.MeshBasicMaterial;
        let baseColor: number;
        if (kind === "face") {
          baseColor = FACE_COLOR;
          material = new THREE.MeshBasicMaterial({
            map: makeFaceTexture(FACE_LABELS[`${i},${j},${k}`]),
            color: baseColor,
          });
        } else if (kind === "edge") {
          baseColor = EDGE_COLOR;
          material = new THREE.MeshBasicMaterial({ color: baseColor });
        } else {
          baseColor = CORNER_COLOR;
          material = new THREE.MeshBasicMaterial({ color: baseColor });
        }

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(i * CUBELET_SPACING, j * CUBELET_SPACING, k * CUBELET_SPACING);
        cubelets.push({ mesh, material, dir, baseColor, kind });
      }
    }
  }
  return cubelets;
}

// Turns a camera direction into a readable name by finding which of the 26
// cube directions it's closest to and reading the axis signs off it — e.g.
// dead-on to a face gives "FRONT", angled toward a corner gives "TOP FRONT
// RIGHT". The tiny labels baked into the cube's own faces are easy to miss at
// this widget's size, especially at an angle, so this text is the one users
// actually glance at to tell which view they're in.
function nearestViewLabel(dir: THREE.Vector3, cubelets: Cubelet[]): string {
  let best: Cubelet | null = null;
  let bestDot = -Infinity;
  for (const c of cubelets) {
    const dot = c.dir.dot(dir);
    if (dot > bestDot) {
      bestDot = dot;
      best = c;
    }
  }
  if (!best) return "";
  const parts: string[] = [];
  if (Math.abs(best.dir.y) > 0.01) parts.push(best.dir.y > 0 ? "TOP" : "BOTTOM");
  if (Math.abs(best.dir.z) > 0.01) parts.push(best.dir.z > 0 ? "FRONT" : "BACK");
  if (Math.abs(best.dir.x) > 0.01) parts.push(best.dir.x > 0 ? "RIGHT" : "LEFT");
  return parts.join(" ");
}

export function ViewCube() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const world = useBimWorld();
  const animRef = useRef<number>(0);

  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const cubeletsRef = useRef<Cubelet[]>([]);
  const meshToCubeletRef = useRef<Map<THREE.Mesh, Cubelet>>(new Map());
  const hoveredRef = useRef<Cubelet | null>(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const lastLabelRef = useRef("");
  const [viewLabel, setViewLabel] = useState("FRONT");

  // One-time mini-scene setup: its own renderer/camera/scene, independent of
  // the main viewport, showing a static cube that we reorient every frame to
  // mirror the main camera's current angle (cube stays put, viewpoint moves
  // around it — same illusion Revit's cube uses).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(SIZE, SIZE, false);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(CUBE_FOV, 1, 0.1, 10);
    cameraRef.current = camera;

    const cubelets = buildCubelets();
    cubeletsRef.current = cubelets;
    const meshMap = new Map<THREE.Mesh, Cubelet>();
    for (const c of cubelets) {
      scene.add(c.mesh);
      meshMap.set(c.mesh, c);
    }
    meshToCubeletRef.current = meshMap;

    return () => {
      for (const c of cubelets) {
        c.mesh.geometry.dispose();
        c.material.map?.dispose();
        c.material.dispose();
      }
      renderer.dispose();
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      cubeletsRef.current = [];
      meshToCubeletRef.current = new Map();
      hoveredRef.current = null;
    };
  }, []);

  const setHover = useCallback((next: Cubelet | null) => {
    const prev = hoveredRef.current;
    if (prev === next) return;
    if (prev) {
      prev.material.color.setHex(prev.baseColor);
      prev.mesh.scale.setScalar(1);
    }
    if (next) {
      next.material.color.setHex(HIGHLIGHT_COLOR);
      next.mesh.scale.setScalar(1.08);
    }
    hoveredRef.current = next;
  }, []);

  const pickCubelet = useCallback((clientX: number, clientY: number): Cubelet | null => {
    const canvas = canvasRef.current;
    const camera = cameraRef.current;
    if (!canvas || !camera) return null;
    const rect = canvas.getBoundingClientRect();
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -(((clientY - rect.top) / rect.height) * 2 - 1);
    raycasterRef.current.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
    const hits = raycasterRef.current.intersectObjects(cubeletsRef.current.map((c) => c.mesh));
    if (hits.length === 0) return null;
    return meshToCubeletRef.current.get(hits[0].object as THREE.Mesh) ?? null;
  }, []);

  // Keep the cube's apparent orientation locked to the main camera every
  // frame, and render the mini scene. Wrapped in try/catch: world.camera is a
  // getter that can throw briefly across a dev Strict-Mode dispose/remount.
  useEffect(() => {
    let running = true;
    const tick = () => {
      if (!running) return;
      const renderer = rendererRef.current;
      const scene = sceneRef.current;
      const camera = cameraRef.current;
      if (renderer && scene && camera) {
        if (world) {
          try {
            const cam = world.camera;
            const controls = cam.controls as CameraControls;
            const pos = new THREE.Vector3();
            const target = new THREE.Vector3();
            controls.getPosition(pos);
            controls.getTarget(target);
            const dir = new THREE.Vector3().subVectors(pos, target).normalize();
            camera.position.copy(dir).multiplyScalar(CUBE_DIST);
            camera.lookAt(0, 0, 0);

            const label = nearestViewLabel(dir, cubeletsRef.current);
            if (label !== lastLabelRef.current) {
              lastLabelRef.current = label;
              setViewLabel(label);
            }
          } catch {
            camera.position.set(0, 0, CUBE_DIST);
            camera.lookAt(0, 0, 0);
          }
        }
        renderer.render(scene, camera);
      }
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => {
      running = false;
      cancelAnimationFrame(animRef.current);
    };
  }, [world]);

  // Click a face/edge/corner to snap the main camera to that direction,
  // preserving the current distance from the target so the zoom level
  // doesn't jump. Dragging instead orbits the main camera live, matching
  // Revit's "grab the cube and spin it" interaction.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let dragging = false;
    let downX = 0;
    let downY = 0;
    let lastX = 0;
    let lastY = 0;

    const rotateMainCamera = (deltaX: number, deltaY: number) => {
      if (!world) return;
      try {
        const controls = world.camera.controls as CameraControls;
        controls.rotate(deltaX * 0.01, deltaY * -0.01, false);
      } catch {
        // Camera not initialized yet
      }
    };

    const snapToCubelet = (cubelet: Cubelet) => {
      if (!world) return;
      try {
        const controls = world.camera.controls as CameraControls;
        const pos = new THREE.Vector3();
        const target = new THREE.Vector3();
        controls.getPosition(pos);
        controls.getTarget(target);
        const distance = pos.distanceTo(target);
        const newPos = target.clone().add(cubelet.dir.clone().multiplyScalar(distance));
        controls.setLookAt(newPos.x, newPos.y, newPos.z, target.x, target.y, target.z, true);
      } catch {
        // Camera not initialized yet
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      dragging = false;
      downX = lastX = e.clientX;
      downY = lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (e.buttons === 0) {
        setHover(pickCubelet(e.clientX, e.clientY));
        return;
      }
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      if (!dragging && Math.hypot(e.clientX - downX, e.clientY - downY) > 4) {
        dragging = true;
        setHover(null);
        canvas.style.cursor = "grabbing";
      }
      if (dragging) {
        rotateMainCamera(dx, dy);
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      canvas.releasePointerCapture(e.pointerId);
      if (!dragging) {
        const cubelet = pickCubelet(e.clientX, e.clientY);
        if (cubelet) snapToCubelet(cubelet);
      }
      dragging = false;
      canvas.style.cursor = "grab";
    };

    const onPointerLeave = () => {
      if (!dragging) setHover(null);
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointerleave", onPointerLeave);
    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerLeave);
    };
  }, [world, pickCubelet, setHover]);

  const rotate90 = (sign: 1 | -1) => {
    if (!world) return;
    try {
      const controls = world.camera.controls as CameraControls;
      controls.rotate(sign * (Math.PI / 2), 0, true);
    } catch {
      // Camera not initialized yet
    }
  };

  const goHome = () => {
    try {
      (world?.camera as import("@thatopen/components").SimpleCamera)?.fitToItems();
    } catch {
      // Camera not initialized yet
    }
  };

  return (
    <div className="rounded-lg bg-gray-800/90 p-1.5 shadow-lg border border-gray-700">
      <div className="mb-1 text-center text-[11px] font-bold tracking-wide text-blue-300">
        {viewLabel || " "}
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => rotate90(-1)}
          className="shrink-0 rounded p-1 text-gray-400 hover:text-white hover:bg-gray-700"
          title="Rotate view left 90°"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
        <canvas
          ref={canvasRef}
          width={SIZE}
          height={SIZE}
          style={{ cursor: "grab", touchAction: "none" }}
        />
        <button
          onClick={() => rotate90(1)}
          className="shrink-0 rounded p-1 text-gray-400 hover:text-white hover:bg-gray-700"
          title="Rotate view right 90°"
        >
          <RotateCw className="h-3.5 w-3.5" />
        </button>
      </div>
      <button
        onClick={goHome}
        className="mt-0.5 flex w-full items-center justify-center gap-1 text-center text-[10px] text-gray-400 hover:text-white py-0.5"
      >
        <Home className="h-3 w-3" />
        Home
      </button>
    </div>
  );
}
