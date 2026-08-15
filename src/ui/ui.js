/**
 * Thin wrapper over the markup.
 *
 * Deliberately sparse. The brief is that this should feel like an event you
 * are standing in, not a game with a HUD, so the only things on screen at any
 * moment are: who you are, what you can do right now, and how far up the flag
 * has got.
 */

const $ = (id) => document.getElementById(id);

export function createUI() {
  const screens = {
    loading: $('loading'),
    title: $('title'),
    hud: $('hud'),
    celebrate: $('celebrate'),
    poster: $('poster'),
    fatal: $('fatal'),
  };

  let current = 'loading';
  let promptShown = false;

  function show(key) {
    for (const [name, el] of Object.entries(screens)) {
      if (!el) continue;
      if (name === key) {
        el.classList.remove('gone');
        void el.offsetWidth;
        el.classList.remove('hidden');
      } else {
        el.classList.add('hidden');
        setTimeout(() => {
          if (current !== name) el.classList.add('gone');
        }, 520);
      }
    }
    current = key;
  }

  return {
    show,
    get current() {
      return current;
    },

    get nameValue() {
      return $('input-name').value.trim();
    },
    get placeValue() {
      return $('input-place').value.trim();
    },
    setPlacePlaceholder(text) {
      if (text) $('input-place').placeholder = text;
    },

    loadingStep(text) {
      $('loading-step').textContent = text;
    },

    /** The top-left line: who you are and where, once we know. */
    setPlayerLine(name, place) {
      const bits = [name, place].filter(Boolean);
      $('player-line').textContent = bits.join(' · ');
    },
    setCelebrateTitle(name) {
      $('celebrate-title').textContent = name ? `${name}, you hoisted the flag` : 'You hoisted the flag';
    },

    /** The "E — PULL THE ROPE" chip that appears when you are close enough. */
    setPrompt(visible, text) {
      if (text) $('prompt-text').textContent = text;
      if (visible === promptShown) return;
      promptShown = visible;
      $('prompt').classList.toggle('hidden', !visible);
      $('move-hint').classList.toggle('hidden', visible);
    },

    setHoist(visible, fraction) {
      $('hoist-meter').classList.toggle('hidden', !visible);
      $('hoist-fill').style.width = `${Math.round(fraction * 100)}%`;
    },

    setCelebrateSub(text) {
      $('celebrate-sub').textContent = text;
    },

    setPoster(dataUrl) {
      $('poster-img').src = dataUrl;
    },
    /**
     * Flashes a confirmation on the share button.
     *
     * The button is never hidden. An earlier version removed it on browsers
     * with no `navigator.share` — which is most desktop browsers — and the
     * result was someone staring at the poster asking where the share option
     * had gone. They are always there; what they do underneath adapts.
     */
    flash(id, text, ms = 2600) {
      const el = $(id);
      const original = el.dataset.original || el.textContent;
      el.dataset.original = original;
      el.textContent = text;
      clearTimeout(el._t);
      el._t = setTimeout(() => {
        el.textContent = original;
      }, ms);
    },

    showSound(visible) {
      $('btn-sound').classList.toggle('gone', !visible);
    },
    setMuted(muted) {
      $('btn-sound').classList.toggle('off', muted);
      $('sound-icon').textContent = muted ? '♪̸' : '♪';
      $('btn-sound').setAttribute('aria-label', muted ? 'Turn sound on' : 'Turn sound off');
    },

    on(id, handler) {
      $(id).addEventListener('click', handler);
    },
    onPress(id, handler) {
      const el = $(id);
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        handler(e);
      });
    },

    fatal(message) {
      $('fatal-msg').textContent = message;
      show('fatal');
    },
  };
}
