import { questionLabel } from '../i18n/preferenceOptions';

// UI-only display metadata per question_id — labels and hints are not stored
// in the DB, so the ids map to i18n keys here. Falls back gracefully for
// unknown ids, which then show the question's own text from the DB.
const META_KEYS = {
  profile_user_role:               'qmeta.userRole',
  profile_tone:                    'qmeta.tone',
  profile_target_audience:         'qmeta.audience',
  profile_primary_focus:           'qmeta.focus',
  profile_ambedkarite_perspective: 'qmeta.perspective',
  profile_content_length:          'qmeta.length',
  profile_call_to_action:          'qmeta.cta',
};

// Party questions are party_<party>_q<n>, and the label comes from the number
// alone: the ten are worded identically for every party, only the options
// differ. Their own question text is a full sentence, too long for a label in
// a sidebar this narrow, so it becomes the hint underneath instead.
//
// The party is matched loosely rather than listed. Naming inc and bsp was
// already wrong once: Samajwadi was added later, party_sp_q1 matched nothing,
// and those questions silently fell through to the generic branch that draws
// the whole sentence as the label.
const PARTY_Q = /^party_[a-z]+_q(\d{1,2})$/;

// Position questions are pos_<party>_<group>_q<n>, five per level.
//
// Unlike the party ten, these are not worded identically across levels — a
// district question asks about local detail where the national one asks how to
// present a position — so the short label names what the question is *for*
// rather than restating it, and the question's own sentence sits underneath as
// the hint. Same treatment as the party set, for the same reason: the full
// text is too long to be a label in a sidebar this narrow.
const POSITION_Q = /^pos_[a-z]+_[a-z_]+_q([1-5])$/;

export function getMeta(questionId, questionText, t, lang) {
  const party = PARTY_Q.exec(questionId);
  if (party) return { label: t(`qmeta.partyQ${party[1]}`), hint: questionText };

  const position = POSITION_Q.exec(questionId);
  if (position) return { label: t(`qmeta.posQ${position[1]}`), hint: questionText };

  const key = META_KEYS[questionId];
  if (!key) return { label: questionLabel(questionText, lang), hint: '' };
  return { label: t(`${key}.label`), hint: t(`${key}.hint`) };
}
