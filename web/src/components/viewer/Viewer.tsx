'use client';

import { Suspense, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { Grid, GizmoHelper, GizmoViewport, OrbitControls } from '@react-three/drei';

import { FOV, frameModel } from '@/lib/framing';
import type { ModelMetadata } from '@/lib/metadata';
import { modelBounds } from '@/lib/section';
import { useViewerStore } from '@/store/viewer-store';

import { MeasureLayer } from './MeasureLayer';
import { Model } from './Model';

export function Viewer({ url, metadata }: { url: string; metadata: ModelMetadata }) {
  const select = useViewerStore((state) => state.select);

  // Where the model actually is. A part four millimetres across sitting a
  // metre from the origin is ordinary CAD output, and a fixed camera simply
  // misses it -- the scene looks empty although everything loaded.
  const view = useMemo(() => frameModel(modelBounds(metadata.parts)), [metadata]);

  return (
    <Canvas
      // CAD data is Z-up and the geometry is left in the coordinates the
      // metadata describes, so the camera is told which way is up rather than
      // the model being rotated into three.js' Y-up convention. Rotating the
      // geometry instead would put every bbox and centre of mass in the
      // properties panel in a different frame from the thing on screen.
      camera={{
        position: view.position,
        up: [0, 0, 1],
        fov: FOV,
        near: view.near,
        far: view.far,
      }}
      onPointerMissed={() => select(null)}
      // three.js creates the context without a stencil buffer by default. The
      // section cap is drawn through a stencil test, and without the buffer
      // that test silently passes everywhere, painting a full screen quad
      // instead of filling the cut.
      gl={{ stencil: true }}
      // Clipping planes are set per material rather than globally, so that the
      // section cap can opt out of being clipped by its own plane.
      onCreated={({ gl }) => {
        gl.localClippingEnabled = true;
      }}
    >
      <color attach="background" args={['#f1f5f9']} />
      <ambientLight intensity={0.9} />
      <directionalLight position={[60, -40, 80]} intensity={1.4} />
      <directionalLight position={[-50, 40, 20]} intensity={0.5} />

      <Suspense fallback={null}>
        <Model url={url} metadata={metadata} />
      </Suspense>

      <MeasureLayer />

      {/* Rotated onto the XY plane so it reads as the CAD ground plane, and
          sunk to the underside of the model so it reads as the floor the part
          is standing on rather than a plane the part floats above. */}
      <Grid
        cellSize={view.cellSize}
        sectionSize={view.sectionSize}
        cellColor="#cbd5e1"
        sectionColor="#94a3b8"
        position={view.ground}
        rotation={[Math.PI / 2, 0, 0]}
        fadeDistance={view.fadeDistance}
        fadeStrength={1}
        infiniteGrid
        side={2}
      />

      <OrbitControls makeDefault enableDamping target={view.target} />
      {/* An axis triad rather than a view cube: drei's cube is labelled for a
          Y-up world and shows "BOTTOM" on top in a Z-up scene, which is worse
          than no cube at all. A Z-up view cube is its own piece of work. */}
      <GizmoHelper alignment="bottom-right" margin={[72, 72]}>
        <GizmoViewport axisColors={['#dc2626', '#16a34a', '#2563eb']} labelColor="white" />
      </GizmoHelper>
    </Canvas>
  );
}
