# phys

**▶ Live: https://srperens.github.io/phys/**
**Repo: https://github.com/srperens/phys**

A tactile physics sandbox — a board of geometric shapes with believable weight,
inertia and bounce. Grab a heavy cube, jerk it, let go, and watch it tumble away
with convincing heft and lag. Spawn shapes until the board is full and everything
collapses; detonate it all; thread tori into a real interlocking chain.

The goal is a *feeling*, not a feature list: it should feel physically true.

## Run locally

```bash
pnpm install
pnpm dev      # http://localhost:5173/phys/
```

```bash
pnpm build    # type-check + production bundle into dist/
pnpm preview  # serve the production build
```

## Controls

- **Drag a shape** — grip it and slide it horizontally (X/Z). Hold **Shift** while
  dragging to set its height instead. Off-center grabs apply torque, so a quick flick
  tumbles the throw; held still, a shape settles quickly rather than spinning forever.
- **Drag empty space** — orbit the camera. **Scroll** — zoom.
- **Spawn buttons** — one per shape (ball, cube, plate, domino, cylinder, prism, torus).
  **Press and hold** any spawn button to keep spawning.
- **+10 / +25 mixed** — fill the board with random shapes.
- **Chain** — spawn an interlocking torus chain. The links interlock via their threaded
  ring colliders and are backed by a link constraint at their natural resting distance,
  so the chain hangs naturally but can't be pulled apart.
- **Detonate / Implode** — **hold to charge**: a tap is a light pop, a full hold is a
  huge blast.
- **Walls** — toggle invisible boundary walls so nothing skids off the board.
- **Gravity / Bounce** sliders. **Pause**. **Clear** empties the board; **Reset**
  restores the default gravity/bounce/camera and the starter scene.

## Architecture

Layers are kept clean and separate — physics never knows about rendering; rendering
just mirrors the physics. Adding a new shape is a single data entry, not new code in
three files.

| Folder | Responsibility |
| --- | --- |
| `physics/` | cannon-es world, body factory, fixed timestep — owns the truth about positions |
| `render/` | three.js scene, lights, soft shadows, mesh factory — mirrors body → mesh |
| `objects/` | data-driven object definitions (shape, size, mass, color) |
| `interaction/` | pointer-pick, grip constraint, camera orbit/zoom |
| `forces/` | energy release (detonate / implode) |
| `ui/` | control panel |
| `config.ts` | all **feel knobs** in one place — tune here |
| `sandbox.ts` | binds body ↔ mesh entities and runs spawn/clear |
| `main.ts` | wires the layers and runs the loop |

### Feel knobs

The single most important file is `src/config.ts` — gravity, restitution, friction,
damping, grip force and solver iterations all live there. The grip force is constant
(not mass-scaled) on purpose: the acceleration ceiling `F/m` is lower for heavy
shapes, so they lag behind the cursor and *feel* heavy.

## Stack

Vanilla TypeScript + Vite · [three.js](https://threejs.org) for rendering ·
[cannon-es](https://github.com/pmndrs/cannon-es) for physics · pnpm ·
deployed to GitHub Pages via GitHub Actions.

## Notes

- The torus has no native collider in cannon-es, so it is built as a ring of small
  spheres. The open center lets tori thread through each other — that is what makes
  the interlocking chain possible.
- The triangular prism is a `ConvexPolyhedron` whose mesh and collider share the same
  vertices.
