import { db } from '@/lib/db';
import { uid } from '@/lib/ids';
import { scriptStats } from '@/lib/screenplay/paginate';
import { settingsSnapshot } from '@/lib/data/settings';
import type { Script, ScriptElement } from '@/lib/types';

/** Keep arbitrary editor content (e.g. unsaved edits during a conflict) as a named version. */
export async function saveElementsAsVersion(script: Script, elements: ScriptElement[], label: string) {
  const stats = scriptStats(elements, settingsSnapshot().editor.pageSize);
  await db.scriptVersions.add({
    id: uid(),
    projectId: script.projectId,
    scriptId: script.id,
    label,
    revisionColor: script.revisionColor,
    elements,
    wordCount: stats.wordCount,
    pageCount: stats.pageCount,
    auto: false,
    createdAt: Date.now(),
  });
}
