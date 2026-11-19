export interface GridInput {
  x: ArrayLike<number>;
  y: ArrayLike<number>;
  z: ArrayLike<number>;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  nx: number;
  ny: number;
  /** Scale lengths in per mille of the axis range, as in ODV's weighted-average gridding. */
  xScale: number;
  yScale: number;
  /** Nodes whose summed Gaussian weight falls below this are left blank. */
  qualityLimit: number;
}

export interface GridResult {
  xs: number[];
  ys: number[];
  z: (number | null)[][];
}

const SEARCH = 3;

export function weightedAverageGrid(input: GridInput): GridResult {
  const { x, y, z, xMin, xMax, yMin, yMax, nx, ny, qualityLimit } = input;
  const xr = xMax - xMin || 1;
  const yr = yMax - yMin || 1;
  const lx = Math.max(1e-9, (input.xScale / 1000) * xr);
  const ly = Math.max(1e-9, (input.yScale / 1000) * yr);

  const bx = Math.max(1, Math.ceil(xr / lx));
  const by = Math.max(1, Math.ceil(yr / ly));
  const buckets: number[][] = Array.from({ length: bx * by }, () => []);
  for (let i = 0; i < z.length; i++) {
    if (!Number.isFinite(x[i]) || !Number.isFinite(y[i]) || !Number.isFinite(z[i])) continue;
    const cx = Math.min(bx - 1, Math.max(0, Math.floor((x[i] - xMin) / lx)));
    const cy = Math.min(by - 1, Math.max(0, Math.floor((y[i] - yMin) / ly)));
    buckets[cy * bx + cx].push(i);
  }

  const xs = Array.from({ length: nx }, (_, i) => xMin + (i / (nx - 1)) * xr);
  const ys = Array.from({ length: ny }, (_, j) => yMin + (j / (ny - 1)) * yr);
  const out: (number | null)[][] = [];

  for (let j = 0; j < ny; j++) {
    const gy = ys[j];
    const cy = Math.min(by - 1, Math.floor((gy - yMin) / ly));
    const row: (number | null)[] = new Array(nx);
    for (let i = 0; i < nx; i++) {
      const gx = xs[i];
      const cx = Math.min(bx - 1, Math.floor((gx - xMin) / lx));
      let sw = 0;
      let swz = 0;
      for (let yy = Math.max(0, cy - SEARCH); yy <= Math.min(by - 1, cy + SEARCH); yy++) {
        for (let xx = Math.max(0, cx - SEARCH); xx <= Math.min(bx - 1, cx + SEARCH); xx++) {
          const b = buckets[yy * bx + xx];
          for (let k = 0; k < b.length; k++) {
            const p = b[k];
            const dx = (x[p] - gx) / lx;
            const dy = (y[p] - gy) / ly;
            const d2 = dx * dx + dy * dy;
            if (d2 > SEARCH * SEARCH) continue;
            const w = Math.exp(-d2);
            sw += w;
            swz += w * z[p];
          }
        }
      }
      row[i] = sw >= qualityLimit ? swz / sw : null;
    }
    out.push(row);
  }
  return { xs, ys, z: out };
}
