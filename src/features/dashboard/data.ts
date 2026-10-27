import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { addDaysStr, todayStr } from '@/lib/dates';
import { computeProgress, type ProjectProgress } from '@/lib/progress';
import { scriptStats } from '@/lib/screenplay/paginate';
import type { Project, ScheduleEvent, Script, Task } from '@/lib/types';

export interface ProjectSummary {
  project: Project;
  progress: ProjectProgress;
  pages: number;
  drafts: number;
  counts: { characters: number; frames: number; scenes: number; shots: number; shotsCompleted: number };
}

export interface UpcomingShoot {
  event: ScheduleEvent;
  project: Project;
  locationName: string;
}

export interface OpenTask {
  task: Task;
  project: Project;
  overdue: boolean;
}

export interface RecentEdit {
  key: string;
  kind: 'script' | 'scene';
  title: string;
  subtitle: string;
  project: Project;
  updatedAt: number;
  href: string;
}

export interface StudioData {
  summaries: ProjectSummary[];
  upcoming: UpcomingShoot[];
  tasks: OpenTask[];
  recent: RecentEdit[];
}

// Pagination is the expensive part; cache it per draft revision.
const pageCache = new Map<string, { updatedAt: number; pages: number }>();

function draftPages(script: Script | undefined): number {
  if (!script) return 0;
  const hit = pageCache.get(script.id);
  if (hit && hit.updatedAt === script.updatedAt) return hit.pages;
  const pages = scriptStats(script.elements).pages;
  pageCache.set(script.id, { updatedAt: script.updatedAt, pages });
  return pages;
}

function group<T extends { projectId: string }>(rows: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const list = m.get(r.projectId);
    if (list) list.push(r);
    else m.set(r.projectId, [r]);
  }
  return m;
}

/** Everything the studio dashboard shows, across every project, in one reactive read. */
export function useStudioData(): StudioData | undefined {
  return useLiveQuery(async () => {
    const [projects, scripts, scenes, shots, frames, tasks, events, characters, locations] = await Promise.all([
      db.projects.toArray(),
      db.scripts.toArray(),
      db.scenes.toArray(),
      db.shots.toArray(),
      db.frames.toArray(),
      db.tasks.toArray(),
      db.events.toArray(),
      db.characters.toArray(),
      db.locations.toArray(),
    ]);
    const byProject = new Map(projects.map((p) => [p.id, p]));
    const scriptsBy = group(scripts);
    const scenesBy = group(scenes);
    const shotsBy = group(shots);
    const framesBy = group(frames);
    const tasksBy = group(tasks);
    const eventsBy = group(events);
    const charsBy = group(characters);
    const locName = new Map(locations.map((l) => [l.id, l.name]));

    const summaries: ProjectSummary[] = projects.map((project) => {
      const drafts = scriptsBy.get(project.id) ?? [];
      const primary = drafts.find((d) => d.id === project.primaryScriptId) ?? drafts[0];
      const pages = draftPages(primary);
      const pShots = shotsBy.get(project.id) ?? [];
      const progress = computeProgress({
        project,
        scriptPages: pages,
        scenes: scenesBy.get(project.id) ?? [],
        shots: pShots,
        frames: framesBy.get(project.id) ?? [],
        tasks: tasksBy.get(project.id) ?? [],
        events: eventsBy.get(project.id) ?? [],
      });
      return {
        project,
        progress,
        pages,
        drafts: drafts.length,
        counts: {
          characters: (charsBy.get(project.id) ?? []).length,
          frames: (framesBy.get(project.id) ?? []).length,
          scenes: (scenesBy.get(project.id) ?? []).length,
          shots: pShots.length,
          shotsCompleted: pShots.filter((s) => s.status === 'completed').length,
        },
      };
    });

    const today = todayStr();
    const horizon = addDaysStr(today, 30);
    const upcoming: UpcomingShoot[] = events
      .filter((e) => e.type === 'filming' && e.date >= today && e.date <= horizon && byProject.has(e.projectId))
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
      .slice(0, 6)
      .map((event) => {
        const project = byProject.get(event.projectId)!;
        const sceneLoc = (scenesBy.get(event.projectId) ?? []).find((s) => event.sceneIds.includes(s.id) && s.locationId)?.locationId;
        const lid = event.locationId ?? sceneLoc;
        return { event, project, locationName: (lid && locName.get(lid)) || '' };
      });

    const open: OpenTask[] = tasks
      .filter((t) => t.status !== 'done' && byProject.has(t.projectId))
      .map((task) => ({ task, project: byProject.get(task.projectId)!, overdue: !!task.due && task.due < today }))
      .sort((a, b) => {
        if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
        if (a.task.due && b.task.due) return a.task.due.localeCompare(b.task.due);
        if (a.task.due) return -1;
        if (b.task.due) return 1;
        const pr = { urgent: 0, high: 1, medium: 2, low: 3 };
        return pr[a.task.priority] - pr[b.task.priority];
      })
      .slice(0, 6);

    const scenesShown = new Map<string, number>();
    const recent: RecentEdit[] = [
      ...scripts
        .filter((s) => byProject.has(s.projectId))
        .map<RecentEdit>((s) => ({
          key: `script:${s.id}`,
          kind: 'script',
          title: s.title,
          subtitle: `${s.pageCount} page${s.pageCount === 1 ? '' : 's'} · ${s.wordCount.toLocaleString()} words`,
          project: byProject.get(s.projectId)!,
          updatedAt: s.updatedAt,
          href: `/p/${s.projectId}/script`,
        })),
      ...scenes
        .filter((s) => byProject.has(s.projectId) && s.heading)
        .map<RecentEdit>((s) => ({
          key: `scene:${s.id}`,
          kind: 'scene',
          title: s.heading,
          subtitle: s.summary || s.scriptExcerpt || 'Scene',
          project: byProject.get(s.projectId)!,
          updatedAt: s.updatedAt,
          href: `/p/${s.projectId}/scenes?scene=${s.id}`,
        })),
    ]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      // A script save also touches every synced scene; keep at most two scenes per film so the list stays varied.
      .filter((r) => {
        if (r.kind !== 'scene') return true;
        const n = scenesShown.get(r.project.id) ?? 0;
        scenesShown.set(r.project.id, n + 1);
        return n < 2;
      })
      .slice(0, 6);

    return { summaries, upcoming, tasks: open, recent };
  }, []);
}
