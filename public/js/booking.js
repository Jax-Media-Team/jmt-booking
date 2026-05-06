(function () {
  'use strict';

  var params = new URLSearchParams(location.search);
  // Slug comes from the URL path (/monthly-recap, /discovery) when Vercel rewrites
  // hide the ?type=… param. Falls back to query string for direct /book.html access.
  function detectMeetingSlug() {
    var path = location.pathname.replace(/^\/+|\/+$/g, '').replace(/\.html$/, '');
    if (path && path !== 'book' && path !== 'index') return path;
    return params.get('type') || 'monthly-recap';
  }
  var meetingSlug = detectMeetingSlug();
  var guestTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  var state = {
    meeting: null,
    days: [],
    daySet: new Set(),
    viewYear: 0,
    viewMonth: 0,
    selectedDate: null,
    selectedSlot: null,
  };

  var els = {
    name: document.getElementById('m-name'),
    desc: document.getElementById('m-desc'),
    long: document.getElementById('m-long'),
    agendaBlock: document.getElementById('m-agenda-block'),
    agenda: document.getElementById('m-agenda'),
    prep: document.getElementById('m-prep'),
    duration: document.getElementById('m-duration'),
    location: document.getElementById('m-location'),
    tz: document.getElementById('m-tz'),
    monthLabel: document.getElementById('month-label'),
    prevBtn: document.getElementById('prev-month'),
    nextBtn: document.getElementById('next-month'),
    calendar: document.getElementById('calendar'),
    slotsArea: document.getElementById('slots-area'),
    slotsHeader: document.getElementById('slots-header'),
    slots: document.getElementById('slots'),
    loading: document.getElementById('loading'),
    empty: document.getElementById('empty'),
    stepTime: document.getElementById('step-time'),
    stepForm: document.getElementById('step-form'),
    confirmWhen: document.getElementById('confirm-when'),
    backToTime: document.getElementById('back-to-time'),
    formFields: document.getElementById('form-fields'),
    formError: document.getElementById('form-error'),
    submitBtn: document.getElementById('submit-btn'),
  };

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fmtDuration(min) {
    if (min < 60) return min + ' minutes';
    var h = Math.floor(min / 60);
    var m = min % 60;
    return m === 0 ? h + ' hour' + (h > 1 ? 's' : '') : h + 'h ' + m + 'm';
  }

  function localDateKey(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function init() {
    fetch('/api/availability?meeting=' + encodeURIComponent(meetingSlug))
      .then(function (r) {
        if (!r.ok) throw new Error('availability ' + r.status);
        return r.json();
      })
      .then(function (data) {
        state.meeting = data.meeting;
        state.days = data.days;
        state.daySet = new Set(data.days.map(function (d) { return d.date; }));

        document.title = data.meeting.name + ' · Jax Media Team';
        els.name.textContent = data.meeting.name;
        els.desc.textContent = data.meeting.description;
        els.duration.textContent = fmtDuration(data.meeting.durationMinutes);
        els.location.textContent = data.meeting.location;
        els.tz.textContent = 'Times shown in ' + guestTz;

        if (data.meeting.longDescription) {
          els.long.textContent = data.meeting.longDescription;
          els.long.hidden = false;
        }
        if (data.meeting.agenda && data.meeting.agenda.length > 0) {
          var agendaHtml = '';
          for (var ai = 0; ai < data.meeting.agenda.length; ai++) {
            agendaHtml += '<li>' + escapeHtml(data.meeting.agenda[ai]) + '</li>';
          }
          els.agenda.innerHTML = agendaHtml;
          els.agendaBlock.hidden = false;
        }
        if (data.meeting.prepNote) {
          els.prep.textContent = data.meeting.prepNote;
          els.prep.hidden = false;
        }

        renderForm(data.meeting.formFields || []);
        prefillFromUrl(data.meeting.formFields || []);

        var today = new Date();
        state.viewYear = today.getFullYear();
        state.viewMonth = today.getMonth();
        renderCalendar();
        els.loading.hidden = true;
      })
      .catch(function (err) {
        console.error(err);
        els.loading.textContent = 'Could not load availability — please refresh, or email pcruz@jaxmediateam.com.';
      });

    els.prevBtn.addEventListener('click', function () {
      var d = new Date(state.viewYear, state.viewMonth - 1, 1);
      state.viewYear = d.getFullYear();
      state.viewMonth = d.getMonth();
      renderCalendar();
    });
    els.nextBtn.addEventListener('click', function () {
      var d = new Date(state.viewYear, state.viewMonth + 1, 1);
      state.viewYear = d.getFullYear();
      state.viewMonth = d.getMonth();
      renderCalendar();
    });
    els.backToTime.addEventListener('click', function (e) {
      e.preventDefault();
      els.stepForm.hidden = true;
      els.stepTime.hidden = false;
    });
    els.stepForm.addEventListener('submit', onSubmit);
  }

  function renderForm(fields) {
    var html = '';
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      var fid = 'fld_' + f.name;
      var labelHtml = escapeHtml(f.label);
      var helperHtml = f.helperText
        ? '<div class="field-helper">' + escapeHtml(f.helperText) + '</div>'
        : '';
      var requiredAttr = f.required ? ' required' : '';
      var maxLenAttr = f.maxLength ? ' maxlength="' + f.maxLength + '"' : '';
      var autoAttr = f.autocomplete ? ' autocomplete="' + escapeHtml(f.autocomplete) + '"' : '';
      var placeAttr = f.placeholder ? ' placeholder="' + escapeHtml(f.placeholder) + '"' : '';

      html += '<div class="field">';
      html += '<label for="' + fid + '">' + labelHtml + '</label>';
      html += helperHtml;

      if (f.type === 'textarea') {
        html += '<textarea id="' + fid + '" name="' + escapeHtml(f.name) + '"' + requiredAttr + maxLenAttr + placeAttr + '></textarea>';
      } else if (f.type === 'radio') {
        html += '<div class="radio-group" data-field="' + escapeHtml(f.name) + '">';
        var opts = f.options || [];
        for (var j = 0; j < opts.length; j++) {
          var optVal = opts[j];
          html += '<label class="radio-option">';
          html += '<input type="radio" name="' + escapeHtml(f.name) + '" value="' + escapeHtml(optVal) + '"' + requiredAttr + '>';
          html += '<span>' + escapeHtml(optVal) + '</span>';
          html += '</label>';
        }
        html += '</div>';
      } else {
        var inputType = f.type === 'email' ? 'email' : f.type === 'tel' ? 'tel' : 'text';
        html += '<input id="' + fid + '" name="' + escapeHtml(f.name) + '" type="' + inputType + '"' + requiredAttr + maxLenAttr + autoAttr + placeAttr + '>';
      }

      html += '</div>';
    }
    els.formFields.innerHTML = html;

    // Wire up radio selected state
    var groups = els.formFields.querySelectorAll('.radio-group');
    for (var g = 0; g < groups.length; g++) {
      groups[g].addEventListener('change', onRadioChange);
    }
  }

  function prefillFromUrl(fields) {
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      var val = params.get(f.name);
      if (!val) continue;
      if (f.type === 'radio') {
        var radio = els.formFields.querySelector('input[name="' + f.name + '"][value="' + val.replace(/"/g, '\\"') + '"]');
        if (radio) {
          radio.checked = true;
          var group = radio.closest('.radio-group');
          if (group) {
            var labels = group.querySelectorAll('.radio-option');
            for (var k = 0; k < labels.length; k++) {
              var input = labels[k].querySelector('input');
              if (input && input.checked) labels[k].classList.add('selected');
              else labels[k].classList.remove('selected');
            }
          }
        }
      } else {
        var el = els.formFields.querySelector('[name="' + f.name + '"]');
        if (el) el.value = val;
      }
    }
  }

  function onRadioChange(e) {
    var group = e.currentTarget;
    var labels = group.querySelectorAll('.radio-option');
    for (var i = 0; i < labels.length; i++) {
      var input = labels[i].querySelector('input');
      if (input && input.checked) labels[i].classList.add('selected');
      else labels[i].classList.remove('selected');
    }
  }

  function renderCalendar() {
    var monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    els.monthLabel.textContent = monthNames[state.viewMonth] + ' ' + state.viewYear;

    var today = new Date();
    var todayKey = localDateKey(today);
    var firstOfMonth = new Date(state.viewYear, state.viewMonth, 1);
    var startWeekday = firstOfMonth.getDay();
    var daysInMonth = new Date(state.viewYear, state.viewMonth + 1, 0).getDate();

    var firstAvailableMonthKey = state.days.length ? state.days[0].date.slice(0, 7) : null;
    var thisMonthKey = state.viewYear + '-' + String(state.viewMonth + 1).padStart(2, '0');
    els.prevBtn.disabled = firstAvailableMonthKey ? thisMonthKey <= firstAvailableMonthKey : true;
    var lastAvailableKey = state.days.length ? state.days[state.days.length - 1].date.slice(0, 7) : null;
    els.nextBtn.disabled = lastAvailableKey ? thisMonthKey >= lastAvailableKey : true;

    var html = '';
    var dows = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    for (var i = 0; i < dows.length; i++) html += '<div class="dow">' + dows[i] + '</div>';
    for (var p = 0; p < startWeekday; p++) html += '<div class="day empty"></div>';

    var hasAny = false;
    for (var d = 1; d <= daysInMonth; d++) {
      var key = state.viewYear + '-' + String(state.viewMonth + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      var classes = 'day';
      if (key < todayKey) classes += ' disabled';
      else if (state.daySet.has(key)) { classes += ' available'; hasAny = true; }
      else classes += ' disabled';
      if (key === state.selectedDate) classes += ' selected';
      html += '<button type="button" class="' + classes + '" data-date="' + key + '">' + d + '</button>';
    }
    els.calendar.innerHTML = html;

    var buttons = els.calendar.querySelectorAll('.day.available');
    for (var b = 0; b < buttons.length; b++) {
      buttons[b].addEventListener('click', onDayClick);
    }

    els.empty.hidden = hasAny;
    if (!hasAny) {
      els.slotsArea.hidden = true;
      state.selectedDate = null;
    }
  }

  function onDayClick(e) {
    var key = e.currentTarget.getAttribute('data-date');
    state.selectedDate = key;
    state.selectedSlot = null;
    renderCalendar();
    renderSlots();
  }

  function renderSlots() {
    if (!state.selectedDate) {
      els.slotsArea.hidden = true;
      return;
    }
    var day = state.days.find(function (d) { return d.date === state.selectedDate; });
    if (!day) {
      els.slotsArea.hidden = true;
      return;
    }
    var heading = new Date(state.selectedDate + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    els.slotsHeader.textContent = heading;

    var html = '';
    for (var i = 0; i < day.slots.length; i++) {
      var iso = day.slots[i];
      var label = new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
      html += '<button type="button" class="slot" data-iso="' + iso + '">' + label + '</button>';
    }
    els.slots.innerHTML = html;
    els.slotsArea.hidden = false;

    var btns = els.slots.querySelectorAll('.slot');
    for (var b = 0; b < btns.length; b++) {
      btns[b].addEventListener('click', onSlotClick);
    }
  }

  function onSlotClick(e) {
    var iso = e.currentTarget.getAttribute('data-iso');
    state.selectedSlot = iso;
    showForm();
  }

  function showForm() {
    var d = new Date(state.selectedSlot);
    var endMs = d.getTime() + state.meeting.durationMinutes * 60000;
    var endLabel = new Date(endMs).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    var startLabel = d.toLocaleString(undefined, { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    els.confirmWhen.textContent = startLabel + ' – ' + endLabel;
    els.stepTime.hidden = true;
    els.stepForm.hidden = false;
    els.formError.hidden = true;
    var firstInput = els.formFields.querySelector('input, textarea');
    if (firstInput) setTimeout(function () { firstInput.focus(); }, 50);
  }

  function collectResponses() {
    var responses = {};
    var fields = state.meeting.formFields || [];
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      if (f.type === 'radio') {
        var checked = els.formFields.querySelector('input[name="' + f.name + '"]:checked');
        responses[f.name] = checked ? checked.value : '';
      } else {
        var el = els.formFields.querySelector('[name="' + f.name + '"]');
        responses[f.name] = el ? el.value : '';
      }
    }
    return responses;
  }

  function onSubmit(e) {
    e.preventDefault();
    els.formError.hidden = true;

    var responses = collectResponses();
    var fields = state.meeting.formFields || [];
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      if (f.required && !String(responses[f.name] || '').trim()) {
        els.formError.textContent = f.label + ' is required.';
        els.formError.hidden = false;
        return;
      }
    }

    var hp = document.getElementById('hp_website');
    var payload = {
      meetingSlug: meetingSlug,
      startISO: state.selectedSlot,
      responses: responses,
      guestTimezone: guestTz,
      hp_website: hp ? hp.value : '',
    };
    els.submitBtn.disabled = true;
    els.submitBtn.textContent = 'Booking…';

    fetch('/api/book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function (r) {
        return r.json().then(function (body) { return { ok: r.ok, body: body }; });
      })
      .then(function (res) {
        if (!res.ok) throw new Error(res.body.error || 'Booking failed');
        var qs = new URLSearchParams({
          when: res.body.start || state.selectedSlot,
        });
        if (res.body.hangoutLink) qs.set('meet', res.body.hangoutLink);
        location.href = '/success.html?' + qs.toString();
      })
      .catch(function (err) {
        els.formError.textContent = err.message;
        els.formError.hidden = false;
        els.submitBtn.disabled = false;
        els.submitBtn.textContent = 'Confirm booking';
      });
  }

  init();
})();
