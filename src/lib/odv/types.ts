export type RawCell = string | number | null;

export type SourceFormat = "odv" | "csv" | "excel";

export interface RawTable {
  fileName: string;
  format: SourceFormat;
  headers: string[];
  rows: RawCell[][];
  comments: string[];
  sheetName?: string;
  sheetNames?: string[];
  /** Columns that came from per-station header blocks; never treated as data variables. */
  metaColumns?: number[];
  notice?: string;
}

export type MetaRole =
  | "cruise"
  | "station"
  | "type"
  | "date"
  | "time"
  | "lon"
  | "lat"
  | "botDepth";

export type ColumnRole =
  | MetaRole
  | "primary"
  | "variable"
  | "intervalTop"
  | "intervalBottom"
  | "metadata"
  | "note"
  | "ignore";

export interface ColumnMapping {
  roles: ColumnRole[];
  missingValues: number[];
  dayFirst: boolean;
}

export interface Variable {
  key: string;
  name: string;
  unit: string;
  label: string;
  derived?: boolean;
  /** Describes how a sample was taken (e.g. a net's depth limits) rather than something measured. */
  sampling?: boolean;
}

export interface Station {
  index: number;
  cruise: string;
  station: string;
  type: string;
  /** Epoch milliseconds, UTC. */
  date: number | null;
  lon: number;
  lat: number;
  botDepth: number | null;
  extra: Record<string, string>;
  /** Per-sample text (e.g. net or bottle IDs, remarks), aligned with the sample index. */
  notes: Record<string, string[]>;
  /** Column-major sample values: data[variableIndex][sampleIndex]. NaN = missing. */
  data: Float64Array[];
  n: number;
  /** Sample indices in the order the rows appear in the source file (data is sorted by the primary variable). */
  fileOrder: number[];
}

/** A dataset column in source-file order: a numeric variable or a per-sample text column. */
export type DatasetColumn = { kind: "variable"; index: number } | { kind: "note"; key: string };

export interface SummaryCheck {
  level: "warning" | "info";
  text: string;
}

/** A plain-language reading of what a file contains, built at import time. */
export interface FileSummary {
  kind: string;
  headline: string;
  facts: { label: string; value: string }[];
  checks: SummaryCheck[];
  /** Variable indices that are measurements (not the depth axis or sampling descriptors). */
  measured: number[];
}

export interface Dataset {
  name: string;
  fileName: string;
  format: SourceFormat;
  variables: Variable[];
  primaryIndex: number;
  extraKeys: string[];
  noteKeys: string[];
  /** Variable indices of a sampling interval's shallow and deep bounds (net tows, integrated samples). */
  interval?: { top: number; bottom: number };
  /** Columns in the order they appear in the source file. */
  columns: DatasetColumn[];
  stations: Station[];
  warnings: string[];
  summary: FileSummary;
}
