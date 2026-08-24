'use client';

import { Canvas } from '@react-three/fiber';
import {
  Edges,
  GizmoHelper,
  GizmoViewcube,
  Grid,
  OrbitControls,
} from '@react-three/drei';

import { useViewerStore } from '@/store/viewer-store';

/**
 * Placeholder geometry, standing in for a loaded .glb until the converter
 * service exists. It is here so the R3F/drei setup can be smoke tested:
 * orbit, view cube, edge overlay and store-driven selection all run through
 * the same path the real model will use.
 */
function PlaceholderPart() {
  const selected = useViewerStore((s) => s.selected);
  const select = useViewerStore((s) => s.select);
  const isSelected = selected === 'placeholder';

  return (
    <mesh
      onClick={(event) => {
        event.stopPropagation();
        select(isSelected ? null : 'placeholder');
      }}
    >
      <boxGeometry args={[2, 1, 1.4]} />
      <meshStandardMaterial
        color={isSelected ? '#3b82f6' : '#9ca3af'}
        metalness={0.1}
        roughness={0.6}
      />
      {/* Edge overlay is what makes a model read as CAD rather than a mesh. */}
      <Edges linewidth={1} color={isSelected ? '#1d4ed8' : '#334155'} />
    </mesh>
  );
}

export function Viewer() {
  const select = useViewerStore((s) => s.select);

  return (
    <Canvas
      camera={{ position: [4, 3, 5], fov: 45 }}
      onPointerMissed={() => select(null)}
    >
      <color attach="background" args={['#f1f5f9']} />
      <ambientLight intensity={0.8} />
      <directionalLight position={[5, 8, 5]} intensity={1.2} />

      <PlaceholderPart />

      <Grid
        args={[20, 20]}
        cellColor="#cbd5e1"
        sectionColor="#94a3b8"
        position={[0, -0.75, 0]}
        fadeDistance={25}
        infiniteGrid
      />

      <OrbitControls makeDefault enableDamping />
      <GizmoHelper alignment="bottom-right" margin={[72, 72]}>
        <GizmoViewcube />
      </GizmoHelper>
    </Canvas>
  );
}
