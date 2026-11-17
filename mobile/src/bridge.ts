/**
 * The small amount of glue between the app and the game page. Kept apart from App.tsx so it
 * can be tested without a phone.
 */

/**
 * The address the game page believes it lives at. Nothing is fetched from it: the page is one
 * string. It gives the page a stable origin, which is what keeps its saved game between runs.
 */
export const BASE_URL = 'https://surf-game.app.local/';

/** Runs in the page before the game starts: tells it to use touch controls and that it is inside the app. */
export const BEFORE_LOAD = 'window.__SURF_TOUCH = true; window.__SURF_NATIVE = true; true;';

/** Runs in the page to pause the game. Safe to run before the game has loaded. */
export const PAUSE = 'try { window.__surf && window.__surf.pauseFromHost(); } catch (e) {} true;';

/** Only the game page itself may load in the web view. Anything else is a stray link. */
export function isGameUrl(url: string): boolean {
  return url === BASE_URL || url.startsWith(BASE_URL) || url === 'about:blank' || url.startsWith('about:srcdoc') || url.startsWith('data:text/html');
}
