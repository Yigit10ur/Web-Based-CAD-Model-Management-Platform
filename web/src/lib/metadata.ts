/**
 * The converter's metadata.json, mirrored on the client.
 *
 * This is the contract between the two services (ARCHITECTURE.md section 5).
 * The viewer reads nothing else about model structure, so any change here has
 * to be made in converter/app/models.py at the same time.
 */

import { useEffect, useState } from 'react';

export type Vec3 = [number, number, number];
export type BBox = [Vec3, Vec3];

export interface TreeNode {
  id: string;
  name: string;
  children: TreeNode[];
  mesh_index: number | null;
}

export interface PartMetadata {
  volume_mm3: number;
  area_mm2: number;
  com: Vec3;
  bbox: BBox;
}

export interface ModelMetadata {
  tree: TreeNode[];
  parts: Record<string, PartMetadata>;
  units: string;
  /** Part id -> [start, end) triangle ranges, one per B-rep face, in order. */
  face_groups: Record<string, [number, number][]>;
}

export function useModelMetadata(url: string) {
  const [metadata, setMetadata] = useState<ModelMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        return response.json() as Promise<ModelMetadata>;
      })
      .then((data) => {
        if (!cancelled) setMetadata(data);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  return { metadata, error };
}

/** Flatten the assembly tree into the leaf parts, in tree order. */
export function leafIds(nodes: TreeNode[]): string[] {
  return nodes.flatMap((node) =>
    node.children.length > 0 ? leafIds(node.children) : [node.id],
  );
}

/**
 * Which B-rep face a triangle belongs to.
 *
 * The face ranges tile the part's triangle list in order, so a linear scan is
 * enough here; if a part ever has thousands of faces this becomes a binary
 * search over the range starts.
 */
export function faceOfTriangle(
  ranges: [number, number][] | undefined,
  triangleIndex: number,
): number | null {
  if (!ranges) return null;
  const index = ranges.findIndex(([start, end]) => triangleIndex >= start && triangleIndex < end);
  return index === -1 ? null : index;
}

/** Centre of the whole model, used as the origin for the exploded view. */
export function modelCentre(parts: Record<string, PartMetadata>): Vec3 {
  const boxes = Object.values(parts);
  if (boxes.length === 0) return [0, 0, 0];

  const low: Vec3 = [Infinity, Infinity, Infinity];
  const high: Vec3 = [-Infinity, -Infinity, -Infinity];

  for (const part of boxes) {
    for (let axis = 0; axis < 3; axis += 1) {
      low[axis] = Math.min(low[axis], part.bbox[0][axis]);
      high[axis] = Math.max(high[axis], part.bbox[1][axis]);
    }
  }

  return [(low[0] + high[0]) / 2, (low[1] + high[1]) / 2, (low[2] + high[2]) / 2];
}
