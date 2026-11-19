import type { RawCell, RawTable } from "./types";

export type MergeHow = "interval" | "mean" | "sum" | "min" | "max" | "first" | "join";

/** A change to the columns of an imported table. Columns are referred to by header name. */
export type ColumnEdit =
  | { id: string; op: "rename"; column: string; name: string }
  | { id: string; op: "delete"; column: string }
  | { id: string; op: "merge"; columns: string[]; name: string; how: MergeHow }
  | { id: string; op: "add"; name: string; formula: string };

export const MERGE_LABELS: Record<MergeHow, string> = {
  interval: "Interval (from–to)",
  mean: "Average",
  sum: "Sum",
  min: "Smallest value",
  max: "Largest value",
  first: "First non-empty value",
  join: "Join as text",
};

export const MERGE_HINTS: Record<MergeHow, string> = {
  interval: "Two depth limits become one value such as 700–500, used as the sample's depth interval.",
  mean: "The average of the numbers in each row.",
  sum: "The numbers in each row added together.",
  min: "The smallest number in each row.",
  max: "The largest number in each row.",
  first: "Takes the first column that has a value in each row, e.g. to fill gaps from a backup column.",
  join: "Puts the cells side by side as text, e.g. two remark columns or a code and a number.",
};

const RANGE = /^\s*(-?\d+(?:[.,]\d+)?)\s*(?:–|—|-|to|→|\/|\.\.)\s*(-?\d+(?:[.,]\d+)?)\s*(?:m|dbar)?\s*$/i;

/** Reads "700–500", "0-50 m" or "40 to 0" as a pair of numbers. */
export function parseRange(v: RawCell): [number, number] | null {
  if (typeof v !== "string") return null;
  const m = v.match(RANGE);
  if (!m) return null;
  const a = Number(m[1].replace(",", "."));
  const b = Number(m[2].replace(",", "."));
  return Number.isFinite(a) && Number.isFinite(b) ? [a, b] : null;
}

export function formatRange(a: number, b: number) {
  return `${a}–${b}`;
}

const toNumber = (v: RawCell) => {
  if (typeof v === "number") return v;
  if (v === null) return NaN;
  const s = v.trim().replace(/^(-?\d+),(\d+)$/, "$1.$2");
  return s === "" ? NaN : Number(s);
};

let counter = 0;
export function editId() {
  counter += 1;
  return `e${Date.now().toString(36)}${counter}`;
}

export interface EditResult {
  table: RawTable;
  /** Problems keyed by edit id, e.g. a column that no longer exists. */
  problems: Record<string, string>;
}

/** Applies column edits in order. Edits that can't be applied are skipped and reported. */
export function applyEdits(source: RawTable, edits: ColumnEdit[]): EditResult {
  let headers = [...source.headers];
  let rows = source.rows.map((r) => [...r]);
  const metaSet = new Set(source.metaColumns ?? []);
  let meta = headers.map((_, i) => metaSet.has(i));
  const problems: Record<string, string> = {};
  const indexOf = (name: string) => headers.indexOf(name);
  const taken = (name: string, except = -1) => headers.some((h, i) => i !== except && h === name);

  for (const e of edits) {
    if (e.op === "rename") {
      const c = indexOf(e.column);
      const name = e.name.trim();
      if (c < 0) problems[e.id] = `There is no column called “${e.column}”.`;
      else if (!name) problems[e.id] = "The new name is empty.";
      else if (taken(name, c)) problems[e.id] = `Another column is already called “${name}”.`;
      else headers[c] = name;
    } else if (e.op === "delete") {
      const c = indexOf(e.column);
      if (c < 0) {
        problems[e.id] = `There is no column called “${e.column}”.`;
        continue;
      }
      headers = headers.filter((_, i) => i !== c);
      meta = meta.filter((_, i) => i !== c);
      rows = rows.map((r) => r.filter((_, i) => i !== c));
    } else if (e.op === "merge") {
      const cols = e.columns.map(indexOf);
      const name = e.name.trim();
      if (cols.some((c) => c < 0)) {
        problems[e.id] = `Column “${e.columns[cols.findIndex((c) => c < 0)]}” no longer exists.`;
        continue;
      }
      if (cols.length < 2) {
        problems[e.id] = "Pick at least two columns to merge.";
        continue;
      }
      if (!name) {
        problems[e.id] = "The merged column needs a name.";
        continue;
      }
      if (headers.some((h, i) => h === name && !cols.includes(i))) {
        problems[e.id] = `Another column is already called “${name}”.`;
        continue;
      }
      const at = Math.min(...cols);
      const merged = rows.map((r) => mergeCells(cols.map((c) => r[c]), e.how));
      const drop = new Set(cols);
      const keepMeta = cols.every((c) => meta[c]);
      const insert = <T,>(arr: T[], value: T) => {
        const out: T[] = [];
        arr.forEach((v, i) => {
          if (i === at) out.push(value);
          if (!drop.has(i)) out.push(v);
        });
        return out;
      };
      headers = insert(headers, name);
      meta = insert(meta, keepMeta);
      rows = rows.map((r, k) => insert(r, merged[k]));
    } else {
      const name = e.name.trim();
      if (!name) {
        problems[e.id] = "The new column needs a name.";
        continue;
      }
      if (taken(name)) {
        problems[e.id] = `Another column is already called “${name}”.`;
        continue;
      }
      let compute: (row: RawCell[]) => RawCell;
      try {
        compute = compileFormula(e.formula, headers);
      } catch (err) {
        problems[e.id] = err instanceof Error ? err.message : String(err);
        continue;
      }
      headers = [...headers, name];
      meta = [...meta, false];
      rows = rows.map((r) => [...r, compute(r)]);
    }
  }

  const metaColumns = meta.map((m, i) => (m ? i : -1)).filter((i) => i >= 0);
  return { table: { ...source, headers, rows, metaColumns }, problems };
}

function mergeCells(cells: RawCell[], how: MergeHow): RawCell {
  const present = cells.filter((c) => c !== null && String(c).trim() !== "");
  if (present.length === 0) return null;
  if (how === "first") return present[0];
  if (how === "join") return present.map(String).join(" ");
  const nums = present.map(toNumber).filter((n) => !Number.isNaN(n));
  if (how === "interval") {
    if (nums.length === 0) return present.map(String).join("–");
    if (nums.length === 1) return nums[0];
    return nums.length === 2 ? formatRange(nums[0], nums[1]) : formatRange(Math.max(...nums), Math.min(...nums));
  }
  if (nums.length === 0) return null;
  if (how === "sum") return nums.reduce((a, b) => a + b, 0);
  if (how === "min") return Math.min(...nums);
  if (how === "max") return Math.max(...nums);
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/** Suggests a merge name from the headers' shared start, e.g. "Depth interval" for "Depth interval From top/bottom". */
export function suggestMergeName(columns: string[]) {
  if (columns.length === 0) return "";
  let prefix = columns[0];
  for (const c of columns.slice(1)) while (!c.startsWith(prefix)) prefix = prefix.slice(0, -1);
  if (columns.some((c) => c.length > prefix.length && /\w/.test(c[prefix.length]) && /\w$/.test(prefix)))
    prefix = prefix.replace(/\w+$/, "");
  let prev = "";
  while (prev !== prefix) {
    prev = prefix;
    prefix = prefix
      .replace(/[\s(/:,-]+$/, "")
      .replace(/\b(from|to|top|bottom|min|max|start|end|upper|lower|shallow|deep|open|close)$/i, "")
      .trim();
  }
  if (prefix.length >= 3) return prefix;
  if (columns.every((c) => /depth|pressure/i.test(c))) {
    const units = [...new Set(columns.map((c) => c.match(/[[(]([^\])]+)[\])]\s*$/)?.[1]).filter(Boolean))];
    return `Depth interval${units.length === 1 ? ` [${units[0]}]` : ""}`;
  }
  return columns.join(" + ");
}

// ---- Formulas -------------------------------------------------------------------------------
// "=" starts a formula, e.g. "=([From bottom] + [From top]) / 2"; anything else is a fixed value
// copied into every row ("MultiNet", 200). Formulas are parsed here, never passed to eval.

const FUNCTIONS: Record<string, (...a: number[]) => number> = {
  abs: Math.abs,
  sqrt: Math.sqrt,
  exp: Math.exp,
  ln: Math.log,
  log: Math.log10,
  log10: Math.log10,
  round: (x, d = 0) => Math.round(x * 10 ** d) / 10 ** d,
  floor: Math.floor,
  ceil: Math.ceil,
  min: (...a) => Math.min(...a),
  max: (...a) => Math.max(...a),
  mean: (...a) => a.reduce((s, x) => s + x, 0) / a.length,
};

type Token = { t: "num"; v: number } | { t: "col"; v: string } | { t: "id"; v: string } | { t: "op"; v: string };

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i++;
    } else if (ch === "[") {
      const end = src.indexOf("]", i);
      if (end < 0) throw new Error("A column name in square brackets isn’t closed with ].");
      out.push({ t: "col", v: src.slice(i + 1, end) });
      i = end + 1;
    } else if (/[0-9.]/.test(ch)) {
      const m = src.slice(i).match(/^\d*\.?\d+(?:e[+-]?\d+)?/i);
      if (!m) throw new Error(`Unexpected “${ch}” in the formula.`);
      out.push({ t: "num", v: Number(m[0]) });
      i += m[0].length;
    } else if (/[a-z_]/i.test(ch)) {
      const m = src.slice(i).match(/^[a-z_][a-z0-9_]*/i)!;
      out.push({ t: "id", v: m[0].toLowerCase() });
      i += m[0].length;
    } else if ("+-*/^(),".includes(ch)) {
      out.push({ t: "op", v: ch });
      i++;
    } else {
      throw new Error(`Unexpected “${ch}” in the formula.`);
    }
  }
  return out;
}

type Node =
  | { k: "num"; v: number }
  | { k: "col"; index: number }
  | { k: "neg"; a: Node }
  | { k: "bin"; op: string; a: Node; b: Node }
  | { k: "call"; fn: (...a: number[]) => number; args: Node[] };

function parse(tokens: Token[], headers: string[]): Node {
  let pos = 0;
  const peek = () => tokens[pos];
  const isOp = (v: string) => peek()?.t === "op" && peek()!.v === v;
  const expect = (v: string) => {
    if (!isOp(v)) throw new Error(`Expected “${v}” in the formula.`);
    pos++;
  };
  const expr = (): Node => {
    let a = term();
    while (isOp("+") || isOp("-")) {
      const op = tokens[pos++].v as string;
      a = { k: "bin", op, a, b: term() };
    }
    return a;
  };
  const term = (): Node => {
    let a = power();
    while (isOp("*") || isOp("/")) {
      const op = tokens[pos++].v as string;
      a = { k: "bin", op, a, b: power() };
    }
    return a;
  };
  const power = (): Node => {
    const a = unary();
    if (isOp("^")) {
      pos++;
      return { k: "bin", op: "^", a, b: power() };
    }
    return a;
  };
  const unary = (): Node => {
    if (isOp("-")) {
      pos++;
      return { k: "neg", a: unary() };
    }
    if (isOp("+")) {
      pos++;
      return unary();
    }
    return atom();
  };
  const atom = (): Node => {
    const tok = tokens[pos++];
    if (!tok) throw new Error("The formula ends too early.");
    if (tok.t === "num") return { k: "num", v: tok.v };
    if (tok.t === "col") {
      const index = headers.indexOf(tok.v);
      if (index < 0) throw new Error(`There is no column called “${tok.v}”.`);
      return { k: "col", index };
    }
    if (tok.t === "id") {
      const fn = FUNCTIONS[tok.v];
      if (!fn) throw new Error(`Unknown function “${tok.v}”. Put column names in [square brackets].`);
      expect("(");
      const args: Node[] = [];
      if (!isOp(")")) {
        args.push(expr());
        while (isOp(",")) {
          pos++;
          args.push(expr());
        }
      }
      expect(")");
      return { k: "call", fn, args };
    }
    if (tok.v === "(") {
      const inner = expr();
      expect(")");
      return inner;
    }
    throw new Error(`Unexpected “${tok.v}” in the formula.`);
  };
  const tree = expr();
  if (pos < tokens.length) throw new Error(`Unexpected “${String(tokens[pos].v)}” in the formula.`);
  return tree;
}

function evaluate(n: Node, row: RawCell[]): number {
  switch (n.k) {
    case "num":
      return n.v;
    case "col":
      return toNumber(row[n.index]);
    case "neg":
      return -evaluate(n.a, row);
    case "call":
      return n.fn(...n.args.map((a) => evaluate(a, row)));
    case "bin": {
      const a = evaluate(n.a, row);
      const b = evaluate(n.b, row);
      if (n.op === "+") return a + b;
      if (n.op === "-") return a - b;
      if (n.op === "*") return a * b;
      if (n.op === "/") return a / b;
      return a ** b;
    }
  }
}

export function compileFormula(formula: string, headers: string[]): (row: RawCell[]) => RawCell {
  const text = formula.trim();
  if (!text.startsWith("=")) {
    const value: RawCell = text === "" ? null : Number.isFinite(Number(text)) ? Number(text) : text;
    return () => value;
  }
  const tree = parse(tokenize(text.slice(1)), headers);
  return (row) => {
    const v = evaluate(tree, row);
    return Number.isFinite(v) ? v : null;
  };
}
