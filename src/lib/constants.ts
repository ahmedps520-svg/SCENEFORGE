import type {
  AccessRole,
  AssetCategory,
  CameraAngle,
  CameraMovement,
  ElementType,
  EventType,
  ItemStatus,
  LocationStatus,
  PostKey,
  ProductionType,
  RevisionColor,
  SceneStatus,
  ShotPriority,
  ShotStatus,
  ShotType,
  Stage,
  TaskPriority,
  TaskStatus,
} from './types';

export const GENRES = [
  'Action',
  'Comedy',
  'Thriller',
  'Horror',
  'Drama',
  'Science Fiction',
  'Fantasy',
  'Mystery',
  'Documentary',
  'Romance',
  'Animation',
  'Musical',
  'Western',
  'Crime',
] as const;

export const PRODUCTION_TYPES: { value: ProductionType; label: string; hint: string }[] = [
  { value: 'short', label: 'Short film', hint: 'Usually under 40 minutes' },
  { value: 'feature', label: 'Feature film', hint: '75 minutes and up' },
  { value: 'web-series', label: 'Web series', hint: 'Episodic, made for streaming' },
  { value: 'skit', label: 'Skit', hint: 'A few minutes, often comedic' },
  { value: 'documentary', label: 'Documentary', hint: 'Non-fiction storytelling' },
  { value: 'experimental', label: 'Experimental film', hint: 'Form-breaking work' },
];

export const STAGES: { value: Stage; label: string; short: string }[] = [
  { value: 'development', label: 'Development', short: 'Dev' },
  { value: 'preproduction', label: 'Pre-production', short: 'Pre' },
  { value: 'production', label: 'Production', short: 'Prod' },
  { value: 'postproduction', label: 'Post-production', short: 'Post' },
  { value: 'completed', label: 'Completed', short: 'Done' },
];

export const stageLabel = (s: Stage) => STAGES.find((x) => x.value === s)?.label ?? s;

export const POST_CHECKLIST: { key: PostKey; label: string; hint: string }[] = [
  { key: 'editing', label: 'Editing', hint: 'Picture lock reached' },
  { key: 'sound', label: 'Sound design', hint: 'Dialogue edit, foley, mix' },
  { key: 'music', label: 'Music', hint: 'Score or licensed tracks in place' },
  { key: 'color', label: 'Color grading', hint: 'Final grade approved' },
  { key: 'vfx', label: 'Visual effects', hint: 'All VFX shots finished' },
  { key: 'subtitles', label: 'Subtitles', hint: 'Captions and translations' },
  { key: 'export', label: 'Final export', hint: 'Master file delivered' },
];

export const EMPTY_POST_CHECKLIST: Record<PostKey, boolean> = {
  editing: false,
  sound: false,
  music: false,
  color: false,
  vfx: false,
  subtitles: false,
  export: false,
};

export const ELEMENT_TYPES: { value: ElementType; label: string; key: string }[] = [
  { value: 'scene', label: 'Scene Heading', key: '1' },
  { value: 'action', label: 'Action', key: '2' },
  { value: 'character', label: 'Character', key: '3' },
  { value: 'parenthetical', label: 'Parenthetical', key: '4' },
  { value: 'dialogue', label: 'Dialogue', key: '5' },
  { value: 'transition', label: 'Transition', key: '6' },
  { value: 'shot', label: 'Shot', key: '7' },
  { value: 'centered', label: 'Centered', key: '8' },
];

export const elementLabel = (t: ElementType) => ELEMENT_TYPES.find((x) => x.value === t)?.label ?? t;

export const REVISION_COLORS: { value: RevisionColor; label: string; swatch: string }[] = [
  { value: 'white', label: 'White', swatch: '#f4f1ea' },
  { value: 'blue', label: 'Blue', swatch: '#8fb3d9' },
  { value: 'pink', label: 'Pink', swatch: '#e7a6bd' },
  { value: 'yellow', label: 'Yellow', swatch: '#e8d36a' },
  { value: 'green', label: 'Green', swatch: '#9cc58f' },
  { value: 'goldenrod', label: 'Goldenrod', swatch: '#d9a83f' },
  { value: 'buff', label: 'Buff', swatch: '#e2cba0' },
  { value: 'salmon', label: 'Salmon', swatch: '#ea9a82' },
  { value: 'cherry', label: 'Cherry', swatch: '#c9545d' },
];

export const revisionColor = (c: RevisionColor) => REVISION_COLORS.find((x) => x.value === c) ?? REVISION_COLORS[0];

export const SCENE_STATUSES: { value: SceneStatus; label: string; tone: Tone }[] = [
  { value: 'planning', label: 'Needs prep', tone: 'neutral' },
  { value: 'ready', label: 'Ready to film', tone: 'success' },
  { value: 'filmed', label: 'Filmed', tone: 'accent' },
  { value: 'reshoot', label: 'Needs reshoot', tone: 'danger' },
];

export const SHOT_TYPES: { value: ShotType; label: string; abbr: string }[] = [
  { value: 'EWS', label: 'Extreme wide shot', abbr: 'EWS' },
  { value: 'WS', label: 'Wide shot', abbr: 'WS' },
  { value: 'MWS', label: 'Medium wide shot', abbr: 'MWS' },
  { value: 'MS', label: 'Medium shot', abbr: 'MS' },
  { value: 'MCU', label: 'Medium close-up', abbr: 'MCU' },
  { value: 'CU', label: 'Close-up', abbr: 'CU' },
  { value: 'ECU', label: 'Extreme close-up', abbr: 'ECU' },
  { value: 'OTS', label: 'Over-the-shoulder', abbr: 'OTS' },
  { value: 'POV', label: 'Point of view', abbr: 'POV' },
  { value: 'INSERT', label: 'Insert', abbr: 'INS' },
  { value: 'TWO', label: 'Two shot', abbr: '2S' },
];

export const CAMERA_ANGLES: { value: CameraAngle; label: string }[] = [
  { value: 'eye', label: 'Eye level' },
  { value: 'high', label: 'High angle' },
  { value: 'low', label: 'Low angle' },
  { value: 'overhead', label: 'Overhead' },
  { value: 'dutch', label: 'Dutch angle' },
  { value: 'ground', label: 'Ground level' },
];

export const CAMERA_MOVEMENTS: { value: CameraMovement; label: string }[] = [
  { value: 'static', label: 'Static' },
  { value: 'pan', label: 'Pan' },
  { value: 'tilt', label: 'Tilt' },
  { value: 'tracking', label: 'Tracking' },
  { value: 'dolly', label: 'Dolly' },
  { value: 'crane', label: 'Crane' },
  { value: 'handheld', label: 'Handheld' },
  { value: 'zoom', label: 'Zoom' },
  { value: 'steadicam', label: 'Steadicam' },
];

export const shotTypeLabel = (v: ShotType) => SHOT_TYPES.find((x) => x.value === v)?.label ?? v;
export const shotTypeAbbr = (v: ShotType) => SHOT_TYPES.find((x) => x.value === v)?.abbr ?? v;
export const angleLabel = (v: CameraAngle) => CAMERA_ANGLES.find((x) => x.value === v)?.label ?? v;
export const movementLabel = (v: CameraMovement) => CAMERA_MOVEMENTS.find((x) => x.value === v)?.label ?? v;

export const TRANSITIONS = ['Cut', 'Dissolve', 'Fade in', 'Fade out', 'Match cut', 'Smash cut', 'Wipe', 'J-cut', 'L-cut', 'Iris'];

export const FRAME_RATES = ['23.976', '24', '25', '29.97', '30', '48', '50', '60', '120'];

export const FRAMING_SUGGESTIONS = [
  'Centered',
  'Rule of thirds — subject left',
  'Rule of thirds — subject right',
  'Symmetrical',
  'Negative space',
  'Frame within a frame',
  'Leading lines',
  'Tight headroom',
  'Deep focus',
  'Shallow focus',
];

export const SHOT_STATUSES: { value: ShotStatus; label: string; tone: Tone }[] = [
  { value: 'planned', label: 'Planned', tone: 'neutral' },
  { value: 'ready', label: 'Ready', tone: 'info' },
  { value: 'filming', label: 'Filming', tone: 'live' },
  { value: 'completed', label: 'Completed', tone: 'success' },
  { value: 'reshoot', label: 'Needs reshoot', tone: 'danger' },
];

export const SHOT_PRIORITIES: { value: ShotPriority; label: string }[] = [
  { value: 'must', label: 'Must have' },
  { value: 'should', label: 'Should have' },
  { value: 'nice', label: 'Nice to have' },
];

export const CREW_ROLES = [
  'Director',
  'Producer',
  'Screenwriter',
  'Cinematographer',
  'Editor',
  'Actor',
  'Camera operator',
  'Sound operator',
  'Production assistant',
  'Makeup artist',
  'Costume designer',
  'Gaffer',
  'Production designer',
  'Script supervisor',
  'Assistant director',
] as const;

/** Roles that make someone part of the cast rather than the crew. */
export const CAST_ROLES = ['Actor', 'Extra', 'Stunt performer', 'Voice actor'];

export const ACCESS_ROLES: { value: AccessRole; label: string; hint: string }[] = [
  { value: 'owner', label: 'Owner', hint: 'Full control, including project settings and deletion' },
  { value: 'editor', label: 'Editor', hint: 'Can edit scripts, scenes, schedules and assets' },
  { value: 'commenter', label: 'Commenter', hint: 'Can read everything and leave comments' },
  { value: 'viewer', label: 'Viewer', hint: 'Read-only access' },
];

export const EVENT_TYPES: { value: EventType; label: string; color: string }[] = [
  { value: 'filming', label: 'Filming day', color: 'var(--c-accent)' },
  { value: 'rehearsal', label: 'Rehearsal', color: 'var(--c-info)' },
  { value: 'scouting', label: 'Location scouting', color: 'var(--c-success)' },
  { value: 'equipment', label: 'Equipment prep', color: 'var(--c-warning)' },
  { value: 'meeting', label: 'Production meeting', color: 'var(--c-violet)' },
  { value: 'editing', label: 'Editing session', color: 'var(--c-teal)' },
  { value: 'deadline', label: 'Deadline', color: 'var(--c-danger)' },
];

export const eventTypeMeta = (t: EventType) => EVENT_TYPES.find((x) => x.value === t) ?? EVENT_TYPES[0];

export const TASK_STATUSES: { value: TaskStatus; label: string }[] = [
  { value: 'todo', label: 'To do' },
  { value: 'in-progress', label: 'In progress' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'done', label: 'Done' },
];

export const TASK_PRIORITIES: { value: TaskPriority; label: string; tone: Tone }[] = [
  { value: 'low', label: 'Low', tone: 'neutral' },
  { value: 'medium', label: 'Medium', tone: 'info' },
  { value: 'high', label: 'High', tone: 'warning' },
  { value: 'urgent', label: 'Urgent', tone: 'danger' },
];

export const LOCATION_STATUSES: { value: LocationStatus; label: string; tone: Tone }[] = [
  { value: 'scouting', label: 'Scouting', tone: 'info' },
  { value: 'confirmed', label: 'Confirmed', tone: 'success' },
  { value: 'unavailable', label: 'Unavailable', tone: 'danger' },
];

export const ITEM_STATUSES: { value: ItemStatus; label: string; tone: Tone }[] = [
  { value: 'available', label: 'Available', tone: 'success' },
  { value: 'needed', label: 'Not yet sourced', tone: 'warning' },
  { value: 'unavailable', label: 'Unavailable', tone: 'danger' },
];

export const ASSET_CATEGORIES: { value: AssetCategory; label: string }[] = [
  { value: 'reference', label: 'Reference photos' },
  { value: 'concept-art', label: 'Concept art' },
  { value: 'location', label: 'Location images' },
  { value: 'portrait', label: 'Character portraits' },
  { value: 'storyboard', label: 'Storyboard images' },
  { value: 'costume', label: 'Costume references' },
  { value: 'camera', label: 'Camera references' },
  { value: 'music', label: 'Music references' },
  { value: 'sfx', label: 'Sound effects' },
  { value: 'video', label: 'Video clips' },
  { value: 'document', label: 'Documents' },
  { value: 'notes', label: 'Production notes' },
  { value: 'cover', label: 'Cover art' },
];

export const assetCategoryLabel = (c: AssetCategory) => ASSET_CATEGORIES.find((x) => x.value === c)?.label ?? c;

/** Upload limits, shown to the user wherever files are accepted. */
export const FILE_LIMITS = {
  maxBytes: 100 * 1024 * 1024,
  maxImageBytes: 25 * 1024 * 1024,
  imageTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml', 'image/avif'],
  videoTypes: ['video/mp4', 'video/webm', 'video/quicktime'],
  audioTypes: ['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/flac'],
  documentTypes: ['application/pdf', 'text/plain', 'text/markdown', 'text/csv', 'application/json'],
  /** Extensions accepted even when the browser reports no MIME type. */
  extraExtensions: ['.fountain', '.fdx', '.md', '.txt', '.docx', '.pages', '.csv'],
};

export const ACCEPT_IMAGES = FILE_LIMITS.imageTypes.join(',');
export const ACCEPT_ANY_ASSET = [
  ...FILE_LIMITS.imageTypes,
  ...FILE_LIMITS.videoTypes,
  ...FILE_LIMITS.audioTypes,
  ...FILE_LIMITS.documentTypes,
  ...FILE_LIMITS.extraExtensions,
].join(',');

export const SUPPORTED_FORMATS_TEXT =
  'Images (JPG, PNG, WebP, GIF, SVG, AVIF) up to 25 MB · Video (MP4, WebM, MOV), audio (MP3, WAV, OGG, M4A, AAC, FLAC) and documents (PDF, TXT, Markdown, CSV, Fountain, FDX, DOCX) up to 100 MB';

export const AI_MODELS = [
  { value: 'claude-opus-5-5', label: 'Claude Opus 5.5', hint: 'Most capable for story and production work (default)' },
  { value: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', hint: 'Faster, lower cost' },
  { value: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', hint: 'Fastest, lowest cost' },
];

export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'live';
