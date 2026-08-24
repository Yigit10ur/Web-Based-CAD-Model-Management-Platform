'use client';

import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { Grid, GizmoHelper, GizmoViewport, OrbitControls } from '@react-three/drei';

import type { ModelMetadata } from '@/lib/metadata';
import { useViewerStore } from '@/store/viewer-store';

import { MeasureLayer } from './MeasureLayer';
import { Model } from './Model';

export function Viewer({ url, metadata }: { url: string; metadata: ModelMetadata }) {
  const select = useViewerStore((state) => state.select);

  return (
    <Canvas
      // CAD data is Z-up and the geometry is left in the coordinates the
      // metadata describes, so the camera is told which way is up rather than
      // the model being rotated into three.js' Y-up convention. Rotating the
      // geometry instead would put every bbox and centre of mass in the
      // properties panel in a different frame from the thing on screen.
      camera={{ position: [110, -90, 80], up: [0, 0, 1], fov: 40, near: 0.1, far: 5000 }}
      onPointerMissed={() => select(null)}
    >
      <color attach="background" args={['#f1f5f9']} />
      <ambientLight intensity={0.9} />
      <directionalLight position={[60, -40, 80]} intensity={1.4} />
      <directionalLight position={[-50, 40, 20]} intensity={0.5} />

      <Suspense fallback={null}>
        <Model url={url} metadata={metadata} />
      </Suspense>

      <MeasureLayer />

      {/* Rotated onto the XY plane so it reads as the CAD ground plane. */}
      <Grid
        cellSize={10}
        sectionSize={50}
        cellColor="#cbd5e1"
        sectionColor="#94a3b8"
        rotation={[Math.PI / 2, 0, 0]}
        fadeDistance={900}
        fadeStrength={1}
        infiniteGrid
        side={2}
      />

      <OrbitControls makeDefault enableDamping target={[20, 10, 15]} />
      {/* An axis triad rather than a view cube: drei's cube is labelled for a
          Y-up world and shows "BOTTOM" on top in a Z-up scene, which is worse
          than no cube at all. A Z-up view cube is its own piece of work. */}
      <GizmoHelper alignment="bottom-right" margin={[72, 72]}>
        <GizmoViewport axisColors={['#dc2626', '#16a34a', '#2563eb']} labelColor="white" />
      </GizmoHelper>
    </Canvas>
  );
}
