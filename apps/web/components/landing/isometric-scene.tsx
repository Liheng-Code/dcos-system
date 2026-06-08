"use client";

import { useRef, useState, useEffect, Suspense } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Environment } from "@react-three/drei";
import * as THREE from "three";

function Buildings() {
  const groupRef = useRef<THREE.Group>(null);
  const buildings = [
    { position: [-3, 0, -2], scale: [0.6, 0, 0.6], height: 2.5 + Math.random() * 1.5, color: "#3b82f6" },
    { position: [0, 0, -3], scale: [0.5, 0, 0.5], height: 2.0 + Math.random() * 1.0, color: "#60a5fa" },
    { position: [3, 0, -2], scale: [0.7, 0, 0.7], height: 3.0 + Math.random() * 2.0, color: "#2563eb" },
    { position: [-2.5, 0, 0], scale: [0.4, 0, 0.4], height: 1.8 + Math.random() * 0.8, color: "#93c5fd" },
    { position: [2.5, 0, 0.5], scale: [0.55, 0, 0.55], height: 2.2 + Math.random() * 1.0, color: "#1d4ed8" },
    { position: [-1, 0, 1.5], scale: [0.35, 0, 0.35], height: 1.5 + Math.random() * 0.5, color: "#bfdbfe" },
    { position: [1.5, 0, 2], scale: [0.6, 0, 0.6], height: 2.8 + Math.random() * 1.2, color: "#3b82f6" },
  ];

  const [heights, setHeights] = useState(buildings.map(() => 0));

  useEffect(() => {
    const timeouts = buildings.map((b, i) =>
      setTimeout(() => {
        setHeights((prev) => {
          const next = [...prev];
          next[i] = b.height;
          return next;
        });
      }, 500 + i * 300),
    );
    return () => timeouts.forEach(clearTimeout);
  }, []);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.08;
    }
  });

  return (
    <group ref={groupRef}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <planeGeometry args={[12, 10]} />
        <meshStandardMaterial
          color="#1e3a5f"
          transparent
          opacity={0.3}
          roughness={0.8}
          metalness={0.2}
        />
      </mesh>
      {buildings.map((b, i) => {
        const h = heights[i];
        return (
          <mesh
            key={i}
            position={[b.position[0], h / 2, b.position[2]]}
          >
            <boxGeometry
              args={[
                b.scale[0] * 2,
                Math.max(h, 0.01),
                b.scale[2] * 2,
              ]}
            />
            <meshStandardMaterial
              color={b.color}
              roughness={0.3}
              metalness={0.4}
              transparent
              opacity={h > 0 ? 1 : 0}
            />
          </mesh>
        );
      })}
      <gridHelper
        args={[14, 14, "#3b82f6", "#1e3a5f"]}
        position={[0, 0.01, 0]}
      />
    </group>
  );
}

function Crane() {
  const craneRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (craneRef.current) {
      craneRef.current.rotation.y += delta * 0.12;
    }
  });

  return (
    <group ref={craneRef} position={[4, 0, 3]}>
      <mesh position={[0, 2, 0]}>
        <cylinderGeometry args={[0.08, 0.12, 4, 6]} />
        <meshStandardMaterial color="#f59e0b" roughness={0.6} metalness={0.5} />
      </mesh>
      <mesh position={[0, 4, 0]}>
        <boxGeometry args={[1.8, 0.08, 0.1]} />
        <meshStandardMaterial color="#f59e0b" roughness={0.6} metalness={0.5} />
      </mesh>
      <mesh position={[0.9, 3.5, 0]}>
        <boxGeometry args={[0.04, 1, 0.04]} />
        <meshStandardMaterial color="#94a3b8" roughness={0.8} />
      </mesh>
      <mesh position={[0.9, 3, 0]}>
        <boxGeometry args={[0.15, 0.08, 0.1]} />
        <meshStandardMaterial color="#f59e0b" roughness={0.6} metalness={0.5} />
      </mesh>
    </group>
  );
}

function Scene() {
  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 10, 5]} intensity={1} />
      <directionalLight position={[-5, 5, -5]} intensity={0.3} color="#93c5fd" />
      <Float speed={1.5} rotationIntensity={0.05} floatIntensity={0.3}>
        <Buildings />
      </Float>
      <Crane />
      <Environment preset="city" />
    </>
  );
}

export function IsometricScene() {
  const [webgl, setWebgl] = useState(true);

  useEffect(() => {
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
      if (!gl) setWebgl(false);
    } catch {
      setWebgl(false);
    }
  }, []);

  if (!webgl) {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <svg viewBox="0 0 400 300" className="w-full h-full max-w-md opacity-20">
          <g transform="translate(200,150)">
            <polygon points="0,-80 80,0 0,80 -80,0" fill="none" stroke="#3b82f6" strokeWidth="1.5" />
            <polygon points="0,-50 50,0 0,50 -50,0" fill="none" stroke="#60a5fa" strokeWidth="1" />
            <rect x="-20" y="-60" width="15" height="40" fill="none" stroke="#93c5fd" strokeWidth="1" transform="skewY(30)" />
            <rect x="5" y="-40" width="12" height="30" fill="none" stroke="#bfdbfe" strokeWidth="1" transform="skewY(30)" />
            <line x1="-60" y1="20" x2="60" y2="20" stroke="#3b82f6" strokeWidth="0.5" strokeDasharray="3,3" />
            <line x1="-40" y1="40" x2="40" y2="40" stroke="#3b82f6" strokeWidth="0.5" strokeDasharray="3,3" />
          </g>
        </svg>
      </div>
    );
  }

  return (
    <div className="absolute inset-0">
      <Canvas
        camera={{ position: [6, 4, 8], fov: 45 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: "transparent" }}
      >
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
      </Canvas>
    </div>
  );
}
