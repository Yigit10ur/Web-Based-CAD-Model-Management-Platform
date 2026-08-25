/**
 * Which uploads the converter can do something with, and why the rest cannot.
 *
 * The same function runs in the browser before a file is sent and on the
 * server before a row is written, so the two can never disagree. Rejecting
 * early matters: the alternative is accepting the file, queueing it, and
 * failing twenty minutes later with a message nobody reads.
 *
 * The wording is part of the behaviour. Someone holding a native CAD file
 * needs to be told what to do instead, and that answer is different for a part
 * than it is for a drawing.
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

type NativeKind = 'part' | 'assembly' | 'drawing';

/** Used where several applications share an extension and none can be named. */
const UNNAMED = 'a CAD';

interface NativeFormat {
  kind: NativeKind;
  application: string;
}

/**
 * Native formats, by the application that writes them.
 *
 * None of these can be read without a commercial SDK (ARCHITECTURE.md
 * section 9). Grouping them by kind rather than listing them flat is what
 * lets the message be useful: a part and an assembly both export to STEP, a
 * drawing does not export to anything this platform can show.
 */
const NATIVE_FORMATS: Record<string, NativeFormat> = {
  // Autodesk Inventor
  '.ipt': { kind: 'part', application: 'Inventor' },
  '.iam': { kind: 'assembly', application: 'Inventor' },
  '.idw': { kind: 'drawing', application: 'Inventor' },

  // SolidWorks
  '.sldprt': { kind: 'part', application: 'SolidWorks' },
  '.sldasm': { kind: 'assembly', application: 'SolidWorks' },
  '.slddrw': { kind: 'drawing', application: 'SolidWorks' },

  // CATIA
  '.catpart': { kind: 'part', application: 'CATIA' },
  '.catproduct': { kind: 'assembly', application: 'CATIA' },
  '.catdrawing': { kind: 'drawing', application: 'CATIA' },

  // Creo and Solid Edge share these, so the application is left unnamed.
  '.prt': { kind: 'part', application: 'a CAD' },
  '.asm': { kind: 'assembly', application: 'a CAD' },
  '.par': { kind: 'part', application: 'Solid Edge' },
  '.psm': { kind: 'part', application: 'Solid Edge' },
  '.dft': { kind: 'drawing', application: 'Solid Edge' },
  '.drw': { kind: 'drawing', application: 'a CAD' },
};

/** Drawing exchange formats, which describe sheets rather than solids. */
const DRAWING_EXCHANGE = ['.dwg', '.dxf'];

export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? '' : filename.slice(dot).toLowerCase();
}

export function formatOf(filename: string): string {
  return extensionOf(filename).replace('.', '');
}

/** "an Inventor", but "a SolidWorks" and "a CATIA". */
function withArticle(noun: string): string {
  return `${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun}`;
}

function nativeMessage(extension: string, format: NativeFormat): string {
  const source = format.application === UNNAMED ? 'a native CAD' : withArticle(format.application);

  if (format.kind === 'drawing') {
    // Telling someone to export a drawing to STEP would send them in circles:
    // a drawing has no solid to export. What they want is the model it
    // documents.
    const owner = format.application === UNNAMED ? 'a' : withArticle(format.application);
    return `${extension} is ${owner} drawing, not a 3D model. Upload the part or assembly it documents, exported to STEP.`;
  }

  return `${extension} is ${source} ${format.kind} file, which needs a commercial SDK to read. Export it to STEP and upload that.`;
}

export function rejectionReason(filename: string): string | null {
  const extension = extensionOf(filename);

  if (SUPPORTED_EXTENSIONS.includes(extension as (typeof SUPPORTED_EXTENSIONS)[number])) {
    return null;
  }

  const native = NATIVE_FORMATS[extension];
  if (native) return nativeMessage(extension, native);

  if (DRAWING_EXCHANGE.includes(extension)) {
    return `${extension} is a 2D drawing format. This platform inspects 3D models — upload the model itself, exported to STEP.`;
  }

  return `${extension || 'that file type'} is not supported. Upload one of: ${SUPPORTED_EXTENSIONS.join(', ')}.`;
}
