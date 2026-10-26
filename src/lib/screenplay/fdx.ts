import { uid } from '../ids';
import type { ElementType, ScriptElement, TitlePage } from '../types';
import { stripSceneNumber } from './heading';
import type { ParsedScreenplay } from './fountain';

/** Final Draft (.fdx) paragraph types mapped to SCENEFORGE element types. */
const FDX_TYPES: Record<string, ElementType> = {
  'Scene Heading': 'scene',
  Action: 'action',
  General: 'action',
  Character: 'character',
  Parenthetical: 'parenthetical',
  Dialogue: 'dialogue',
  Transition: 'transition',
  Shot: 'shot',
  'Cast List': 'action',
};

const TO_FDX: Record<ElementType, string> = {
  scene: 'Scene Heading',
  action: 'Action',
  character: 'Character',
  parenthetical: 'Parenthetical',
  dialogue: 'Dialogue',
  transition: 'Transition',
  shot: 'Shot',
  centered: 'Action',
};

function paragraphText(p: Element): string {
  return Array.from(p.getElementsByTagName('Text'))
    .map((t) => t.textContent ?? '')
    .join('')
    .replace(/\r\n?/g, '\n');
}

export function parseFdx(xml: string): ParsedScreenplay {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) {
    throw new Error('This file is not valid Final Draft XML.');
  }
  const content = doc.getElementsByTagName('Content')[0];
  if (!content) throw new Error('No screenplay content was found in this Final Draft file.');

  const elements: ScriptElement[] = [];
  for (const p of Array.from(content.children)) {
    if (p.tagName !== 'Paragraph') continue;
    const fdxType = p.getAttribute('Type') ?? 'Action';
    const type: ElementType =
      p.getAttribute('Alignment') === 'Center' && (fdxType === 'Action' || fdxType === 'General')
        ? 'centered'
        : FDX_TYPES[fdxType] ?? 'action';
    const text = paragraphText(p).trim();
    if (!text) continue;
    const e: ScriptElement = { id: uid(), type, text: type === 'scene' ? stripSceneNumber(text) : text };
    if (type === 'scene') e.sceneId = uid();
    elements.push(e);
  }

  // The title page is stored as centred paragraphs; keep the first as the title.
  const titlePage: Partial<TitlePage> = {};
  const tp = doc.getElementsByTagName('TitlePage')[0];
  if (tp) {
    const lines = Array.from(tp.getElementsByTagName('Paragraph'))
      .map(paragraphText)
      .map((s) => s.trim())
      .filter(Boolean);
    if (lines[0]) titlePage.title = lines[0];
    const byIdx = lines.findIndex((l) => /^(written )?by$/i.test(l));
    if (byIdx >= 0 && lines[byIdx + 1]) {
      titlePage.credit = lines[byIdx];
      titlePage.author = lines[byIdx + 1];
    }
  }
  return { titlePage, elements };
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function toFdx(elements: ScriptElement[], titlePage?: Partial<TitlePage>): string {
  const paras = elements
    .filter((e) => e.text.trim())
    .map((e) => {
      const align = e.type === 'centered' ? ' Alignment="Center"' : '';
      return `    <Paragraph Type="${TO_FDX[e.type]}"${align}>\n      <Text>${esc(e.text.trim())}</Text>\n    </Paragraph>`;
    })
    .join('\n');
  const tpLines = [titlePage?.title, titlePage?.credit, titlePage?.author, titlePage?.source, titlePage?.draftDate, titlePage?.contact]
    .filter((s): s is string => !!s && !!s.trim())
    .map((s) => `      <Paragraph Alignment="Center" Type="General"><Text>${esc(s)}</Text></Paragraph>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft DocumentType="Script" Template="No" Version="5">
  <Content>
${paras}
  </Content>
  <TitlePage>
    <Content>
${tpLines}
    </Content>
  </TitlePage>
</FinalDraft>
`;
}
