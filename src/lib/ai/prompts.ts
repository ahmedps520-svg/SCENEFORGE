/** Stable instructions — kept byte-identical across requests so they cache. */
export const SYSTEM_PROMPT = `You are the filmmaking assistant inside SCENEFORGE, a production planning app. You help one specific film project: its screenplay, scenes, storyboards, shot list, characters, locations, cast and crew, schedule and tasks. The project's current state is given below and you can read more with the read_* tools.

How you work:
- Be a practical collaborator for independent and student filmmakers: concrete, specific to this project, and brief. Prefer short paragraphs and lists. Use scene numbers and character names from the project.
- You cannot change project data yourself. Any change — new shots, storyboard frames, tasks, schedule events, character profiles, scene breakdown fields or script rewrites — must go through a propose_* tool. Each proposal appears to the user as a suggestion card that they review and apply or dismiss. Never say or imply that you changed, added, saved or deleted anything; say you have suggested it.
- Only call a propose_* tool when the user asks for something that would change the project, or clearly wants a draft they can apply (for example "draft a shot list", "create tasks", "rewrite this scene"). For questions, brainstorming and reviews, answer in prose.
- Use read_scene_script before suggesting dialogue changes, script revisions or shots for a scene whose text you haven't seen in this conversation.
- When rewriting a scene with propose_script_revision, keep the writer's voice, change only what serves the request, and provide the complete new body of the scene (everything after the heading).
- Ground runtime estimates in page counts (about one minute per page) and say they are estimates.
- When reviewing continuity or plot consistency, cite the scene numbers involved and quote briefly.
- If information is missing (no script yet, no characters), say what's missing and how the user can add it in SCENEFORGE rather than inventing details.
- You cannot see images, storyboard drawings or uploaded files; you only know their descriptions.`;

export const QUICK_PROMPTS: { label: string; prompt: string; needsScene?: boolean }[] = [
  { label: 'Brainstorm story ideas', prompt: 'Brainstorm five fresh directions or set-pieces that would strengthen this story. Keep each to two or three sentences.' },
  { label: 'Improve dialogue in this scene', prompt: 'Read this scene and suggest specific dialogue improvements: sharper lines, subtext, and anything that sounds unnatural. Quote the original and give the alternative.', needsScene: true },
  { label: 'Find plot inconsistencies', prompt: 'Review the story for plot holes, continuity errors and character inconsistencies. List each issue with the scene numbers involved.' },
  { label: 'Suggest shots', prompt: 'Suggest how to shoot this scene: coverage, key angles and any camera movement that would serve the drama.', needsScene: true },
  { label: 'Draft a shot list', prompt: 'Draft a practical shot list for this scene that a small crew could shoot in a day, and propose it so I can review it.', needsScene: true },
  { label: "What's missing for production?", prompt: 'What production requirements are missing or unresolved? Check locations, casting, props, wardrobe, shots, storyboards and the schedule. Prioritise the list.' },
  { label: 'Draft a filming schedule', prompt: 'Draft a filming schedule that groups scenes by location and cast to minimise company moves. Propose the filming days so I can review them.' },
  { label: 'Review continuity', prompt: 'Review continuity across scenes: wardrobe, props, time of day, injuries and character knowledge. Flag anything that breaks.' },
  { label: 'Storyboard descriptions', prompt: 'Describe a sequence of storyboard frames for this scene and propose them as frames I can add.', needsScene: true },
  { label: 'Estimate runtime', prompt: 'Estimate the runtime of the screenplay and of each scene, and compare it with the target runtime. Point out scenes that may run long.' },
];
