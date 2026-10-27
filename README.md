# SCENEFORGE

**A personal film production studio.** Take a film from first idea to final shot: write the screenplay, break it into scenes, storyboard it, plan every shot, build characters, manage locations, props, cast and crew, schedule the shoot, run the set, and track the whole production.

SCENEFORGE runs entirely in your browser. Your projects are saved on your device as you work, with no account and no server.

**Live:** https://sceneforge-2hi3.onrender.com (a static site on Render that redeploys on every push to this branch). Projects you create there are stored in your own browser, not on the server.

---

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/ (static, deploy anywhere)
npm test           # unit and integration tests
npm run typecheck
```

The production build is a static site with relative paths and hash routing, so it works from any folder or static host (GitHub Pages, Netlify, an S3 bucket, a USB stick).

On first launch you can **start a new film**, **explore the sample film** (*The Keeper's Hour*), or **import an existing screenplay**.

---

## Feature status

### Built in and fully working (no external services)

| Area | What you get |
| --- | --- |
| **Studio dashboard** | Featured project hero, grid and list views, real completion %, upcoming filming days, outstanding and overdue tasks, recently edited scripts and scenes, quick access tiles, empty states, backup restore |
| **Film creation** | Guided wizard: title, cover (upload or generated poster), logline, synopsis, genres (including custom), runtime, language, audience, visual style, production type, filming dates, collaborators. Every optional step can be skipped |
| **Screenplay editor** | Automatic formatting for scene headings, action, characters, dialogue, parentheticals, transitions, shots and centered text; smart Enter/Tab; character and heading autocomplete; scene numbers; page breaks; word count; runtime estimate; find and replace; undo/redo; autosave; multiple drafts with duplicate and "production draft"; version history with compare and restore; revision colours; title page; conflict protection across tabs |
| **Import / export** | Fountain (`.fountain`, `.spmd`, `.txt`) and Final Draft (`.fdx`) import and export; screenplay PDF (Courier 12pt, industry margins, `(MORE)`/`(CONT'D)`, scene numbers, title page) |
| **Scenes** | Cards, compact list, script order and production order (drag to reorder), filters (location, character, status, filming date), readiness checks showing what blocks each scene |
| **Storyboard studio** | Frames per scene with shot type, angle, movement, action, audio, duration, transition and notes; image upload or a built-in sketch pad; drag-and-drop ordering; duplicate, move and delete; PDF export |
| **Shot list** | Every field from camera to priority; group by scene or filming day; bulk actions; PDF and CSV export from saved data |
| **On-set mode** | Phone-first screen with large controls: start, complete, reshoot, takes, notes, continuity flags, undo, and an optional screen wake lock |
| **Character studio** | Full profiles, portraits, aliases, casting, relationship map, consistency rules with automatic checks against the script |
| **Locations, props & wardrobe** | Location profiles with photos, access, availability and private contacts; inventories; a "blocked scenes" view for anything missing |
| **Cast & crew** | Roles, availability calendar, character assignments, scene participation matrix, and a "find filming dates" tool |
| **Production schedule** | Month, week, day and agenda views; drag-and-drop; automatic conflict detection (people and locations unavailable, double bookings); plan-by-location; call sheets with PDF export and print |
| **Tasks** | Board, list and calendar; filters; overdue highlighting without notifications; comments |
| **Asset library** | Real file storage (IndexedDB blobs, not temporary memory), folders, tags, search, previews for images, video, audio, PDF and text, and links to scenes, characters, frames and locations |
| **Production progress** | Stage track (Development → Pre-production → Production → Post-production → Completed) set by the owner; progress computed from real data, with the method shown; post-production checklist; missing-resource report |
| **Presentation mode** | Pitch, storyboard, screenplay pages, character profiles, scene breakdowns and shot lists; full screen, keyboard and swipe |
| **Activity & comments** | Activity history of every change, plus comment threads on scenes, shots, frames, characters, tasks and more |
| **Backup** | Export any project as a `.sceneforge` file (with files, optionally stripping private contact details) and import it on any device. Imports always create a copy, so they never overwrite work |
| **Search** | ⌘K / Ctrl+K command palette across projects, scenes, script text, characters, locations, people, shots, tasks, assets and events |
| **Design** | Dark (default) and light themes, responsive from phone to desktop |

### Requires your own external service

| Feature | Requirement |
| --- | --- |
| **AI filmmaking assistant** (optional) | Your own Anthropic API key, entered in Settings. The key is stored only in this browser and sent only to `api.anthropic.com`; usage is billed to your Anthropic account. The core tools never depend on it. Defaults to Claude Opus 5.5 (Sonnet 5.5 and Haiku 5.5 selectable). Server-side refusal fallbacks are enabled on Opus and Sonnet, so a declined request is retried on a fallback model instead of failing. The assistant reads your project (scenes, script, characters, shots, schedule, tasks) and can only *propose* changes: every proposal appears as a card marked "Suggestion — not applied" with a preview, and nothing changes until you press Apply. Applied suggestions can be undone; script revisions save a version first. |

### Not available in this build

| Feature | Notes |
| --- | --- |
| **Live multi-device collaboration and invitations** | Needs a sync server, which this build doesn't include. Team members and access roles are recorded for planning, assignments and call sheets. To share a project, export a `.sceneforge` backup and have a collaborator import it. |
| **AI image generation for storyboards** | No image service is connected. Use uploads or the built-in sketch pad. |
| **PDF screenplay import** | Export Fountain or Final Draft from your writing app instead. |

---

## How the pieces connect

- **The production draft drives the scene list.** Each scene heading you write becomes a scene. Editing a heading in the Scenes view rewrites it in the script, and reordering scenes in story order moves their script blocks.
- **Nothing is deleted behind your back.** Removing a heading from the script marks the scene "not in script" instead of deleting it, so its storyboards and shots are kept. Deleting a character keeps their dialogue. Every delete can be undone.
- **Relationships have one source of truth.** Characters present (scene), filming location (scene), required props (item), actor (character), scenes on a filming day (event). Readiness, conflicts, call sheets and progress are all computed from these.
- **Progress is measured, not guessed.** Script = pages against the target runtime (or "marked complete"); preparation = scenes ready to film; storyboard = scenes with frames; filming = completed shots; post = checklist. Parts with nothing to measure are left out.

## Data, privacy and limits

- All data lives in your browser's IndexedDB on this device. SCENEFORGE asks the browser for persistent storage so it isn't evicted.
- Images up to 25 MB; video, audio and documents up to 100 MB each. Supported: JPG, PNG, WebP, GIF, SVG, AVIF, MP4, WebM, MOV, MP3, WAV, OGG, M4A, AAC, FLAC, PDF, TXT, Markdown, CSV, Fountain, FDX, DOCX.
- Clearing your browser's site data deletes your projects, so export backups regularly.
- Contact details for locations and people are marked private. They're left out of presentations, and can be stripped from shared backups.

## Keyboard shortcuts

| Where | Keys |
| --- | --- |
| Anywhere | ⌘K / Ctrl+K search |
| Script editor | Enter (next element), Tab / Shift+Tab (change element), Alt+1–8 (set element type), ⌘/Ctrl+Z / Shift+⌘/Ctrl+Z (undo/redo), ⌘/Ctrl+F (find), ⌘/Ctrl+S (save a version) |
| Presentation | ← → Space (navigate), Home / End, F (full screen), Esc (exit) |

## Tech

React 19, TypeScript, Vite 7, Tailwind CSS 4, Dexie (IndexedDB), dnd-kit, Radix UI primitives, jsPDF, fflate, and the Anthropic TypeScript SDK (assistant only). Tests use Vitest with an in-memory IndexedDB.

```
src/
  app/          routing, workspace shell, command palette host
  components/   UI kit and shared domain components
  features/     one folder per screen (script, scenes, storyboard, shots, …)
  lib/
    data/       persistence: CRUD with activity log, deletes with undo, scripts,
                scenes, assets, backups, settings
    screenplay/ heading parsing, pagination, Fountain/FDX, script↔scene sync
    pdf/        screenplay, storyboard, shot list and call sheet exports
    ai/         optional assistant: context, tools, proposals
    sample/     the sample film
```
