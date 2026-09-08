/* Launchboard SPA.
 * Same-origin only: HTML/CSS/JS from /assets, data from /data/*.json, writes to
 * /api/* — so the strict CSP (default-src 'self') never has to be loosened.
 * No inline scripts, no inline styles, no inline handlers: all behaviour is here
 * and wired through event delegation, all theming through CSS classes. */
(function () {
  "use strict";

  var app = document.getElementById("app");
  var STARTUPS = [];
  var JOBS = [];
  var csrfToken = null;
  var lastPath = null;
  var homeReady = false;

  /* ---------------- utilities ---------------- */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function gp(n) { return "gp-" + (((n | 0) % 10) + 10) % 10; }

  function store(key, fallback) {
    try { var v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); }
    catch (e) { return fallback; }
  }
  function save(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }

  var wants = new Set(store("lb-wants", []));
  var votes = new Set(store("lb-votes", []));
  var bookmarks = new Set(store("lb-bookmarks", []));
  var localComments = store("lb-comments", {});

  function toggleSet(set, key, slug) {
    if (set.has(slug)) set.delete(slug); else set.add(slug);
    save(key, Array.prototype.slice.call(set));
  }

  function bySlug(slug) { for (var i = 0; i < STARTUPS.length; i++) if (STARTUPS[i].slug === slug) return STARTUPS[i]; return null; }
  function wantCount(s) { return s.subscribers + (wants.has(s.slug) ? 1 : 0); }
  function voteCount(s) { return s.upvotes + (votes.has(s.slug) ? 1 : 0); }
  function commentsFor(s) { return (s.comments || []).concat(localComments[s.slug] || []); }

  var DAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  function dateLabel(daysAgo) {
    if (daysAgo <= 0) return "Today";
    if (daysAgo === 1) return "Yesterday";
    if (daysAgo <= 6) { var d = new Date(); d.setDate(d.getDate() - daysAgo); return DAY[d.getDay()]; }
    return daysAgo + " days ago";
  }
  function emojiFor(cat) {
    var m = { "AI Assistant": "🤖", "AI Tools": "✨", "Developer Tools": "🛠️", "Analytics": "📊",
      "Marketing Analytics": "📈", "Lead Generation": "🎯", "Content Marketing": "✒️", "SaaS": "☁️",
      "Habit Tracking": "🌱", "Image Generation": "🎨", "Tracking": "📍", "Productivity": "⚡" };
    return m[cat] || "🚀";
  }

  /* ---------------- data ---------------- */
  function fetchData() {
    return Promise.all([
      fetch("/data/startups.json", { cache: "no-cache" }).then(function (r) { return r.json(); }),
      fetch("/data/jobs.json", { cache: "no-cache" }).then(function (r) { return r.json(); })
    ]).then(function (res) { STARTUPS = res[0] || []; JOBS = res[1] || []; });
  }

  function ensureCsrf() {
    if (csrfToken) return Promise.resolve(csrfToken);
    return fetch("/api/csrf", { method: "GET", credentials: "same-origin", cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d && d.csrfToken) csrfToken = d.csrfToken; return csrfToken; })
      .catch(function () { return null; });
  }

  /* ---------------- shared components ---------------- */
  function logoLink(s, big) {
    return '<a class="logo ' + (big ? "logo-lg " : "") + gp(s.gp) + '" href="#/startup/' + esc(s.slug) +
      '" data-link tabindex="-1" aria-hidden="true">' + esc(s.glyph) + "</a>";
  }
  function wantButton(s) {
    var on = wants.has(s.slug);
    return '<div class="startup-side"><button class="want-btn' + (on ? " is-on" : "") +
      '" type="button" data-action="want" data-slug="' + esc(s.slug) + '" aria-pressed="' + on + '">' +
      '<span class="want-ico" aria-hidden="true">' + (on ? "✓" : "▲") + "</span>" +
      '<span class="want-num">' + wantCount(s) + "</span>" +
      '<span class="want-label">I want this</span></button></div>';
  }
  function startupRow(s) {
    return '<article class="startup-row">' + logoLink(s) +
      '<div class="startup-main"><div class="startup-head">' +
      '<a class="startup-name" href="#/startup/' + esc(s.slug) + '" data-link>' + esc(s.name) + "</a>" +
      (s.boosted ? '<span class="badge boosted">Boosted</span>' : "") + "</div>" +
      '<p class="startup-tagline">' + esc(s.tagline) + "</p>" +
      '<div class="startup-meta"><span class="tag">' + esc(s.category) + "</span><span>" +
      esc(dateLabel(s.daysAgo)) + "</span></div></div>" + wantButton(s) + "</article>";
  }
  function miniCard(s) {
    return '<a class="mini-card" href="#/startup/' + esc(s.slug) + '" data-link>' +
      '<div class="mini-top"><span class="logo ' + gp(s.gp) + '" aria-hidden="true">' + esc(s.glyph) + "</span>" +
      '<span class="mini-name">' + esc(s.name) + "</span>" +
      (s.boosted ? '<span class="badge boosted">Boosted</span>' : "") + "</div>" +
      "<p>" + esc(s.tagline) + "</p>" +
      '<span class="count-pill">▲ ' + wantCount(s) + " want this</span></a>";
  }
  function dateGroups(list) {
    var order = [], groups = {};
    list.forEach(function (s) {
      var l = dateLabel(s.daysAgo);
      if (!groups[l]) { groups[l] = []; order.push(l); }
      groups[l].push(s);
    });
    return order.map(function (l) {
      return '<section class="date-group"><h3 class="date-label">' + esc(l) + "</h3>" +
        '<div class="feed">' + groups[l].map(startupRow).join("") + "</div></section>";
    }).join("");
  }

  /* ---------------- views ---------------- */
  var PAGE = 6;

  function viewHome() {
    var byNew = STARTUPS.slice().sort(function (a, b) { return a.daysAgo - b.daysAgo; });
    var trending = STARTUPS.slice().sort(function (a, b) { return wantCount(b) - wantCount(a); }).slice(0, 6);
    var latest = byNew.slice(0, 6);
    var jobs = JOBS.slice(0, 3);
    return '<section class="hero"><div class="wrap">' +
      "<h1>Discover tomorrow's <span class=\"grad\">startups</span> today</h1>" +
      "<p>Launchboard is a free directory of upcoming startups. Browse what's launching, get the daily digest, or submit your own to reach early adopters.</p>" +
      '<div class="hero-cta"><a class="btn btn-primary btn-lg" href="#/browse" data-link>Browse startups</a>' +
      '<a class="btn btn-ghost btn-lg" href="#/submit" data-link>Submit yours</a></div>' +
      '<ul class="trust-row"><li><strong>' + STARTUPS.length + '+</strong> startups</li>' +
      '<li><strong>32k</strong> daily subscribers</li><li><strong>Free</strong> to list</li></ul>' +
      "</div></section>" +
      '<div class="wrap page">' +
        newsletterBand() +
        '<div class="section-title"><h2>🔥 Trending startups</h2><a href="#/browse?view=trending" data-link>See all →</a></div>' +
        '<div class="trending-grid">' + trending.map(miniCard).join("") + "</div>" +
        '<div class="section-title"><h2>Just launched</h2><a href="#/browse" data-link>Browse all →</a></div>' +
        dateGroups(latest) +
        '<div class="section-title"><h2>💼 Remote startup jobs</h2><a href="#/jobs" data-link>View all →</a></div>' +
        '<div class="feed">' + jobs.map(jobRow).join("") + "</div>" +
      "</div>";
  }

  function newsletterBand() {
    return '<div class="news-hero"><div>' +
      '<span class="big-emoji" aria-hidden="true">📬</span>' +
      "<h2>Get the daily digest</h2>" +
      "<p class=\"muted\">Join 32,000+ early adopters who get the newest startups in their inbox every morning.</p>" +
      '<form class="news-form" id="newsletter-form">' +
      '<input id="news-email" type="email" name="email" required placeholder="you@example.com" aria-label="Email address" />' +
      '<button class="btn btn-primary" type="submit">Subscribe</button></form>' +
      '<p class="form-status" id="news-status" role="status" aria-live="polite"></p>' +
      "</div></div>";
  }

  function viewBrowse(params) {
    var q = (params.q || "").trim().toLowerCase();
    var cat = params.cat || "";
    var view = params.view || "all";
    var page = Math.max(1, parseInt(params.page, 10) || 1);

    var list = STARTUPS.filter(function (s) {
      if (cat && s.category !== cat) return false;
      if (view === "boosted" && !s.boosted) return false;
      if (q) {
        var hay = (s.name + " " + s.tagline + " " + s.category + " " + (s.tags || []).join(" ")).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });

    if (view === "trending") list.sort(function (a, b) { return wantCount(b) - wantCount(a); });
    else list.sort(function (a, b) { return a.daysAgo - b.daysAgo; });

    var total = list.length;
    var shown = list.slice(0, page * PAGE);
    var cats = categoryList();

    var tabs = [["all", "All"], ["trending", "Trending"], ["boosted", "Boosted"]].map(function (t) {
      return '<button class="tab' + (view === t[0] ? " is-active" : "") + '" data-action="tab-browse" data-view="' +
        t[0] + '">' + t[1] + "</button>";
    }).join("");

    var options = '<option value="">All topics</option>' + cats.map(function (c) {
      return '<option value="' + esc(c.name) + '"' + (cat === c.name ? " selected" : "") + ">" + esc(c.name) + " (" + c.count + ")</option>";
    }).join("");

    var body;
    if (!shown.length) {
      body = '<div class="empty-state"><div class="big-emoji">🔍</div><h3>No startups match</h3>' +
        '<p class="muted">Try a different search or topic.</p></div>';
    } else if (view === "all" && !q) {
      body = dateGroups(shown);
    } else {
      body = '<div class="feed">' + shown.map(startupRow).join("") + "</div>";
    }

    var more = shown.length < total ?
      '<div class="load-more-wrap"><button class="btn btn-ghost" data-action="load-more">Load next page… (' +
      shown.length + " of " + total + ")</button></div>" : "";

    return '<div class="wrap page">' +
      '<div class="page-head"><h1>Browse startups</h1><p>' + total + ' startup' + (total === 1 ? "" : "s") +
      (cat ? " in " + esc(cat) : "") + (q ? ' matching “' + esc(params.q) + "”" : "") + ".</p></div>" +
      '<div class="tabs">' + tabs + "</div>" +
      '<div class="toolbar">' +
      '<form class="search" id="browse-search" role="search"><span class="search-ico" aria-hidden="true">⌕</span>' +
      '<input id="browse-q" type="search" value="' + esc(params.q || "") + '" placeholder="Search startups…" aria-label="Search" /></form>' +
      '<select class="select" id="browse-cat" data-action="browse-control" aria-label="Filter by topic">' + options + "</select>" +
      "</div>" + body + more + "</div>";
  }

  function viewDetail(slug) {
    var s = bySlug(slug);
    if (!s) return notFound();
    var voted = votes.has(s.slug), saved = bookmarks.has(s.slug);
    var cmts = commentsFor(s);
    return '<div class="wrap page">' +
      '<a class="back-link" href="#/browse" data-link>← Back to browse</a>' +
      '<div class="detail-head">' + logoLink(s, true) +
      '<div><div class="detail-title"><h1>' + esc(s.name) + "</h1>" +
      (s.boosted ? '<span class="badge boosted">Boosted</span>' : "") + "</div>" +
      '<p class="tagline">' + esc(s.tagline) + "</p>" +
      '<div class="detail-actions">' +
      '<button class="btn btn-primary" data-action="want" data-slug="' + esc(s.slug) + '">' +
      (wants.has(s.slug) ? "✓ Wanted" : "▲ I want this") + " · " + wantCount(s) + "</button>" +
      '<button class="btn btn-ghost' + (voted ? " is-on" : "") + '" data-action="vote" data-slug="' + esc(s.slug) + '">👍 ' + voteCount(s) + "</button>" +
      '<button class="btn btn-ghost' + (saved ? " is-on" : "") + '" data-action="bookmark" data-slug="' + esc(s.slug) + '">' + (saved ? "♥ Saved" : "♡ Save") + "</button>" +
      '<a class="btn btn-ghost" href="' + esc(s.website) + '" target="_blank" rel="noopener nofollow">Visit ↗</a>' +
      '<button class="btn btn-ghost" data-action="share" data-slug="' + esc(s.slug) + '">Share</button>' +
      "</div></div></div>" +
      '<div class="gallery">' + (s.screenshots || []).map(function (sh) {
        return '<div class="shot ' + gp(sh.gp) + '"><span>' + esc(sh.label) + "</span></div>";
      }).join("") + "</div>" +
      '<div class="detail-body"><div class="prose">' +
      "<h3>About " + esc(s.name) + "</h3><p>" + esc(s.description) + "</p>" +
      '<div class="chips">' + (s.tags || []).map(function (t) { return '<span class="tag">' + esc(t) + "</span>"; }).join("") + "</div>" +
      commentsBlock(s, cmts) +
      "</div>" +
      '<aside><div class="card side-card"><h4>Maker</h4><div class="maker-row">' +
      '<span class="avatar ' + gp(s.gp) + '">' + esc(s.maker.initials) + "</span>" +
      '<div><div class="maker-name">' + esc(s.maker.name) + '</div><div class="muted small">' + esc(s.maker.role) + "</div></div></div></div>" +
      '<div class="card side-card"><ul class="meta-list">' +
      '<li><span class="k">Topic</span><span class="v">' + esc(s.category) + "</span></li>" +
      '<li><span class="k">Wants</span><span class="v">' + wantCount(s) + "</span></li>" +
      '<li><span class="k">Upvotes</span><span class="v">' + voteCount(s) + "</span></li>" +
      '<li><span class="k">Launched</span><span class="v">' + esc(dateLabel(s.daysAgo)) + "</span></li>" +
      "</ul></div></aside></div></div>";
  }

  function commentsBlock(s, cmts) {
    var items = cmts.length ? cmts.map(function (c) {
      return '<div class="comment"><span class="avatar avatar-sm ' + gp(0) + '">' + esc(c.initials || "?") + "</span>" +
        '<div class="comment-body"><span class="comment-meta"><span class="comment-author">' + esc(c.author) +
        "</span> · " + esc(dateLabel(c.daysAgo || 0)) + "</span><p>" + esc(c.text) + "</p></div></div>";
    }).join("") : '<p class="muted small">No comments yet — be the first.</p>';
    return '<div class="comments"><h3>Comments (' + cmts.length + ")</h3>" + items +
      '<form class="comment-form" id="comment-form" data-slug="' + esc(s.slug) + '">' +
      '<input id="comment-name" type="text" required maxlength="40" placeholder="Your name" aria-label="Your name" />' +
      '<textarea id="comment-text" required maxlength="400" placeholder="Share your thoughts…" aria-label="Comment"></textarea>' +
      '<div><button class="btn btn-primary btn-sm" type="submit">Post comment</button></div>' +
      '<p class="form-status" id="comment-status" role="status" aria-live="polite"></p></form></div>';
  }

  function categoryList() {
    var counts = {};
    STARTUPS.forEach(function (s) { counts[s.category] = (counts[s.category] || 0) + 1; });
    return Object.keys(counts).sort().map(function (name) { return { name: name, count: counts[name] }; });
  }

  function viewTopics() {
    var cats = categoryList();
    return '<div class="wrap page"><div class="page-head"><h1>Browse by topic</h1>' +
      '<p>Explore ' + cats.length + " categories of upcoming startups.</p></div>" +
      '<div class="cat-grid">' + cats.map(function (c) {
        return '<a class="cat" href="#/browse?cat=' + encodeURIComponent(c.name) + '" data-link>' +
          '<span class="cat-emoji" aria-hidden="true">' + emojiFor(c.name) + "</span>" +
          '<span class="cat-name">' + esc(c.name) + "</span>" +
          '<span class="cat-count">' + c.count + "</span></a>";
      }).join("") + "</div></div>";
  }

  function jobRow(j) {
    return '<a class="job-row" href="' + esc(j.url) + '" target="_blank" rel="noopener nofollow">' +
      '<span class="logo ' + gp(j.gp) + '" aria-hidden="true">' + esc(j.glyph) + "</span>" +
      '<div><div class="job-title">' + esc(j.title) + '</div><div class="job-meta"><span>' + esc(j.company) +
      "</span><span>" + esc(j.location) + "</span><span>" + esc(j.type) + "</span><span>" + esc(j.salary) + "</span></div>" +
      '<div class="job-tags">' + (j.tags || []).map(function (t) { return '<span class="tag">' + esc(t) + "</span>"; }).join("") + "</div></div>" +
      '<span class="btn btn-ghost btn-sm">Apply ↗</span></a>';
  }
  function viewJobs() {
    return '<div class="wrap page"><div class="page-head"><h1>Remote startup jobs</h1>' +
      "<p>Work at the startups launching on Launchboard. " + JOBS.length + " open roles.</p></div>" +
      '<div class="feed">' + JOBS.map(jobRow).join("") + "</div></div>";
  }

  function viewNewsletter() {
    return '<div class="wrap page narrow"><div class="news-hero">' +
      '<span class="big-emoji" aria-hidden="true">📬</span>' +
      "<h1>The Launchboard daily digest</h1>" +
      '<p class="muted">One short email each morning with the newest startups worth a look. No spam, unsubscribe anytime.</p>' +
      '<form class="news-form" id="newsletter-form">' +
      '<input id="news-email" type="email" name="email" required placeholder="you@example.com" aria-label="Email address" />' +
      '<button class="btn btn-primary" type="submit">Subscribe free</button></form>' +
      '<p class="form-status" id="news-status" role="status" aria-live="polite"></p>' +
      '<div class="news-stats"><span><strong>32,418</strong> subscribers</span><span><strong>4.9★</strong> reader rating</span><span><strong>Daily</strong> at 8am</span></div>' +
      "</div></div>";
  }

  function viewSubmit() {
    var cats = ["AI Assistant", "AI Tools", "Developer Tools", "SaaS", "Analytics", "Marketing Analytics",
      "Lead Generation", "Content Marketing", "Habit Tracking", "Image Generation", "Tracking", "Productivity"];
    return '<div class="wrap page narrow"><div class="page-head"><h1>Submit your startup</h1>' +
      "<p>Free and permanent. Your startup joins the directory and the daily digest once approved.</p></div>" +
      '<form class="form-card" id="submit-form" novalidate>' +
      '<div class="field"><label for="f-name">Startup name</label><input id="f-name" name="name" type="text" required maxlength="60" placeholder="e.g. Draftly" /></div>' +
      '<div class="field"><label for="f-url">Website URL</label><input id="f-url" name="url" type="url" required placeholder="https://yourstartup.com" /></div>' +
      '<div class="field"><label for="f-tagline">One-line pitch</label><input id="f-tagline" name="tagline" type="text" required maxlength="90" placeholder="What does it do, in one sentence?" /></div>' +
      '<div class="field"><label for="f-category">Topic</label><select id="f-category" name="category" required><option value="">Choose a topic…</option>' +
      cats.map(function (c) { return "<option>" + esc(c) + "</option>"; }).join("") + "</select></div>" +
      '<div class="field"><label for="f-email">Your email <span class="muted">(for launch updates)</span></label><input id="f-email" name="email" type="email" required placeholder="you@example.com" /></div>' +
      '<button class="btn btn-primary btn-lg btn-block" id="submit-btn" type="submit">Submit for review</button>' +
      '<p class="form-status" id="form-status" role="status" aria-live="polite"></p>' +
      '<p class="muted small">Protected by a CSRF token issued by our API. No third-party trackers.</p>' +
      "</form></div>";
  }

  function viewAdvertise() {
    return '<div class="wrap page"><div class="page-head center"><h1>Advertise on Launchboard</h1>' +
      "<p>Reach 32,000+ founders and early adopters. Free to list — pay only to stand out.</p></div>" +
      '<div class="tiers">' +
      tier("Free", "$0", "forever", ["Permanent directory listing", "Appears in the daily digest", "Topic placement", "Maker profile"], false, "Submit free", "#/submit") +
      tier("Boosted", "$29", "one-time", ["Everything in Free", "Pinned to the top for 7 days", "“Boosted” badge", "DR 73 dofollow backlink", "Priority review"], true, "Get boosted", "#/submit") +
      tier("Newsletter feature", "$99", "per send", ["Everything in Boosted", "Dedicated slot in the digest", "Sent to 32k+ subscribers", "Performance report"], false, "Book a feature", "#/support") +
      "</div></div>";
  }
  function tier(name, amount, per, items, featured, cta, href) {
    return '<article class="tier' + (featured ? " tier-featured" : "") + '">' +
      (featured ? '<div class="tier-badge">Most popular</div>' : "") +
      '<h3 class="tier-name">' + name + '</h3><p class="tier-price"><span class="amount">' + amount +
      '</span><span class="per">' + per + '</span></p><ul class="tier-list">' +
      items.map(function (i) { return "<li>" + esc(i) + "</li>"; }).join("") + "</ul>" +
      '<a class="btn ' + (featured ? "btn-primary" : "btn-ghost") + ' tier-cta" href="' + href + '" data-link>' + esc(cta) + "</a></article>";
  }

  function viewFaq() {
    var qa = [
      ["Is Launchboard free?", "Yes. Listing your startup and appearing in the daily digest is free and permanent. Paid options only add visibility."],
      ["What can I submit?", "Any upcoming or newly launched startup — SaaS, micro-SaaS, AI tools, mobile apps, developer tools and more."],
      ["When will my startup go live?", "Free submissions are reviewed within a few days. Boosted submissions get priority review and go live sooner."],
      ["What is “I want this”?", "It's a lightweight signal from visitors that they'd use your product. It helps rank trending startups and shows makers real demand."],
      ["Do you sell my email?", "Never. We use it only for digest delivery and your own submission updates. See SECURITY.md in the repo for how data is handled."]
    ];
    return '<div class="wrap page narrow"><div class="page-head"><h1>Frequently asked questions</h1></div>' +
      '<div class="faq">' + qa.map(function (x) {
        return "<details><summary>" + esc(x[0]) + "</summary><p>" + esc(x[1]) + "</p></details>";
      }).join("") + "</div></div>";
  }

  function viewSupport() {
    return '<div class="wrap page narrow"><div class="page-head"><h1>Support</h1><p>We usually reply within a day.</p></div>' +
      '<div class="support-grid">' +
      '<div class="card"><h4>📧 Email</h4><p class="muted small">Reach the team at support@launchboard.example — general questions, listing help, billing.</p></div>' +
      '<div class="card"><h4>📚 FAQ</h4><p class="muted small">Most answers live in the <a href="#/faq" data-link>FAQ</a>.</p></div>' +
      '<div class="card"><h4>🐛 Report an issue</h4><p class="muted small">Found a bug or a bad listing? Let us know and we\'ll fix it fast.</p></div>' +
      "</div></div>";
  }

  function viewBookmarks() {
    var saved = STARTUPS.filter(function (s) { return bookmarks.has(s.slug); });
    if (!saved.length) {
      return '<div class="wrap page"><div class="page-head"><h1>Saved startups</h1></div>' +
        '<div class="empty-state"><div class="big-emoji">♡</div><h3>Nothing saved yet</h3>' +
        '<p class="muted">Tap “Save” on any startup to keep it here.</p>' +
        '<p><a class="btn btn-primary" href="#/browse" data-link>Browse startups</a></p></div></div>';
    }
    return '<div class="wrap page"><div class="page-head"><h1>Saved startups</h1><p>' + saved.length + " saved.</p></div>" +
      '<div class="feed">' + saved.map(startupRow).join("") + "</div></div>";
  }

  function notFound() {
    return '<div class="wrap page"><div class="empty-state"><div class="big-emoji">🧭</div><h3>Page not found</h3>' +
      '<p><a class="btn btn-primary" href="#/" data-link>Go home</a></p></div></div>';
  }

  /* ---------------- router ---------------- */
  function parseHash() {
    var h = location.hash.replace(/^#/, "") || "/";
    var qi = h.indexOf("?");
    var path = qi >= 0 ? h.slice(0, qi) : h;
    var query = qi >= 0 ? h.slice(qi + 1) : "";
    var params = {};
    query.split("&").forEach(function (p) {
      if (!p) return; var kv = p.split("=");
      params[decodeURIComponent(kv[0])] = decodeURIComponent((kv[1] || "").replace(/\+/g, " "));
    });
    return { path: path, params: params };
  }

  function render() {
    if (!STARTUPS.length) { app.innerHTML = '<div class="wrap loading-wrap"><p class="muted">Loading…</p></div>'; return; }
    var r = parseHash();
    var html;
    if (r.path === "/" || r.path === "") html = viewHome();
    else if (r.path === "/browse") html = viewBrowse(r.params);
    else if (r.path.indexOf("/startup/") === 0) html = viewDetail(decodeURIComponent(r.path.slice("/startup/".length)));
    else if (r.path === "/topics") html = viewTopics();
    else if (r.path === "/jobs") html = viewJobs();
    else if (r.path === "/newsletter") html = viewNewsletter();
    else if (r.path === "/submit") html = viewSubmit();
    else if (r.path === "/advertise") html = viewAdvertise();
    else if (r.path === "/faq") html = viewFaq();
    else if (r.path === "/support") html = viewSupport();
    else if (r.path === "/bookmarks") html = viewBookmarks();
    else html = notFound();

    app.innerHTML = html;
    setActiveNav(r.path);
    closeMobileNav();
    if (r.path !== lastPath) { window.scrollTo(0, 0); app.focus({ preventScroll: true }); }
    lastPath = r.path;
  }
  function rerender() { var y = window.scrollY; lastPath = parseHash().path; render(); window.scrollTo(0, y); }

  function setActiveNav(path) {
    var base = "#" + (path === "/" ? "/" : "/" + (path.split("/")[1] || ""));
    Array.prototype.forEach.call(document.querySelectorAll("#nav a"), function (a) {
      var href = a.getAttribute("href");
      a.classList.toggle("is-active", href === base || (base === "#/startup" && href === "#/browse"));
    });
  }

  /* ---------------- interactions ---------------- */
  function shareStartup(el) {
    var slug = el.dataset.slug;
    var url = location.origin + location.pathname + "#/startup/" + slug;
    var done = function () { var t = el.textContent; el.textContent = "Copied ✓"; setTimeout(function () { el.textContent = t; }, 1500); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, done);
    else done();
  }
  function loadMore() {
    var r = parseHash();
    var page = (parseInt(r.params.page, 10) || 1) + 1;
    r.params.page = page;
    setHash(r);
  }
  function setBrowseTab(view) {
    var r = parseHash();
    r.params.view = view; delete r.params.page;
    setHash(r);
  }
  function applyBrowseControls() {
    var r = parseHash();
    var q = (document.getElementById("browse-q") || {}).value;
    var cat = (document.getElementById("browse-cat") || {}).value;
    if (q != null) { if (q.trim()) r.params.q = q.trim(); else delete r.params.q; }
    if (cat != null) { if (cat) r.params.cat = cat; else delete r.params.cat; }
    delete r.params.page;
    setHash(r);
  }
  function setHash(r) {
    var qs = Object.keys(r.params).map(function (k) { return encodeURIComponent(k) + "=" + encodeURIComponent(r.params[k]); }).join("&");
    location.hash = r.path + (qs ? "?" + qs : "");
  }

  function setStatus(id, msg, kind) {
    var el = document.getElementById(id); if (!el) return;
    el.textContent = msg; el.className = "form-status" + (kind ? " " + kind : "");
  }

  function postJSON(url, payload, statusId, okMsg, btn) {
    if (btn) btn.disabled = true;
    setStatus(statusId, "Sending…", "");
    return ensureCsrf().then(function () {
      return fetch(url, {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken || "" },
        body: JSON.stringify(payload)
      });
    }).then(function (r) { return r.json().then(function (b) { return { ok: r.ok, body: b }; }); })
      .then(function (res) {
        if (res.ok) setStatus(statusId, res.body.message || okMsg, "ok");
        else setStatus(statusId, (res.body && res.body.error) || "Something went wrong.", "err");
        return res.ok;
      }).catch(function () { setStatus(statusId, "Network error. Please try again.", "err"); return false; })
      .then(function (ok) { if (btn) btn.disabled = false; return ok; });
  }

  function handleSubmitStartup(f) {
    if (!f.checkValidity()) { setStatus("form-status", "Please complete every field.", "err"); f.reportValidity(); return; }
    var payload = { name: f.name.value.trim(), url: f.url.value.trim(), tagline: f.tagline.value.trim(), category: f.category.value, email: f.email.value.trim() };
    postJSON("/api/submit", payload, "form-status", "Submitted for review 🚀", document.getElementById("submit-btn")).then(function (ok) { if (ok) f.reset(); });
  }
  function handleNewsletter(f) {
    var emailEl = f.querySelector('input[type="email"]');
    var statusId = f.id === "footer-news-form" ? "footer-news-status" : "news-status";
    if (!emailEl || !emailEl.value.trim() || !f.checkValidity()) { setStatus(statusId, "Enter a valid email.", "err"); if (f.reportValidity) f.reportValidity(); return; }
    postJSON("/api/newsletter", { email: emailEl.value.trim() }, statusId, "You're subscribed 🎉", f.querySelector("button")).then(function (ok) {
      if (ok) { save("lb-news", true); f.reset(); }
    });
  }
  function handleComment(f) {
    var slug = f.dataset.slug;
    var name = document.getElementById("comment-name").value.trim();
    var text = document.getElementById("comment-text").value.trim();
    if (!name || !text) { setStatus("comment-status", "Add your name and a comment.", "err"); return; }
    var list = localComments[slug] || (localComments[slug] = []);
    list.push({ author: name, initials: name.slice(0, 2).toUpperCase(), text: text, daysAgo: 0 });
    save("lb-comments", localComments);
    rerender();
  }

  /* ---------------- global wiring (event delegation) ---------------- */
  document.addEventListener("click", function (e) {
    var actionEl = e.target.closest("[data-action]");
    if (!actionEl) return;
    var a = actionEl.dataset.action;
    if (a === "want") { e.preventDefault(); toggleSet(wants, "lb-wants", actionEl.dataset.slug); rerender(); }
    else if (a === "vote") { e.preventDefault(); toggleSet(votes, "lb-votes", actionEl.dataset.slug); rerender(); }
    else if (a === "bookmark") { e.preventDefault(); toggleSet(bookmarks, "lb-bookmarks", actionEl.dataset.slug); rerender(); }
    else if (a === "share") { e.preventDefault(); shareStartup(actionEl); }
    else if (a === "load-more") { e.preventDefault(); loadMore(); }
    else if (a === "tab-browse") { e.preventDefault(); setBrowseTab(actionEl.dataset.view); }
  });

  document.addEventListener("submit", function (e) {
    var f = e.target;
    if (f.id === "search-form") { e.preventDefault(); var q = document.getElementById("search-input").value.trim(); location.hash = "/browse" + (q ? "?q=" + encodeURIComponent(q) : ""); }
    else if (f.id === "browse-search") { e.preventDefault(); applyBrowseControls(); }
    else if (f.id === "submit-form") { e.preventDefault(); handleSubmitStartup(f); }
    else if (f.id === "newsletter-form" || f.id === "footer-news-form") { e.preventDefault(); handleNewsletter(f); }
    else if (f.id === "comment-form") { e.preventDefault(); handleComment(f); }
  });

  document.addEventListener("change", function (e) {
    if (e.target && e.target.dataset && e.target.dataset.action === "browse-control") applyBrowseControls();
  });

  /* theme toggle */
  var root = document.documentElement;
  (function () {
    var t = store("lb-theme", null);
    root.setAttribute("data-theme", t === "dark" || t === "light" ? t : "auto");
  })();
  var themeBtn = document.getElementById("theme-toggle");
  if (themeBtn) themeBtn.addEventListener("click", function () {
    var prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    var cur = root.getAttribute("data-theme");
    var isDark = cur === "dark" || (cur === "auto" && prefersDark);
    var next = isDark ? "light" : "dark";
    root.setAttribute("data-theme", next); save("lb-theme", next);
  });

  /* mobile nav */
  var navToggle = document.getElementById("nav-toggle");
  var nav = document.getElementById("nav");
  function closeMobileNav() { if (nav) { nav.classList.remove("open"); if (navToggle) navToggle.setAttribute("aria-expanded", "false"); } }
  if (navToggle && nav) navToggle.addEventListener("click", function () {
    var open = nav.classList.toggle("open"); navToggle.setAttribute("aria-expanded", open ? "true" : "false");
  });

  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  /* boot */
  window.addEventListener("hashchange", render);
  ensureCsrf();
  fetchData().then(function () {
    homeReady = true; render();
  }).catch(function () {
    app.innerHTML = '<div class="wrap page"><div class="empty-state"><div class="big-emoji">⚠️</div><h3>Could not load startups</h3><p class="muted">Please refresh.</p></div></div>';
  });
})();
