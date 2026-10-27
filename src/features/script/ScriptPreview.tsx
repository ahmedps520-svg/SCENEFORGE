import type { ScriptElement } from '@/lib/types';
import { cn } from '@/components/ui';
import type { DiffOp } from './diff';

function Row({ el, state }: { el: ScriptElement; state?: 'added' | 'removed' }) {
  if (!el.text.trim()) return null;
  return (
    <div className={cn('sf-row', `sf-${el.type}`, state && `sf-${state}`)}>
      <div className="sf-block">
        <div className="sf-text">{el.text}</div>
      </div>
    </div>
  );
}

/** Read-only screenplay rendering for previews, optionally showing a comparison. */
export function ScriptPreview({ elements, diff, paper }: { elements?: ScriptElement[]; diff?: DiffOp[]; paper: 'dark' | 'light' }) {
  return (
    <div className="sf-paper" data-paper={paper} style={{ fontSize: 13 }}>
      <div className="rounded-sm border border-[var(--sf-line)] px-5 py-6 sm:px-8" style={{ background: 'var(--sf-bg)' }}>
        <div className="sf-col sf-static">
          {diff
            ? diff.map((op, i) => {
                if (op.kind === 'same') return <Row key={i} el={op.b} />;
                if (op.kind === 'added') return <Row key={i} el={op.b} state="added" />;
                if (op.kind === 'removed') return <Row key={i} el={op.a} state="removed" />;
                return (
                  <div key={i}>
                    <Row el={op.a} state="removed" />
                    <Row el={op.b} state="added" />
                  </div>
                );
              })
            : elements?.map((el) => <Row key={el.id} el={el} />)}
          {!diff && !elements?.some((e) => e.text.trim()) && <p className="font-sans text-[13px]" style={{ color: 'var(--sf-muted)' }}>This version is empty.</p>}
        </div>
      </div>
    </div>
  );
}
