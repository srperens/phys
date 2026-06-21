/**
 * Control panel — glassy, matte, no gradients/glow. Collapsible on mobile.
 */
import * as CANNON from 'cannon-es';
import { OBJECT_LIST } from '../objects/defs';
import { FEEL } from '../config';
import { detonate, implode } from '../forces/detonate';
import type { Sandbox } from '../sandbox';
import type { Controls } from '../interaction/controls';

/** Blast center — slightly above the board. */
const BLAST_CENTER = new CANNON.Vec3(0, 0.5, 0);

const CSS = `
.phys-panel {
  position: fixed; top: 16px; left: 16px; z-index: 10;
  display: flex; flex-direction: column; gap: 12px;
  padding: 14px; width: 230px;
  font: 13px/1.4 system-ui, sans-serif; color: #e7ecf1;
  background: rgba(20, 24, 29, 0.55);
  backdrop-filter: blur(14px) saturate(120%);
  -webkit-backdrop-filter: blur(14px) saturate(120%);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 14px;
  user-select: none;
}
.phys-panel h1 { font-size: 13px; font-weight: 600; letter-spacing: 0.08em;
  text-transform: uppercase; color: #9aa7b3; margin: 0; }
.phys-row { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.phys-row-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; }
.phys-panel button {
  appearance: none; border: 1px solid rgba(255,255,255,0.1);
  background: rgba(255,255,255,0.05); color: #e7ecf1;
  padding: 8px 6px; border-radius: 9px; cursor: pointer;
  font: inherit; transition: background 0.12s ease;
}
.phys-panel button:hover { background: rgba(255,255,255,0.12); }
.phys-panel button:active { background: rgba(255,255,255,0.18); }
.phys-panel button.accent { border-color: rgba(224,122,95,0.5); color: #f0b6a6; }
.phys-charge { position: relative; overflow: hidden; }
.phys-charge .phys-fill { position: absolute; left: 0; top: 0; bottom: 0; width: 0;
  pointer-events: none; transition: width 0.04s linear; }
.phys-charge .phys-label { position: relative; z-index: 1; }
.phys-divider { height: 1px; background: rgba(255,255,255,0.08); margin: 2px 0; }
.phys-stat { display: flex; justify-content: space-between; color: #9aa7b3; }
.phys-stat b { color: #e7ecf1; font-weight: 600; }
.phys-field label { display: block; color: #9aa7b3; margin-bottom: 4px; }
.phys-field input[type=range] { width: 100%; accent-color: #4fb6a8; }
.phys-collapse { display: none; }
@media (max-width: 640px) {
  .phys-panel { width: 168px; }
  .phys-collapse { display: block; }
  .phys-panel.collapsed .phys-body { display: none; }
}
`;

export function createPanel(sandbox: Sandbox, controls: Controls): void {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const panel = el('div', 'phys-panel');

  const header = el('h1');
  header.textContent = 'phys';
  panel.appendChild(header);

  const collapseBtn = button('Show / hide', () => panel.classList.toggle('collapsed'));
  collapseBtn.className = 'phys-collapse';
  panel.appendChild(collapseBtn);

  const body = el('div', 'phys-body');
  body.style.cssText = 'display:flex; flex-direction:column; gap:12px;';
  panel.appendChild(body);

  // Per-type spawn buttons. Press and hold to keep spawning.
  const spawnRow = el('div', 'phys-row');
  for (const def of OBJECT_LIST) {
    spawnRow.appendChild(repeatButton(def.label, () => sandbox.spawn(def.id)));
  }
  body.appendChild(spawnRow);

  // Bulk spawn + chain. Also hold-to-repeat.
  const bulkRow = el('div', 'phys-row-3');
  bulkRow.appendChild(repeatButton('+10 mixed', () => sandbox.spawnMany(10)));
  bulkRow.appendChild(repeatButton('+25 mixed', () => sandbox.spawnMany(25)));
  bulkRow.appendChild(repeatButton('Chain', () => sandbox.spawnChain()));
  body.appendChild(bulkRow);

  body.appendChild(divider());

  // Gravity slider.
  const gravity = slider('Gravity', -40, 0, 0.5, FEEL.gravity, (v) => {
    sandbox.world.gravity.set(0, v, 0);
    sandbox.wakeAll();
  });
  body.appendChild(gravity.field);

  // Bounce slider (restitution).
  const bounce = slider('Bounce', 0, 0.95, 0.01, FEEL.restitution, (v) => {
    sandbox.world.defaultContactMaterial.restitution = v;
    sandbox.wakeAll();
  });
  body.appendChild(bounce.field);

  body.appendChild(divider());

  // Forces — hold to charge up the blast, release to fire.
  const forceRow = el('div', 'phys-row');
  forceRow.appendChild(
    chargeButton('Detonate', 'rgba(224,122,95,0.45)', (r) =>
      detonate(sandbox.dynamicBodies, BLAST_CENTER, { strength: 30 + r * 160, spin: 16 + r * 28 }),
    ),
  );
  forceRow.appendChild(
    chargeButton('Implode', 'rgba(79,182,168,0.45)', (r) =>
      implode(sandbox.dynamicBodies, BLAST_CENTER, { strength: 30 + r * 150 }),
    ),
  );
  body.appendChild(forceRow);

  // Sim controls.
  const actionRow = el('div', 'phys-row-3');
  const pauseBtn = button('Pause', () => {
    sandbox.paused = !sandbox.paused;
    pauseBtn.textContent = sandbox.paused ? 'Play' : 'Pause';
  });
  actionRow.appendChild(pauseBtn);
  actionRow.appendChild(button('Clear', () => sandbox.clear()));
  actionRow.appendChild(
    button('Reset', () => {
      // Back to the initial state: empty board, default feel, default camera, starter scene.
      sandbox.clear();
      setSlider(gravity.input, FEEL.gravity);
      setSlider(bounce.input, FEEL.restitution);
      controls.resetCamera();
      sandbox.spawnStarterScene();
    }),
  );
  body.appendChild(actionRow);

  // Counter.
  const stat = el('div', 'phys-stat');
  stat.innerHTML = `<span>Objects</span><b>0</b>`;
  const statValue = stat.querySelector('b')!;
  body.appendChild(stat);

  document.body.appendChild(panel);

  // Keep the counter updated.
  const tick = () => {
    statValue.textContent = String(sandbox.count);
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

/**
 * Charge button: hold to fill up power (0→1 over CHARGE_MS), release to fire.
 * `fire` receives the charge ratio; a quick tap fires near 0, a full hold near 1.
 */
function chargeButton(
  label: string,
  fillColor: string,
  fire: (ratio: number) => void,
  chargeMs = 1400,
): HTMLButtonElement {
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

  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    charging = true;
    start = performance.now();
    fill.style.width = '0%';
    b.setPointerCapture(e.pointerId);
    tick();
  });

  const release = () => {
    if (!charging) return;
    charging = false;
    cancelAnimationFrame(raf);
    fire(ratioNow());
    fill.style.width = '0%';
  };
  b.addEventListener('pointerup', release);
  b.addEventListener('pointercancel', release);
  return b;
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
