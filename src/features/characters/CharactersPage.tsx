import { Drama, LayoutGrid, Network, Plus, Search, UserRound } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useWorkspace } from '@/app/WorkspaceLayout';
import {
  AssetImage,
  Button,
  Dialog,
  EmptyState,
  Field,
  Input,
  Loading,
  PageContainer,
  PageHeader,
  Segmented,
  Tip,
  toastError,
} from '@/components/ui';
import { createRecord } from '@/lib/data/crud';
import { makeCharacter } from '@/lib/data/factories';
import { useCharacters, useItems, usePeople, useRelationships, useScenes, useScript } from '@/lib/hooks';
import { sceneNumbers } from '@/lib/numbering';
import type { Character } from '@/lib/types';
import { CharacterProfile } from './CharacterProfile';
import { speechStats } from './characterUtils';
import { RelationshipMap } from './RelationshipMap';

type View = 'cards' | 'map';
const VIEW_KEY = 'sceneforge:characters-view';

export default function CharactersPage() {
  const { project, openAssistant } = useWorkspace();
  const pid = project.id;
  const characters = useCharacters(pid);
  const relationships = useRelationships(pid);
  const scenes = useScenes(pid);
  const people = usePeople(pid);
  const items = useItems(pid);
  const script = useScript(project.primaryScriptId);
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [view, setView] = useState<View>(() => {
    try {
      return (localStorage.getItem(VIEW_KEY) as View) || 'cards';
    } catch {
      return 'cards';
    }
  });

  const openId = params.get('character');
  const setOpen = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('character', id);
    else next.delete('character');
    setParams(next, { replace: true });
  };
  const changeView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignore */
    }
  };

  const elements = script?.elements ?? [];
  const stats = useMemo(() => speechStats(elements, characters ?? []), [elements, characters]);
  const numbers = useMemo(() => sceneNumbers(scenes ?? []), [scenes]);
  const personName = useMemo(() => new Map((people ?? []).map((p) => [p.id, p.name])), [people]);

  if (!characters || !relationships || !scenes || !people || !items || script === undefined) return <Loading label="Loading characters" />;

  const sceneCount = (c: Character) => new Set([...scenes.filter((s) => s.characterIds.includes(c.id)).map((s) => s.id), ...(stats.get(c.id)?.sceneIds ?? [])]).size;
  const shown = characters.filter((c) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return [c.name, ...c.aliases, c.personality, c.age, c.actorId ? personName.get(c.actorId) : ''].join(' ').toLowerCase().includes(s);
  });

  return (
    <PageContainer wide>
      <PageHeader
        eyebrow="Story"
        title="Characters"
        description="The people of your story — fictional characters, each linked to the real actor who plays them."
        actions={
          <>
            {characters.length > 0 && (
              <Segmented
                label="Characters view"
                value={view}
                onChange={changeView}
                options={[
                  { value: 'cards', label: 'Cards', icon: <LayoutGrid className="size-3.5" /> },
                  { value: 'map', label: 'Relationship map', icon: <Network className="size-3.5" /> },
                ]}
              />
            )}
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              New character
            </Button>
          </>
        }
      />

      <Tip id="characters-intro" className="mb-5">
        Characters are matched to dialogue in your production draft by name (and aliases), so scenes pick up who speaks automatically. Cast a character to link the actor from Cast &amp; Crew.
      </Tip>

      {characters.length === 0 ? (
        <EmptyState
          icon={<Drama className="size-6" />}
          title="No characters yet"
          actions={
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              Create a character
            </Button>
          }
        >
          Build profiles with appearance, motivations and arcs once, then reuse them across scenes, shots, wardrobe and call sheets.
        </EmptyState>
      ) : view === 'map' ? (
        <RelationshipMap projectId={pid} characters={characters} relationships={relationships} actorNames={personName} onOpen={(id) => setOpen(id)} />
      ) : (
        <>
          {characters.length > 6 && (
            <div className="relative mb-4 max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search characters…" className="h-8 pl-8" aria-label="Search characters" />
            </div>
          )}
          {shown.length === 0 ? (
            <EmptyState compact title="No characters match" actions={<Button onClick={() => setQ('')}>Clear search</Button>} />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {shown.map((c) => {
                const st = stats.get(c.id);
                const actor = c.actorId ? personName.get(c.actorId) : undefined;
                return (
                  <button
                    key={c.id}
                    onClick={() => setOpen(c.id)}
                    className="group flex flex-col overflow-hidden rounded-md border border-line bg-surface text-left transition-colors hover:border-line-strong focus-visible:border-accent"
                  >
                    <div className="relative aspect-[4/5] w-full overflow-hidden bg-raised">
                      <AssetImage
                        assetId={c.portraitAssetId}
                        alt={c.name}
                        className="absolute inset-0 size-full transition-transform duration-500 group-hover:scale-[1.03]"
                        fallback={
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="display text-[56px] text-faint">{(c.name.trim()[0] ?? '?').toUpperCase()}</span>
                          </div>
                        }
                      />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-3 pb-2 pt-10">
                        <div className="display truncate text-[22px] text-white">{c.name || 'Unnamed'}</div>
                        {c.age && <div className="truncate text-[11.5px] text-white/70">{c.age}</div>}
                      </div>
                    </div>
                    <div className="flex flex-1 flex-col gap-1.5 p-3">
                      <div className="flex items-center gap-1.5 text-[12px]">
                        <UserRound className="size-3 shrink-0 text-faint" />
                        <span className={actor ? 'truncate text-ink' : 'text-faint'}>{actor ? `Played by ${actor}` : 'Not cast'}</span>
                      </div>
                      <div className="font-mono text-[10.5px] text-muted">
                        {sceneCount(c)} scene{sceneCount(c) === 1 ? '' : 's'} · {st?.speeches ?? 0} speech{st?.speeches === 1 ? '' : 'es'}
                      </div>
                      {c.personality && <p className="line-clamp-2 text-[12px] text-muted">{c.personality}</p>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          {!script && (
            <p className="mt-4 text-[12px] text-faint">
              Dialogue counts come from the production draft. <Link to="../script" className="link">Write the script</Link> to see who speaks where.
            </p>
          )}
        </>
      )}

      <CreateCharacterDialog
        open={creating}
        onOpenChange={setCreating}
        existing={characters}
        onCreate={async (name, age) => {
          try {
            const c = await createRecord('characters', makeCharacter(pid, { name, age }));
            setCreating(false);
            setOpen(c.id);
          } catch (e) {
            toastError(e, 'Character not created');
          }
        }}
      />

      <CharacterProfile
        projectId={pid}
        characterId={openId}
        onClose={() => setOpen(null)}
        characters={characters}
        relationships={relationships}
        scenes={scenes}
        numbers={numbers}
        people={people}
        items={items}
        elements={elements}
        primaryScriptId={project.primaryScriptId}
        stats={stats}
        openAssistant={openAssistant}
      />
    </PageContainer>
  );
}

function CreateCharacterDialog({
  open,
  onOpenChange,
  existing,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  existing: Character[];
  onCreate: (name: string, age: string) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const n = name.trim();
    if (!n) return setError('A character needs a name.');
    if (existing.some((c) => c.name.trim().toLowerCase() === n.toLowerCase())) return setError(`There’s already a character called “${n}”.`);
    setBusy(true);
    await onCreate(n, age.trim());
    setBusy(false);
    setName('');
    setAge('');
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setError(null);
      }}
      title="New character"
      description="Start with a name — the profile, portrait and casting come next."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void submit()} loading={busy}>
            Create character
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name" error={error} hint="Use the name as it appears in character cues, e.g. Mara or Mr. Hale.">
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            autoFocus
            invalid={!!error}
            onKeyDown={(e) => e.key === 'Enter' && void submit()}
          />
        </Field>
        <Field label="Age or age range" optional>
          <Input value={age} onChange={(e) => setAge(e.target.value)} placeholder="e.g. 30s" onKeyDown={(e) => e.key === 'Enter' && void submit()} />
        </Field>
      </div>
    </Dialog>
  );
}
