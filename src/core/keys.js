/**
 * Is the person typing into something right now?
 *
 * This game listens for keys on `window` and calls `preventDefault()` on the
 * ones it uses — W, A, S, D, E, space and the arrows. That is correct while
 * you are walking around a courtyard, and completely wrong while you are
 * filling in the name and place fields on the title card: every one of those
 * keystrokes was being swallowed before it reached the input, so "Bengaluru"
 * came out "Bengluru" and a name like "Sandeep" lost two letters.
 *
 * Every global key handler asks this first.
 */
export function isTyping(target) {
  const el = target;
  if (!el || typeof el.tagName !== 'string') return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select';
}
