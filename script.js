// asktru.Donote — script.js
// Note Viewer with Pinned Notes, Markdown Rendering, and Table of Contents

// ============================================
// CONFIGURATION
// ============================================

var PLUGIN_ID = 'asktru.Donote';
var WINDOW_ID = 'asktru.Donote.dashboard';

function getSettings() {
  var s = DataStore.settings || {};
  return {
    lastSelectedNote: s.lastSelectedNote || '',
  };
}

function saveLastSelectedNote(filename) {
  var s = DataStore.settings || {};
  s.lastSelectedNote = filename || '';
  DataStore.settings = s;
}

// ============================================
// UTILITIES
// ============================================

function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function encSafe(str) {
  return encodeURIComponent(String(str || ''));
}

function npColor(c) {
  if (!c) return null;
  if (c.match && c.match(/^#[0-9A-Fa-f]{8}$/)) {
    return '#' + c.slice(3, 9) + c.slice(1, 3);
  }
  return c;
}

function npColorToCSS(hex) {
  if (!hex || typeof hex !== 'string') return null;
  hex = hex.replace(/^#/, '');
  if (hex.length === 8) {
    var a = parseInt(hex.substring(0, 2), 16) / 255;
    var r = parseInt(hex.substring(2, 4), 16);
    var g = parseInt(hex.substring(4, 6), 16);
    var b = parseInt(hex.substring(6, 8), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a.toFixed(2) + ')';
  }
  if (hex.length === 6) return '#' + hex;
  return null;
}

function getThemePriorityColors() {
  var defaults = {
    pri3: { bg: 'rgba(255,85,85,0.67)', color: '#FFB5B5' },
    pri2: { bg: 'rgba(255,85,85,0.47)', color: '#FFCCCC' },
    pri1: { bg: 'rgba(255,85,85,0.27)', color: '#FFDBBE' },
  };
  try {
    if (typeof Editor === 'undefined' || !Editor.currentTheme || !Editor.currentTheme.values) return defaults;
    var styles = Editor.currentTheme.values.styles || {};
    var f1 = styles['flagged-1'];
    var f2 = styles['flagged-2'];
    var f3 = styles['flagged-3'];
    return {
      pri1: {
        bg: (f1 && f1.backgroundColor) ? npColorToCSS(f1.backgroundColor) || defaults.pri1.bg : defaults.pri1.bg,
        color: (f1 && f1.color) ? npColorToCSS(f1.color) || defaults.pri1.color : defaults.pri1.color,
      },
      pri2: {
        bg: (f2 && f2.backgroundColor) ? npColorToCSS(f2.backgroundColor) || defaults.pri2.bg : defaults.pri2.bg,
        color: (f2 && f2.color) ? npColorToCSS(f2.color) || defaults.pri2.color : defaults.pri2.color,
      },
      pri3: {
        bg: (f3 && f3.backgroundColor) ? npColorToCSS(f3.backgroundColor) || defaults.pri3.bg : defaults.pri3.bg,
        color: (f3 && f3.color) ? npColorToCSS(f3.color) || defaults.pri3.color : defaults.pri3.color,
      },
    };
  } catch (e) { return defaults; }
}

function getPriorityCSSVars() {
  var c = getThemePriorityColors();
  return '--dn-pri1-bg: ' + c.pri1.bg + '; --dn-pri1-color: ' + c.pri1.color + ';\n' +
    '--dn-pri2-bg: ' + c.pri2.bg + '; --dn-pri2-color: ' + c.pri2.color + ';\n' +
    '--dn-pri3-bg: ' + c.pri3.bg + '; --dn-pri3-color: ' + c.pri3.color + ';';
}

function isLightTheme() {
  try {
    var theme = Editor.currentTheme;
    if (!theme) return false;
    if (theme.mode === 'light') return true;
    if (theme.mode === 'dark') return false;
    var vals = theme.values || {};
    var bg = npColor((vals.editor || {}).backgroundColor);
    if (bg) {
      var m = bg.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i);
      if (m) {
        var lum = (parseInt(m[1], 16) * 299 + parseInt(m[2], 16) * 587 + parseInt(m[3], 16) * 114) / 1000;
        return lum > 140;
      }
    }
  } catch (e) {}
  return false;
}

function getThemeCSS() {
  try {
    var theme = Editor.currentTheme;
    if (!theme) return '';
    var vals = theme.values || {};
    var editor = vals.editor || {};
    var styles = [];
    var bg = npColor(editor.backgroundColor);
    var altBg = npColor(editor.altBackgroundColor);
    var text = npColor(editor.textColor);
    var tint = npColor(editor.tintColor);
    if (bg) styles.push('--bg-main-color: ' + bg);
    if (altBg) styles.push('--bg-alt-color: ' + altBg);
    if (text) styles.push('--fg-main-color: ' + text);
    if (tint) styles.push('--tint-color: ' + tint);
    if (styles.length > 0) return ':root { ' + styles.join('; ') + '; }';
  } catch (e) {}
  return '';
}

// ============================================
// FRONTMATTER PARSING
// ============================================

function parseFrontmatter(content) {
  if (!content) return { frontmatter: {}, body: content || '' };
  var lines = content.split('\n');
  if (lines[0].trim() !== '---') return { frontmatter: {}, body: content };

  var endIdx = -1;
  for (var i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') { endIdx = i; break; }
  }
  if (endIdx < 0) return { frontmatter: {}, body: content };

  var fm = {};
  for (var j = 1; j < endIdx; j++) {
    var line = lines[j];
    var colonIdx = line.indexOf(':');
    if (colonIdx < 0) continue;
    var key = line.substring(0, colonIdx).trim();
    var val = line.substring(colonIdx + 1).trim();
    // Strip surrounding quotes
    if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
      val = val.substring(1, val.length - 1);
    }
    fm[key] = val;
  }

  var body = lines.slice(endIdx + 1).join('\n');
  return { frontmatter: fm, body: body };
}

// ============================================
// PINNED NOTES DISCOVERY
// ============================================

function getPinnedNotes() {
  var notes = DataStore.projectNotes;
  var pinned = [];
  for (var i = 0; i < notes.length; i++) {
    var note = notes[i];
    var content = note.content || '';
    // Quick check before full parse
    if (content.indexOf('pin:') < 0 && content.indexOf('pin :') < 0) continue;
    var parsed = parseFrontmatter(content);
    var pinVal = parsed.frontmatter.pin;
    if (pinVal !== undefined && pinVal !== '') {
      var pinNum = parseInt(pinVal);
      if (!isNaN(pinNum)) {
        pinned.push({
          filename: note.filename,
          title: note.title || note.filename.replace(/\.md$/, ''),
          folder: (note.filename || '').replace(/\/[^/]+$/, ''),
          pin: pinNum,
        });
      }
    }
  }
  pinned.sort(function(a, b) { return a.pin - b.pin; });
  return pinned;
}

function getNoteByFilename(filename) {
  var notes = DataStore.projectNotes;
  for (var i = 0; i < notes.length; i++) {
    if (notes[i].filename === filename) return notes[i];
  }
  return null;
}

// ============================================
// HEADING EXTRACTION (for TOC)
// ============================================

function extractHeadings(body) {
  var lines = body.split('\n');
  var headings = [];
  var inCodeBlock = false;
  var inFrontmatter = false;

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (i === 0 && line.trim() === '---') { inFrontmatter = true; continue; }
    if (inFrontmatter) { if (line.trim() === '---') inFrontmatter = false; continue; }
    if (line.trim().startsWith('```')) { inCodeBlock = !inCodeBlock; continue; }
    if (inCodeBlock) continue;

    var headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      var level = headingMatch[1].length;
      var text = headingMatch[2].trim();
      // Strip trailing markers/tags for clean display
      var cleanText = text.replace(/\s*…$/, ''); // collapsed heading indicator
      var id = 'heading-' + headings.length;
      headings.push({ level: level, text: cleanText, id: id });
    }
  }
  return headings;
}

// ============================================
// MARKDOWN RENDERER — Line-by-line state machine
// ============================================

function renderInline(str) {
  if (!str) return '';

  // Calendar event deeplink: ![📅](DATE TIME:::ID:::NA:::TITLE:::COLOR)
  var imgStart = str.indexOf('![');
  if (imgStart >= 0) {
    var bracketEnd = str.indexOf('](', imgStart);
    if (bracketEnd >= 0) {
      var parenStart = bracketEnd + 2;
      var parenEnd = str.indexOf(')', parenStart);
      if (parenEnd >= 0) {
        var inner = str.substring(parenStart, parenEnd);
        var parts = inner.split(':::');
        if (parts.length >= 5) {
          var timeMatch = parts[0].trim().match(/(\d{2}:\d{2})/);
          var time = timeMatch ? timeMatch[1] : '';
          var calTitle = parts[3] || '';
          var calColor = parts[4] || '#5A9FD4';
          var before = str.substring(0, imgStart);
          var after = str.substring(parenEnd + 1);
          var badge = '<span class="dn-cal-badge" data-color="' + esc(calColor) + '">' +
            '<i class="fa-regular fa-calendar" style="color:' + esc(calColor) + '"></i> ' +
            esc(calTitle) + (time ? ' <span class="dn-cal-time">' + esc(time) + '</span>' : '') + '</span>';
          return renderInline(before) + badge + renderInline(after);
        }
      }
    }
  }

  var s = esc(str);

  // Wiki links: [[Note Name]]
  s = s.replace(/\[\[([^\]]+)\]\]/g, function(match, noteName) {
    var encoded = encodeURIComponent(noteName);
    var url = 'noteplan://x-callback-url/openNote?noteTitle=' + encoded + '&amp;splitView=yes';
    return '<a class="dn-link dn-wiki-link" href="' + url + '">' + noteName + '</a>';
  });

  // Web links: [text](url)
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a class="dn-link" href="$2" title="$2">$1</a>');

  // Inline code
  s = s.replace(/`([^`]+)`/g, '<code class="dn-code-inline">$1</code>');

  // Bold + italic: ***text***
  s = s.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
  // Bold: **text**
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Italic: *text* (but not task markers)
  s = s.replace(/(?<![*\w])\*([^*]+)\*(?![*\w])/g, '<em>$1</em>');

  // Strikethrough: ~~text~~
  s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');

  // Highlight: ==text==
  s = s.replace(/==([^=]+)==/g, '<mark class="dn-highlight">$1</mark>');

  // Scheduled dates: >YYYY-MM-DD, >YYYY-Www, >today
  s = s.replace(/&gt;(\d{4}-\d{2}-\d{2})/g, '<span class="dn-date-badge"><i class="fa-regular fa-calendar"></i> $1</span>');
  s = s.replace(/&gt;(\d{4}-W\d{2})/g, '<span class="dn-date-badge"><i class="fa-regular fa-calendar"></i> $1</span>');
  s = s.replace(/&gt;(today)/g, '<span class="dn-date-badge"><i class="fa-regular fa-calendar"></i> today</span>');

  // Tags: #tag (orange, clickable)
  s = s.replace(/(^|[\s(])#([\w][\w/-]*)/g, function(match, pre, tag) {
    var tagUrl = 'noteplan://x-callback-url/openNote?noteTitle=' + encodeURIComponent('#' + tag);
    return pre + '<a class="dn-tag" href="' + tagUrl + '">#' + tag + '</a>';
  });

  // Mentions: @mention (orange, clickable)
  s = s.replace(/(^|[\s(])@([\w][\w/-]*(?:\([^)]*\))?)/g, function(match, pre, mention) {
    var mentionUrl = 'noteplan://x-callback-url/openNote?noteTitle=' + encodeURIComponent('@' + mention);
    return pre + '<a class="dn-mention" href="' + mentionUrl + '">@' + mention + '</a>';
  });

  // Inline comments: /* ... */ (dimmed)
  s = s.replace(/\/\*([^*]*(?:\*(?!\/)[^*]*)*)\*\//g, '<span class="dn-comment">/*$1*/</span>');

  // End-line comments: // ... (dimmed, but not URLs)
  s = s.replace(/(^|[^:])\/\/\s(.*)$/g, '$1<span class="dn-comment">// $2</span>');

  return s;
}

function extractPriority(content) {
  if (content.startsWith('!!! ')) return { level: 3, content: content.substring(4) };
  if (content.startsWith('!! ')) return { level: 2, content: content.substring(3) };
  if (content.startsWith('! ')) return { level: 1, content: content.substring(2) };
  return { level: 0, content: content };
}

function buildTaskHTML(rawContent, status, isChecklist, priLevel, displayContent, indentClass, filename, lineIdx) {
  var statusClass = status === 'done' ? ' dn-done' : status === 'cancelled' ? ' dn-cancelled' : '';
  var cbBase = isChecklist ? ' dn-cb-square' : '';
  var cbDoneClass = (status === 'done') ? ' done' : (status === 'cancelled') ? ' cancelled' : '';
  var cbIcon;
  if (isChecklist) {
    cbIcon = status === 'done' ? 'fa-solid fa-square-check' : status === 'cancelled' ? 'fa-solid fa-square-minus' : 'fa-regular fa-square';
  } else {
    cbIcon = status === 'done' ? 'fa-solid fa-circle-check' : status === 'cancelled' ? 'fa-solid fa-circle-minus' : 'fa-regular fa-circle';
  }

  var priBadge = '';
  if (priLevel > 0) {
    var priLabels = { 1: '!', 2: '!!', 3: '!!!' };
    priBadge = '<span class="dn-pri dn-pri-' + priLevel + '">' + priLabels[priLevel] + '</span> ';
  }

  var fnAttr = filename ? ' data-filename="' + esc(filename) + '"' : '';
  var lineAttr = lineIdx !== undefined ? ' data-line-index="' + lineIdx + '"' : '';

  var html = '<div class="dn-task' + statusClass + indentClass + '"' + fnAttr + lineAttr + '>';
  html += '<span class="dn-cb' + cbBase + cbDoneClass + '" data-action="toggleTask"><i class="' + cbIcon + '"></i></span>';
  html += priBadge;
  html += '<span class="dn-task-text">' + renderInline(displayContent) + '</span></div>';
  return html;
}

function renderNoteToHTML(content, noteFilename) {
  if (!content) return '<div class="dn-empty">No content</div>';

  var parsed = parseFrontmatter(content);
  var body = parsed.body;
  var allLines = content.split('\n');
  var lines = body.split('\n');
  // Calculate line offset: how many lines the frontmatter takes
  var lineOffset = allLines.length - lines.length;
  var html = '';
  var inCodeBlock = false;
  var codeBlockLang = '';
  var codeLines = [];
  var inTable = false;
  var tableRows = [];
  var inBlockquote = false;
  var bqLines = [];
  var inList = false;
  var listType = ''; // 'ul' or 'ol'
  var listItems = [];
  var headingIdx = 0;

  function flushBlockquote() {
    if (bqLines.length > 0) {
      html += '<blockquote class="dn-blockquote">';
      for (var q = 0; q < bqLines.length; q++) {
        html += '<p>' + renderInline(bqLines[q]) + '</p>';
      }
      html += '</blockquote>';
      bqLines = [];
    }
    inBlockquote = false;
  }

  function flushTable() {
    if (tableRows.length === 0) return;
    html += '<div class="dn-table-wrap"><table class="dn-table">';
    for (var t = 0; t < tableRows.length; t++) {
      var cells = tableRows[t].split('|').slice(1, -1); // strip outer pipes
      if (cells.length === 0) cells = tableRows[t].split('|');
      // Skip separator rows
      if (cells.length > 0 && cells[0].trim().match(/^[-:]+$/)) continue;
      var tag = t === 0 ? 'th' : 'td';
      html += '<tr>';
      for (var c = 0; c < cells.length; c++) {
        html += '<' + tag + '>' + renderInline(cells[c].trim()) + '</' + tag + '>';
      }
      html += '</tr>';
    }
    html += '</table></div>';
    tableRows = [];
    inTable = false;
  }

  function flushList() {
    if (listItems.length === 0) return;
    var tag = listType === 'ol' ? 'ol' : 'ul';
    html += '<' + tag + ' class="dn-list">';
    for (var li = 0; li < listItems.length; li++) {
      html += '<li>' + renderInline(listItems[li]) + '</li>';
    }
    html += '</' + tag + '>';
    listItems = [];
    inList = false;
    listType = '';
  }

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];

    // --- Fenced code blocks ---
    if (line.trim().startsWith('```')) {
      if (!inCodeBlock) {
        // Flush any open blocks
        if (inBlockquote) flushBlockquote();
        if (inTable) flushTable();
        if (inList) flushList();
        inCodeBlock = true;
        codeBlockLang = line.trim().substring(3).trim();
        codeLines = [];
      } else {
        html += '<div class="dn-code-wrap"><button class="dn-code-copy" data-action="copyCode" title="Copy"><i class="fa-regular fa-copy"></i></button>';
        html += '<pre class="dn-code-block"><code' + (codeBlockLang ? ' class="language-' + esc(codeBlockLang) + '"' : '') + '>';
        html += esc(codeLines.join('\n'));
        html += '</code></pre></div>';
        inCodeBlock = false;
        codeBlockLang = '';
      }
      continue;
    }
    if (inCodeBlock) { codeLines.push(line); continue; }

    // --- Empty line ---
    if (line.trim() === '') {
      if (inBlockquote) flushBlockquote();
      if (inTable) flushTable();
      if (inList) flushList();
      continue;
    }

    // --- Headings ---
    var headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      if (inBlockquote) flushBlockquote();
      if (inTable) flushTable();
      if (inList) flushList();
      var hLevel = headingMatch[1].length;
      var hText = headingMatch[2].trim().replace(/\s*…$/, '');
      var hId = 'heading-' + headingIdx++;
      html += '<h' + hLevel + ' class="dn-heading dn-h' + hLevel + '" id="' + hId + '">' + renderInline(hText) + '</h' + hLevel + '>';
      continue;
    }

    // --- Horizontal rule ---
    if (line.trim().match(/^[-*_]{3,}$/) && !line.trim().startsWith('- ')) {
      if (inBlockquote) flushBlockquote();
      if (inTable) flushTable();
      if (inList) flushList();
      html += '<hr class="dn-hr">';
      continue;
    }

    // --- Tables ---
    if (line.trim().startsWith('|')) {
      if (inBlockquote) flushBlockquote();
      if (inList) flushList();
      inTable = true;
      tableRows.push(line.trim());
      continue;
    }
    if (inTable) flushTable();

    // --- Blockquotes ---
    if (line.match(/^\s*>\s?/)) {
      if (inTable) flushTable();
      if (inList) flushList();
      inBlockquote = true;
      bqLines.push(line.replace(/^\s*>\s?/, ''));
      continue;
    }
    if (inBlockquote) flushBlockquote();

    // --- Images (standalone line) ---
    var imgMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)/);
    if (imgMatch) {
      if (inList) flushList();
      html += '<div class="dn-image-wrap"><img class="dn-image" src="' + esc(imgMatch[2]) + '" alt="' + esc(imgMatch[1]) + '"></div>';
      continue;
    }

    // --- Tasks and checklists ---
    var trimmed = line.trimStart();
    var indent = line.length - trimmed.length;
    var indentClass = indent >= 4 ? ' dn-indent-2' : indent >= 2 ? ' dn-indent-1' : '';

    // Checklist with brackets: + [ ], + [x], + [-]
    var checklistMatch = trimmed.match(/^\+\s+\[([x \-])\]\s+(.*)/);
    if (checklistMatch) {
      if (inList) flushList();
      var clStatus = checklistMatch[1] === 'x' ? 'done' : checklistMatch[1] === '-' ? 'cancelled' : 'open';
      var clContent = checklistMatch[2];
      var clPri = extractPriority(clContent);
      html += buildTaskHTML(clContent, clStatus, true, clPri.level, clPri.content, indentClass, noteFilename, lineOffset + i);
      continue;
    }

    // Checklist without brackets: + Something
    var checklistBareMatch = trimmed.match(/^\+\s+(.+)/);
    if (checklistBareMatch && !trimmed.startsWith('+ [')) {
      if (inList) flushList();
      var clbContent = checklistBareMatch[1];
      var clbPri = extractPriority(clbContent);
      html += buildTaskHTML(clbContent, 'open', true, clbPri.level, clbPri.content, indentClass, noteFilename, lineOffset + i);
      continue;
    }

    // Task with brackets: - [ ], - [x], - [-], * [ ], * [x], * [-]
    var taskMatch = trimmed.match(/^[-*]\s+\[([x \-])\]\s+(.*)/);
    if (taskMatch) {
      if (inList) flushList();
      var tStatus = taskMatch[1] === 'x' ? 'done' : taskMatch[1] === '-' ? 'cancelled' : 'open';
      var tContent = taskMatch[2];
      var tPri = extractPriority(tContent);
      html += buildTaskHTML(tContent, tStatus, false, tPri.level, tPri.content, indentClass, noteFilename, lineOffset + i);
      continue;
    }

    // Task without brackets: * Something (NotePlan treats * as open task)
    var starTaskMatch = trimmed.match(/^\*\s+(.+)/);
    if (starTaskMatch && !trimmed.startsWith('**') && !trimmed.startsWith('* [')) {
      if (inList) flushList();
      var stContent = starTaskMatch[1];
      var stPri = extractPriority(stContent);
      html += buildTaskHTML(stContent, 'open', false, stPri.level, stPri.content, indentClass, noteFilename, lineOffset + i);
      continue;
    }

    // --- Bullet lists: - text ---
    var bulletMatch = trimmed.match(/^-\s+(.+)/);
    if (bulletMatch) {
      if (inList && listType !== 'ul') flushList();
      inList = true;
      listType = 'ul';
      listItems.push(bulletMatch[1]);
      continue;
    }

    // --- Numbered lists: 1. text ---
    var numMatch = trimmed.match(/^\d+\.\s+(.+)/);
    if (numMatch) {
      if (inList && listType !== 'ol') flushList();
      inList = true;
      listType = 'ol';
      listItems.push(numMatch[1]);
      continue;
    }
    if (inList) flushList();

    // --- Regular paragraph ---
    html += '<p class="dn-para">' + renderInline(line) + '</p>';
  }

  // Flush remaining open blocks
  if (inCodeBlock) {
    html += '<pre class="dn-code-block"><code>' + esc(codeLines.join('\n')) + '</code></pre>';
  }
  if (inBlockquote) flushBlockquote();
  if (inTable) flushTable();
  if (inList) flushList();

  return html;
}

// ============================================
// HTML GENERATION
// ============================================

function buildLeftSidebar(pinnedNotes, selectedFilename) {
  var html = '<div class="dn-left" id="dnLeft">';
  html += '<div class="dn-left-header">';
  html += '<span class="dn-left-title">Pinned</span>';
  html += '</div>';
  html += '<div class="dn-left-list">';

  if (pinnedNotes.length === 0) {
    html += '<div class="dn-left-empty"><span class="dn-text-muted">No pinned notes</span><br><span class="dn-text-faint">Add <code>pin: N</code> to frontmatter</span></div>';
  }

  for (var i = 0; i < pinnedNotes.length; i++) {
    var n = pinnedNotes[i];
    var active = n.filename === selectedFilename ? ' active' : '';
    html += '<button class="dn-note-item' + active + '" data-action="selectNote" data-filename="' + esc(n.filename) + '" draggable="true">';
    html += '<span class="dn-note-title">' + esc(n.title) + '</span>';
    html += '<span class="dn-note-folder">' + esc(n.folder) + '</span>';
    html += '</button>';
  }

  html += '</div></div>';
  return html;
}

function buildMainContent(noteHTML) {
  var html = '<div class="dn-main" id="dnMain">';
  if (!noteHTML) {
    html += '<div class="dn-empty-main">';
    html += '<i class="fa-solid fa-book-open dn-empty-icon"></i>';
    html += '<h2>Select a note</h2>';
    html += '<p class="dn-text-muted">Choose a pinned note from the sidebar</p>';
    html += '</div>';
  } else {
    html += '<div class="dn-content">' + noteHTML + '</div>';
  }
  html += '</div>';
  return html;
}

function buildRightSidebar(headings, metadata, selectedFilename, isPinned) {
  var html = '<div class="dn-right" id="dnRight">';

  // Note action buttons at top
  if (selectedFilename) {
    html += '<div class="dn-right-actions">';
    html += '<a class="dn-right-action-btn" data-action="openNoteInEditor" data-filename="' + esc(selectedFilename) + '" title="Open in split view">';
    html += '<i class="fa-solid fa-arrow-up-right-from-square"></i> Open</a>';
    html += '<button class="dn-right-action-btn' + (isPinned ? ' active' : '') + '" data-action="togglePinFromViewer" data-filename="' + esc(selectedFilename) + '" title="' + (isPinned ? 'Unpin' : 'Pin') + '">';
    html += '<i class="fa-solid fa-thumbtack"></i> ' + (isPinned ? 'Unpin' : 'Pin') + '</button>';
    html += '</div>';
  }

  // Metadata section
  if (metadata && (metadata.date || metadata.attendees || metadata.recording)) {
    html += '<div class="dn-meta-section">';

    if (metadata.date) {
      var dateEncoded = encodeURIComponent(metadata.date);
      html += '<a class="dn-meta-item" href="noteplan://x-callback-url/openNote?noteDate=' + dateEncoded + '&splitView=yes">';
      html += '<i class="fa-regular fa-calendar"></i> ' + esc(metadata.date);
      html += '</a>';
    }

    if (metadata.attendees) {
      var emails = metadata.attendees.split(',').map(function(e) { return e.trim(); }).filter(Boolean);
      html += '<div class="dn-meta-item dn-meta-attendees">';
      html += '<span class="dn-meta-inline"><i class="fa-solid fa-users"></i> ' + emails.length + ' attendee' + (emails.length !== 1 ? 's' : '') + '</span>';
      html += '<div class="dn-attendee-list">';
      for (var a = 0; a < emails.length; a++) {
        html += '<div class="dn-attendee">' + esc(emails[a]) + '</div>';
      }
      html += '</div></div>';
    }

    if (metadata.recording) {
      html += '<a class="dn-meta-item dn-meta-btn" href="' + esc(metadata.recording) + '" target="_blank">';
      html += '<i class="fa-solid fa-video"></i> Open Recording';
      html += '</a>';
    }

    html += '</div>';
  }

  // Table of Contents
  if (headings && headings.length > 0) {
    html += '<div class="dn-toc-section">';
    html += '<div class="dn-toc-title">Contents</div>';
    html += '<div class="dn-toc-list">';
    for (var h = 0; h < headings.length; h++) {
      var heading = headings[h];
      html += '<button class="dn-toc-item dn-toc-level-' + heading.level + '" data-action="scrollToHeading" data-heading-id="' + esc(heading.id) + '">';
      html += esc(heading.text);
      html += '</button>';
    }
    html += '</div></div>';
  }

  html += '</div>';
  return html;
}

function buildDashboardHTML(pinnedNotes, selectedFilename, noteHTML, headings, metadata) {
  var isPinned = false;
  for (var pi = 0; pi < pinnedNotes.length; pi++) {
    if (pinnedNotes[pi].filename === selectedFilename) { isPinned = true; break; }
  }
  var html = '<div class="dn-layout">';
  html += '<button class="dn-mobile-toggle dn-left-toggle" data-action="toggleLeft"><i class="fa-solid fa-bars"></i></button>';
  html += '<button class="dn-mobile-toggle dn-right-toggle" data-action="toggleRight"><i class="fa-solid fa-list-ul"></i></button>';
  html += buildLeftSidebar(pinnedNotes, selectedFilename);
  html += '<div class="dn-left-backdrop" data-action="toggleLeft"></div>';
  html += buildMainContent(noteHTML);
  html += buildRightSidebar(headings, metadata, selectedFilename, isPinned);
  html += '<div class="dn-right-backdrop" data-action="toggleRight"></div>';
  html += '</div>';
  return html;
}

function buildFullHTML(bodyContent) {
  var themeCSS = getThemeCSS();
  var pluginCSS = getInlineCSS();

  var faLinks = '\n' +
    '    <link href="../np.Shared/fontawesome.css" rel="stylesheet">\n' +
    '    <link href="../np.Shared/regular.min.flat4NP.css" rel="stylesheet">\n' +
    '    <link href="../np.Shared/solid.min.flat4NP.css" rel="stylesheet">\n';

  var themeAttr = isLightTheme() ? 'light' : 'dark';

  var priVars = getPriorityCSSVars();

  return '<!DOCTYPE html>\n<html data-theme="' + themeAttr + '">\n<head>\n' +
    '  <meta charset="utf-8">\n' +
    '  <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, maximum-scale=1, viewport-fit=cover">\n' +
    '  <title>Donote</title>\n' +
    faLinks +
    '  <style>' + themeCSS + '\n:root { ' + priVars + ' }\n' + pluginCSS + '</style>\n' +
    '</head>\n<body>\n' +
    bodyContent + '\n' +
    '  <div class="dn-toast" id="dnToast"></div>\n' +
    '  <script>\n    var receivingPluginID = \'' + PLUGIN_ID + '\';\n  <\/script>\n' +
    '  <script type="text/javascript" src="donoteEvents.js"><\/script>\n' +
    '  <script type="text/javascript" src="../np.Shared/pluginToHTMLCommsBridge.js"><\/script>\n' +
    '</body>\n</html>';
}

// ============================================
// INLINE CSS
// ============================================

function getInlineCSS() {
  return '\n' +
':root, [data-theme="dark"] {\n' +
'  --dn-bg: var(--bg-main-color, #1a1a2e);\n' +
'  --dn-bg-card: var(--bg-alt-color, #16213e);\n' +
'  --dn-bg-elevated: color-mix(in srgb, var(--dn-bg-card) 85%, white 15%);\n' +
'  --dn-text: var(--fg-main-color, #e0e0e0);\n' +
'  --dn-text-muted: color-mix(in srgb, var(--dn-text) 55%, transparent);\n' +
'  --dn-text-faint: color-mix(in srgb, var(--dn-text) 35%, transparent);\n' +
'  --dn-accent: var(--tint-color, #6366F1);\n' +
'  --dn-accent-soft: color-mix(in srgb, var(--dn-accent) 15%, transparent);\n' +
'  --dn-border: color-mix(in srgb, var(--dn-text) 10%, transparent);\n' +
'  --dn-border-strong: color-mix(in srgb, var(--dn-text) 18%, transparent);\n' +
'  --dn-orange: #F97316;\n' +
'  --dn-blue: #3B82F6;\n' +
'  --dn-green: #10B981;\n' +
'  --dn-red: #EF4444;\n' +
'  --dn-radius: 10px;\n' +
'  --dn-radius-sm: 6px;\n' +
'  --dn-left-width: 200px;\n' +
'  --dn-right-width: 200px;\n' +
'}\n' +
'[data-theme="light"] {\n' +
'  --dn-bg-elevated: color-mix(in srgb, var(--dn-bg-card) 92%, black 8%);\n' +
'  --dn-text-muted: color-mix(in srgb, var(--dn-text) 60%, transparent);\n' +
'  --dn-text-faint: color-mix(in srgb, var(--dn-text) 40%, transparent);\n' +
'}\n' +
'* { box-sizing: border-box; margin: 0; padding: 0; }\n' +
'body {\n' +
'  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;\n' +
'  background: var(--dn-bg); color: var(--dn-text);\n' +
'  font-size: 14px; line-height: 1.6;\n' +
'  -webkit-font-smoothing: antialiased; overflow: hidden; height: 100vh;\n' +
'}\n' +

/* Layout */
'.dn-layout { display: flex; height: 100vh; overflow: hidden; position: relative; }\n' +

/* Left Sidebar */
'.dn-left {\n' +
'  width: var(--dn-left-width); flex-shrink: 0;\n' +
'  background: var(--dn-bg-card); border-right: 1px solid var(--dn-border);\n' +
'  display: flex; flex-direction: column; overflow: hidden;\n' +
'}\n' +
'.dn-left-header {\n' +
'  padding: 12px 12px 8px; border-bottom: 1px solid var(--dn-border);\n' +
'}\n' +
'.dn-left-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--dn-text-faint); }\n' +
'.dn-left-list { flex: 1; overflow-y: auto; padding: 4px; }\n' +
'.dn-left-empty { padding: 16px 12px; font-size: 12px; text-align: center; line-height: 1.8; }\n' +
'.dn-note-item {\n' +
'  display: block; width: 100%; text-align: left; padding: 8px 10px;\n' +
'  border: none; background: transparent; border-radius: var(--dn-radius-sm);\n' +
'  cursor: pointer; transition: all 0.12s;\n' +
'}\n' +
'.dn-note-item:hover { background: var(--dn-border); }\n' +
'.dn-note-item.active { background: var(--dn-accent-soft); }\n' +
'.dn-note-item.is-dragging { opacity: 0.4; }\n' +
'.dn-note-item.drag-over-top { box-shadow: 0 -2px 0 var(--dn-accent); }\n' +
'.dn-note-item.drag-over-bottom { box-shadow: 0 2px 0 var(--dn-accent); }\n' +
'.dn-note-title {\n' +
'  display: block; font-size: 13px; font-weight: 600; color: var(--dn-text);\n' +
'  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;\n' +
'}\n' +
'.dn-note-item.active .dn-note-title { color: var(--dn-accent); }\n' +
'.dn-note-folder {\n' +
'  display: block; font-size: 10px; color: var(--dn-text-faint);\n' +
'  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 1px;\n' +
'}\n' +

/* Main Content */
'.dn-main {\n' +
'  flex: 1; overflow-y: auto; padding: 24px 32px 60px; min-width: 0;\n' +
'}\n' +
'.dn-empty-main {\n' +
'  display: flex; flex-direction: column; align-items: center; justify-content: center;\n' +
'  height: 100%; text-align: center; color: var(--dn-text-muted);\n' +
'}\n' +
'.dn-empty-icon { font-size: 48px; color: var(--dn-text-faint); margin-bottom: 16px; }\n' +
'.dn-content { max-width: 720px; }\n' +

/* Headings */
'.dn-heading { margin: 24px 0 8px; font-weight: 700; }\n' +
'.dn-h1 { font-size: 26px; margin-top: 0; }\n' +
'.dn-h2 { font-size: 22px; }\n' +
'.dn-h3 { font-size: 18px; }\n' +
'.dn-h4 { font-size: 16px; }\n' +
'.dn-h5 { font-size: 14px; }\n' +
'.dn-h6 { font-size: 13px; color: var(--dn-text-muted); }\n' +

/* Paragraphs & text */
'.dn-para { margin: 6px 0; }\n' +
'.dn-text-muted { color: var(--dn-text-muted); }\n' +
'.dn-text-faint { color: var(--dn-text-faint); font-size: 11px; }\n' +

/* Links */
'.dn-link { color: var(--dn-blue); text-decoration: none; }\n' +
'.dn-link:hover { text-decoration: underline; }\n' +
'.dn-wiki-link { color: var(--dn-accent); }\n' +

/* Tags & Mentions */
'.dn-tag, .dn-mention { color: var(--dn-orange); font-weight: 600; text-decoration: none; }\n' +
'.dn-tag:hover, .dn-mention:hover { text-decoration: underline; }\n' +

/* Comments */
'.dn-comment { color: var(--dn-text-faint); font-style: italic; }\n' +

/* Date badges */
'.dn-date-badge {\n' +
'  display: inline-flex; align-items: center; gap: 3px;\n' +
'  padding: 1px 6px; border-radius: 3px; font-size: 12px;\n' +
'  background: var(--dn-accent-soft); color: var(--dn-accent);\n' +
'}\n' +

/* Calendar badges */
'.dn-cal-badge {\n' +
'  display: inline-flex; align-items: center; gap: 4px;\n' +
'  padding: 2px 8px; border-radius: 4px;\n' +
'  background: var(--dn-border); font-size: 13px;\n' +
'}\n' +
'.dn-cal-time { font-size: 11px; color: var(--dn-text-muted); }\n' +

/* Tasks */
'.dn-task {\n' +
'  display: flex; align-items: flex-start; gap: 8px;\n' +
'  padding: 3px 0; line-height: 1.5;\n' +
'}\n' +
'.dn-task.dn-done { opacity: 0.5; }\n' +
'.dn-task.dn-done .dn-task-text { text-decoration: line-through; }\n' +
'.dn-task.dn-indent-1 { padding-left: 20px; }\n' +
'.dn-task.dn-indent-2 { padding-left: 40px; }\n' +
'.dn-cb { flex-shrink: 0; font-size: 16px; margin-top: 2px; color: var(--dn-text-faint); cursor: pointer; }\n' +
'.dn-cb:hover { color: var(--dn-green); }\n' +
'.dn-cb.done { color: var(--dn-green); }\n' +
'.dn-cb.cancelled { color: var(--dn-text-faint); }\n' +
'.dn-cb-square { font-size: 15px; }\n' +
'.dn-task.dn-cancelled { opacity: 0.5; }\n' +
'.dn-task.dn-cancelled .dn-task-text { text-decoration: line-through; }\n' +
'.dn-task-text { flex: 1; min-width: 0; }\n' +

/* Priority badges */
'.dn-pri {\n' +
'  display: inline-flex; align-items: center; justify-content: center;\n' +
'  padding: 0 5px; height: 18px; border-radius: 3px;\n' +
'  font-size: 10px; font-weight: 800; flex-shrink: 0;\n' +
'}\n' +
'.dn-pri-1 { background: var(--dn-pri1-bg, rgba(255,85,85,0.27)); color: var(--dn-pri1-color, #FFDBBE); }\n' +
'.dn-pri-2 { background: var(--dn-pri2-bg, rgba(255,85,85,0.47)); color: var(--dn-pri2-color, #FFCCCC); }\n' +
'.dn-pri-3 { background: var(--dn-pri3-bg, rgba(255,85,85,0.67)); color: var(--dn-pri3-color, #FFB5B5); }\n' +

/* Lists */
'.dn-list { margin: 6px 0; padding-left: 24px; }\n' +
'.dn-list li { margin: 3px 0; }\n' +

/* Blockquotes */
'.dn-blockquote {\n' +
'  margin: 8px 0; padding: 8px 16px;\n' +
'  border-left: 3px solid var(--dn-accent);\n' +
'  background: var(--dn-accent-soft); border-radius: 0 var(--dn-radius-sm) var(--dn-radius-sm) 0;\n' +
'  color: var(--dn-text-muted); font-style: italic;\n' +
'}\n' +
'.dn-blockquote p { margin: 4px 0; }\n' +

/* Code */
'.dn-code-inline {\n' +
'  font-family: "SF Mono", "Fira Code", monospace; font-size: 12px;\n' +
'  padding: 1px 5px; border-radius: 3px;\n' +
'  background: var(--dn-border); color: var(--dn-text);\n' +
'}\n' +
'.dn-code-block {\n' +
'  margin: 12px 0; padding: 12px 16px;\n' +
'  background: var(--dn-bg-card); border: 1px solid var(--dn-border);\n' +
'  border-radius: var(--dn-radius-sm); overflow-x: auto;\n' +
'  font-family: "SF Mono", "Fira Code", monospace; font-size: 12px;\n' +
'  line-height: 1.5; white-space: pre;\n' +
'}\n' +
'.dn-code-block code { font-family: inherit; font-size: inherit; }\n' +
'.dn-code-wrap { position: relative; }\n' +
'.dn-code-copy {\n' +
'  position: absolute; top: 8px; right: 8px;\n' +
'  width: 28px; height: 28px; border-radius: 4px;\n' +
'  border: 1px solid var(--dn-border-strong); background: var(--dn-bg-card);\n' +
'  color: var(--dn-text-faint); cursor: pointer; font-size: 12px;\n' +
'  display: flex; align-items: center; justify-content: center;\n' +
'  opacity: 0; transition: opacity 0.15s;\n' +
'}\n' +
'.dn-code-wrap:hover .dn-code-copy { opacity: 1; }\n' +
'.dn-code-copy:hover { background: var(--dn-accent); color: #fff; border-color: var(--dn-accent); }\n' +

/* Highlight */
'.dn-highlight {\n' +
'  background: color-mix(in srgb, #F59E0B 15%, transparent);\n' +
'  color: #F59E0B; padding: 0 3px; border-radius: 2px;\n' +
'}\n' +

/* Tables */
'.dn-table-wrap { overflow-x: auto; margin: 12px 0; }\n' +
'.dn-table {\n' +
'  border-collapse: collapse; width: 100%; font-size: 13px;\n' +
'}\n' +
'.dn-table th, .dn-table td {\n' +
'  padding: 6px 12px; border: 1px solid var(--dn-border-strong);\n' +
'  text-align: left;\n' +
'}\n' +
'.dn-table th {\n' +
'  background: var(--dn-bg-card); font-weight: 600;\n' +
'  font-size: 12px; text-transform: uppercase; letter-spacing: 0.03em;\n' +
'  color: var(--dn-text-muted);\n' +
'}\n' +
'.dn-table tr:hover td { background: var(--dn-border); }\n' +

/* Images */
'.dn-image-wrap { margin: 12px 0; }\n' +
'.dn-image { max-width: 100%; border-radius: var(--dn-radius-sm); }\n' +

/* Horizontal rule */
'.dn-hr {\n' +
'  border: none; border-top: 1px solid var(--dn-border-strong);\n' +
'  margin: 16px 0;\n' +
'}\n' +

/* Right Sidebar */
'.dn-right {\n' +
'  width: var(--dn-right-width); flex-shrink: 0;\n' +
'  background: var(--dn-bg-card); border-left: 1px solid var(--dn-border);\n' +
'  display: flex; flex-direction: column; overflow-y: auto;\n' +
'  padding: 12px 8px;\n' +
'}\n' +
'.dn-right-actions {\n' +
'  display: flex; gap: 4px; padding: 0 0 8px; margin-bottom: 8px;\n' +
'  border-bottom: 1px solid var(--dn-border);\n' +
'}\n' +
'.dn-right-action-btn {\n' +
'  flex: 1; display: flex; align-items: center; justify-content: center; gap: 5px;\n' +
'  padding: 6px 8px; font-size: 11px; font-weight: 500;\n' +
'  border-radius: var(--dn-radius-sm); border: none;\n' +
'  background: var(--dn-border); color: var(--dn-text-muted);\n' +
'  cursor: pointer; text-decoration: none; transition: all 0.12s;\n' +
'}\n' +
'.dn-right-action-btn:hover { background: var(--dn-border-strong); color: var(--dn-text); }\n' +
'.dn-right-action-btn.active { background: var(--dn-accent-soft); color: var(--dn-accent); }\n' +
'.dn-right-action-btn i { font-size: 10px; }\n' +
'.dn-meta-section {\n' +
'  padding-bottom: 10px; margin-bottom: 10px;\n' +
'  border-bottom: 1px solid var(--dn-border);\n' +
'  display: flex; flex-direction: column; gap: 6px;\n' +
'}\n' +
'.dn-meta-item {\n' +
'  display: flex; align-items: center; gap: 8px;\n' +
'  padding: 6px 8px; font-size: 12px; border-radius: var(--dn-radius-sm);\n' +
'  color: var(--dn-text-muted); text-decoration: none;\n' +
'  cursor: pointer; transition: all 0.12s;\n' +
'}\n' +
'.dn-meta-item:hover { background: var(--dn-border); color: var(--dn-text); }\n' +
'.dn-meta-item i { width: 14px; text-align: center; flex-shrink: 0; }\n' +
'.dn-meta-btn {\n' +
'  background: var(--dn-accent-soft); color: var(--dn-accent);\n' +
'}\n' +
'.dn-meta-btn:hover { background: var(--dn-accent); color: #fff; }\n' +
'.dn-meta-attendees { flex-wrap: wrap; cursor: pointer; }\n' +
'.dn-meta-inline { display: flex; align-items: center; gap: 8px; white-space: nowrap; }\n' +
'.dn-attendee-list { display: none; width: 100%; padding: 4px 0 0 22px; }\n' +
'.dn-meta-attendees.expanded .dn-attendee-list { display: block; }\n' +
'.dn-attendee { font-size: 11px; color: var(--dn-text-faint); padding: 1px 0; }\n' +

/* Table of Contents */
'.dn-toc-section { flex: 1; }\n' +
'.dn-toc-title {\n' +
'  font-size: 11px; font-weight: 700; text-transform: uppercase;\n' +
'  letter-spacing: 0.05em; color: var(--dn-text-faint);\n' +
'  padding: 4px 8px 6px; margin-bottom: 2px;\n' +
'}\n' +
'.dn-toc-list { display: flex; flex-direction: column; }\n' +
'.dn-toc-item {\n' +
'  display: block; width: 100%; text-align: left;\n' +
'  padding: 4px 8px; font-size: 12px;\n' +
'  border: none; background: transparent; border-radius: var(--dn-radius-sm);\n' +
'  color: var(--dn-text-muted); cursor: pointer;\n' +
'  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;\n' +
'  transition: all 0.1s;\n' +
'}\n' +
'.dn-toc-item:hover { background: var(--dn-border); color: var(--dn-text); }\n' +
'.dn-toc-item.active { color: var(--dn-accent); font-weight: 600; }\n' +
'.dn-toc-level-1 { font-weight: 600; padding-left: 8px; }\n' +
'.dn-toc-level-2 { padding-left: 16px; }\n' +
'.dn-toc-level-3 { padding-left: 24px; font-size: 11px; }\n' +
'.dn-toc-level-4, .dn-toc-level-5, .dn-toc-level-6 { padding-left: 32px; font-size: 11px; }\n' +

/* Toast */
'.dn-toast {\n' +
'  position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%) translateY(60px);\n' +
'  padding: 10px 20px; border-radius: var(--dn-radius-sm);\n' +
'  background: var(--dn-bg-elevated); color: var(--dn-text);\n' +
'  border: 1px solid var(--dn-border); font-size: 13px;\n' +
'  opacity: 0; transition: all 0.3s; z-index: 200; pointer-events: none;\n' +
'}\n' +
'.dn-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }\n' +

/* Mobile toggles */
'.dn-mobile-toggle {\n' +
'  display: none; position: fixed; top: 8px; z-index: 50;\n' +
'  width: 36px; height: 36px; border-radius: var(--dn-radius-sm);\n' +
'  border: 1px solid var(--dn-border); background: var(--dn-bg-card);\n' +
'  color: var(--dn-text-muted); cursor: pointer; align-items: center; justify-content: center;\n' +
'  font-size: 14px;\n' +
'}\n' +
'.dn-left-toggle { left: 8px; }\n' +
'.dn-right-toggle { right: 8px; }\n' +
'.dn-left-backdrop, .dn-right-backdrop {\n' +
'  display: none; position: fixed; inset: 0; z-index: 90;\n' +
'  background: color-mix(in srgb, black 30%, transparent);\n' +
'}\n' +

/* Mobile */
'@media (max-width: 700px) {\n' +
'  .dn-mobile-toggle { display: flex; }\n' +
'  .dn-left {\n' +
'    position: fixed; left: 0; top: 0; bottom: 0; z-index: 100;\n' +
'    width: 240px; transform: translateX(-100%);\n' +
'    transition: transform 0.25s cubic-bezier(0.22, 1, 0.36, 1);\n' +
'  }\n' +
'  .dn-left.open { transform: translateX(0); box-shadow: 4px 0 24px color-mix(in srgb, black 25%, transparent); }\n' +
'  .dn-left-backdrop.open { display: block; }\n' +
'  .dn-right {\n' +
'    position: fixed; right: 0; top: 0; bottom: 0; z-index: 100;\n' +
'    width: 240px; transform: translateX(100%);\n' +
'    transition: transform 0.25s cubic-bezier(0.22, 1, 0.36, 1);\n' +
'  }\n' +
'  .dn-right.open { transform: translateX(0); box-shadow: -4px 0 24px color-mix(in srgb, black 25%, transparent); }\n' +
'  .dn-right-backdrop.open { display: block; }\n' +
'  .dn-main { padding: 50px 16px 60px; }\n' +
'}\n';
}

// ============================================
// MAIN ENTRY & MESSAGE HANDLING
// ============================================

async function showDonote(selectedFilename) {
  try {
    CommandBar.showLoading(true, 'Loading Donote...');
    await CommandBar.onAsyncThread();

    var config = getSettings();
    var pinnedNotes = getPinnedNotes();

    // Determine which note to show
    var filename = selectedFilename || config.lastSelectedNote || '';
    if (!filename && pinnedNotes.length > 0) {
      filename = pinnedNotes[0].filename;
    }
    if (filename) saveLastSelectedNote(filename);

    // Load note content
    var noteHTML = '';
    var headings = [];
    var metadata = {};

    if (filename) {
      var note = getNoteByFilename(filename);
      if (note) {
        var content = note.content || '';
        var parsed = parseFrontmatter(content);

        noteHTML = renderNoteToHTML(content, filename);
        headings = extractHeadings(parsed.body);

        // Extract metadata
        if (parsed.frontmatter.date) metadata.date = parsed.frontmatter.date;
        if (parsed.frontmatter.attendees) metadata.attendees = parsed.frontmatter.attendees;
        if (parsed.frontmatter.recording) metadata.recording = parsed.frontmatter.recording;
      }
    }

    var bodyContent = buildDashboardHTML(pinnedNotes, filename, noteHTML, headings, metadata);
    var fullHTML = buildFullHTML(bodyContent);

    await CommandBar.onMainThread();
    CommandBar.showLoading(false);

    var winOptions = {
      customId: WINDOW_ID,
      savedFilename: '../../asktru.Donote/donote.html',
      shouldFocus: true,
      reuseUsersWindowRect: true,
      headerBGColor: 'transparent',
      autoTopPadding: true,
      showReloadButton: true,
      reloadPluginID: PLUGIN_ID,
      reloadCommandName: 'Donote',
      icon: 'fa-book-open',
      iconColor: '#6366F1',
    };

    var result = await HTMLView.showInMainWindow(fullHTML, 'Donote', winOptions);
    if (!result || !result.success) {
      await HTMLView.showWindowWithOptions(fullHTML, 'Donote', winOptions);
    }
  } catch (err) {
    CommandBar.showLoading(false);
    console.log('Donote error: ' + String(err));
  }
}

async function refreshDonote() {
  await showDonote();
}

async function sendToHTMLWindow(windowId, type, data) {
  try {
    if (typeof HTMLView === 'undefined' || typeof HTMLView.runJavaScript !== 'function') return;
    var payload = {};
    var keys = Object.keys(data);
    for (var k = 0; k < keys.length; k++) payload[keys[k]] = data[keys[k]];
    payload.NPWindowID = windowId;

    var stringifiedPayload = JSON.stringify(payload);
    var doubleStringified = JSON.stringify(stringifiedPayload);
    var jsCode = '(function() { try { var pd = ' + doubleStringified + '; var p = JSON.parse(pd); window.postMessage({ type: "' + type + '", payload: p }, "*"); } catch(e) { console.error("sendToHTMLWindow error:", e); } })();';
    await HTMLView.runJavaScript(jsCode, windowId);
  } catch (err) {
    console.log('sendToHTMLWindow error: ' + String(err));
  }
}

async function onMessageFromHTMLView(actionType, data) {
  try {
    var msg = typeof data === 'string' ? JSON.parse(data) : data;

    switch (actionType) {
      case 'selectNote':
        if (msg.filename) {
          saveLastSelectedNote(msg.filename);
          var note = getNoteByFilename(msg.filename);
          if (note) {
            var content = note.content || '';
            var parsed = parseFrontmatter(content);
            var noteHTML = renderNoteToHTML(content, msg.filename);
            var headings = extractHeadings(parsed.body);
            var metadata = {};
            if (parsed.frontmatter.date) metadata.date = parsed.frontmatter.date;
            if (parsed.frontmatter.attendees) metadata.attendees = parsed.frontmatter.attendees;
            if (parsed.frontmatter.recording) metadata.recording = parsed.frontmatter.recording;

            await sendToHTMLWindow(WINDOW_ID, 'NOTE_LOADED', {
              filename: msg.filename,
              noteHTML: noteHTML,
              headings: headings,
              metadata: metadata,
            });
          }
        }
        break;

      case 'toggleTask':
      case 'cancelTask':
        if (msg.filename && msg.lineIndex !== undefined) {
          var tNote = getNoteByFilename(msg.filename);
          if (tNote) {
            var targetLine = parseInt(msg.lineIndex);
            // Find the paragraph matching this line index
            var paras = tNote.paragraphs;
            var para = null;
            for (var pi = 0; pi < paras.length; pi++) {
              if (paras[pi].lineIndex === targetLine) { para = paras[pi]; break; }
            }
            if (para) {
              var oldType = para.type;
              if (actionType === 'cancelTask') {
                if (oldType === 'open' || oldType === 'done') para.type = 'cancelled';
                else if (oldType === 'checklist' || oldType === 'checklistDone') para.type = 'checklistCancelled';
                else if (oldType === 'cancelled') para.type = 'open';
                else if (oldType === 'checklistCancelled') para.type = 'checklist';
              } else {
                if (oldType === 'open') para.type = 'done';
                else if (oldType === 'done') para.type = 'open';
                else if (oldType === 'checklist') para.type = 'checklistDone';
                else if (oldType === 'checklistDone') para.type = 'checklist';
                else if (oldType === 'cancelled') para.type = 'open';
                else if (oldType === 'checklistCancelled') para.type = 'checklist';
              }
              tNote.updateParagraph(para);

              // Determine new visual state
              var newType = para.type;
              var isChecklist = newType === 'checklist' || newType === 'checklistDone' || newType === 'checklistCancelled';
              var uiStatus = 'open';
              if (newType === 'done' || newType === 'checklistDone') uiStatus = 'done';
              else if (newType === 'cancelled' || newType === 'checklistCancelled') uiStatus = 'cancelled';

              await sendToHTMLWindow(WINDOW_ID, 'TASK_TOGGLED', {
                filename: msg.filename,
                lineIndex: targetLine,
                status: uiStatus,
                isChecklist: isChecklist,
              });
            }
          }
        }
        break;

      case 'openNoteInEditor':
        if (msg.filename) {
          await CommandBar.onMainThread();
          // Open in split view
          var noteTitle = '';
          var oNote = getNoteByFilename(msg.filename);
          if (oNote) noteTitle = oNote.title || '';
          if (noteTitle) {
            NotePlan.openURL('noteplan://x-callback-url/openNote?noteTitle=' + encodeURIComponent(noteTitle) + '&splitView=yes');
          } else {
            Editor.openNoteByFilename(msg.filename);
          }
        }
        break;

      case 'openURL':
        if (msg.url) {
          await CommandBar.onMainThread();
          NotePlan.openURL(msg.url);
        }
        break;

      case 'reorderPinnedNotes':
        if (msg.orderedFilenames) {
          // Update pin values to match new order
          for (var ri = 0; ri < msg.orderedFilenames.length; ri++) {
            var rNote = getNoteByFilename(msg.orderedFilenames[ri]);
            if (rNote) {
              var rContent = rNote.content || '';
              var rParsed = parseFrontmatter(rContent);
              if (rParsed.frontmatter.pin !== undefined) {
                // Update the pin value in frontmatter
                var newPinVal = ri + 1;
                var rLines = rContent.split('\n');
                for (var rl = 0; rl < rLines.length; rl++) {
                  if (rLines[rl].match(/^pin\s*:/)) {
                    rLines[rl] = 'pin: ' + newPinVal;
                    break;
                  }
                }
                rNote.content = rLines.join('\n');
              }
            }
          }
        }
        break;

      case 'togglePinFromViewer':
      case 'togglePin':
        // Toggle pin on currently open note in Editor
        var pinNote = msg.filename ? getNoteByFilename(msg.filename) : (Editor.note || null);
        if (pinNote) {
          var pinContent = pinNote.content || '';
          var pinParsed = parseFrontmatter(pinContent);
          if (pinParsed.frontmatter.pin !== undefined) {
            // Remove pin
            var pinLines = pinContent.split('\n');
            for (var pl = 0; pl < pinLines.length; pl++) {
              if (pinLines[pl].match(/^pin\s*:/)) { pinLines.splice(pl, 1); break; }
            }
            pinNote.content = pinLines.join('\n');
            await sendToHTMLWindow(WINDOW_ID, 'SHOW_TOAST', { message: 'Unpinned' });
          } else {
            // Add pin — find highest pin value and add 1
            var maxPin = 0;
            var allNotes = DataStore.projectNotes;
            for (var pn = 0; pn < allNotes.length; pn++) {
              var pnc = allNotes[pn].content || '';
              if (pnc.indexOf('pin:') < 0) continue;
              var pnParsed = parseFrontmatter(pnc);
              var pnVal = parseInt(pnParsed.frontmatter.pin);
              if (!isNaN(pnVal) && pnVal > maxPin) maxPin = pnVal;
            }
            var newPin = maxPin + 1;
            // Add to frontmatter
            var pLines = pinContent.split('\n');
            if (pLines[0].trim() === '---') {
              // Insert pin after first ---
              pLines.splice(1, 0, 'pin: ' + newPin);
            } else {
              // No frontmatter — add one
              pLines.unshift('---', 'pin: ' + newPin, '---');
            }
            pinNote.content = pLines.join('\n');
            await sendToHTMLWindow(WINDOW_ID, 'SHOW_TOAST', { message: 'Pinned' });
          }
          // Refresh to show updated sidebar
          await showDonote(getSettings().lastSelectedNote);
        }
        break;

      default:
        console.log('Donote: unknown action: ' + actionType);
    }
  } catch (err) {
    console.log('Donote onMessage error: ' + String(err));
  }
}

// ============================================
// EXPORTS
// ============================================

async function togglePinCommand() {
  var note = Editor.note;
  if (!note) {
    await CommandBar.prompt('No note open', 'Open a note first, then run this command.');
    return;
  }
  var content = note.content || '';
  var parsed = parseFrontmatter(content);
  if (parsed.frontmatter.pin !== undefined) {
    // Remove pin
    var lines = content.split('\n');
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].match(/^pin\s*:/)) { lines.splice(i, 1); break; }
    }
    note.content = lines.join('\n');
    await CommandBar.prompt('Unpinned', 'Note removed from Donote sidebar.');
  } else {
    // Add pin
    var maxPin = 0;
    var allNotes = DataStore.projectNotes;
    for (var n = 0; n < allNotes.length; n++) {
      var nc = allNotes[n].content || '';
      if (nc.indexOf('pin:') < 0) continue;
      var np = parseFrontmatter(nc);
      var nv = parseInt(np.frontmatter.pin);
      if (!isNaN(nv) && nv > maxPin) maxPin = nv;
    }
    var newPin = maxPin + 1;
    var pLines = content.split('\n');
    if (pLines[0].trim() === '---') {
      pLines.splice(1, 0, 'pin: ' + newPin);
    } else {
      pLines.unshift('---', 'pin: ' + newPin, '---');
    }
    note.content = pLines.join('\n');
    await CommandBar.prompt('Pinned', 'Note added to Donote sidebar with pin: ' + newPin);
  }
}

globalThis.showDonote = showDonote;
globalThis.onMessageFromHTMLView = onMessageFromHTMLView;
globalThis.refreshDonote = refreshDonote;
globalThis.togglePinCommand = togglePinCommand;
