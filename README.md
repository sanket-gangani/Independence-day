# Raise It Together — 15 August

An interactive Indian Independence Day morning. You walk into the courtyard of a
housing society just after seven, past the neighbours who have come down for the
function, up to the flagpole. You take the halyard, haul it hand over hand, and
the furled tricolour climbs the mast, releases, and opens. Marigolds shower out
of it, the crowd cheers, and you get a photograph you can send to the group.

Vanilla Three.js + Vite. No backend, no framework, static deploy, and **no
downloaded 3D assets at all** — every character, building, tree, texture and
material in the scene is generated in code at load time.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # -> dist/
```

## Controls

| Input | Action |
| --- | --- |
| `W` `S` / `↑` `↓` | Walk forward and back along your own facing |
| `A` `D` / `←` `→` | Turn |
| Drag | Orbit the camera. It does **not** change which way you walk |
| `E` / `Space` | Take the rope |
| Touch | Hold the lower half of the screen to walk, slide to steer |
| Touch | Tap **PULL THE ROPE**, or tap near the pole |

**One action, one motion.** Taking the rope starts a single continuous haul
that runs to the top on its own. There is nothing to press repeatedly. This
used to be six discrete pump strokes, which looked like someone working a hand
pump and made the player hammer a button for something they had already decided
to do — a real hoist at a society function is one long steady pull.

`pullPhase` drives the character's arms and the flag off the same eased curve,
so the tricolour is always exactly as far up the mast as the hands are down the
rope.

Movement is body-relative rather than camera-relative on purpose. With
camera-relative movement, looking around silently redefines which way "forward"
is, so a drag would send you off in a direction you never asked for.

---

## Sound

Starts on your first click, because browsers block audio before a gesture. The
morning ambience, the halyard, and the crowd are synthesised in the Web Audio
graph. For music, drop a file at `public/audio/theme.mp3` — see
[`public/audio/README.md`](public/audio/README.md), which also explains why
"Maa Tujhhe Salaam" cannot be bundled here.

---

## The date, the time and the place

The poster carries the real instant the flag reached the top of the pole, on
your own clock, with the actual date. The place is an optional field on the
title card rather than a geolocation prompt: the Geolocation API returns
coordinates, not a place name, and turning those into "Bengaluru" means sending
your exact position to a third-party geocoder for the sake of a caption. Typing
it is both more private and more accurate. Leave it blank and the poster reads
fine on the date and time alone.

---

## The two things this project is actually about

### 1. The people are built, not imported

Earlier versions used stock rigged models from the three.js examples — a sci-fi
robot and two western mocap dummies. No amount of retexturing makes those read
as residents of an Indian society, and a saree has a silhouette that a
retextured T-shirt cannot fake.

So `src/world/people.js` builds every person from scratch: kurta-pyjama, saree
with a draped pallu, salwar-kameez with a dupatta, dhoti with a gamcha, school
uniforms, shirts and trousers, frocks, jeans. Height, build, age, skin, hair,
facial hair, spectacles, what they are holding and what they are doing with
their hands are independent axes, so sixty people are sixty people.

Faces are drawn per-variant onto a canvas in `src/core/faces.js` and mapped with
an azimuthal projection taken from straight in front of the head, so the face
occupies the middle of the texture instead of a squashed strip down one side.

Cost is kept down by merging everything that shares a node into one draw call
against a single vertex-coloured material. The left arm bakes its elbow bend
into the geometry and is a single rigid mesh; the right arm gets a real elbow,
which costs one extra draw call per person and buys the pose the whole ending
depends on. A salute is roughly 130 degrees of elbow flexion with the hand at
the brow, and a rigid arm bent 24 degrees cannot make that shape — swinging the
shoulder instead produces someone pointing vaguely at their own ear.

### 2. Nobody floats

This is enforced in three places rather than eyeballed:

- Each body is assembled feet-first, then its finished bounding box is measured
  and the root offset so the lowest vertex sits at exactly `y = 0`. That offset
  is returned as `footOffset`, and callers **add** it rather than overwriting
  `position.y`.
- Every crowd member is raycast onto the real ground mesh, placed, and then
  re-measured against that surface; anything more than a millimetre out is
  corrected and counted.
- The player runs a foot solve every frame: pose the skeleton, ask both feet
  where they ended up in world space, and move the body so the lower one rests
  on the ground. No skating, no sinking, at any speed.

In dev, `__game.auditFeet()` prints anybody who is off the ground. It should
always print nothing.

---

## The hoist

The sequence is modelled the way it actually happens, not as one animation.

```
FURLED   the tricolour is rolled into a bundle, tied with a slip knot, with
         marigolds folded inside it
RISING   the bundle climbs in one continuous haul
RELEASE  at the top the knot slips and the ties fall away
UNFURL   the cloth peels open along its length and catches the wind
FLOWERS  the marigolds shower out, then tricolour confetti
CROWD    the courtyard comes to attention and salutes
```

**The rope is real.** A halyard is a closed loop: one run comes down the front
of the pole to haul on, over a pulley at the top, and the other run comes down
carrying the flag. Both are swept tubes rebuilt every frame from a curve, in
white nylon — which is what a flagpole halyard actually is, and which is the
only way the rope stays visible against both the paving and the crowd.

**The hands are the authority, not the rope.** `player.handWorld()` reports
where the grip actually is each frame and the working rope is rebuilt through
that point, so the connection is exact by construction rather than a pose that
happens to look close.

**Unfurling is a travelling wave.** `uOpen` sweeps a release front from the
hoist edge out to the fly end, so the cloth opens progressively the way fabric
does when a knot lets go. The constants in `releaseAt()` are load-bearing: at
`uOpen = 1` the front must clear `uv.x = 1` by a full `1/SLOPE`, or the fly end
stays rolled and the Ashoka Chakra never becomes visible.

**The crowd salutes.** Not a stadium celebration: when the tricolour opens,
most of the courtyard comes to attention and the hand goes to the brow, which is
what actually happens on 15 August. Around that, people holding little flags
raise them and salute round them, a few elders fold their hands, some children
clap, and one or two people are filming. The salute angles were solved
numerically against the real rig rather than guessed — `SALUTE_SHOULDER` and
`SALUTE_ELBOW` put the fingertips within about four millimetres of the temple.

**The flag is one texture, or it does not exist.** The tricolour and its
24-spoke chakra — spindle spokes, hub, both rims, the 24 rim beads — are drawn
as a single canvas in `makeFlagTexture()`. There is no separate chakra sprite
that could arrive late or land off-centre.

---

## The light

Half past seven on an August morning, pinned tightly in `src/world/sky.js`. Sun
elevation stays between 15° and 26°: below that the sun stops reaching a
horizontal surface and the courtyard goes flat and blue however warm the light
colour is, above it the shadows shorten and it starts looking like noon.

Everything that changes over the experience — sky gradient, horizon haze, fog,
sun elevation, key colour and intensity, hemisphere fill, ground tint, exposure,
bloom — is keyframed against a single `0..1` progress value that `main.js`
drives from the hoist.

---

## How it fits together

```
src/
  main.js               state machine, the pull, cinematic cameras
  core/
    renderer.js         render + post chain (bloom -> tonemap -> grade)
    textures.js         every texture, drawn procedurally on canvas
    faces.js            head geometry, face projection, painted faces
    rng.js              seeded randomness — the scene is the same every reload
  world/
    people.js           the procedural human: bodies, clothing, poses
    crowd.js            family clusters, ground placement, reactions
    player.js           you: jointed legs, walk cycle, foot solve, the haul
    plaza.js            paving, road, kerbs, garden beds, rangoli, ground height
    society.js          apartment blocks, compound wall, gate, trees, vehicles
    ceremony.js         table, portraits, banner, chairs, PA, bunting, garlands
    flag.js             pole, pulley, halyard, furled bundle, cloth
    sky.js              sky dome, sun, lights, the morning
    petals.js           marigold and confetti bursts
  player/controls.js    input, locomotion, third-person camera
  ui/ui.js              screens, prompt, haul button, hoist meter
  share/poster.js       the shareable photograph
```

`public/portraits/` holds the framed photographs used on the ceremonial table.
No likeness is ever synthesised — a procedurally faked face of a national figure
would be both crude and disrespectful — so if a file is missing, the frame falls
back to a neutral sepia card and the name plate underneath still reads
correctly. Photographs of Gandhi taken before 1948 are generally public domain
in India (life + 60 years); source them properly.

### Post-processing order matters

`Render -> Bloom -> OutputPass -> Grade`.

The grade runs *after* tone mapping, on LDR values. Run it before, on the HDR
buffer, and its contrast curve gets evaluated at `c > 1` where the smoothstep
polynomial turns negative — the brightest channel clamps to zero and the sun
picks up a cyan core.

---

## Mobile

Most people will meet this on a phone, so the phone is the case that had to be
right rather than the one that got what was left over. `src/core/quality.js`
picks a tier from screen size, pointer type, core count and the memory hint,
and that tier changes what gets *built*, not just how it is drawn: pixel ratio,
shadow map size, and how many people are in the courtyard. Layout uses `dvh` so
nothing hides under a collapsing address bar, inputs are 16px so iOS does not
zoom on focus, and the only control the player ever has to hit is a full-width
pill at the bottom of the screen.

## Sharing

One button, calling `navigator.share` with the rendered JPEG attached. That
opens the operating system's own sheet — WhatsApp, Instagram, Telegram,
Messages, Mail, AirDrop, whatever is installed — and hands over the real image.

The message that goes with it carries a link:

```
Sanket hoisted the flag 🇮🇳
Bengaluru · 15 August 2026, 7:42 am

Your turn — walk up to the pole and pull the rope yourself:
https://your-domain/
```

So the photograph and the invitation travel together: WhatsApp shows the image
with that caption underneath and the URL tappable. A picture on its own stops
with whoever receives it; the link keeps going.

The URL is embedded in the message body rather than passed as
`navigator.share({ url })`, because share targets differ on whether they use
the `url` field, concatenate it, or drop it — putting it in the text is the
only way to know exactly what lands in the message.

### The link preview

`index.html` carries Open Graph and Twitter card tags, with a real 1200×630
frame of the ceremony at `public/share-card.jpg`, so the bare link previews
with a thumbnail wherever it is pasted.

`og:image` **must be absolute** — WhatsApp will silently show no thumbnail
rather than resolve a relative one. The origin is substituted into
`%SITE_URL%` at build time by a small plugin in `vite.config.js`, which reads,
in order:

| Variable | Where it comes from |
| --- | --- |
| `SITE_URL` | set it yourself, e.g. `https://example.com` |
| `VERCEL_PROJECT_PRODUCTION_URL` | Vercel's stable production domain |
| `VERCEL_URL` | Vercel's per-deployment URL |

On Vercel this needs no configuration. Anywhere else, set `SITE_URL` before
building, or the tags fall back to root-relative paths — fine for a root
deploy, but not guaranteed to preview.

There is deliberately no per-app button. No app-scheme URL can carry an
attachment, so a hand-rolled WhatsApp link could only ever have passed text.

The Share button is **never hidden**. An earlier version removed it wherever
`navigator.share` was missing — which is most desktop browsers — and the result
was people looking at the poster wondering where the share option had gone. It
is always there; on a browser with no share sheet it saves the image instead
and says so on the button.

The file is decoded synchronously from the poster's data URL rather than going
through `canvas.toBlob`. `toBlob` defers its callback to a task, and a tab that
is not currently being composited can sit on that task indefinitely, which
presented as a Share button that did nothing at all.

## First paint

`index.html` carries a block of critical CSS inline in `<head>`, duplicated
from `style.css`. The stylesheet is imported from JavaScript, so there is a
window on first load — and on every dev-server reload — where the browser has
the markup but not the rules, and it paints every screen in the document at
once, stacked, in Times New Roman. The inline block is the minimum needed for
that first frame to be the loading screen and nothing else. If you change one
of those rules, change both.

## Deploying

Push the repo and import it on Vercel; `vercel.json` already sets the build
command, output directory and asset caching. Or:

```bash
npx vercel --prod
```

## Tuning

In dev, `window.__game` is exposed (stripped from production builds):

```js
__game.skipToRope()      // stand at the halyard
__game.haul()            // one stroke
__game.finish()          // jump straight to the unfurl
__game.advance(3.0)      // run the world forward at a fixed timestep
__game.auditFeet()       // list anybody whose feet are off the ground
```

`advance()` matters more than it looks: a browser tab that is not being
composited stops delivering animation frames, so stepping the sequence by hand
is the only way to inspect the hoist reliably in an automated browser.
