import * as THREE from 'three';
import { rng } from '../core/rng.js';
import { buildPerson, rollPerson, makeBehaviour } from './people.js';

/**
 * The audience.
 *
 * Two things make a crowd believable, and neither of them is polygon count.
 *
 * FAMILIES, NOT A GRID. People arrive together and stand together. The crowd
 * is built as a set of small groups — a couple with two children, three
 * uncles, a knot of teenagers, a grandmother with a grandchild — each dropped
 * at its own distance and angle, its members packed shoulder to shoulder
 * inside the group and a clear gap between groups. That reads as an audience.
 * An even spread reads as spawn points.
 *
 * NOBODY FLOATS. Every person is raycast onto the actual ground mesh from
 * above and placed at the hit point, then the result is verified: the lowest
 * vertex of the assembled body must sit within a millimetre of the surface.
 * The check runs over the finished crowd at boot and reports, so a regression
 * here is loud rather than something you notice in a screenshot later.
 */

const CLUSTER_TYPES = [
  { name: 'family', members: ['adult-m', 'adult-f', 'child', 'child'] },
  { name: 'family', members: ['adult-f', 'child', 'toddler'] },
  { name: 'family', members: ['adult-m', 'adult-f', 'child'] },
  { name: 'elders', members: ['elder-m', 'elder-m'] },
  { name: 'elders', members: ['elder-f', 'elder-f', 'adult-f'] },
  { name: 'uncles', members: ['adult-m', 'adult-m', 'adult-m'] },
  { name: 'aunties', members: ['adult-f', 'adult-f'] },
  { name: 'teens', members: ['teen', 'teen', 'teen'] },
  { name: 'pair', members: ['adult-m', 'child'] },
  { name: 'pair', members: ['adult-f', 'teen'] },
  { name: 'single', members: ['adult-m'] },
  { name: 'single', members: ['adult-f'] },
  { name: 'kids', members: ['child', 'child', 'child'] },
];

function specFor(token, r) {
  switch (token) {
    case 'adult-m': return rollPerson(r, { age: 'adult', female: false });
    case 'adult-f': return rollPerson(r, { age: 'adult', female: true });
    case 'elder-m': return rollPerson(r, { age: 'elder', female: false });
    case 'elder-f': return rollPerson(r, { age: 'elder', female: true });
    case 'child': return rollPerson(r, { age: 'child' });
    case 'toddler': return rollPerson(r, { age: 'toddler' });
    case 'teen': return rollPerson(r, { age: 'teen' });
    default: return rollPerson(r);
  }
}

export function createCrowd(scene, { ground, count = 58, seed = 20260815 } = {}) {
  const r = rng(seed);
  const group = new THREE.Group();
  group.name = 'crowd';
  scene.add(group);

  const people = [];
  const behaviours = [];
  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const from = new THREE.Vector3();

  // Raycasting reads world matrices; it does not compute them. Without this the
  // courtyard is still sitting at its identity matrix — nothing has rendered
  // yet — so every ray reports the ground at y = 0 and the entire crowd gets
  // buried 14 cm into the paving, consistently enough that the verification
  // pass below agrees with it.
  scene.updateMatrixWorld(true);

  /** The honest answer to "where is the floor here". */
  function surfaceAt(x, z) {
    if (ground?.colliders?.length) {
      from.set(x, 8, z);
      ray.set(from, down);
      const hits = ray.intersectObjects(ground.colliders, false);
      if (hits.length) return hits[0].point.y;
    }
    return ground?.heightAt ? ground.heightAt(x, z) : 0;
  }

  // --- lay out the groups --------------------------------------------------
  //
  // A horseshoe opening toward +Z, which is where the player walks in from.
  // The lane between the player and the pole, and the ground right at the
  // rope, are both left clear so the ceremony is never obstructed.

  const spots = [];
  let guard = 0;
  while (spots.length < count && guard++ < 900) {
    const type = r.pick(CLUSTER_TYPES);
    const angle = r.range(-2.75, 2.75);
    // Keep the approach lane and the flag's foreground open.
    if (Math.abs(angle) < 0.46) continue;
    // Biased toward the front: a real audience packs in close to the thing it
    // came to see and thins out behind, rather than forming an even ring.
    const radius = 3.7 + Math.pow(r(), 1.7) * 8.6;
    const cx = Math.sin(angle) * radius;
    const cz = Math.cos(angle) * radius;
    // Not on the dais, not in the chairs.
    if (cz < -4.6 && Math.abs(cx) < 5.2) continue;

    const spread = 0.34 + type.members.length * 0.13;
    type.members.forEach((token, i) => {
      if (spots.length >= count) return;
      const a = angle + (i - (type.members.length - 1) / 2) * (spread / radius) * 2.4;
      const rad = radius + r.range(-0.42, 0.42);
      spots.push({
        token,
        x: Math.sin(a) * rad + r.range(-0.12, 0.12),
        z: Math.cos(a) * rad + r.range(-0.12, 0.12),
        // Groups face the pole, but each person is off by their own few degrees
        // and the ones at the back crane past the person in front.
        wobble: r.range(-0.42, 0.42),
        chatty: type.name === 'uncles' || type.name === 'teens' || type.name === 'aunties',
      });
    });
  }

  // Spacing pass: nobody standing inside anybody else.
  for (let pass = 0; pass < 4; pass++) {
    for (let i = 0; i < spots.length; i++) {
      for (let j = i + 1; j < spots.length; j++) {
        const dx = spots[j].x - spots[i].x;
        const dz = spots[j].z - spots[i].z;
        const d = Math.hypot(dx, dz);
        const min = 0.56;
        if (d > 1e-4 && d < min) {
          const push = (min - d) / 2 / d;
          spots[i].x -= dx * push;
          spots[i].z -= dz * push;
          spots[j].x += dx * push;
          spots[j].z += dz * push;
        }
      }
    }
  }

  // --- build ---------------------------------------------------------------

  let floated = 0;
  for (const spot of spots) {
    const spec = specFor(spot.token, r);
    if (spot.chatty && r.chance(0.5)) spec.activity = 'talk';

    const person = buildPerson(spec, { legs: false, detail: 0 });
    const y = surfaceAt(spot.x, spot.z);
    // Add the body's own foot offset rather than overwriting y — assigning
    // straight to position.y is precisely how a crowd ends up hovering.
    person.root.position.set(spot.x, y + person.footOffset, spot.z);
    person.root.rotation.y = Math.atan2(-spot.x, -spot.z) + spot.wobble;

    // People at the back stand on tiptoe of the terrain, not in the air:
    // verify against the real geometry rather than trusting the placement.
    person.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(person.root);
    const gap = box.min.y - y;
    if (Math.abs(gap) > 0.001) {
      person.root.position.y -= gap;
      if (Math.abs(gap) > 0.02) floated++;
    }

    group.add(person.root);
    people.push(person);
    behaviours.push(makeBehaviour(person, r));
  }

  if (floated) console.warn(`[crowd] corrected ${floated} placements that were off the ground`);

  let react = 0;
  let shown = 0;
  let hoist = 0;

  return {
    group,
    people,
    behaviours,
    count: people.length,

    /** 0 = waiting quietly, 1 = the flag is up and they know it. */
    setReaction(v) {
      react = THREE.MathUtils.clamp(v, 0, 1);
    },
    /** Lets the crowd's eyeline track the flag on its way up. */
    setHoist(v) {
      hoist = THREE.MathUtils.clamp(v, 0, 1);
    },

    update(dt, time) {
      shown = THREE.MathUtils.damp(shown, react, 2.6, dt);
      for (let i = 0; i < behaviours.length; i++) {
        behaviours[i].update(time + i * 0.37, shown, hoist);
      }
    },

    /** Development check: reports anybody whose feet are not on the ground. */
    audit() {
      const bad = [];
      const box = new THREE.Box3();
      for (const p of people) {
        box.setFromObject(p.root);
        const y = surfaceAt(p.root.position.x, p.root.position.z);
        if (Math.abs(box.min.y - y) > 0.01) bad.push({ p, gap: box.min.y - y });
      }
      return bad;
    },
  };
}
