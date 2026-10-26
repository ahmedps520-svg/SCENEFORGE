/**
 * Development-only console helpers (window.__sceneforge) used for automated
 * UI checks. Not included in production builds.
 */
import { db } from './db';
import * as assets from './data/assets';
import * as crud from './data/crud';
import * as deletes from './data/deletes';
import * as factories from './data/factories';
import * as projects from './data/projects';
import * as scenes from './data/scenes';
import * as scripts from './data/scripts';
import * as settings from './data/settings';
import { parseFountain } from './screenplay/fountain';

export function install() {
  (window as unknown as Record<string, unknown>).__sceneforge = {
    db,
    ...assets,
    ...crud,
    ...deletes,
    ...factories,
    ...projects,
    ...scenes,
    ...scripts,
    ...settings,
    parseFountain,
    sample: () => import('./sample/sample').then((m) => m.createSampleProject()),
  };
}
