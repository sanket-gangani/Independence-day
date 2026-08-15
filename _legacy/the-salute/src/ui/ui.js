/**
 * Thin wrapper over the markup in index.html. No framework — the UI is four
 * elements that fade in and out.
 */

const $ = (id) => document.getElementById(id);

export function createUI() {
  const loader = $('loader');
  const loaderFill = $('loader-fill');
  const loaderStatus = $('loader-status');
  const title = $('title');
  const titleCta = $('title-cta');
  const prompt = $('prompt');
  const promptText = $('prompt-text');
  const hint = $('hint');
  const caption = $('caption');
  const captionLine = $('caption-line');
  const fatal = $('fatal');
  const fatalMsg = $('fatal-msg');

  let promptVisible = false;
  let hintVisible = false;

  return {
    setProgress(fraction, label) {
      loaderFill.style.width = `${Math.round(fraction * 100)}%`;
      if (label) loaderStatus.textContent = label;
    },

    showTitle() {
      loader.classList.add('hidden');
      setTimeout(() => loader.classList.add('gone'), 1200);
      title.classList.remove('hidden');
    },

    setTitleCta(text) {
      titleCta.textContent = text;
    },

    hideTitle() {
      title.classList.add('hidden');
      setTimeout(() => title.classList.add('gone'), 1300);
    },

    setPrompt(visible, text) {
      if (text) promptText.textContent = text;
      if (visible === promptVisible) return;
      promptVisible = visible;
      prompt.classList.toggle('hidden', !visible);
    },

    setHint(visible) {
      if (visible === hintVisible) return;
      hintVisible = visible;
      hint.classList.toggle('hidden', !visible);
    },

    showCaption(text) {
      captionLine.textContent = text;
      caption.classList.remove('hidden');
    },

    hideCaption() {
      caption.classList.add('hidden');
    },

    fatal(message) {
      loader.classList.add('gone');
      title.classList.add('gone');
      fatalMsg.textContent = message;
      fatal.classList.remove('hidden');
    },
  };
}
