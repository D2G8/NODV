import type { ColumnEdit } from "./odv/columns";
import type { ColumnMapping, Dataset } from "./odv/types";

export const SUPABASE_PROJECT_REF = "vyrklvqsoxohvfvkotah";
export const SUPABASE_SQL_EDITOR_URL = `https://supabase.com/dashboard/project/${SUPABASE_PROJECT_REF}/sql/new`;

export const MAX_LIBRARY_BYTES = 25 * 1024 * 1024;
export const MAX_DATASETS_PER_VIEWER = 200;

export const CONTENT_TYPES: Record<string, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xlsm: "application/vnd.ms-excel.sheet.macroEnabled.12",
  xlsb: "application/vnd.ms-excel.sheet.binary.macroEnabled.12",
  xls: "application/vnd.ms-excel",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  tab: "text/tab-separated-values",
  txt: "text/plain",
  dat: "text/plain",
};

export interface ImportSettings {
  sheetName?: string;
  /** Headers as read from the file, before any column edits. */
  headers: string[];
  edits?: ColumnEdit[];
  /** Roles for the columns after edits. */
  mapping: ColumnMapping;
}

export interface SavedDataset {
  id: string;
  name: string;
  file_name: string;
  format: Dataset["format"];
  size_bytes: number;
  station_count: number;
  sample_count: number;
  variable_count: number;
  first_date: string | null;
  last_date: string | null;
  import_settings: ImportSettings;
  created_at: string;
}

/** Error codes the library API answers with, so the UI can explain what to do. */
export type LibraryErrorCode = "not_set_up" | "not_connected" | "sign_in" | "limit" | "bad_request" | "not_found" | "failed";
