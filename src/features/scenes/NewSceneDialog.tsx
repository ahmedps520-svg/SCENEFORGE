import { useEffect, useId, useState } from 'react';
import { Button, Checkbox, Dialog, Field, Input, Select, Textarea, toast, toastError } from '@/components/ui';
import { addSceneToScript, createScene } from '@/lib/data/scenes';
import { buildHeading, TIMES_OF_DAY } from '@/lib/screenplay/heading';
import type { IntExt, Location, Scene } from '@/lib/types';
import { INT_EXT_OPTIONS } from './sceneInfo';

export function NewSceneDialog({
  open,
  onOpenChange,
  projectId,
  locations,
  scenes,
  hasScript,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projectId: string;
  locations: Location[];
  scenes: Scene[];
  hasScript: boolean;
  onCreated: (sceneId: string) => void;
}) {
  const [intExt, setIntExt] = useState<IntExt>('INT');
  const [locationName, setLocationName] = useState('');
  const [timeOfDay, setTimeOfDay] = useState('DAY');
  const [summary, setSummary] = useState('');
  const [addToScript, setAddToScript] = useState(hasScript);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const locList = useId();
  const timeList = useId();

  useEffect(() => {
    if (open) {
      setIntExt('INT');
      setLocationName('');
      setTimeOfDay('DAY');
      setSummary('');
      setAddToScript(hasScript);
      setError(null);
    }
  }, [open, hasScript]);

  const knownLocations = [...new Set([...locations.map((l) => l.name.toUpperCase()), ...scenes.map((s) => s.locationName).filter(Boolean)])].sort();

  const submit = async () => {
    if (!locationName.trim()) {
      setError('Where does this scene take place? A heading needs a location.');
      return;
    }
    setBusy(true);
    try {
      const scene = await createScene(projectId, { intExt, locationName, timeOfDay, summary: summary.trim() });
      if (addToScript && hasScript) await addSceneToScript(scene.id);
      toast(addToScript && hasScript ? 'Scene created and added to the script' : 'Scene created');
      onOpenChange(false);
      onCreated(scene.id);
    } catch (e) {
      toastError(e, 'Scene not created');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New scene"
      description="Add a scene to the breakdown. You can place it in the script now or later."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={() => void submit()}>
            Create scene
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="grid grid-cols-[110px_1fr] gap-3 sm:grid-cols-[110px_1fr_150px]">
          <Field label="Int / Ext">
            <Select value={intExt} onChange={(e) => setIntExt(e.target.value as IntExt)}>
              {INT_EXT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Location" error={error}>
            <Input
              autoFocus
              list={locList}
              value={locationName}
              invalid={!!error}
              onChange={(e) => {
                setLocationName(e.target.value);
                if (e.target.value.trim()) setError(null);
              }}
              placeholder="e.g. Lighthouse – lamp room"
              className="uppercase placeholder:normal-case"
            />
            <datalist id={locList}>
              {knownLocations.map((l) => (
                <option key={l} value={l} />
              ))}
            </datalist>
          </Field>
          <Field label="Time of day" className="col-span-2 sm:col-span-1">
            <Input list={timeList} value={timeOfDay} onChange={(e) => setTimeOfDay(e.target.value)} className="uppercase" />
            <datalist id={timeList}>
              {TIMES_OF_DAY.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </Field>
        </div>
        <div className="rounded-sm border border-line bg-paper px-3 py-2 font-script text-[13px] font-bold uppercase text-paper-ink">
          {buildHeading(intExt, locationName || 'LOCATION', timeOfDay) || '—'}
        </div>
        <Field label="Summary" optional>
          <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} placeholder="What happens in this scene, in a sentence or two." />
        </Field>
        {hasScript && (
          <Checkbox
            checked={addToScript}
            onChange={setAddToScript}
            label="Also add this scene’s heading to the production draft"
          />
        )}
        <button type="submit" className="hidden" />
      </form>
    </Dialog>
  );
}
