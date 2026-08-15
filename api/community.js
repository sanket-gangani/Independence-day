/**
 * Community state, shared across everyone on the link.
 *
 * Storage is behind a tiny adapter. With Vercel KV / Upstash env vars present
 * it uses Redis; without them it falls back to an in-memory map so `vercel dev`
 * and preview deploys work out of the box. The in-memory path is per-instance
 * and will not survive a cold start — it is for development, not production.
 *
 * Set on the project to go live:
 *   KV_REST_API_URL, KV_REST_API_TOKEN
 */

const memory = new Map();

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const useKv = Boolean(KV_URL && KV_TOKEN);

const MAX_NAMES = 500;
const VALID_SLUG = /^[a-z0-9-]{1,40}$/;

async function kv(command) {
  const res = await fetch(`${KV_URL}/${command.map(encodeURIComponent).join('/')}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
  });
  if (!res.ok) throw new Error(`kv ${res.status}`);
  const body = await res.json();
  return body.result;
}

async function readCommunity(slug) {
  if (!useKv) return memory.get(slug) || null;
  const raw = await kv(['get', `community:${slug}`]);
  return raw ? JSON.parse(raw) : null;
}

async function writeCommunity(slug, data) {
  if (!useKv) {
    memory.set(slug, data);
    return;
  }
  await kv(['set', `community:${slug}`, JSON.stringify(data)]);
}

function fresh(slug, name, target) {
  return {
    slug,
    name: name || 'Your Community',
    target: clampTarget(target),
    count: 0,
    names: [],
    createdAt: Date.now(),
  };
}

function clampTarget(t) {
  const n = Number(t);
  if (!Number.isFinite(n)) return 100;
  return Math.min(500, Math.max(5, Math.round(n)));
}

/** First names only, and nothing that could be used to inject markup. */
function cleanName(value) {
  return String(value || '')
    .replace(/[<>&"'`\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 24);
}

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');

  const slug = String(req.query?.slug || (req.body && req.body.slug) || '').toLowerCase();
  if (!VALID_SLUG.test(slug)) {
    res.status(400).json({ error: 'bad slug' });
    return;
  }

  try {
    if (req.method === 'GET') {
      const data = (await readCommunity(slug)) || fresh(slug, '', 100);
      res.status(200).json(data);
      return;
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
      const name = cleanName(body.name);
      const childName = cleanName(body.childName);

      if (!name) {
        res.status(400).json({ error: 'name required' });
        return;
      }

      const data = (await readCommunity(slug)) || fresh(slug, body.name, body.target);
      // The community's display name is set by whoever creates it.
      if (!data.names.length && body.name) data.name = cleanName(body.name) || data.name;

      if (data.names.length < MAX_NAMES) {
        data.names.push({ name, childName });
        data.count = data.names.length;
      }

      await writeCommunity(slug, data);
      res.status(200).json(data);
      return;
    }

    res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    console.error('community handler failed', err);
    res.status(500).json({ error: 'storage unavailable' });
  }
}
