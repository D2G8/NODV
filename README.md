# Ocean Data Explorer

A modern, browser-based take on [Ocean Data View (ODV)](https://odv.awi.de) for exploring oceanographic
profile data. It reads the same ODV spreadsheet `.txt` files ODV does. It also reads **Excel workbooks
(`.xlsx`, `.xls`, `.ods`) and CSV/TSV files**, so field data can be explored without first converting it.

Everything runs client-side: files are parsed in the browser and never uploaded.

## Features

- **Import**: ODV generic spreadsheet `.txt`, CSV/TSV/semicolon-delimited text, and Excel workbooks.
  - Automatic column-role detection (cruise, station, type, date/date-time, time of day, longitude,
    latitude, bottom depth, depth/pressure, data variables, extra metadata, quality-flag columns).
  - The file is interpreted, not just tabulated: the import dialog says what kind of data it is (CTD
    profiles, bottle profiles, net tow log, fixed-site time series, surface samples), summarises cruise,
    vessel, period, area and depth coverage, separates measurements from sampling descriptors such as a
    net's depth limits, and cross-checks the log (declared vs. listed nets, pooled or split samples,
    gaps between intervals, samples deeper than the seafloor, remarks). The same description is
    available from the sidebar after import, and tables keep the file's own row and column order.
  - A review dialog lets you correct any column role, pick a worksheet, set missing-value codes (for
    example `-999`), and choose day-first dates.
  - Column editing before import: merge two or more columns into one (as a depth interval such as
    `700–500`, or by mean, sum, min, max, first value, or joined text), add a column holding a fixed value
    or a formula such as `=[Bottom depth] / 1000`, and rename or delete columns. Separate "from" and "to"
    depth columns are merged into one depth-interval column automatically. Every edit is listed and can
    be changed or undone, and edits are saved with the file in the library.
  - Two-row headers (for example "Depth interval" over "From" / "To") and merged header cells are read
    as one header per column.
  - Follows ODV conventions: blank metadata cells continue the station above. It also accepts spreadsheets
    where every row repeats the metadata, title rows above the header, Excel date serials, and separate
    date and time columns.
- **Station map**: stations on an ocean basemap. Click a station to select it. Colour stations by any
  variable interpolated to a chosen depth (similar to an ODV surface window), and limit the selection to
  the visible map area.
- **Profiles (station view)**: the current station's profiles for up to six variables, drawn over all
  other stations in grey. Click a grey dot to jump to that station, or use the ← → keys.
- **Scatter**: any variable against any other (for example a T–S diagram), coloured by a third variable,
  with the current station highlighted.
- **Section**: build a section by clicking stations on the map, or use all shown stations. The section is
  drawn as a weighted-average gridded field (ODV-style X/Y scale lengths in ‰ and a quality limit), with
  contours, sample dots, and a seafloor mask. The X axis can be distance, longitude, latitude, or time.
- **Derived variables**: potential temperature θ (Bryden 1973) and potential density anomaly σθ
  (UNESCO EOS-80).
- **Filters**: by cruise, date range, and map area.
- **Export** the shown stations as an ODV spreadsheet (`.txt`, ready to open in ODV), an Excel workbook,
  or CSV. Every plot can be saved as a high-resolution PNG from its toolbar.

- **Station-per-sheet workbooks**: field logs that put each station on its own worksheet are combined
  into one dataset. Each sheet has a "label | value" block at the top (cruise, date, GMT time, station,
  bottom depth, latitude, longitude…) followed by a sample table, often with a two-row header such as
  MultiNet net logs. Net/bottle IDs and remarks are kept per sample, and depth intervals ("from"/"to")
  get a mid-depth so they can be plotted.
- **Sampling intervals** view for net tows and other interval samples: each net or cup is a bar spanning
  its depth range at every station, and samples with remarks are highlighted.
- **Dataset library (Supabase)**: save an opened file and its column settings, then reopen it later from
  any device. Each person sees and removes only their own saved datasets.

## Supabase library setup

The browser never talks to Supabase with a key. The app's server routes (`src/app/api/library`) check
the signed-in Cursor viewer, then read and write Supabase with the project's secret key, scoping every
row and file to that viewer. Files are uploaded and downloaded through short-lived signed URLs.

1. Run `supabase/migrations/20261119000000_datasets_library.sql` once in the Supabase dashboard
   (SQL Editor → New query → paste → Run). It is safe to run again. The Library dialog's
   **Copy setup SQL** button copies it too. Row-level security is on with no policies, so the
   publishable key gets no access.
2. Give the server the secret key as `SUPABASE_SECRET_KEY` (an `sb_secret_…` or `service_role` key from
   Project Settings → API keys). For the published app, add it as an app secret in Cursor. Locally,
   put it in `.env.local`. `SUPABASE_URL` is optional and defaults to the project's URL.

Without `SUPABASE_SECRET_KEY`, `npm run dev` / `npm start` keep the library in `.data/library` on
your machine instead (this folder is gitignored), and the local viewer is the simulated one in
`cursor/identity.dev.ts`. The library needs signed-in viewers, so it only works when the app is
published as private or team. On a public app, or when the host has no secret key, the Library and Save
buttons are hidden and everything else works as usual.

## Running locally

Requires Node.js 20+.

```bash
npm install
npm run dev        # http://localhost:4317
```

Other scripts:

```bash
npm run build && npm start   # production build on port 4317
npm run lint
npm run typecheck
npm run samples              # regenerate the sample datasets in public/samples
```

## Sample data

`public/samples` contains two synthetic, demo-only datasets:

- `atlantic-transect.odv.txt`: an AMT-style meridional transect in ODV spreadsheet format.
- `lisbon-coastal-survey.xlsx`: seasonal CTD casts off Lisbon and in the Tagus estuary, laid out like a
  typical field-team workbook (title row, separate date and time columns, `-999` missing values).

## Project layout

```
src/lib/odv/       parsing (read.ts, detect.ts, dates.ts, build.ts), gridding, derived variables, export
src/lib/store.ts   app state (zustand)
src/components/    map, views (profiles, scatter, section, data table), import dialog, sidebar
```

The basemap uses Esri's World Ocean Base tiles, which need an internet connection. All analysis works offline.
