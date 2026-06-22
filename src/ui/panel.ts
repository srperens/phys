/**
 * Control panel — glassy, matte, no gradients/glow. Collapsible on mobile.
 */
import { OBJECT_LIST } from '../objects/defs';
import { STRUCTURE_LIST } from '../objects/structures';
import { FEEL } from '../config';
import type { Sandbox } from '../sandbox';
import type { Controls } from '../interaction/controls';

/** Blast center — slightly above the board. */
const BLAST_CENTER: [number, number, number] = [0, 0.5, 0];

const CSS = `
.phys-panel {
  position: fixed; top: 16px; left: 16px; z-index: 10;
  display: flex; flex-direction: column; gap: 8px;
  padding: 13px; width: 230px;
  font: 13px/1.4 system-ui, sans-serif; color: #e7ecf1;
  background: rgba(20, 24, 29, 0.55);
  backdrop-filter: blur(14px) saturate(120%);
  -webkit-backdrop-filter: blur(14px) saturate(120%);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 14px;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  -webkit-tap-highlight-color: transparent;
}
.phys-panel h1 { font-size: 13px; font-weight: 600; letter-spacing: 0.08em;
  text-transform: uppercase; color: #9aa7b3; margin: 0;
  display: flex; justify-content: space-between; align-items: center; }
.phys-chevron { display: none; transition: transform 0.15s ease; color: #9aa7b3; }
.phys-body { display: flex; flex-direction: column; gap: 8px; }
.phys-row { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.phys-row-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; }
.phys-panel button {
  appearance: none; border: 1px solid rgba(255,255,255,0.1);
  background: rgba(255,255,255,0.05); color: #e7ecf1;
  padding: 6px 5px; border-radius: 8px; cursor: pointer;
  font: inherit; transition: background 0.12s ease;
}
.phys-panel button:hover { background: rgba(255,255,255,0.12); }
.phys-panel button:active { background: rgba(255,255,255,0.18); }
.phys-panel button.accent { border-color: rgba(224,122,95,0.5); color: #f0b6a6; }
.phys-panel button.full { grid-column: 1 / -1; }
.phys-panel button.on { border-color: rgba(79,182,168,0.6); color: #9fe0d4; background: rgba(79,182,168,0.12); }
.phys-charge { position: relative; overflow: hidden; }
.phys-charge .phys-fill { position: absolute; left: 0; top: 0; bottom: 0; width: 0;
  pointer-events: none; transition: width 0.04s linear; }
.phys-charge .phys-label { position: relative; z-index: 1; }
.phys-divider { height: 1px; background: rgba(255,255,255,0.08); margin: 2px 0; }
.phys-group-label { font-size: 11px; font-weight: 600; letter-spacing: 0.06em;
  text-transform: uppercase; color: #9aa7b3; margin-bottom: -4px; }
.phys-keys { display: grid; grid-template-columns: auto 1fr; gap: 4px 8px;
  color: #9aa7b3; font-size: 11px; align-items: center; }
.phys-keys kbd { justify-self: start; font: 10px/1.5 ui-monospace, SFMono-Regular, monospace;
  background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.14);
  border-radius: 4px; padding: 1px 6px; color: #e7ecf1; white-space: nowrap; }
.phys-stat { display: flex; justify-content: space-between; color: #9aa7b3; }
.phys-stat b { color: #e7ecf1; font-weight: 600; }
.phys-field label { display: block; color: #9aa7b3; margin-bottom: 4px; }
.phys-field input[type=range] { width: 100%; accent-color: #4fb6a8; }
@media (max-width: 640px) {
  .phys-panel { width: 144px; top: 10px; left: 10px; padding: 10px; gap: 8px;
    font-size: 12px; border-radius: 12px; }
  .phys-panel button { padding: 7px 4px; border-radius: 8px; }
  .phys-panel h1 { cursor: pointer; }
  .phys-chevron { display: inline; }
  .phys-panel.collapsed { gap: 0; }
  .phys-panel.collapsed .phys-body { display: none; }
  .phys-panel.collapsed .phys-chevron { transform: rotate(-90deg); }
}
`;

export function createPanel(sandbox: Sandbox, controls: Controls): void {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const panel = el('div', 'phys-panel');

  // Header doubles as the collapse toggle on small screens.
  const header = el('h1');
  const title = document.createElement('span');
  title.textContent = 'phys';
  const chevron = document.createElement('span');
  chevron.className = 'phys-chevron';
  chevron.textContent = '▾';
  header.appendChild(title);
  header.appendChild(chevron);
  const isSmall = () => window.matchMedia('(max-width: 640px)').matches;
  header.addEventListener('click', () => {
    if (isSmall()) panel.classList.toggle('collapsed');
  });
  panel.appendChild(header);

  // Start minimized on phones so it doesn't cover the scene.
  if (isSmall()) panel.classList.add('collapsed');

  const body = el('div', 'phys-body');
  panel.appendChild(body);

  // Per-type spawn buttons. Press and hold to keep spawning.
  const spawnRow = el('div', 'phys-row');
  for (const def of OBJECT_LIST) {
    spawnRow.appendChild(repeatButton(def.label, () => sandbox.spawn(def.id)));
  }
  body.appendChild(spawnRow);

  // Bulk spawn. Also hold-to-repeat.
  const bulkRow = el('div', 'phys-row');
  bulkRow.appendChild(repeatButton('+10 mixed', () => sandbox.spawnMany(10)));
  bulkRow.appendChild(repeatButton('+25 mixed', () => sandbox.spawnMany(25)));
  body.appendChild(bulkRow);

  body.appendChild(divider());

  // Prebuilt structures — ready-made stacks to drop in and knock down.
  const structLabel = el('div', 'phys-group-label');
  structLabel.textContent = 'Structures';
  body.appendChild(structLabel);
  const structRow = el('div', 'phys-row');
  for (const s of STRUCTURE_LIST) {
    structRow.appendChild(button(s.label, () => sandbox.spawnStructure(s.id)));
  }
  structRow.appendChild(button('Chain', () => sandbox.spawnChain()));
  body.appendChild(structRow);

  body.appendChild(divider());

  // Gravity slider.
  const gravity = slider('Gravity', -40, 0, 0.5, FEEL.gravity, (v) => {
    sandbox.setGravity(v);
  });
  body.appendChild(gravity.field);

  // Bounce slider (restitution).
  const bounce = slider('Bounce', 0, 0.95, 0.01, FEEL.restitution, (v) => {
    sandbox.setRestitution(v);
  });
  body.appendChild(bounce.field);

  body.appendChild(divider());

  // Forces — hold to charge up the blast, release to fire. Space and Shift+Space drive
  // these same buttons (and their fill bars) from the keyboard.
  const forceRow = el('div', 'phys-row');
  const detonateBtn = chargeButton('Detonate', 'rgba(224,122,95,0.45)', (r) =>
    sandbox.detonate(BLAST_CENTER, 50 + r * 320, 20 + r * 40),
  );
  const implodeBtn = chargeButton('Implode', 'rgba(79,182,168,0.45)', (r) =>
    sandbox.implode(BLAST_CENTER, 50 + r * 300),
  );
  forceRow.appendChild(detonateBtn.el);
  forceRow.appendChild(implodeBtn.el);
  body.appendChild(forceRow);

  // Walls toggle + free-fly toggle share a row (Fly is also WASD / Esc in controls).
  const toggleRow = el('div', 'phys-row');
  const wallsBtn = button('Walls: off', () => {
    const on = !sandbox.wallsEnabled;
    sandbox.setWalls(on);
    wallsBtn.textContent = on ? 'Walls: on' : 'Walls: off';
    wallsBtn.classList.toggle('on', on);
  });
  const flyBtn = button('Fly: off', () => {
    controls.setFly(!controls.isFlying());
  });
  toggleRow.appendChild(wallsBtn);
  toggleRow.appendChild(flyBtn);
  body.appendChild(toggleRow);

  // Motion control: Freeze (pause stepping, keep velocities — a cue/sling during the
  // freeze loads motion that fires on resume) and the related Halt (kill linear motion,
  // keep spin) share a row.
  const motionRow = el('div', 'phys-row');
  const pauseBtn = button('Freeze', () => sandbox.setPaused(!sandbox.paused));
  const haltBtn = button('Halt (H)', () => sandbox.stopMotion());
  motionRow.appendChild(pauseBtn);
  motionRow.appendChild(haltBtn);
  body.appendChild(motionRow);

  // Clear + Reset.
  const actionRow = el('div', 'phys-row');
  actionRow.appendChild(button('Clear', () => sandbox.clear()));
  // Back to the initial state: empty board, default feel, default camera, starter scene.
  const doReset = () => {
    sandbox.clear();
    setSlider(gravity.input, FEEL.gravity);
    setSlider(bounce.input, FEEL.restitution);
    controls.resetCamera();
    sandbox.spawnStarterScene();
  };
  actionRow.appendChild(button('Reset', doReset));
  window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'r' && !e.repeat) {
      doReset();
      return;
    }
    // Number keys spawn: 1–8 a shape (hold to spam), Shift+1–6 a structure.
    const digit = /^Digit([1-9])$/.exec(e.code);
    if (!digit) return;
    const idx = Number(digit[1]) - 1;
    if (e.shiftKey) {
      if (e.repeat) return; // one structure per press
      const s = STRUCTURE_LIST[idx];
      if (s) sandbox.spawnStructure(s.id);
    } else {
      const d = OBJECT_LIST[idx];
      if (d) sandbox.spawn(d.id);
    }
  });
  body.appendChild(actionRow);

  // Counters.
  const stat = el('div', 'phys-stat');
  stat.innerHTML = `<span>Objects</span><b>0</b>`;
  const statValue = stat.querySelector('b')!;
  body.appendChild(stat);

  const fpsStat = el('div', 'phys-stat');
  fpsStat.innerHTML = `<span>FPS</span><b>—</b>`;
  const fpsValue = fpsStat.querySelector('b')!;
  body.appendChild(fpsStat);

  // Keyboard legend.
  body.appendChild(divider());
  const keysLabel = el('div', 'phys-group-label');
  keysLabel.textContent = 'Shortcuts';
  body.appendChild(keysLabel);
  const keys = el('div', 'phys-keys');
  const SHORTCUTS: Array<[string, string]> = [
    ['C', 'Cue — hold + drag back'],
    ['V', 'Slingshot — hold + drag'],
    ['Space', 'Detonate — hold to charge'],
    ['⇧ Space', 'Implode — hold to charge'],
    ['F', 'Freeze / resume'],
    ['H', 'Halt (keep spin)'],
    ['R', 'Reset'],
    ['1–8', 'Spawn a shape (hold to spam)'],
    ['⇧ 1–6', 'Spawn a structure'],
    ['WASD', 'Fly around'],
    ['Q / E', 'Fly down / up'],
    ['Shift', 'Sprint (fly)'],
    ['Esc', 'Exit fly'],
  ];
  for (const [key, desc] of SHORTCUTS) {
    const kbd = document.createElement('kbd');
    kbd.textContent = key;
    const d = el('span');
    d.textContent = desc;
    keys.append(kbd, d);
  }
  body.appendChild(keys);

  // Space charges Detonate, Shift+Space charges Implode — driving the actual buttons so
  // their fill bars animate. Which one is decided at press and held until release.
  let charged: ChargeButton | null = null;
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Space') return;
    e.preventDefault(); // no page scroll, no activating a focused button
    if (charged) return; // ignore key-repeat
    charged = e.shiftKey ? implodeBtn : detonateBtn;
    charged.press();
  });
  window.addEventListener('keyup', (e) => {
    if (e.code !== 'Space') return;
    e.preventDefault();
    if (!charged) return;
    charged.release();
    charged = null;
  });

  document.body.appendChild(panel);

  // Keep counters updated; FPS averaged over a short window so it doesn't flicker.
  let windowStart = performance.now();
  let frames = 0;
  const tick = () => {
    statValue.textContent = String(sandbox.count);
    const flying = controls.isFlying();
    flyBtn.classList.toggle('on', flying);
    flyBtn.textContent = flying ? 'Fly: on' : 'Fly: off';
    pauseBtn.classList.toggle('on', sandbox.paused);
    pauseBtn.textContent = sandbox.paused ? 'Resume' : 'Freeze';
    frames++;
    const now = performance.now();
    const elapsed = now - windowStart;
    if (elapsed >= 500) {
      fpsValue.textContent = String(Math.round((frames * 1000) / elapsed));
      frames = 0;
      windowStart = now;
    }
    requestAnimationFrame(tick);
  };
  tick();
}

function el(tag: string, className?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.onclick = onClick;
  return b;
}

/**
 * Button that fires once on press, then keeps firing while held (press-and-spam).
 * Pointer capture keeps it repeating even if the finger drifts off the button.
 */
function repeatButton(label: string, action: () => void, interval = 110): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  let timer = 0;

  const stop = () => {
    if (timer) {
      clearInterval(timer);
      timer = 0;
    }
  };
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    action();
    stop();
    timer = window.setInterval(action, interval);
    b.setPointerCapture(e.pointerId);
  });
  b.addEventListener('pointerup', stop);
  b.addEventListener('pointercancel', stop);
  window.addEventListener('blur', stop);
  return b;
}

function divider(): HTMLElement {
  return el('div', 'phys-divider');
}

interface ChargeButton {
  el: HTMLButtonElement;
  /** Begin charging (drives the same fill animation as a pointer press). */
  press: () => void;
  /** Release → fire with the charged ratio. */
  release: () => void;
}

/**
 * Charge button: hold to fill up power (0→1 over CHARGE_MS), release to fire.
 * `fire` receives the charge ratio; a quick tap fires near 0, a full hold near 1.
 * Exposes press/release so a keyboard shortcut can drive the very same button + bar.
 */
function chargeButton(
  label: string,
  fillColor: string,
  fire: (ratio: number) => void,
  chargeMs = 1400,
): ChargeButton {
  const b = document.createElement('button');
  b.className = 'phys-charge';

  const fill = document.createElement('span');
  fill.className = 'phys-fill';
  fill.style.background = fillColor;
  const text = document.createElement('span');
  text.className = 'phys-label';
  text.textContent = label;
  b.appendChild(fill);
  b.appendChild(text);

  let raf = 0;
  let start = 0;
  let charging = false;
  const ratioNow = () => Math.min(1, (performance.now() - start) / chargeMs);

  const tick = () => {
    if (!charging) return;
    fill.style.width = `${ratioNow() * 100}%`;
    raf = requestAnimationFrame(tick);
  };

  const press = () => {
    if (charging) return;
    charging = true;
    start = performance.now();
    fill.style.width = '0%';
    tick();
  };

  const release = () => {
    if (!charging) return;
    charging = false;
    cancelAnimationFrame(raf);
    fire(ratioNow());
    fill.style.width = '0%';
  };

  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    b.setPointerCapture(e.pointerId);
    press();
  });
  b.addEventListener('pointerup', release);
  b.addEventListener('pointercancel', release);
  return { el: b, press, release };
}

interface Slider {
  field: HTMLElement;
  input: HTMLInputElement;
}

function slider(
  label: string,
  min: number,
  max: number,
  step: number,
  value: number,
  onInput: (v: number) => void,
): Slider {
  const field = el('div', 'phys-field');
  const lab = document.createElement('label');
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  const setLabel = () => (lab.textContent = `${label}: ${input.value}`);
  setLabel();
  input.oninput = () => {
    onInput(Number(input.value));
    setLabel();
  };
  field.appendChild(lab);
  field.appendChild(input);
  return { field, input };
}

/** Set a slider's value and run its handler (applies the value + updates the label). */
function setSlider(input: HTMLInputElement, value: number): void {
  input.value = String(value);
  input.dispatchEvent(new Event('input'));
}
