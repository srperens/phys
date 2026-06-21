/**
 * Control panel — glassy, matte, no gradients/glow. Collapsible on mobile.
 */
import * as CANNON from 'cannon-es';
import { OBJECT_LIST } from '../objects/defs';
import { FEEL } from '../config';
import { detonate, implode } from '../forces/detonate';
import type { Sandbox } from '../sandbox';

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

export function createPanel(sandbox: Sandbox): void {
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
  body.appendChild(
    slider('Gravity', -40, 0, 0.5, FEEL.gravity, (v) => {
      sandbox.world.gravity.set(0, v, 0);
      sandbox.wakeAll();
    }),
  );

  // Bounce slider (restitution).
  body.appendChild(
    slider('Bounce', 0, 0.95, 0.01, FEEL.restitution, (v) => {
      sandbox.world.defaultContactMaterial.restitution = v;
      sandbox.wakeAll();
    }),
  );

  body.appendChild(divider());

  // Forces.
  const forceRow = el('div', 'phys-row');
  const detonateBtn = button('Detonate', () => detonate(sandbox.dynamicBodies, BLAST_CENTER));
  detonateBtn.classList.add('accent');
  forceRow.appendChild(detonateBtn);
  forceRow.appendChild(button('Implode', () => implode(sandbox.dynamicBodies, BLAST_CENTER)));
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
      sandbox.clear();
      sandbox.spawnMany(8);
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

function slider(
  label: string,
  min: number,
  max: number,
  step: number,
  value: number,
  onInput: (v: number) => void,
): HTMLElement {
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
  return field;
}
