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
- **Cue (hold C)** — hold **C** and press-hold on a shape, then **drag back** to pull the
  cue: the drag vector's length is the power and its direction is the aim (the shape shoots
  *opposite* the pull, like a pool cue). Release to fire an impulse at the hit point —
  off-centre hits impart spin.
- **Slingshot (hold V)** — hold **V** and press anywhere, then drag back the same way to
  launch a fresh ball from the launch point. Great for pelting a structure from across the board.
- **Drag empty space** — orbit the camera. **Scroll** — zoom.
- **Fly** — a free-fly camera: tap **WASD** (or the panel **Fly** button) to enter, then
  **WASD** moves you through the world, **Q/E** down/up, **Shift** to sprint, **Esc** exits.
  Dragging empty space looks around; the shape tools still work while flying — drag a shape
  to grab it, hold **C**/**V** to cue/slingshot.
- **Spawn buttons** — one per shape (ball, cube, plate, block, cylinder, prism, torus,
  and a self-righting gömböc). **Press and hold** any spawn button to keep spawning.
- **+10 / +25 mixed** — fill the board with random shapes.
- **Structures** — drop in a ready-made stack to knock down: a **Cans** stack (upright
  cylinders), a stepped cube **Pyramid**, an even bigger **Big Pyramid**, a brick **Wall**,
  a **Tower** of cubes, a **Jenga** tower, or a **Chain** of interlocking tori. Structures
  land on a clear spot so they don't blast into existing objects; re-trigger the same one
  within ~2s to stack it on top of the last (so you build the height). The chain links are
  threaded deeply through each other (their ring colliders interlock) and backed by a link
  constraint, so they can't be pulled apart.
- **Detonate / Implode** — **hold to charge**: a tap is a light pop, a full hold is a
  huge blast. **Space** charges detonate and **Shift+Space** charges implode — driving the
  actual buttons, so you watch the charge bar fill as you hold.
- **Freeze (F)** — freezes every shape in place (per-object: the world keeps simulating, each
  shape is just held static, so it still blocks others). Grab or cue a frozen shape to thaw
  just that one; unfreeze to release them all, each resuming exactly as it was.
- **Halt (H)** — kills all linear motion but leaves spin, so everything stops in place yet
  keeps tumbling (especially fun at zero gravity).
- **Walls** — toggle translucent boundary walls so nothing skids off the board.
- **Gravity / Bounce** sliders. **Pause**. **Clear** empties the board; **Reset**
  restores the default gravity/bounce/camera and the starter scene. The panel also shows
  live object and FPS counters.

## Architecture

Physics runs off the main thread in a **Web Worker**; the main thread sends commands and
renders from a streamed transform buffer. Rendering is **instanced** (one InstancedMesh
per shape type), so draw calls scale with the number of shape *types*, not objects.
Adding a new shape is a single data entry, not new code in three files.

| Folder / file | Responsibility |
| --- | --- |
| `physics/physicsWorker.ts` | cannon-es world, body factory, walls, grab constraint, forces — runs entirely in the worker |
| `physics/physicsClient.ts`, `protocol.ts` | main↔worker messaging; transforms stream back as a transferable `Float32Array` |
| `physics/world.ts`, `bodyFactory.ts` | pure cannon helpers (shared by the worker) |
| `render/` | three.js scene, soft shadows, and instanced meshes driven by the worker's transforms (`instances.ts`) |
| `objects/` | data-driven object definitions, prebuilt structures, and shared collider geometry (prism, gömböc) |
| `interaction/` | pointer-pick, grab (streams the drag target to the worker), camera orbit/zoom |
| `forces/` | energy release (detonate / implode), run in the worker |
| `ui/` | control panel + counters |
| `config.ts` | all **feel knobs** in one place — tune here |
| `sandbox.ts` | orchestrates the physics worker and instanced rendering |
| `main.ts` | wires the layers; the render loop is draw-only |

### Feel knobs

The single most important file is `src/config.ts` — gravity, restitution, friction,
damping, grip force and solver iterations all live there. The grip force is constant
(not mass-scaled) on purpose: the acceleration ceiling `F/m` is lower for heavy
shapes, so they lag behind the cursor and *feel* heavy.

## Stack

Vanilla TypeScript + Vite · [three.js](https://threejs.org) for rendering (instanced,
high-performance WebGL) · [cannon-es](https://github.com/pmndrs/cannon-es) for physics,
run in a Web Worker · pnpm · deployed to GitHub Pages via GitHub Actions.

## Notes

- The torus has no native collider in cannon-es, so it is built as a ring of small
  spheres. The open center lets tori thread through each other — that is what makes
  the interlocking chain possible.
- The triangular prism is a `ConvexPolyhedron` whose mesh and collider share the same vertices.
- A true gömböc can't be reproduced in a rigid-body engine, so the gömböc is an honest
  approximation: an offset-sphere collider gives a low centre of mass (Weeble-style) so it
  always self-rights, under a sculpted asymmetric mesh.
- Walls are contained by a per-frame arena clamp (a backstop), so nothing escapes even a
  full-charge detonate; the thin wall colliders just provide the bounce.
