"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Html, OrbitControls, Outlines } from "@react-three/drei";
import * as THREE from "three";
import type { DwlAssemblyLayer } from "@/components/qs/dwl-types";

// Fixed panel footprint (Y=height, Z=depth) — only the X extent (width) of
// each layer's box varies, proportional to its real thickness_mm. This
// mirrors the 2D diagram's own metaphor: layers are a horizontal
// cross-section slice through the assembly's thickness, viewed edge-on, not
// a vertical stack.
const PANEL_HEIGHT = 1.0;
const PANEL_DEPTH = 0.8;
const TARGET_TOTAL_WIDTH = 1.6;
const EXPLODE_GAP = 0.18;
const PEEL_STEP = 0.14;

// Which real construction component a layer visually represents — derived
// from the layer name so this generalizes to future assemblies, not just
// this ceiling. Falls back to "board" (a generic panel) for anything that
// doesn't match a known keyword.
type LayerKind = "board" | "cavity" | "seam";
function layerKind(name: string): LayerKind {
  const n = name.toLowerCase();
  if (n.includes("galvanized") || n.includes("cavity") || n.includes("stud") || n.includes("grid")) return "cavity";
  if (n.includes("joint") || n.includes("seam") || n.includes("tape")) return "seam";
  return "board";
}

// Evenly spaced positions centered on 0, spanning `extent` with a small
// margin so elements don't sit flush on the panel edge.
function spacedPositions(count: number, extent: number): number[] {
  if (count <= 1) return [0];
  const usable = extent * 0.8;
  return Array.from({ length: count }, (_, i) => -usable / 2 + (usable * i) / (count - 1));
}

const DOT = new THREE.CylinderGeometry(0.018, 0.018, 0.03, 8);

// A board layer (Outer/Inner): a thin panel + a grid of screw-head dots
// (real MAT-CEIL-036 fixing points, linked via dwl_assembly_layer_materials)
// + a seam-line accent at one edge.
function BoardGeometry({ width, color, opacity }: { width: number; color: string; opacity: number }) {
  const screwPositions = useMemo(() => {
    const ys = spacedPositions(3, PANEL_HEIGHT);
    const zs = spacedPositions(4, PANEL_DEPTH);
    return ys.flatMap((y) => zs.map((z) => [y, z] as const));
  }, []);
  return (
    <>
      <mesh>
        <boxGeometry args={[width, PANEL_HEIGHT, PANEL_DEPTH]} />
        <meshStandardMaterial color={color} roughness={0.7} metalness={0.02} transparent opacity={opacity} />
      </mesh>
      {screwPositions.map(([y, z], i) => (
        <mesh key={i} geometry={DOT} position={[width / 2 - 0.005, y, z]} rotation={[0, 0, Math.PI / 2]}>
          <meshStandardMaterial color="#334155" roughness={0.4} metalness={0.6} transparent opacity={opacity} />
        </mesh>
      ))}
      <mesh position={[0, 0, PANEL_DEPTH / 2 - 0.01]}>
        <boxGeometry args={[width + 0.002, PANEL_HEIGHT, 0.02]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.5} transparent opacity={opacity} />
      </mesh>
    </>
  );
}

// The cavity layer (Galvanized): NOT a solid block (the real cavity is
// mostly air) — a main-runner + furring-channel grid, a few hanger rods,
// and a wall-perimeter-angle frame, illustrating the real recipe's
// components (MAT-CEIL-032/033/034/035) instead of one abstract slab.
// Counts/spacing are small and representative of the recipe's own basis
// notes ("1200mm c/c" / "400mm c/c"), not a literal take-off recomputation.
function CavityGeometry({ width, color, opacity }: { width: number; color: string; opacity: number }) {
  const runnerYs = spacedPositions(3, PANEL_HEIGHT);
  const furringZs = spacedPositions(5, PANEL_DEPTH);
  const hangerPositions = useMemo(() => {
    const ys = spacedPositions(3, PANEL_HEIGHT * 0.7);
    return ys.map((y) => [y, 0] as const);
  }, []);
  const accentColor = "#94a3b8";

  return (
    <group>
      {/* Main runners — span the panel depth, spaced across its height */}
      {runnerYs.map((y, i) => (
        <mesh key={`run-${i}`} position={[-width * 0.15, y, 0]}>
          <boxGeometry args={[width * 0.4, 0.035, PANEL_DEPTH]} />
          <meshStandardMaterial color={color} roughness={0.35} metalness={0.5} transparent opacity={opacity} />
        </mesh>
      ))}
      {/* Furring / cross channels — perpendicular, span the panel height */}
      {furringZs.map((z, i) => (
        <mesh key={`fur-${i}`} position={[width * 0.15, 0, z]}>
          <boxGeometry args={[width * 0.3, PANEL_HEIGHT, 0.025]} />
          <meshStandardMaterial color={accentColor} roughness={0.35} metalness={0.5} transparent opacity={opacity} />
        </mesh>
      ))}
      {/* Hanger rods — short rods dropping into the grid from above */}
      {hangerPositions.map(([y, z], i) => (
        <mesh key={`hang-${i}`} position={[-width * 0.15, y + PANEL_HEIGHT * 0.22, z]}>
          <cylinderGeometry args={[0.012, 0.012, PANEL_HEIGHT * 0.4, 6]} />
          <meshStandardMaterial color="#64748b" roughness={0.4} metalness={0.6} transparent opacity={opacity} />
        </mesh>
      ))}
      {/* Wall perimeter angle — a thin frame around the cavity edge */}
      {[
        [0, PANEL_HEIGHT / 2 - 0.015, 0, width * 0.9, 0.03, PANEL_DEPTH],
        [0, -PANEL_HEIGHT / 2 + 0.015, 0, width * 0.9, 0.03, PANEL_DEPTH],
        [0, 0, PANEL_DEPTH / 2 - 0.015, width * 0.9, PANEL_HEIGHT, 0.03],
        [0, 0, -PANEL_DEPTH / 2 + 0.015, width * 0.9, PANEL_HEIGHT, 0.03],
      ].map((f, i) => (
        <mesh key={`frame-${i}`} position={[f[0], f[1], f[2]]}>
          <boxGeometry args={[f[3], f[4], f[5]]} />
          <meshStandardMaterial color={accentColor} roughness={0.4} metalness={0.4} transparent opacity={opacity * 0.6} />
        </mesh>
      ))}
      {/* Fixing clips/joiners — small connector cubes at grid intersections */}
      {runnerYs.slice(0, 2).flatMap((y, ri) =>
        furringZs.slice(0, 2).map((z, fi) => (
          <mesh key={`clip-${ri}-${fi}`} position={[0, y, z]}>
            <boxGeometry args={[width * 0.5, 0.05, 0.05]} />
            <meshStandardMaterial color="#1e293b" roughness={0.3} metalness={0.7} transparent opacity={opacity} />
          </mesh>
        ))
      )}
    </group>
  );
}

// The joint layer: a thin seam slab (tape + compound) — reads fine as a
// single accent strip, no sub-components to decompose further.
function SeamGeometry({ width, color, opacity }: { width: number; color: string; opacity: number }) {
  return (
    <mesh>
      <boxGeometry args={[width, PANEL_HEIGHT, PANEL_DEPTH]} />
      <meshStandardMaterial color={color} roughness={0.6} metalness={0.1} transparent opacity={opacity} />
    </mesh>
  );
}

interface LayerGroupProps {
  layer: DwlAssemblyLayer;
  x: number;
  z: number;
  width: number;
  opacity: number;
  selected: boolean;
  onSelect: () => void;
}

function LayerGroup({ layer, x, z, width, opacity, selected, onSelect }: LayerGroupProps) {
  const [hovered, setHovered] = useState(false);
  const kind = layerKind(layer.layer_name);

  return (
    <group
      position={[x, 0, z]}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { setHovered(false); document.body.style.cursor = "auto"; }}
    >
      {kind === "board" && <BoardGeometry width={width} color={layer.color_hex} opacity={opacity} />}
      {kind === "cavity" && <CavityGeometry width={width} color={layer.color_hex} opacity={opacity} />}
      {kind === "seam" && <SeamGeometry width={width} color={layer.color_hex} opacity={opacity} />}
      <mesh>
        {/* Full-bounds transparent hit target (keeps click/hover working across gaps between thin sub-components) + selection outline anchor */}
        <boxGeometry args={[width * 1.02, PANEL_HEIGHT * 1.02, PANEL_DEPTH * 1.02]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        {selected && <Outlines thickness={2.5} color="#10b981" />}
      </mesh>
      {(hovered || selected) && (
        <Html position={[0, PANEL_HEIGHT / 2 + 0.16, 0]} center distanceFactor={6} occlude={false}>
          <div className="pointer-events-none whitespace-nowrap rounded bg-slate-900/90 px-1.5 py-0.5 text-[10px] font-medium text-white">
            {layer.layer_name} ({layer.thickness_mm}mm)
          </div>
        </Html>
      )}
    </group>
  );
}

function Scene({
  layers, selectedLayerId, onSelectLayer, viewMode, opacity,
}: {
  layers: DwlAssemblyLayer[];
  selectedLayerId: string;
  onSelectLayer: (id: string) => void;
  viewMode: "composite" | "exploded" | "peeling";
  opacity: number;
}) {
  const totalThicknessMm = layers.reduce((s, l) => s + l.thickness_mm, 0) || 1;
  const scale = TARGET_TOTAL_WIDTH / totalThicknessMm;

  const positioned = useMemo(() => {
    const acc: { layer: DwlAssemblyLayer; x: number; z: number; width: number }[] = [];
    layers.reduce((cursorX, l, i) => {
      const width = l.thickness_mm * scale;
      const startX = cursorX + (viewMode !== "composite" && i > 0 ? EXPLODE_GAP : 0);
      const x = startX + width / 2;
      const z = viewMode === "peeling" ? i * PEEL_STEP : 0;
      acc.push({ layer: l, x, z, width });
      return startX + width;
    }, 0);
    return acc;
  }, [layers, viewMode, scale]);

  const totalWidth = positioned.length > 0 ? positioned[positioned.length - 1].x + positioned[positioned.length - 1].width / 2 : 0;
  const centerX = totalWidth / 2;

  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[4, 6, 4]} intensity={1} />
      <directionalLight position={[-4, 3, -3]} intensity={0.3} color="#93c5fd" />
      <group position={[-centerX, 0, 0]}>
        {positioned.map((p) => (
          <LayerGroup
            key={p.layer.id}
            layer={p.layer}
            x={p.x}
            z={p.z}
            width={p.width}
            opacity={opacity}
            selected={p.layer.id === selectedLayerId}
            onSelect={() => onSelectLayer(p.layer.id)}
          />
        ))}
        <gridHelper args={[6, 12, "#94a3b8", "#e2e8f0"]} position={[0, -PANEL_HEIGHT / 2 - 0.01, 0]} />
      </group>
    </>
  );
}

interface DwlAssemblyLayerViewer3DProps {
  layers: DwlAssemblyLayer[];
  selectedLayerId: string;
  onSelectLayer: (id: string) => void;
  viewMode: "composite" | "exploded" | "peeling";
  opacity: number;
  onUnavailable?: () => void;
}

export function DwlAssemblyLayerViewer3D({
  layers, selectedLayerId, onSelectLayer, viewMode, opacity, onUnavailable,
}: DwlAssemblyLayerViewer3DProps) {
  const [webgl, setWebgl] = useState(true);

  useEffect(() => {
    let unavailable = false;
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
      if (!gl) unavailable = true;
    } catch {
      unavailable = true;
    }
    if (unavailable) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWebgl(false);
      onUnavailable?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!webgl) return null;

  if (layers.length === 0) {
    return <p className="py-12 text-center text-xs text-muted-foreground">No layers to display — check a layer above or add one.</p>;
  }

  return (
    <div style={{ height: 260 }}>
      <Canvas
        camera={{ position: [2.4, 1.6, 2.8], fov: 42 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: "transparent" }}
      >
        <Suspense fallback={null}>
          <Scene layers={layers} selectedLayerId={selectedLayerId} onSelectLayer={onSelectLayer} viewMode={viewMode} opacity={opacity / 100} />
        </Suspense>
        <OrbitControls
          enableDamping
          minDistance={1.5}
          maxDistance={6}
          maxPolarAngle={Math.PI / 2.05}
          target={[0, 0, 0]}
        />
      </Canvas>
    </div>
  );
}
