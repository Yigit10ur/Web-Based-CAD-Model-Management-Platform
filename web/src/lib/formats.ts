/**
 * Which uploads the converter can actually do something with.
 *
 * Native CAD formats are rejected here with a message that says why, rather
 * than being accepted and failing in the worker twenty minutes later. See
 * ARCHITECTURE.md section 9.
 */

export const SUPPORTED_EXTENSIONS = [
  '.step',
  '.stp',
  '.iges',
  '.igs',
  '.stl',
  '.obj',
  '.ply',
  '.glb',
  '.gltf',
] as const;

const NATIVE_EXTENSIONS = ['.sldprt', '.sldasm', '.catpart', '.catproduct', '.prt', '.ipt', '.iam'];

export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? '' : filename.slice(dot).toLowerCase();
}

export function rejectionReason(filename: string): string | null {
  const extension = extensionOf(filename);

  if (SUPPORTED_EXTENSIONS.includes(extension as (typeof SUPPORTED_EXTENSIONS)[number])) {
    return null;
  }

  if (NATIVE_EXTENSIONS.includes(extension)) {
    return `${extension} is a native CAD format and needs a commercial SDK to read. Export to STEP and upload that.`;
  }

  return `${extension || 'that file type'} is not supported. Upload one of: ${SUPPORTED_EXTENSIONS.join(', ')}.`;
}

export function formatOf(filename: string): string {
  return extensionOf(filename).replace('.', '');
}
