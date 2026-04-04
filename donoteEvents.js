// asktru.Donote — donoteEvents.js
// HTML-side event handlers for the Donote viewer

/* global sendMessageToPlugin */

// ============================================
// PLUGIN MESSAGE HANDLER
// ============================================

function onMessageFromPlugin(type, data) {
  switch (type) {
    case 'NOTE_LOADED':
      handleNoteLoaded(data);
      break;
    case 'SHOW_TOAST':
      showToast(data.message);
      break;
    case 'FULL_REFRESH':
      window.location.reload();
      break;
  }
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
        btn.className = 'dn-toc-item dn-toc-level-' + headings[h].level;
        btn.dataset.action = 'scrollToHeading';
        btn.dataset.headingId = headings[h].id;
        btn.textContent = headings[h].text;
        tocList.appendChild(btn);
      }
      tocSection.appendChild(tocList);
      right.appendChild(tocSection);
    }
  }

  setupScrollSpy();
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

  // Delegated click handler
  document.body.addEventListener('click', function(e) {
    var target = e.target.closest('[data-action]');
    if (!target) return;

    var action = target.dataset.action;
    switch (action) {
      case 'selectNote':
        sendMessageToPlugin('selectNote', JSON.stringify({ filename: target.dataset.filename }));
        break;

      case 'scrollToHeading':
        var headingId = target.dataset.headingId;
        var heading = document.getElementById(headingId);
        var mainEl = document.getElementById('dnMain');
        if (heading && mainEl) {
          mainEl.scrollTo({ top: heading.offsetTop - 20, behavior: 'smooth' });
        }
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
});
