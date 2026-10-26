/**
 * SCENEFORGE domain model.
 *
 * Every record except Project carries a projectId. Relationships have a single
 * source of truth so they can never disagree:
 *   scene.characterIds   — characters present in a scene
 *   scene.locationId     — where a scene is filmed
 *   item.sceneIds        — props / wardrobe a scene requires
 *   character.actorId    — the cast member playing a character
 *   frame.sceneId/shotId — storyboard frame placement
 *   shot.sceneId         — shot placement
 *   event.sceneIds       — scenes filmed during a schedule event
 */

export type ID = string;
/** Calendar date in local time, `YYYY-MM-DD`. */
export type DateStr = string;

export interface BaseRecord {
  id: ID;
  projectId: ID;
  createdAt: number;
  updatedAt: number;
}

// ─── Project ────────────────────────────────────────────────────────────────

export type Stage = 'development' | 'preproduction' | 'production' | 'postproduction' | 'completed';

export type ProductionType = 'short' | 'feature' | 'web-series' | 'skit' | 'documentary' | 'experimental';

export type PostKey = 'editing' | 'sound' | 'music' | 'color' | 'vfx' | 'subtitles' | 'export';

export interface EmergencyContact {
  id: ID;
  name: string;
  role: string;
  phone: string;
}

export interface Project {
  id: ID;
  title: string;
  logline: string;
  synopsis: string;
  /** First entry is the primary genre. May contain custom genres. */
  genres: string[];
  productionType: ProductionType;
  /** Target runtime in minutes. */
  runtimeTarget?: number;
  language: string;
  audience: string;
  visualStyle: string;
  filmingStart?: DateStr;
  filmingEnd?: DateStr;
  stage: Stage;
  coverAssetId?: ID;
  /** Seed for the generated cover art when no image is uploaded. */
  coverSeed: number;
  /** The draft that drives the scene breakdown. */
  primaryScriptId?: ID;
  /** Owner can declare the script complete regardless of the page-count estimate. */
  scriptComplete: boolean;
  postChecklist: Record<PostKey, boolean>;
  emergencyContacts: EmergencyContact[];
  /** Free-form safety info for call sheets: nearest hospital, safety officer, etc. */
  safetyNotes: string;
  isSample?: boolean;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt: number;
}

// ─── Screenplay ─────────────────────────────────────────────────────────────

export type ElementType =
  | 'scene'
  | 'action'
  | 'character'
  | 'parenthetical'
  | 'dialogue'
  | 'transition'
  | 'shot'
  | 'centered';

export interface ScriptElement {
  id: ID;
  type: ElementType;
  text: string;
  /** Only on `scene` elements: the Scene record this heading drives. */
  sceneId?: ID;
}

export type RevisionColor =
  | 'white'
  | 'blue'
  | 'pink'
  | 'yellow'
  | 'green'
  | 'goldenrod'
  | 'buff'
  | 'salmon'
  | 'cherry';

export interface TitlePage {
  title: string;
  credit: string;
  author: string;
  source: string;
  draftDate: string;
  contact: string;
}

export interface Script extends BaseRecord {
  /** Draft name, e.g. "First Draft". */
  title: string;
  elements: ScriptElement[];
  revisionColor: RevisionColor;
  titlePage: TitlePage;
  /** Cached stats, refreshed on save. */
  wordCount: number;
  pageCount: number;
  /** Identifies the browser tab that last wrote, to detect edits from elsewhere. */
  lastWriter?: string;
}

export interface ScriptVersion {
  id: ID;
  projectId: ID;
  scriptId: ID;
  label: string;
  revisionColor: RevisionColor;
  elements: ScriptElement[];
  wordCount: number;
  pageCount: number;
  /** True for automatic snapshots, false for versions the writer saved deliberately. */
  auto: boolean;
  createdAt: number;
}

// ─── Scenes ─────────────────────────────────────────────────────────────────

export type SceneStatus = 'planning' | 'ready' | 'filmed' | 'reshoot';
export type IntExt = 'INT' | 'EXT' | 'INT/EXT' | '';

export interface Scene extends BaseRecord {
  /** Story order (matches the production draft when the scene is in the script). */
  order: number;
  /** Shooting order chosen by the production. */
  productionOrder: number;
  heading: string;
  intExt: IntExt;
  locationName: string;
  timeOfDay: string;
  summary: string;
  locationId?: ID;
  characterIds: ID[];
  /** Manual duration override in seconds; otherwise estimated from the script. */
  estDurationSec?: number;
  propsNotes: string;
  wardrobeNotes: string;
  sfxNotes: string;
  status: SceneStatus;
  notes: string;
  /** False when the heading was removed from the production draft. */
  inScript: boolean;
  /** Derived from the production draft on every save. */
  pageEighths: number;
  scriptSec: number;
  scriptExcerpt: string;
  /** Character cue names found in this scene's script, as written. */
  scriptCues: string[];
}

// ─── Storyboards & shots ────────────────────────────────────────────────────

export type ShotType = 'EWS' | 'WS' | 'MWS' | 'MS' | 'MCU' | 'CU' | 'ECU' | 'OTS' | 'POV' | 'INSERT' | 'TWO';
export type CameraAngle = 'eye' | 'high' | 'low' | 'overhead' | 'dutch' | 'ground';
export type CameraMovement = 'static' | 'pan' | 'tilt' | 'tracking' | 'dolly' | 'crane' | 'handheld' | 'zoom' | 'steadicam';

export interface StoryboardFrame extends BaseRecord {
  sceneId: ID;
  order: number;
  imageAssetId?: ID;
  /** Optional override; defaults to `<scene>.<position>`. */
  shotNumber: string;
  shotType: ShotType;
  angle: CameraAngle;
  movement: CameraMovement;
  action: string;
  audio: string;
  durationSec?: number;
  transition: string;
  notes: string;
  /** Linked shot-list entry. */
  shotId?: ID;
}

export type ShotStatus = 'planned' | 'ready' | 'filming' | 'completed' | 'reshoot';
export type ShotPriority = 'must' | 'should' | 'nice';

export interface ContinuityNote {
  id: ID;
  text: string;
  at: number;
  resolved: boolean;
}

export interface Shot extends BaseRecord {
  sceneId: ID;
  order: number;
  /** Optional override; defaults to `<scene number><letter>`, e.g. 4B. */
  code: string;
  description: string;
  shotType: ShotType;
  angle: CameraAngle;
  movement: CameraMovement;
  lens: string;
  framing: string;
  frameRate: string;
  equipment: string;
  characterIds: ID[];
  setupMin?: number;
  filmMin?: number;
  priority: ShotPriority;
  status: ShotStatus;
  /** Filming day this shot is assigned to; falls back to the scene's filming day. */
  eventId?: ID;
  notes: string;
  continuity: ContinuityNote[];
  takes: number;
  completedAt?: number;
}

// ─── Characters ─────────────────────────────────────────────────────────────

export interface ConsistencyRule {
  id: ID;
  category: 'appearance' | 'personality' | 'voice' | 'behavior' | 'wardrobe' | 'other';
  text: string;
}

export interface Character extends BaseRecord {
  name: string;
  portraitAssetId?: ID;
  age: string;
  appearance: string;
  personality: string;
  background: string;
  motivations: string;
  goals: string;
  fears: string;
  arc: string;
  costumeNotes: string;
  castingNotes: string;
  dialogueSamples: string;
  /** Other spellings used in cues, e.g. "MR. HALE" for "THOMAS HALE". */
  aliases: string[];
  actorId?: ID;
  consistency: ConsistencyRule[];
  /** Position on the relationship map (0–1 normalised). */
  mapX?: number;
  mapY?: number;
  color?: string;
}

export interface Relationship extends BaseRecord {
  fromId: ID;
  toId: ID;
  /** e.g. "sister", "rival", "mentor". */
  label: string;
  description: string;
}

// ─── Locations & inventory ──────────────────────────────────────────────────

export type LocationStatus = 'scouting' | 'confirmed' | 'unavailable';

export interface Location extends BaseRecord {
  name: string;
  photoAssetIds: ID[];
  address: string;
  description: string;
  access: string;
  availabilityNotes: string;
  unavailableDates: DateStr[];
  status: LocationStatus;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  restrictions: string;
  notes: string;
}

export type ItemKind = 'prop' | 'wardrobe';
export type ItemStatus = 'available' | 'needed' | 'unavailable';

export interface Item extends BaseRecord {
  kind: ItemKind;
  name: string;
  photoAssetId?: ID;
  description: string;
  quantity: number;
  responsibleId?: ID;
  sceneIds: ID[];
  /** For wardrobe: who wears it. */
  characterId?: ID;
  status: ItemStatus;
}

// ─── People ─────────────────────────────────────────────────────────────────

export type AccessRole = 'owner' | 'editor' | 'commenter' | 'viewer';

export interface Person extends BaseRecord {
  name: string;
  roles: string[];
  email: string;
  phone: string;
  photoAssetId?: ID;
  notes: string;
  unavailableDates: DateStr[];
  availabilityNotes: string;
  /** Collaboration access, if this person is a project collaborator. */
  accessRole?: AccessRole;
  /** Marks the person who is using this device. */
  isYou?: boolean;
}

// ─── Schedule ───────────────────────────────────────────────────────────────

export type EventType =
  | 'filming'
  | 'rehearsal'
  | 'scouting'
  | 'equipment'
  | 'meeting'
  | 'editing'
  | 'deadline';

export interface ScheduleEvent extends BaseRecord {
  type: EventType;
  title: string;
  date: DateStr;
  /** `HH:mm`, 24h. */
  startTime: string;
  durationMin: number;
  /** Crew call time for call sheets, `HH:mm`. */
  callTime: string;
  locationId?: ID;
  sceneIds: ID[];
  /** Explicitly required people (cast for scenes is also derived from characters). */
  personIds: ID[];
  equipment: string;
  notes: string;
}

// ─── Tasks ──────────────────────────────────────────────────────────────────

export type TaskStatus = 'todo' | 'in-progress' | 'blocked' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface Task extends BaseRecord {
  title: string;
  description: string;
  assigneeId?: ID;
  due?: DateStr;
  priority: TaskPriority;
  status: TaskStatus;
  order: number;
  sceneId?: ID;
  locationId?: ID;
  assetId?: ID;
  completedAt?: number;
}

// ─── Assets ─────────────────────────────────────────────────────────────────

export type AssetCategory =
  | 'reference'
  | 'concept-art'
  | 'location'
  | 'portrait'
  | 'music'
  | 'sfx'
  | 'document'
  | 'notes'
  | 'video'
  | 'costume'
  | 'camera'
  | 'storyboard'
  | 'cover';

export interface AssetLinks {
  sceneIds: ID[];
  characterIds: ID[];
  frameIds: ID[];
  locationIds: ID[];
}

export interface Asset extends BaseRecord {
  name: string;
  mime: string;
  size: number;
  category: AssetCategory;
  /** Slash-separated folder path; '' is the library root. */
  folder: string;
  tags: string[];
  description: string;
  links: AssetLinks;
  width?: number;
  height?: number;
  hasThumb: boolean;
}

/** Binary content for an asset, stored apart from metadata so lists stay fast. */
export interface AssetBlob {
  id: ID;
  data: Blob;
}

// ─── Collaboration ──────────────────────────────────────────────────────────

export type EntityType =
  | 'project'
  | 'script'
  | 'scene'
  | 'frame'
  | 'shot'
  | 'character'
  | 'relationship'
  | 'location'
  | 'item'
  | 'person'
  | 'event'
  | 'task'
  | 'asset';

export interface Comment extends BaseRecord {
  entityType: EntityType;
  entityId: ID;
  author: string;
  text: string;
  resolved: boolean;
}

export interface Activity {
  id: ID;
  projectId: ID;
  at: number;
  actor: string;
  action: 'created' | 'updated' | 'deleted' | 'restored' | 'imported' | 'applied';
  entityType: EntityType;
  entityId: ID;
  summary: string;
}

// ─── AI assistant ───────────────────────────────────────────────────────────

export type ProposalStatus = 'pending' | 'applied' | 'dismissed' | 'failed';

export interface Proposal {
  id: ID;
  /** Tool name that produced it, e.g. `propose_shots`. */
  kind: string;
  input: unknown;
  status: ProposalStatus;
  resolvedAt?: number;
  error?: string;
  /** Records created when applied, so the change can be undone. */
  createdRecords?: { table: string; id: ID }[];
  /** Script version saved before a script change was applied. */
  backupVersionId?: ID;
}

export interface AssistantTurn {
  id: ID;
  role: 'user' | 'assistant';
  text: string;
  proposals: Proposal[];
  /** What the user had selected when asking. */
  focus?: { type: 'scene' | 'character'; id: ID; label: string };
  error?: string;
  at: number;
}

export interface AssistantThread extends BaseRecord {
  title: string;
  turns: AssistantTurn[];
  /** Raw Messages API history, so follow-up questions keep context. */
  apiMessages: unknown[];
}

// ─── App settings ───────────────────────────────────────────────────────────

export type ThemePref = 'dark' | 'light' | 'system';

export interface AppSettings {
  userName: string;
  onboardingComplete: boolean;
  theme: ThemePref;
  dashboardView: 'grid' | 'list';
  dismissedTips: string[];
  ai: {
    enabled: boolean;
    apiKey: string;
    model: string;
  };
  editor: {
    paper: 'dark' | 'light';
    showSceneNumbers: boolean;
    pageSize: 'letter' | 'a4';
  };
}
