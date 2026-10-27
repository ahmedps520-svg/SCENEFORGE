import { Minus, Plus, Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import { Comments } from '@/components/Comments';
import { characterOptions, personOptions, sceneOptions } from '@/components/options';
import { AutoText, Button, Field, IconButton, ImageUpload, Input, MultiPicker, Section, Segmented, Sheet, SinglePicker, toastError } from '@/components/ui';
import { useDeleteEntity } from '@/components/useDeleteEntity';
import { ITEM_STATUSES } from '@/lib/constants';
import { updateRecord } from '@/lib/data/crud';
import { sceneNumbers } from '@/lib/numbering';
import type { Character, Item, ItemStatus, Person, Scene } from '@/lib/types';

export function ItemSheet({
  projectId,
  item,
  scenes,
  people,
  characters,
  open,
  onOpenChange,
}: {
  projectId: string;
  item: Item | undefined;
  scenes: Scene[];
  people: Person[];
  characters: Character[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const remove = useDeleteEntity();
  const numbers = useMemo(() => sceneNumbers(scenes), [scenes]);
  if (!item) return null;
  const it = item;
  const noun = it.kind === 'wardrobe' ? 'costume' : 'prop';
  const save = (patch: Partial<Item>) => updateRecord<Item>('items', it.id, patch).catch((e) => toastError(e, 'Not saved'));
  const setQty = (q: number) => save({ quantity: Math.max(0, Math.min(9999, Math.round(q) || 0)) });

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={it.name || `Untitled ${noun}`}
      description={`${it.kind === 'wardrobe' ? 'Wardrobe' : 'Prop'} · needed in ${it.sceneIds.length} scene${it.sceneIds.length === 1 ? '' : 's'}`}
      footer={
        <>
          <Button
            variant="danger-ghost"
            icon={<Trash2 className="size-4" />}
            onClick={async () => {
              const ok = await remove('item', it.id, { confirmTitle: `Delete “${it.name}”?`, confirmMessage: 'It will be removed from the inventory and from every scene that needs it. You can undo this right after.' });
              if (ok) onOpenChange(false);
            }}
          >
            Delete {noun}
          </Button>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </>
      }
    >
      <div key={it.id} className="space-y-8">
        <ImageUpload
          projectId={projectId}
          value={it.photoAssetId}
          onChange={(photoAssetId) => void save({ photoAssetId })}
          category={it.kind === 'wardrobe' ? 'costume' : 'reference'}
          label={`Add a photo of the ${noun}`}
          aspect="aspect-[16/10]"
        />

        <Section title="Details">
          <div className="space-y-4">
            <AutoText label="Name" value={it.name} onSave={(name) => save({ name: name.trim() })} required={`A ${noun} needs a name.`} />
            <AutoText label="Description" value={it.description} onSave={(description) => save({ description })} multiline rows={3} placeholder={it.kind === 'wardrobe' ? 'Fabric, colour, condition, sizing, period details' : 'What it looks like, condition, any special handling'} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Quantity">
                <div className="flex items-center gap-1.5">
                  <IconButton label="Decrease quantity" onClick={() => void setQty(it.quantity - 1)} disabled={it.quantity <= 0}>
                    <Minus className="size-3.5" />
                  </IconButton>
                  <Input type="number" min={0} max={9999} value={it.quantity} onChange={(e) => void setQty(Number(e.target.value))} className="w-20 text-center font-mono" aria-label="Quantity" />
                  <IconButton label="Increase quantity" onClick={() => void setQty(it.quantity + 1)}>
                    <Plus className="size-3.5" />
                  </IconButton>
                </div>
              </Field>
              <Field label="Responsible person" hint={people.length ? undefined : 'Add people in Cast & Crew to assign them.'}>
                <SinglePicker value={it.responsibleId} onChange={(responsibleId) => void save({ responsibleId })} options={personOptions(people)} placeholder="Unassigned" noneLabel="Unassigned" />
              </Field>
            </div>
            {it.kind === 'wardrobe' && (
              <Field label="Worn by" hint="The character who wears this costume.">
                <SinglePicker value={it.characterId} onChange={(characterId) => void save({ characterId })} options={characterOptions(characters, people)} placeholder="No character" noneLabel="No character" />
              </Field>
            )}
          </div>
        </Section>

        <Section title="Status" description={it.status === 'available' ? 'Ready for set.' : 'Scenes that need this are flagged as blocked until it is available.'}>
          <Segmented<ItemStatus> label={`${noun} status`} value={it.status} onChange={(status) => void save({ status })} options={ITEM_STATUSES.map((s) => ({ value: s.value, label: s.label }))} />
        </Section>

        <Section title={`Needed in scenes · ${it.sceneIds.length}`}>
          <MultiPicker
            value={it.sceneIds.filter((id) => numbers.has(id))}
            onChange={(sceneIds) => void save({ sceneIds })}
            options={sceneOptions(scenes, numbers)}
            placeholder="Add scene"
            emptyText="No scenes yet — write the script or add scenes first."
          />
        </Section>

        <Comments projectId={projectId} entityType="item" entityId={it.id} />
      </div>
    </Sheet>
  );
}
