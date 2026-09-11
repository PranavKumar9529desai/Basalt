use super::layout_graph::LayoutGraph;
use super::params::GraphParams;
use super::quadtree::QuadTree;

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
    /// Barnes-Hut quadtree, rebuilt + BFS-reordered each step.
    tree: QuadTree,
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
            tree: QuadTree::with_capacity(n),
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

    /// Rebuild the Barnes-Hut quadtree from current positions.
    fn build_tree(&mut self) {
        self.tree.build(&self.pos, &self.mass);
    }

    fn compute_forces(&mut self) {
        let theta2 = self.params.theta * self.params.theta;
        let repulsion = self.params.repulsion;

        // Repulsion first (Barnes-Hut), written into `acc`.
        for i in 0..self.n {
            let ix = i * 2;
            let iy = i * 2 + 1;
            let (fx, fy) =
                self.tree
                    .repulsion_at(i as u32, self.pos[ix], self.pos[iy], theta2, repulsion);
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
        let (acc_chunks, _) = self.acc.as_chunks_mut::<2>();
        let (pos_chunks, _) = self.pos.as_chunks::<2>();
        for (i, (a, p)) in acc_chunks.iter_mut().zip(pos_chunks).enumerate() {
            let inv_m = 1.0 / self.mass[i];
            a[0] = (a[0] + gravity * (gx - p[0])) * inv_m;
            a[1] = (a[1] + gravity * (gy - p[1])) * inv_m;
        }
    }

    fn integrate(&mut self) {
        let dt = self.params.dt;
        let damping = self.params.damping;
        let max_v = self.params.max_velocity;
        let max_v2 = max_v * max_v;
        let dt_alpha = dt * self.alpha;
        let (vel_chunks, _) = self.vel.as_chunks_mut::<2>();
        let (pos_chunks, _) = self.pos.as_chunks_mut::<2>();
        let (acc_chunks, _) = self.acc.as_chunks::<2>();
        for (v, (p, a)) in vel_chunks
            .iter_mut()
            .zip(pos_chunks.iter_mut().zip(acc_chunks))
        {
            let mut vx = v[0] * damping + a[0] * dt_alpha;
            let mut vy = v[1] * damping + a[1] * dt_alpha;
            // Clamp speed to keep the integrator stable on close contacts.
            let speed2 = vx * vx + vy * vy;
            if speed2 > max_v2 {
                let s = max_v / speed2.sqrt();
                vx *= s;
                vy *= s;
            }
            v[0] = vx;
            v[1] = vy;
            p[0] += vx * dt;
            p[1] += vy * dt;
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
