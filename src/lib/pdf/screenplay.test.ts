import { describe, expect, it } from 'vitest';
import { makeProject, makeScript } from '../data/factories';
import { parseFountain } from '../screenplay/fountain';
import { buildScreenplayPdf } from './screenplay';

describe('screenplay pdf', () => {
  it('builds a multi-page document with a title page', () => {
    const body = Array.from({ length: 40 }, (_, i) => `INT. ROOM ${i} - DAY\n\nSomething happens in room ${i}.\n\nMARA\n(quietly)\nLine ${i} of dialogue that runs on for a while.\n`).join('\n');
    const { elements } = parseFountain(body);
    const project = makeProject({ title: 'Test Film' });
    const script = makeScript(project.id, { elements, revisionColor: 'blue' });
    const numbers = new Map(elements.filter((e) => e.type === 'scene').map((e, i) => [e.sceneId!, String(i + 1)]));
    const doc = buildScreenplayPdf({ script, project, pageSize: 'letter', sceneNumbers: numbers, showSceneNumbers: true, includeTitlePage: true });
    expect(doc.getNumberOfPages()).toBeGreaterThan(3);
    const a4 = buildScreenplayPdf({ script, project, pageSize: 'a4', sceneNumbers: numbers, showSceneNumbers: false, includeTitlePage: false });
    expect(a4.getNumberOfPages()).toBeGreaterThan(2);
    expect(doc.output('arraybuffer').byteLength).toBeGreaterThan(1000);
  });
});
