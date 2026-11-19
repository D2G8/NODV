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

export type ColumnRole = MetaRole | "primary" | "variable" | "metadata" | "ignore";

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
  /** Column-major sample values: data[variableIndex][sampleIndex]. NaN = missing. */
  data: Float64Array[];
  n: number;
}

export interface Dataset {
  name: string;
  fileName: string;
  format: SourceFormat;
  variables: Variable[];
  primaryIndex: number;
  extraKeys: string[];
  stations: Station[];
  warnings: string[];
}
