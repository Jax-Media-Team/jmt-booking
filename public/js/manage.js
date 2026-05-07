(function () {
  'use strict';

  var params = new URLSearchParams(location.search);
  var eid = params.get('eid');
  var token = params.get('t');

  var els = {
    loading: document.getElementById('manage-loading'),
    notFound: document.getElementById('manage-not-found'),
    cancelled: document.getElementById('manage-cancelled'),
    detail: document.getElementById('manage-detail'),
    name: document.getElementById('m-name'),
    when: document.getElementById('m-when'),
    meetRow: document.getElementById('m-meet-row'),
    meet: document.getElementById('m-meet'),
    booker: document.getElementById('m-booker'),
    rescheduleBtn: document.getElementById('reschedule-btn'),
    cancelBtn: document.getElementById('cancel-btn'),
    confirmCancel: document.getElementById('confirm-cancel'),
    confirmYes: document.getElementById('confirm-cancel-yes'),
    confirmNo: document.getElementById('confirm-cancel-no'),
    error: document.getElementById('manage-error'),
  };

  function showOnly(el) {
    els.loading.hidden = true;
    els.notFound.hidden = true;
    els.cancelled.hidden = true;
    els.detail.hidden = true;
    if (el) el.hidden = false;
  }

  function fmtRange(startISO, endISO) {
    try {
      var start = new Date(startISO);
      var end = new Date(endISO);
      var dateStr = start.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
      var timeStr = start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) +
        ' – ' + end.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
      return dateStr + ' · ' + timeStr;
    } catch (e) { return startISO; }
  }

  if (!eid || !token) {
    showOnly(els.notFound);
    return;
  }

  fetch('/api/manage?eid=' + encodeURIComponent(eid) + '&t=' + encodeURIComponent(token))
    .then(function (r) { return r.json().then(function (b) { return { ok: r.ok, status: r.status, body: b }; }); })
    .then(function (res) {
      if (res.status === 410) { showOnly(els.cancelled); return; }
      if (!res.ok) { showOnly(els.notFound); return; }
      var d = res.body;
      els.name.textContent = (d.meeting && d.meeting.name) || d.summary || 'Your meeting';
      els.when.textContent = fmtRange(d.startISO, d.endISO);
      els.booker.textContent = d.bookerName ? (d.bookerName + ' (' + d.bookerEmail + ')') : d.bookerEmail;
      if (d.hangoutLink) {
        els.meet.innerHTML = 'Google Meet: <a href="' + d.hangoutLink.replace(/"/g, '&quot;') + '">' + d.hangoutLink + '</a>';
        els.meetRow.hidden = false;
      }
      if (d.meeting && d.meeting.slug) {
        els.rescheduleBtn.addEventListener('click', function () {
          // Reschedule = cancel current + go back to the same meeting type's booking page,
          // pre-filled with the original responses, marked as a reschedule, with the
          // original start time so the new emails can show "Was: <old time>".
          var qs = new URLSearchParams();
          qs.set('rescheduled', '1');
          if (d.startISO) qs.set('origStart', d.startISO);
          // Always include the booker's name + email — these aren't in `responses` because
          // they're stored separately on the event.
          if (d.bookerName) qs.set('name', d.bookerName);
          if (d.bookerEmail) qs.set('email', d.bookerEmail);
          var responses = d.responses || {};
          for (var key in responses) {
            if (Object.prototype.hasOwnProperty.call(responses, key) && responses[key]) {
              qs.set(key, responses[key]);
            }
          }
          confirmCancel(true, '/' + d.meeting.slug + '?' + qs.toString());
        });
      } else {
        els.rescheduleBtn.style.display = 'none';
      }
      els.cancelBtn.addEventListener('click', function () {
        els.confirmCancel.hidden = false;
        els.error.hidden = true;
      });
      els.confirmNo.addEventListener('click', function () {
        els.confirmCancel.hidden = true;
      });
      els.confirmYes.addEventListener('click', function () { confirmCancel(false, null); });
      showOnly(els.detail);
    })
    .catch(function (e) {
      console.error(e);
      showOnly(els.notFound);
    });

  function confirmCancel(thenRedirect, redirectUrl) {
    els.confirmYes.disabled = true;
    els.cancelBtn.disabled = true;
    els.rescheduleBtn.disabled = true;
    els.error.hidden = true;

    fetch('/api/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // When this cancel is part of a reschedule, suppress Google's cancellation email
      // so the booker only gets the "Rescheduled" notification we send next.
      body: JSON.stringify({ eid: eid, t: token, silent: thenRedirect === true }),
    })
      .then(function (r) { return r.json().then(function (b) { return { ok: r.ok, body: b }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.body.error || 'Cancel failed');
        if (thenRedirect && redirectUrl) {
          location.href = redirectUrl;
        } else {
          showOnly(els.cancelled);
        }
      })
      .catch(function (e) {
        els.error.textContent = e.message;
        els.error.hidden = false;
        els.confirmYes.disabled = false;
        els.cancelBtn.disabled = false;
        els.rescheduleBtn.disabled = false;
      });
  }
})();
