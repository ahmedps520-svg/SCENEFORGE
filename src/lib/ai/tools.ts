import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

/**
 * Tools the assistant can call. Read-only tools run locally against the
 * project. `propose_*` tools never change anything: they create a suggestion
 * card that the user applies or dismisses.
 *
 * Every tool input is validated with zod before use — with eager input
 * streaming the API does not validate inputs for us.
 */

const SHOT_TYPES = ['EWS', 'WS', 'MWS', 'MS', 'MCU', 'CU', 'ECU', 'OTS', 'POV', 'INSERT', 'TWO'] as const;
const ANGLES = ['eye', 'high', 'low', 'overhead', 'dutch', 'ground'] as const;
const MOVEMENTS = ['static', 'pan', 'tilt', 'tracking', 'dolly', 'crane', 'handheld', 'zoom', 'steadicam'] as const;
const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
const EVENT_TYPES = ['filming', 'rehearsal', 'scouting', 'equipment', 'meeting', 'editing', 'deadline'] as const;
const ELEMENT_TYPES = ['action', 'character', 'parenthetical', 'dialogue', 'transition', 'shot', 'centered'] as const;

const sceneNumber = z.coerce.number().int().positive();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const hhmm = z.string().regex(/^\d{1,2}:\d{2}$/, 'Use HH:mm (24h)');
const text = (max = 2000) => z.string().trim().max(max);

const characterFields = {
  age: text(80).optional(),
  appearance: text().optional(),
  personality: text().optional(),
  background: text(4000).optional(),
  motivations: text().optional(),
  goals: text().optional(),
  fears: text().optional(),
  arc: text(4000).optional(),
  costume_notes: text().optional(),
  casting_notes: text().optional(),
  dialogue_samples: text(4000).optional(),
};

export const schemas = {
  read_scene_script: z.object({ scene_number: sceneNumber }),
  read_character: z.object({ name: text(120).min(1) }),
  list_shots: z.object({ scene_number: sceneNumber.optional() }),
  read_schedule: z.object({}).passthrough(),
  read_tasks: z.object({}).passthrough(),
  search_script: z.object({ query: text(200).min(1) }),

  propose_shots: z.object({
    scene_number: sceneNumber,
    shots: z
      .array(
        z.object({
          description: text(600).min(1),
          shot_type: z.enum(SHOT_TYPES),
          angle: z.enum(ANGLES),
          movement: z.enum(MOVEMENTS),
          lens: text(120).optional(),
          notes: text(600).optional(),
        }),
      )
      .min(1)
      .max(40),
  }),
  propose_storyboard_frames: z.object({
    scene_number: sceneNumber,
    frames: z
      .array(
        z.object({
          action: text(800).min(1),
          shot_type: z.enum(SHOT_TYPES),
          angle: z.enum(ANGLES),
          movement: z.enum(MOVEMENTS),
          audio: text(600).optional(),
          duration_sec: z.coerce.number().positive().max(600).optional(),
        }),
      )
      .min(1)
      .max(40),
  }),
  propose_tasks: z.object({
    tasks: z
      .array(
        z.object({
          title: text(200).min(1),
          description: text().optional(),
          priority: z.enum(PRIORITIES),
          due_date: isoDate.optional(),
          scene_number: sceneNumber.optional(),
        }),
      )
      .min(1)
      .max(30),
  }),
  propose_scene_updates: z.object({
    scene_number: sceneNumber,
    changes: z
      .object({
        summary: text().optional(),
        notes: text(4000).optional(),
        props_notes: text().optional(),
        wardrobe_notes: text().optional(),
        sfx_notes: text().optional(),
      })
      .refine((c) => Object.values(c).some((v) => v !== undefined), 'At least one change is required'),
  }),
  propose_character: z.object({ name: text(120).min(1), ...characterFields }),
  propose_character_updates: z.object({
    name: text(120).min(1),
    changes: z.object(characterFields).refine((c) => Object.values(c).some((v) => v !== undefined), 'At least one change is required'),
  }),
  propose_schedule: z.object({
    events: z
      .array(
        z.object({
          type: z.enum(EVENT_TYPES),
          title: text(200).min(1),
          date: isoDate,
          start_time: hhmm,
          duration_min: z.coerce.number().int().positive().max(24 * 60),
          scene_numbers: z.array(sceneNumber).max(40).default([]),
          notes: text().optional(),
        }),
      )
      .min(1)
      .max(30),
  }),
  propose_script_revision: z.object({
    scene_number: sceneNumber,
    rationale: text(1200).min(1),
    elements: z
      .array(z.object({ type: z.enum(ELEMENT_TYPES), text: text(4000) }))
      .min(1)
      .max(400),
  }),
} as const;

export type ToolName = keyof typeof schemas;
export type ToolInput<N extends ToolName> = z.infer<(typeof schemas)[N]>;

export const READ_TOOLS: ToolName[] = ['read_scene_script', 'read_character', 'list_shots', 'read_schedule', 'read_tasks', 'search_script'];
export const PROPOSAL_TOOLS: ToolName[] = [
  'propose_shots',
  'propose_storyboard_frames',
  'propose_tasks',
  'propose_scene_updates',
  'propose_character',
  'propose_character_updates',
  'propose_schedule',
  'propose_script_revision',
];

export function isToolName(name: string): name is ToolName {
  return name in schemas;
}

/** Validate a tool input. Returns the parsed value or a readable error. */
export function validateToolInput<N extends ToolName>(name: N, input: unknown): { ok: true; value: ToolInput<N> } | { ok: false; error: string } {
  const r = (schemas[name] as z.ZodType).safeParse(input);
  if (r.success) return { ok: true, value: r.data as ToolInput<N> };
  const issues = r.error.issues.slice(0, 5).map((i) => `${i.path.join('.') || 'input'}: ${i.message}`);
  return { ok: false, error: issues.join('; ') };
}

// ─── JSON Schemas sent to the API ───────────────────────────────────────────

const str = (description: string) => ({ type: 'string', description });
const shotEnums = {
  shot_type: { type: 'string', enum: [...SHOT_TYPES], description: 'EWS extreme wide, WS wide, MWS medium wide, MS medium, MCU medium close-up, CU close-up, ECU extreme close-up, OTS over-the-shoulder, POV point of view, INSERT insert, TWO two shot' },
  angle: { type: 'string', enum: [...ANGLES], description: 'Camera angle' },
  movement: { type: 'string', enum: [...MOVEMENTS], description: 'Camera movement' },
};
const characterProps = {
  age: str('Age or age range'),
  appearance: str('Physical appearance'),
  personality: str('Personality'),
  background: str('Backstory'),
  motivations: str('What drives them'),
  goals: str('What they want'),
  fears: str('What they fear'),
  arc: str('How they change over the story'),
  costume_notes: str('Costume notes'),
  casting_notes: str('Casting notes'),
  dialogue_samples: str('Example lines in their voice'),
};
const SUGGESTION = 'This only creates a suggestion card for the user to review; nothing changes unless they apply it.';

type Def = { name: ToolName; description: string; input_schema: Anthropic.Beta.BetaTool['input_schema'] };

const DEFS: Def[] = [
  {
    name: 'read_scene_script',
    description: "Read one scene's full screenplay text (Fountain format) from the production draft.",
    input_schema: { type: 'object', properties: { scene_number: { type: 'integer', description: 'Scene number as listed in the project context' } }, required: ['scene_number'] },
  },
  {
    name: 'read_character',
    description: 'Read a character profile and the scenes they appear in.',
    input_schema: { type: 'object', properties: { name: str('Character name') }, required: ['name'] },
  },
  {
    name: 'list_shots',
    description: 'List planned shots, for one scene or the whole project, with status.',
    input_schema: { type: 'object', properties: { scene_number: { type: 'integer', description: 'Optional scene number' } } },
  },
  { name: 'read_schedule', description: 'Read the production schedule: filming days, rehearsals, meetings and deadlines.', input_schema: { type: 'object', properties: {} } },
  { name: 'read_tasks', description: 'Read production tasks with status, priority, deadline and assignee.', input_schema: { type: 'object', properties: {} } },
  {
    name: 'search_script',
    description: 'Search the production draft for text (case-insensitive). Returns matching lines with their scene numbers.',
    input_schema: { type: 'object', properties: { query: str('Text to find') }, required: ['query'] },
  },
  {
    name: 'propose_shots',
    description: `Suggest shot-list entries for a scene. ${SUGGESTION}`,
    input_schema: {
      type: 'object',
      properties: {
        scene_number: { type: 'integer' },
        shots: {
          type: 'array',
          items: { type: 'object', properties: { description: str('What the shot shows'), ...shotEnums, lens: str('Lens or camera note, e.g. 35mm'), notes: str('Production notes') }, required: ['description', 'shot_type', 'angle', 'movement'] },
        },
      },
      required: ['scene_number', 'shots'],
    },
  },
  {
    name: 'propose_storyboard_frames',
    description: `Suggest storyboard frames (described in words) for a scene. ${SUGGESTION}`,
    input_schema: {
      type: 'object',
      properties: {
        scene_number: { type: 'integer' },
        frames: {
          type: 'array',
          items: { type: 'object', properties: { action: str('What happens in the frame'), ...shotEnums, audio: str('Dialogue or sound'), duration_sec: { type: 'number' } }, required: ['action', 'shot_type', 'angle', 'movement'] },
        },
      },
      required: ['scene_number', 'frames'],
    },
  },
  {
    name: 'propose_tasks',
    description: `Suggest production tasks. ${SUGGESTION}`,
    input_schema: {
      type: 'object',
      properties: {
        tasks: {
          type: 'array',
          items: {
            type: 'object',
            properties: { title: str('Short task title'), description: str('Details'), priority: { type: 'string', enum: [...PRIORITIES] }, due_date: str('YYYY-MM-DD'), scene_number: { type: 'integer' } },
            required: ['title', 'priority'],
          },
        },
      },
      required: ['tasks'],
    },
  },
  {
    name: 'propose_scene_updates',
    description: `Suggest new values for a scene's breakdown fields (replaces the current values shown in context). ${SUGGESTION}`,
    input_schema: {
      type: 'object',
      properties: {
        scene_number: { type: 'integer' },
        changes: {
          type: 'object',
          properties: { summary: str('One or two sentence summary'), notes: str("Director's notes"), props_notes: str('Required props'), wardrobe_notes: str('Wardrobe requirements'), sfx_notes: str('Special effects requirements') },
        },
      },
      required: ['scene_number', 'changes'],
    },
  },
  {
    name: 'propose_character',
    description: `Suggest a new character profile. ${SUGGESTION}`,
    input_schema: { type: 'object', properties: { name: str('Character name'), ...characterProps }, required: ['name'] },
  },
  {
    name: 'propose_character_updates',
    description: `Suggest new values for fields of an existing character profile. ${SUGGESTION}`,
    input_schema: { type: 'object', properties: { name: str('Existing character name'), changes: { type: 'object', properties: characterProps } }, required: ['name', 'changes'] },
  },
  {
    name: 'propose_schedule',
    description: `Suggest schedule events such as filming days and rehearsals. ${SUGGESTION}`,
    input_schema: {
      type: 'object',
      properties: {
        events: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: [...EVENT_TYPES] },
              title: str('Event title'),
              date: str('YYYY-MM-DD'),
              start_time: str('HH:mm, 24-hour'),
              duration_min: { type: 'integer' },
              scene_numbers: { type: 'array', items: { type: 'integer' } },
              notes: str('Notes'),
            },
            required: ['type', 'title', 'date', 'start_time', 'duration_min'],
          },
        },
      },
      required: ['events'],
    },
  },
  {
    name: 'propose_script_revision',
    description: `Suggest a rewrite of one scene's body (everything after its scene heading; the heading itself stays). Provide the complete new body as screenplay elements. ${SUGGESTION} If applied, the current draft is saved as a version first.`,
    input_schema: {
      type: 'object',
      properties: {
        scene_number: { type: 'integer' },
        rationale: str('Why this revision helps'),
        elements: {
          type: 'array',
          items: { type: 'object', properties: { type: { type: 'string', enum: [...ELEMENT_TYPES] }, text: str('Element text; character cues in caps, parentheticals in (parentheses)') }, required: ['type', 'text'] },
        },
      },
      required: ['scene_number', 'rationale', 'elements'],
    },
  },
];

/** Tool definitions for the Messages API, with eager input streaming on. */
export function toolDefinitions(): Anthropic.Beta.BetaTool[] {
  return DEFS.map((d) => ({ ...d, eager_input_streaming: true }));
}

export const TOOL_ACTIVITY: Partial<Record<ToolName, string>> = {
  read_scene_script: 'Reading scene',
  read_character: 'Reading character',
  list_shots: 'Checking the shot list',
  read_schedule: 'Checking the schedule',
  read_tasks: 'Checking tasks',
  search_script: 'Searching the script',
};
