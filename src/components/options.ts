import type { PickOption } from './ui';
import type { Character, Location, Person, Scene } from '@/lib/types';

/** Picker options for the record types that are linked all over the app. */

export function sceneOptions(scenes: Scene[], numbers: Map<string, string>): PickOption[] {
  return scenes.map((s) => ({
    value: s.id,
    label: `${numbers.get(s.id) ?? '–'}. ${s.heading || 'Untitled scene'}`,
    hint: s.summary || s.scriptExcerpt || undefined,
  }));
}

export function characterOptions(characters: Character[], people?: Person[]): PickOption[] {
  const byId = new Map((people ?? []).map((p) => [p.id, p]));
  return characters.map((c) => ({
    value: c.id,
    label: c.name || 'Unnamed character',
    hint: c.actorId ? `Played by ${byId.get(c.actorId)?.name ?? 'someone'}` : 'Not cast',
  }));
}

export function personOptions(people: Person[]): PickOption[] {
  return people.map((p) => ({ value: p.id, label: p.name || 'Unnamed', hint: p.roles.join(', ') || undefined }));
}

export function locationOptions(locations: Location[]): PickOption[] {
  return locations.map((l) => ({ value: l.id, label: l.name || 'Unnamed location', hint: l.address || undefined }));
}
