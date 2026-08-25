/**
 * Which uploads are turned away, and with what explanation.
 *
 * The same function runs in the browser before a file is sent and on the
 * server before a row is written, so the two can never disagree about what is
 * acceptable. The rejection message is part of the behaviour: someone holding
 * a SolidWorks part needs to be told to export a STEP, not just told "no".
 */

import { describe, expect, it } from 'vitest';

import { extensionOf, formatOf, rejectionReason } from '@/lib/formats';

describe('rejectionReason', () => {
  it.each(['bracket.step', 'bracket.STEP', 'bracket.stp', 'shaft.iges', 'shaft.igs'])(
    'accepts %s',
    (filename) => {
      expect(rejectionReason(filename)).toBeNull();
    },
  );

  it.each(['mesh.stl', 'mesh.obj', 'mesh.ply', 'scene.glb', 'scene.gltf'])(
    'accepts %s',
    (filename) => {
      expect(rejectionReason(filename)).toBeNull();
    },
  );

  it.each(['part.sldprt', 'assembly.sldasm', 'part.catpart', 'part.prt', 'part.ipt'])(
    'turns away %s with a way forward',
    (filename) => {
      const reason = rejectionReason(filename);
      expect(reason).toContain('native CAD format');
      // The useful half of the message: what to do instead.
      expect(reason).toContain('STEP');
    },
  );

  it('turns away an unrelated file and lists what would work', () => {
    const reason = rejectionReason('notes.pdf');
    expect(reason).toContain('.pdf');
    expect(reason).toContain('.step');
  });

  it('turns away a file with no extension at all', () => {
    expect(rejectionReason('README')).not.toBeNull();
  });

  it('is not fooled by a dot inside the name', () => {
    expect(rejectionReason('rev.2.final.step')).toBeNull();
    expect(rejectionReason('rev.2.final.sldprt')).toContain('native CAD format');
  });
});

describe('extensionOf and formatOf', () => {
  it('lower-cases the extension', () => {
    expect(extensionOf('Bracket.STEP')).toBe('.step');
    expect(formatOf('Bracket.STEP')).toBe('step');
  });

  it('reads only the last extension', () => {
    expect(extensionOf('archive.tar.gz')).toBe('.gz');
  });

  it('returns nothing for a name without one', () => {
    expect(extensionOf('README')).toBe('');
    expect(formatOf('README')).toBe('');
  });
});
