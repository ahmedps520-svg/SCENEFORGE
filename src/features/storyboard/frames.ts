import { db } from '@/lib/db';
import { createRecord, logActivity, touchProject, updateRecord } from '@/lib/data/crud';
import { makeFrame } from '@/lib/data/factories';
import { uid } from '@/lib/ids';
import type { StoryboardFrame } from '@/lib/types';

/** Persist a new frame order for one scene as a single history entry. */
export async function persistFrameOrder(projectId: string, sceneId: string, orderedIds: string[], sceneLabel: string) {
  const t = Date.now();
  await db.transaction('rw', db.frames, async () => {
    for (let i = 0; i < orderedIds.length; i++) await db.frames.update(orderedIds[i], { order: i, updatedAt: t });
  });
  await touchProject(projectId);
  await logActivity({ projectId, action: 'updated', entityType: 'scene', entityId: sceneId, summary: `Reordered storyboard frames in scene ${sceneLabel}` });
}

export async function addFrame(projectId: string, sceneId: string, sceneFrames: StoryboardFrame[], patch: Partial<StoryboardFrame> = {}): Promise<StoryboardFrame> {
  const order = sceneFrames.reduce((m, f) => Math.max(m, f.order), -1) + 1;
  return createRecord('frames', makeFrame(projectId, sceneId, { order, ...patch }), { summary: 'Added a storyboard frame' });
}

/** Copy a frame and place the copy right after the original. */
export async function duplicateFrame(frame: StoryboardFrame, sceneFrames: StoryboardFrame[]): Promise<StoryboardFrame> {
  const sorted = [...sceneFrames].sort((a, b) => a.order - b.order);
  const idx = sorted.findIndex((f) => f.id === frame.id);
  const t = Date.now();
  const copy: StoryboardFrame = { ...frame, id: uid(), shotNumber: '', order: idx + 1, createdAt: t, updatedAt: t };
  const next = [...sorted.slice(0, idx + 1), copy, ...sorted.slice(idx + 1)];
  await createRecord('frames', copy, { summary: 'Duplicated a storyboard frame' });
  await db.transaction('rw', db.frames, async () => {
    for (let i = 0; i < next.length; i++) if (next[i].id !== copy.id) await db.frames.update(next[i].id, { order: i });
  });
  return copy;
}

/** Move a frame to the end of another scene's board. Its shot link belonged to the old scene, so it's cleared. */
export async function moveFrame(frame: StoryboardFrame, targetSceneId: string, targetFrames: StoryboardFrame[]) {
  const order = targetFrames.reduce((m, f) => Math.max(m, f.order), -1) + 1;
  await updateRecord<StoryboardFrame>('frames', frame.id, { sceneId: targetSceneId, order, shotId: undefined }, { summary: 'Moved a storyboard frame to another scene' });
}
