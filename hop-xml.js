// HopConvert — XML to flat rows
// Shared by xml-to-csv.html and workbench.js.
// Finds the repeating row element, flattens each one into a single-level
// object, and collects the column set across all rows.

(function (global) {
  'use strict';

  function stripBom(s) {
    return s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s;
  }

  function parseXml(text) {
    text = stripBom(String(text || ''));
    var parser = new DOMParser();
    var doc = parser.parseFromString(text, 'application/xml');
    var err = doc.querySelector('parsererror');
    if (err) throw new Error('Invalid XML: ' + (err.textContent || '').slice(0, 200));
    return doc;
  }

  function localName(name, stripNs) {
    if (stripNs && name.indexOf(':') !== -1) return name.split(':').pop();
    return name;
  }

  function detectRowElement(doc, stripNs) {
    var root = doc.documentElement;
    var counts = {};
    for (var i = 0; i < root.children.length; i++) {
      var child = root.children[i];
      var n = localName(child.tagName, stripNs);
      counts[n] = (counts[n] || 0) + 1;
    }
    var best = null, bestCount = 0;
    for (var k in counts) {
      if (counts[k] > bestCount) { best = k; bestCount = counts[k]; }
    }
    return best;
  }

  function findRowElements(doc, rowName, stripNs) {
    var root = doc.documentElement;
    var out = [];
    function walk(node) {
      for (var i = 0; i < node.children.length; i++) {
        var child = node.children[i];
        if (localName(child.tagName, stripNs) === rowName) out.push(child);
        else walk(child);
      }
    }
    walk(root);
    if (out.length > 0) return out;
    // Fallback: any child of root with the row name
    for (var j = 0; j < root.children.length; j++) {
      var c = root.children[j];
      if (localName(c.tagName, stripNs) === rowName) out.push(c);
    }
    return out;
  }

  function getText(node) {
    var s = '';
    for (var i = 0; i < node.childNodes.length; i++) {
      var child = node.childNodes[i];
      if (child.nodeType === 3) s += child.nodeValue;
      else if (child.nodeType === 1) s += getText(child);
    }
    return s;
  }

  function toObject(node, stripNs, includeAttrs) {
    var out = {};
    if (includeAttrs) {
      for (var a = 0; a < node.attributes.length; a++) {
        var attr = node.attributes[a];
        out['@' + localName(attr.name, stripNs)] = attr.value;
      }
    }
    for (var i = 0; i < node.children.length; i++) {
      var child = node.children[i];
      var n = localName(child.tagName, stripNs);
      out[n] = child.children.length > 0 ? toObject(child, stripNs, includeAttrs) : getText(child);
    }
    return out;
  }

  function flattenElement(node, prefix, sep, stripNs, includeAttrs) {
    var out = {};
    if (includeAttrs) {
      for (var a = 0; a < node.attributes.length; a++) {
        var attr = node.attributes[a];
        out[prefix + '@' + localName(attr.name, stripNs)] = attr.value;
      }
    }
    var children = {};
    var order = [];
    for (var i = 0; i < node.children.length; i++) {
      var child = node.children[i];
      var n = localName(child.tagName, stripNs);
      if (!children[n]) { children[n] = []; order.push(n); }
      children[n].push(child);
    }
    for (var o = 0; o < order.length; o++) {
      var name = order[o];
      var key = prefix ? prefix + sep + name : name;
      if (children[name].length === 1) {
        var only = children[name][0];
        var hasChildren = only.children.length > 0;
        if (hasChildren) {
          var sub = flattenElement(only, key, sep, stripNs, includeAttrs);
          for (var k in sub) out[k] = sub[k];
        } else {
          out[key] = getText(only);
          // A leaf element can carry the value that matters - an Atom
          // <link href="..."> is the URL and nothing else - so its
          // attributes become their own columns instead of being dropped.
          if (includeAttrs) {
            for (var b = 0; b < only.attributes.length; b++) {
              var leafAttr = only.attributes[b];
              out[key + sep + '@' + localName(leafAttr.name, stripNs)] = leafAttr.value;
            }
          }
        }
      } else {
        out[key] = children[name].map(function (c) {
          return getText(c) || (c.children.length ? JSON.stringify(toObject(c, stripNs, includeAttrs)) : '');
        }).join(' | ');
      }
    }
    return out;
  }

  /**
   * Parse XML into flat row objects.
   * opts: { rowElement, nestedSep, stripNs, includeAttrs }
   * Returns { headers, rows, rowName }.
   */
  function toRows(text, opts) {
    opts = opts || {};
    var sep = opts.nestedSep || '__';
    var stripNs = opts.stripNs !== false;
    var includeAttrs = opts.includeAttrs !== false;

    var doc = parseXml(text);
    var rowName = opts.rowElement || detectRowElement(doc, stripNs);
    if (!rowName) throw new Error('Could not detect a repeating row element. Set one in settings.');
    var found = findRowElements(doc, rowName, stripNs);
    if (found.length === 0) throw new Error('No elements named <' + rowName + '> found in the document.');

    var flatRows = found.map(function (r) {
      return flattenElement(r, '', sep, stripNs, includeAttrs);
    });

    var keySet = new Set();
    flatRows.forEach(function (r) {
      Object.keys(r).forEach(function (k) { keySet.add(k); });
    });

    return { headers: Array.from(keySet), rows: flatRows, rowName: rowName };
  }

  global.HopXml = { toRows: toRows, parseXml: parseXml, getText: getText, localName: localName };
})(window);
