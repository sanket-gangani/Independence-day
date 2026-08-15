/**
 * The shareable poster.
 *
 * This is the actual product. The game exists to produce this image — it is
 * what lands in the WhatsApp group, and it has to look good enough that
 * someone posts it without being asked to.
 *
 * 4:5, which survives WhatsApp status, Instagram feed and a group chat preview
 * without being cropped into nonsense.
 */

const W = 1080;
const H = 1350;

/** A small drawn tricolour, rather than the flag emoji. */
function drawFlagMark(ctx, cx, cy, w) {
  const h = w / 1.5;
  const x = cx - w / 2;
  const y = cy - h / 2;
  ctx.fillStyle = '#FF9933';
  ctx.fillRect(x, y, w, h / 3);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(x, y + h / 3, w, h / 3);
  ctx.fillStyle = '#138808';
  ctx.fillRect(x, y + (h * 2) / 3, w, h / 3);
  ctx.strokeStyle = '#000080';
  ctx.lineWidth = Math.max(1.2, w * 0.022);
  const r = h * 0.22;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = Math.max(0.8, w * 0.012);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.stroke();
  }
}

export function makePoster({ sceneImage, name = '', moment = null }) {
  const dateCaps = moment?.dateCaps ?? '15 AUGUST 2026';
  const stamp = moment?.stamp ?? '';
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');

  // --- the scene, cover-cropped ------------------------------------------
  ctx.fillStyle = '#12233d';
  ctx.fillRect(0, 0, W, H);

  if (sceneImage) {
    const scale = Math.max(W / sceneImage.width, H / sceneImage.height);
    const dw = sceneImage.width * scale;
    const dh = sceneImage.height * scale;
    // Bias upward: the flag lives in the top third, the crowd across the
    // middle. Cropping from the centre would put the paving in the frame and
    // the flag half out of it.
    ctx.drawImage(sceneImage, (W - dw) / 2, (H - dh) * 0.3, dw, dh);
  }

  // --- legibility scrim ---------------------------------------------------
  //
  // Kept to the bottom quarter and kept warm. The old version dropped a heavy
  // navy gradient over 60% of the frame, which buried the crowd — the whole
  // point of the photograph — under a wash of UI.
  const scrim = ctx.createLinearGradient(0, H * 0.62, 0, H);
  scrim.addColorStop(0, 'rgba(28, 14, 4, 0)');
  scrim.addColorStop(0.55, 'rgba(26, 13, 4, 0.5)');
  scrim.addColorStop(1, 'rgba(22, 11, 3, 0.88)');
  ctx.fillStyle = scrim;
  ctx.fillRect(0, H * 0.62, W, H * 0.38);

  // A whisper of warmth over the whole frame, like a morning print.
  const warm = ctx.createLinearGradient(0, 0, 0, H);
  warm.addColorStop(0, 'rgba(255, 196, 120, 0.10)');
  warm.addColorStop(0.5, 'rgba(255, 214, 160, 0.03)');
  warm.addColorStop(1, 'rgba(120, 60, 20, 0.06)');
  ctx.fillStyle = warm;
  ctx.fillRect(0, 0, W, H);

  // Tricolour rule across the very top, thin enough to read as a border.
  const bar = 9;
  ctx.fillStyle = '#FF9933';
  ctx.fillRect(0, 0, W, bar);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, bar, W, bar);
  ctx.fillStyle = '#138808';
  ctx.fillRect(0, bar * 2, W, bar);

  // --- copy ---------------------------------------------------------------
  const padding = 72;
  let y = H - 258;

  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 26;

  ctx.fillStyle = '#ffffff';
  const title = fitText(ctx, 'I HOISTED THE FLAG', W - padding * 2 - 96, 'Trebuchet MS, system-ui, sans-serif', 800, 74, 44);
  ctx.font = title.font;
  // The whole lockup — words plus flag — is centred, so the words themselves
  // sit left of centre by half the mark's footprint.
  const titleWidth = ctx.measureText(title.text).width;
  const markW = 52;
  const gap = 22;
  const left = W / 2 - (titleWidth + gap + markW) / 2;
  ctx.fillText(title.text, left + titleWidth / 2, y);
  ctx.shadowBlur = 0;
  drawFlagMark(ctx, left + titleWidth + gap + markW / 2, y - 20, markW);

  y += 40;
  // Hairline rule between the title and the date.
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 130, y);
  ctx.lineTo(W / 2 + 130, y);
  ctx.stroke();

  // The real date this happened, in caps and widely spaced — the one line on
  // the card that behaves like a printed caption.
  y += 46;
  ctx.fillStyle = 'rgba(255,255,255,0.94)';
  ctx.font = '700 26px ui-sans-serif, system-ui, sans-serif';
  ctx.letterSpacing = '8px';
  ctx.fillText(dateCaps, W / 2, y);
  ctx.letterSpacing = '0px';

  if (name) {
    y += 48;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = '500 33px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(name, W / 2, y);
  }

  // Place and time, exactly as it was when the flag reached the top.
  if (stamp) {
    y += name ? 38 : 42;
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '400 23px Georgia, serif';
    ctx.fillText(stamp, W / 2, y);
  }

  ctx.fillStyle = 'rgba(255,255,255,0.26)';
  ctx.font = '500 16px ui-sans-serif, system-ui, sans-serif';
  ctx.letterSpacing = '4px';
  ctx.fillText('FUTURELAB STUDIOS', W / 2, H - 44);
  ctx.letterSpacing = '0px';

  return c;
}

/** Shrinks the font until the string fits, down to a floor. */
function fitText(ctx, text, maxWidth, family, weight, startSize, minSize) {
  let size = startSize;
  let font = `${weight} ${size}px ${family}`;
  ctx.font = font;
  while (ctx.measureText(text).width > maxWidth && size > minSize) {
    size -= 2;
    font = `${weight} ${size}px ${family}`;
    ctx.font = font;
  }
  return { font, text };
}


/** Turns the live canvas into an Image the poster can draw. */
export function captureCanvas(canvas) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = canvas.toDataURL('image/jpeg', 0.92);
  });
}
