export type ColorScale = [number, string][];

function even(colors: string[]): ColorScale {
  return colors.map((c, i) => [i / (colors.length - 1), c]);
}

export const COLOR_SCALES: Record<string, { label: string; scale: ColorScale }> = {
  odv: {
    label: "ODV classic",
    scale: even(["#5c1e8f", "#3d3dd6", "#1f8fe6", "#22c7c7", "#3fc46b", "#c4d83a", "#f5c22e", "#f07c1f", "#d7261e", "#8c1010"]),
  },
  thermal: {
    label: "Thermal",
    scale: even(["#042333", "#2c3395", "#744992", "#b15f82", "#eb7958", "#fbb43d", "#e8fa5b"]),
  },
  haline: {
    label: "Haline",
    scale: even(["#2a186c", "#14439c", "#206e8b", "#3c9387", "#5ab978", "#aad85c", "#fdef9a"]),
  },
  oxy: {
    label: "Oxygen",
    scale: even(["#400505", "#850a0b", "#6f6f6e", "#9b9a9a", "#cbcac9", "#ebf34b", "#ddaf19"]),
  },
  algae: {
    label: "Algae",
    scale: even(["#d7f9d0", "#8fd28a", "#4fa75b", "#25793f", "#14532b", "#0b3d1c"]),
  },
  deep: {
    label: "Deep",
    scale: even(["#fdfecc", "#a3e1b5", "#5dbcad", "#3a8ca7", "#3f5a9a", "#3d3170", "#281a2c"]),
  },
  viridis: {
    label: "Viridis",
    scale: even(["#440154", "#482878", "#3e4989", "#31688e", "#26828e", "#1f9e89", "#35b779", "#6ece58", "#b5de2b", "#fde725"]),
  },
  balance: {
    label: "Balance (diverging)",
    scale: even(["#181c43", "#0c5ebe", "#75aabe", "#f1eceb", "#d08b73", "#a52125", "#3c0912"]),
  },
};

export type ColorScaleId = keyof typeof COLOR_SCALES;

function hexToRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function sampleScale(scale: ColorScale, t: number) {
  const tt = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0));
  for (let i = 1; i < scale.length; i++) {
    if (tt <= scale[i][0]) {
      const [t0, c0] = scale[i - 1];
      const [t1, c1] = scale[i];
      const f = (tt - t0) / (t1 - t0 || 1);
      const a = hexToRgb(c0);
      const b = hexToRgb(c1);
      return `rgb(${a.map((v, k) => Math.round(v + f * (b[k] - v))).join(",")})`;
    }
  }
  return scale[scale.length - 1][1];
}

export function cssGradient(scale: ColorScale) {
  return `linear-gradient(to right, ${scale.map(([t, c]) => `${c} ${t * 100}%`).join(", ")})`;
}
