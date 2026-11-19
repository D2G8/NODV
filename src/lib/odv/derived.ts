import { variableLabel } from "./build";
import type { Dataset, Variable } from "./types";

/** Potential temperature (°C) referenced to 0 dbar, Bryden (1973) polynomial. */
export function potentialTemperature(s: number, t: number, p: number) {
  const ds = s - 35;
  return (
    t -
    p * (3.6504e-4 + t * (8.3198e-5 + t * (-5.4065e-7 + t * 4.0274e-9))) -
    p * ds * (1.7439e-5 - t * 2.9778e-7) -
    p * p * (8.9309e-7 + t * (-3.1628e-8 + t * 2.1987e-10)) +
    4.1057e-9 * ds * p * p -
    p * p * p * (-1.6056e-10 + t * 5.0484e-12)
  );
}

/** Seawater density (kg/m³) at atmospheric pressure, UNESCO EOS-80. */
export function densityAtSurface(s: number, t: number) {
  const rhoW =
    999.842594 +
    t * (6.793952e-2 + t * (-9.09529e-3 + t * (1.001685e-4 + t * (-1.120083e-6 + t * 6.536332e-9))));
  const a = 8.24493e-1 + t * (-4.0899e-3 + t * (7.6438e-5 + t * (-8.2467e-7 + t * 5.3875e-9)));
  const b = -5.72466e-3 + t * (1.0227e-4 - t * 1.6546e-6);
  const c = 4.8314e-4;
  return rhoW + a * s + b * Math.pow(Math.max(s, 0), 1.5) + c * s * s;
}

export function guessTemperature(vars: Variable[]) {
  return vars.findIndex((v) => /^(temp|temperature|t\d*|t90|t68|its-?90|water temp|sea temp|sst|ctd temp)/i.test(v.name) && !/potential|theta/i.test(v.name));
}

export function guessSalinity(vars: Variable[]) {
  return vars.findIndex((v) => /^(sal|psal|practical sal|s\b|salinity)/i.test(v.name));
}

/**
 * Adds potential temperature and potential density anomaly (σθ) as derived variables.
 * Pressure in dbar is approximated by depth in metres when the primary variable is depth.
 */
export function addDensityVariables(ds: Dataset, tIndex: number, sIndex: number): Dataset {
  const used = new Set(ds.variables.map((v) => v.key));
  const mk = (base: string, name: string, unit: string): Variable => {
    let key = base;
    let i = 2;
    while (used.has(key)) key = `${base}_${i++}`;
    used.add(key);
    return { key, name, unit, label: variableLabel(name, unit), derived: true };
  };
  const theta = mk("theta", "Potential temperature θ", "°C");
  const sigma = mk("sigma_theta", "Potential density anomaly σθ", "kg/m³");

  const stations = ds.stations.map((st) => {
    const p = st.data[ds.primaryIndex];
    const t = st.data[tIndex];
    const s = st.data[sIndex];
    const th = new Float64Array(st.n);
    const sg = new Float64Array(st.n);
    for (let i = 0; i < st.n; i++) {
      const pp = Number.isNaN(p[i]) ? 0 : Math.max(0, p[i]);
      if (Number.isNaN(t[i]) || Number.isNaN(s[i])) {
        th[i] = NaN;
        sg[i] = NaN;
        continue;
      }
      th[i] = potentialTemperature(s[i], t[i], pp);
      sg[i] = densityAtSurface(s[i], th[i]) - 1000;
    }
    return { ...st, data: [...st.data, th, sg] };
  });
  return { ...ds, variables: [...ds.variables, theta, sigma], stations };
}
