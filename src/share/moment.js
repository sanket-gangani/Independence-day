/**
 * When and where this happened.
 *
 * The poster used to carry a hardcoded "Shanti Nagar, 7:42 am", which is a
 * caption for a scene rather than a record of something you did. This captures
 * the real instant the flag reached the top of the pole, on the player's own
 * clock, in their own locale.
 *
 * ON LOCATION
 * -----------
 * There is no geolocation call here, deliberately. The browser's Geolocation
 * API gives coordinates, not a place name, and turning coordinates into
 * "Bengaluru" means posting the player's exact position to a third-party
 * geocoding service — for a caption. So the place is simply asked for: an
 * optional field on the title card. Left blank, the poster carries the date
 * and time alone and reads perfectly well without it.
 *
 * The IANA time zone is used only as a *hint* for the placeholder, and only
 * where the zone actually names one city's region rather than a whole country.
 */

/** A few zones where the zone name is a fair guess at the nearest big city. */
const ZONE_HINTS = {
  'Asia/Kolkata': '',
  'Asia/Calcutta': '',
};

export function placeHint() {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    if (zone in ZONE_HINTS) return ZONE_HINTS[zone];
    // "Europe/Lisbon" -> "Lisbon", "America/New_York" -> "New York".
    const city = zone.split('/').pop();
    return city ? city.replace(/_/g, ' ') : '';
  } catch {
    return '';
  }
}

/**
 * Snapshots the current moment.
 * @param {string} place optional, whatever the player typed
 */
export function captureMoment(place = '') {
  const now = new Date();

  // Built by hand rather than through Intl. Depending on the locale, Intl
  // returns "17:07", or "5:07 pm" with a narrow no-break space that canvas
  // draws as a box, or — as it did here — a 12-hour clock with the am/pm
  // marker dropped entirely, which turns five in the evening into five in the
  // morning. A caption on a photograph has to be unambiguous.
  const h24 = now.getHours();
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const time = `${((h24 + 11) % 12) + 1}:${minutes} ${h24 < 12 ? 'am' : 'pm'}`;

  let dateLong;
  let dateCaps;
  try {
    dateLong = new Intl.DateTimeFormat(undefined, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(now);
    dateCaps = dateLong.toUpperCase();
  } catch {
    dateLong = now.toDateString();
    dateCaps = dateLong.toUpperCase();
  }

  const trimmed = place.trim().slice(0, 32);

  return {
    date: now,
    /** "15 August 2026" */
    dateLong,
    /** "15 AUGUST 2026", for the poster's spaced-out caps line */
    dateCaps,
    /** "7:42 am" */
    time,
    /** whatever they typed, or '' */
    place: trimmed,
    /** "Shanti Nagar · 7:42 am" or just "7:42 am" */
    stamp: trimmed ? `${trimmed} · ${time}` : time,
    /** "Shanti Nagar · 15 August 2026, 7:42 am" */
    full: [trimmed, `${dateLong}, ${time}`].filter(Boolean).join(' · '),
  };
}
