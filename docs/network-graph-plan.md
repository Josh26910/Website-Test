# Interactive network graph — build plan

**Status:** Implemented on `claude/focused-tesla-24cead` — see §11 for what
shipped and the decisions taken on the open questions in §9. The rest of this
doc is the original plan, kept for reference.
**Owner context:** This is the "Recall" landing page — a fictional invite-only
study/quiz app concept, no real backend. Static site, deployed via GitHub
Pages from `claude/quiz-app-landing-2c8796`.

## 1. Goal

Replace the current static hub-and-spoke network demo (`#network` section) with
a real force-directed, drill-down graph in the style of Obsidian's graph view /
a "second brain" tool. Reference behaviour the user described:

- Tapping a node causes the **whole graph to physically reflow** — existing
  nodes drift to new equilibrium positions, like a bubble popping and
  everything resettling. Not a hard cut/redraw.
- Tapping a node **reveals its children** — new nodes fade/scale in, new edges
  **draw themselves in** (animated line, not an instant snap).
- This is **multi-level**, not just one layer of branches. Example the user
  gave: `Finance → Rare metals → {Gold, Silver} → Exchanges` (and separately,
  `Rare metals → Physical vs virtual assets` or similar). That finance example
  was illustrating the *interaction pattern* — confirm with the user whether
  the real content should be finance-themed or study-topic-themed (e.g.
  `ECON 201 → Market structures → {Monopoly, Oligopoly} → Price discrimination`)
  before authoring final content. Default assumption in this plan: **study
  topics**, matching the rest of the site, unless told otherwise.
- Some nodes are **shared across branches** (e.g. "Exchanges" reachable from
  more than one parent) — this is a real graph, not a strict tree. Expanding a
  second path to an already-existing node should pull a new edge to it, not
  create a duplicate node.

## 2. What exists today (baseline to replace/extend)

- `index.html` — `#network` section, `<svg id="networkSvg">`, hint text,
  `#networkReset` button.
- `css/style.css` — `.net-node`, `.net-edge`, `.net-label`, `.net-arrow`
  rules (search `/* ============ interactive network`).
- `js/main.js` — `initNetwork()` IIFE (search `initNetwork`). Currently:
  - Procedurally generates 4 fixed hub nodes with 4–6 branch nodes each at
    **hand-computed radial positions** (no physics).
  - Hover a hub → highlights cluster, plays looping arrow markers hub→branch,
    shows all branch labels.
  - Hover a branch → highlights just that one edge + its hub.
  - Click two nodes → draws a custom dashed edge between them (kept feature).
  - Full keyboard support already built: each node is
    `tabindex="0" role="button"` with a descriptive `aria-label`, Enter/Space
    triggers the same logic as click, `:focus-visible` shows a ring. This
    pattern **must carry forward** into the new version — don't regress
    accessibility while upgrading the visuals.
  - Ambient ` gsap.to(svg, {rotate: 1.1, ...repeat:-1})` idle wobble on the
    whole SVG, plus glow-pulse on hub nodes.
- This all needs to be recorded as replaced/superseded once the new version
  lands — don't leave dead code behind.

## 3. Technical approach

### 3.1 Physics engine

Use **d3-force** (plus `d3-drag` and `d3-zoom` from the same family), loaded
from a CDN the same way GSAP/Lenis already are — no build step, this is a
static site with no bundler.

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js"></script>
```
(Pin an exact version. Verify the CDN URL resolves before committing — check
cdnjs's current listing rather than trusting this string blindly.)

Why d3-force over hand-rolling springs/repulsion: it's the standard tool for
exactly this problem (charge/many-body repulsion, link springs, collision,
centering forces all built in and tunable), it's small, and it de-risks the
"does the physics actually feel good" problem, which is the hard part to get
right from scratch. GSAP stays in the stack too, but for *entrance*
animation (node scale/fade-in, edge draw-in) layered on top of the physics
tick — not for the simulation itself.

### 3.2 Rendering

Keep rendering in SVG (consistent with the current implementation, and SVG
`<text>` labels are simpler for accessibility than canvas). d3-force doesn't
care how you render — it just gives you x/y per tick; you update SVG
attributes (or a CSS transform) on each tick callback.

At the node counts this graph will realistically reach (a few dozen, not
thousands), SVG performance is not a concern. If it somehow grows far beyond
that, canvas would be the fallback — not expected to be needed.

### 3.3 Zoom/pan

Once nodes can multiply via expansion, the fixed `viewBox="0 0 640 420"`
won't hold everything. Add `d3-zoom` for pan/pinch-zoom on the SVG group,
with a "recenter" affordance (could reuse/extend the existing "Reset your
links" button into a "Reset view" that also re-centers and collapses back to
root).

## 4. Data model

Author a real content tree instead of the current seeded-random generator.
Shape (adjust field names to taste, but keep the shared-node capability):

```js
// js/graph-data.js
const GRAPH_NODES = [
  { id: 'econ201', label: 'ECON 201', kind: 'root' },
  { id: 'market-structures', label: 'Market structures', kind: 'topic', parents: ['econ201'] },
  { id: 'monopoly', label: 'Monopoly', kind: 'topic', parents: ['market-structures'] },
  { id: 'oligopoly', label: 'Oligopoly', kind: 'topic', parents: ['market-structures'] },
  { id: 'price-discrimination', label: 'Price discrimination', kind: 'leaf', parents: ['monopoly', 'oligopoly'] },
  // ...
];
```

Key point: `parents` is an **array**, not a single value — that's what makes
shared nodes (like `price-discrimination` above, or "Exchanges" in the user's
finance example) work. A node is only ever instantiated once in the live
simulation; a second expansion path to it adds an edge, not a duplicate node.

Only the root-level nodes (a handful of hub topics, same idea as today's 4
hubs) are in the simulation at load. Everything else is added on expand.

## 5. Interaction spec

- **Tap/click an unexpanded node** → add its direct children to the
  simulation (dedup against already-present nodes by id), add the new edges,
  reheat the simulation (`simulation.alpha(1).restart()` or similar) so
  everything reflows. New nodes enter at their parent's current position
  (not a random spot) so they visibly "pop out" from it rather than
  appearing from nowhere.
- **New edges draw in**: animate `stroke-dashoffset` from full length to 0
  over ~400–600ms per edge, staggered slightly if multiple children appear
  at once. New nodes scale+fade in with GSAP over a similar duration.
- **Hover / focus a node** (unchanged behaviour from today, keep it): trace
  just that node's direct connections.
- **Collapse behaviour — needs a decision, don't guess silently:**
  recommended default is Obsidian-style "keeps growing" (clicking never
  removes nodes, only adds), with the existing reset button clearing back to
  root. An alternative is "clicking an already-expanded node collapses its
  subtree." Pick one before building the interaction and note the choice in
  the PR/commit — don't leave it ambiguous in code with no rationale.
- **Click-to-connect** (today's "select two nodes to link them yourself"
  feature) — decide whether this stays. It's a nice touch but may conflict
  visually/conceptually with a "real" content graph where edges are supposed
  to mean something specific. Could stay as an explicitly-styled "your own
  link" in a different colour, as it does today. Flag this as a decision
  point too rather than silently dropping or keeping it.

## 6. Accessibility (must not regress)

The current implementation's keyboard support is a real feature, not an
afterthought — preserve and extend it:

- Every node keeps `tabindex="0" role="button"` and a descriptive
  `aria-label` (update the label text to reflect expand state, e.g. "Market
  structures — press Enter to reveal 2 more topics" vs "...press Enter to
  see its connections" for a leaf).
- Newly-added nodes need to be reachable by keyboard immediately after an
  expand — don't let focus get lost. After expanding, move focus to the
  first newly-revealed child, and use an `aria-live="polite"` region to
  announce what was added (e.g. "Revealed 3 topics under Market
  structures") since sighted users see the animation but screen reader
  users need an equivalent announcement.
- Respect `prefers-reduced-motion`: skip the physics settle animation and
  the draw-in/scale-in tweens for users who've asked for reduced motion —
  jump nodes straight to their resting position instead.
- Re-verify colour contrast on any new node states (e.g. an "expanded"
  visual treatment) against the fixes already made in this codebase — see
  the WCAG contrast work already done on `--ink-faint` and the
  `--accent`/`--accent-dim` split (search `style.css` for those tokens
  before introducing a new colour that might fail AA again).
- Mobile: no hover on touch, so tap must do the full job (expand + show
  labels) that hover currently does on desktop. Test on a real narrow
  viewport, not just resize the desktop window.

## 7. Suggested file/component split

- `js/graph-data.js` — the content tree (data only, no logic).
- `js/network-graph.js` — new module replacing the current `initNetwork()`
  block in `main.js` (d3-force setup, expand/collapse logic, rendering,
  zoom/pan, accessibility wiring). Keep `main.js` focused on
  loader/Lenis/scroll-reveal/deck-fan as it is today; don't let this one
  feature bloat that file further.
- CSS: extend the existing `.net-*` rules rather than starting a fresh
  naming scheme — keep it one system.

## 8. Suggested build order

1. **Swap the engine, same data.** Get today's 4-hub/branch dataset running
   under d3-force instead of hand-placed coordinates, with no drill-down yet.
   Confirms the physics feels right before adding complexity.
2. **Progressive disclosure.** Add the real multi-level content tree, wire
   up expand-on-click with dedup for shared nodes, reheat-on-add.
3. **Motion polish.** Draw-in edges, scale/fade-in nodes, staggered timing,
   consistent easing with the rest of the site (`power3.out`, per
   `js/main.js`'s existing `EASE` constant — reuse it, don't invent a new
   curve).
4. **Zoom/pan.** Add d3-zoom, recenter affordance.
5. **Accessibility pass.** Focus management, `aria-live` announcements,
   `prefers-reduced-motion`, keyboard re-test end to end (tab through,
   expand, collapse if that's in scope, verify nothing traps focus).
6. **Cross-device QA.** Desktop hover, mobile tap, keyboard-only pass, and a
   contrast check on any new visual states — the same verification rigor
   used earlier in this project (real headless-browser interaction tests,
   not just visual inspection). No horizontal overflow on narrow viewports.

## 9. Open decisions to confirm before/while building

- [x] Content subject: study topics (default assumption above) or a
      finance-themed demo like the user's example? → **Study topics.**
- [x] Collapse behaviour: keeps growing (recommended) vs. click-to-collapse?
      → **Keeps growing.** "Reset graph" is the way back.
- [x] Keep the "click two nodes to connect them yourself" feature, and if so,
      how does it read visually against "real" authored edges? → **Kept, behind
      a "Draw your own link" toggle**, drawn as dashed accent lines.
- [x] Does this replace the `#network` section in place, or does it need its
      own section/heading copy rewritten to match the new behaviour (current
      copy says "Hover a topic..." which will be inaccurate once this is
      tap/click-driven with expand semantics)? → **Replaced in place.** Heading
      kept, hint copy and SVG label rewritten.
- [x] Confirm the d3 CDN version/URL actually resolves before relying on it.
      → `d3/7.9.0` on cdnjs resolves and is the latest version listed there.

## 10. Non-goals for this pass

- No real backend, no persistence of user-made connections across visits —
  this is still a static demo. Any "your own connections" stay
  client-side/in-memory, same as today.
- Not replacing the separate scroll-driven quiz card deck (`#deck` section)
  — that's a different, already-working piece, out of scope here.

## 11. What shipped

Files:
- `js/graph-data.js`: 53 nodes (root → 4 courses → topics → leaves), 3–4
  levels deep. Several nodes have more than one parent: Equilibrium (ECON 201
  + CHEM 204), Statistics (PSYC 101 research methods + ECON 201), Enzymes
  (kinetics + metabolism), ATP (3 parents), Nash equilibrium, Price
  discrimination, Cellular respiration, Activation energy.
- `js/network-graph.js` replaces the old `initNetwork()` in `main.js`, which is
  now removed. `main.js` exposes `window.Recall.EASE` so the graph reuses the
  site's `power3.out` curve.
- d3 7.9.0 (cdnjs) is added before `main.js`. The privacy, cookie and terms
  pages now list D3 alongside GSAP and Lenis.

Decisions on §9 (these are also noted in the header comment of
`network-graph.js`):
- **Content:** study topics. The load state is a "Your cohort" root pinned at
  the centre, linked to the four courses from the old demo.
- **Collapse:** keeps growing. Clicking never removes anything. "Reset graph"
  goes back to the root and four courses, clears your own links and turns
  auto-fit back on. Nothing can vanish from under keyboard focus.
- **Click-to-connect:** kept, but behind a "Draw your own link" toggle
  (`aria-pressed`), because a plain click now opens a topic. Your own links are
  dashed accent lines, as before, and act as a weak spring in the simulation.
  Escape clears the current selection first, then leaves link mode.
- **Copy:** the section stays in place under the same heading. The hint text
  and the SVG's `aria-label` are rewritten for tap/click-to-open.

Behaviour notes / deviations from the plan:
- **No flying arrows on hover.** The hub→branch arrow tweens needed fixed
  endpoints. Lit edges now show a moving dash that flows away from the hovered
  node (CSS animation, turned off under reduced motion).
- **No ambient SVG wobble.** The physics already gives the graph life, and
  rotating a zoomable canvas fights with pan and zoom. The glow pulse on
  course nodes is kept.
- **Auto-fit camera.** While the simulation runs, the view eases towards the
  bounds of the whole graph. A real pan or zoom gesture turns this off. The
  "Fit" button turns it back on.
- **Zoom input without scroll-jacking.** A plain mouse wheel still scrolls
  the page. Ctrl/⌘ + wheel or a trackpad pinch zooms. On touch, one finger
  scrolls the page and two fingers pinch or pan. The +/−/Fit buttons cover
  keyboard and touch users.
- **Draggable nodes** (d3-drag). The root stays pinned to the centre.
- **Label collision.** A small custom force keeps each "dot + label" box apart.
  Plain circle collision let wide labels overlap on narrow screens. Label size
  is counter-scaled against zoom (`--u`), so the boxes follow that scale.
- **Keyboard:** new nodes go into the DOM right after the node that revealed
  them, so Tab goes parent → children. Opening a topic from the keyboard moves
  focus to its first new child. A mouse click leaves focus where it is. Enter
  on a topic with nothing left to open reads out its connections through the
  `role="status"` live region.
- **Reduced motion:** the layout settles off-screen (300 synchronous ticks)
  and the view jumps to fit. There are no GSAP tweens and no dash animation.
