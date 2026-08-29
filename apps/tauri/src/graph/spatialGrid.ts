// Uniform spatial grid for O(local) hover hit-testing over node positions.
//
// The graph can hold >=25k nodes; testing every node on each `mousemove`
// (O(n) per event, potentially hundreds of events/sec) is the dominant
// interaction cost. We bin nodes into a uniform screen-space grid once per
// render and answer nearest-within-radius in the few cells around the cursor.
//
// Buffers are reused across builds (reallocated only when the node count or
// grid extent grows) so a steady-state frame allocates nothing.
export class SpatialGrid {
  private cols = 0;
  private rows = 0;
  private minX = 0;
  private minY = 0;
  private cellSize = 1;
  private cellStart = new Int32Array(1);
  private items = new Int32Array(0);
  private screen = new Float32Array(0); // count*2, reused
  private count = 0;

  build(
    positions: Float32Array,
    count: number,
    toScreen: (x: number, y: number) => [number, number],
  ): void {
    this.count = count;
    if (count === 0) {
      this.cols = 0;
      this.rows = 0;
      this.cellStart = new Int32Array(1);
      this.items = new Int32Array(0);
      return;
    }
    if (this.screen.length < count * 2) this.screen = new Float32Array(count * 2);
    const screen = this.screen;

    // Pass 1: project to screen space and find bounds.
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < count; i++) {
      const [sx, sy] = toScreen(positions[i * 2], positions[i * 2 + 1]);
      screen[i * 2] = sx;
      screen[i * 2 + 1] = sy;
      if (sx < minX) minX = sx;
      if (sy < minY) minY = sy;
      if (sx > maxX) maxX = sx;
      if (sy > maxY) maxY = sy;
    }
    const pad = 8;
    minX -= pad;
    minY -= pad;
    maxX += pad;
    maxY += pad;
    const w = Math.max(1e-6, maxX - minX);
    const h = Math.max(1e-6, maxY - minY);
    // ~sqrt(count) cells per axis → roughly one node per cell on average.
    const perAxis = Math.max(1, Math.ceil(Math.sqrt(count)));
    const cellSize = Math.max(w / perAxis, h / perAxis, 1);
    const cols = Math.max(1, Math.ceil(w / cellSize));
    const rows = Math.max(1, Math.ceil(h / cellSize));
    this.cols = cols;
    this.rows = rows;
    this.minX = minX;
    this.minY = minY;
    this.cellSize = cellSize;

    const cellCount = cols * rows;
    if (this.cellStart.length < cellCount + 1) {
      this.cellStart = new Int32Array(cellCount + 1);
    }
    const cellStart = this.cellStart;
    cellStart.fill(0);

    // Pass 2: count nodes per cell (recompute cell inline).
    for (let i = 0; i < count; i++) {
      const c = this.cellOf(screen[i * 2], screen[i * 2 + 1]);
      cellStart[c + 1]++;
    }
    for (let c = 0; c < cellCount; c++) cellStart[c + 1] += cellStart[c];

    if (this.items.length < count) this.items = new Int32Array(count);
    const items = this.items;
    const cursor = new Int32Array(cellCount);
    for (let c = 0; c < cellCount; c++) cursor[c] = cellStart[c];
    // Pass 3: scatter node indices into their cells.
    for (let i = 0; i < count; i++) {
      const c = this.cellOf(screen[i * 2], screen[i * 2 + 1]);
      items[cursor[c]++] = i;
    }
  }

  /** Nearest node within `radius` screen px of (qx, qy), or -1. */
  query(qx: number, qy: number, radius: number): number {
    if (this.count === 0) return -1;
    const cellSize = this.cellSize;
    const cx = Math.floor((qx - this.minX) / cellSize);
    const cy = Math.floor((qy - this.minY) / cellSize);
    const cols = this.cols;
    const rows = this.rows;
    const cellRadius = Math.ceil(radius / cellSize) + 1;
    const gx0 = Math.max(0, cx - cellRadius);
    const gx1 = Math.min(cols - 1, cx + cellRadius);
    const gy0 = Math.max(0, cy - cellRadius);
    const gy1 = Math.min(rows - 1, cy + cellRadius);
    const screen = this.screen;
    const items = this.items;
    const cellStart = this.cellStart;
    let best = -1;
    let bestD = radius * radius;
    for (let gy = gy0; gy <= gy1; gy++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const c = gx + gy * cols;
        const start = cellStart[c];
        const end = cellStart[c + 1];
        for (let k = start; k < end; k++) {
          const i = items[k];
          const dx = screen[i * 2] - qx;
          const dy = screen[i * 2 + 1] - qy;
          const d = dx * dx + dy * dy;
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
      }
    }
    return best;
  }

  private cellOf(sx: number, sy: number): number {
    const cols = this.cols;
    const rows = this.rows;
    let cx = Math.floor((sx - this.minX) / this.cellSize);
    let cy = Math.floor((sy - this.minY) / this.cellSize);
    if (cx < 0) cx = 0;
    else if (cx >= cols) cx = cols - 1;
    if (cy < 0) cy = 0;
    else if (cy >= rows) cy = rows - 1;
    return cx + cy * cols;
  }
}
