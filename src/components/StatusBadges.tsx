import { ITEM_STATUSES, LOCATION_STATUSES, SCENE_STATUSES, SHOT_STATUSES, TASK_PRIORITIES } from '@/lib/constants';
import type { Readiness } from '@/lib/readiness';
import type { ItemStatus, LocationStatus, SceneStatus, ShotStatus, TaskPriority } from '@/lib/types';
import { Badge } from './ui';

export function SceneStatusBadge({ status }: { status: SceneStatus }) {
  const s = SCENE_STATUSES.find((x) => x.value === status) ?? SCENE_STATUSES[0];
  return <Badge tone={s.tone} dot>{s.label}</Badge>;
}

export function ShotStatusBadge({ status }: { status: ShotStatus }) {
  const s = SHOT_STATUSES.find((x) => x.value === status) ?? SHOT_STATUSES[0];
  return <Badge tone={s.tone} dot>{s.label}</Badge>;
}

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  const p = TASK_PRIORITIES.find((x) => x.value === priority) ?? TASK_PRIORITIES[1];
  return <Badge tone={p.tone}>{p.label}</Badge>;
}

export function LocationStatusBadge({ status }: { status: LocationStatus }) {
  const s = LOCATION_STATUSES.find((x) => x.value === status) ?? LOCATION_STATUSES[0];
  return <Badge tone={s.tone} dot>{s.label}</Badge>;
}

export function ItemStatusBadge({ status }: { status: ItemStatus }) {
  const s = ITEM_STATUSES.find((x) => x.value === status) ?? ITEM_STATUSES[0];
  return <Badge tone={s.tone} dot>{s.label}</Badge>;
}

const READINESS = {
  blocked: { tone: 'danger', label: 'Blocked' },
  ready: { tone: 'success', label: 'Ready to film' },
  prep: { tone: 'neutral', label: 'Needs prep' },
  filmed: { tone: 'accent', label: 'Filmed' },
} as const;

export function ReadinessBadge({ readiness }: { readiness: Readiness }) {
  const r = READINESS[readiness];
  return <Badge tone={r.tone} dot>{r.label}</Badge>;
}
