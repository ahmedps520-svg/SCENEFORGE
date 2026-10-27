import { displayText } from '@/lib/screenplay/paginate';
import type { ScriptElement } from '@/lib/types';
import { cn } from '@/components/ui';

/** Elements of one scene: its heading through the line before the next heading. */
export function sceneElements(elements: ScriptElement[], sceneId: string): ScriptElement[] {
  const start = elements.findIndex((e) => e.type === 'scene' && e.sceneId === sceneId);
  if (start < 0) return [];
  let end = start + 1;
  while (end < elements.length && !(elements[end].type === 'scene' && elements[end].sceneId && elements[end].text.trim())) end++;
  return elements.slice(start, end);
}

const STYLE: Record<ScriptElement['type'], string> = {
  scene: 'font-bold uppercase mt-4 first:mt-0',
  action: 'mt-3',
  character: 'uppercase mt-3 pl-[37%]',
  parenthetical: 'pl-[27%] pr-[25%]',
  dialogue: 'pl-[17%] pr-[17%]',
  transition: 'uppercase text-right mt-3',
  shot: 'uppercase mt-3',
  centered: 'text-center mt-3',
};

/** Read-only screenplay-formatted preview, sized for side panels. */
export function ScriptPreview({ elements, className, sceneNumber }: { elements: ScriptElement[]; className?: string; sceneNumber?: string }) {
  if (!elements.length) return null;
  return (
    <div className={cn('rounded-md border border-line bg-paper px-5 py-4 font-script text-[12.5px] leading-[1.45] text-paper-ink', className)}>
      {elements.map((e) => {
        const text = displayText(e);
        if (!text) return null;
        return (
          <p key={e.id} className={cn('whitespace-pre-wrap', STYLE[e.type])}>
            {e.type === 'scene' && sceneNumber && <span className="mr-3 text-faint">{sceneNumber}</span>}
            {text}
          </p>
        );
      })}
    </div>
  );
}
