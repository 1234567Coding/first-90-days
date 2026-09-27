/* The First 90 Days — shared site JS (vanilla, no dependencies).
 *
 * Features: mobile nav toggle, site search, article TOC w/ scroll-spy,
 * reading progress bar, sortable tables, FAQ accordions, dark mode,
 * back-to-top. Every feature checks for its prerequisites and silently
 * no-ops when they are missing, so pages degrade gracefully without JS.
 */
(function () {
  'use strict';

  var inArticles = /(^|\/)articles\//.test(location.pathname);
  var root = inArticles ? '../' : '';

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $all(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

  /* Throttle scroll work with requestAnimationFrame. */
  function onScroll(fn) {
    if (!window.addEventListener) return;
    var ticking = false;
    window.addEventListener('scroll', function () {
      if (!ticking) {
        ticking = true;
        (window.requestAnimationFrame || function (cb) { setTimeout(cb, 16); })(function () {
          ticking = false;
          fn();
        });
      }
    }, { passive: true });
  }

  /* ---------- Mobile nav toggle (previously inline on each page) ---------- */
  (function initNav() {
    var toggle = $('.nav-toggle');
    var nav = $('#mainNav');
    if (!toggle || !nav) return;
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    nav.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('a') && nav.classList.contains('open')) {
        nav.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  })();

  /* ---------- Dark mode toggle (feature 6) ---------- */
  /* The <head> inline snippet already applied the stored/preferred theme to
     <html data-theme> before first paint; this just adds the toggle button. */
  (function initTheme() {
    var bar = $('.site-header .bar');
    var nav = $('#mainNav');
    if (!bar || !nav) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'theme-toggle';
    function isDark() { return document.documentElement.getAttribute('data-theme') === 'dark'; }
    function paint() {
      var dark = isDark();
      btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
      btn.setAttribute('aria-pressed', String(dark));
      btn.innerHTML = '<span aria-hidden="true">' + (dark ? '\u2600' : '\u263E') + '</span>';
    }
    btn.addEventListener('click', function () {
      var dark = !isDark();
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
      try { localStorage.setItem('f90d-theme', dark ? 'dark' : 'light'); } catch (e) { /* ignore */ }
      paint();
    });
    paint();
    /* Place right after the nav so it sits at the header's far edge on desktop
       and next to the hamburger on mobile. */
    if (nav.nextSibling) bar.insertBefore(btn, nav.nextSibling);
    else bar.appendChild(btn);
  })();

  /* ---------- Site-wide client-side search (feature 1) ---------- */
  (function initSearch() {
    var nav = $('#mainNav');
    if (!nav) return;

    var form = document.createElement('form');
    form.className = 'site-search';
    form.setAttribute('role', 'search');
    form.setAttribute('aria-label', 'Site search');
    form.innerHTML =
      '<label class="visually-hidden" for="site-search-input">Search articles</label>' +
      '<input type="search" id="site-search-input" class="site-search-input" ' +
      'placeholder="Search articles\u2026" autocomplete="off" role="combobox" ' +
      'aria-expanded="false" aria-controls="site-search-results" aria-autocomplete="list">' +
      '<div class="site-search-results" id="site-search-results" role="listbox" hidden></div>';
    nav.appendChild(form);

    var input = $('.site-search-input', form);
    var results = $('.site-search-results', form);
    var index = null;
    var activeIdx = -1;
    var items = [];

    function linkFor(url) {
      var slug = url.replace(/^articles\//, '');
      return (inArticles ? '' : 'articles/') + slug;
    }
    function esc(s) {
      return String(s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }
    function close() {
      results.hidden = true;
      results.innerHTML = '';
      input.setAttribute('aria-expanded', 'false');
      activeIdx = -1;
      items = [];
    }
    function render(matches) {
      items = matches;
      activeIdx = -1;
      if (!matches.length) {
        results.innerHTML = '<p class="site-search-empty" role="option" aria-selected="false">No articles match.</p>';
      } else {
        results.innerHTML = matches.map(function (m, i) {
          return '<a class="site-search-item" role="option" id="site-search-opt-' + i + '" ' +
            'aria-selected="false" href="' + esc(linkFor(m.url)) + '">' +
            '<span class="site-search-title">' + esc(m.title) + '</span>' +
            '<span class="site-search-excerpt">' + esc(m.excerpt) + '</span></a>';
        }).join('');
      }
      results.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    }
    function search(q) {
      q = q.trim().toLowerCase();
      if (!q || !index) { close(); return; }
      var words = q.split(/\s+/);
      var scored = [];
      index.forEach(function (entry) {
        var hay = (entry.title + ' ' + entry.excerpt + ' ' + entry.headings.join(' ')).toLowerCase();
        var ok = words.every(function (w) { return hay.indexOf(w) !== -1; });
        if (!ok) return;
        var score = 0;
        words.forEach(function (w) {
          if (entry.title.toLowerCase().indexOf(w) !== -1) score += 3;
          else if (hay.indexOf(w) !== -1) score += 1;
        });
        scored.push({ entry: entry, score: score });
      });
      scored.sort(function (a, b) { return b.score - a.score; });
      render(scored.slice(0, 8).map(function (s) { return s.entry; }));
    }
    function setActive(i) {
      var links = $all('.site-search-item', results);
      links.forEach(function (a, j) { a.setAttribute('aria-selected', String(j === i)); a.classList.toggle('active', j === i); });
      activeIdx = i;
      if (i >= 0 && links[i]) {
        input.setAttribute('aria-activedescendant', 'site-search-opt-' + i);
      } else {
        input.removeAttribute('aria-activedescendant');
      }
    }

    var debounce = null;
    input.addEventListener('input', function () {
      clearTimeout(debounce);
      debounce = setTimeout(function () { search(input.value); }, 120);
    });
    input.addEventListener('keydown', function (e) {
      var links = $all('.site-search-item', results);
      if (e.key === 'Escape') { close(); input.blur(); }
      else if (e.key === 'ArrowDown' && links.length) { e.preventDefault(); setActive((activeIdx + 1) % links.length); }
      else if (e.key === 'ArrowUp' && links.length) { e.preventDefault(); setActive((activeIdx - 1 + links.length) % links.length); }
      else if (e.key === 'Enter' && activeIdx >= 0 && links[activeIdx]) { e.preventDefault(); links[activeIdx].click(); }
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var first = $('.site-search-item', results);
      if (first) first.click();
      else search(input.value);
    });
    document.addEventListener('click', function (e) {
      if (!form.contains(e.target)) close();
    });

    fetch(root + 'search-index.json', { credentials: 'same-origin' })
      .then(function (res) { if (!res.ok) throw new Error('bad status'); return res.json(); })
      .then(function (data) { index = Array.isArray(data) ? data : []; })
      .catch(function () {
        /* Search data unavailable (e.g. file:// preview) — remove the dead box. */
        if (form.parentNode) form.parentNode.removeChild(form);
      });
  })();

  var post = $('.post');

  /* ---------- Article table of contents w/ scroll-spy (feature 2) ---------- */
  (function initTOC() {
    if (!post) return;
    var headings = $all('h2, h3', post).filter(function (h) {
      return !h.closest('.keep-reading');
    });
    if (headings.length < 2) return;

    function slugify(text) {
      return text.toLowerCase().replace(/&[a-z]+;/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'section';
    }
    var used = {};
    headings.forEach(function (h) {
      if (!h.id) {
        var base = slugify(h.textContent), id = base, n = 1;
        while (used[id] || document.getElementById(id)) { id = base + '-' + (++n); }
        used[id] = true;
        h.id = id;
      } else {
        used[h.id] = true;
      }
    });

    var nav = document.createElement('nav');
    nav.className = 'toc';
    nav.setAttribute('aria-label', 'On this page');
    var html = '<p class="toc-title">On this page</p><ol>';
    headings.forEach(function (h) {
      html += '<li class="toc-' + h.tagName.toLowerCase() + '"><a href="#' + h.id + '">' +
        h.textContent.trim().replace(/[<>&]/g, '') + '</a></li>';
    });
    nav.innerHTML = html + '</ol>';

    var lede = $('.lede', post);
    if (lede && lede.nextSibling) lede.parentNode.insertBefore(nav, lede.nextSibling);
    else post.insertBefore(nav, headings[0]);

    /* Scroll-spy: highlight the section currently in view. */
    if (!('IntersectionObserver' in window)) return;
    var links = {};
    $all('a', nav).forEach(function (a) { links[a.getAttribute('href').slice(1)] = a; });
    var current = null;
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          if (current) current.classList.remove('active');
          current = links[en.target.id] || null;
          if (current) current.classList.add('active');
        }
      });
    }, { rootMargin: '-90px 0px -70% 0px' });
    headings.forEach(function (h) { obs.observe(h); });
  })();

  /* ---------- Reading progress bar (feature 3) ---------- */
  (function initProgress() {
    if (!post) return;
    var bar = document.createElement('div');
    bar.className = 'reading-progress';
    bar.setAttribute('aria-hidden', 'true');
    document.body.appendChild(bar);
    function update() {
      var top = post.offsetTop;
      var total = post.offsetHeight - window.innerHeight;
      var p = total > 0 ? (window.pageYOffset - top + window.innerHeight * 0.15) / total : 0;
      p = Math.min(1, Math.max(0, p));
      bar.style.transform = 'scaleX(' + p + ')';
    }
    onScroll(update);
    update();
  })();

  /* ---------- Sortable comparison tables (feature 4) ---------- */
  (function initTables() {
    $all('.post table').forEach(function (table) {
      var thead = table.querySelector('thead');
      var tbody = table.querySelector('tbody');
      var ths = thead ? $all('th', thead) : [];
      if (!thead || !tbody || !ths.length) return;
      table.classList.add('is-sortable');

      function cellVal(row, i) {
        var cell = row.children[i];
        return cell ? cell.textContent.trim() : '';
      }
      function numVal(s) {
        var n = parseFloat(s.replace(/[^0-9.\-]/g, ''));
        return isNaN(n) ? null : n;
      }

      ths.forEach(function (th, i) {
        th.setAttribute('aria-sort', 'none');
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'sort-btn';
        btn.setAttribute('aria-label', 'Sort by ' + th.textContent.trim());
        var label = document.createElement('span');
        label.className = 'sort-label';
        while (th.firstChild) label.appendChild(th.firstChild);
        var ind = document.createElement('span');
        ind.className = 'sort-ind';
        ind.setAttribute('aria-hidden', 'true');
        btn.appendChild(label);
        btn.appendChild(ind);
        th.appendChild(btn);

        btn.addEventListener('click', function () {
          var dir = th.getAttribute('aria-sort') === 'ascending' ? 'descending' : 'ascending';
          ths.forEach(function (t) { t.setAttribute('aria-sort', 'none'); });
          th.setAttribute('aria-sort', dir);

          /* Keep section-subheader rows (td[colspan]) pinned in place. */
          var rows = $all('tr', tbody);
          var pinned = {}, sortable = [];
          rows.forEach(function (r, idx) {
            if (r.querySelector('td[colspan]')) pinned[idx] = r;
            else sortable.push(r);
          });
          var numeric = sortable.length > 0 && sortable.every(function (r) {
            var v = cellVal(r, i);
            return v === '' || numVal(v) !== null;
          });
          sortable.sort(function (a, b) {
            var va = cellVal(a, i), vb = cellVal(b, i), cmp;
            if (numeric) cmp = (numVal(va) || 0) - (numVal(vb) || 0);
            else cmp = va.toLowerCase().localeCompare(vb.toLowerCase());
            return dir === 'ascending' ? cmp : -cmp;
          });
          var frag = document.createDocumentFragment(), s = 0;
          rows.forEach(function (_, idx) {
            frag.appendChild(pinned[idx] || sortable[s++]);
          });
          tbody.appendChild(frag);
        });
      });
    });
  })();

  /* ---------- FAQ accordions (feature 5) ---------- */
  (function initFaq() {
    $all('dl.faq').forEach(function (dl, dlIdx) {
      dl.classList.add('faq-accordion');
      $all('dt', dl).forEach(function (dt, i) {
        var dd = dt.nextElementSibling;
        if (!dd || dd.tagName !== 'DD') return;
        var id = 'faq-a' + dlIdx + '-' + i;
        dd.id = id;
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'faq-toggle';
        btn.setAttribute('aria-expanded', 'false');
        btn.setAttribute('aria-controls', id);
        while (dt.firstChild) btn.appendChild(dt.firstChild);
        dt.appendChild(btn);
        dd.hidden = true;
        btn.addEventListener('click', function () {
          var open = btn.getAttribute('aria-expanded') === 'true';
          btn.setAttribute('aria-expanded', String(!open));
          dd.hidden = open;
        });
      });
    });
  })();

  /* ---------- Back-to-top button (feature 7) ---------- */
  (function initBackToTop() {
    if (!document.body) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'back-to-top';
    btn.setAttribute('aria-label', 'Back to top');
    btn.innerHTML = '<span aria-hidden="true">&uarr;</span>';
    btn.hidden = true;
    document.body.appendChild(btn);
    function update() {
      btn.hidden = window.pageYOffset < 600;
    }
    onScroll(update);
    update();
    btn.addEventListener('click', function () {
      try { window.scrollTo({ top: 0, behavior: 'smooth' }); }
      catch (e) { window.scrollTo(0, 0); }
    });
  })();
})();
