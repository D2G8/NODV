# Ocean Data Explorer

A modern, browser-based take on [Ocean Data View (ODV)](https://odv.awi.de) for exploring oceanographic
profile data. It reads the same ODV spreadsheet `.txt` files ODV does. It also reads **Excel workbooks
(`.xlsx`, `.xls`, `.ods`) and CSV/TSV files**, so field data can be explored without first converting it.

Everything runs client-side: files are parsed in the browser and never uploaded.

## Features

- **Import**: ODV generic spreadsheet `.txt`, CSV/TSV/semicolon-delimited text, and Excel workbooks.
  - Automatic column-role detection (cruise, station, type, date/date-time, time of day, longitude,
    latitude, bottom depth, depth/pressure, data variables, extra metadata, quality-flag columns).
  - A review dialog lets you correct any column role, pick a worksheet, set missing-value codes (for
    example `-999`), and choose day-first dates.
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
