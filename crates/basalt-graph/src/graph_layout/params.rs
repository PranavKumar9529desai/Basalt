/// Tunable physics constants. Defaults chosen for a stable, quickly-settling
/// layout at 25k nodes; tune these for visual quality on smaller graphs.
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
