import { CheckCircle2, MessageSquare, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { db } from '@/lib/db';
import { relativeTime } from '@/lib/dates';
import { logActivity, touchProject } from '@/lib/data/crud';
import { actorName } from '@/lib/data/settings';
import { useComments } from '@/lib/hooks';
import { uid } from '@/lib/ids';
import type { EntityType } from '@/lib/types';
import { Avatar, Button, cn, Textarea, toastError } from './ui';

/** Comment thread attached to any record (scene, shot, frame, task, character…). */
export function Comments({ projectId, entityType, entityId, className }: { projectId: string; entityType: EntityType; entityId: string; className?: string }) {
  const comments = useComments(entityId);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const post = async () => {
    const t = text.trim();
    if (!t) return;
    setBusy(true);
    try {
      const now = Date.now();
      await db.comments.add({ id: uid(), projectId, entityType, entityId, author: actorName(), text: t, resolved: false, createdAt: now, updatedAt: now });
      await touchProject(projectId);
      await logActivity({ projectId, action: 'created', entityType, entityId, summary: `Commented: “${t.length > 60 ? t.slice(0, 59) + '…' : t}”` });
      setText('');
    } catch (e) {
      toastError(e, 'Comment not saved');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center gap-2">
        <MessageSquare className="size-3.5 text-faint" />
        <span className="eyebrow">Comments {comments?.length ? `· ${comments.length}` : ''}</span>
      </div>
      {comments?.length === 0 && <p className="text-[12.5px] text-faint">No comments yet. Notes for collaborators go here.</p>}
      <ul className="space-y-3">
        {comments?.map((c) => (
          <li key={c.id} className={cn('group flex gap-2.5', c.resolved && 'opacity-55')}>
            <Avatar name={c.author} size={24} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2 text-[12px]">
                <span className="font-medium text-ink">{c.author}</span>
                <span className="text-faint">{relativeTime(c.createdAt)}</span>
                {c.resolved && <span className="text-success">Resolved</span>}
                <span className="ml-auto flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                  <button className="text-faint hover:text-success" title={c.resolved ? 'Reopen' : 'Resolve'} aria-label={c.resolved ? 'Reopen comment' : 'Resolve comment'} onClick={() => void db.comments.update(c.id, { resolved: !c.resolved })}>
                    <CheckCircle2 className="size-3.5" />
                  </button>
                  <button className="text-faint hover:text-danger" title="Delete comment" aria-label="Delete comment" onClick={() => void db.comments.delete(c.id)}>
                    <Trash2 className="size-3.5" />
                  </button>
                </span>
              </div>
              <p className="mt-0.5 whitespace-pre-wrap text-[13px] text-ink/90">{c.text}</p>
            </div>
          </li>
        ))}
      </ul>
      <div className="space-y-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a comment…"
          rows={2}
          className="min-h-[60px]"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void post();
          }}
        />
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-faint">⌘/Ctrl + Enter to post · as {actorName()}</span>
          <Button size="sm" variant="secondary" onClick={() => void post()} disabled={!text.trim()} loading={busy}>
            Comment
          </Button>
        </div>
      </div>
    </div>
  );
}
