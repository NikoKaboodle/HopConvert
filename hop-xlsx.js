// HopConvert — minimal .xlsx (SpreadsheetML) writer
// Shared by json-to-excel.html and workbench.js.
// Builds a real zipped workbook in the browser: no library, no server.
// Numbers stay numbers and booleans stay booleans, which is the whole
// reason this exists instead of writing a CSV with a .xlsx extension.

(function (global) {
  'use strict';

  /* ---------------- UTF-8 encoding ---------------- */
  function utf8(str) {
    if (global.TextEncoder) return new TextEncoder().encode(str);
    var s = unescape(encodeURIComponent(str));
    var out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }

  /* ---------------- CRC-32 ---------------- */
  var CRC_TABLE = (function () {
    var t = new Int32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c;
    }
    return t;
  })();

  function crc32(bytes) {
    var crc = -1;
    for (var i = 0; i < bytes.length; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[i]) & 0xFF];
    return (crc ^ -1) >>> 0;
  }

  /* ---------------- Minimal ZIP writer (STORE) ---------------- */
  function zip(files) {
    var parts = [], central = [], offset = 0;

    files.forEach(function (f) {
      var nameBytes = utf8(f.name);
      var data = f.data;
      var crc = crc32(data);

      var lfh = new Uint8Array(30 + nameBytes.length);
      var dv = new DataView(lfh.buffer);
      dv.setUint32(0, 0x04034b50, true);
      dv.setUint16(4, 20, true);
      dv.setUint16(6, 0x0800, true);
      dv.setUint16(8, 0, true);
      dv.setUint16(10, 0, true);
      dv.setUint16(12, 0x21, true);
      dv.setUint32(14, crc, true);
      dv.setUint32(18, data.length, true);
      dv.setUint32(22, data.length, true);
      dv.setUint16(26, nameBytes.length, true);
      dv.setUint16(28, 0, true);
      lfh.set(nameBytes, 30);

      var localOffset = offset;
      offset += lfh.length + data.length;
      parts.push(lfh, data);

      var cdh = new Uint8Array(46 + nameBytes.length);
      var dv2 = new DataView(cdh.buffer);
      dv2.setUint32(0, 0x02014b50, true);
      dv2.setUint16(4, 20, true);
      dv2.setUint16(6, 20, true);
      dv2.setUint16(8, 0x0800, true);
      dv2.setUint16(10, 0, true);
      dv2.setUint16(12, 0, true);
      dv2.setUint16(14, 0x21, true);
      dv2.setUint32(16, crc, true);
      dv2.setUint32(20, data.length, true);
      dv2.setUint32(24, data.length, true);
      dv2.setUint16(28, nameBytes.length, true);
      dv2.setUint16(30, 0, true);
      dv2.setUint16(32, 0, true);
      dv2.setUint16(34, 0, true);
      dv2.setUint16(36, 0, true);
      dv2.setUint32(38, 0, true);
      dv2.setUint32(42, localOffset, true);
      cdh.set(nameBytes, 46);
      central.push(cdh);
    });

    var cdSize = 0;
    for (var i = 0; i < central.length; i++) cdSize += central[i].length;

    var eocd = new Uint8Array(22);
    var dv3 = new DataView(eocd.buffer);
    dv3.setUint32(0, 0x06054b50, true);
    dv3.setUint16(4, 0, true);
    dv3.setUint16(6, 0, true);
    dv3.setUint16(8, files.length, true);
    dv3.setUint16(10, files.length, true);
    dv3.setUint32(12, cdSize, true);
    dv3.setUint32(16, offset, true);
    dv3.setUint16(20, 0, true);

    var out = new Uint8Array(offset + cdSize + 22);
    var pos = 0;
    for (var p = 0; p < parts.length; p++) { out.set(parts[p], pos); pos += parts[p].length; }
    for (var c = 0; c < central.length; c++) { out.set(central[c], pos); pos += central[c].length; }
    out.set(eocd, pos);
    return out;
  }

  /* ---------------- SpreadsheetML helpers ---------------- */
  function colName(n) {
    var s = '';
    while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
    return s;
  }

  function xmlText(s) {
    return String(s)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function cellXml(ref, value, isHeader) {
    var s = isHeader ? ' s="1"' : '';
    if (value === null || value === undefined || value === '') {
      return isHeader ? '<c r="' + ref + '"' + s + '/>' : '';
    }
    if (typeof value === 'number' && isFinite(value)) {
      return '<c r="' + ref + '"' + s + '><v>' + value + '</v></c>';
    }
    if (typeof value === 'boolean') {
      return '<c r="' + ref + '"' + s + ' t="b"><v>' + (value ? 1 : 0) + '</v></c>';
    }
    var text = xmlText(typeof value === 'object' ? JSON.stringify(value) : value);
    var space = (/^\s|\s$/.test(text)) ? ' xml:space="preserve"' : '';
    return '<c r="' + ref + '"' + s + ' t="inlineStr"><is><t' + space + '>' + text + '</t></is></c>';
  }

  function colWidth(header, rows) {
    var max = String(header || '').length;
    for (var i = 0; i < rows.length; i++) {
      var v = rows[i][header];
      if (v === null || v === undefined) continue;
      var len = String(typeof v === 'object' ? JSON.stringify(v) : v).length;
      if (len > max) max = len;
    }
    return Math.min(Math.max(max + 2, 10), 46);
  }

  function sheetXml(headers, rows, freezeHeader) {
    var lastCol = colName(Math.max(headers.length, 1));
    var lastRow = rows.length + 1;
    var xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
    xml += '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">';
    xml += '<dimension ref="A1:' + lastCol + lastRow + '"/>';
    if (freezeHeader) {
      xml += '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>';
    }
    if (headers.length) {
      xml += '<cols>';
      for (var i = 0; i < headers.length; i++) {
        xml += '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + colWidth(headers[i], rows) + '" customWidth="1"/>';
      }
      xml += '</cols>';
    }
    xml += '<sheetData>';
    xml += '<row r="1">';
    for (var h = 0; h < headers.length; h++) {
      xml += cellXml(colName(h + 1) + '1', headers[h], true);
    }
    xml += '</row>';
    for (var r = 0; r < rows.length; r++) {
      var rn = r + 2;
      xml += '<row r="' + rn + '">';
      for (var c = 0; c < headers.length; c++) {
        xml += cellXml(colName(c + 1) + rn, rows[r][headers[c]], false);
      }
      xml += '</row>';
    }
    xml += '</sheetData>';
    xml += '</worksheet>';
    return xml;
  }

  var CONTENT_TYPES =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    '</Types>';

  var ROOT_RELS =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>';

  var WORKBOOK_RELS =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    '</Relationships>';

  var STYLES =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="2">' +
    '<font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/></font>' +
    '<font><b/><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/></font>' +
    '</fonts>' +
    '<fills count="3">' +
    '<fill><patternFill patternType="none"/></fill>' +
    '<fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFEFF6FF"/><bgColor indexed="64"/></patternFill></fill>' +
    '</fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="2">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>' +
    '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';

  function workbookXml(sheetName) {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets><sheet name="' + xmlText(sheetName) + '" sheetId="1" r:id="rId1"/></sheets>' +
      '</workbook>';
  }

  /**
   * Build a .xlsx workbook.
   * opts: { sheetName, freezeHeader }
   * Returns the raw .xlsx bytes as a Uint8Array.
   */
  function build(headers, rows, opts) {
    opts = opts || {};
    var safeName = String(opts.sheetName || 'Sheet1').replace(/[\\/?*[\]:]/g, '_').slice(0, 31) || 'Sheet1';
    var freeze = opts.freezeHeader !== false;
    var files = [
      { name: '[Content_Types].xml', data: utf8(CONTENT_TYPES) },
      { name: '_rels/.rels', data: utf8(ROOT_RELS) },
      { name: 'xl/workbook.xml', data: utf8(workbookXml(safeName)) },
      { name: 'xl/_rels/workbook.xml.rels', data: utf8(WORKBOOK_RELS) },
      { name: 'xl/styles.xml', data: utf8(STYLES) },
      { name: 'xl/worksheets/sheet1.xml', data: utf8(sheetXml(headers, rows, freeze)) }
    ];
    return zip(files);
  }

  /** Build a .xlsx Blob ready for download. */
  function blob(headers, rows, opts) {
    return new Blob([build(headers, rows, opts)], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
  }

  global.HopXlsx = { build: build, blob: blob };
})(window);
