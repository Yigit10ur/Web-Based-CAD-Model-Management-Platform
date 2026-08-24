'use client';

import { useEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';

import '@/lib/bvh';
import {
  faceOfTriangle,
  modelCentre,
  modelDiagonal,
  type ModelMetadata,
} from '@/lib/metadata';
import { snapTo } from '@/lib/snap';
import { useViewerStore } from '@/store/viewer-store';

const EDGE_SUFFIX = '__edges';

const SELECTED_COLOR = new THREE.Color('#2563eb');
const EDGE_COLOR = new THREE.Color('#334155');
const SELECTED_EDGE_COLOR = new THREE.Color('#1e3a8a');

interface PartGeometry {
  id: string;
  surface: THREE.BufferGeometry;
  edges: THREE.BufferGeometry | null;
  color: THREE.Color;
  transform: THREE.Matrix4;
}

/**
 * Split the loaded glb into one entry per part.
 *
 * The converter writes a node per part plus a sibling `<id>__edges` node
 * holding the B-rep edges as a LINES primitive, so the two are paired by name
 * rather than by position in the file.
 */
function usePartGeometries(url: string): PartGeometry[] {
  const { scene } = useGLTF(url);

  return useMemo(() => {
    scene.updateMatrixWorld(true);

    const surfaces = new Map<string, THREE.Mesh>();
    const edges = new Map<string, THREE.LineSegments>();

    scene.traverse((object) => {
      if (object.name.endsWith(EDGE_SUFFIX)) {
        if ((object as THREE.LineSegments).isLineSegments) {
          edges.set(object.name.slice(0, -EDGE_SUFFIX.length), object as THREE.LineSegments);
        }
      } else if ((object as THREE.Mesh).isMesh) {
        surfaces.set(object.name, object as THREE.Mesh);
      }
    });

    return [...surfaces].map(([id, mesh]) => {
      const material = mesh.material as THREE.MeshStandardMaterial;
      return {
        id,
        surface: mesh.geometry,
        edges: edges.get(id)?.geometry ?? null,
        // The converter puts the source CAD colour in the glTF material; the
        // viewer only overrides it to show selection.
        color: material?.color?.clone() ?? new THREE.Color('#9ca3af'),
        transform: mesh.matrixWorld.clone(),
      };
    });
  }, [scene]);
}

function Part({
  part,
  metadata,
  offset,
  tolerance,
}: {
  part: PartGeometry;
  metadata: ModelMetadata;
  offset: THREE.Vector3;
  /** World-space snap radius, scaled by the caller to the model's size. */
  tolerance: number;
}) {
  const hidden = useViewerStore((state) => state.hidden.has(part.id));
  const isSelected = useViewerStore((state) => state.selected === part.id);
  const select = useViewerStore((state) => state.select);
  const tool = useViewerStore((state) => state.tool);
  const setHover = useViewerStore((state) => state.setHover);
  const addMeasurementPoint = useViewerStore((state) => state.addMeasurementPoint);

  useEffect(() => {
    part.surface.computeBoundsTree?.();
    return () => part.surface.disposeBoundsTree?.();
  }, [part.surface]);

  const { position, quaternion, scale } = useMemo(() => {
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    part.transform.decompose(position, quaternion, scale);
    return { position, quaternion, scale };
  }, [part.transform]);

  if (hidden) return null;

  // faceIndex is the triangle that was hit; the face groups turn it back into
  // the B-rep face it came from.
  const brepFace = (event: ThreeEvent<PointerEvent | MouseEvent>) =>
    event.faceIndex == null
      ? null
      : faceOfTriangle(metadata.face_groups[part.id], event.faceIndex);

  /**
   * The hit point is on the display mesh; snapping moves it onto the exact
   * geometry before anything measures with it. The offset is subtracted first
   * because an exploded part is drawn away from where its CAD data says it is.
   */
  const snapAt = (event: ThreeEvent<PointerEvent | MouseEvent>) =>
    snapTo(
      event.point.clone().sub(offset),
      part.id,
      metadata.snap[part.id],
      brepFace(event),
      tolerance,
    );

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();

    if (tool === 'measure') {
      addMeasurementPoint(snapAt(event));
      return;
    }

    select(part.id, brepFace(event));
  };

  const handlePointerMove = (event: ThreeEvent<PointerEvent>) => {
    if (tool !== 'measure') return;
    event.stopPropagation();
    setHover(snapAt(event));
  };

  return (
    <group position={position.clone().add(offset)} quaternion={quaternion} scale={scale}>
      <mesh
        geometry={part.surface}
        onClick={handleClick}
        onPointerMove={handlePointerMove}
        onPointerOut={() => tool === 'measure' && setHover(null)}
      >
        <meshStandardMaterial
          color={isSelected ? SELECTED_COLOR : part.color}
          metalness={0.1}
          roughness={0.6}
        />
      </mesh>

      {part.edges && (
        <lineSegments geometry={part.edges} raycast={() => null}>
          <lineBasicMaterial color={isSelected ? SELECTED_EDGE_COLOR : EDGE_COLOR} />
        </lineSegments>
      )}
    </group>
  );
}

export function Model({ url, metadata }: { url: string; metadata: ModelMetadata }) {
  const parts = usePartGeometries(url);
  const explode = useViewerStore((state) => state.explode);

  const centre = useMemo(() => new THREE.Vector3(...modelCentre(metadata.parts)), [metadata]);

  // A snap radius proportional to the model keeps the tool behaving the same
  // on a bracket and on a chassis.
  const tolerance = useMemo(() => modelDiagonal(metadata.parts) * 0.03, [metadata]);

  return (
    <group>
      {parts.map((part) => {
        // Parts move away from the model centre along the line through their
        // own centre of mass, which is the value the converter already
        // computed exactly.
        const com = metadata.parts[part.id]?.com;
        const offset = com
          ? new THREE.Vector3(...com).sub(centre).multiplyScalar(explode)
          : new THREE.Vector3();

        return (
          <Part
            key={part.id}
            part={part}
            metadata={metadata}
            offset={offset}
            tolerance={tolerance}
          />
        );
      })}
    </group>
  );
}
