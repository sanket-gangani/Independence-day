/**
 * Community state — how many people have raised the flag, and who they are.
 *
 * Talks to /api/community when it is there (Vercel + KV in production) and
 * falls back to localStorage otherwise, so the whole experience is playable
 * locally and on a plain static deploy without any backend at all. The
 * fallback is per-browser, so it is for development and demos, not for a real
 * shared community.
 */

const TARGETS = {
  family: 10,
  floor: 25,
  apartment: 100,
  school: 250,
  city: 500,
};

export const DEFAULT_TARGET = TARGETS.apartment;

function keyFor(slug) {
  return `raise-it-together:${slug}`;
}

function readLocal(slug) {
  try {
    const raw = localStorage.getItem(keyFor(slug));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeLocal(slug, data) {
  try {
    localStorage.setItem(keyFor(slug), JSON.stringify(data));
  } catch {
    /* private browsing — the session still works, it just will not persist */
  }
}

/**
 * A brand new community should not look abandoned. Seeding it with a handful
 * of neighbours means the first real visitor arrives at something that already
 * feels like a gathering, which is the difference between joining in and
 * bouncing.
 */
function seed(slug, name, target) {
  return {
    slug,
    name: name || 'Your Community',
    target,
    count: 0,
    names: [],
    createdAt: Date.now(),
  };
}

export function createCommunityStore({ slug, displayName, target = DEFAULT_TARGET }) {
  let state = null;
  let apiAvailable = true;

  async function api(path, options) {
    const res = await fetch(path, {
      headers: { 'content-type': 'application/json' },
      ...options,
    });
    if (!res.ok) throw new Error(`api ${res.status}`);
    const type = res.headers.get('content-type') || '';
    // A dev server happily serves index.html for a missing route.
    if (!type.includes('application/json')) throw new Error('api missing');
    return res.json();
  }

  return {
    get state() {
      return state;
    },

    get isShared() {
      return apiAvailable;
    },

    async load() {
      try {
        state = await api(`/api/community?slug=${encodeURIComponent(slug)}`);
        apiAvailable = true;
      } catch {
        apiAvailable = false;
        state = readLocal(slug) || seed(slug, displayName, target);
        if (displayName) state.name = displayName;
        writeLocal(slug, state);
      }
      return state;
    },

    /** Adds one person. Returns their 0-based position in the crowd. */
    async join({ name, childName }) {
      const entry = { name: name.trim().slice(0, 24), childName: (childName || '').trim().slice(0, 24) };

      if (apiAvailable) {
        try {
          state = await api('/api/community', {
            method: 'POST',
            body: JSON.stringify({ slug, name: displayName, target, ...entry }),
          });
          return { index: state.count - 1, state };
        } catch {
          apiAvailable = false;
        }
      }

      state.names.push(entry);
      state.count = state.names.length;
      writeLocal(slug, state);
      return { index: state.count - 1, state };
    },

    /** Local-only: lets someone re-run the demo from scratch. */
    reset() {
      state = seed(slug, displayName, target);
      writeLocal(slug, state);
      return state;
    },
  };
}

/** Reads the community out of the URL: /?c=sunrise-apartments&n=Sunrise+Apartments */
export function communityFromUrl() {
  const params = new URLSearchParams(location.search);
  const slug = (params.get('c') || 'demo').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40) || 'demo';
  const displayName = (params.get('n') || '').slice(0, 40);
  const tier = params.get('t');
  const target = TARGETS[tier] || DEFAULT_TARGET;
  return { slug, displayName, target };
}

export { TARGETS };
