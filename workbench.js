// HopConvert Workbench
// Drop a file in any supported format, choose where it should go, get the
// result. Every conversion runs on the same engines as the individual
// converters (hop-tools, hop-xml, hop-yaml, hop-xlsx), so the workbench and
// the dedicated tools can never disagree about the answer.

(function (global) {
  'use strict';

  var T = global.HopTools;

  /* ------------------------------------------------------------------
     Formats
     ------------------------------------------------------------------ */
  var INPUT_FORMATS = [
    { id: 'auto', label: 'Auto-detect' },
    { id: 'json', label: 'JSON' },
    { id: 'jsonl', label: 'JSONL (JSON Lines)' },
    { id: 'csv', label: 'CSV' },
    { id: 'tsv', label: 'TSV' },
    { id: 'xml', label: 'XML' },
    { id: 'yaml', label: 'YAML' }
  ];

  var OUTPUT_FORMATS = [
    { id: 'csv', label: 'CSV' },
    { id: 'json', label: 'JSON' },
    { id: 'yaml', label: 'YAML' },
    { id: 'sql', label: 'SQL' },
    { id: 'markdown', label: 'Markdown' },
    { id: 'xlsx', label: 'Excel (.xlsx)' }
  ];

  var DELIMITERS = [
    { id: '\t', label: 'Tab' },
    { id: ',', label: 'Comma' },
    { id: ';', label: 'Semicolon' },
    { id: '|', label: 'Pipe' }
  ];

  var SAMPLE = [
    '[',
    '  { "id": 1, "name": "Alice Chen", "role": "Engineer", "team": "Platform", "active": true, "spend": 249.5 },',
    '  { "id": 2, "name": "Bob Singh", "role": "Designer", "team": "Brand", "active": false, "spend": 0 },',
    '  { "id": 3, "name": "Carol Diaz", "role": "Engineer", "team": "Platform", "active": true, "spend": 1820.75 }',
    ']'
  ].join('\n');

  function $(id) { return document.getElementById(id); }

  /* ------------------------------------------------------------------
     Settings
     ------------------------------------------------------------------ */
  function readSettings() {
    var inDelim = $('wbInDelim') ? $('wbInDelim').value : 'auto';
    var outDelim = $('wbOutDelim') ? $('wbOutDelim').value : '\t';
    var indent = $('wbYamlIndent') ? parseInt($('wbYamlIndent').value, 10) : 2;
    if (!indent || indent < 1 || indent > 8) indent = 2;
    return {
      source: $('wbSource') ? $('wbSource').value : 'auto',
      target: $('wbTarget') ? $('wbTarget').value : 'csv',
      inputDelimiter: inDelim,
      outputDelimiter: outDelim,
      sqlDialect: $('wbSqlDialect') ? $('wbSqlDialect').value : 'postgres',
      sqlTable: ($('wbSqlTable') && $('wbSqlTable').value.trim()) || 'users',
      yamlIndent: indent,
      markdownAlign: $('wbMdAlign') ? $('wbMdAlign').value : 'auto',
      sheetName: ($('wbSheetName') && $('wbSheetName').value.trim()) || 'Sheet1'
    };
  }

  function labelOf(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i].label;
    return id;
  }

  /* ------------------------------------------------------------------
     Input parsing
     ------------------------------------------------------------------ */

  /** Type inference, matching the CSV to JSON converter. */
  function inferValue(s) {
    if (s === '' || s === null || s === undefined) return null;
    var t = String(s).trim();
    if (t === '') return '';
    // Leading zeros mean an identifier (a ZIP code, a phone number, an ID),
    // not a number - keep them as text.
    if (/^-?0\d+/.test(t)) return s;
    if (/^-?\d+$/.test(t)) {
      var n = parseInt(t, 10);
      // Integers JavaScript cannot represent exactly stay as text.
      return Number.isSafeInteger(n) ? n : s;
    }
    if (/^-?\d*\.\d+([eE][-+]?\d+)?$/.test(t) || /^-?\d+[eE][-+]?\d+$/.test(t)) return parseFloat(t);
    var tl = t.toLowerCase();
    if (tl === 'true' || tl === 'yes') return true;
    if (tl === 'false' || tl === 'no') return false;
    if (tl === 'null') return null;
    return s;
  }

  function rowsFromRecords(records) {
    var res = T.collectRows(records, { strategy: 'detail', sep: '__', joinDelim: ' | ' });
    return { headers: res.headers, rows: res.rows };
  }

  function parseJsonInput(text) {
    var data;
    try { data = JSON.parse(String(text).replace(/^\uFEFF/, '')); }
    catch (e) { throw new Error('That is not valid JSON - ' + e.message); }
    var r = rowsFromRecords(Array.isArray(data) ? data : [data]);
    return { data: data, headers: r.headers, rows: r.rows, label: 'JSON' };
  }

  function parseJsonlInput(text) {
    var lines = String(text).split(/\r?\n/);
    var out = [], bad = -1;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (line === '') continue;
      var v;
      try { v = JSON.parse(line); }
      catch (e) { bad = i + 1; break; }
      out.push(v);
    }
    if (bad > 0) throw new Error('Line ' + bad + ' of that JSON Lines file is not valid JSON.');
    if (!out.length) throw new Error('That JSON Lines file is empty.');
    var r = rowsFromRecords(out);
    return { data: out, headers: r.headers, rows: r.rows, label: 'JSONL' };
  }

  function parseYamlInput(text) {
    if (!global.jsyaml) throw new Error('The YAML parser did not load. Check your connection and try again.');
    var docs;
    try { docs = global.jsyaml.loadAll(String(text)); }
    catch (e) { throw new Error('That is not valid YAML - ' + e.message); }
    if (!docs.length) throw new Error('That YAML file is empty.');
    // Multi-document YAML (a Kubernetes manifest, say) becomes an array of
    // documents, exactly like the dedicated YAML to JSON converter does.
    var records = docs.filter(function (d) { return d !== null && d !== undefined; });
    var r = rowsFromRecords(records);
    return { data: docs, headers: r.headers, rows: r.rows, label: 'YAML' };
  }

  function parseDelimitedInput(text, delimiter) {
    var delim = delimiter;
    if (!delim || delim === 'auto') delim = T.detectDelimiter(text);
    var grid = T.parseDelimited(text, delim);
    if (!grid.length) throw new Error('That file is empty.');

    // Skip leading blank lines so an empty first line is not the header.
    var first = 0;
    while (first < grid.length && grid[first].every(function (c) { return c === ''; })) first++;
    if (first >= grid.length) throw new Error('That file has no rows.');
    var body = grid.slice(first);

    var headers = body[0].map(function (h, i) { return h === '' ? 'column_' + (i + 1) : h; });
    // Disambiguate duplicates.
    var seen = Object.create(null);
    headers = headers.map(function (h) {
      if (seen[h] == null) { seen[h] = 0; return h; }
      seen[h]++;
      return h + '_' + seen[h];
    });
    // A row can be wider than the header row - keep those extra values.
    var maxCols = headers.length;
    for (var i = 1; i < body.length; i++) if (body[i].length > maxCols) maxCols = body[i].length;
    for (var c = headers.length; c < maxCols; c++) headers.push('column_' + (c + 1));

    var records = body.slice(1).map(function (r) {
      var obj = {};
      for (var k = 0; k < headers.length; k++) obj[headers[k]] = inferValue(r[k] || '');
      return obj;
    });

    return {
      data: records,
      headers: headers,
      rows: records,
      label: delim === '\t' ? 'TSV' : 'CSV'
    };
  }

  function parseXmlInput(text) {
    if (!global.HopXml) throw new Error('The XML parser did not load. Check your connection and try again.');
    var res = global.HopXml.toRows(text, { nestedSep: '__', stripNs: true, includeAttrs: true });
    return {
      data: res.rows,
      headers: res.headers,
      rows: res.rows,
      label: 'XML'
    };
  }

  function parseInput(text, format, opts) {
    switch (format) {
      case 'json': return parseJsonInput(text);
      case 'jsonl': return parseJsonlInput(text);
      case 'yaml': return parseYamlInput(text);
      case 'xml': return parseXmlInput(text);
      case 'csv':
      case 'tsv': return parseDelimitedInput(text, format === 'tsv' ? '\t' : opts.inputDelimiter);
      default:
        throw new Error('Unknown source format: ' + format);
    }
  }

  /* ------------------------------------------------------------------
     Format detection
     ------------------------------------------------------------------ */
  var BY_EXTENSION = {
    json: 'json', jsonl: 'jsonl', ndjson: 'jsonl',
    csv: 'csv', tsv: 'tsv',
    xml: 'xml', yaml: 'yaml', yml: 'yaml'
  };

  function canParseAs(text, format) {
    try {
      switch (format) {
        case 'json':
          JSON.parse(text);
          return true;
        case 'jsonl':
          parseJsonlInput(text);
          return true;
        case 'xml':
          if (!global.HopXml) return false;
          global.HopXml.parseXml(text);
          return true;
        case 'yaml':
          if (!global.jsyaml) return false;
          var docs = global.jsyaml.loadAll(text);
          if (!docs.length) return false;
          for (var d = 0; d < docs.length; d++) {
            if (docs[d] && typeof docs[d] === 'object') return true;
          }
          return false;
        case 'csv':
        case 'tsv':
          return true;
      }
    } catch (e) {
      return false;
    }
    return false;
  }

  function detectFormat(text, fileName) {
    var t = String(text || '').replace(/^\uFEFF/, '').trim();
    if (t === '') return 'json';

    var ext = fileName ? String(fileName).toLowerCase().split('.').pop() : '';
    if (ext && BY_EXTENSION[ext] && canParseAs(t, BY_EXTENSION[ext])) return BY_EXTENSION[ext];

    if (t.charAt(0) === '<') return 'xml';

    if (t.charAt(0) === '{' || t.charAt(0) === '[') {
      try { JSON.parse(t); return 'json'; } catch (e) { /* not a single JSON document */ }
    }

    // JSON Lines: every non-empty line is a JSON object or array.
    var lines = t.split(/\r?\n/).filter(function (l) { return l.trim() !== ''; });
    if (lines.length) {
      var allObjects = true;
      for (var i = 0; i < lines.length; i++) {
        try {
          var v = JSON.parse(lines[i]);
          if (!v || typeof v !== 'object') { allObjects = false; break; }
        } catch (e) { allObjects = false; break; }
      }
      if (allObjects && (lines.length > 1 || ext === 'jsonl' || ext === 'ndjson')) return 'jsonl';
    }

    // YAML before CSV: a YAML mapping is far more likely than a CSV whose
    // cells happen to contain colons, and js-yaml refuses most CSVs anyway.
    if (global.jsyaml) {
      try {
        var docs = global.jsyaml.loadAll(t);
        for (var d = 0; d < docs.length; d++) {
          if (docs[d] && typeof docs[d] === 'object') return 'yaml';
        }
      } catch (e) { /* not YAML */ }
    }

    return T.detectDelimiter(t) === '\t' ? 'tsv' : 'csv';
  }

  /* ------------------------------------------------------------------
     Output rendering
     ------------------------------------------------------------------ */
  function renderCsv(parsed, opts) {
    return {
      text: T.toCsv(parsed.headers, parsed.rows, opts.outputDelimiter),
      mime: 'text/csv;charset=utf-8',
      ext: 'csv'
    };
  }

  function renderJson(parsed) {
    return {
      text: JSON.stringify(parsed.data, null, 2),
      mime: 'application/json;charset=utf-8',
      ext: 'json'
    };
  }

  function renderYaml(parsed, opts) {
    if (!global.HopYaml) throw new Error('The YAML writer did not load. Check your connection and try again.');
    return {
      text: global.HopYaml.dump(parsed.data, {
        indent: opts.yamlIndent,
        sortKeys: false,
        quoteAll: false,
        preserveOrder: true
      }),
      mime: 'application/yaml;charset=utf-8',
      ext: 'yaml'
    };
  }

  function sqlIdent(name, dialect) {
    if (dialect === 'mysql') return '`' + String(name).replace(/`/g, '``') + '`';
    return '"' + String(name).replace(/"/g, '""') + '"';
  }

  function sqlString(v, dialect) {
    var s = String(v);
    if (dialect === 'mysql') {
      s = s.replace(/\\/g, '\\\\').replace(/'/g, "''").replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
    } else {
      s = s.replace(/'/g, "''");
    }
    return "'" + s + "'";
  }

  function sqlLiteral(v, dialect) {
    if (v === null || v === undefined) return 'NULL';
    if (typeof v === 'number') return isFinite(v) ? String(v) : 'NULL';
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    if (typeof v === 'object') return sqlString(JSON.stringify(v), dialect);
    return sqlString(v, dialect);
  }

  function renderSql(parsed, opts) {
    var table = sqlIdent(opts.sqlTable, opts.sqlDialect);
    var cols = parsed.headers.map(function (h) { return sqlIdent(h, opts.sqlDialect); }).join(', ');
    var lines = [];
    lines.push('-- Generated by HopConvert Workbench - https://hopconvert.com/workbench.html');
    lines.push('-- ' + parsed.rows.length + ' row(s), ' + parsed.headers.length + ' column(s)');
    lines.push('');
    parsed.rows.forEach(function (r) {
      var vals = parsed.headers.map(function (h) { return sqlLiteral(r[h], opts.sqlDialect); }).join(', ');
      lines.push('INSERT INTO ' + table + ' (' + cols + ') VALUES (' + vals + ');');
    });
    return { text: lines.join('\n') + '\n', mime: 'text/plain;charset=utf-8', ext: 'sql' };
  }

  function mdCell(v) {
    if (v === null || v === undefined) return '';
    var s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    s = s.replace(/\r\n|\r|\n/g, ' ');
    s = s.replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
    return s;
  }

  function mdIsNumeric(v) {
    if (typeof v === 'number') return isFinite(v);
    if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim())) return true;
    return false;
  }

  function mdAlign(values, mode) {
    if (mode === 'left') return '---';
    if (mode === 'center') return ':---:';
    if (mode === 'right') return '---:';
    var seen = false, allNum = true;
    values.forEach(function (v) {
      if (v === null || v === undefined || v === '') return;
      seen = true;
      if (!mdIsNumeric(v)) allNum = false;
    });
    return (seen && allNum) ? '---:' : '---';
  }

  function renderMarkdown(parsed, opts) {
    var lines = [];
    lines.push('| ' + parsed.headers.map(mdCell).join(' | ') + ' |');
    lines.push('| ' + parsed.headers.map(function (h) {
      return mdAlign(parsed.rows.map(function (r) { return r[h]; }), opts.markdownAlign);
    }).join(' | ') + ' |');
    parsed.rows.forEach(function (r) {
      lines.push('| ' + parsed.headers.map(function (h) { return mdCell(r[h]); }).join(' | ') + ' |');
    });
    return { text: lines.join('\n') + '\n', mime: 'text/markdown;charset=utf-8', ext: 'md' };
  }

  function renderXlsx(parsed, opts) {
    if (!global.HopXlsx) throw new Error('The Excel writer did not load. Check your connection and try again.');
    var bytes = global.HopXlsx.build(parsed.headers, parsed.rows, {
      sheetName: opts.sheetName,
      freezeHeader: true
    });
    return {
      blob: new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      bytes: bytes.length,
      mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ext: 'xlsx'
    };
  }

  function render(parsed, target, opts) {
    switch (target) {
      case 'csv': return renderCsv(parsed, opts);
      case 'json': return renderJson(parsed);
      case 'yaml': return renderYaml(parsed, opts);
      case 'sql': return renderSql(parsed, opts);
      case 'markdown': return renderMarkdown(parsed, opts);
      case 'xlsx': return renderXlsx(parsed, opts);
      default: throw new Error('Unknown target format: ' + target);
    }
  }

  /* ------------------------------------------------------------------
     Conversion
     ------------------------------------------------------------------ */
  var lastFileName = '';
  var lastOutput = null;
  var lastSourceLabel = '';

  function convert(text) {
    var opts = readSettings();
    var source = opts.source;
    if (source === 'auto') source = detectFormat(text, lastFileName);
    lastSourceLabel = labelOf(INPUT_FORMATS, source);

    var parsed = parseInput(text, source, opts);
    var target = opts.target;

    if (!parsed.headers.length && target !== 'json' && target !== 'yaml') {
      throw new Error('No columns could be derived from that input.');
    }

    var out = render(parsed, target, opts);
    var targetLabel = labelOf(OUTPUT_FORMATS, target);

    var html = '<div class="out-note"><strong>' + T.esc(lastSourceLabel) + '</strong> to <strong>' +
      T.esc(targetLabel) + '</strong> &middot; ' + parsed.rows.length + ' row' +
      (parsed.rows.length === 1 ? '' : 's') + ', ' + parsed.headers.length + ' column' +
      (parsed.headers.length === 1 ? '' : 's') + '.';

    if (target === 'csv') {
      html += ' ' + T.esc(labelOf(DELIMITERS, opts.outputDelimiter)) + '-delimited.';
    }
    html += '</div>';

    if (target === 'csv' || target === 'xlsx') {
      html += T.renderTable(parsed.headers, parsed.rows, 50);
    } else {
      var preview = out.text.length > 8000 ? out.text.slice(0, 8000) + '\n…' : out.text;
      var cls = target === 'sql' ? 'sql-out' : (target === 'markdown' ? 'md-out' : '');
      html += T.renderPre(preview, cls);
    }

    return {
      html: html,
      text: out.text || '',
      blob: out.blob || null,
      mime: out.mime,
      rows: parsed.rows.length,
      cols: parsed.headers.length,
      source: source,
      target: target
    };
  }

  /* ------------------------------------------------------------------
     UI
     ------------------------------------------------------------------ */
  function setDetected(label) {
    var el = $('wbDetected');
    if (el) el.textContent = label ? 'Detected: ' + label : 'Detected: -';
  }

  function updateLabels() {
    var opts = readSettings();
    var rc = $('rowCount');
    var cc = $('colCount');
    var fl = $('wbFormatLabel');
    var dl = $('downloadBtn');
    var dlLabel = $('wbDownloadLabel');
    var cpLabel = $('wbCopyLabel');
    if (rc) rc.textContent = lastOutput && lastOutput.rows !== undefined ? lastOutput.rows : 0;
    if (cc) cc.textContent = lastOutput && lastOutput.cols !== undefined ? lastOutput.cols : 0;
    if (fl) {
      var targetLabel = labelOf(OUTPUT_FORMATS, opts.target);
      fl.textContent = (lastSourceLabel ? lastSourceLabel : 'Input') + ' to ' + targetLabel;
    }
    if (dlLabel) {
      var names = { csv: 'CSV', json: 'JSON', yaml: 'YAML', sql: 'SQL', markdown: 'Markdown', xlsx: 'Excel' };
      dlLabel.textContent = 'Download ' + (names[opts.target] || 'file');
    }
    if (cpLabel) {
      var cnames = { csv: 'CSV', json: 'JSON', yaml: 'YAML', sql: 'SQL', markdown: 'Markdown', xlsx: 'Excel' };
      cpLabel.textContent = 'Copy ' + (cnames[opts.target] || 'output');
    }
    // The output delimiter only matters for CSV.
    var delimWrap = $('wbDelimField');
    if (delimWrap) delimWrap.style.display = opts.target === 'csv' ? '' : 'none';
    // An .xlsx workbook is binary, so there is nothing to put on the clipboard.
    var cp = $('copyBtn');
    if (cp) cp.style.display = opts.target === 'xlsx' ? 'none' : '';
  }

  function downloadName(opts) {
    var ext = { csv: 'csv', json: 'json', yaml: 'yaml', sql: 'sql', markdown: 'md', xlsx: 'xlsx' }[opts.target] || 'txt';
    var base = 'converted';
    if (lastFileName) {
      var dot = lastFileName.lastIndexOf('.');
      if (dot > 0) base = lastFileName.slice(0, dot).replace(/[^\w.-]+/g, '-');
    }
    return base + '.' + ext;
  }

  function run() {
    var input = $('wbInput');
    var text = input ? input.value : '';
    var opts = readSettings();
    var errorBox = $('errorBox');
    var results = $('results');
    var empty = $('resultsEmpty');
    var status = $('parseStatus');

    if (!text || !text.trim()) {
      T.showError('errorBox', '');
      lastOutput = null;
      setDetected('');
      if (results) { results.innerHTML = ''; results.classList.remove('visible'); }
      if (empty) empty.style.display = '';
      if (status) status.textContent = 'Awaiting input';
      updateLabels();
      return;
    }

    var t0 = (global.performance && performance.now) ? performance.now() : Date.now();
    try {
      var out = convert(text);
      lastOutput = out;
      var ms = Math.round(((global.performance && performance.now) ? performance.now() : Date.now()) - t0);
      T.showError('errorBox', '');
      if (results) {
        if (empty) empty.style.display = 'none';
        results.innerHTML = out.html;
        results.classList.add('visible');
      }
      if (status) status.textContent = 'Converted in ' + ms + ' ms';
      setDetected(lastSourceLabel);
      updateLabels();
    } catch (err) {
      lastOutput = null;
      if (results) { results.innerHTML = ''; results.classList.remove('visible'); }
      if (empty) empty.style.display = '';
      if (status) status.textContent = 'Error';
      T.showError('errorBox', err && err.message ? err.message : 'Could not convert that input.');
      setDetected('');
      updateLabels();
    }
  }

  function init() {
    var input = $('wbInput');
    var fileInput = $('fileInput');

    // Populate the format selects.
    var sourceSel = $('wbSource');
    var targetSel = $('wbTarget');
    if (sourceSel) {
      INPUT_FORMATS.forEach(function (f) {
        var o = document.createElement('option');
        o.value = f.id; o.textContent = f.label;
        sourceSel.appendChild(o);
      });
      sourceSel.value = 'auto';
    }
    if (targetSel) {
      OUTPUT_FORMATS.forEach(function (f) {
        var o = document.createElement('option');
        o.value = f.id; o.textContent = f.label;
        targetSel.appendChild(o);
      });
      targetSel.value = 'csv';
    }

    var outDelimSel = $('wbOutDelim');
    if (outDelimSel) {
      DELIMITERS.forEach(function (d) {
        var o = document.createElement('option');
        o.value = d.id; o.textContent = d.label;
        outDelimSel.appendChild(o);
      });
      outDelimSel.value = '\t';
    }

    var inDelimSel = $('wbInDelim');
    if (inDelimSel) {
      var auto = document.createElement('option');
      auto.value = 'auto'; auto.textContent = 'Auto-detect';
      inDelimSel.appendChild(auto);
      DELIMITERS.forEach(function (d) {
        var o = document.createElement('option');
        o.value = d.id; o.textContent = d.label;
        inDelimSel.appendChild(o);
      });
      inDelimSel.value = 'auto';
    }

    // Record the file name before the reader kicks in - the extension is a
    // strong hint for the format.
    if (fileInput) {
      fileInput.addEventListener('change', function () {
        var f = fileInput.files && fileInput.files[0];
        lastFileName = f ? f.name : '';
        if (f) setDetected('reading ' + f.name + '…');
      });
    }

    var uploadZone = $('uploadZone');
    if (uploadZone) {
      uploadZone.addEventListener('click', function (e) {
        if (e.target !== fileInput) fileInput.click();
      });
      uploadZone.addEventListener('dragover', function (e) {
        e.preventDefault();
        uploadZone.classList.add('dragover');
      });
      uploadZone.addEventListener('dragleave', function () {
        uploadZone.classList.remove('dragover');
      });
      uploadZone.addEventListener('drop', function (e) {
        e.preventDefault();
        uploadZone.classList.remove('dragover');
        var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (!f) return;
        lastFileName = f.name;
        T.readFile(f).then(function (txt) {
          if (input) input.value = txt;
          run();
        }).catch(function (err) {
          T.showError('errorBox', err && err.message ? err.message : 'Could not read that file.');
        });
      });
    }

    if (fileInput) {
      fileInput.addEventListener('change', function () {
        var f = fileInput.files && fileInput.files[0];
        if (!f) return;
        T.readFile(f).then(function (txt) {
          if (input) input.value = txt;
          run();
        }).catch(function (err) {
          T.showError('errorBox', err && err.message ? err.message : 'Could not read that file.');
        });
      });
    }

    if (input) {
      var timer = null;
      input.addEventListener('input', function () {
        clearTimeout(timer);
        timer = setTimeout(run, 220);
      });
      input.addEventListener('paste', function () { setTimeout(run, 0); });
    }

    ['wbSource', 'wbTarget', 'wbOutDelim', 'wbInDelim'].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener('change', run);
    });

    var sampleBtn = $('loadSample');
    if (sampleBtn) {
      sampleBtn.addEventListener('click', function () {
        if (input) input.value = SAMPLE;
        lastFileName = '';
        run();
      });
    }

    var resetBtn = $('resetBtn');
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        if (input) input.value = '';
        if (fileInput) fileInput.value = '';
        lastFileName = '';
        lastOutput = null;
        lastSourceLabel = '';
        T.showError('errorBox', '');
        var results = $('results');
        var empty = $('resultsEmpty');
        if (results) { results.innerHTML = ''; results.classList.remove('visible'); }
        if (empty) empty.style.display = '';
        var status = $('parseStatus');
        if (status) status.textContent = 'Awaiting input';
        setDetected('');
        updateLabels();
      });
    }

    var downloadBtn = $('downloadBtn');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', function () {
        if (!lastOutput) {
          T.showError('errorBox', 'Nothing to download yet - drop a file or paste some data first.');
          return;
        }
        var opts = readSettings();
        var name = downloadName(opts);
        if (lastOutput.blob) {
          var url = URL.createObjectURL(lastOutput.blob);
          var a = document.createElement('a');
          a.href = url;
          a.download = name;
          a.style.display = 'none';
          document.body.appendChild(a);
          a.click();
          setTimeout(function () {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }, 100);
        } else {
          T.download(name, lastOutput.text, lastOutput.mime);
        }
      });
    }

    var copyBtn = $('copyBtn');
    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        if (!lastOutput || !lastOutput.text) {
          T.showError('errorBox', 'Nothing to copy yet - drop a file or paste some data first.');
          return;
        }
        var original = copyBtn.innerHTML;
        var finish = function () {
          copyBtn.innerHTML = original;
        };
        var done = function () {
          copyBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg> Copied!';
          setTimeout(finish, 1500);
        };
        if (global.navigator && navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(lastOutput.text).then(done).catch(function () {
            T.showError('errorBox', 'Could not copy to clipboard.');
          });
        } else {
          finish();
          T.showError('errorBox', 'Could not copy to clipboard.');
        }
      });
    }

    // Settings modal
    var modal = $('settingsModal');
    if (modal) {
      var openBtn = $('settingsBtn');
      var closeModal = function () { modal.classList.remove('visible'); };
      if (openBtn) openBtn.addEventListener('click', function () { modal.classList.add('visible'); });
      var closeBtn = $('closeSettings');
      if (closeBtn) closeBtn.addEventListener('click', closeModal);
      var closeFoot = $('closeSettingsFoot');
      if (closeFoot) closeFoot.addEventListener('click', closeModal);
      var applyBtn = $('applySettings');
      if (applyBtn) {
        applyBtn.addEventListener('click', function () {
          closeModal();
          run();
        });
      }
      modal.addEventListener('click', function (e) {
        if (e.target === modal) closeModal();
      });
    }

    updateLabels();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.HopWorkbench = {
    detectFormat: detectFormat,
    parseInput: parseInput,
    render: render,
    convert: convert,
    INPUT_FORMATS: INPUT_FORMATS,
    OUTPUT_FORMATS: OUTPUT_FORMATS
  };
})(window);
