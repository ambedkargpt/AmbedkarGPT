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

/** The "General news" section of the news feed. Off: only party and opposition news. */
export const GENERAL_NEWS_ENABLED = false;

/** Where "home" is for a signed-in user: the news feed to write from. */
export const HOME_ROUTE = '/generate/social-media';
