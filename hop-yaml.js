// HopConvert — YAML serializer
// Shared by json-to-yaml.html and workbench.js.
// Emits block-style YAML: plain scalars where that is safe, double-quoted
// where it is not, and literal block scalars for long multi-line strings.

(function (global) {
  'use strict';

  var RESERVED_KEYS = new Set(['true', 'false', 'null', 'yes', 'no', 'on', 'off', '~']);
  var YAML_SPECIAL = /[:#&*!|>'"%@`{}\[\],]|^\s|\s$|^\d/;

  function isPlainSafe(s) {
    if (s === '') return false;
    if (YAML_SPECIAL.test(s)) return false;
    if (RESERVED_KEYS.has(s.toLowerCase())) return false;
    if (/^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(s)) return false;
    return true;
  }

  function escapeString(s) {
    return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
  }

  function dumpValue(value, indent, opts) {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') {
      if (!isFinite(value)) return 'null';
      return String(value);
    }
    if (typeof value === 'string') {
      if (value.includes('\n') && value.length > 40) {
        // Use literal block scalar
        var ind = ' '.repeat(indent + opts.indent);
        var lines = value.split('\n').map(function (l) { return l.length === 0 ? '' : l; }).join('\n' + ind);
        return '|\n' + ind + lines;
      }
      if (opts.quoteAll || !isPlainSafe(value)) return '"' + escapeString(value) + '"';
      return value;
    }
    if (Array.isArray(value)) {
      if (value.length === 0) return '[]';
      return dumpArray(value, indent, opts);
    }
    if (typeof value === 'object') {
      var keys = Object.keys(value);
      if (keys.length === 0) return '{}';
      return dumpObject(value, indent, opts);
    }
    return 'null';
  }

  function dumpArray(arr, indent, opts) {
    var sp = ' '.repeat(indent);
    var inner = ' '.repeat(indent + opts.indent);
    var lines = [];
    for (var i = 0; i < arr.length; i++) {
      var item = arr[i];
      var isComplex = (Array.isArray(item) && item.length > 0) ||
        (item && typeof item === 'object' && Object.keys(item).length > 0);
      if (isComplex) {
        var v = dumpValue(item, indent + opts.indent, opts);
        var firstNewline = v.indexOf('\n');
        if (firstNewline === -1) {
          lines.push(sp + '- ' + v);
        } else {
          lines.push(sp + '- ' + v.slice(0, firstNewline) + v.slice(firstNewline).split('\n').map(function (l, n) {
            return n === 0 ? l : inner + l;
          }).join('\n'));
        }
      } else {
        lines.push(sp + '- ' + dumpValue(item, indent, opts));
      }
    }
    return lines.join('\n');
  }

  function dumpObject(obj, indent, opts) {
    var sp = ' '.repeat(indent);
    var inner = ' '.repeat(indent + opts.indent);
    var keys = Object.keys(obj);
    if (!opts.preserveOrder || opts.sortKeys) {
      keys.sort();
    }
    var lines = [];
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var v = obj[k];
      var keyStr = isPlainSafe(k) ? k : '"' + escapeString(k) + '"';
      var isComplex = (Array.isArray(v) && v.length > 0) ||
        (v && typeof v === 'object' && Object.keys(v).length > 0);
      if (isComplex) {
        var dv = dumpValue(v, indent + opts.indent, opts);
        var firstNewline = dv.indexOf('\n');
        if (firstNewline === -1) {
          lines.push(sp + keyStr + ':\n' + inner + dv);
        } else {
          lines.push(sp + keyStr + ':');
          lines.push(dv);
        }
      } else {
        lines.push(sp + keyStr + ': ' + dumpValue(v, indent, opts));
      }
    }
    return lines.join('\n');
  }

  /**
   * Serialize a JavaScript value to YAML.
   * opts: { indent, quoteAll, sortKeys, preserveOrder }
   */
  function dump(value, opts) {
    opts = opts || {};
    if (opts.indent === undefined) opts.indent = 2;
    if (opts.quoteAll === undefined) opts.quoteAll = false;
    if (opts.preserveOrder === undefined) opts.preserveOrder = true;
    if (opts.sortKeys) opts.preserveOrder = false;
    return dumpValue(value, 0, opts);
  }

  global.HopYaml = { dump: dump };
})(window);
