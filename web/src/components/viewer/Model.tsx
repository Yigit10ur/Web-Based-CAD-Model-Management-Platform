'use client';

import { useEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';

import '@/lib/bvh';
import {
  faceDrawRange,
  faceOfTriangle,
  modelCentre,
  modelDiagonal,
  type BBox,
  type ModelMetadata,
} from '@/lib/metadata';
import {
  boxSide,
  capPlacement,
  faceReference,
  modelBounds,
  sectionPlane,
  shiftBox,
} from '@/lib/section';
import { modeSpec } from '@/lib/measure';
import { snapTo } from '@/lib/snap';
import { useViewerStore } from '@/store/viewer-store';

import { ClippedSolid } from './ClippedSolid';
import { FaceHighlight } from './FaceHighlight';

const EDGE_SUFFIX = '__edges';

const SELECTED_COLOR = new THREE.Color('#2563eb');
/** Under the cursor, and already taken -- the amber matches the pending marker. */
const FACE_HOVER_COLOR = '#38bdf8';
const FACE_PICKED_COLOR = '#f59e0b';
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
  clip,
  bounds,
  bbox,
  order,
}: {
  part: PartGeometry;
  metadata: ModelMetadata;
  offset: THREE.Vector3;
  /** World-space snap radius, scaled by the caller to the model's size. */
  tolerance: number;
  clip: THREE.Plane | null;
  bounds: BBox;
  /** This part's own box, for deciding what the cut does to it. */
  bbox: BBox;
  order: number;
}) {
  const hidden = useViewerStore((state) => state.hidden.has(part.id));
  const isSelected = useViewerStore((state) => state.selected === part.id);
  const select = useViewerStore((state) => state.select);
  const tool = useViewerStore((state) => state.tool);
  const setHover = useViewerStore((state) => state.setHover);
  const addMeasurementPoint = useViewerStore((state) => state.addMeasurementPoint);
  const picking = useViewerStore((state) => state.section.picking);
  const measureMode = useViewerStore((state) => state.measureMode);
  const hover = useViewerStore((state) => state.hover);
  const pending = useViewerStore((state) => state.pending);
  const setSection = useViewerStore((state) => state.setSection);

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

  /*
   * What the cut means for this part. Almost every part of an assembly is
   * wholly on one side of the plane, and the two that follow are the
   * difference between five draws per part and two.
   */
  const side = clip ? boxSide(shiftBox(bbox, offset), clip) : 'visible';

  // Behind the plane: not drawn at all. Drawing it and letting the GPU discard
  // every fragment is work that was never going to appear.
  if (side === 'clipped') return null;

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
      clip,
      // What is being measured decides what is worth snapping to: a face
      // measurement must not land on the edge that borders the face.
      modeSpec(measureMode).wants,
    );

  /**
   * Raycasting ignores clipping planes, so a part that has been sectioned away
   * still answers the ray. Such a hit is dropped without stopping propagation,
   * which lets whatever is actually visible behind it take the event.
   */
  const sectionedAway = (event: ThreeEvent<PointerEvent | MouseEvent>) =>
    clip !== null && clip.distanceToPoint(event.point.clone().sub(offset)) < 0;

  /**
   * Borrow the clicked face's direction for the section plane.
   *
   * The rule itself is in `lib/section.ts` -- which face can be borrowed from
   * and where the cut lands -- so it can be tested without a scene, and so
   * this stays what it should be: turning a click into a face, and an answer
   * into state.
   */
  const handleSectionPick = (event: ThreeEvent<MouseEvent>) => {
    const index = brepFace(event);
    const face = index == null ? undefined : metadata.snap[part.id]?.faces[index];
    const result = faceReference(face, event.point.clone().sub(offset), bounds);

    if (!result.taken) {
      setSection({ pickError: result.reason });
      return;
    }

    setSection({
      reference: 'custom',
      normal: result.normal,
      position: result.position,
      rotateX: 0,
      rotateY: 0,
      picking: false,
      pickError: null,
    });
  };

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    if (sectionedAway(event)) return;
    event.stopPropagation();

    if (picking) {
      handleSectionPick(event);
      return;
    }

    if (tool === 'measure') {
      const target = snapAt(event);
      if (target) addMeasurementPoint(target);
      return;
    }

    select(part.id, brepFace(event));
  };

  const handlePointerMove = (event: ThreeEvent<PointerEvent>) => {
    if (tool !== 'measure') return;
    if (sectionedAway(event)) return;
    event.stopPropagation();
    setHover(snapAt(event));
  };

  const planes = clip ? [clip] : [];

  /*
   * Which face of this part to light up, if any.
   *
   * Only while a face is what is being measured. In point mode the cursor is
   * aiming at a corner or an edge, and lighting up the whole face behind it
   * would say the wrong thing about what the next click will take.
   */
  const groups = metadata.face_groups[part.id];
  const wantsFaces = tool === 'measure' && modeSpec(measureMode).wants === 'face';

  const litFace = (target: typeof hover) =>
    wantsFaces && target?.kind === 'face' && target.partId === part.id
      ? faceDrawRange(groups, target.index)
      : null;

  const hovered = litFace(hover);
  const picked = litFace(pending);

  return (
    <group position={position.clone().add(offset)} quaternion={quaternion} scale={scale}>
      {/* Capped only where the plane actually passes through material. A part
          in front of the cut has no cut face to fill in, and the stencil work
          and the quad behind it are pure cost. */}
      {clip && side === 'crossing' && (
        <ClippedSolid
          geometry={part.surface}
          plane={clip}
          color={isSelected ? SELECTED_COLOR : part.color}
          {...capPlacement(bbox, offset, clip)}
          order={order}
        />
      )}

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
          clippingPlanes={planes}
        />
      </mesh>

      {/* The face already taken stays lit, so a measurement in progress shows
          both halves of itself. Drawn after the hover so that pointing back at
          it does not hide which one is which. */}
      {hovered && (
        <FaceHighlight
          geometry={part.surface}
          range={hovered}
          color={FACE_HOVER_COLOR}
          clip={clip}
        />
      )}
      {picked && (
        <FaceHighlight
          geometry={part.surface}
          range={picked}
          color={FACE_PICKED_COLOR}
          clip={clip}
        />
      )}

      {part.edges && (
        <lineSegments geometry={part.edges} raycast={() => null}>
          <lineBasicMaterial
            color={isSelected ? SELECTED_EDGE_COLOR : EDGE_COLOR}
            clippingPlanes={planes}
          />
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

  const section = useViewerStore((state) => state.section);
  const bounds = useMemo(() => modelBounds(metadata.parts), [metadata]);

  const clip = useMemo(
    () => (section.enabled ? sectionPlane(section, bounds) : null),
    [section, bounds],
  );

  return (
    <group>
      {parts.map((part, index) => {
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
            clip={clip}
            bounds={bounds}
            bbox={metadata.parts[part.id]?.bbox ?? bounds}
            order={index * 2 + 1}
          />
        );
      })}
    </group>
  );
}
