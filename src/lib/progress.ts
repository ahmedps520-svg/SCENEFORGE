import { POST_CHECKLIST } from './constants';
import type { Project, Scene, ScheduleEvent, Shot, StoryboardFrame, Task } from './types';
import { todayStr } from './dates';

export interface ProgressComponent {
  key: 'script' | 'prep' | 'storyboard' | 'shooting' | 'post';
  label: string;
  /** 0–1, or null when there is nothing to measure yet. */
  value: number | null;
  weight: number;
  detail: string;
}

export interface ProjectProgress {
  /** Weighted over the components that can be measured. 0–1. */
  overall: number;
  components: ProgressComponent[];
  counts: {
    scenes: number;
    scenesReady: number;
    scenesFilmed: number;
    shots: number;
    shotsCompleted: number;
    tasksOpen: number;
    tasksOverdue: number;
    upcomingFilmingDays: number;
    scenesWithFrames: number;
  };
}

/**
 * Progress from real project data. Each component states how it is measured;
 * components with nothing to measure are left out of the overall figure
 * rather than guessed.
 */
export function computeProgress(d: {
  project: Project;
  scriptPages: number;
  scenes: Scene[];
  shots: Shot[];
  frames: StoryboardFrame[];
  tasks: Task[];
  events: ScheduleEvent[];
}): ProjectProgress {
  const today = todayStr();
  const scenes = d.scenes;
  const scenesReady = scenes.filter((s) => s.status === 'ready' || s.status === 'filmed').length;
  const scenesFilmed = scenes.filter((s) => s.status === 'filmed').length;
  const shotsCompleted = d.shots.filter((s) => s.status === 'completed').length;
  const framed = new Set(d.frames.map((f) => f.sceneId));
  const scenesWithFrames = scenes.filter((s) => framed.has(s.id)).length;
  const postDone = POST_CHECKLIST.filter((c) => d.project.postChecklist[c.key]).length;

  const target = d.project.runtimeTarget;
  const scriptValue = d.project.scriptComplete
    ? 1
    : target && target > 0
      ? Math.min(1, d.scriptPages / target)
      : null;

  const shootingValue = d.shots.length
    ? shotsCompleted / d.shots.length
    : scenes.length
      ? scenesFilmed / scenes.length
      : null;

  const components: ProgressComponent[] = [
    {
      key: 'script',
      label: 'Script',
      value: scriptValue,
      weight: 20,
      detail: d.project.scriptComplete
        ? 'Marked complete by the owner'
        : target
          ? `${d.scriptPages.toFixed(1)} of ~${target} pages (1 page ≈ 1 minute)`
          : 'Set a target runtime, or mark the script complete, to measure this',
    },
    {
      key: 'prep',
      label: 'Scene preparation',
      value: scenes.length ? scenesReady / scenes.length : null,
      weight: 15,
      detail: scenes.length ? `${scenesReady} of ${scenes.length} scenes ready to film or filmed` : 'No scenes yet',
    },
    {
      key: 'storyboard',
      label: 'Storyboard',
      value: scenes.length ? scenesWithFrames / scenes.length : null,
      weight: 10,
      detail: scenes.length ? `${scenesWithFrames} of ${scenes.length} scenes have frames` : 'No scenes yet',
    },
    {
      key: 'shooting',
      label: 'Filming',
      value: shootingValue,
      weight: 35,
      detail: d.shots.length
        ? `${shotsCompleted} of ${d.shots.length} shots completed`
        : scenes.length
          ? `${scenesFilmed} of ${scenes.length} scenes filmed`
          : 'No shots or scenes yet',
    },
    {
      key: 'post',
      label: 'Post-production',
      value: postDone / POST_CHECKLIST.length,
      weight: 20,
      detail: `${postDone} of ${POST_CHECKLIST.length} checklist items done`,
    },
  ];

  // Post only counts once there is something to post-produce.
  const measurable = components.filter((c) => c.value !== null && (c.key !== 'post' || postDone > 0 || scenesFilmed > 0 || shotsCompleted > 0));
  const totalWeight = measurable.reduce((n, c) => n + c.weight, 0);
  const overall = totalWeight ? measurable.reduce((n, c) => n + (c.value ?? 0) * c.weight, 0) / totalWeight : 0;

  return {
    overall: d.project.stage === 'completed' && postDone === POST_CHECKLIST.length ? 1 : overall,
    components,
    counts: {
      scenes: scenes.length,
      scenesReady,
      scenesFilmed,
      shots: d.shots.length,
      shotsCompleted,
      tasksOpen: d.tasks.filter((t) => t.status !== 'done').length,
      tasksOverdue: d.tasks.filter((t) => t.status !== 'done' && t.due && t.due < today).length,
      upcomingFilmingDays: d.events.filter((e) => e.type === 'filming' && e.date >= today).length,
      scenesWithFrames,
    },
  };
}
