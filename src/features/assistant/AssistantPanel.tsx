import { History, Loader2, Plus, RefreshCw, Send, Settings2, Sparkles, Square, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type Anthropic from '@anthropic-ai/sdk';
import type { AssistantFocus } from '@/app/WorkspaceLayout';
import { Button, IconButton, Loading, Menu, MenuItem, MenuLabel, MenuSeparator, SinglePicker, Textarea, toast, toastError, toastUndo, useConfirm } from '@/components/ui';
import { applyProposal, undoProposal } from '@/lib/ai/apply';
import { describeError, runAssistantTurn } from '@/lib/ai/client';
import { QUICK_PROMPTS } from '@/lib/ai/prompts';
import { appendTurns, createThread, deleteThread, removeTurns, updateProposal } from '@/lib/ai/threads';
import { AI_MODELS } from '@/lib/constants';
import { db } from '@/lib/db';
import { relativeTime } from '@/lib/dates';
import { useSettings } from '@/lib/data/settings';
import { useCharacters, useProject, useScenes, useScript, useThreads } from '@/lib/hooks';
import { uid } from '@/lib/ids';
import { sceneNumbers } from '@/lib/numbering';
import type { AssistantThread, AssistantTurn, Proposal } from '@/lib/types';
import { AssistantSetup } from './AssistantSetup';
import { Markdown } from './Markdown';
import { ProposalCard, type PreviewData } from './ProposalCard';

interface Props {
  projectId: string;
  focus?: AssistantFocus;
  onFocusChange: (f?: AssistantFocus) => void;
  onClose: () => void;
}

interface LiveTurn {
  threadId: string;
  user: AssistantTurn;
  text: string;
  proposals: Proposal[];
  activity: string | null;
}

export default function AssistantPanel({ projectId, focus, onFocusChange, onClose }: Props) {
  const settings = useSettings();
  const [showSettings, setShowSettings] = useState(false);
  const ready = !!settings?.ai.enabled && !!settings.ai.apiKey;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && window.matchMedia('(max-width: 767px)').matches) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <aside
      aria-label="AI filmmaking assistant"
      className="fixed inset-0 z-50 flex flex-col bg-panel animate-fade-in md:static md:z-auto md:w-[400px] md:shrink-0 md:border-l md:border-line md:animate-slide-in-right"
    >
      {!settings ? (
        <Loading label="Loading assistant" />
      ) : !ready || showSettings ? (
        <>
          <PanelHeader title="Assistant" subtitle={showSettings ? 'Settings' : 'Not set up'} onClose={onClose} />
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
            <AssistantSetup settings={settings} onDone={ready || showSettings ? () => setShowSettings(false) : undefined} />
          </div>
        </>
      ) : (
        <Conversation
          projectId={projectId}
          focus={focus}
          onFocusChange={onFocusChange}
          onClose={onClose}
          apiKey={settings.ai.apiKey}
          model={settings.ai.model}
          onOpenSettings={() => setShowSettings(true)}
        />
      )}
    </aside>
  );
}

function PanelHeader({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children?: React.ReactNode }) {
  return (
    <div className="flex h-12 shrink-0 items-center gap-1 border-b border-line pl-4 pr-2">
      <Sparkles className="size-4 text-accent" />
      <div className="ml-1.5 min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium text-ink">{title}</div>
        {subtitle && <div className="slate -mt-0.5 truncate text-[9.5px]">{subtitle}</div>}
      </div>
      {children}
      <IconButton label="Close assistant" onClick={onClose}>
        <X className="size-4" />
      </IconButton>
    </div>
  );
}

function Conversation({
  projectId,
  focus,
  onFocusChange,
  onClose,
  apiKey,
  model,
  onOpenSettings,
}: Props & { apiKey: string; model: string; onOpenSettings: () => void }) {
  const confirm = useConfirm();
  const threads = useThreads(projectId);
  const project = useProject(projectId);
  const script = useScript(project?.primaryScriptId);
  const scenes = useScenes(projectId);
  const characters = useCharacters(projectId);
  const [threadId, setThreadId] = useState<string | 'new' | null>(null);
  const [input, setInput] = useState('');
  const [live, setLive] = useState<LiveTurn | null>(null);
  const liveRef = useRef<LiveTurn | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const numbers = useMemo(() => sceneNumbers(scenes ?? []), [scenes]);
  const preview: PreviewData = { scenes: scenes ?? [], characters: characters ?? [], numbers, script };

  const active: AssistantThread | undefined =
    threadId === 'new' ? undefined : threadId ? threads?.find((t) => t.id === threadId) : threads?.[0];

  // Stop any in-flight request when the panel closes.
  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: live ? 'auto' : 'smooth' });
  }, [active?.turns.length, live?.text, live?.proposals.length, live]);

  const setLiveBoth = (fn: (l: LiveTurn) => LiveTurn) => {
    if (!liveRef.current) return;
    liveRef.current = fn(liveRef.current);
    setLive(liveRef.current);
  };

  const send = async (raw: string, turnFocus: AssistantFocus | undefined = focus) => {
    const text = raw.trim();
    if (!text || liveRef.current) return;
    let thread = active;
    try {
      if (!thread) {
        thread = await createThread(projectId, text);
        setThreadId(thread.id);
      }
    } catch (e) {
      toastError(e, 'Couldn’t start a conversation');
      return;
    }
    const user: AssistantTurn = { id: uid(), role: 'user', text, proposals: [], focus: turnFocus, at: Date.now() };
    const controller = new AbortController();
    abortRef.current = controller;
    liveRef.current = { threadId: thread.id, user, text: '', proposals: [], activity: null };
    setLive(liveRef.current);
    setInput('');

    const reply: AssistantTurn = { id: uid(), role: 'assistant', text: '', proposals: [], at: Date.now() };
    let apiMessages: unknown[] | undefined;
    try {
      const r = await runAssistantTurn({
        apiKey,
        model,
        projectId,
        history: thread.apiMessages as Anthropic.Beta.BetaMessageParam[],
        userText: text,
        focus: turnFocus ? { type: turnFocus.type, id: turnFocus.id } : undefined,
        signal: controller.signal,
        callbacks: {
          onText: (d) => setLiveBoth((l) => ({ ...l, text: l.text + d })),
          onProposal: (p) => setLiveBoth((l) => ({ ...l, proposals: [...l.proposals, p] })),
          onActivity: (a) => setLiveBoth((l) => ({ ...l, activity: a })),
        },
      });
      reply.text = r.text;
      reply.proposals = r.proposals;
      reply.notice = r.notice;
      // Only a finished turn joins the API history; a stopped one is left out so history stays valid.
      if (r.complete) apiMessages = r.apiMessages;
    } catch (e) {
      reply.text = liveRef.current?.text ?? '';
      reply.proposals = liveRef.current?.proposals ?? [];
      reply.error = describeError(e).message;
    }
    try {
      await appendTurns(thread.id, [user, reply], apiMessages);
    } catch (e) {
      toastError(e, 'Couldn’t save this conversation');
    }
    liveRef.current = null;
    abortRef.current = null;
    setLive(null);
  };

  const retry = async (thread: AssistantThread, assistantTurn: AssistantTurn) => {
    const idx = thread.turns.findIndex((t) => t.id === assistantTurn.id);
    const userTurn = thread.turns[idx - 1];
    if (!userTurn || userTurn.role !== 'user') return;
    await removeTurns(thread.id, [userTurn.id, assistantTurn.id]);
    await send(userTurn.text, userTurn.focus);
  };

  const apply = async (threadIdFor: string, turnId: string, p: Proposal) => {
    try {
      const next = await applyProposal(projectId, p);
      await updateProposal(threadIdFor, turnId, next);
      toast('Suggestion applied', { detail: 'Use Undo on the card to reverse it.' });
    } catch (e) {
      await updateProposal(threadIdFor, turnId, { ...p, status: 'failed', error: e instanceof Error ? e.message : String(e) });
    }
  };
  const dismiss = async (threadIdFor: string, turnId: string, p: Proposal) => {
    await updateProposal(threadIdFor, turnId, { ...p, status: p.status === 'dismissed' ? 'pending' : 'dismissed', resolvedAt: Date.now() });
  };
  const undo = async (threadIdFor: string, turnId: string, p: Proposal) => {
    try {
      const next = await undoProposal(projectId, p);
      await updateProposal(threadIdFor, turnId, next);
      toast('Suggestion undone');
    } catch (e) {
      toastError(e, 'Couldn’t undo');
    }
  };

  const removeThread = async (t: AssistantThread) => {
    const ok = await confirm({ title: 'Delete this conversation?', message: 'Applied suggestions stay in your project.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    const removed = await deleteThread(t.id);
    setThreadId(null);
    if (removed) toastUndo('Conversation deleted', async () => void (await db.threads.put(removed)));
  };

  const focusOptions = useMemo(
    () => [
      ...(scenes ?? []).map((s) => ({ value: `scene:${s.id}`, label: `Scene ${numbers.get(s.id)} · ${s.heading || 'Untitled'}`, hint: s.summary || undefined })),
      ...(characters ?? []).map((c) => ({ value: `character:${c.id}`, label: c.name || 'Unnamed character', hint: 'Character' })),
    ],
    [scenes, characters, numbers],
  );
  const pickFocus = (v: string | undefined) => {
    if (!v) return onFocusChange(undefined);
    const [type, id] = v.split(':') as ['scene' | 'character', string];
    const opt = focusOptions.find((o) => o.value === v);
    onFocusChange({ type, id, label: opt?.label ?? '' });
  };
  // Keep the focus label current (scenes renumber, characters rename).
  const focusLabel = focus ? focusOptions.find((o) => o.value === `${focus.type}:${focus.id}`)?.label ?? focus.label : undefined;

  const turns = active?.turns ?? [];
  const showLive = live && (live.threadId === active?.id || (!active && threadId === live.threadId));
  const empty = !turns.length && !showLive;
  const modelLabel = AI_MODELS.find((m) => m.value === model)?.label ?? model;

  return (
    <>
      <PanelHeader title={active?.title ?? 'New conversation'} subtitle={modelLabel} onClose={onClose}>
        <Menu
          trigger={
            <button className="btn-icon" aria-label="Conversations" title="Conversations">
              <History className="size-4" />
            </button>
          }
        >
          <MenuItem icon={<Plus className="size-3.5" />} onSelect={() => setThreadId('new')} disabled={!!live}>
            New conversation
          </MenuItem>
          {!!threads?.length && <MenuSeparator />}
          {!!threads?.length && <MenuLabel>Recent</MenuLabel>}
          {threads?.slice(0, 20).map((t) => (
            <MenuItem key={t.id} checked={t.id === active?.id} onSelect={() => setThreadId(t.id)} disabled={!!live}>
              <span className="block truncate">{t.title}</span>
            </MenuItem>
          ))}
          {active && (
            <>
              <MenuSeparator />
              <MenuItem danger icon={<Trash2 className="size-3.5" />} onSelect={() => void removeThread(active)} disabled={!!live}>
                Delete this conversation
              </MenuItem>
            </>
          )}
        </Menu>
        <IconButton label="New conversation" onClick={() => setThreadId('new')} disabled={!!live}>
          <Plus className="size-4" />
        </IconButton>
        <IconButton label="Assistant settings" onClick={onOpenSettings} disabled={!!live}>
          <Settings2 className="size-4" />
        </IconButton>
      </PanelHeader>

      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <span className="eyebrow shrink-0">Focus</span>
        {focus ? (
          <span className="chip min-w-0 max-w-full pr-1">
            <span className="truncate">{focusLabel}</span>
            <button aria-label="Clear focus" onClick={() => onFocusChange(undefined)} className="shrink-0 text-faint hover:text-ink">
              <X className="size-3" />
            </button>
          </span>
        ) : (
          <div className="min-w-0 flex-1">
            <SinglePicker value={undefined} onChange={pickFocus} options={focusOptions} placeholder="Whole project — pick a scene or character" allowNone={false} className="h-7 text-[12px]" />
          </div>
        )}
      </div>

      <div ref={scroller} className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
        {empty && (
          <div className="space-y-4 animate-fade-in">
            <div>
              <h3 className="display text-[24px] text-ink">How can I help with this film?</h3>
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
                I can read your script and breakdown. Changes I suggest appear as cards — nothing is applied unless you choose to.
                {!focus && ' Pick a scene or character above to ask about it specifically.'}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              {QUICK_PROMPTS.map((q) => {
                const blocked = q.needsScene && focus?.type !== 'scene';
                return (
                  <button
                    key={q.label}
                    disabled={blocked}
                    title={blocked ? 'Pick a scene in the focus bar first' : q.prompt}
                    onClick={() => void send(q.prompt)}
                    className="flex items-center justify-between gap-2 rounded-sm border border-line bg-surface px-3 py-2 text-left text-[12.5px] text-ink transition-colors hover:border-line-strong hover:bg-hover disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {q.label}
                    {q.needsScene && <span className="slate text-[9.5px]">{blocked ? 'Needs a scene' : 'This scene'}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {active &&
          turns.map((t) => (
            <TurnView
              key={t.id}
              turn={t}
              projectId={projectId}
              preview={preview}
              onApply={(p) => apply(active.id, t.id, p)}
              onDismiss={(p) => dismiss(active.id, t.id, p)}
              onUndo={(p) => undo(active.id, t.id, p)}
              onRetry={() => void retry(active, t)}
              busy={!!live}
            />
          ))}

        {showLive && live && (
          <>
            <TurnView turn={live.user} projectId={projectId} preview={preview} />
            <div className="space-y-3">
              {!live.text && !live.activity && !live.proposals.length && <Thinking label="Thinking" />}
              <ReplyBody
                text={live.text}
                proposals={live.proposals}
                renderCard={(p) => <ProposalCard key={p.id} projectId={projectId} proposal={p} data={preview} disabled onApply={async () => {}} onDismiss={async () => {}} onUndo={async () => {}} />}
              />
              {live.activity && <Thinking label={live.activity} />}
            </div>
          </>
        )}
      </div>

      <div className="border-t border-line p-3 safe-bottom">
        <div className="rounded-md border border-line-strong bg-surface focus-within:border-accent focus-within:shadow-[0_0_0_3px_var(--c-accent-soft)]">
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={2}
            placeholder={focus ? `Ask about ${focusLabel}…` : 'Ask about your film…'}
            className="min-h-[56px] resize-none border-0 bg-transparent shadow-none focus:shadow-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send(input);
              }
            }}
          />
          <div className="flex items-center justify-between px-2 pb-2">
            <span className="text-[11px] text-faint">Enter to send · Shift+Enter for a new line</span>
            {live ? (
              <Button size="sm" variant="secondary" icon={<Square className="size-3 fill-current" />} onClick={() => abortRef.current?.abort()}>
                Stop
              </Button>
            ) : (
              <Button size="sm" variant="primary" icon={<Send className="size-3.5" />} disabled={!input.trim()} onClick={() => void send(input)}>
                Send
              </Button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function Thinking({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-[12px] text-faint" role="status">
      <Loader2 className="size-3.5 animate-spin" />
      {label}
    </div>
  );
}

function TurnView({
  turn,
  projectId,
  preview,
  onApply,
  onDismiss,
  onUndo,
  onRetry,
  busy,
}: {
  turn: AssistantTurn;
  projectId: string;
  preview: PreviewData;
  onApply?: (p: Proposal) => Promise<void>;
  onDismiss?: (p: Proposal) => Promise<void>;
  onUndo?: (p: Proposal) => Promise<void>;
  onRetry?: () => void;
  busy?: boolean;
}) {
  if (turn.role === 'user') {
    return (
      <div className="flex flex-col items-end gap-1">
        {turn.focus && <span className="slate max-w-[85%] truncate text-[9.5px]">{turn.focus.label}</span>}
        <div className="max-w-[88%] whitespace-pre-wrap rounded-md border border-line bg-raised px-3 py-2 text-[13px] text-ink">{turn.text}</div>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <ReplyBody
        text={turn.text}
        proposals={turn.proposals}
        renderCard={(p) => (
          <ProposalCard
            key={p.id}
            projectId={projectId}
            proposal={p}
            data={preview}
            disabled={busy}
            onApply={() => onApply?.(p) ?? Promise.resolve()}
            onDismiss={() => onDismiss?.(p) ?? Promise.resolve()}
            onUndo={() => onUndo?.(p) ?? Promise.resolve()}
          />
        )}
      />
      {turn.notice && <p className="text-[12px] italic text-faint">{turn.notice}</p>}
      {turn.error && (
        <div className="flex items-start gap-2 rounded-sm border border-[color-mix(in_srgb,var(--c-danger)_30%,transparent)] bg-danger-soft px-3 py-2 text-[12.5px] text-danger" role="alert">
          <span className="flex-1">{turn.error}</span>
          {onRetry && (
            <button onClick={onRetry} disabled={busy} className="flex shrink-0 items-center gap-1 font-medium hover:underline disabled:opacity-50">
              <RefreshCw className="size-3" /> Retry
            </button>
          )}
        </div>
      )}
      <div className="slate text-[9.5px] text-faint">{relativeTime(turn.at)}</div>
    </div>
  );
}

/** Reply text with each suggestion card placed where the assistant made it. */
function ReplyBody({ text, proposals, renderCard }: { text: string; proposals: Proposal[]; renderCard: (p: Proposal) => React.ReactNode }) {
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  const anchored = [...proposals].sort((a, b) => (a.textOffset ?? Infinity) - (b.textOffset ?? Infinity));
  anchored.forEach((p, i) => {
    const at = Math.min(p.textOffset ?? text.length, text.length);
    const chunk = text.slice(cursor, at);
    if (chunk.trim()) parts.push(<Markdown key={`t${i}`} text={chunk} />);
    cursor = Math.max(cursor, at);
    parts.push(renderCard(p));
  });
  const rest = text.slice(cursor);
  if (rest.trim()) parts.push(<Markdown key="rest" text={rest} />);
  return <>{parts}</>;
}
