import { EMPTY_POST_CHECKLIST } from '../constants';
import { uid } from '../ids';
import type {
  Character,
  Item,
  Location,
  Person,
  Project,
  Relationship,
  Scene,
  ScheduleEvent,
  Script,
  ScriptElement,
  Shot,
  StoryboardFrame,
  Task,
} from '../types';

const now = () => Date.now();
const base = (projectId: string) => ({ id: uid(), projectId, createdAt: now(), updatedAt: now() });

export function makeProject(p: Partial<Project> & { title: string }): Project {
  const t = now();
  return {
    id: uid(),
    logline: '',
    synopsis: '',
    genres: [],
    productionType: 'short',
    language: 'English',
    audience: '',
    visualStyle: '',
    stage: 'development',
    coverSeed: Math.floor(Math.random() * 1_000_000),
    scriptComplete: false,
    postChecklist: { ...EMPTY_POST_CHECKLIST },
    emergencyContacts: [],
    safetyNotes: '',
    createdAt: t,
    updatedAt: t,
    lastOpenedAt: t,
    ...p,
  };
}

export function emptyElements(): ScriptElement[] {
  return [{ id: uid(), type: 'scene', text: '', sceneId: uid() }];
}

export function makeScript(projectId: string, p: Partial<Script> = {}): Script {
  return {
    ...base(projectId),
    title: 'First Draft',
    elements: emptyElements(),
    revisionColor: 'white',
    titlePage: { title: '', credit: 'Written by', author: '', source: '', draftDate: '', contact: '' },
    wordCount: 0,
    pageCount: 0,
    ...p,
  };
}

export function makeScene(projectId: string, p: Partial<Scene> = {}): Scene {
  return {
    ...base(projectId),
    order: 0,
    productionOrder: 0,
    heading: '',
    intExt: 'INT',
    locationName: '',
    timeOfDay: 'DAY',
    summary: '',
    characterIds: [],
    propsNotes: '',
    wardrobeNotes: '',
    sfxNotes: '',
    status: 'planning',
    notes: '',
    inScript: false,
    pageEighths: 0,
    scriptSec: 0,
    scriptExcerpt: '',
    scriptCues: [],
    ...p,
  };
}

export function makeFrame(projectId: string, sceneId: string, p: Partial<StoryboardFrame> = {}): StoryboardFrame {
  return {
    ...base(projectId),
    sceneId,
    order: 0,
    shotNumber: '',
    shotType: 'WS',
    angle: 'eye',
    movement: 'static',
    action: '',
    audio: '',
    transition: 'Cut',
    notes: '',
    ...p,
  };
}

export function makeShot(projectId: string, sceneId: string, p: Partial<Shot> = {}): Shot {
  return {
    ...base(projectId),
    sceneId,
    order: 0,
    code: '',
    description: '',
    shotType: 'MS',
    angle: 'eye',
    movement: 'static',
    lens: '',
    framing: '',
    frameRate: '24',
    equipment: '',
    characterIds: [],
    priority: 'should',
    status: 'planned',
    notes: '',
    continuity: [],
    takes: 0,
    ...p,
  };
}

export function makeCharacter(projectId: string, p: Partial<Character> = {}): Character {
  return {
    ...base(projectId),
    name: '',
    age: '',
    appearance: '',
    personality: '',
    background: '',
    motivations: '',
    goals: '',
    fears: '',
    arc: '',
    costumeNotes: '',
    castingNotes: '',
    dialogueSamples: '',
    aliases: [],
    consistency: [],
    ...p,
  };
}

export function makeRelationship(projectId: string, fromId: string, toId: string, p: Partial<Relationship> = {}): Relationship {
  return { ...base(projectId), fromId, toId, label: '', description: '', ...p };
}

export function makeLocation(projectId: string, p: Partial<Location> = {}): Location {
  return {
    ...base(projectId),
    name: '',
    photoAssetIds: [],
    address: '',
    description: '',
    access: '',
    availabilityNotes: '',
    unavailableDates: [],
    status: 'scouting',
    contactName: '',
    contactPhone: '',
    contactEmail: '',
    restrictions: '',
    notes: '',
    ...p,
  };
}

export function makeItem(projectId: string, kind: Item['kind'], p: Partial<Item> = {}): Item {
  return {
    ...base(projectId),
    kind,
    name: '',
    description: '',
    quantity: 1,
    sceneIds: [],
    status: 'needed',
    ...p,
  };
}

export function makePerson(projectId: string, p: Partial<Person> = {}): Person {
  return {
    ...base(projectId),
    name: '',
    roles: [],
    email: '',
    phone: '',
    notes: '',
    unavailableDates: [],
    availabilityNotes: '',
    ...p,
  };
}

export function makeEvent(projectId: string, p: Partial<ScheduleEvent> & { date: string }): ScheduleEvent {
  return {
    ...base(projectId),
    type: 'filming',
    title: '',
    startTime: '09:00',
    durationMin: 480,
    callTime: '08:00',
    sceneIds: [],
    personIds: [],
    equipment: '',
    notes: '',
    ...p,
  };
}

export function makeTask(projectId: string, p: Partial<Task> = {}): Task {
  return {
    ...base(projectId),
    title: '',
    description: '',
    priority: 'medium',
    status: 'todo',
    order: now(),
    ...p,
  };
}
