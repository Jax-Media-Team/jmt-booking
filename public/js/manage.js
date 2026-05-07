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
          // Reschedule = cancel current + send to booking page for the same meeting type.
          confirmCancel(true, '/' + d.meeting.slug);
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
      body: JSON.stringify({ eid: eid, t: token }),
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
