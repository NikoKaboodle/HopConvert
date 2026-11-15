# HopConvert

Free, client-side tools for converting JSON, CSV, XML, and YAML — built for developers, analysts, and data teams who care about speed and privacy.

## Workbench

- [Conversion workbench](workbench.html) — drop a file in any format, pick the target format

The workbench reads JSON, JSONL, CSV, TSV, XML and YAML, and writes CSV, JSON, YAML, SQL, Markdown and real `.xlsx` workbooks. It detects the input format for you and runs on the same engines as the individual converters below.

## Converters

- [JSON to CSV](index.html)
- [CSV to JSON](csv-to-json.html)
- [XML to CSV](xml-to-csv.html)
- [JSON to YAML](json-to-yaml.html)
- [YAML to JSON](yaml-to-json.html)
- [JSONL to CSV](jsonl-to-csv.html)
- [JSON to SQL](json-to-sql.html)
- [JSON to Markdown](json-to-markdown.html)
- [JSON to Excel](json-to-excel.html)

## Guides

- [JSON to CSV guide](json-to-csv-guide.html)
- [CSV to JSON guide](csv-to-json-guide.html)
- [XML to CSV guide](xml-to-csv-guide.html)
- [JSON to YAML guide](json-to-yaml-guide.html)
- [YAML to JSON guide](yaml-to-json-guide.html)
- [JSONL to CSV guide](jsonl-to-csv-guide.html)
- [JSON to SQL guide](json-to-sql-guide.html)
- [JSON to Markdown guide](json-to-markdown-guide.html)
- [JSON to Excel guide](json-to-excel-guide.html)

## By task

- [JSON to CSV in Python](json-to-csv-python.html)
- [JSON array to CSV](json-array-to-csv.html)
- [JSON to CSV nested objects](json-to-csv-nested-objects.html)
- [JSON to CSV without uploading](json-to-csv-without-uploading.html)
- [JSON to CSV for Excel](json-to-csv-excel.html)
- [YAML to JSON for Kubernetes](yaml-to-json-kubernetes.html)
- [XML to CSV for RSS](xml-to-csv-rss.html)
- [CSV to JSON type inference](csv-to-json-type-inference.html)

## How it works

Every converter is a self-contained static HTML page. All parsing, flattening, escaping, and serialization happens in your browser using JavaScript — there is no backend, no upload, no account.

- 100% free, no sign-up, no Pro tier
- Files never leave your machine
- RFC 4180 compliant CSV
- YAML 1.2 compatible
- Mobile-friendly with a touch dropdown nav

## Tech

Plain HTML + CSS + vanilla JS. No build step.

Shared runtime, loaded by every page:

| File | What it does |
| --- | --- |
| `hop-common.js` | Shared converter utilities: CSV escaping, flattening, table rendering, file reading, the standard converter chrome. |
| `hop-xml.js` | XML to flat rows: finds the repeating row element, flattens each one, collects the columns. |
| `hop-yaml.js` | YAML serializer: block style, plain scalars where safe, literal block scalars for long strings. |
| `hop-xlsx.js` | Minimal `.xlsx` writer: CRC-32, a STORE zip writer and SpreadsheetML, so Excel output is a real workbook with typed cells. |
| `workbench.js` | The workbench engine: format detection, the six input parsers and the six output renderers. |

External CDNs are required by exactly two pages: `yaml-to-json.html` and `workbench.html` load js-yaml for YAML input. Everything else runs from local files.
