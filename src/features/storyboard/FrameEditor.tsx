import { Camera, ChevronLeft, ChevronRight, Copy, PenTool, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Comments } from '@/components/Comments';
import { AutoText, Button, Field, IconButton, ImageUpload, Input, Select, Sheet, SinglePicker, toast, toastError } from '@/components/ui';
import { CAMERA_ANGLES, CAMERA_MOVEMENTS, SHOT_TYPES, shotTypeAbbr, TRANSITIONS } from '@/lib/constants';
import { createRecord, updateRecord } from '@/lib/data/crud';
import { makeShot } from '@/lib/data/factories';
import type { CameraAngle, CameraMovement, Scene, Shot, ShotType, StoryboardFrame } from '@/lib/types';
import { SketchPad } from './SketchPad';

export function FrameEditor({
  frame,
  scene,
  sceneNumber,
  frameNumber,
  autoNumber,
  shots,
  shotCodes,
  open,
  onOpenChange,
  onPrev,
  onNext,
  onDuplicate,
  onDelete,
}: {
  frame: StoryboardFrame | undefined;
  scene: Scene | undefined;
  sceneNumber: string;
  frameNumber: string;
  /** Number the frame gets when it has no override. */
  autoNumber: string;
  shots: Shot[];
  shotCodes: Map<string, string>;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onPrev?: () => void;
  onNext?: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <Sheet
      open={open && !!frame}
      onOpenChange={onOpenChange}
      width="max-w-xl"
      title={`Frame ${frameNumber}`}
      description={scene ? `Scene ${sceneNumber} · ${scene.heading || 'Untitled scene'}` : undefined}
      headerExtra={
        <>
          <IconButton label="Previous frame" onClick={onPrev} disabled={!onPrev} size="sm">
            <ChevronLeft className="size-4" />
          </IconButton>
          <IconButton label="Next frame" onClick={onNext} disabled={!onNext} size="sm">
            <ChevronRight className="size-4" />
          </IconButton>
        </>
      }
      footer={
        frame && (
          <>
            <Button variant="danger-ghost" size="sm" icon={<Trash2 className="size-3.5" />} onClick={onDelete}>
              Delete frame
            </Button>
            <Button size="sm" icon={<Copy className="size-3.5" />} onClick={onDuplicate}>
              Duplicate
            </Button>
          </>
        )
      }
    >
      {frame && scene && <FrameEditorBody key={frame.id} frame={frame} scene={scene} frameNumber={frameNumber} autoNumber={autoNumber} shots={shots} shotCodes={shotCodes} />}
    </Sheet>
  );
}

function FrameEditorBody({
  frame,
  scene,
  frameNumber,
  autoNumber,
  shots,
  shotCodes,
}: {
  frame: StoryboardFrame;
  scene: Scene;
  frameNumber: string;
  autoNumber: string;
  shots: Shot[];
  shotCodes: Map<string, string>;
}) {
  const [sketch, setSketch] = useState<{ open: boolean; over: boolean }>({ open: false, over: false });
  const [creatingShot, setCreatingShot] = useState(false);
  const save = (patch: Partial<StoryboardFrame>) => updateRecord<StoryboardFrame>('frames', frame.id, patch).catch((e) => toastError(e, 'Change not saved'));
  const linkedShot = frame.shotId ? shots.find((s) => s.id === frame.shotId) : undefined;

  const createShot = async () => {
    setCreatingShot(true);
    try {
      const order = shots.reduce((m, s) => Math.max(m, s.order), -1) + 1;
      const shot = await createRecord(
        'shots',
        makeShot(frame.projectId, frame.sceneId, {
          order,
          shotType: frame.shotType,
          angle: frame.angle,
          movement: frame.movement,
          description: frame.action,
          notes: frame.notes,
          filmMin: frame.durationSec ? Math.max(1, Math.round(frame.durationSec / 60)) : undefined,
        }),
        { summary: `Created a shot from storyboard frame ${frameNumber}` },
      );
      await save({ shotId: shot.id });
      toast('Shot added to the shot list and linked');
    } catch (e) {
      toastError(e, 'Shot not created');
    } finally {
      setCreatingShot(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <ImageUpload
          projectId={frame.projectId}
          value={frame.imageAssetId}
          onChange={(imageAssetId) => void save({ imageAssetId })}
          category="storyboard"
          links={{ frameIds: [frame.id], sceneIds: [frame.sceneId] }}
          label="Upload a reference image"
          aspect="aspect-video"
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" icon={<PenTool className="size-3.5" />} onClick={() => setSketch({ open: true, over: false })}>
            {frame.imageAssetId ? 'Replace with a sketch' : 'Draw a sketch'}
          </Button>
          {frame.imageAssetId && (
            <Button size="sm" variant="ghost" icon={<PenTool className="size-3.5" />} onClick={() => setSketch({ open: true, over: true })}>
              Draw over image
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="Shot type" className="col-span-2 sm:col-span-1">
          <Select value={frame.shotType} onChange={(e) => void save({ shotType: e.target.value as ShotType })}>
            {SHOT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Camera angle">
          <Select value={frame.angle} onChange={(e) => void save({ angle: e.target.value as CameraAngle })}>
            {CAMERA_ANGLES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Movement">
          <Select value={frame.movement} onChange={(e) => void save({ movement: e.target.value as CameraMovement })}>
            {CAMERA_MOVEMENTS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <AutoText label="Shot number" value={frame.shotNumber} onSave={(shotNumber) => save({ shotNumber: shotNumber.trim() })} placeholder={autoNumber} hint="Leave blank to number automatically" inputClassName="font-mono" />
        <DurationSeconds frame={frame} />
        <Field label="Transition out">
          <Select value={frame.transition} onChange={(e) => void save({ transition: e.target.value })}>
            {!TRANSITIONS.includes(frame.transition) && frame.transition && <option value={frame.transition}>{frame.transition}</option>}
            {TRANSITIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <AutoText label="Action" value={frame.action} onSave={(action) => save({ action })} multiline rows={3} placeholder="What we see: subject, blocking, movement within the frame." />
      <AutoText label="Dialogue / audio" value={frame.audio} onSave={(audio) => save({ audio })} multiline rows={2} placeholder="Lines spoken, sound cues, music." />
      <AutoText label="Production notes" value={frame.notes} onSave={(notes) => save({ notes })} multiline rows={2} placeholder="Lens, lighting, props, VFX, anything the crew needs." />

      <section className="space-y-2">
        <h3 className="eyebrow">Shot list</h3>
        <SinglePicker
          value={frame.shotId}
          onChange={(shotId) => void save({ shotId })}
          options={shots.map((s) => ({ value: s.id, label: `${shotCodes.get(s.id) ?? ''} · ${s.description || shotTypeAbbr(s.shotType)}`, hint: s.status }))}
          placeholder="Link a shot from this scene"
          noneLabel="Not linked"
        />
        <div className="flex flex-wrap items-center gap-2">
          {!linkedShot && (
            <Button size="sm" loading={creatingShot} icon={<Camera className="size-3.5" />} onClick={() => void createShot()}>
              Create shot from this frame
            </Button>
          )}
          <Link to={`/p/${frame.projectId}/shots?scene=${scene.id}`} className="link text-[12px]">
            Open this scene’s shot list
          </Link>
        </div>
      </section>

      <Comments projectId={frame.projectId} entityType="frame" entityId={frame.id} />

      <SketchPad
        open={sketch.open}
        onOpenChange={(o) => setSketch((s) => ({ ...s, open: o }))}
        projectId={frame.projectId}
        title={`Frame ${frameNumber} sketch`}
        backgroundAssetId={sketch.over ? frame.imageAssetId : undefined}
        links={{ frameIds: [frame.id], sceneIds: [frame.sceneId] }}
        onSaved={(imageAssetId) => {
          void save({ imageAssetId });
          toast('Sketch saved to the frame and the asset library');
        }}
      />
    </div>
  );
}

function DurationSeconds({ frame }: { frame: StoryboardFrame }) {
  const initial = frame.durationSec !== undefined ? String(frame.durationSec) : '';
  const [text, setText] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setText(initial), [initial]);
  const commit = () => {
    const t = text.trim();
    if (!t) {
      setError(null);
      if (frame.durationSec !== undefined) void updateRecord<StoryboardFrame>('frames', frame.id, { durationSec: undefined });
      return;
    }
    const n = Number(t);
    if (!Number.isFinite(n) || n < 0 || n > 3600) {
      setError('Seconds, 0–3600');
      return;
    }
    setError(null);
    const v = Math.round(n * 10) / 10;
    if (v !== frame.durationSec) void updateRecord<StoryboardFrame>('frames', frame.id, { durationSec: v }).catch((e) => toastError(e, 'Duration not saved'));
  };
  return (
    <Field label="Duration (sec)" error={error}>
      <Input value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} inputMode="decimal" placeholder="—" invalid={!!error} className="font-mono" />
    </Field>
  );
}
