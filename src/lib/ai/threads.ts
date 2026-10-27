import { db } from '../db';
import { uid } from '../ids';
import type { AssistantThread, AssistantTurn, Proposal } from '../types';

/** Assistant conversations are stored per project in IndexedDB. */

export async function createThread(projectId: string, title: string): Promise<AssistantThread> {
  const t = Date.now();
  const thread: AssistantThread = {
    id: uid(),
    projectId,
    title: title.trim().replace(/\s+/g, ' ').slice(0, 70) || 'New conversation',
    turns: [],
    apiMessages: [],
    createdAt: t,
    updatedAt: t,
  };
  await db.threads.add(thread);
  return thread;
}

export async function appendTurns(threadId: string, turns: AssistantTurn[], apiMessages?: unknown[]) {
  await db.transaction('rw', db.threads, async () => {
    const th = await db.threads.get(threadId);
    if (!th) return;
    await db.threads.update(threadId, {
      turns: [...th.turns, ...turns],
      ...(apiMessages ? { apiMessages } : {}),
      updatedAt: Date.now(),
    });
  });
}

/** Remove turns from the visible transcript (used to retry a failed reply). */
export async function removeTurns(threadId: string, turnIds: string[]) {
  await db.transaction('rw', db.threads, async () => {
    const th = await db.threads.get(threadId);
    if (!th) return;
    await db.threads.update(threadId, { turns: th.turns.filter((t) => !turnIds.includes(t.id)), updatedAt: Date.now() });
  });
}

export async function updateProposal(threadId: string, turnId: string, proposal: Proposal) {
  await db.transaction('rw', db.threads, async () => {
    const th = await db.threads.get(threadId);
    if (!th) return;
    await db.threads.update(threadId, {
      turns: th.turns.map((t) => (t.id === turnId ? { ...t, proposals: t.proposals.map((p) => (p.id === proposal.id ? proposal : p)) } : t)),
      updatedAt: Date.now(),
    });
  });
}

export async function deleteThread(threadId: string): Promise<AssistantThread | undefined> {
  const th = await db.threads.get(threadId);
  await db.threads.delete(threadId);
  return th;
}
