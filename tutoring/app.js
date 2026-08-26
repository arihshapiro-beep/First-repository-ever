/* Tutor Desk — a tutoring practice in your pocket.
   Students, scheduling, hours, payments, and session notes.
   No server, no accounts: everything lives in this browser's local storage. */

(function () {
  'use strict';

  /* ============================================================
     Storage & state
     ============================================================ */

  var KEY = 'tutorDesk.v1';

  var DEFAULTS = {
    v: 1,
    settings: {
      businessName: 'Ari Shapiro Tutoring',
      defaultRate: 100,
      defaultMinutes: 60,
      theme: 'auto'
    },
    students: [],
    sessions: [],
    payments: []
  };

  var state = load();

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return clone(DEFAULTS);
      var data = JSON.parse(raw);
      return migrate(data);
    } catch (e) {
      console.warn('Could not read saved data, starting fresh.', e);
      return clone(DEFAULTS);
    }
  }

  function migrate(data) {
    var out = clone(DEFAULTS);
    if (!data || typeof data !== 'object') return out;
    out.settings = Object.assign(out.settings, data.settings || {});
    out.students = Array.isArray(data.students) ? data.students : [];
    out.sessions = Array.isArray(data.sessions) ? data.sessions : [];
    out.payments = Array.isArray(data.payments) ? data.payments : [];
    return out;
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      toast('Could not save — storage may be full');
    }
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /* ============================================================
     Small helpers
     ============================================================ */

  function $(sel) { return document.querySelector(sel); }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), v);
        else if (v === true) node.setAttribute(k, '');
        else node.setAttribute(k, v);
      });
    }
    (children || []).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  function money(n) {
    var v = Math.round((Number(n) || 0) * 100) / 100;
    var s = Math.abs(v).toFixed(2);
    if (s.slice(-3) === '.00') s = s.slice(0, -3);
    return (v < 0 ? '-$' : '$') + s;
  }

  function hoursText(mins) {
    var h = (Number(mins) || 0) / 60;
    return (Math.round(h * 10) / 10).toString();
  }

  /* Dates are stored as plain 'YYYY-MM-DD' strings and always parsed in
     local time — never `new Date('2026-01-05')`, which is UTC midnight and
     can land on the previous day west of Greenwich. */
  function parseDate(iso) {
    var p = String(iso || '').split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }

  function toISO(d) {
    var m = String(d.getMonth() + 1);
    var day = String(d.getDate());
    return d.getFullYear() + '-' + (m.length < 2 ? '0' + m : m) + '-' + (day.length < 2 ? '0' + day : day);
  }

  function todayISO() { return toISO(new Date()); }

  function addDays(iso, n) {
    var d = parseDate(iso);
    d.setDate(d.getDate() + n);
    return toISO(d);
  }

  function startOfWeek(iso) {
    var d = parseDate(iso);
    d.setDate(d.getDate() - d.getDay()); // Sunday
    return toISO(d);
  }

  function monthKey(iso) { return String(iso).slice(0, 7); }

  function fmtDay(iso) {
    var d = parseDate(iso);
    var t = todayISO();
    if (iso === t) return 'Today';
    if (iso === addDays(t, 1)) return 'Tomorrow';
    if (iso === addDays(t, -1)) return 'Yesterday';
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function fmtDateFull(iso) {
    return parseDate(iso).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  }

  function fmtTime(hhmm) {
    if (!hhmm) return '';
    var p = String(hhmm).split(':');
    var h = Number(p[0]);
    var m = p[1] || '00';
    var ampm = h >= 12 ? 'PM' : 'AM';
    var h12 = h % 12;
    if (h12 === 0) h12 = 12;
    return h12 + ':' + m + ' ' + ampm;
  }

  function endTime(hhmm, minutes) {
    if (!hhmm) return '';
    var p = String(hhmm).split(':');
    var total = Number(p[0]) * 60 + Number(p[1] || 0) + (Number(minutes) || 0);
    total = ((total % 1440) + 1440) % 1440;
    var h = Math.floor(total / 60);
    var m = String(total % 60);
    return fmtTime(h + ':' + (m.length < 2 ? '0' + m : m));
  }

  function initials(name) {
    var parts = String(name || '?').trim().split(/\s+/);
    var s = (parts[0] || '?').charAt(0);
    if (parts.length > 1) s += parts[parts.length - 1].charAt(0);
    return s.toUpperCase();
  }

  var toastTimer = null;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }

  /* ============================================================
     Derived data — the money math lives here
     ============================================================ */

  function studentById(id) {
    for (var i = 0; i < state.students.length; i++) {
      if (state.students[i].id === id) return state.students[i];
    }
    return null;
  }

  function studentName(id) {
    var s = studentById(id);
    return s ? s.name : 'Removed student';
  }

  function sessionById(id) {
    for (var i = 0; i < state.sessions.length; i++) {
      if (state.sessions[i].id === id) return state.sessions[i];
    }
    return null;
  }

  /* The rate a session bills at: its own override, else the student's rate,
     else the practice-wide default. */
  function sessionRate(sess) {
    if (sess.rate !== null && sess.rate !== undefined && sess.rate !== '') return Number(sess.rate);
    var st = studentById(sess.studentId);
    if (st && st.rate !== null && st.rate !== undefined && st.rate !== '') return Number(st.rate);
    return Number(state.settings.defaultRate) || 0;
  }

  /* A session is billable when it happened (completed) or when it was a
     late cancel / no-show the tutor chose to charge for. */
  function isBillable(sess) {
    if (sess.status === 'completed') return sess.billable !== false;
    if (sess.status === 'noshow' || sess.status === 'canceled') return sess.billable === true;
    return false;
  }

  function sessionAmount(sess) {
    if (!isBillable(sess)) return 0;
    return sessionRate(sess) * ((Number(sess.minutes) || 0) / 60);
  }

  function sortedSessions(dir) {
    var list = state.sessions.slice();
    list.sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      var at = a.start || '', bt = b.start || '';
      return at < bt ? -1 : at > bt ? 1 : 0;
    });
    return dir === 'desc' ? list.reverse() : list;
  }

  function sessionsInRange(fromISO, toISOStr) {
    return state.sessions.filter(function (s) {
      if (fromISO && s.date < fromISO) return false;
      if (toISOStr && s.date > toISOStr) return false;
      return true;
    });
  }

  function totals(sessions, payments) {
    var t = { minutes: 0, billed: 0, paid: 0, count: 0 };
    sessions.forEach(function (s) {
      if (s.status === 'completed') { t.minutes += Number(s.minutes) || 0; t.count++; }
      t.billed += sessionAmount(s);
    });
    (payments || []).forEach(function (p) { t.paid += Number(p.amount) || 0; });
    return t;
  }

  /* Lifetime balance for one student: everything billed minus everything paid. */
  function studentBalance(studentId) {
    var billed = 0, paid = 0, minutes = 0, count = 0, lastISO = null;
    state.sessions.forEach(function (s) {
      if (s.studentId !== studentId) return;
      billed += sessionAmount(s);
      if (s.status === 'completed') {
        minutes += Number(s.minutes) || 0;
        count++;
        if (!lastISO || s.date > lastISO) lastISO = s.date;
      }
    });
    state.payments.forEach(function (p) {
      if (p.studentId === studentId) paid += Number(p.amount) || 0;
    });
    return { billed: billed, paid: paid, due: billed - paid, minutes: minutes, count: count, last: lastISO };
  }

  function totalOutstanding() {
    var sum = 0;
    state.students.forEach(function (st) {
      var b = studentBalance(st.id);
      if (b.due > 0.005) sum += b.due;
    });
    return sum;
  }

  /* ============================================================
     Shared row builders
     ============================================================ */

  function emptyState(title, note) {
    return el('div', { class: 'empty' }, [el('b', { text: title }), note || '']);
  }

  function statusPill(sess) {
    if (sess.status === 'completed') return el('span', { class: 'pill ok', text: 'Done' });
    if (sess.status === 'canceled') {
      return el('span', { class: 'pill quiet', text: sess.billable ? 'Canceled · charged' : 'Canceled' });
    }
    if (sess.status === 'noshow') {
      return el('span', { class: 'pill danger', text: sess.billable ? 'No-show · charged' : 'No-show' });
    }
    if (sess.date < todayISO()) return el('span', { class: 'pill warn', text: 'Needs logging' });
    return el('span', { class: 'pill', text: 'Scheduled' });
  }

  function sessionRow(sess, opts) {
    opts = opts || {};
    var st = studentById(sess.studentId);
    var titleBits = [el('span', { text: st ? st.name : 'Removed student' })];
    titleBits.push(statusPill(sess));

    var metaParts = [];
    if (opts.showDate) metaParts.push(fmtDay(sess.date));
    if (sess.start) metaParts.push(fmtTime(sess.start) + ' – ' + endTime(sess.start, sess.minutes));
    else metaParts.push(hoursText(sess.minutes) + ' hr');
    if (sess.location) metaParts.push(sess.location);
    if (sess.topic) metaParts.push(sess.topic);

    var amount = sessionAmount(sess);
    var side = [el('div', { class: 'amt', text: amount > 0 ? money(amount) : '—' })];
    side.push(el('div', { class: 'faint', text: hoursText(sess.minutes) + ' hr' }));

    return el('button', {
      class: 'item' + (sess.status === 'canceled' ? ' dim' : ''),
      type: 'button',
      onclick: function () { openSessionDetail(sess.id); }
    }, [
      el('div', { class: 'avatar', text: initials(st ? st.name : '?') }),
      el('div', { class: 'body' }, [
        el('div', { class: 'title' }, titleBits),
        el('div', { class: 'meta', text: metaParts.join(' · ') })
      ]),
      el('div', { class: 'side' }, side)
    ]);
  }

  function groupByDay(sessions) {
    var groups = [];
    var index = {};
    sessions.forEach(function (s) {
      if (!index[s.date]) {
        index[s.date] = { date: s.date, items: [] };
        groups.push(index[s.date]);
      }
      index[s.date].items.push(s);
    });
    return groups;
  }

  function dayGroupNode(group) {
    var mins = 0;
    group.items.forEach(function (s) { if (s.status !== 'canceled') mins += Number(s.minutes) || 0; });
    return el('div', { class: 'daygroup' }, [
      el('div', { class: 'dayhead' }, [
        el('span', { text: fmtDay(group.date) }),
        el('span', { class: 'h', text: hoursText(mins) + ' hr · ' + group.items.length + (group.items.length === 1 ? ' session' : ' sessions') })
      ]),
      el('div', { class: 'list' }, group.items.map(function (s) { return sessionRow(s, {}); }))
    ]);
  }

  /* ============================================================
     View: Today
     ============================================================ */

  function renderToday() {
    var t = todayISO();
    var weekStart = startOfWeek(t);
    var weekEnd = addDays(weekStart, 6);

    var weekSessions = sessionsInRange(weekStart, weekEnd).filter(function (s) { return s.status !== 'canceled'; });
    $('#statWeekSessions').textContent = String(weekSessions.length);

    var mk = monthKey(t);
    var monthMins = 0;
    state.sessions.forEach(function (s) {
      if (monthKey(s.date) === mk && s.status === 'completed') monthMins += Number(s.minutes) || 0;
    });
    $('#statMonthHours').textContent = hoursText(monthMins);

    var owed = totalOutstanding();
    $('#statOwed').textContent = money(owed);
    $('#statOwedWrap').className = 'stat' + (owed > 0.005 ? ' alert' : '');

    $('#todayDate').textContent = fmtDateFull(t);

    /* Today */
    var todayList = $('#todayList');
    todayList.innerHTML = '';
    var todays = sortedSessions().filter(function (s) { return s.date === t; });
    if (!todays.length) {
      todayList.appendChild(emptyState('Nothing scheduled today',
        state.students.length ? 'Tap + to add a session.' : 'Add your first student to get started.'));
    } else {
      todays.forEach(function (s) { todayList.appendChild(sessionRow(s, {})); });
    }

    /* Next 7 days */
    var upcoming = $('#upcomingList');
    upcoming.innerHTML = '';
    var soon = sortedSessions().filter(function (s) {
      return s.date > t && s.date <= addDays(t, 7) && s.status === 'scheduled';
    });
    if (!soon.length) {
      upcoming.appendChild(emptyState('No sessions in the next week', 'Your calendar is clear.'));
    } else {
      groupByDay(soon).forEach(function (g) { upcoming.appendChild(dayGroupNode(g)); });
    }

    /* Needs attention: past sessions never logged, plus unpaid balances */
    var attention = $('#attentionList');
    attention.innerHTML = '';
    var rows = [];

    var unlogged = sortedSessions('desc').filter(function (s) {
      return s.status === 'scheduled' && s.date < t;
    });
    unlogged.slice(0, 6).forEach(function (s) { rows.push(sessionRow(s, { showDate: true })); });

    state.students.forEach(function (st) {
      var b = studentBalance(st.id);
      if (b.due <= 0.005) return;
      rows.push(el('button', {
        class: 'item', type: 'button',
        onclick: function () { openStudentDetail(st.id); }
      }, [
        el('div', { class: 'avatar', text: initials(st.name) }),
        el('div', { class: 'body' }, [
          el('div', { class: 'title' }, [
            el('span', { text: st.name }),
            el('span', { class: 'pill warn', text: 'Owes' })
          ]),
          el('div', { class: 'meta', text: b.count + ' session' + (b.count === 1 ? '' : 's') + ' billed · ' + money(b.paid) + ' collected' })
        ]),
        el('div', { class: 'side' }, [el('div', { class: 'amt', text: money(b.due) })])
      ]));
    });

    if (!rows.length) {
      attention.appendChild(emptyState('All caught up', 'Every session is logged and every balance is settled.'));
    } else {
      rows.forEach(function (r) { attention.appendChild(r); });
    }
  }

  /* ============================================================
     View: Schedule
     ============================================================ */

  var scheduleRange = 'upcoming';

  function renderSchedule() {
    var wrap = $('#scheduleList');
    wrap.innerHTML = '';
    var t = todayISO();
    var list;

    if (scheduleRange === 'upcoming') {
      list = sortedSessions().filter(function (s) { return s.date >= t; });
    } else if (scheduleRange === 'week') {
      var ws = startOfWeek(t);
      list = sortedSessions().filter(function (s) { return s.date >= ws && s.date <= addDays(ws, 6); });
    } else if (scheduleRange === 'past') {
      list = sortedSessions('desc').filter(function (s) { return s.date < t; });
    } else {
      list = sortedSessions('desc');
    }

    if (!list.length) {
      wrap.appendChild(emptyState('No sessions here',
        state.students.length ? 'Tap + to schedule one.' : 'Add a student first, then schedule a session.'));
      return;
    }
    groupByDay(list).forEach(function (g) { wrap.appendChild(dayGroupNode(g)); });
  }

  /* ============================================================
     View: Students
     ============================================================ */

  var studentFilter = 'active';

  function renderStudents() {
    var wrap = $('#studentList');
    wrap.innerHTML = '';

    var list = state.students.filter(function (s) {
      if (studentFilter === 'active') return s.active !== false;
      if (studentFilter === 'inactive') return s.active === false;
      return true;
    });
    list.sort(function (a, b) { return a.name.localeCompare(b.name); });

    if (!list.length) {
      wrap.appendChild(emptyState(
        studentFilter === 'active' ? 'No active students yet' : 'Nobody here',
        'Tap + to add a student — name and rate is enough to start.'));
      return;
    }

    list.forEach(function (st) {
      var b = studentBalance(st.id);
      var next = null;
      var t = todayISO();
      sortedSessions().forEach(function (s) {
        if (next || s.studentId !== st.id) return;
        if (s.date >= t && s.status === 'scheduled') next = s;
      });

      var meta = [];
      if (st.focus) meta.push(st.focus);
      if (st.grade) meta.push(st.grade);
      meta.push(money(sessionRate({ studentId: st.id, rate: st.rate })) + '/hr');
      if (next) meta.push('Next: ' + fmtDay(next.date) + (next.start ? ' ' + fmtTime(next.start) : ''));
      else if (b.last) meta.push('Last: ' + fmtDay(b.last));

      var side = [];
      if (b.due > 0.005) side.push(el('div', { class: 'amt', text: money(b.due) }));
      side.push(el('div', { class: 'faint', text: hoursText(b.minutes) + ' hr total' }));

      wrap.appendChild(el('button', {
        class: 'item' + (st.active === false ? ' dim' : ''),
        type: 'button',
        onclick: function () { openStudentDetail(st.id); }
      }, [
        el('div', { class: 'avatar', text: initials(st.name) }),
        el('div', { class: 'body' }, [
          el('div', { class: 'title' }, [
            el('span', { text: st.name }),
            b.due > 0.005 ? el('span', { class: 'pill warn', text: 'Owes' }) : null,
            st.active === false ? el('span', { class: 'pill quiet', text: 'Inactive' }) : null
          ]),
          el('div', { class: 'meta', text: meta.join(' · ') })
        ]),
        el('div', { class: 'side' }, side)
      ]));
    });
  }

  /* ============================================================
     View: Hours & pay
     ============================================================ */

  var moneyPeriod = 'month';

  function periodBounds(period) {
    var now = new Date();
    var y = now.getFullYear(), m = now.getMonth();
    if (period === 'month') return { from: toISO(new Date(y, m, 1)), to: toISO(new Date(y, m + 1, 0)) };
    if (period === 'lastmonth') return { from: toISO(new Date(y, m - 1, 1)), to: toISO(new Date(y, m, 0)) };
    if (period === 'year') return { from: toISO(new Date(y, 0, 1)), to: toISO(new Date(y, 11, 31)) };
    return { from: null, to: null };
  }

  function renderMoney() {
    var b = periodBounds(moneyPeriod);
    var sessions = sessionsInRange(b.from, b.to);
    var payments = state.payments.filter(function (p) {
      if (b.from && p.date < b.from) return false;
      if (b.to && p.date > b.to) return false;
      return true;
    });
    var t = totals(sessions, payments);

    $('#mHours').textContent = hoursText(t.minutes);
    $('#mBilled').textContent = money(t.billed);
    $('#mPaid').textContent = money(t.paid);

    /* Balances (lifetime, not period-scoped — what someone owes doesn't reset monthly) */
    var balWrap = $('#balanceList');
    balWrap.innerHTML = '';
    var withBalance = state.students.map(function (st) {
      return { st: st, bal: studentBalance(st.id) };
    }).filter(function (r) { return Math.abs(r.bal.due) > 0.005 || r.bal.billed > 0.005; });

    withBalance.sort(function (a, b2) { return b2.bal.due - a.bal.due; });

    if (!withBalance.length) {
      balWrap.appendChild(emptyState('Nothing billed yet', 'Mark a session complete and it shows up here.'));
    } else {
      withBalance.forEach(function (r) {
        var due = r.bal.due;
        var pill = due > 0.005
          ? el('span', { class: 'pill warn', text: 'Owes ' + money(due) })
          : (due < -0.005
            ? el('span', { class: 'pill', text: 'Credit ' + money(-due) })
            : el('span', { class: 'pill ok', text: 'Settled' }));
        balWrap.appendChild(el('button', {
          class: 'item', type: 'button',
          onclick: function () { openStudentDetail(r.st.id); }
        }, [
          el('div', { class: 'avatar', text: initials(r.st.name) }),
          el('div', { class: 'body' }, [
            el('div', { class: 'title' }, [el('span', { text: r.st.name }), pill]),
            el('div', { class: 'meta', text: money(r.bal.billed) + ' billed · ' + money(r.bal.paid) + ' paid · ' + hoursText(r.bal.minutes) + ' hr' })
          ])
        ]));
      });
    }

    /* Payments in the selected period */
    var payWrap = $('#paymentList');
    payWrap.innerHTML = '';
    $('#paymentCount').textContent = payments.length ? payments.length + ' in period' : '';
    if (!payments.length) {
      payWrap.appendChild(emptyState('No payments recorded', 'Log one when money comes in.'));
    } else {
      payments.slice().sort(function (a, b2) { return a.date < b2.date ? 1 : -1; }).forEach(function (p) {
        payWrap.appendChild(el('button', {
          class: 'item', type: 'button',
          onclick: function () { openPaymentForm(p); }
        }, [
          el('div', { class: 'avatar', text: initials(studentName(p.studentId)) }),
          el('div', { class: 'body' }, [
            el('div', { class: 'title' }, [el('span', { text: studentName(p.studentId) })]),
            el('div', { class: 'meta', text: [fmtDay(p.date), p.method, p.note].filter(Boolean).join(' · ') })
          ]),
          el('div', { class: 'side' }, [el('div', { class: 'amt', text: money(p.amount) })])
        ]));
      });
    }
  }

  /* ============================================================
     Modal plumbing
     ============================================================ */

  function openModal(title, bodyNodes, footNodes) {
    var modal = $('#modal');
    modal.innerHTML = '';
    modal.appendChild(el('div', { class: 'modal-head' }, [
      el('h3', { text: title }),
      el('button', { class: 'ghost small', type: 'button', text: 'Close', onclick: closeModal })
    ]));
    bodyNodes.forEach(function (n) { if (n) modal.appendChild(n); });
    if (footNodes && footNodes.length) {
      modal.appendChild(el('div', { class: 'btn-row', style: 'margin-top:16px' }, footNodes));
    }
    $('#modalBack').hidden = false;
    modal.scrollTop = 0;
  }

  function closeModal() {
    $('#modalBack').hidden = true;
    $('#modal').innerHTML = '';
  }

  function field(labelText, inputNode, hint) {
    return el('div', { class: 'field' }, [
      el('label', { text: labelText }),
      inputNode,
      hint ? el('div', { class: 'faint', style: 'margin-top:4px', text: hint }) : null
    ]);
  }

  function input(attrs) { return el('input', attrs); }

  function selectNode(options, value, attrs) {
    var sel = el('select', attrs || {});
    options.forEach(function (o) {
      var opt = el('option', { value: o.value, text: o.label });
      if (o.value === value) opt.selected = true;
      sel.appendChild(opt);
    });
    return sel;
  }

  function studentOptions() {
    return state.students
      .filter(function (s) { return s.active !== false; })
      .sort(function (a, b) { return a.name.localeCompare(b.name); })
      .map(function (s) { return { value: s.id, label: s.name }; });
  }

  /* ============================================================
     Student form & detail
     ============================================================ */

  function openStudentForm(existing) {
    var s = existing || {};
    var fName = input({ type: 'text', value: s.name || '', placeholder: 'Full name', autocomplete: 'off' });
    var fGrade = input({ type: 'text', value: s.grade || '', placeholder: 'e.g. 8th grade' });
    var fFocus = input({ type: 'text', value: s.focus || '', placeholder: 'e.g. SHSAT, Algebra II' });
    var fRate = input({ type: 'number', inputmode: 'decimal', step: '1', min: '0',
      value: (s.rate === null || s.rate === undefined || s.rate === '') ? '' : s.rate,
      placeholder: String(state.settings.defaultRate) });
    var fParent = input({ type: 'text', value: s.parentName || '', placeholder: 'Parent / guardian' });
    var fContact = input({ type: 'text', value: s.contact || '', placeholder: 'Phone or email' });
    var fLocation = input({ type: 'text', value: s.location || '', placeholder: 'e.g. Zoom, Library, Home' });
    var fNotes = el('textarea', { placeholder: 'Goals, learning style, test dates, anything worth remembering' });
    fNotes.value = s.notes || '';
    var fActive = input({ type: 'checkbox' });
    fActive.checked = s.active !== false;

    openModal(existing ? 'Edit student' : 'New student', [
      field('Name', fName),
      el('div', { class: 'row' }, [field('Grade', fGrade), field('Focus', fFocus)]),
      field('Hourly rate', fRate, 'Leave blank to use the default (' + money(state.settings.defaultRate) + '/hr).'),
      el('div', { class: 'row' }, [field('Parent / guardian', fParent), field('Contact', fContact)]),
      field('Usual location', fLocation),
      field('Notes', fNotes),
      el('label', { class: 'check', style: 'margin-top:6px' }, [fActive, el('span', { text: 'Currently active' })])
    ], [
      existing ? el('button', {
        class: 'danger', type: 'button', text: 'Delete',
        onclick: function () { deleteStudent(existing.id); }
      }) : null,
      el('button', {
        type: 'button', text: existing ? 'Save changes' : 'Add student',
        onclick: function () {
          var name = fName.value.trim();
          if (!name) { toast('A name is required'); fName.focus(); return; }
          var rec = existing || { id: uid(), createdAt: todayISO() };
          rec.name = name;
          rec.grade = fGrade.value.trim();
          rec.focus = fFocus.value.trim();
          rec.rate = fRate.value === '' ? null : Number(fRate.value);
          rec.parentName = fParent.value.trim();
          rec.contact = fContact.value.trim();
          rec.location = fLocation.value.trim();
          rec.notes = fNotes.value;
          rec.active = fActive.checked;
          if (!existing) state.students.push(rec);
          save(); closeModal(); renderAll();
          toast(existing ? 'Student updated' : 'Student added');
        }
      })
    ]);
    fName.focus();
  }

  function deleteStudent(id) {
    var st = studentById(id);
    if (!st) return;
    var n = state.sessions.filter(function (s) { return s.studentId === id; }).length;
    var msg = 'Delete ' + st.name + '?';
    if (n) msg += '\n\nThis also deletes ' + n + ' session' + (n === 1 ? '' : 's') + ' and any recorded payments. This cannot be undone.';
    if (!confirm(msg)) return;
    state.students = state.students.filter(function (s) { return s.id !== id; });
    state.sessions = state.sessions.filter(function (s) { return s.studentId !== id; });
    state.payments = state.payments.filter(function (p) { return p.studentId !== id; });
    save(); closeModal(); renderAll();
    toast('Student deleted');
  }

  function openStudentDetail(id) {
    var st = studentById(id);
    if (!st) return;
    var b = studentBalance(id);

    var contactBits = [];
    if (st.parentName) contactBits.push(st.parentName);
    if (st.contact) contactBits.push(st.contact);

    var history = sortedSessions('desc').filter(function (s) { return s.studentId === id; });
    var pays = state.payments.filter(function (p) { return p.studentId === id; })
      .sort(function (a, b2) { return a.date < b2.date ? 1 : -1; });

    var body = [];

    body.push(el('div', { class: 'card' }, [
      el('div', { class: 'kv' }, [el('span', { class: 'k', text: 'Rate' }), el('span', { class: 'v', text: money(sessionRate({ studentId: id, rate: st.rate })) + '/hr' })]),
      el('div', { class: 'kv' }, [el('span', { class: 'k', text: 'Sessions taught' }), el('span', { class: 'v', text: String(b.count) })]),
      el('div', { class: 'kv' }, [el('span', { class: 'k', text: 'Hours' }), el('span', { class: 'v', text: hoursText(b.minutes) })]),
      el('div', { class: 'kv' }, [el('span', { class: 'k', text: 'Billed' }), el('span', { class: 'v', text: money(b.billed) })]),
      el('div', { class: 'kv' }, [el('span', { class: 'k', text: 'Paid' }), el('span', { class: 'v', text: money(b.paid) })]),
      el('div', { class: 'kv total' }, [
        el('span', { class: 'k', text: b.due >= 0 ? 'Balance due' : 'Credit on account' }),
        el('span', { class: 'v', style: b.due > 0.005 ? 'color:var(--danger)' : '', text: money(Math.abs(b.due)) })
      ])
    ]));

    var quick = el('div', { class: 'btn-row', style: 'margin-bottom:14px' }, [
      el('button', { class: 'ghost small', type: 'button', text: 'Schedule', onclick: function () { openSessionForm(null, id); } }),
      el('button', { class: 'ghost small', type: 'button', text: 'Payment', onclick: function () { openPaymentForm(null, id); } }),
      el('button', { class: 'ghost small', type: 'button', text: 'Invoice', onclick: function () { copyInvoice(id); } }),
      el('button', { class: 'ghost small', type: 'button', text: 'Edit', onclick: function () { openStudentForm(st); } })
    ]);
    body.push(quick);

    if (contactBits.length || st.focus || st.grade || st.location) {
      var lines = [];
      if (st.grade || st.focus) lines.push([st.grade, st.focus].filter(Boolean).join(' · '));
      if (contactBits.length) lines.push(contactBits.join(' · '));
      if (st.location) lines.push(st.location);
      body.push(el('div', { class: 'detail-block' }, [
        el('h4', { text: 'Details' }),
        el('div', { class: 'note-body', text: lines.join('\n') })
      ]));
    }

    if (st.notes) {
      body.push(el('div', { class: 'detail-block' }, [
        el('h4', { text: 'Notes' }),
        el('div', { class: 'note-body', text: st.notes })
      ]));
    }

    if (pays.length) {
      body.push(el('div', { class: 'detail-block' }, [
        el('h4', { text: 'Payments' }),
        el('div', { class: 'list' }, pays.map(function (p) {
          return el('button', { class: 'item', type: 'button', onclick: function () { openPaymentForm(p); } }, [
            el('div', { class: 'body' }, [
              el('div', { class: 'title' }, [el('span', { text: fmtDay(p.date) })]),
              el('div', { class: 'meta', text: [p.method, p.note].filter(Boolean).join(' · ') })
            ]),
            el('div', { class: 'side' }, [el('div', { class: 'amt', text: money(p.amount) })])
          ]);
        }))
      ]));
    }

    body.push(el('div', { class: 'detail-block' }, [
      el('h4', { text: 'Session history' }),
      history.length
        ? el('div', { class: 'list' }, history.slice(0, 40).map(function (s) { return sessionRow(s, { showDate: true }); }))
        : emptyState('No sessions yet', 'Tap Schedule above to add one.')
    ]));

    openModal(st.name, body);
  }

  /* ============================================================
     Session form & detail
     ============================================================ */

  var LOCATIONS = ['Zoom', 'In person', 'Library', 'Phone'];

  function openSessionForm(existing, presetStudentId) {
    if (!state.students.length) {
      toast('Add a student first');
      openStudentForm(null);
      return;
    }
    var s = existing || {};
    var fStudent = selectNode(studentOptions(), s.studentId || presetStudentId || studentOptions()[0].value);
    var fDate = input({ type: 'date', value: s.date || todayISO() });
    var fStart = input({ type: 'time', value: s.start || '16:00' });
    var fMinutes = selectNode([
      { value: '30', label: '30 min' }, { value: '45', label: '45 min' },
      { value: '60', label: '1 hour' }, { value: '75', label: '1 hr 15' },
      { value: '90', label: '1.5 hours' }, { value: '120', label: '2 hours' },
      { value: '150', label: '2.5 hours' }, { value: '180', label: '3 hours' }
    ], String(s.minutes || state.settings.defaultMinutes || 60));
    var fLocation = input({ type: 'text', value: s.location || '', placeholder: 'Zoom, Library, …', list: 'locOptions' });
    var locList = el('datalist', { id: 'locOptions' }, LOCATIONS.map(function (l) { return el('option', { value: l }); }));
    var fTopic = input({ type: 'text', value: s.topic || '', placeholder: 'What you plan to cover' });
    var fRate = input({ type: 'number', inputmode: 'decimal', step: '1', min: '0',
      value: (s.rate === null || s.rate === undefined || s.rate === '') ? '' : s.rate,
      placeholder: 'student rate' });

    var repeatWrap = null, fRepeat = null;
    if (!existing) {
      fRepeat = selectNode([
        { value: '0', label: "Doesn't repeat" },
        { value: '4', label: 'Weekly × 4' },
        { value: '8', label: 'Weekly × 8' },
        { value: '12', label: 'Weekly × 12' },
        { value: '24', label: 'Weekly × 24' }
      ], '0');
      repeatWrap = field('Repeat', fRepeat, 'Creates the same slot every week, starting on the date above.');
    }

    openModal(existing ? 'Edit session' : 'New session', [
      field('Student', fStudent),
      el('div', { class: 'row' }, [field('Date', fDate), field('Start', fStart)]),
      el('div', { class: 'row' }, [field('Length', fMinutes), field('Rate override', fRate)]),
      field('Location', fLocation), locList,
      field('Topic', fTopic),
      repeatWrap
    ], [
      existing ? el('button', {
        class: 'danger', type: 'button', text: 'Delete',
        onclick: function () {
          if (!confirm('Delete this session?')) return;
          state.sessions = state.sessions.filter(function (x) { return x.id !== existing.id; });
          save(); closeModal(); renderAll(); toast('Session deleted');
        }
      }) : null,
      el('button', {
        type: 'button', text: existing ? 'Save changes' : 'Add session',
        onclick: function () {
          if (!fDate.value) { toast('Pick a date'); return; }
          var base = {
            studentId: fStudent.value,
            date: fDate.value,
            start: fStart.value,
            minutes: Number(fMinutes.value),
            location: fLocation.value.trim(),
            topic: fTopic.value.trim(),
            rate: fRate.value === '' ? null : Number(fRate.value)
          };
          if (existing) {
            Object.assign(existing, base);
            save(); closeModal(); renderAll(); toast('Session updated');
            return;
          }
          var repeats = fRepeat ? Number(fRepeat.value) : 0;
          var count = repeats > 0 ? repeats : 1;
          for (var i = 0; i < count; i++) {
            var rec = Object.assign({
              id: uid(), status: 'scheduled', billable: true, note: '', homework: '', createdAt: todayISO()
            }, base);
            rec.date = addDays(base.date, i * 7);
            state.sessions.push(rec);
          }
          save(); closeModal(); renderAll();
          toast(count > 1 ? count + ' sessions scheduled' : 'Session scheduled');
        }
      })
    ]);
  }

  function setStatus(sess, status, billable) {
    sess.status = status;
    if (billable !== undefined) sess.billable = billable;
    save(); renderAll();
  }

  function openSessionDetail(id) {
    var sess = sessionById(id);
    if (!sess) return;
    var st = studentById(sess.studentId);
    var amount = sessionAmount(sess);

    var body = [];

    body.push(el('div', { class: 'card' }, [
      el('div', { class: 'kv' }, [el('span', { class: 'k', text: 'Student' }), el('span', { class: 'v', text: st ? st.name : 'Removed student' })]),
      el('div', { class: 'kv' }, [el('span', { class: 'k', text: 'When' }), el('span', { class: 'v', text: fmtDateFull(sess.date) + (sess.start ? ', ' + fmtTime(sess.start) : '') })]),
      el('div', { class: 'kv' }, [el('span', { class: 'k', text: 'Length' }), el('span', { class: 'v', text: hoursText(sess.minutes) + ' hr' })]),
      sess.location ? el('div', { class: 'kv' }, [el('span', { class: 'k', text: 'Location' }), el('span', { class: 'v', text: sess.location })]) : null,
      sess.topic ? el('div', { class: 'kv' }, [el('span', { class: 'k', text: 'Topic' }), el('span', { class: 'v', text: sess.topic })]) : null,
      el('div', { class: 'kv total' }, [
        el('span', { class: 'k', text: isBillable(sess) ? 'Billed at ' + money(sessionRate(sess)) + '/hr' : 'Not billed' }),
        el('span', { class: 'v', text: money(amount) })
      ])
    ]));

    /* Status controls */
    var statusRow = el('div', { class: 'btn-row', style: 'margin-bottom:8px' }, [
      el('button', {
        class: sess.status === 'completed' ? '' : 'ghost', type: 'button', text: 'Completed',
        onclick: function () { setStatus(sess, 'completed', true); openSessionDetail(id); toast('Marked complete'); }
      }),
      el('button', {
        class: sess.status === 'scheduled' ? '' : 'ghost', type: 'button', text: 'Scheduled',
        onclick: function () { setStatus(sess, 'scheduled'); openSessionDetail(id); }
      })
    ]);
    var statusRow2 = el('div', { class: 'btn-row', style: 'margin-bottom:14px' }, [
      el('button', {
        class: sess.status === 'canceled' ? '' : 'ghost', type: 'button', text: 'Canceled',
        onclick: function () { setStatus(sess, 'canceled', false); openSessionDetail(id); }
      }),
      el('button', {
        class: sess.status === 'noshow' ? '' : 'ghost', type: 'button', text: 'No-show',
        onclick: function () { setStatus(sess, 'noshow', true); openSessionDetail(id); }
      })
    ]);
    body.push(statusRow, statusRow2);

    if (sess.status === 'canceled' || sess.status === 'noshow') {
      var chargeBox = input({ type: 'checkbox' });
      chargeBox.checked = sess.billable === true;
      chargeBox.addEventListener('change', function () {
        sess.billable = chargeBox.checked;
        save(); renderAll(); openSessionDetail(id);
      });
      body.push(el('label', { class: 'check', style: 'margin-bottom:14px' }, [
        chargeBox, el('span', { text: 'Charge for this session anyway' })
      ]));
    }

    /* Session notes */
    var fNote = el('textarea', { placeholder: 'What you covered, how it went, what to hit next time' });
    fNote.value = sess.note || '';
    var fHw = input({ type: 'text', value: sess.homework || '', placeholder: 'Homework assigned' });

    body.push(el('div', { class: 'detail-block' }, [
      el('h4', { text: 'Session notes' }),
      field('Covered', fNote),
      field('Homework', fHw),
      el('button', {
        class: 'ghost', type: 'button', text: 'Save notes',
        onclick: function () {
          sess.note = fNote.value;
          sess.homework = fHw.value.trim();
          save(); renderAll(); toast('Notes saved');
        }
      })
    ]));

    openModal('Session', body, [
      el('button', { class: 'ghost', type: 'button', text: 'Edit details', onclick: function () { openSessionForm(sess); } }),
      st ? el('button', { class: 'ghost', type: 'button', text: 'Open student', onclick: function () { openStudentDetail(st.id); } }) : null
    ]);
  }

  /* ============================================================
     Payments
     ============================================================ */

  var METHODS = ['Zelle', 'Venmo', 'Cash', 'Check', 'Card', 'Bank transfer'];

  function openPaymentForm(existing, presetStudentId) {
    if (!state.students.length) { toast('Add a student first'); return; }
    var p = existing || {};
    var fStudent = selectNode(
      state.students.slice().sort(function (a, b) { return a.name.localeCompare(b.name); })
        .map(function (s) { return { value: s.id, label: s.name }; }),
      p.studentId || presetStudentId || state.students[0].id
    );
    var fAmount = input({ type: 'number', inputmode: 'decimal', step: '0.01', min: '0', value: p.amount || '', placeholder: '0.00' });
    var fDate = input({ type: 'date', value: p.date || todayISO() });
    var fMethod = input({ type: 'text', value: p.method || '', placeholder: 'Zelle, Venmo, Cash…', list: 'methodOptions' });
    var mList = el('datalist', { id: 'methodOptions' }, METHODS.map(function (m) { return el('option', { value: m }); }));
    var fNote = input({ type: 'text', value: p.note || '', placeholder: 'e.g. covers October' });

    /* Handy: prefill the exact balance due for the chosen student. */
    var dueBtn = el('button', {
      class: 'link', type: 'button', text: '',
      onclick: function () {
        var b = studentBalance(fStudent.value);
        if (b.due > 0.005) { fAmount.value = (Math.round(b.due * 100) / 100).toString(); }
      }
    });
    function refreshDue() {
      var b = studentBalance(fStudent.value);
      dueBtn.textContent = b.due > 0.005 ? 'Balance due ' + money(b.due) + ' — use this amount' : 'No balance due';
      dueBtn.disabled = !(b.due > 0.005);
    }
    fStudent.addEventListener('change', refreshDue);
    refreshDue();

    openModal(existing ? 'Edit payment' : 'Record a payment', [
      field('Student', fStudent),
      dueBtn,
      el('div', { class: 'row' }, [field('Amount', fAmount), field('Date', fDate)]),
      field('Method', fMethod), mList,
      field('Note', fNote)
    ], [
      existing ? el('button', {
        class: 'danger', type: 'button', text: 'Delete',
        onclick: function () {
          if (!confirm('Delete this payment?')) return;
          state.payments = state.payments.filter(function (x) { return x.id !== existing.id; });
          save(); closeModal(); renderAll(); toast('Payment deleted');
        }
      }) : null,
      el('button', {
        type: 'button', text: existing ? 'Save changes' : 'Record payment',
        onclick: function () {
          var amt = Number(fAmount.value);
          if (!amt || amt <= 0) { toast('Enter an amount'); fAmount.focus(); return; }
          var rec = existing || { id: uid() };
          rec.studentId = fStudent.value;
          rec.amount = amt;
          rec.date = fDate.value || todayISO();
          rec.method = fMethod.value.trim();
          rec.note = fNote.value.trim();
          if (!existing) state.payments.push(rec);
          save(); closeModal(); renderAll();
          toast(existing ? 'Payment updated' : 'Payment recorded');
        }
      })
    ]);
  }

  /* Plain-text invoice for one student: every unpaid-through session, then the balance. */
  function invoiceText(studentId) {
    var st = studentById(studentId);
    if (!st) return '';
    var b = studentBalance(studentId);
    var lines = [];
    lines.push(state.settings.businessName || 'Tutoring');
    lines.push('Invoice for ' + st.name + ' — ' + fmtDateFull(todayISO()));
    lines.push('');
    var billed = state.sessions.filter(function (s) { return s.studentId === studentId && isBillable(s); })
      .sort(function (a, c) { return a.date < c.date ? -1 : 1; });
    billed.forEach(function (s) {
      var label = parseDate(s.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      var extra = s.status === 'noshow' ? ' (no-show)' : (s.status === 'canceled' ? ' (late cancel)' : '');
      lines.push(label + ' · ' + hoursText(s.minutes) + ' hr @ ' + money(sessionRate(s)) + '/hr' + extra + ' — ' + money(sessionAmount(s)));
    });
    if (!billed.length) lines.push('(no billable sessions yet)');
    lines.push('');
    lines.push('Total billed: ' + money(b.billed));
    lines.push('Payments received: ' + money(b.paid));
    lines.push(b.due >= 0 ? 'Balance due: ' + money(b.due) : 'Credit on account: ' + money(-b.due));
    return lines.join('\n');
  }

  function copyInvoice(studentId) {
    var text = invoiceText(studentId);
    copyText(text, 'Invoice copied');
  }

  function copyText(text, okMsg) {
    function fallback() {
      var ta = el('textarea', { style: 'position:fixed;left:-9999px;top:0' });
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      if (ok) toast(okMsg);
      else showTextFallback(text);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast(okMsg); }, fallback);
    } else fallback();
  }

  function showTextFallback(text) {
    var ta = el('textarea', { style: 'min-height:220px' });
    ta.value = text;
    openModal('Copy this', [el('p', { class: 'muted', text: 'Select all and copy.' }), ta]);
    ta.select();
  }

  /* ============================================================
     Settings, backup, sample data
     ============================================================ */

  function openSettings() {
    var fBiz = input({ type: 'text', value: state.settings.businessName || '', placeholder: 'Your practice name' });
    var fRate = input({ type: 'number', inputmode: 'decimal', step: '1', min: '0', value: state.settings.defaultRate });
    var fMins = selectNode([
      { value: '30', label: '30 min' }, { value: '45', label: '45 min' },
      { value: '60', label: '1 hour' }, { value: '90', label: '1.5 hours' }, { value: '120', label: '2 hours' }
    ], String(state.settings.defaultMinutes || 60));
    var fTheme = selectNode([
      { value: 'auto', label: 'Match device' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }
    ], state.settings.theme || 'auto');

    var counts = state.students.length + ' students · ' + state.sessions.length + ' sessions · ' + state.payments.length + ' payments';

    openModal('Settings', [
      field('Practice name', fBiz, 'Shows in the header and on invoices.'),
      el('div', { class: 'row' }, [field('Default rate ($/hr)', fRate), field('Default length', fMins)]),
      field('Appearance', fTheme),

      el('div', { class: 'detail-block' }, [
        el('h4', { text: 'Your data' }),
        el('p', { class: 'muted', text: counts + '. Everything is stored in this browser only — nothing is uploaded anywhere.' }),
        el('div', { class: 'btn-row', style: 'margin-bottom:8px' }, [
          el('button', { class: 'ghost small', type: 'button', text: 'Export backup', onclick: exportBackup }),
          el('button', { class: 'ghost small', type: 'button', text: 'Import backup', onclick: importBackup })
        ]),
        el('div', { class: 'btn-row' }, [
          el('button', { class: 'ghost small', type: 'button', text: 'Sessions as CSV', onclick: exportCSV }),
          el('button', { class: 'ghost small', type: 'button', text: 'Load sample data', onclick: loadSample })
        ])
      ]),

      el('div', { class: 'detail-block' }, [
        el('h4', { text: 'Danger zone' }),
        el('button', { class: 'danger', type: 'button', text: 'Erase everything', onclick: eraseAll })
      ])
    ], [
      el('button', {
        type: 'button', text: 'Save settings',
        onclick: function () {
          state.settings.businessName = fBiz.value.trim();
          state.settings.defaultRate = Number(fRate.value) || 0;
          state.settings.defaultMinutes = Number(fMins.value) || 60;
          state.settings.theme = fTheme.value;
          save(); applyTheme(); closeModal(); renderAll();
          toast('Settings saved');
        }
      })
    ]);
  }

  function applyTheme() {
    var t = state.settings.theme || 'auto';
    if (t === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
  }

  function exportBackup() {
    var text = JSON.stringify(state, null, 2);
    var name = 'tutor-desk-backup-' + todayISO() + '.json';
    if (!downloadFile(name, text, 'application/json')) {
      showTextFallback(text);
    } else {
      toast('Backup downloaded');
    }
  }

  function exportCSV() {
    var rows = [['Date', 'Start', 'Student', 'Minutes', 'Hours', 'Status', 'Billable', 'Rate', 'Amount', 'Location', 'Topic', 'Homework', 'Notes']];
    sortedSessions().forEach(function (s) {
      rows.push([
        s.date, s.start || '', studentName(s.studentId), s.minutes,
        hoursText(s.minutes), s.status, isBillable(s) ? 'yes' : 'no',
        sessionRate(s), (Math.round(sessionAmount(s) * 100) / 100).toFixed(2),
        s.location || '', s.topic || '', s.homework || '', (s.note || '').replace(/\r?\n/g, ' ')
      ]);
    });
    var csv = rows.map(function (r) {
      return r.map(function (cell) {
        var v = String(cell === null || cell === undefined ? '' : cell);
        return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
      }).join(',');
    }).join('\n');
    if (!downloadFile('tutor-sessions-' + todayISO() + '.csv', csv, 'text/csv')) showTextFallback(csv);
    else toast('CSV downloaded');
  }

  function downloadFile(filename, text, mime) {
    try {
      var blob = new Blob([text], { type: mime + ';charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = el('a', { href: url, download: filename });
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      return true;
    } catch (e) {
      return false;
    }
  }

  function importBackup() {
    var picker = el('input', { type: 'file', accept: '.json,application/json', style: 'display:none' });
    document.body.appendChild(picker);
    picker.addEventListener('change', function () {
      var file = picker.files && picker.files[0];
      document.body.removeChild(picker);
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var data = JSON.parse(String(reader.result));
          if (!data || (!Array.isArray(data.students) && !Array.isArray(data.sessions))) {
            toast("That file doesn't look like a backup");
            return;
          }
          if (!confirm('Replace everything currently in the app with this backup?')) return;
          state = migrate(data);
          save(); applyTheme(); closeModal(); renderAll();
          toast('Backup restored');
        } catch (e) {
          toast("Couldn't read that file");
        }
      };
      reader.readAsText(file);
    });
    picker.click();
  }

  function eraseAll() {
    if (!confirm('Erase every student, session, and payment? This cannot be undone.')) return;
    if (!confirm('Really erase everything? Export a backup first if you want to keep it.')) return;
    state = clone(DEFAULTS);
    save(); applyTheme(); closeModal(); renderAll();
    toast('All data erased');
  }

  function loadSample() {
    if (state.students.length && !confirm('Add sample students and sessions alongside your real data?')) return;
    var t = todayISO();
    var a = { id: uid(), name: 'Maya Rosen', grade: '8th grade', focus: 'SHSAT', rate: 120, parentName: 'Dana Rosen', contact: '555-0134', location: 'Zoom', notes: 'Strong in math, needs reading-comprehension pacing. Test in October.', active: true, createdAt: t };
    var b = { id: uid(), name: 'Elijah Park', grade: '11th grade', focus: 'SAT Math', rate: 140, parentName: '', contact: 'elijah@example.com', location: 'Library', notes: 'Wants 700+. Weak spot: word problems.', active: true, createdAt: t };
    state.students.push(a, b);
    state.sessions.push(
      { id: uid(), studentId: a.id, date: addDays(t, -7), start: '16:00', minutes: 90, status: 'completed', billable: true, location: 'Zoom', topic: 'Scrambled paragraphs', note: 'Worked through two full sets. Much faster on transitions.', homework: 'Set 4, questions 1–10', rate: null },
      { id: uid(), studentId: a.id, date: addDays(t, -2), start: '16:00', minutes: 90, status: 'completed', billable: true, location: 'Zoom', topic: 'Reading comprehension', note: 'Timing still the issue — 3 min over on the long passage.', homework: 'Two timed passages', rate: null },
      { id: uid(), studentId: a.id, date: t, start: '16:00', minutes: 90, status: 'scheduled', billable: true, location: 'Zoom', topic: 'Full practice test review', note: '', homework: '', rate: null },
      { id: uid(), studentId: b.id, date: addDays(t, -4), start: '18:30', minutes: 60, status: 'completed', billable: true, location: 'Library', topic: 'Systems of equations', note: 'Solid. Moving to word problems next.', homework: 'Khan set', rate: null },
      { id: uid(), studentId: b.id, date: addDays(t, 1), start: '18:30', minutes: 60, status: 'scheduled', billable: true, location: 'Library', topic: 'Word problems', note: '', homework: '', rate: null }
    );
    state.payments.push({ id: uid(), studentId: a.id, amount: 180, date: addDays(t, -5), method: 'Zelle', note: 'First session' });
    save(); closeModal(); renderAll();
    toast('Sample data loaded');
  }

  /* ============================================================
     Navigation & wiring
     ============================================================ */

  var currentView = 'today';

  function showView(name) {
    currentView = name;
    ['today', 'schedule', 'students', 'money'].forEach(function (v) {
      $('#view-' + v).hidden = (v !== name);
    });
    Array.prototype.forEach.call(document.querySelectorAll('#nav button'), function (btn) {
      if (btn.getAttribute('data-view') === name) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    });
    window.scrollTo(0, 0);
    renderAll();
  }

  function renderAll() {
    $('#headSub').textContent = state.settings.businessName || 'Tutoring';
    renderToday();
    renderSchedule();
    renderStudents();
    renderMoney();
  }

  function wireTabs(selector, attr, onPick) {
    var wrap = $(selector);
    wrap.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('button') : null;
      if (!btn || !wrap.contains(btn)) return;
      Array.prototype.forEach.call(wrap.querySelectorAll('button'), function (b) {
        b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
      });
      onPick(btn.getAttribute(attr));
    });
  }

  function init() {
    applyTheme();

    $('#nav').addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('button') : null;
      if (!btn) return;
      showView(btn.getAttribute('data-view'));
    });

    wireTabs('#scheduleTabs', 'data-range', function (v) { scheduleRange = v; renderSchedule(); });
    wireTabs('#studentTabs', 'data-filter', function (v) { studentFilter = v; renderStudents(); });
    wireTabs('#moneyTabs', 'data-period', function (v) { moneyPeriod = v; renderMoney(); });

    $('#btnSettings').addEventListener('click', openSettings);
    $('#btnAddPayment').addEventListener('click', function () { openPaymentForm(null); });

    /* The + button adds whatever fits the view you're looking at. */
    $('#fab').addEventListener('click', function () {
      if (currentView === 'students') openStudentForm(null);
      else if (currentView === 'money') openPaymentForm(null);
      else openSessionForm(null);
    });

    $('#modalBack').addEventListener('click', function (e) {
      if (e.target === $('#modalBack')) closeModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !$('#modalBack').hidden) closeModal();
    });

    renderAll();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
