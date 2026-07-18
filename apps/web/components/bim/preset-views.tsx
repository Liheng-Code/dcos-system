"use client";

import * as THREE from "three";
import { useBimWorld } from "./ifc-viewer";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Compass } from "lucide-react";

const VIEWS = [
  { label: "Top", dir: [0, 1, 0] as [number, number, number] },
  { label: "Bottom", dir: [0, -1, 0] as [number, number, number] },
  { label: "Front", dir: [0, 0, 1] as [number, number, number] },
  { label: "Back", dir: [0, 0, -1] as [number, number, number] },
  { label: "Left", dir: [-1, 0, 0] as [number, number, number] },
  { label: "Right", dir: [1, 0, 0] as [number, number, number] },
  { label: "NE Isometric", dir: [1, 1, 1] as [number, number, number] },
  { label: "NW Isometric", dir: [-1, 1, 1] as [number, number, number] },
  { label: "SE Isometric", dir: [1, 1, -1] as [number, number, number] },
  { label: "SW Isometric", dir: [-1, 1, -1] as [number, number, number] },
];

export function PresetViews() {
  const world = useBimWorld();

  const setView = (dir: [number, number, number]) => {
    if (!world) return;
    const cam = world.camera;
    const controls = cam.controls as any;

    // Get current target as the model center
    const target = new THREE.Vector3();
    controls.getTarget(target);

    const dirVec = new THREE.Vector3(...dir).normalize();
    const dist = 30;
    const newPos = target.clone().add(dirVec.multiplyScalar(dist));

    // Use setLookAt to move both position and target together
    controls.setLookAt(
      newPos.x, newPos.y, newPos.z,
      target.x, target.y, target.z,
      true
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="sm" className="text-gray-300 hover:text-white hover:bg-gray-700 bg-gray-800/90" />
        }
      >
        <Compass className="h-4 w-4 mr-1" />
        Views
      </DropdownMenuTrigger>
      <DropdownMenuContent className="bg-gray-800 border-gray-700">
        {VIEWS.map((v) => (
          <DropdownMenuItem
            key={v.label}
            onClick={() => setView(v.dir)}
            className="text-gray-300 hover:text-white hover:bg-gray-700"
          >
            {v.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
