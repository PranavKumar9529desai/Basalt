use super::layout_graph::LayoutGraph;
use super::params::GraphParams;

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
