import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, ExternalLink, Plus, Sparkles, Trash2, UserRound, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Comments } from '@/components/Comments';
import { personOptions } from '@/components/options';
import { ItemStatusBadge } from '@/components/StatusBadges';
import { useDeleteEntity } from '@/components/useDeleteEntity';
import {
  AutoText,
  Badge,
  Button,
  cn,
  Field,
  ImageUpload,
  Input,
  Select,
  Sheet,
  SinglePicker,
  Tabs,
  TagInput,
  toast,
  toastError,
} from '@/components/ui';
import { createRecord, updateRecord } from '@/lib/data/crud';
import { makeItem, makePerson, makeRelationship } from '@/lib/data/factories';
import { saveScript } from '@/lib/data/scripts';
import { db } from '@/lib/db';
import { uid } from '@/lib/ids';
import { cueName } from '@/lib/screenplay/sync';
import type { Character, ConsistencyRule, Item, Person, Relationship, Scene, ScriptElement } from '@/lib/types';
import type { AssistantFocus } from '@/app/WorkspaceLayout';
import { countCues, cueVariants, type SpeechStats } from './characterUtils';

type Tab = 'profile' | 'production' | 'scenes' | 'relationships' | 'consistency' | 'comments';

const RULE_CATEGORIES: { value: ConsistencyRule['category']; label: string }[] = [
  { value: 'appearance', label: 'Appearance' },
  { value: 'personality', label: 'Personality' },
  { value: 'voice', label: 'Voice & speech' },
  { value: 'behavior', label: 'Behavior' },
  { value: 'wardrobe', label: 'Wardrobe' },
  { value: 'other', label: 'Other' },
];

export function CharacterProfile({
  projectId,
  characterId,
  onClose,
  characters,
  relationships,
  scenes,
  numbers,
  people,
  items,
  elements,
  primaryScriptId,
  stats,
  openAssistant,
}: {
  projectId: string;
  characterId: string | null;
  onClose: () => void;
  characters: Character[];
  relationships: Relationship[];
  scenes: Scene[];
  numbers: Map<string, string>;
  people: Person[];
  items: Item[];
  elements: ScriptElement[];
  primaryScriptId?: string;
  stats: Map<string, SpeechStats>;
  openAssistant: (focus?: AssistantFocus) => void;
}) {
  const character = useLiveQuery(async () => (characterId ? (await db.characters.get(characterId)) ?? null : null), [characterId]);
  const [tab, setTab] = useState<Tab>('profile');
  const [renamedFrom, setRenamedFrom] = useState<string | null>(null);
  const remove = useDeleteEntity();

  useEffect(() => {
    setTab('profile');
    setRenamedFrom(null);
  }, [characterId]);

  const save = (patch: Partial<Character>) => (character ? updateRecord<Character>('characters', character.id, patch).catch((e) => toastError(e, 'Not saved')) : undefined);

  const st = character ? stats.get(character.id) : undefined;
  const pending = renamedFrom && character && cueName(renamedFrom) !== cueName(character.name) ? countCues(elements, renamedFrom) : 0;

  const saveName = async (name: string) => {
    if (!character) return;
    const t = name.trim();
    if (characters.some((c) => c.id !== character.id && c.name.trim().toLowerCase() === t.toLowerCase())) {
      toastError(new Error(`Another character is already called “${t}”.`), 'Name not saved');
      return;
    }
    if (!renamedFrom && countCues(elements, character.name) > 0) setRenamedFrom(character.name);
    await save({ name: t });
  };

  const updateCues = async () => {
    if (!character || !renamedFrom || !primaryScriptId) return;
    try {
      const { renameCues } = await import('./characterUtils');
      const script = await db.scripts.get(primaryScriptId);
      if (!script) throw new Error('The production draft no longer exists.');
      const { elements: next, count } = renameCues(script.elements, renamedFrom, character.name);
      await saveScript(script.id, next, { summary: `Renamed ${count} cues from ${cueName(renamedFrom)} to ${character.name.toUpperCase()}` });
      toast(`Updated ${count} cue${count === 1 ? '' : 's'} in “${script.title}”`);
      setRenamedFrom(null);
    } catch (e) {
      toastError(e, 'Cues not updated');
    }
  };

  const tabs: { value: Tab; label: string; count?: number }[] = [
    { value: 'profile', label: 'Profile' },
    { value: 'production', label: 'Production' },
    { value: 'scenes', label: 'Scenes', count: character ? new Set([...scenes.filter((s) => s.characterIds.includes(character.id)).map((s) => s.id), ...(st?.sceneIds ?? [])]).size : undefined },
    { value: 'relationships', label: 'Relationships', count: character ? relationships.filter((r) => r.fromId === character.id || r.toId === character.id).length : undefined },
    { value: 'consistency', label: 'Consistency' },
    { value: 'comments', label: 'Comments' },
  ];

  return (
    <Sheet
      open={!!characterId}
      onOpenChange={(o) => !o && onClose()}
      title={character?.name || 'Character'}
      description={character ? `Fictional character${st ? ` · ${st.speeches} speech${st.speeches === 1 ? '' : 'es'} in the production draft` : ''}` : undefined}
      width="max-w-2xl"
      headerExtra={
        character && (
          <Button size="sm" variant="ghost" icon={<Sparkles className="size-3.5" />} onClick={() => openAssistant({ type: 'character', id: character.id, label: character.name })}>
            Ask assistant
          </Button>
        )
      }
      footer={
        character ? (
          <>
            <Button
              variant="danger-ghost"
              icon={<Trash2 className="size-4" />}
              onClick={async () => {
                const ok = await remove('character', character.id, {
                  confirmTitle: `Delete ${character.name}?`,
                  confirmMessage: 'Script dialogue is kept. The character is removed from scenes, shots and relationships. You can undo this right after.',
                });
                if (ok) onClose();
              }}
            >
              Delete character
            </Button>
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          </>
        ) : undefined
      }
    >
      {character === null && <p className="text-[13px] text-muted">This character was deleted.</p>}
      {character && (
        <div>
          <Tabs value={tab} onChange={setTab} tabs={tabs} className="-mt-2 mb-5" />

          {pending > 0 && (
            <div className="mb-5 flex flex-wrap items-center gap-3 rounded-md border border-line-strong bg-accent-soft px-3.5 py-3 text-[13px]">
              <span className="flex-1">
                {pending} cue{pending === 1 ? '' : 's'} in the production draft still say <span className="font-mono">{cueName(renamedFrom!)}</span>.
              </span>
              <Button size="sm" variant="primary" onClick={() => void updateCues()}>
                Update {pending} cue{pending === 1 ? '' : 's'} to {character.name.toUpperCase()}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setRenamedFrom(null)}>
                Keep the script as is
              </Button>
            </div>
          )}

          {tab === 'profile' && (
            <div className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-[180px_1fr]">
                <ImageUpload
                  projectId={projectId}
                  value={character.portraitAssetId}
                  onChange={(id) => void save({ portraitAssetId: id })}
                  category="portrait"
                  links={{ characterIds: [character.id] }}
                  label="Add portrait"
                  aspect="aspect-[4/5]"
                  hint="Image up to 25 MB"
                />
                <div className="space-y-4">
                  <AutoText label="Name" value={character.name} onSave={saveName} required="A character needs a name." />
                  <Field label="Also appears in the script as" hint="Other cue spellings, e.g. “MR. HALE” for Thomas Hale. Used to match dialogue.">
                    <TagInput value={character.aliases} onChange={(v) => void save({ aliases: v })} placeholder="Add alias" />
                  </Field>
                  <AutoText label="Age or age range" value={character.age} placeholder="e.g. late 30s" onSave={(v) => save({ age: v })} />
                </div>
              </div>
              <AutoText label="Appearance" multiline value={character.appearance} placeholder="Build, hair, scars, the way they carry themselves…" onSave={(v) => save({ appearance: v })} />
              <AutoText label="Personality" multiline value={character.personality} onSave={(v) => save({ personality: v })} />
              <AutoText label="Background" multiline rows={4} value={character.background} onSave={(v) => save({ background: v })} />
              <div className="grid gap-4 sm:grid-cols-3">
                <AutoText label="Motivations" multiline value={character.motivations} onSave={(v) => save({ motivations: v })} />
                <AutoText label="Goals" multiline value={character.goals} onSave={(v) => save({ goals: v })} />
                <AutoText label="Fears" multiline value={character.fears} onSave={(v) => save({ fears: v })} />
              </div>
              <AutoText label="Character arc" multiline rows={4} value={character.arc} placeholder="Who are they at the start, and who are they at the end?" onSave={(v) => save({ arc: v })} />
              <AutoText label="Dialogue samples" multiline rows={4} value={character.dialogueSamples} placeholder="Lines that capture how they speak" onSave={(v) => save({ dialogueSamples: v })} inputClassName="font-script text-[13.5px]" />
            </div>
          )}

          {tab === 'production' && <ProductionTab projectId={projectId} character={character} people={people} items={items} save={save} />}

          {tab === 'scenes' && <ScenesTab character={character} scenes={scenes} numbers={numbers} speaks={st?.sceneIds ?? new Set()} />}

          {tab === 'relationships' && <RelationshipsTab projectId={projectId} character={character} characters={characters} relationships={relationships} />}

          {tab === 'consistency' && (
            <ConsistencyTab
              character={character}
              characters={characters}
              scenes={scenes}
              numbers={numbers}
              elements={elements}
              speaks={st?.sceneIds ?? new Set()}
              save={save}
              onAsk={() => openAssistant({ type: 'character', id: character.id, label: character.name })}
            />
          )}

          {tab === 'comments' && <Comments projectId={projectId} entityType="character" entityId={character.id} />}
        </div>
      )}
    </Sheet>
  );
}

function ProductionTab({ projectId, character, people, items, save }: { projectId: string; character: Character; people: Person[]; items: Item[]; save: (p: Partial<Character>) => void | Promise<void> }) {
  const actor = character.actorId ? people.find((p) => p.id === character.actorId) : undefined;
  const wardrobe = items.filter((i) => i.kind === 'wardrobe' && i.characterId === character.id);
  const [itemName, setItemName] = useState('');
  const addWardrobe = async () => {
    const name = itemName.trim();
    if (!name) return;
    try {
      await createRecord('items', makeItem(projectId, 'wardrobe', { name, characterId: character.id }), { summary: `Added wardrobe “${name}” for ${character.name}` });
      setItemName('');
    } catch (e) {
      toastError(e, 'Wardrobe item not saved');
    }
  };
  return (
    <div className="space-y-6">
      <section className="rounded-md border border-line bg-surface p-4">
        <div className="flex items-start gap-3">
          <UserRound className="mt-0.5 size-4 text-accent" />
          <div className="min-w-0 flex-1">
            <div className="eyebrow">Cast as</div>
            <p className="mt-1 text-[12.5px] text-muted">{character.name || 'This character'} is fictional. The actor is a real person on your cast & crew list.</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <div className="min-w-[220px] flex-1">
                <SinglePicker
                  value={character.actorId}
                  onChange={(v) => void save({ actorId: v })}
                  options={personOptions(people)}
                  placeholder="Not cast yet"
                  noneLabel="Not cast"
                  onCreate={async (name) => {
                    try {
                      const p = await createRecord('people', makePerson(projectId, { name, roles: ['Actor'] }), { summary: `Added ${name} to the cast` });
                      return p.id;
                    } catch (e) {
                      toastError(e, 'Person not added');
                    }
                  }}
                  createLabel={(t) => `Add “${t}” as an actor`}
                />
              </div>
              {actor && (
                <Link to={`../people?person=${actor.id}`} className="btn btn-ghost btn-sm">
                  <ExternalLink className="size-3.5" /> {actor.name}’s profile
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>
      <AutoText label="Casting notes" multiline value={character.castingNotes} placeholder="What to look for in an actor, audition sides, chemistry reads…" onSave={(v) => save({ castingNotes: v })} />
      <AutoText label="Costume notes" multiline value={character.costumeNotes} placeholder="Palette, signature pieces, changes across the story…" onSave={(v) => save({ costumeNotes: v })} />
      <section>
        <div className="mb-2 flex items-center justify-between">
          <div className="eyebrow">Wardrobe items</div>
          <Link to="../locations" className="text-[12px] text-muted hover:text-ink">
            Open inventory
          </Link>
        </div>
        {wardrobe.length === 0 && <p className="mb-2 text-[12.5px] text-faint">No wardrobe items assigned to {character.name || 'this character'}.</p>}
        <ul className="mb-2 space-y-1.5">
          {wardrobe.map((i) => (
            <li key={i.id}>
              <Link to={`../locations?item=${i.id}`} className="flex items-center justify-between gap-2 rounded-sm border border-line bg-surface px-3 py-2 text-[13px] hover:border-line-strong">
                <span className="truncate">{i.name}</span>
                <ItemStatusBadge status={i.status} />
              </Link>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <Input value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="e.g. Grey wool coat" onKeyDown={(e) => e.key === 'Enter' && void addWardrobe()} />
          <Button icon={<Plus className="size-4" />} onClick={() => void addWardrobe()} disabled={!itemName.trim()}>
            Add
          </Button>
        </div>
      </section>
    </div>
  );
}

function ScenesTab({ character, scenes, numbers, speaks }: { character: Character; scenes: Scene[]; numbers: Map<string, string>; speaks: Set<string> }) {
  const rows = scenes.filter((s) => s.characterIds.includes(character.id) || speaks.has(s.id));
  const others = scenes.filter((s) => !s.characterIds.includes(character.id));
  const setPresent = (s: Scene, on: boolean) =>
    updateRecord<Scene>('scenes', s.id, { characterIds: on ? [...s.characterIds, character.id] : s.characterIds.filter((x) => x !== character.id) }).catch((e) => toastError(e, 'Not saved'));
  return (
    <div className="space-y-4">
      <p className="text-[12.5px] text-muted">Scenes list who is present; dialogue in the production draft is matched automatically. Characters who speak in a scene are re-added to it when the script is saved.</p>
      {rows.length === 0 && <p className="text-[13px] text-faint">{character.name || 'This character'} isn’t in any scene yet.</p>}
      <ul className="divide-y divide-line rounded-md border border-line">
        {rows.map((s) => {
          const listed = s.characterIds.includes(character.id);
          return (
            <li key={s.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <span className="w-7 font-mono text-[12px] text-faint">{numbers.get(s.id)}</span>
              <Link to={`../scenes?scene=${s.id}`} className="min-w-0 flex-1 truncate text-[13px] text-ink hover:text-accent">
                {s.heading || 'Untitled scene'}
              </Link>
              <div className="flex items-center gap-1.5">
                {speaks.has(s.id) && <Badge tone="info">Speaks</Badge>}
                {listed ? (
                  <Button size="sm" variant="ghost" icon={<X className="size-3.5" />} onClick={() => void setPresent(s, false)} title="Remove from this scene">
                    Remove
                  </Button>
                ) : (
                  <Button size="sm" variant="secondary" icon={<Plus className="size-3.5" />} onClick={() => void setPresent(s, true)}>
                    Add to scene
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {others.length > 0 && (
        <Field label="Add to another scene">
          <Select value="" onChange={(e) => {
            const s = scenes.find((x) => x.id === e.target.value);
            if (s) void setPresent(s, true);
          }}>
            <option value="">Choose a scene…</option>
            {others.map((s) => (
              <option key={s.id} value={s.id}>
                {numbers.get(s.id)}. {s.heading || 'Untitled scene'}
              </option>
            ))}
          </Select>
        </Field>
      )}
    </div>
  );
}

function RelationshipsTab({ projectId, character, characters, relationships }: { projectId: string; character: Character; characters: Character[]; relationships: Relationship[] }) {
  const mine = relationships.filter((r) => r.fromId === character.id || r.toId === character.id);
  const byId = new Map(characters.map((c) => [c.id, c]));
  const [other, setOther] = useState<string | undefined>();
  const [label, setLabel] = useState('');
  const remove = useDeleteEntity();
  const add = async () => {
    if (!other) return;
    try {
      await createRecord('relationships', makeRelationship(projectId, character.id, other, { label: label.trim() }), {
        summary: `Linked ${character.name} and ${byId.get(other)?.name}${label.trim() ? ` (${label.trim()})` : ''}`,
      });
      setOther(undefined);
      setLabel('');
    } catch (e) {
      toastError(e, 'Relationship not saved');
    }
  };
  return (
    <div className="space-y-4">
      {mine.length === 0 && <p className="text-[13px] text-faint">No relationships yet.</p>}
      <ul className="space-y-2">
        {mine.map((r) => {
          const outgoing = r.fromId === character.id;
          const otherChar = byId.get(outgoing ? r.toId : r.fromId);
          return (
            <li key={r.id} className="rounded-md border border-line bg-surface p-3">
              <div className="mb-2 flex items-center justify-between gap-2 text-[12.5px]">
                <span className="text-muted">
                  {outgoing ? (
                    <>
                      {character.name} → <span className="text-ink">{otherChar?.name}</span>
                    </>
                  ) : (
                    <>
                      <span className="text-ink">{otherChar?.name}</span> → {character.name}
                    </>
                  )}
                </span>
                <button aria-label="Remove relationship" className="text-faint hover:text-danger" onClick={() => void remove('relationship', r.id, { skipConfirm: true })}>
                  <Trash2 className="size-3.5" />
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
                <AutoText value={r.label} placeholder="e.g. sister" onSave={(v) => updateRecord<Relationship>('relationships', r.id, { label: v.trim() })} />
                <AutoText value={r.description} placeholder="Details" onSave={(v) => updateRecord<Relationship>('relationships', r.id, { description: v })} />
              </div>
            </li>
          );
        })}
      </ul>
      {characters.length > 1 ? (
        <div className="rounded-md border border-dashed border-line-strong p-3">
          <div className="eyebrow mb-2">Add relationship</div>
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <Select value={other ?? ''} onChange={(e) => setOther(e.target.value || undefined)} aria-label="Other character">
              <option value="">Choose character…</option>
              {characters
                .filter((c) => c.id !== character.id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </Select>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Relationship, e.g. rival" onKeyDown={(e) => e.key === 'Enter' && void add()} />
            <Button onClick={() => void add()} disabled={!other} icon={<Plus className="size-4" />}>
              Add
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-[12.5px] text-faint">Add another character to connect them.</p>
      )}
    </div>
  );
}

function ConsistencyTab({
  character,
  characters,
  scenes,
  numbers,
  elements,
  speaks,
  save,
  onAsk,
}: {
  character: Character;
  characters: Character[];
  scenes: Scene[];
  numbers: Map<string, string>;
  elements: ScriptElement[];
  speaks: Set<string>;
  save: (p: Partial<Character>) => void | Promise<void>;
  onAsk: () => void;
}) {
  const [category, setCategory] = useState<ConsistencyRule['category']>('appearance');
  const [text, setText] = useState('');
  const missing = scenes.filter((s) => speaks.has(s.id) && !s.characterIds.includes(character.id));
  const variants = useMemo(() => cueVariants(elements, character, characters), [elements, character, characters]);

  const add = () => {
    if (!text.trim()) return;
    void save({ consistency: [...character.consistency, { id: uid(), category, text: text.trim() }] });
    setText('');
  };

  const checks: { key: string; text: string; action?: { label: string; run: () => void } }[] = [
    ...missing.map((s) => ({
      key: `missing-${s.id}`,
      text: `Speaks in scene ${numbers.get(s.id)} (${s.heading}) but isn’t listed as present.`,
      action: { label: 'Add to scene', run: () => void updateRecord<Scene>('scenes', s.id, { characterIds: [...s.characterIds, character.id] }) },
    })),
    ...variants.map((v) => ({
      key: `variant-${v.name}`,
      text: `The script uses “${v.name}” ${v.count}× — a different spelling of ${character.name}?`,
      action: { label: 'Add as alias', run: () => void save({ aliases: [...character.aliases, v.name] }) },
    })),
    ...(!character.appearance.trim() ? [{ key: 'appearance', text: 'No appearance notes — costume, makeup and casting have nothing to stay consistent with.' }] : []),
    ...(!character.actorId ? [{ key: 'cast', text: 'Not cast yet.' }] : []),
  ];

  return (
    <div className="space-y-6">
      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="eyebrow">Automatic checks</div>
          <Button size="sm" variant="ghost" icon={<Sparkles className="size-3.5" />} onClick={onAsk}>
            Review with assistant
          </Button>
        </div>
        {checks.length === 0 ? (
          <p className="rounded-md border border-line bg-success-soft px-3 py-2.5 text-[13px] text-success">No issues found in the production draft or scene list.</p>
        ) : (
          <ul className="space-y-1.5">
            {checks.map((c) => (
              <li key={c.key} className="flex flex-wrap items-center gap-2 rounded-sm border border-line bg-surface px-3 py-2 text-[13px]">
                <AlertTriangle className="size-3.5 shrink-0 text-warning" />
                <span className="min-w-0 flex-1">{c.text}</span>
                {c.action && (
                  <Button size="sm" onClick={c.action.run}>
                    {c.action.label}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="eyebrow mb-1">Canon</div>
        <p className="mb-3 text-[12.5px] text-muted">Rules that must stay true in every scene — the scar on the left hand, never swears, always early.</p>
        {RULE_CATEGORIES.map((cat) => {
          const rules = character.consistency.filter((r) => r.category === cat.value);
          if (!rules.length) return null;
          return (
            <div key={cat.value} className="mb-3">
              <div className="slate mb-1">{cat.label}</div>
              <ul className="space-y-1">
                {rules.map((r) => (
                  <li key={r.id} className="group flex items-start gap-2 text-[13px]">
                    <span className="mt-2 size-1 shrink-0 rounded-full bg-accent" />
                    <span className="flex-1">{r.text}</span>
                    <button
                      aria-label="Remove rule"
                      className={cn('text-faint hover:text-danger sm:opacity-0 sm:group-hover:opacity-100')}
                      onClick={() => void save({ consistency: character.consistency.filter((x) => x.id !== r.id) })}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        {character.consistency.length === 0 && <p className="mb-3 text-[12.5px] text-faint">No rules yet.</p>}
        <div className="grid gap-2 sm:grid-cols-[150px_1fr_auto]">
          <Select value={category} onChange={(e) => setCategory(e.target.value as ConsistencyRule['category'])} aria-label="Rule category">
            {RULE_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Wears her father’s watch on the right wrist" onKeyDown={(e) => e.key === 'Enter' && add()} />
          <Button onClick={add} disabled={!text.trim()} icon={<Plus className="size-4" />}>
            Add rule
          </Button>
        </div>
      </section>
    </div>
  );
}
