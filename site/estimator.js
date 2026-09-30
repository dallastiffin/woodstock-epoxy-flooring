/* ====================================================================
   INSTANT PRICE ESTIMATOR
   --------------------------------------------------------------------
   Works out a price RANGE from the visitor's answers, asks for a name
   and phone number, sends the lead (with every answer and the range
   that was shown) to the Lead Router, then reveals the range.

   All pricing lives in PRICING below. Edit the numbers there only.
   Ranges are installed prices per square foot, in Canadian dollars.
   ==================================================================== */
(function () {
  'use strict';

  var PRICING = {
    systems: {
      flake:    { name: 'Flake epoxy',                  lo: 5,  hi: 9  },
      poly:     { name: 'Polyaspartic flake (one-day)', lo: 6,  hi: 12 },
      solid:    { name: 'Solid colour epoxy',           lo: 4,  hi: 7  },
      metallic: { name: 'Metallic epoxy',               lo: 9,  hi: 16 },
      quartz:   { name: 'Quartz (slip-resistant)',      lo: 7,  hi: 11 }
    },
    // What "Not sure" turns into for each type of space
    recommend: { garage: 'flake', basement: 'flake', commercial: 'quartz', patio: 'poly', other: 'flake' },
    // Extra cost per square foot for the state of the slab
    condition: {
      good:   { name: 'Good shape',                          lo: 0,    hi: 0   },
      minor:  { name: 'Some cracks or pitting',              lo: 0.75, hi: 1.5 },
      heavy:  { name: 'Heavy damage or old coating to remove', lo: 1.5, hi: 3  },
      unsure: { name: 'Not sure',                            lo: 0,    hi: 1.5 }
    },
    moisturePerSqft: { lo: 1, hi: 3 },       // moisture-block primer
    stemWalls:       { lo: 300, hi: 700 },   // flat, garage curbs / stem walls
    minimumJob:      { lo: 1500, hi: 2000 },
    // Bigger floors cost less per square foot
    volume: [ { from: 4000, factor: 0.8 }, { from: 1500, factor: 0.9 } ],
    garageSizes: { one: 250, two: 450, three: 650 }
  };

  var SPACE_NAMES = { garage: 'Garage', basement: 'Basement', commercial: 'Commercial or shop floor',
                      patio: 'Patio, porch or other outdoor slab', other: 'Other space' };
  var GARAGE_NAMES = { one: '1-car', two: '2-car', three: '3-car' };

  var form = document.getElementById('est-form');
  if (!form) return;
  var result = document.getElementById('est-result');

  function $(sel) { return form.querySelector(sel); }
  function val(name) {
    var el = form.querySelector('[name="' + name + '"]:checked');
    return el ? el.value : '';
  }
  function money(n) { return '$' + Math.round(n).toLocaleString('en-CA'); }
  function down50(n) { return Math.floor(n / 50) * 50; }
  function up50(n) { return Math.ceil(n / 50) * 50; }

  /* ---------- show / hide the parts that depend on earlier answers ---------- */
  function sync() {
    var space = val('space');
    var garageSize = val('garage_size');
    var sizeWrap = $('[data-show="garage-size"]');
    var sqftWrap = $('[data-show="sqft"]');
    var stem = $('[data-show="stem"]');
    var moist = $('[data-show="moisture"]');
    var patioNote = $('[data-show="patio-note"]');

    sizeWrap.hidden = space !== 'garage';
    sqftWrap.hidden = !space || (space === 'garage' && garageSize !== 'custom');
    stem.hidden = space !== 'garage';
    moist.hidden = !(space === 'basement' || space === 'commercial');
    patioNote.hidden = space !== 'patio';
    if (stem.hidden) stem.querySelector('input').checked = false;
    if (moist.hidden) moist.querySelector('input').checked = false;
  }

  function sqft() {
    var space = val('space');
    var g = val('garage_size');
    if (space === 'garage' && g && g !== 'custom') return PRICING.garageSizes[g];
    var n = parseFloat(String($('#est-sqft').value).replace(/,/g, ''));
    return isFinite(n) ? n : 0;
  }

  /* ---------- the maths ---------- */
  function calculate() {
    var space = val('space');
    var area = sqft();
    var chosen = val('system') || 'auto';
    var sysKey = chosen === 'auto' ? PRICING.recommend[space] : chosen;
    var switched = false;
    if (space === 'patio' && sysKey !== 'poly') { sysKey = 'poly'; switched = true; }
    var sys = PRICING.systems[sysKey];
    var cond = PRICING.condition[val('condition') || 'unsure'];
    var moisture = $('#est-moisture').checked;
    var stem = $('#est-stem').checked;

    var lo = sys.lo + cond.lo + (moisture ? PRICING.moisturePerSqft.lo : 0);
    var hi = sys.hi + cond.hi + (moisture ? PRICING.moisturePerSqft.hi : 0);
    var factor = 1;
    for (var i = 0; i < PRICING.volume.length; i++) {
      if (area >= PRICING.volume[i].from) { factor = PRICING.volume[i].factor; break; }
    }
    lo = lo * area * factor;
    hi = hi * area * factor;
    if (stem) { lo += PRICING.stemWalls.lo; hi += PRICING.stemWalls.hi; }
    lo = Math.max(lo, PRICING.minimumJob.lo);
    hi = Math.max(hi, PRICING.minimumJob.hi);

    return {
      lo: down50(lo), hi: up50(hi), area: area, space: space,
      system: sys.name, systemPicked: chosen === 'auto' ? 'recommended by the estimator' : (switched ? 'switched to polyaspartic for outdoor use' : 'chosen by customer'),
      condition: cond.name, moisture: moisture, stem: stem
    };
  }

  /* ---------- validation ---------- */
  function setError(key, msg) {
    var slot = form.querySelector('[data-error="' + key + '"]');
    if (slot) slot.textContent = msg || '';
    return !msg;
  }

  function validate() {
    var ok = true, first = null;
    function check(key, msg, focusEl) {
      setError(key, msg);
      if (msg) {
        if (ok) first = focusEl;
        ok = false;
      }
    }
    var space = val('space');
    check('space', space ? '' : 'Choose the type of space.', form.querySelector('[name="space"]'));
    if (space === 'garage' && !val('garage_size')) {
      check('garage_size', 'Choose the garage size.', form.querySelector('[name="garage_size"]'));
    } else { setError('garage_size', ''); }
    var needSqft = space && !(space === 'garage' && val('garage_size') !== 'custom');
    var a = sqft();
    check('sqft', needSqft && (a < 50 || a > 100000) ? 'Enter the floor size in square feet (length x width).' : '', $('#est-sqft'));

    var name = $('#est-name'), phone = $('#est-phone'), email = $('#est-email');
    check('name', name.value.trim() ? '' : 'Name is required.', name);
    var p = phone.value.trim();
    check('phone', !p ? 'Phone is required.' : (/^[0-9+()\-.\s]{10,}$/.test(p) ? '' : 'Enter a valid phone number.'), phone);
    var e = email.value.trim();
    check('email', e && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) ? 'Enter a valid email address.' : '', email);
    [name, phone, email, $('#est-sqft')].forEach(function (el) {
      var slot = form.querySelector('[data-error="' + el.name + '"]');
      if (slot && slot.textContent) el.setAttribute('aria-invalid', 'true'); else el.removeAttribute('aria-invalid');
    });
    if (first && first.focus) first.focus();
    return ok;
  }

  /* ---------- lead summary for the sheet and the alert email ---------- */
  function summary(r) {
    var spaceLine = SPACE_NAMES[r.space] || r.space;
    if (r.space === 'garage' && val('garage_size') !== 'custom') spaceLine += ' (' + GARAGE_NAMES[val('garage_size')] + ', about ' + r.area + ' sq ft)';
    else spaceLine += ' (' + r.area.toLocaleString('en-CA') + ' sq ft)';
    var addons = [];
    if (r.stem) addons.push('stem walls / curbs');
    if (r.moisture) addons.push('moisture-block primer');
    var notes = $('#est-notes').value.trim();
    return [
      'INSTANT PRICE ESTIMATE SHOWN: ' + money(r.lo) + ' to ' + money(r.hi),
      'Space: ' + spaceLine,
      'System: ' + r.system + ' (' + r.systemPicked + ')',
      'Concrete condition: ' + r.condition,
      'Add-ons: ' + (addons.length ? addons.join(', ') : 'none'),
      'Customer notes: ' + (notes || '-')
    ].join('\n');
  }

  function showResult(r, delivered) {
    result.querySelector('[data-out="range"]').textContent = money(r.lo) + ' – ' + money(r.hi);
    var list = result.querySelector('[data-out="details"]');
    list.innerHTML = '';
    var rows = [
      ['Space', (SPACE_NAMES[r.space] || r.space) + ', about ' + r.area.toLocaleString('en-CA') + ' sq ft'],
      ['System', r.system],
      ['Concrete', r.condition]
    ];
    if (r.stem) rows.push(['Add-on', 'Stem walls / curbs']);
    if (r.moisture) rows.push(['Add-on', 'Moisture-block primer']);
    rows.forEach(function (row) {
      var li = document.createElement('li');
      var b = document.createElement('strong');
      b.textContent = row[0] + ': ';
      li.appendChild(b);
      li.appendChild(document.createTextNode(row[1]));
      list.appendChild(li);
    });
    result.querySelector('[data-out="sent"]').hidden = !delivered;
    result.querySelector('[data-out="failed"]').hidden = delivered;
    form.hidden = true;
    result.hidden = false;
    result.setAttribute('tabindex', '-1');
    result.scrollIntoView({ behavior: 'smooth', block: 'start' });
    result.focus({ preventScroll: true });
  }

  /* ---------- wire up ---------- */
  form.addEventListener('change', sync);
  sync();

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!validate()) return;
    var r = calculate();

    if (form.querySelector('[name="botcheck"]').value) { showResult(r, true); return; }

    var data = {
      name: $('#est-name').value.trim(),
      phone: $('#est-phone').value.trim(),
      email: $('#est-email').value.trim(),
      city: $('#est-city').value.trim(),
      service: 'Price Estimator - ' + r.system,
      message: summary(r),
      source: form.getAttribute('data-source') || 'Price Estimator',
      pageUrl: window.location.href
    };
    var btn = form.querySelector('button[type="submit"]');
    var label = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Working out your price…';

    var send = window.siteSubmitLead ? window.siteSubmitLead(data) : Promise.reject(new Error('no sender'));
    send.then(function () { showResult(r, true); })
        .catch(function () { showResult(r, false); })
        .then(function () { btn.disabled = false; btn.textContent = label; });
  });

  var again = result.querySelector('[data-action="edit"]');
  if (again) again.addEventListener('click', function () {
    result.hidden = true;
    form.hidden = false;
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
})();
