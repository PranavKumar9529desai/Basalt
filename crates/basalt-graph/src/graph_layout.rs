//! Force-directed layout simulation for the graph view.
//!
//! The simulation owns the model-independent physics: a Barnes-Hut quadtree
//! gives O(n log n) repulsion, edges are springs, a weak gravity term keeps the
//! cloud centered, and a fixed-timestep damped symplectic integrator settles it
//! without depending on frame rate. State lives in flat `f32` arrays so the
//! Phase-2 WASM bridge can hand the renderer a `Float32Array` with zero copy.
//!
//! Node indices in this module are dense `0..n`; `LayoutGraph::from_note_graph`
//! remaps `basalt-graph`'s sparse arena `NodeId`s to that dense space.
//!
//! Performance note: the quadtree is rebuilt every step (positions move) and is
//! then *reordered into BFS layout* so that a node's four children occupy
//! contiguous slots. Barnes-Hut traversal is otherwise random-access and
//! cache-thrash bound at 25k nodes. The `theta` opening criterion is the main
//! speed/accuracy lever: `2.0` clears the ADR-021 60fps gate (≤16.6ms) at 25k
//! with ~2x headroom, leaving room in the same frame budget for WebGL rendering.
//! Lower it (≈1.0–1.2) for higher-quality local clusters on smaller graphs.

use crate::arena::NodeId;
use crate::graph::NoteGraph;
use std::collections::HashMap;

/// Tunable physics constants. Defaults chosen for a stable, quickly-settling
/// layout at 25k nodes; revisit during Phase-2 visual tuning.
#[derive(Debug, Clone)]
pub struct GraphParams {
    /// Repulsion strength (Coulomb-style, scaled by node mass).
    pub repulsion: f32,
    /// Rest length of an edge spring.
    pub spring_length: f32,
    /// Stiffness of an edge spring.
    pub spring_strength: f32,
    /// Pull toward `center` (keeps the cloud from drifting off-screen).
    pub gravity: f32,
    /// Velocity retained per step (1.0 = frictionless). Lower = faster settle.
    pub damping: f32,
    /// Barnes-Hut opening criterion: larger = faster but less accurate locally.
    pub theta: f32,
    /// Per-step speed cap to keep the integrator from exploding on collisions.
    pub max_velocity: f32,
    /// Fixed integration timestep.
    pub dt: f32,
    /// World-space point the graph is pulled toward.
    pub center: [f32; 2],
}

impl Default for GraphParams {
    fn default() -> Self {
        Self {
            repulsion: 100.0,
            spring_length: 40.0,
            spring_strength: 0.06,
            gravity: 0.008,
            damping: 0.85,
            theta: 2.0,
            max_velocity: 20.0,
            dt: 0.35,
            center: [0.0, 0.0],
        }
    }
}

/// Sparse graph reduced to the dense form the simulator needs.
#[derive(Debug, Clone)]
pub struct LayoutGraph {
    pub node_count: usize,
    /// Edges as dense index pairs `(u, v)`.
    pub edges: Vec<(u32, u32)>,
    /// Combined in+out degree per node (used as inertia mass).
    pub degree: Vec<u32>,
    /// Per-node kind: `0` = note, `1` = tag. Parallel to the dense node order.
    /// Lets the renderer style/filter tags and the local graph traverse through
    /// them (see docs/tag-graph-connections.md).
    pub node_types: Vec<u8>,
}

impl LayoutGraph {
    /// Build the dense layout graph from a `NoteGraph`, collapsing the sparse
    /// arena ids into `0..n`. Nodes are the union of every note that has
    /// outgoing links and every note referenced as a link target (so dangling
    /// link targets appear as nodes, matching Obsidian with "existing files
    /// only" off) **plus every tag node** (notes link to the tags they carry,
    /// and nested tags link parent->child, so the tag tree is present). Edges are
    /// the forward links.
    pub fn from_note_graph(g: &NoteGraph) -> Self {
        let mut ids: Vec<NodeId> = g
            .forward_links
            .keys()
            .chain(g.back_links.keys())
            .copied()
            .collect();
        ids.sort_unstable();
        ids.dedup();

        let remap: HashMap<NodeId, u32> = ids
            .iter()
            .enumerate()
            .map(|(i, id)| (*id, i as u32))
            .collect();

        let mut degree = vec![0u32; ids.len()];
        let mut edges = Vec::new();
        for (src, targets) in &g.forward_links {
            let u = remap[src];
            for t in targets {
                if let Some(&v) = remap.get(t) {
                    edges.push((u, v));
                    degree[u as usize] += 1;
                    degree[v as usize] += 1;
                }
            }
        }

        let node_types = ids
            .iter()
            .map(|id| if g.tag_nodes.contains(id) { 1 } else { 0 })
            .collect::<Vec<_>>();

        Self {
            node_count: ids.len(),
            edges,
            degree,
            node_types,
        }
    }

    pub fn new(node_count: usize, edges: Vec<(u32, u32)>, degree: Vec<u32>, node_types: Vec<u8>) -> Self {
        Self {
            node_count,
            edges,
            degree,
            node_types,
        }
    }
}

/// A Barnes-Hut quadtree node stored in a flat `Vec` arena.
#[derive(Clone, Copy)]
struct Quad {
    /// Bounding-box center and half-extent (box is `2*half` square).
    cx: f32,
    cy: f32,
    half: f32,
    /// Aggregate mass and center of mass (valid once a body lands here).
    mass: f32,
    com_x: f32,
    com_y: f32,
    /// Occupant body index, or -1 for an empty/internal node.
    body: i32,
    /// Child indices into the arena, quadrant order NW, NE, SW, SE; -1 = none.
    children: [i32; 4],
}

const EMPTY: i32 = -1;
const MAX_DEPTH: u32 = 24;
/// Sentinel for "not yet placed" in the BFS reorder remap buffer.
const UNPLACED: usize = usize::MAX;
/// Cooling: layout force is scaled by `alpha`, which decays each step so the
/// graph settles and the render worker can stop ticking (Obsidian-style).
const ALPHA_DECAY: f32 = 0.98;
const ALPHA_MIN: f32 = 0.02;

/// Force-directed simulator over a `LayoutGraph`.
///
/// Positions and velocities are stored as flat `[x0, y0, x1, y1, ...]` `f32`
/// arrays. `step()` advances one fixed timestep; `positions()` returns the
/// buffer for rendering. The same dense index space is shared with `edges()`,
/// so the renderer can draw a line from `edges[i].0` to `edges[i].1` directly.
pub struct ForceGraph {
    n: usize,
    pos: Vec<f32>,
    vel: Vec<f32>,
    mass: Vec<f32>,
    edges: Vec<(u32, u32)>,
    /// Scratch acceleration buffer (reused each step to avoid realloc).
    acc: Vec<f32>,
    /// Barnes-Hut arena, rebuilt + BFS-reordered each step.
    quads: Vec<Quad>,
    /// Reusable traversal stack for repulsion (avoids per-node allocation).
    stack: Vec<usize>,
    /// Reusable remap buffer for the BFS reorder (avoids per-step allocation).
    reorder: Vec<usize>,
    params: GraphParams,
    /// Cooling factor: 1.0 at full force, decays toward ALPHA_MIN as it settles.
    alpha: f32,
}

impl ForceGraph {
    /// Create a simulator and seed positions on a phyllotaxis (sunflower)
    /// spiral so nodes start evenly spread (no collapsed, deep-tree transient).
    pub fn new(layout: &LayoutGraph, params: GraphParams) -> Self {
        let n = layout.node_count;
        let mut pos = vec![0.0f32; n * 2];
        let vel = vec![0.0f32; n * 2];
        let acc = vec![0.0f32; n * 2];

        let golden = std::f32::consts::PI * (3.0 - 5.0_f32.sqrt());
        let c = 8.0f32;
        for i in 0..n {
            let r = c * (i as f32).sqrt();
            let a = i as f32 * golden;
            pos[i * 2] = params.center[0] + r * a.cos();
            pos[i * 2 + 1] = params.center[1] + r * a.sin();
        }

        let mass = layout
            .degree
            .iter()
            .map(|&d| 1.0 + d as f32)
            .collect::<Vec<_>>();

        Self {
            n,
            pos,
            vel,
            mass,
            edges: layout.edges.clone(),
            acc,
            quads: Vec::with_capacity(n * 2),
            stack: Vec::with_capacity(256),
            reorder: Vec::new(),
            params,
            alpha: 1.0,
        }
    }
    /// Current cooling factor (1.0 = full force, decays toward ALPHA_MIN).
    pub fn alpha(&self) -> f32 {
        self.alpha
    }

    /// Restart the simulation (drag a node, reopen the view, etc.).
    pub fn reheat(&mut self) {
        self.alpha = 1.0;
    }


    #[inline]
    pub fn node_count(&self) -> usize {
        self.n
    }

    #[inline]
    pub fn edges(&self) -> &[(u32, u32)] {
        &self.edges
    }

    /// Flat position buffer `[x0, y0, x1, y1, ...]`; ready to ship to WebGL.
    #[inline]
    pub fn positions(&self) -> &[f32] {
        &self.pos
    }

    #[inline]
    pub fn positions_mut(&mut self) -> &mut [f32] {
        &mut self.pos
    }

    /// Pin a node (e.g. while dragging) and cancel its velocity so it stays put.
    pub fn set_position(&mut self, i: usize, x: f32, y: f32) {
        if i < self.n {
            self.pos[i * 2] = x;
            self.pos[i * 2 + 1] = y;
            self.vel[i * 2] = 0.0;
            self.vel[i * 2 + 1] = 0.0;
        }
    }

    /// Advance the simulation by one fixed timestep.
    pub fn step(&mut self) {
        self.build_tree();
        self.compute_forces();
        self.integrate();
        self.alpha = (self.alpha * ALPHA_DECAY).max(ALPHA_MIN);
    }

    fn build_tree(&mut self) {
        self.quads.clear();
        if self.n == 0 {
            return;
        }

        // Root bounds from current positions (with a small margin).
        let mut min_x = f32::INFINITY;
        let mut min_y = f32::INFINITY;
        let mut max_x = f32::NEG_INFINITY;
        let mut max_y = f32::NEG_INFINITY;
        for i in 0..self.n {
            let x = self.pos[i * 2];
            let y = self.pos[i * 2 + 1];
            min_x = min_x.min(x);
            min_y = min_y.min(y);
            max_x = max_x.max(x);
            max_y = max_y.max(y);
        }
        let half = ((max_x - min_x).max(max_y - min_y) * 0.5 + 1.0).max(1.0);
        let cx = (min_x + max_x) * 0.5;
        let cy = (min_y + max_y) * 0.5;

        self.quads.push(Quad {
            cx,
            cy,
            half,
            mass: 0.0,
            com_x: 0.0,
            com_y: 0.0,
            body: EMPTY,
            children: [EMPTY; 4],
        });

        for i in 0..self.n {
            self.insert(0, i as u32, 0);
        }

        // Reorder into BFS layout so each node's children are contiguous. This
        // is what keeps per-step traversal cache-friendly at 25k nodes.
        self.reorder_tree();
    }

    fn insert(&mut self, node: usize, bi: u32, depth: u32) {
        // Extract the body's data before mutating the arena.
        let bx = self.pos[bi as usize * 2];
        let by = self.pos[bi as usize * 2 + 1];
        let m = self.mass[bi as usize];

        // Empty leaf: claim it.
        if self.quads[node].body == EMPTY && self.quads[node].children == [EMPTY; 4] {
            let q = &mut self.quads[node];
            q.body = bi as i32;
            q.mass = m;
            q.com_x = bx;
            q.com_y = by;
            return;
        }

        // Leaf holding a single body: subdivide, push the old body down, then
        // continue as an internal node for `bi`.
        if self.quads[node].body >= 0 {
            let old = self.quads[node].body as u32;
            self.quads[node].body = EMPTY;
            self.subdivide_and_insert(node, old, depth);
            // falls through to internal handling below
        }

        // Internal node: fold `bi` into the running center of mass, then descend.
        {
            let q = &mut self.quads[node];
            let new_mass = q.mass + m;
            q.com_x = (q.com_x * q.mass + bx * m) / new_mass;
            q.com_y = (q.com_y * q.mass + by * m) / new_mass;
            q.mass = new_mass;
        }
        self.subdivide_and_insert(node, bi, depth);
    }

    #[inline]
    fn quadrant(node: &Quad, x: f32, y: f32) -> usize {
        let east = x >= node.cx;
        let south = y >= node.cy;
        ((south as usize) << 1) | (east as usize)
    }

    fn subdivide_and_insert(&mut self, node: usize, bi: u32, depth: u32) {
        if depth >= MAX_DEPTH {
            // Degenerate clustering: stop subdividing and let the body stay
            // aggregated into this node's center of mass.
            return;
        }
        let bx = self.pos[bi as usize * 2];
        let by = self.pos[bi as usize * 2 + 1];

        let quad = Self::quadrant(&self.quads[node], bx, by);
        let child = self.ensure_child(node, quad);
        // `ensure_child` may append to `self.quads`, so no reference is held
        // across the call (hence `bx`/`by` are copied, not borrowed).
        let _ = (&bx, &by);
        self.insert(child, bi, depth + 1);
    }

    fn ensure_child(&mut self, node: usize, quad: usize) -> usize {
        let existing = self.quads[node].children[quad];
        if existing != EMPTY {
            return existing as usize;
        }
        let (cx, cy, half) = {
            let q = &self.quads[node];
            (q.cx, q.cy, q.half)
        };
        let child_half = half * 0.5;
        let (dx, dy) = match quad {
            0 => (-child_half, -child_half), // NW
            1 => (child_half, -child_half),  // NE
            2 => (-child_half, child_half),  // SW
            3 => (child_half, child_half),   // SE
            _ => unreachable!(),
        };
        let child = self.quads.len();
        self.quads.push(Quad {
            cx: cx + dx,
            cy: cy + dy,
            half: child_half,
            mass: 0.0,
            com_x: 0.0,
            com_y: 0.0,
            body: EMPTY,
            children: [EMPTY; 4],
        });
        self.quads[node].children[quad] = child as i32;
        child
    }

    /// Reorder `self.quads` into BFS order so that each node's four children
    /// occupy contiguous slots (roots-first). Traversal then touches mostly
    /// sequential memory instead of random arena offsets.
    fn reorder_tree(&mut self) {
        let count = self.quads.len();
        if count == 0 {
            return;
        }
        self.reorder.clear();
        self.reorder.resize(count, UNPLACED);
        let mut order: Vec<usize> = Vec::with_capacity(count);
        let mut queue: std::collections::VecDeque<usize> = std::collections::VecDeque::new();
        queue.push_back(0);

        while let Some(old) = queue.pop_front() {
            if self.reorder[old] != UNPLACED {
                continue;
            }
            let ni = order.len();
            self.reorder[old] = ni;
            order.push(old);
            for &c in &self.quads[old].children {
                if c != EMPTY {
                    queue.push_back(c as usize);
                }
            }
        }

        let mut reordered = Vec::with_capacity(count);
        for &old in &order {
            let mut q = self.quads[old];
            for c in q.children.iter_mut() {
                if *c != EMPTY {
                    *c = self.reorder[*c as usize] as i32;
                }
            }
            reordered.push(q);
        }
        self.quads = reordered;
    }

    fn compute_forces(&mut self) {
        let theta2 = self.params.theta * self.params.theta;
        let repulsion = self.params.repulsion;

        // Repulsion first (Barnes-Hut), written into `acc`.
        for i in 0..self.n {
            let ix = i * 2;
            let iy = i * 2 + 1;
            let (fx, fy) = Self::repulsion_at(
                &self.quads,
                i as u32,
                self.pos[ix],
                self.pos[iy],
                theta2,
                repulsion,
                &mut self.stack,
            );
            self.acc[ix] = fx;
            self.acc[iy] = fy;
        }

        // Springs: each edge processed once, applied to both endpoints.
        let spring_length = self.params.spring_length;
        let spring_strength = self.params.spring_strength;
        for &(u, v) in &self.edges {
            let ui = u as usize * 2;
            let vi = v as usize * 2;
            let dx = self.pos[ui] - self.pos[vi];
            let dy = self.pos[ui + 1] - self.pos[vi + 1];
            let dist2 = dx * dx + dy * dy + 1e-6;
            let dist = dist2.sqrt();
            let f = spring_strength * (dist - spring_length) / dist;
            let sfx = f * dx;
            let sfy = f * dy;
            self.acc[ui] -= sfx;
            self.acc[ui + 1] -= sfy;
            self.acc[vi] += sfx;
            self.acc[vi + 1] += sfy;
        }

        // Gravity toward center + divide net force by mass to get acceleration.
        let (gx, gy) = (self.params.center[0], self.params.center[1]);
        let gravity = self.params.gravity;
        for i in 0..self.n {
            let ix = i * 2;
            let iy = i * 2 + 1;
            self.acc[ix] += gravity * (gx - self.pos[ix]);
            self.acc[iy] += gravity * (gy - self.pos[iy]);
            let inv_m = 1.0 / self.mass[i];
            self.acc[ix] *= inv_m;
            self.acc[iy] *= inv_m;
        }
    }

    /// Barnes-Hut repulsion acceleration on body `bi` at `(xi, yi)`.
    /// Self-less so the caller can borrow `quads` immutably and `stack`
    /// mutably at the same time (disjoint fields of `ForceGraph`).
    fn repulsion_at(
        quads: &[Quad],
        bi: u32,
        xi: f32,
        yi: f32,
        theta2: f32,
        repulsion: f32,
        stack: &mut Vec<usize>,
    ) -> (f32, f32) {
        let mut fx = 0.0f32;
        let mut fy = 0.0f32;
        if quads.is_empty() {
            return (fx, fy);
        }

        stack.clear();
        stack.push(0usize);
        while let Some(node) = stack.pop() {
            let q = quads[node];
            if q.mass == 0.0 {
                continue;
            }
            // Skip self (a leaf whose only occupant is `bi`).
            if q.body == bi as i32 {
                continue;
            }

            let dx = xi - q.com_x;
            let dy = yi - q.com_y;
            let dist2 = dx * dx + dy * dy + 1e-6;
            let size = 2.0 * q.half;

            let is_leaf = q.body >= 0;
            if is_leaf || size * size < theta2 * dist2 {
                // Treat the whole subtree as a single point mass.
                let dist = dist2.sqrt();
                let inv_d3 = repulsion * q.mass / (dist2 * dist);
                fx += inv_d3 * dx;
                fy += inv_d3 * dy;
            } else {
                for c in q.children.iter() {
                    if *c != EMPTY {
                        stack.push(*c as usize);
                    }
                }
            }
        }
        (fx, fy)
    }

    fn integrate(&mut self) {
        let dt = self.params.dt;
        let damping = self.params.damping;
        let max_v = self.params.max_velocity;
        let alpha = self.alpha;
        for i in 0..self.n {
            let ix = i * 2;
            let iy = i * 2 + 1;
            let mut vx = self.vel[ix] * damping + self.acc[ix] * dt * alpha;
            let mut vy = self.vel[iy] * damping + self.acc[iy] * dt * alpha;
            // Clamp speed to keep the integrator stable on close contacts.
            let speed2 = vx * vx + vy * vy;
            if speed2 > max_v * max_v {
                let s = max_v / speed2.sqrt();
                vx *= s;
                vy *= s;
            }
            self.vel[ix] = vx;
            self.vel[iy] = vy;
            self.pos[ix] += vx * dt;
            self.pos[iy] += vy * dt;
        }
    }

    /// Mean speed across all nodes — a cheap settling metric for tests/tuning.
    pub fn avg_speed(&self) -> f32 {
        if self.n == 0 {
            return 0.0;
        }
        let mut sum = 0.0f32;
        for i in 0..self.n {
            let vx = self.vel[i * 2];
            let vy = self.vel[i * 2 + 1];
            sum += (vx * vx + vy * vy).sqrt();
        }
        sum / self.n as f32
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::arena::StringArena;
    use basalt_types::FileMetadata;

    fn synthetic_graph(n: usize, links_per_node: usize) -> NoteGraph {
        let mut arena = StringArena::new();
        let mut graph = NoteGraph::new();
        let mut state: u64 = 0x1234_5678;
        let mut rng = || {
            // xorshift64* — deterministic, no external dep.
            state ^= state << 13;
            state ^= state >> 7;
            state ^= state << 17;
            state
        };
        for i in 0..n {
            let path = format!("note-{:05}.md", i);
            let mut meta = FileMetadata::new();
            meta.links = (0..links_per_node)
                .map(|_| format!("note-{:05}.md", (rng() as usize) % n))
                .collect();
            graph.add_document(&path, meta, &mut arena);
        }
        graph
    }

    #[test]
    fn layout_graph_remaps_dense_and_preserves_edges() {
        let g = synthetic_graph(50, 2);
        let lg = LayoutGraph::from_note_graph(&g);
        assert_eq!(lg.node_count, 50);
        assert!(!lg.edges.is_empty());
        for &(u, v) in &lg.edges {
            assert!(u < 50 && v < 50);
        }
    }

    #[test]
    fn graph_stays_finite_and_bounded() {
        let g = synthetic_graph(500, 3);
        let lg = LayoutGraph::from_note_graph(&g);
        let mut graph = ForceGraph::new(&lg, GraphParams::default());
        for _ in 0..200 {
            graph.step();
        }
        for &p in graph.positions() {
            assert!(p.is_finite(), "position became non-finite: {p}");
            assert!(p.abs() < 1e6, "position diverged: {p}");
        }
    }

    #[test]
    fn graph_settles_over_time() {
        let g = synthetic_graph(300, 3);
        let lg = LayoutGraph::from_note_graph(&g);
        let mut graph = ForceGraph::new(&lg, GraphParams::default());
        for _ in 0..10 {
            graph.step();
        }
        let early = graph.avg_speed();
        for _ in 0..400 {
            graph.step();
        }
        let late = graph.avg_speed();
        assert!(late < early, "graph did not settle: early={early}, late={late}");
        assert!(late.is_finite());
    }
    #[test]
    fn layout_graph_tags_marked_as_tag_nodes() {
        let mut graph = NoteGraph::new();
        let mut arena = StringArena::new();
        let meta = FileMetadata {
            tags: vec!["area/sub".to_string()],
            ..FileMetadata::new()
        };
        graph.add_document("note.md", meta, &mut arena);

        let lg = LayoutGraph::from_note_graph(&graph);
        // note.md + #area + #area/sub = 3 nodes
        assert_eq!(lg.node_count, 3);
        assert!(
            lg.node_types.iter().any(|&t| t == 1),
            "expected a tag node"
        );
        assert!(
            lg.node_types.iter().any(|&t| t == 0),
            "expected a note node"
        );
    }
}
