// asktru.Donote — donoteEvents.js
// HTML-side event handlers for the Donote viewer

/* global sendMessageToPlugin */

var syncEditorEnabled = false;
var currentNoteFilename = '';
var currentFilterQuery = '';

// ============================================
// PLUGIN MESSAGE HANDLER
// ============================================

function onMessageFromPlugin(type, data) {
  switch (type) {
    case 'NOTE_LOADED':
      handleNoteLoaded(data);
      break;
    case 'TASK_TOGGLED':
      handleTaskToggled(data);
      break;
    case 'PRIORITY_CHANGED':
      handlePriorityChanged(data);
      break;
    case 'FILTER_BAR_UPDATED':
      handleFilterBarUpdated(data);
      break;
    case 'SHOW_TOAST':
      showToast(data.message);
      break;
    case 'FULL_REFRESH':
      window.location.reload();
      break;
  }
}

function handleFilterBarUpdated(data) {
  if (data.filterQuery !== undefined) currentFilterQuery = data.filterQuery;
  // Re-apply filters (filter bar input doesn't need rebuilding for task state changes)
  applyFilters();
}

function handlePriorityChanged(data) {
  var tasks = document.querySelectorAll('.dn-task[data-filename="' + data.filename + '"][data-line-index="' + data.lineIndex + '"]');
  var priLabels = { 0: '', 1: '!', 2: '!!', 3: '!!!' };
  tasks.forEach(function(taskEl) {
    taskEl.dataset.priority = data.newPriority;

    // Remove existing priority badge
    var existingPri = taskEl.querySelector('.dn-pri');
    if (existingPri) existingPri.remove();

    // Remove the "set priority" hover button if we now have a priority
    if (data.newPriority > 0) {
      var actBtn = taskEl.querySelector('.dn-task-act[data-action="cyclePriority"]');
      if (actBtn) actBtn.remove();
    }

    if (data.newPriority > 0) {
      // Insert new badge after checkbox
      var cb = taskEl.querySelector('.dn-cb');
      var badge = document.createElement('span');
      badge.className = 'dn-pri dn-pri-' + data.newPriority;
      badge.dataset.action = 'cyclePriority';
      badge.textContent = priLabels[data.newPriority];
      if (cb && cb.nextSibling) {
        taskEl.insertBefore(badge, cb.nextSibling);
        // Add space text node
        taskEl.insertBefore(document.createTextNode(' '), badge.nextSibling);
      }
    } else {
      // Add back the hover button if no priority
      var acts = taskEl.querySelector('.dn-task-acts');
      if (acts && !acts.querySelector('[data-action="cyclePriority"]')) {
        var btn = document.createElement('button');
        btn.className = 'dn-task-act';
        btn.dataset.action = 'cyclePriority';
        btn.title = 'Set priority';
        var icon = document.createElement('i');
        icon.className = 'fa-solid fa-exclamation';
        btn.appendChild(icon);
        acts.insertBefore(btn, acts.firstChild);
      }
    }
  });
  applyFilters();
}

// ============================================
// FILTER LOGIC
// ============================================

// ============================================
// FILTER QUERY PARSER & EVALUATOR
// ============================================

function getTodayStr() {
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function tokenizeFilter(input) {
  var tokens = [];
  var i = 0;
  while (i < input.length) {
    if (input[i] === ' ' || input[i] === '\t') { i++; continue; }
    if (input[i] === '(') { tokens.push({ type: 'LPAREN' }); i++; continue; }
    if (input[i] === ')') { tokens.push({ type: 'RPAREN' }); i++; continue; }
    if (input[i] === '|') { tokens.push({ type: 'OR' }); i++; continue; }
    if (input[i] === '&') { tokens.push({ type: 'AND' }); i++; continue; }

    // Priority: !, !!, !!!
    if (input[i] === '!') {
      var count = 0;
      while (i < input.length && input[i] === '!') { count++; i++; }
      tokens.push({ type: 'PRIORITY', value: count });
      continue;
    }

    // Mention: @word
    if (input[i] === '@') {
      i++;
      var mWord = '';
      while (i < input.length && input[i] !== ' ' && input[i] !== ')' && input[i] !== '|' && input[i] !== '&') {
        mWord += input[i]; i++;
      }
      if (mWord) tokens.push({ type: 'MENTION', value: mWord });
      continue;
    }

    // Tag: #word
    if (input[i] === '#') {
      var tag = '';
      while (i < input.length && input[i] !== ' ' && input[i] !== ')' && input[i] !== '|' && input[i] !== '&') {
        tag += input[i]; i++;
      }
      if (tag) tokens.push({ type: 'TAG', value: tag });
      continue;
    }

    // Word — read until delimiter
    var word = '';
    while (i < input.length && input[i] !== ' ' && input[i] !== '(' && input[i] !== ')' && input[i] !== '|' && input[i] !== '&') {
      word += input[i]; i++;
    }

    var lower = word.toLowerCase();
    if (lower.startsWith('status:')) {
      tokens.push({ type: 'STATUS', value: lower.substring(7).split(',').map(function(s) { return s.trim(); }).filter(Boolean) });
    } else if (lower === 'open' || lower === 'done' || lower === 'canceled' || lower === 'cancelled') {
      var sv = lower === 'canceled' ? 'cancelled' : lower;
      tokens.push({ type: 'STATUS', value: [sv] });
    } else if (lower === 'task' || lower === 'tasks') {
      tokens.push({ type: 'TYPE', value: 'task' });
    } else if (lower === 'checklist' || lower === 'checklists') {
      tokens.push({ type: 'TYPE', value: 'checklist' });
    } else if (lower === 'overdue' || lower === 'today' || lower === 'nodate' || lower === 'dated') {
      tokens.push({ type: 'DATE', value: lower });
    } else if (word) {
      tokens.push({ type: 'TEXT', value: word });
    }
  }
  return tokens;
}

function parseFilter(input) {
  if (!input || !input.trim()) return null;
  var tokens = tokenizeFilter(input);
  if (tokens.length === 0) return null;
  var pos = 0;

  function peek() { return pos < tokens.length ? tokens[pos] : null; }
  function next() { return tokens[pos++]; }

  function parseOr() {
    var left = parseAndExpr();
    while (peek() && peek().type === 'OR') {
      next();
      var right = parseAndExpr();
      left = { op: 'or', children: [left, right] };
    }
    return left;
  }

  function parseAndExpr() {
    var terms = [parseTerm()];
    while (peek() && peek().type !== 'OR' && peek().type !== 'RPAREN') {
      if (peek().type === 'AND') next(); // consume optional &
      if (!peek() || peek().type === 'OR' || peek().type === 'RPAREN') break;
      terms.push(parseTerm());
    }
    return terms.length === 1 ? terms[0] : { op: 'and', children: terms };
  }

  function parseTerm() {
    var t = peek();
    if (t && t.type === 'LPAREN') {
      next();
      var expr = parseOr();
      if (peek() && peek().type === 'RPAREN') next();
      return expr;
    }
    return parseAtom();
  }

  function parseAtom() {
    var t = next();
    if (!t) return { op: 'true' };
    switch (t.type) {
      case 'STATUS': return { op: 'status', values: t.value };
      case 'TYPE': return { op: 'type', value: t.value };
      case 'PRIORITY': return { op: 'priority', value: t.value };
      case 'MENTION': return { op: 'mention', value: t.value };
      case 'TAG': return { op: 'tag', value: t.value };
      case 'DATE': return { op: 'date', value: t.value };
      case 'TEXT': return { op: 'text', value: t.value };
      default: return { op: 'true' };
    }
  }

  var ast = parseOr();

  // Default: if no explicit status in the query, filter to open only
  if (!hasNodeType(ast, 'status')) {
    ast = { op: 'and', children: [{ op: 'status', values: ['open'] }, ast] };
  }

  return ast;
}

function hasNodeType(node, opType) {
  if (!node) return false;
  if (node.op === opType) return true;
  if (node.children) {
    for (var i = 0; i < node.children.length; i++) {
      if (hasNodeType(node.children[i], opType)) return true;
    }
  }
  return false;
}

function evalFilter(node, taskEl) {
  if (!node) return true;
  var i;
  switch (node.op) {
    case 'and':
      for (i = 0; i < node.children.length; i++) {
        if (!evalFilter(node.children[i], taskEl)) return false;
      }
      return true;
    case 'or':
      for (i = 0; i < node.children.length; i++) {
        if (evalFilter(node.children[i], taskEl)) return true;
      }
      return false;
    case 'status':
      var status = taskEl.dataset.status || 'open';
      return node.values.indexOf(status) >= 0;
    case 'type':
      return (taskEl.dataset.type || 'task') === node.value;
    case 'priority':
      return parseInt(taskEl.dataset.priority || '0') === node.value;
    case 'mention':
      var mText = (taskEl.querySelector('.dn-task-text') || taskEl).textContent;
      return mText.toLowerCase().indexOf('@' + node.value.toLowerCase()) >= 0;
    case 'tag':
      var tText = (taskEl.querySelector('.dn-task-text') || taskEl).textContent;
      return tText.toLowerCase().indexOf(node.value.toLowerCase()) >= 0;
    case 'date':
      var date = taskEl.dataset.date || '';
      var today = getTodayStr();
      if (node.value === 'nodate') return date === '';
      if (node.value === 'dated') return date !== '';
      if (node.value === 'overdue') return date !== '' && date < today;
      if (node.value === 'today') return date === today;
      return true;
    case 'text':
      var sText = (taskEl.querySelector('.dn-task-text') || taskEl).textContent;
      return sText.toLowerCase().indexOf(node.value.toLowerCase()) >= 0;
    case 'true':
      return true;
    default:
      return true;
  }
}

function applyFilters() {
  var tasks = document.querySelectorAll('.dn-task');
  if (!currentFilterQuery) {
    tasks.forEach(function(t) { t.style.display = ''; });
    return;
  }
  var ast = parseFilter(currentFilterQuery);
  tasks.forEach(function(t) {
    t.style.display = evalFilter(ast, t) ? '' : 'none';
  });
}

var filterDebounceTimer = null;

function handleFilterInput(value) {
  currentFilterQuery = value;
  var clearBtn = document.querySelector('.dn-filter-clear');
  if (clearBtn) clearBtn.style.display = value ? '' : 'none';
  if (filterDebounceTimer) clearTimeout(filterDebounceTimer);
  filterDebounceTimer = setTimeout(function() {
    applyFilters();
  }, 150);
}

function persistFilter() {
  if (currentNoteFilename) {
    sendMessageToPlugin('setFilterQuery', JSON.stringify({
      filename: currentNoteFilename,
      query: currentFilterQuery,
    }));
  }
}

function handleTaskToggled(data) {
  var tasks = document.querySelectorAll('.dn-task[data-filename="' + data.filename + '"][data-line-index="' + data.lineIndex + '"]');
  tasks.forEach(function(taskEl) {
    // Update data-status for filter evaluation
    taskEl.dataset.status = data.status;

    // Update status classes
    taskEl.classList.remove('dn-done', 'dn-cancelled');
    if (data.status === 'done') taskEl.classList.add('dn-done');
    else if (data.status === 'cancelled') taskEl.classList.add('dn-cancelled');

    // Update checkbox icon
    var cb = taskEl.querySelector('.dn-cb');
    if (cb) {
      cb.classList.remove('done', 'cancelled');
      if (data.status === 'done') cb.classList.add('done');
      else if (data.status === 'cancelled') cb.classList.add('cancelled');

      var icon = cb.querySelector('i');
      if (icon) {
        if (data.isChecklist) {
          icon.className = data.status === 'done' ? 'fa-solid fa-square-check' :
                          data.status === 'cancelled' ? 'fa-solid fa-square-minus' : 'fa-regular fa-square';
        } else {
          icon.className = data.status === 'done' ? 'fa-solid fa-circle-check' :
                          data.status === 'cancelled' ? 'fa-solid fa-circle-minus' : 'fa-regular fa-circle';
        }
      }
    }
  });
  applyFilters();
}

// ============================================
// NOTE LOADING (partial update, no full reload)
// ============================================

function handleNoteLoaded(data) {
  // Update left sidebar active state
  var items = document.querySelectorAll('.dn-note-item');
  for (var i = 0; i < items.length; i++) {
    items[i].classList.toggle('active', items[i].dataset.filename === data.filename);
  }

  // Track current note and reset sync state
  currentNoteFilename = data.filename || '';
  syncEditorEnabled = false;
  document.body.classList.remove('dn-synced');

  // Update filter bar
  currentFilterQuery = data.filterQuery || '';
  var mainWrap = document.querySelector('.dn-main-wrap');
  if (mainWrap) {
    var oldFilterBar = mainWrap.querySelector('.dn-filter-bar');
    if (oldFilterBar) oldFilterBar.remove();
    if (data.filterBarHTML) {
      var filterTemp = document.createElement('div');
      filterTemp.insertAdjacentHTML('afterbegin', data.filterBarHTML);
      if (filterTemp.firstChild) {
        var mainEl = mainWrap.querySelector('.dn-main');
        mainWrap.insertBefore(filterTemp.firstChild, mainEl);
      }
    }
  }

  // Update main content — noteHTML is plugin-generated trusted HTML
  // (all user content goes through esc() on the plugin side)
  var main = document.getElementById('dnMain');
  if (main) {
    // Clear existing content safely
    while (main.firstChild) main.removeChild(main.firstChild);
    var contentDiv = document.createElement('div');
    contentDiv.className = 'dn-content';
    // The noteHTML is pre-sanitized by the plugin's esc() + renderInline()
    // which escapes all HTML entities before applying safe formatting tags
    var wrapper = document.createElement('div');
    wrapper.insertAdjacentHTML('afterbegin', data.noteHTML || '');
    while (wrapper.firstChild) {
      contentDiv.appendChild(wrapper.firstChild);
    }
    main.appendChild(contentDiv);
    main.scrollTop = 0;
  }

  // Update right sidebar
  var right = document.getElementById('dnRight');
  if (right) {
    while (right.firstChild) right.removeChild(right.firstChild);

    // Action buttons (Open + Pin/Unpin)
    if (data.filename) {
      var actionsDiv = document.createElement('div');
      actionsDiv.className = 'dn-right-actions';

      var openBtn = document.createElement('button');
      openBtn.className = 'dn-right-action-btn';
      openBtn.dataset.action = 'toggleEditorSync';
      openBtn.dataset.filename = data.filename;
      openBtn.title = 'Open in split view and sync TOC';
      var openIcon = document.createElement('i');
      openIcon.className = 'fa-solid fa-arrow-up-right-from-square';
      openBtn.appendChild(openIcon);
      openBtn.appendChild(document.createTextNode(' Open'));
      actionsDiv.appendChild(openBtn);

      var pinBtn = document.createElement('button');
      pinBtn.className = 'dn-right-action-btn' + (data.isPinned ? ' active' : '');
      pinBtn.dataset.action = 'togglePinFromViewer';
      pinBtn.dataset.filename = data.filename;
      pinBtn.title = data.isPinned ? 'Unpin' : 'Pin';
      var pinIcon = document.createElement('i');
      pinIcon.className = 'fa-solid fa-thumbtack';
      pinBtn.appendChild(pinIcon);
      pinBtn.appendChild(document.createTextNode(' ' + (data.isPinned ? 'Unpin' : 'Pin')));
      actionsDiv.appendChild(pinBtn);

      right.appendChild(actionsDiv);
    }

    // Metadata section
    var meta = data.metadata || {};
    if (meta.date || meta.attendees || meta.recording) {
      var metaSection = document.createElement('div');
      metaSection.className = 'dn-meta-section';

      if (meta.date) {
        var dateLink = document.createElement('a');
        dateLink.className = 'dn-meta-item';
        dateLink.href = 'noteplan://x-callback-url/openNote?noteDate=' + encodeURIComponent(meta.date) + '&splitView=yes';
        var dateIcon = document.createElement('i');
        dateIcon.className = 'fa-regular fa-calendar';
        dateLink.appendChild(dateIcon);
        dateLink.appendChild(document.createTextNode(' ' + meta.date));
        metaSection.appendChild(dateLink);
      }

      if (meta.attendees) {
        var emails = meta.attendees.split(',').map(function(e) { return e.trim(); }).filter(Boolean);
        var attDiv = document.createElement('div');
        attDiv.className = 'dn-meta-item dn-meta-attendees';
        var attIcon = document.createElement('i');
        attIcon.className = 'fa-solid fa-users';
        attDiv.appendChild(attIcon);
        attDiv.appendChild(document.createTextNode(' ' + emails.length + ' attendee' + (emails.length !== 1 ? 's' : '')));

        var attList = document.createElement('div');
        attList.className = 'dn-attendee-list';
        for (var a = 0; a < emails.length; a++) {
          var emailDiv = document.createElement('div');
          emailDiv.className = 'dn-attendee';
          emailDiv.textContent = emails[a];
          attList.appendChild(emailDiv);
        }
        attDiv.appendChild(attList);
        metaSection.appendChild(attDiv);
      }

      if (meta.recording) {
        var recLink = document.createElement('a');
        recLink.className = 'dn-meta-item dn-meta-btn';
        recLink.href = meta.recording;
        recLink.target = '_blank';
        var recIcon = document.createElement('i');
        recIcon.className = 'fa-solid fa-video';
        recLink.appendChild(recIcon);
        recLink.appendChild(document.createTextNode(' Open Recording'));
        metaSection.appendChild(recLink);
      }

      right.appendChild(metaSection);
    }

    // TOC section
    var headings = data.headings || [];
    if (headings.length > 0) {
      var tocSection = document.createElement('div');
      tocSection.className = 'dn-toc-section';

      var tocTitle = document.createElement('div');
      tocTitle.className = 'dn-toc-title';
      tocTitle.textContent = 'Contents';
      tocSection.appendChild(tocTitle);

      var tocList = document.createElement('div');
      tocList.className = 'dn-toc-list';
      for (var h = 0; h < headings.length; h++) {
        var btn = document.createElement('button');
        btn.className = 'dn-toc-item dn-toc-level-' + headings[h].level + (headings[h].collapsed ? ' dn-toc-collapsed' : '');
        btn.dataset.action = 'scrollToHeading';
        btn.dataset.headingId = headings[h].id;
        btn.dataset.charOffset = headings[h].charOffset || '0';
        btn.textContent = headings[h].text;
        tocList.appendChild(btn);
      }
      tocSection.appendChild(tocList);
      right.appendChild(tocSection);
    }
  }

  setupScrollSpy();

  // Apply initial heading collapse state
  applySectionCollapse();

  // Apply filters if any are active
  if (currentFilterQuery) {
    applyFilters();
  }
}

// ============================================
// HEADING COLLAPSE
// ============================================

function toggleSectionVisibility(heading, collapsed) {
  // Find the section-body div that follows this heading
  var sectionBody = heading.nextElementSibling;
  if (sectionBody && sectionBody.classList.contains('dn-section-body')) {
    sectionBody.style.display = collapsed ? 'none' : '';
  }
}

function applySectionCollapse() {
  // Section bodies for collapsed headings are already hidden via inline style="display:none"
  // from the renderer, so no additional work needed on initial load.
  // This function exists for any dynamic re-application if needed.
}

function updateTocCollapseState(headingId, collapsed) {
  var tocItem = document.querySelector('.dn-toc-item[data-heading-id="' + headingId + '"]');
  if (tocItem) {
    if (collapsed) tocItem.classList.add('dn-toc-collapsed');
    else tocItem.classList.remove('dn-toc-collapsed');
  }
}

// ============================================
// SCROLL SPY (highlight current heading in TOC)
// ============================================

var scrollSpyTimer = null;

function setupScrollSpy() {
  var main = document.getElementById('dnMain');
  if (!main) return;
  main.removeEventListener('scroll', handleScrollSpy);
  main.addEventListener('scroll', handleScrollSpy);
}

function handleScrollSpy() {
  if (scrollSpyTimer) clearTimeout(scrollSpyTimer);
  scrollSpyTimer = setTimeout(function() {
    var main = document.getElementById('dnMain');
    if (!main) return;

    var headings = main.querySelectorAll('.dn-heading');
    var tocItems = document.querySelectorAll('.dn-toc-item');
    if (headings.length === 0 || tocItems.length === 0) return;

    var scrollTop = main.scrollTop;
    var activeId = '';

    for (var i = 0; i < headings.length; i++) {
      if (headings[i].offsetTop <= scrollTop + 60) {
        activeId = headings[i].id;
      }
    }

    for (var j = 0; j < tocItems.length; j++) {
      tocItems[j].classList.toggle('active', tocItems[j].dataset.headingId === activeId);
    }
  }, 50);
}

// ============================================
// CALENDAR SCHEDULE PICKER
// ============================================

var calPickerMonth = null; // { year, month } for current display
var calPickerTask = null; // { filename, lineIndex, currentDate }

function getISOWeek(d) {
  var dt = new Date(d.getTime());
  dt.setHours(0, 0, 0, 0);
  dt.setDate(dt.getDate() + 3 - ((dt.getDay() + 6) % 7));
  var jan4 = new Date(dt.getFullYear(), 0, 4);
  var dayDiff = (dt.getTime() - jan4.getTime()) / 86400000;
  var weekNum = 1 + Math.round((dayDiff - 3 + ((jan4.getDay() + 6) % 7)) / 7);
  return { year: dt.getFullYear(), week: weekNum };
}

function pad2(n) { return String(n).padStart(2, '0'); }

function formatDateStr(y, m, d) { return y + '-' + pad2(m + 1) + '-' + pad2(d); }

function formatWeekStr(y, w) { return y + '-W' + pad2(w); }

function showSchedulePicker(taskEl) {
  removeSchedulePicker();
  var rect = taskEl.getBoundingClientRect();
  var mainRect = document.getElementById('dnMain').getBoundingClientRect();
  var currentDate = taskEl.dataset.date || '';
  var now = new Date();

  calPickerTask = {
    filename: taskEl.dataset.filename || '',
    lineIndex: taskEl.dataset.lineIndex || '',
    currentDate: currentDate,
  };

  // Determine which month to show
  if (currentDate && currentDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
    var parts = currentDate.split('-');
    calPickerMonth = { year: parseInt(parts[0]), month: parseInt(parts[1]) - 1 };
  } else if (currentDate && currentDate.match(/^\d{4}-W\d{2}$/)) {
    // Get month from week
    var wp = currentDate.match(/(\d{4})-W(\d{2})/);
    var jan4 = new Date(parseInt(wp[1]), 0, 4);
    var mondayW1 = new Date(jan4.getTime());
    mondayW1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
    var weekDate = new Date(mondayW1.getTime());
    weekDate.setDate(weekDate.getDate() + (parseInt(wp[2]) - 1) * 7);
    calPickerMonth = { year: weekDate.getFullYear(), month: weekDate.getMonth() };
  } else {
    calPickerMonth = { year: now.getFullYear(), month: now.getMonth() };
  }

  var picker = document.createElement('div');
  picker.className = 'dn-sched-picker';
  picker.id = 'dnSchedPicker';

  // Position: below the task, within the main area
  var top = rect.bottom + 4;
  var left = rect.left;
  if (top + 340 > window.innerHeight) top = rect.top - 340;
  if (left + 300 > window.innerWidth) left = window.innerWidth - 310;
  picker.style.top = Math.max(4, top) + 'px';
  picker.style.left = Math.max(4, left) + 'px';

  renderCalendarPicker(picker);
  document.body.appendChild(picker);

  setTimeout(function() {
    document.addEventListener('click', closeScheduleOnOutsideClick);
  }, 0);
}

function renderCalendarPicker(picker) {
  if (!picker) picker = document.getElementById('dnSchedPicker');
  if (!picker) return;
  while (picker.firstChild) picker.removeChild(picker.firstChild);

  var year = calPickerMonth.year;
  var month = calPickerMonth.month;
  var today = new Date();
  var todayStr = formatDateStr(today.getFullYear(), today.getMonth(), today.getDate());
  var currentDate = calPickerTask ? calPickerTask.currentDate : '';
  var months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var dayNames = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

  // Header: current date/week display + open note button
  var header = document.createElement('div');
  header.className = 'dn-cal-header';

  var headerLeft = document.createElement('span');
  headerLeft.className = 'dn-cal-header-date';
  var calIcon = document.createElement('i');
  calIcon.className = 'fa-regular fa-calendar';
  headerLeft.appendChild(calIcon);
  if (currentDate) {
    headerLeft.appendChild(document.createTextNode(' ' + currentDate));
  } else {
    headerLeft.appendChild(document.createTextNode(' No date'));
  }
  header.appendChild(headerLeft);

  // Clear date button
  var clearBtn = document.createElement('button');
  clearBtn.className = 'dn-cal-clear';
  clearBtn.title = 'Clear date';
  clearBtn.textContent = 'Clear';
  clearBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    sendMessageToPlugin('scheduleTask', JSON.stringify({
      filename: calPickerTask.filename,
      lineIndex: calPickerTask.lineIndex,
      dateStr: '',
    }));
    removeSchedulePicker();
  });
  header.appendChild(clearBtn);

  picker.appendChild(header);

  // Month navigation
  var nav = document.createElement('div');
  nav.className = 'dn-cal-nav';

  var prevBtn = document.createElement('button');
  prevBtn.className = 'dn-cal-nav-btn';
  prevBtn.textContent = '<';
  prevBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    calPickerMonth.month--;
    if (calPickerMonth.month < 0) { calPickerMonth.month = 11; calPickerMonth.year--; }
    renderCalendarPicker();
  });

  var nextBtn = document.createElement('button');
  nextBtn.className = 'dn-cal-nav-btn';
  nextBtn.textContent = '>';
  nextBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    calPickerMonth.month++;
    if (calPickerMonth.month > 11) { calPickerMonth.month = 0; calPickerMonth.year++; }
    renderCalendarPicker();
  });

  var monthLabel = document.createElement('span');
  monthLabel.className = 'dn-cal-month-label';
  monthLabel.textContent = months[month] + ' ' + year;

  nav.appendChild(prevBtn);
  nav.appendChild(monthLabel);
  nav.appendChild(nextBtn);
  picker.appendChild(nav);

  // Day names header: W MO TU WE TH FR SA SU
  var dayHeader = document.createElement('div');
  dayHeader.className = 'dn-cal-grid dn-cal-day-header';
  var wHead = document.createElement('span');
  wHead.className = 'dn-cal-cell dn-cal-week-head';
  wHead.textContent = 'W';
  dayHeader.appendChild(wHead);
  for (var dh = 0; dh < 7; dh++) {
    var dhCell = document.createElement('span');
    dhCell.className = 'dn-cal-cell dn-cal-day-name' + (dh >= 5 ? ' weekend' : '');
    dhCell.textContent = dayNames[dh];
    dayHeader.appendChild(dhCell);
  }
  picker.appendChild(dayHeader);

  // Calendar grid
  var firstDay = new Date(year, month, 1);
  var startDow = (firstDay.getDay() + 6) % 7; // 0=Mon
  var daysInMonth = new Date(year, month + 1, 0).getDate();

  var day = 1 - startDow;
  while (day <= daysInMonth) {
    var row = document.createElement('div');
    row.className = 'dn-cal-grid';

    // Week number cell
    var weekDate = new Date(year, month, Math.max(day, 1));
    // Adjust to Thursday of the week for correct ISO week
    var thu = new Date(weekDate.getTime());
    thu.setDate(thu.getDate() + (3 - ((thu.getDay() + 6) % 7)));
    var iw = getISOWeek(thu);
    var weekStr = formatWeekStr(iw.year, iw.week);
    var isCurrentWeek = currentDate === weekStr;

    var weekCell = document.createElement('button');
    weekCell.className = 'dn-cal-cell dn-cal-week-num' + (isCurrentWeek ? ' selected' : '');
    weekCell.textContent = pad2(iw.week);
    weekCell.dataset.week = weekStr;
    weekCell.addEventListener('click', function(e) {
      e.stopPropagation();
      sendMessageToPlugin('scheduleTask', JSON.stringify({
        filename: calPickerTask.filename,
        lineIndex: calPickerTask.lineIndex,
        dateStr: this.dataset.week,
      }));
      removeSchedulePicker();
    });
    row.appendChild(weekCell);

    // Day cells
    for (var dow = 0; dow < 7; dow++) {
      var cell = document.createElement('button');
      cell.className = 'dn-cal-cell dn-cal-day';

      if (day >= 1 && day <= daysInMonth) {
        var dateStr = formatDateStr(year, month, day);
        cell.textContent = day;
        cell.dataset.date = dateStr;

        if (dateStr === todayStr) cell.classList.add('today');
        if (dateStr === currentDate) cell.classList.add('selected');
        if (dow >= 5) cell.classList.add('weekend');

        cell.addEventListener('click', function(e) {
          e.stopPropagation();
          sendMessageToPlugin('scheduleTask', JSON.stringify({
            filename: calPickerTask.filename,
            lineIndex: calPickerTask.lineIndex,
            dateStr: this.dataset.date,
          }));
          removeSchedulePicker();
        });
      } else {
        cell.classList.add('empty');
      }

      row.appendChild(cell);
      day++;
    }

    picker.appendChild(row);
  }
}

function closeScheduleOnOutsideClick(e) {
  var picker = document.getElementById('dnSchedPicker');
  if (picker && !picker.contains(e.target)) {
    removeSchedulePicker();
  }
}

function removeSchedulePicker() {
  var existing = document.getElementById('dnSchedPicker');
  if (existing) existing.remove();
  calPickerTask = null;
  document.removeEventListener('click', closeScheduleOnOutsideClick);
}

// ============================================
// TOAST
// ============================================

function showToast(message) {
  var toast = document.getElementById('dnToast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(function() { toast.classList.remove('show'); }, 2000);
}

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', function() {
  setupScrollSpy();

  // Init current note filename from active sidebar item
  var activeNoteItem = document.querySelector('.dn-note-item.active');
  if (activeNoteItem) {
    currentNoteFilename = activeNoteItem.dataset.filename || '';
  }

  // Init filter query from input
  var initInput = document.getElementById('dnFilterInput');
  if (initInput) currentFilterQuery = initInput.value || '';
  if (currentFilterQuery) {
    applyFilters();
  }

  // Delegated click handler
  document.body.addEventListener('click', function(e) {
    var target = e.target.closest('[data-action]');
    if (!target) return;

    var action = target.dataset.action;
    switch (action) {
      case 'selectNote':
        sendMessageToPlugin('selectNote', JSON.stringify({ filename: target.dataset.filename }));
        break;

      case 'toggleHeadingCollapse':
        var thcId = target.dataset.headingId;
        var thcHeading = document.getElementById(thcId);
        if (thcHeading && currentNoteFilename) {
          var wasCollapsed = thcHeading.dataset.collapsed === 'true';
          var nowCollapsed = !wasCollapsed;
          thcHeading.dataset.collapsed = String(nowCollapsed);
          if (nowCollapsed) thcHeading.classList.add('dn-collapsed');
          else thcHeading.classList.remove('dn-collapsed');
          var thcChevron = target.querySelector('i');
          if (thcChevron) {
            thcChevron.className = nowCollapsed ? 'fa-solid fa-chevron-right' : 'fa-solid fa-chevron-down';
          }
          toggleSectionVisibility(thcHeading, nowCollapsed);
          updateTocCollapseState(thcId, nowCollapsed);
          sendMessageToPlugin('toggleHeadingCollapse', JSON.stringify({
            filename: currentNoteFilename,
            lineIndex: thcHeading.dataset.lineIndex,
            headingId: thcId,
          }));
        }
        break;

      case 'scrollToHeading':
        var headingId = target.dataset.headingId;
        var heading = document.getElementById(headingId);
        var mainEl = document.getElementById('dnMain');
        if (heading && mainEl) {
          mainEl.scrollTo({ top: heading.offsetTop - 20, behavior: 'smooth' });
        }
        // Sync with editor if note is open in split view
        if (syncEditorEnabled && currentNoteFilename) {
          var charOff = parseInt(target.dataset.charOffset || '0');
          sendMessageToPlugin('syncEditorToHeading', JSON.stringify({
            filename: currentNoteFilename,
            charOffset: charOff,
          }));
        }
        break;

      case 'toggleTask':
        var taskEl = target.closest('.dn-task');
        if (taskEl && taskEl.dataset.filename && taskEl.dataset.lineIndex !== undefined) {
          if (e.altKey) {
            // Opt+click: cancel
            sendMessageToPlugin('cancelTask', JSON.stringify({
              filename: taskEl.dataset.filename,
              lineIndex: taskEl.dataset.lineIndex,
            }));
          } else {
            sendMessageToPlugin('toggleTask', JSON.stringify({
              filename: taskEl.dataset.filename,
              lineIndex: taskEl.dataset.lineIndex,
            }));
          }
        }
        break;

      case 'copyCode':
        var codeWrap = target.closest('.dn-code-wrap');
        if (codeWrap) {
          var codeEl = codeWrap.querySelector('code');
          if (codeEl) {
            navigator.clipboard.writeText(codeEl.textContent).then(function() {
              target.textContent = '';
              var checkIcon = document.createElement('i');
              checkIcon.className = 'fa-solid fa-check';
              target.appendChild(checkIcon);
              setTimeout(function() {
                target.textContent = '';
                var copyIcon = document.createElement('i');
                copyIcon.className = 'fa-regular fa-copy';
                target.appendChild(copyIcon);
              }, 1500);
            });
          }
        }
        break;

      case 'toggleEditorSync':
        if (target.dataset.filename) {
          if (syncEditorEnabled) {
            // Disable sync and close split view
            syncEditorEnabled = false;
            document.body.classList.remove('dn-synced');
            target.classList.remove('active');
            var syncIcon = target.querySelector('i');
            if (syncIcon) syncIcon.className = 'fa-solid fa-arrow-up-right-from-square';
            target.lastChild.textContent = ' Open';
            sendMessageToPlugin('closeSplitView', JSON.stringify({ filename: target.dataset.filename }));
          } else {
            // Enable sync — open note in split view
            syncEditorEnabled = true;
            document.body.classList.add('dn-synced');
            target.classList.add('active');
            var syncIcon2 = target.querySelector('i');
            if (syncIcon2) syncIcon2.className = 'fa-solid fa-link';
            target.lastChild.textContent = ' Synced';
            sendMessageToPlugin('openNoteInEditor', JSON.stringify({ filename: target.dataset.filename }));
          }
        }
        break;

      case 'togglePinFromViewer':
        if (target.dataset.filename) {
          sendMessageToPlugin('togglePinFromViewer', JSON.stringify({ filename: target.dataset.filename }));
        }
        break;

      case 'cyclePriority':
        var cpTask = target.closest('.dn-task');
        if (cpTask && cpTask.dataset.filename) {
          sendMessageToPlugin('cyclePriority', JSON.stringify({
            filename: cpTask.dataset.filename,
            lineIndex: cpTask.dataset.lineIndex,
          }));
        }
        break;

      case 'cancelTask':
        var caTask = target.closest('.dn-task');
        if (caTask && caTask.dataset.filename) {
          sendMessageToPlugin('cancelTask', JSON.stringify({
            filename: caTask.dataset.filename,
            lineIndex: caTask.dataset.lineIndex,
          }));
        }
        break;

      case 'showSchedule':
        var scTask = target.closest('.dn-task');
        if (scTask) showSchedulePicker(scTask);
        break;

      case 'clearFilter':
        currentFilterQuery = '';
        var cfInput = document.getElementById('dnFilterInput');
        if (cfInput) cfInput.value = '';
        var cfClear = document.querySelector('.dn-filter-clear');
        if (cfClear) cfClear.style.display = 'none';
        applyFilters();
        persistFilter();
        break;

      case 'toggleLeft':
        var left = document.getElementById('dnLeft');
        var leftBackdrop = document.querySelector('.dn-left-backdrop');
        if (left) left.classList.toggle('open');
        if (leftBackdrop) leftBackdrop.classList.toggle('open');
        break;

      case 'toggleRight':
        var rightEl = document.getElementById('dnRight');
        var rightBackdrop = document.querySelector('.dn-right-backdrop');
        if (rightEl) rightEl.classList.toggle('open');
        if (rightBackdrop) rightBackdrop.classList.toggle('open');
        break;
    }
  });

  // Attendees expand/collapse
  document.body.addEventListener('click', function(e) {
    var attendees = e.target.closest('.dn-meta-attendees');
    if (attendees) {
      attendees.classList.toggle('expanded');
    }
  });

  // Filter input: live filtering on typing
  document.body.addEventListener('input', function(e) {
    if (e.target.id === 'dnFilterInput') {
      handleFilterInput(e.target.value);
    }
  });

  // Persist filter on Enter or blur
  document.body.addEventListener('keydown', function(e) {
    if (e.target.id === 'dnFilterInput' && e.key === 'Enter') {
      e.preventDefault();
      e.target.blur();
    }
  });

  document.body.addEventListener('focusout', function(e) {
    if (e.target.id === 'dnFilterInput') {
      persistFilter();
    }
  });

  // ============================================
  // DRAG AND DROP — pinned notes reordering
  // ============================================

  var dragSrcEl = null;

  function initPinnedDragAndDrop() {
    var items = document.querySelectorAll('.dn-note-item');
    items.forEach(function(item) {
      item.addEventListener('dragstart', function(e) {
        dragSrcEl = this;
        this.classList.add('is-dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', this.dataset.filename);
      });

      item.addEventListener('dragover', function(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        var rect = this.getBoundingClientRect();
        var mid = rect.top + rect.height / 2;
        this.classList.remove('drag-over-top', 'drag-over-bottom');
        if (e.clientY < mid) {
          this.classList.add('drag-over-top');
        } else {
          this.classList.add('drag-over-bottom');
        }
      });

      item.addEventListener('dragleave', function() {
        this.classList.remove('drag-over-top', 'drag-over-bottom');
      });

      item.addEventListener('drop', function(e) {
        e.preventDefault();
        e.stopPropagation();
        this.classList.remove('drag-over-top', 'drag-over-bottom');
        if (!dragSrcEl || dragSrcEl === this) return;

        var rect = this.getBoundingClientRect();
        var mid = rect.top + rect.height / 2;
        var parent = this.parentNode;

        if (e.clientY < mid) {
          parent.insertBefore(dragSrcEl, this);
        } else {
          parent.insertBefore(dragSrcEl, this.nextSibling);
        }

        // Collect new order and send to plugin
        var orderedFilenames = [];
        parent.querySelectorAll('.dn-note-item').forEach(function(el) {
          orderedFilenames.push(el.dataset.filename);
        });
        sendMessageToPlugin('reorderPinnedNotes', JSON.stringify({ orderedFilenames: orderedFilenames }));
      });

      item.addEventListener('dragend', function() {
        this.classList.remove('is-dragging');
        document.querySelectorAll('.dn-note-item').forEach(function(el) {
          el.classList.remove('drag-over-top', 'drag-over-bottom');
        });
        dragSrcEl = null;
      });
    });
  }

  initPinnedDragAndDrop();
});
