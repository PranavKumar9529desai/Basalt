//! Spatial quadtree for O(n log n) Barnes-Hut repulsion (ADR-038 §3 split of
//! force_graph.rs).
//!
//! Arena-based (`Vec<Quad>`) and rebuilt every step from current positions,
//! then *reordered into BFS layout* so that a node's four children occupy
//! contiguous slots. Barnes-Hut traversal is otherwise random-access and
//! cache-thrash bound at 25k nodes; the BFS reorder keeps per-step traversal
//! cache-friendly at that scale (see the `graph_layout` module docs).

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

/// Barnes-Hut quadtree over a body arena, rebuilt and BFS-reordered each step.
///
/// Owns the flat `Vec` arena plus the traversal/reorder scratch buffers, so
/// the force simulation only steers bodies.
pub(super) struct QuadTree {
    /// Barnes-Hut arena, rebuilt + BFS-reordered each step.
    quads: Vec<Quad>,
    /// Reusable traversal stack for repulsion (avoids per-node allocation).
    stack: Vec<usize>,
    /// Reusable remap buffer for the BFS reorder (avoids per-step allocation).
    reorder: Vec<usize>,
    /// Reusable BFS traversal order (old-slot → new-slot), reused each step.
    order: Vec<usize>,
    /// Reusable BFS queue, reused each step.
    queue: std::collections::VecDeque<usize>,
    /// Reusable output quads for the BFS reorder, reused each step.
    reordered: Vec<Quad>,
}

impl QuadTree {
    /// Scratch buffers sized for `n` bodies (the arena itself grows as needed).
    pub(super) fn with_capacity(n: usize) -> Self {
        Self {
            quads: Vec::with_capacity(n * 2),
            stack: Vec::with_capacity(256),
            reorder: Vec::new(),
            order: Vec::new(),
            queue: std::collections::VecDeque::new(),
            reordered: Vec::new(),
        }
    }

    /// Rebuild the tree from the current body positions and masses.
    pub(super) fn build(&mut self, pos: &[f32], mass: &[f32]) {
        self.quads.clear();
        let n = pos.len() / 2;
        if n == 0 {
            return;
        }

        // Root bounds from current positions (with a small margin).
        let mut min_x = f32::INFINITY;
        let mut min_y = f32::INFINITY;
        let mut max_x = f32::NEG_INFINITY;
        let mut max_y = f32::NEG_INFINITY;
        for i in 0..n {
            let x = pos[i * 2];
            let y = pos[i * 2 + 1];
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

        for i in 0..n {
            self.insert(pos, mass, 0, i as u32, 0);
        }

        // Reorder into BFS layout so each node's children are contiguous. This
        // is what keeps per-step traversal cache-friendly at 25k nodes.
        self.reorder_tree();
    }

    fn insert(&mut self, pos: &[f32], mass: &[f32], node: usize, bi: u32, depth: u32) {
        // Extract the body's data before mutating the arena.
        let bx = pos[bi as usize * 2];
        let by = pos[bi as usize * 2 + 1];
        let m = mass[bi as usize];

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
            self.subdivide_and_insert(pos, mass, node, old, depth);
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
        self.subdivide_and_insert(pos, mass, node, bi, depth);
    }

    #[inline]
    fn quadrant(node: &Quad, x: f32, y: f32) -> usize {
        let east = x >= node.cx;
        let south = y >= node.cy;
        ((south as usize) << 1) | (east as usize)
    }

    fn subdivide_and_insert(
        &mut self,
        pos: &[f32],
        mass: &[f32],
        node: usize,
        bi: u32,
        depth: u32,
    ) {
        if depth >= MAX_DEPTH {
            // Degenerate clustering: stop subdividing and let the body stay
            // aggregated into this node's center of mass.
            return;
        }
        let bx = pos[bi as usize * 2];
        let by = pos[bi as usize * 2 + 1];

        let quad = Self::quadrant(&self.quads[node], bx, by);
        let child = self.ensure_child(node, quad);
        self.insert(pos, mass, child, bi, depth + 1);
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

    /// Reorder the arena into BFS order so that each node's four children
    /// occupy contiguous slots (roots-first). Traversal then touches mostly
    /// sequential memory instead of random arena offsets.
    fn reorder_tree(&mut self) {
        let count = self.quads.len();
        if count == 0 {
            return;
        }
        self.reorder.clear();
        self.reorder.resize(count, UNPLACED);
        self.order.clear();
        self.queue.clear();
        self.queue.push_back(0);

        while let Some(old) = self.queue.pop_front() {
            if self.reorder[old] != UNPLACED {
                continue;
            }
            let ni = self.order.len();
            self.reorder[old] = ni;
            self.order.push(old);
            for &c in &self.quads[old].children {
                if c != EMPTY {
                    self.queue.push_back(c as usize);
                }
            }
        }

        self.reordered.clear();
        for &old in &self.order {
            let mut q = self.quads[old];
            for c in q.children.iter_mut() {
                if *c != EMPTY {
                    *c = self.reorder[*c as usize] as i32;
                }
            }
            self.reordered.push(q);
        }
        std::mem::swap(&mut self.quads, &mut self.reordered);
    }

    /// Barnes-Hut repulsion acceleration on body `bi` at `(xi, yi)`.
    ///
    /// Uses the reusable traversal stack for the walk (no per-node allocation).
    pub(super) fn repulsion_at(
        &mut self,
        bi: u32,
        xi: f32,
        yi: f32,
        theta2: f32,
        repulsion: f32,
    ) -> (f32, f32) {
        let mut fx = 0.0f32;
        let mut fy = 0.0f32;
        if self.quads.is_empty() {
            return (fx, fy);
        }

        self.stack.clear();
        self.stack.push(0usize);
        while let Some(node) = self.stack.pop() {
            let q = self.quads[node];
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
                        self.stack.push(*c as usize);
                    }
                }
            }
        }
        (fx, fy)
    }
}