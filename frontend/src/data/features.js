// Which parts of the signed-in app are switched on.
//
// The people this is for are senior party workers who want to write a post,
// not explore a dashboard or tune fifteen preferences. So the dashboard and
// the preference controls are switched off, not deleted: their code stays,
// and turning a flag back on brings them back.

/** The dashboard. Off: /dashboard opens the news feed instead. */
export const DASHBOARD_ENABLED = false;

/**
 * The preference questions in the generator's side panel, the phone sheet and
 * the Preferences page link. Off: every question takes its default on the
 * server, picked per party and role, so nobody has to answer anything.
 */
export const PREFERENCES_ENABLED = false;

/** Where "home" is for a signed-in user: the news feed to write from. */
export const HOME_ROUTE = '/generate/social-media';

/**
 * The Manusmriti section (a trial): short posts that criticise what the text itself says, each built on a
 * verse. On while developing (`vite dev`); in a production build only when it is built with
 * VITE_MANUSMRITI_SECTION=true. The server has its own switch, TRIAL_MANUSMRITI_CRITIQUE, and both must be on
 * for the page to have anything to show.
 *
 * To remove the trial: delete pages/Manusmriti.jsx, components/manusmriti/, data/manusmriti*.js,
 * api/manusmriti.js and the lines that mention MANUSMRITI_SECTION_ENABLED (App.jsx, Navbar.jsx).
 */
export const MANUSMRITI_SECTION_ENABLED =
  import.meta.env.DEV || import.meta.env.VITE_MANUSMRITI_SECTION === 'true';
