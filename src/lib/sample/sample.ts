import { db } from '../db';
import { addDaysStr, todayStr } from '../dates';
import { addAsset } from '../data/assets';
import { logActivity } from '../data/crud';
import { makeCharacter, makeEvent, makeFrame, makeItem, makeLocation, makePerson, makeRelationship, makeShot, makeTask } from '../data/factories';
import { createProject } from '../data/projects';
import { saveScript, saveVersion } from '../data/scripts';
import { settingsSnapshot } from '../data/settings';
import { uid } from '../ids';
import { parseFountain } from '../screenplay/fountain';
import type { CameraAngle, CameraMovement, Project, Shot, ShotType } from '../types';
import { sketchSvg, type SketchKind } from './sketches';

/**
 * "The Keeper's Hour" — the sample film offered during onboarding. It shows
 * how the script drives scenes, how characters, locations and props attach
 * to them, and how storyboards, shots, the schedule and tasks connect.
 * Everything is clearly marked as sample content and removable in one click.
 */

export const SAMPLE_SCRIPT = `Title: The Keeper's Hour
Credit: Written by
Author: SCENEFORGE Sample
Draft date: Sample draft

EXT. HEADLAND ROAD - DUSK

A single road threads along the cliffs. At its end, a white lighthouse holds the last of the light.

A dented hatchback crawls toward it, wipers ticking.

INT. TOMAS'S CAR - CONTINUOUS

TOMAS ODELL (38), city coat, county lanyard, drives with both hands. In the back, WREN (12) presses her forehead to the glass.

WREN
Is that it?

TOMAS
That's it.

WREN
It's smaller than you said.

TOMAS
Everything is, when you go back.

INT. LIGHTHOUSE - KEEPER'S KITCHEN - NIGHT

A cramped kitchen of brass and tide charts. MARGARET "MAGS" ODELL (67) stirs a pot she has clearly made for three. She doesn't turn when the door opens.

MAGS
You're late. The tide wasn't.

TOMAS
Hello, Mum.

Wren hovers in the doorway, dripping. Mags finally looks — at Wren, not Tomas.

MAGS
(softening despite herself)
You'll be the one who sends drawings.

WREN
You got them?

MAGS
Every one. They're on the wall by the lens.

Tomas sets a folder on the table. AUTOMATION AGREEMENT — CAPE ARDEN LIGHT.

TOMAS
The crew comes at eight. After tonight it runs itself.

MAGS
Nothing runs itself. It just stops being anyone's.

INT. LIGHTHOUSE - LANTERN ROOM - NIGHT

The great lens turns, throwing slow arcs of light across Wren's upturned face. Taped to the glass: a decade of children's drawings.

WREN
How long have you kept it?

MAGS
Forty-one years. Your grandad kept it before me.

WREN
Does it get lonely?

MAGS
(beat)
Only when it's quiet.

Thunder rolls in off the water. The lens stutters — and stops. Darkness.

EXT. LIGHTHOUSE GALLERY - NIGHT

Rain lashes the iron railing. Mags pushes into the wind with a storm lantern. Tomas follows, shouting over the gale.

TOMAS
The backup's automatic! Let it kick in!

The tower stays dark.

COAST GUARD (V.O.)
(radio, crackling)
Cape Arden, Cape Arden. Fishing vessel Marigold reports no light. Do you copy?

Mags and Tomas lock eyes.

MAGS
There's a crank in the stairwell. It needs two.

INT. LIGHTHOUSE - STAIRWELL - CONTINUOUS

Iron stairs spiral up into darkness. Tomas and Mags haul a rusted hand-crank between them, step by step. Wren lights the way with the lantern.

TOMAS
You should have left years ago.

MAGS
You should have come back years ago.

They reach the landing. Tomas fits the crank. Together, they turn it.

Above them, slowly, the lens begins to move.

EXT. HEADLAND - DAWN

Calm. Gulls. A small blinking unit now sits beside the old lamp room.

Mags hands Wren a battered brass-cornered LOGBOOK.

MAGS
Last entry's yours.

Wren writes. Tomas reads over her shoulder, and smiles for the first time.

WREN
"Light kept. Everyone home."

The three of them walk down the headland road together.

FADE OUT.
`;

const SHOTS: Record<number, { d: string; t: ShotType; a: CameraAngle; m: CameraMovement; lens: string; status?: Shot['status']; setup?: number; film?: number; priority?: Shot['priority'] }[]> = {
  0: [
    { d: 'Car crawls along the cliff road toward the lighthouse', t: 'EWS', a: 'high', m: 'static', lens: '24mm, drone or clifftop', status: 'completed', setup: 30, film: 20, priority: 'must' },
    { d: 'Lighthouse catches the last of the sun', t: 'WS', a: 'low', m: 'tilt', lens: '50mm', status: 'completed', setup: 15, film: 10 },
  ],
  1: [
    { d: 'Wren, forehead on the glass, lighthouse beyond', t: 'MCU', a: 'eye', m: 'static', lens: '35mm, car mount', status: 'completed', setup: 25, film: 15, priority: 'must' },
    { d: 'Tomas driving, both hands on the wheel', t: 'MS', a: 'eye', m: 'static', lens: '35mm, car mount', status: 'completed', setup: 10, film: 15 },
  ],
  2: [
    { d: 'Mags at the stove, back to the door as it opens', t: 'WS', a: 'eye', m: 'dolly', lens: '28mm', status: 'ready', setup: 40, film: 30, priority: 'must' },
    { d: 'Wren dripping in the doorway', t: 'MS', a: 'eye', m: 'static', lens: '50mm', status: 'ready', setup: 15, film: 15 },
    { d: 'Mags softens — first look at Wren', t: 'CU', a: 'eye', m: 'static', lens: '85mm', status: 'planned', setup: 15, film: 20, priority: 'must' },
    { d: 'Insert: the automation agreement on the table', t: 'INSERT', a: 'overhead', m: 'static', lens: '50mm macro', status: 'planned', setup: 10, film: 5 },
    { d: 'Over Tomas onto Mags: "Nothing runs itself."', t: 'OTS', a: 'eye', m: 'static', lens: '50mm', status: 'planned', setup: 20, film: 20 },
  ],
  3: [
    { d: 'Lens turning, light sweeping across Wren', t: 'MCU', a: 'low', m: 'static', lens: '35mm', status: 'planned', setup: 45, film: 25, priority: 'must' },
    { d: 'The two of them small beneath the great lens', t: 'WS', a: 'high', m: 'crane', lens: '18mm', status: 'planned', setup: 60, film: 20, priority: 'should' },
    { d: 'The lens stutters and stops — blackout', t: 'CU', a: 'eye', m: 'static', lens: '50mm', status: 'planned', setup: 20, film: 10, priority: 'must' },
  ],
  4: [
    { d: 'Mags fights the wind along the railing with the lantern', t: 'WS', a: 'low', m: 'handheld', lens: '24mm', status: 'planned', setup: 50, film: 30, priority: 'must' },
    { d: 'Mags and Tomas lock eyes in the rain', t: 'TWO', a: 'eye', m: 'handheld', lens: '35mm', status: 'planned', setup: 20, film: 20 },
  ],
  5: [{ d: 'Hauling the crank up the spiral, lantern light only', t: 'MWS', a: 'high', m: 'tracking', lens: '24mm', status: 'planned', setup: 45, film: 30, priority: 'must' }],
  6: [
    { d: 'The three walk down the headland road at dawn', t: 'EWS', a: 'eye', m: 'static', lens: '35mm', status: 'planned', setup: 20, film: 15, priority: 'must' },
    { d: 'Insert: Wren writes the last logbook entry', t: 'INSERT', a: 'high', m: 'static', lens: '50mm macro', status: 'planned', setup: 10, film: 10 },
  ],
};

const FRAMES: Record<number, { k: SketchKind; t: ShotType; a: CameraAngle; m: CameraMovement; action: string; audio?: string; dur: number; transition?: string; shot?: number }[]> = {
  0: [{ k: 'road-wide', t: 'EWS', a: 'high', m: 'static', action: 'The hatchback crawls toward the lighthouse at dusk.', audio: 'Wind, distant surf, wipers ticking', dur: 6, transition: 'Fade in', shot: 0 }],
  1: [{ k: 'car-interior', t: 'MCU', a: 'eye', m: 'static', action: 'Wren at the window. The lighthouse grows in the windshield.', audio: 'WREN: "Is that it?"', dur: 5, shot: 0 }],
  2: [
    { k: 'lighthouse-door', t: 'WS', a: 'eye', m: 'static', action: 'Warm light spills from the keeper’s door into the rain.', audio: 'Rain, door latch', dur: 3 },
    { k: 'kitchen-two', t: 'WS', a: 'eye', m: 'dolly', action: 'Mags at the stove; Tomas and Wren in the doorway.', audio: 'MAGS: "You’re late. The tide wasn’t."', dur: 6, shot: 0 },
    { k: 'close-face', t: 'CU', a: 'eye', m: 'static', action: 'Mags sees Wren for the first time. Her face gives way.', audio: 'MAGS: "You’ll be the one who sends drawings."', dur: 4, shot: 2 },
    { k: 'papers-insert', t: 'INSERT', a: 'overhead', m: 'static', action: 'The automation agreement slides onto the table.', audio: 'Paper on wood', dur: 2, shot: 3 },
  ],
  3: [
    { k: 'lens-wide', t: 'WS', a: 'high', m: 'crane', action: 'Mags and Wren beneath the turning lens; drawings taped to the glass.', audio: 'Low mechanical hum of the lens', dur: 7, shot: 1 },
    { k: 'ots-window', t: 'OTS', a: 'eye', m: 'static', action: 'Over Wren’s shoulder: the storm arrives on the water.', audio: 'Thunder rolls in', dur: 4, transition: 'Smash cut' },
  ],
  4: [{ k: 'gallery-storm', t: 'WS', a: 'low', m: 'handheld', action: 'Mags pushes along the gallery railing, lantern swinging.', audio: 'Gale, radio crackle', dur: 5, shot: 0 }],
};

async function storeSketch(projectId: string, kind: SketchKind, seed: number, name: string) {
  const blob = new Blob([sketchSvg(kind, seed)], { type: 'image/svg+xml' });
  return addAsset(projectId, blob, { name, category: 'storyboard', folder: 'Storyboards', tags: ['sample'], silent: true });
}

export async function createSampleProject(): Promise<Project> {
  const today = todayStr();
  const parsed = parseFountain(SAMPLE_SCRIPT);
  const you = settingsSnapshot().userName.trim();

  const project = await createProject({
    title: "The Keeper's Hour",
    logline:
      'On the last night before her lighthouse is automated, a stubborn keeper must decide whether to let her estranged son take her home — or keep the light burning one final time through a storm.',
    synopsis:
      'Tomas returns to Cape Arden with the county’s automation agreement and a daughter his mother has only known through drawings. Mags has kept the light for forty-one years and has no intention of signing anything. When a storm knocks out the lamp and a fishing boat is caught off the point, mother and son have to haul the old hand-crank up the tower together — and decide what “home” means after the light no longer needs a keeper.',
    genres: ['Drama', 'Mystery'],
    productionType: 'short',
    runtimeTarget: 12,
    language: 'English',
    audience: 'Festival audiences, families (PG)',
    visualStyle: 'Cold blue nights against warm practical lamplight. Patient, locked-off frames that loosen into handheld when the storm hits.',
    filmingStart: addDaysStr(today, -3),
    filmingEnd: addDaysStr(today, 10),
    coverSeed: 4417,
    you: { name: you || 'You', role: 'Director' },
    draftTitle: 'Shooting Draft',
    titlePage: parsed.titlePage,
  });
  const pid = project.id;

  // ── People ────────────────────────────────────────────────────────────────
  const ruth = makePerson(pid, { name: 'Ruth Adeyemi', roles: ['Actor'], unavailableDates: [addDaysStr(today, 8)], availabilityNotes: 'Theatre run on weekday evenings — sample data' });
  const daniel = makePerson(pid, { name: 'Daniel Okafor', roles: ['Actor'] });
  const lily = makePerson(pid, { name: 'Lily Chen', roles: ['Actor'], availabilityNotes: 'Minor: chaperone required on set, wrap by 8pm' });
  const marco = makePerson(pid, { name: 'Marco Reyes', roles: ['Cinematographer'], accessRole: 'editor' });
  const priya = makePerson(pid, { name: 'Priya Nair', roles: ['Sound operator'], accessRole: 'commenter' });
  const sam = makePerson(pid, { name: 'Sam Whitfield', roles: ['Production assistant'] });
  await db.people.bulkAdd([ruth, daniel, lily, marco, priya, sam]);

  // ── Characters & relationships ───────────────────────────────────────────
  const mags = makeCharacter(pid, {
    name: 'Mags Odell',
    aliases: ['MAGS', 'MARGARET ODELL'],
    age: '67',
    appearance: 'Weathered, upright, silver hair pinned back. Oilskin coat she has worn for decades.',
    personality: 'Dry, proud, quietly funny. Speaks in short sentences and means every word.',
    background: 'Keeper of Cape Arden Light for forty-one years, after her late husband.',
    motivations: 'Keeping the light — and herself — necessary.',
    goals: 'Get through one last night without signing the agreement.',
    fears: 'Being left in the quiet with nothing to tend.',
    arc: 'From guarding the light alone to handing it on — choosing family over the tower.',
    costumeNotes: 'Oilskin coat, wool fisherman’s jumper, rubber boots.',
    castingNotes: 'Needs stillness and comic timing. Cast: Ruth Adeyemi (sample).',
    dialogueSamples: 'Nothing runs itself. It just stops being anyone’s.',
    actorId: ruth.id,
    consistency: [
      { id: uid(), category: 'voice', text: 'Never says “I love you” outright — shows it through tasks.' },
      { id: uid(), category: 'wardrobe', text: 'Oilskin coat in every exterior scene.' },
    ],
    mapX: 0.5,
    mapY: 0.22,
  });
  const tomas = makeCharacter(pid, {
    name: 'Tomas Odell',
    aliases: ['TOMAS'],
    age: '38',
    appearance: 'City coat, county lanyard, tired eyes. Looks like he hasn’t slept since he left.',
    personality: 'Practical, guarded, quick to fix things instead of feeling them.',
    background: 'Left Cape Arden at eighteen; now an engineer for the county’s coastal automation programme.',
    motivations: 'Finishing the job cleanly and getting his mother somewhere safe.',
    goals: 'Get the agreement signed before the crew arrives at eight.',
    fears: 'That he’s become the thing that ends his family’s story.',
    arc: 'From enforcing the shutdown to turning the crank beside her.',
    costumeNotes: 'Navy city coat, lanyard visible until the storm.',
    actorId: daniel.id,
    mapX: 0.22,
    mapY: 0.72,
  });
  const wren = makeCharacter(pid, {
    name: 'Wren Odell',
    aliases: ['WREN'],
    age: '12',
    appearance: 'Yellow raincoat, sketchbook always in one pocket.',
    personality: 'Curious, blunt, draws everything she can’t say.',
    background: 'Has sent her grandmother drawings every month without ever meeting her.',
    motivations: 'To finally see the lighthouse from the drawings.',
    goals: 'Get her grandmother to come home with them.',
    fears: 'That the drawings never arrived.',
    arc: 'From stranger to the one who writes the last entry.',
    costumeNotes: 'Yellow raincoat — the brightest colour in the film.',
    actorId: lily.id,
    mapX: 0.78,
    mapY: 0.72,
  });
  const coastGuard = makeCharacter(pid, {
    name: 'Coast Guard Dispatcher',
    aliases: ['COAST GUARD'],
    appearance: 'Voice only, over the radio.',
    castingNotes: 'Voice over — can be recorded remotely.',
    mapX: 0.5,
    mapY: 0.95,
  });
  await db.characters.bulkAdd([mags, tomas, wren, coastGuard]);
  await db.relationships.bulkAdd([
    makeRelationship(pid, mags.id, tomas.id, { label: 'Mother · estranged', description: 'They haven’t spoken properly in twenty years.' }),
    makeRelationship(pid, tomas.id, wren.id, { label: 'Father', description: 'Raising her alone; she’s the reason he came in person.' }),
    makeRelationship(pid, mags.id, wren.id, { label: 'Grandmother', description: 'Strangers who already know each other through drawings.' }),
  ]);

  // ── Locations (created before the script so headings link automatically) ─
  const lighthouse = makeLocation(pid, {
    name: 'Lighthouse',
    address: 'Cape Arden Light, North Point Road (sample)',
    description: 'Working lighthouse with keeper’s cottage. Kitchen, lantern room, gallery and stairwell all on site.',
    access: 'Gate code from the heritage trust on the morning of the shoot. Vehicles park at the lower lot; gear goes up by hand.',
    availabilityNotes: 'Closed to the public Monday–Wednesday.',
    unavailableDates: [addDaysStr(today, 9)],
    status: 'confirmed',
    contactName: 'Heritage trust warden (sample)',
    contactPhone: '555-0187',
    restrictions: 'No open flames in the lantern room. Crew of 10 max in the tower.',
    notes: 'Lens rotation can be stopped on request for lighting setups.',
  });
  const road = makeLocation(pid, {
    name: 'Headland Road',
    address: 'Coastal road, mile marker 14 (sample)',
    description: 'Single-track road along the cliffs with a clear line to the lighthouse.',
    access: 'Traffic control needed for wide shots; permit approved.',
    status: 'confirmed',
  });
  const headland = makeLocation(pid, {
    name: 'Headland',
    address: 'Grass headland below the lighthouse (sample)',
    description: 'Open headland for the dawn ending.',
    availabilityNotes: 'Golden window at dawn is about 25 minutes.',
    status: 'scouting',
  });
  await db.locations.bulkAdd([lighthouse, road, headland]);

  // ── Script → scenes ──────────────────────────────────────────────────────
  await saveScript(project.primaryScriptId!, parsed.elements, { skipVersioning: true, summary: 'Wrote the sample shooting draft' });
  await saveVersion(project.primaryScriptId!, 'Table read', 'blue');
  let scenes = await db.scenes.where('projectId').equals(pid).sortBy('order');
  const sceneIdx = (i: number) => scenes[i];

  // Scene details the script can't express.
  const sceneDetails: Record<number, Partial<(typeof scenes)[number]>> = {
    0: { summary: 'Tomas and Wren arrive at dusk; the lighthouse at the end of the road.', status: 'filmed', notes: 'Drone wide is the opening title card.', characterIds: [tomas.id, wren.id] },
    1: { summary: 'In the car: Wren sees the lighthouse for the first time.', status: 'filmed', locationId: road.id },
    2: { summary: 'The reunion in the kitchen. Tomas puts the agreement on the table.', status: 'ready', propsNotes: 'Pot of stew for three, enamel bowls.', notes: 'Play the silence before Mags turns. Hold on the back of her head.' },
    3: { summary: 'Mags shows Wren the lens and the drawings — then the storm cuts the power.', status: 'planning', sfxNotes: 'Lens stop and blackout timed with thunder cue.', notes: 'Light sweep rig needed if the real lens can’t be slowed.' },
    4: { summary: 'On the gallery in the storm; the coast guard reports a boat with no light.', status: 'planning', sfxNotes: 'Rain towers and wind machine.', wardrobeNotes: 'Everyone soaked — two sets of each costume.' },
    5: { summary: 'Mother and son haul the hand-crank up the tower together.', status: 'planning', characterIds: [mags.id, tomas.id, wren.id] },
    6: { summary: 'Dawn. Wren writes the last logbook entry; they leave together.', status: 'planning', characterIds: [mags.id, tomas.id, wren.id] },
  };
  const t = Date.now();
  for (const [i, patch] of Object.entries(sceneDetails)) {
    const s = sceneIdx(Number(i));
    if (s) await db.scenes.update(s.id, { ...patch, updatedAt: t });
  }
  // Shoot the lighthouse interiors together, exteriors on later days.
  const productionOrder = [0, 1, 2, 3, 5, 4, 6];
  for (let i = 0; i < productionOrder.length; i++) {
    const s = sceneIdx(productionOrder[i]);
    if (s) await db.scenes.update(s.id, { productionOrder: i });
  }

  scenes = await db.scenes.where('projectId').equals(pid).sortBy('order');

  // ── Props & wardrobe ─────────────────────────────────────────────────────
  await db.items.bulkAdd([
    makeItem(pid, 'prop', { name: 'Brass-cornered logbook', description: 'Battered keeper’s logbook, last page blank.', quantity: 1, status: 'available', sceneIds: [sceneIdx(6).id], responsibleId: sam.id }),
    makeItem(pid, 'prop', { name: 'Storm lantern', description: 'Working paraffin-style lantern (LED insert for safety).', quantity: 2, status: 'available', sceneIds: [sceneIdx(4).id, sceneIdx(5).id], responsibleId: sam.id }),
    makeItem(pid, 'prop', { name: 'Automation agreement folder', description: 'County letterhead, 6 pages, signature tabs.', quantity: 3, status: 'needed', sceneIds: [sceneIdx(2).id], responsibleId: sam.id }),
    makeItem(pid, 'prop', { name: 'Hand-crank mechanism', description: 'Rusted cast-iron crank that fits the lens drive.', quantity: 1, status: 'needed', sceneIds: [sceneIdx(5).id] }),
    makeItem(pid, 'wardrobe', { name: 'Oilskin coat', description: 'Mags’s coat — two copies for wet scenes.', quantity: 2, status: 'available', characterId: mags.id, sceneIds: [sceneIdx(4).id, sceneIdx(6).id] }),
    makeItem(pid, 'wardrobe', { name: 'Yellow raincoat', description: 'Wren’s coat — the film’s one bright colour.', quantity: 2, status: 'available', characterId: wren.id, sceneIds: [sceneIdx(1).id, sceneIdx(2).id, sceneIdx(6).id] }),
  ]);

  // ── Schedule ─────────────────────────────────────────────────────────────
  const day0 = makeEvent(pid, { type: 'filming', title: 'Day 1 — Headland Road', date: addDaysStr(today, -3), startTime: '16:30', durationMin: 240, callTime: '15:00', locationId: road.id, sceneIds: [sceneIdx(0).id, sceneIdx(1).id], personIds: [marco.id, priya.id, sam.id], equipment: 'Drone (licensed operator), car mount, 2 × LED panels', notes: 'Golden hour around 18:40.' });
  const day1 = makeEvent(pid, { type: 'filming', title: 'Day 2 — Lighthouse interiors', date: addDaysStr(today, 7), startTime: '09:00', durationMin: 600, callTime: '07:30', locationId: lighthouse.id, sceneIds: [sceneIdx(2).id, sceneIdx(3).id, sceneIdx(5).id], personIds: [marco.id, priya.id, sam.id], equipment: 'Dolly + 6ft track, haze machine, practical lamp kit, light sweep rig', notes: 'Chaperone on set for Lily. Wrap by 20:00.' });
  const day2 = makeEvent(pid, { type: 'filming', title: 'Day 3 — Gallery storm (night)', date: addDaysStr(today, 8), startTime: '19:00', durationMin: 300, callTime: '17:30', locationId: lighthouse.id, sceneIds: [sceneIdx(4).id], personIds: [marco.id, priya.id, sam.id], equipment: 'Rain towers, wind machine, rain covers for camera and sound', notes: 'Safety briefing before rain rigs run.' });
  const day3 = makeEvent(pid, { type: 'filming', title: 'Day 4 — Dawn on the headland', date: addDaysStr(today, 10), startTime: '05:45', durationMin: 120, callTime: '04:45', locationId: headland.id, sceneIds: [sceneIdx(6).id], personIds: [marco.id, priya.id, sam.id], equipment: 'Lightweight kit, reflectors', notes: '25-minute golden window — rehearse the walk the day before.' });
  await db.events.bulkAdd([
    day0,
    day1,
    day2,
    day3,
    makeEvent(pid, { type: 'scouting', title: 'Tech scout — lantern room', date: addDaysStr(today, 1), startTime: '10:00', durationMin: 120, callTime: '10:00', locationId: lighthouse.id, personIds: [marco.id], notes: 'Measure the lens, check power for the sweep rig.' }),
    makeEvent(pid, { type: 'meeting', title: 'Production meeting', date: addDaysStr(today, 2), startTime: '18:00', durationMin: 60, callTime: '18:00', personIds: [marco.id, priya.id, sam.id] }),
    makeEvent(pid, { type: 'rehearsal', title: 'Kitchen scene rehearsal', date: addDaysStr(today, 3), startTime: '14:00', durationMin: 180, callTime: '14:00', sceneIds: [sceneIdx(2).id], notes: 'Run the reunion three times without props, then with.' }),
    makeEvent(pid, { type: 'equipment', title: 'Rain rig test', date: addDaysStr(today, 5), startTime: '11:00', durationMin: 120, callTime: '11:00', personIds: [sam.id] }),
    makeEvent(pid, { type: 'editing', title: 'Assembly of Day 1 footage', date: addDaysStr(today, 4), startTime: '10:00', durationMin: 240, callTime: '10:00' }),
    makeEvent(pid, { type: 'deadline', title: 'Festival submission deadline', date: addDaysStr(today, 45), startTime: '23:59', durationMin: 1, callTime: '23:59' }),
  ]);

  // ── Shots ────────────────────────────────────────────────────────────────
  const shotIds: Record<number, string[]> = {};
  const shots: Shot[] = [];
  for (const [i, list] of Object.entries(SHOTS)) {
    const scene = sceneIdx(Number(i));
    if (!scene) continue;
    shotIds[Number(i)] = [];
    list.forEach((s, order) => {
      const shot = makeShot(pid, scene.id, {
        order,
        description: s.d,
        shotType: s.t,
        angle: s.a,
        movement: s.m,
        lens: s.lens,
        status: s.status ?? 'planned',
        priority: s.priority ?? 'should',
        setupMin: s.setup,
        filmMin: s.film,
        characterIds: scene.characterIds,
        takes: s.status === 'completed' ? 3 + order : 0,
        completedAt: s.status === 'completed' ? Date.now() - 3 * 86400000 : undefined,
        eventId: Number(i) <= 1 ? day0.id : undefined,
      });
      shots.push(shot);
      shotIds[Number(i)].push(shot.id);
    });
  }
  shots.find((s) => s.description.startsWith('Wren, forehead'))?.continuity.push({ id: uid(), text: 'Raincoat hood down in the car, up at the lighthouse door.', at: Date.now(), resolved: false });
  await db.shots.bulkAdd(shots);

  // ── Storyboards ──────────────────────────────────────────────────────────
  let seed = 1;
  for (const [i, list] of Object.entries(FRAMES)) {
    const scene = sceneIdx(Number(i));
    if (!scene) continue;
    for (let order = 0; order < list.length; order++) {
      const f = list[order];
      const frame = makeFrame(pid, scene.id, {
        order,
        shotType: f.t,
        angle: f.a,
        movement: f.m,
        action: f.action,
        audio: f.audio ?? '',
        durationSec: f.dur,
        transition: f.transition ?? 'Cut',
        shotId: f.shot !== undefined ? shotIds[Number(i)]?.[f.shot] : undefined,
      });
      const asset = await storeSketch(pid, f.k, seed++, `Sketch — scene ${Number(i) + 1}.${order + 1}`);
      frame.imageAssetId = asset.id;
      await db.frames.add(frame);
      await db.assets.update(asset.id, { links: { sceneIds: [scene.id], characterIds: [], frameIds: [frame.id], locationIds: [] } });
    }
  }

  // ── Tasks ────────────────────────────────────────────────────────────────
  await db.tasks.bulkAdd([
    makeTask(pid, { title: 'Secure lighthouse access permit', description: 'Signed by the heritage trust, copy in the asset library.', status: 'done', priority: 'high', locationId: lighthouse.id, completedAt: Date.now() - 6 * 86400000, order: 1 }),
    makeTask(pid, { title: 'Print the automation agreement prop', description: 'Three copies — one gets rained on in rehearsal.', status: 'todo', priority: 'high', due: addDaysStr(today, -1), sceneId: sceneIdx(2).id, assigneeId: sam.id, order: 2 }),
    makeTask(pid, { title: 'Source a hand-crank mechanism', description: 'Try the maritime museum or build one from a winch.', status: 'in-progress', priority: 'urgent', due: addDaysStr(today, 4), sceneId: sceneIdx(5).id, assigneeId: sam.id, order: 3 }),
    makeTask(pid, { title: 'Rehearse kitchen scene dialogue', status: 'todo', priority: 'medium', due: addDaysStr(today, 3), sceneId: sceneIdx(2).id, order: 4 }),
    makeTask(pid, { title: 'Charge camera batteries and clear cards', status: 'todo', priority: 'medium', due: addDaysStr(today, 6), assigneeId: marco.id, order: 5 }),
    makeTask(pid, { title: 'Book rain towers and wind machine', description: 'Waiting on the rental house to confirm water supply.', status: 'blocked', priority: 'high', due: addDaysStr(today, 5), sceneId: sceneIdx(4).id, order: 6 }),
    makeTask(pid, { title: 'Record coast guard radio voice-over', status: 'todo', priority: 'low', due: addDaysStr(today, 12), sceneId: sceneIdx(4).id, assigneeId: priya.id, order: 7 }),
    makeTask(pid, { title: 'Cut the Day 1 assembly', status: 'todo', priority: 'medium', due: addDaysStr(today, 4), order: 8 }),
  ]);

  await db.projects.update(pid, {
    isSample: true,
    stage: 'production',
    emergencyContacts: [
      { id: uid(), name: 'Cape Arden Coast Guard (sample)', role: 'Marine emergencies', phone: '555-0142' },
      { id: uid(), name: 'Sam Whitfield (sample)', role: 'Set safety officer', phone: '555-0199' },
    ],
    safetyNotes: 'Nearest hospital: St. Brigid’s, 18 minutes by road (sample). Tower capacity 10 people. Harnesses required on the gallery during rain rigs.',
    updatedAt: Date.now(),
  });
  await logActivity({ projectId: pid, action: 'created', entityType: 'project', entityId: pid, summary: 'Created the sample film “The Keeper’s Hour”' });
  return (await db.projects.get(pid))!;
}
