/* Launchboard SPA — BetaList + Product Hunt feature set.
 * Same-origin only: HTML/CSS/JS from /assets, data from /data/*.json, writes to
 * /api/* — so the strict CSP (default-src 'self') never has to be loosened.
 * No inline scripts, styles or handlers: behaviour is here, theming is via CSS
 * classes, everything is wired through event delegation. */
(function () {
  "use strict";

  var app = document.getElementById("app");
  var STARTUPS = [], JOBS = [], COLLECTIONS = [], DISCUSSIONS = [], PH = {}, PP = {};
  var csrfToken = null, lastPath = null;

  /* ---------------- utilities ---------------- */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function gp(n) { return "gp-" + (((n | 0) % 10) + 10) % 10; }
  function store(key, fb) { try { var v = localStorage.getItem(key); return v == null ? fb : JSON.parse(v); } catch (e) { return fb; } }
  function save(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }
  function makerId(name) { return String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }

  var wants = new Set(store("lb-wants", []));
  var votes = new Set(store("lb-votes", []));
  var bookmarks = new Set(store("lb-bookmarks", []));
  var followMakers = new Set(store("lb-follow-makers", []));
  var followTopics = new Set(store("lb-follow-topics", []));
  var discVotes = new Set(store("lb-disc-votes", []));
  var discReplies = store("lb-disc-replies", {});
  var savedCollections = new Set(store("lb-collections", []));
  var userDiscussions = store("lb-disc-new", []);
  var myReviews = store("lb-my-reviews", 0); // how many reviews this browser has posted

  /* Shared, server-persisted community data (votes, reviews, comments).
     COMMUNITY holds per-product aggregates for the whole directory; DETAIL holds
     the full rows for the product currently open. Both come from /api/community.
     Only this browser's *own* preferences stay in localStorage. */
  var COMMUNITY = { votes: {}, reviews: {}, comments: {} };
  var DETAIL = { slug: null, reviews: [], comments: [], loaded: false };
  var voterKey = (function () {
    var k = store("lb-voter", null);
    if (!k || String(k).length < 8) {
      k = "v" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      save("lb-voter", k);
    }
    return String(k);
  })();
  function daysSince(iso) { var t = Date.parse(iso); return t ? Math.max(0, Math.floor((Date.now() - t) / 86400000)) : 0; }
  function initialsOf(n) { return String(n || "?").slice(0, 2).toUpperCase(); }

  function toggleSet(set, key, id) { if (set.has(id)) set.delete(id); else set.add(id); save(key, Array.prototype.slice.call(set)); }
  function bySlug(slug) { for (var i = 0; i < STARTUPS.length; i++) if (STARTUPS[i].slug === slug) return STARTUPS[i]; return null; }
  function wantCount(s) { return s.subscribers + (COMMUNITY.votes[s.slug] || 0); }
  function voteCount(s) { return s.upvotes + (votes.has(s.slug) ? 1 : 0); }
  function points(s) { return voteCount(s) + wantCount(s); }
  function reviewCount(s) { var a = COMMUNITY.reviews[s.slug]; return (s.reviews || []).length + ((a && a.count) || 0); }
  function commentCount(s) { return (s.comments || []).length + (COMMUNITY.comments[s.slug] || 0); }
  function ratingCount(s) { var a = COMMUNITY.reviews[s.slug]; return (s.ratingCount || 0) + ((a && a.count) || 0); }
  function commentsFor(s) {
    var live = (DETAIL.slug === s.slug ? DETAIL.comments : []).map(function (c) {
      return { author: c.author, initials: initialsOf(c.author), text: c.body, daysAgo: daysSince(c.created_at) };
    });
    return (s.comments || []).concat(live);
  }
  function reviewsFor(s) {
    var live = (DETAIL.slug === s.slug ? DETAIL.reviews : []).map(function (r) {
      return { author: r.author, initials: initialsOf(r.author), rating: r.rating, pros: r.pros, cons: r.cons, body: r.body, daysAgo: daysSince(r.created_at) };
    });
    return (s.reviews || []).concat(live);
  }

  var DAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  function dateLabel(d) {
    if (d <= 0) return "Today"; if (d === 1) return "Yesterday";
    if (d <= 6) { var x = new Date(); x.setDate(x.getDate() - d); return DAY[x.getDay()]; }
    return d + " days ago";
  }
  function emojiFor(cat) {
    var m = { "AI Assistant": "🤖", "AI Tools": "✨", "Developer Tools": "🛠️", "Analytics": "📊",
      "Marketing Analytics": "📈", "Lead Generation": "🎯", "Content Marketing": "✒️", "SaaS": "☁️",
      "Habit Tracking": "🌱", "Image Generation": "🎨", "Tracking": "📍", "Productivity": "⚡" };
    return m[cat] || "🚀";
  }
  function stars(r) {
    r = Math.round(r || 0);
    var out = "";
    for (var i = 1; i <= 5; i++) out += (i <= r ? "★" : "☆");
    return '<span class="stars" aria-hidden="true">' + out + "</span>";
  }
  function medal(rank) { return rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : String(rank); }
  function fmt(n) { return String(n || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }

  /* Launch Score — composite community-engagement metric (upvotes, comments,
     reviews, rating and boost), the Launchboard equivalent of a peer score. */
  function launchScore(s) {
    return Math.round(points(s) + commentCount(s) * 12 + reviewCount(s) * 18 +
      (s.boosted ? 40 : 0) + (s.rating || 0) * 20);
  }
  function aiTier(s) {
    var r = s.aiRank || 0;
    if (!r) return "";
    if (r <= 1) return "AI Top 1%";
    if (r <= 5) return "AI Top 5%";
    if (r <= 10) return "AI Top 10%";
    if (r <= 25) return "AI Top 25%";
    return "";
  }
  function aiBadge(s) { var t = aiTier(s); return t ? '<span class="badge ai">' + t + "</span>" : ""; }
  function taxCounts(field) {
    var counts = {};
    STARTUPS.forEach(function (s) { (s[field] || []).forEach(function (v) { counts[v] = (counts[v] || 0) + 1; }); });
    return Object.keys(counts).sort().map(function (n) { return { name: n, count: counts[n] }; });
  }
  function dealProducts() { return STARTUPS.filter(function (s) { return s.deal && s.deal.code; }); }
  function awardProducts() { return STARTUPS.filter(function (s) { return !!s.award; }); }
  function totalImpressions() { return STARTUPS.reduce(function (a, s) { return a + (s.impressions || 0); }, 0); }

  /* ---------------- data ---------------- */
  function fetchJSON(u) { return fetch(u, { cache: "no-cache" }).then(function (r) { return r.json(); }); }
  function fetchData() {
    return Promise.all([
      fetchJSON("/data/startups.json"), fetchJSON("/data/jobs.json"),
      fetchJSON("/data/ph.json"), fetchJSON("/data/collections.json"), fetchJSON("/data/discussions.json"),
      fetchJSON("/data/pp.json")
    ]).then(function (res) {
      STARTUPS = res[0] || []; JOBS = res[1] || []; PH = res[2] || {}; COLLECTIONS = res[3] || []; DISCUSSIONS = res[4] || [];
      PP = res[5] || {};
      STARTUPS.forEach(function (s) {
        var x = PH[s.slug] || {}, p = PP[s.slug] || {};
        s.rating = x.rating || 0; s.ratingCount = x.ratingCount || 0; s.stack = x.stack || [];
        s.pricing = x.pricing || ""; s.award = x.award || ""; s.reviews = x.reviews || [];
        s.platforms = p.platforms || []; s.useCases = p.useCases || []; s.audiences = p.audiences || [];
        s.aiRank = p.aiRank || 0; s.impressions = p.impressions || 0; s.mrr = p.mrr || 0;
        s.deal = p.deal || null; s.updates = p.updates || [];
      });
    });
  }
  function ensureCsrf() {
    if (csrfToken) return Promise.resolve(csrfToken);
    return fetch("/api/csrf", { method: "GET", credentials: "same-origin", cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d && d.csrfToken) csrfToken = d.csrfToken; return csrfToken; })
      .catch(function () { return null; });
  }

  /* Aggregate vote/review/comment counts for the whole directory, in one call. */
  function fetchCommunity() {
    return fetch("/api/community", { credentials: "same-origin", cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d) COMMUNITY = { votes: d.votes || {}, reviews: d.reviews || {}, comments: d.comments || {} }; })
      .catch(function () {});
  }

  /* Full reviews + comments for one product, fetched when its page opens. */
  function ensureDetail(slug) {
    if (DETAIL.slug === slug && DETAIL.loaded) return;
    DETAIL = { slug: slug, reviews: [], comments: [], loaded: false };
    fetch("/api/community?slug=" + encodeURIComponent(slug), { credentials: "same-origin", cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || d.slug !== slug) return;
        DETAIL = { slug: slug, reviews: d.reviews || [], comments: d.comments || [], loaded: true };
        COMMUNITY.votes[slug] = d.votes || 0;
        if (parseHash().path === "/startup/" + slug) rerender();
      })
      .catch(function () {});
  }

  /* CSRF-protected write to the community endpoint. */
  function postCommunity(payload) {
    return ensureCsrf().then(function () {
      return fetch("/api/community", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken || "" },
        body: JSON.stringify(payload)
      });
    }).then(function (r) {
      return r.json().then(function (b) { b.httpOk = r.ok; return b; });
    }).catch(function () { return null; });
  }

  /* Upvotes are shared: post the toggle, then trust the server's count. */
  function toggleVote(slug) {
    var on = wants.has(slug);
    if (on) { wants.delete(slug); COMMUNITY.votes[slug] = Math.max(0, (COMMUNITY.votes[slug] || 0) - 1); }
    else { wants.add(slug); COMMUNITY.votes[slug] = (COMMUNITY.votes[slug] || 0) + 1; }
    save("lb-wants", Array.prototype.slice.call(wants));
    rerender();
    postCommunity({ action: "vote", slug: slug, voter: voterKey }).then(function (res) {
      if (!res || !res.ok) return;
      if (res.voted) wants.add(slug); else wants.delete(slug);
      save("lb-wants", Array.prototype.slice.call(wants));
      COMMUNITY.votes[slug] = res.votes;
      rerender();
    });
  }

  /* After a successful write, reload the shared data so everyone's view matches. */
  function afterWrite(slug) {
    DETAIL = { slug: null, reviews: [], comments: [], loaded: false };
    fetchCommunity().then(function () { ensureDetail(slug); });
  }

  /* ---------------- makers ---------------- */
  function makersList() {
    var map = {}, order = [];
    STARTUPS.forEach(function (s) {
      var id = makerId(s.maker.name);
      if (!map[id]) { map[id] = { id: id, name: s.maker.name, role: s.maker.role, initials: s.maker.initials, gp: s.gp, products: [] }; order.push(id); }
      map[id].products.push(s);
    });
    return order.map(function (k) { return map[k]; });
  }
  function makerById(id) { var l = makersList(); for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; return null; }
  function makerFollowers(m) { return 40 + m.products.reduce(function (a, s) { return a + Math.round(s.subscribers / 12); }, 0) + (followMakers.has(m.id) ? 1 : 0); }

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
      '<span class="want-label">upvote</span></button></div>';
  }
  function awardTag(s) { return s.award ? '<span class="badge award">' + esc(s.award) + "</span>" : ""; }
  function startupRow(s, rank) {
    var rankCell = rank ? '<div class="rank">' + medal(rank) + "</div>" : "";
    return '<article class="startup-row' + (rank ? " has-rank" : "") + '">' + rankCell + logoLink(s) +
      '<div class="startup-main"><div class="startup-head">' +
      '<a class="startup-name" href="#/startup/' + esc(s.slug) + '" data-link>' + esc(s.name) + "</a>" +
      (s.boosted ? '<span class="badge boosted">Boosted</span>' : "") + awardTag(s) + aiBadge(s) + "</div>" +
      '<p class="startup-tagline">' + esc(s.tagline) + "</p>" +
      '<div class="startup-meta"><span class="tag">' + esc(s.category) + "</span>" +
      (s.rating ? "<span>" + stars(s.rating) + " " + s.rating.toFixed(1) + "</span>" : "") +
      '<span class="score-pill" title="Launch Score">⚡ ' + fmt(launchScore(s)) + "</span>" +
      "<span>" + esc(dateLabel(s.daysAgo)) + "</span></div></div>" + wantButton(s) + "</article>";
  }
  function miniCard(s) {
    return '<a class="mini-card" href="#/startup/' + esc(s.slug) + '" data-link>' +
      '<div class="mini-top"><span class="logo ' + gp(s.gp) + '" aria-hidden="true">' + esc(s.glyph) + "</span>" +
      '<span class="mini-name">' + esc(s.name) + "</span>" +
      (s.boosted ? '<span class="badge boosted">Boosted</span>' : "") + "</div>" +
      "<p>" + esc(s.tagline) + "</p>" +
      '<span class="count-pill">▲ ' + wantCount(s) + " · " + stars(s.rating) + "</span></a>";
  }
  function dateGroups(list) {
    var order = [], g = {};
    list.forEach(function (s) { var l = dateLabel(s.daysAgo); if (!g[l]) { g[l] = []; order.push(l); } g[l].push(s); });
    return order.map(function (l) {
      return '<section class="date-group"><h3 class="date-label">' + esc(l) + '</h3><div class="feed">' +
        g[l].map(function (s) { return startupRow(s); }).join("") + "</div></section>";
    }).join("");
  }
  function sectionTitle(title, linkHref, linkText) {
    return '<div class="section-title"><h2>' + title + "</h2>" +
      (linkHref ? '<a href="' + linkHref + '" data-link>' + esc(linkText) + "</a>" : "") + "</div>";
  }

  /* ---------------- views ---------------- */
  var PAGE = 6;

  function viewHome() {
    var byNew = STARTUPS.slice().sort(function (a, b) { return a.daysAgo - b.daysAgo; });
    var ranked = STARTUPS.slice().sort(function (a, b) { return points(b) - points(a); });
    var trending = ranked.slice(0, 6);
    return '<section class="hero"><div class="wrap">' +
      "<h1>Discover tomorrow's <span class=\"grad\">startups</span> today</h1>" +
      "<p>Launchboard is a free directory of upcoming startups. Upvote what you love, read reviews, follow makers, and get the daily digest.</p>" +
      '<div class="hero-cta"><a class="btn btn-primary btn-lg" href="#/leaderboard" data-link>Today\'s leaderboard</a>' +
      '<a class="btn btn-ghost btn-lg" href="#/submit" data-link>Submit yours</a></div>' +
      '<ul class="trust-row"><li><strong>' + STARTUPS.length + '+</strong> startups</li>' +
      '<li><strong>32k</strong> subscribers</li><li><strong>' + makersList().length + '</strong> makers</li></ul>' +
      "</div></section>" +
      '<div class="wrap page">' + newsletterBand() +
        sectionTitle("🏆 Top of the day", "#/leaderboard", "Full leaderboard →") +
        '<div class="feed">' + ranked.slice(0, 3).map(function (s, i) { return startupRow(s, i + 1); }).join("") + "</div>" +
        sectionTitle("🔥 Trending", "#/browse?view=trending", "See all →") +
        '<div class="trending-grid">' + trending.map(miniCard).join("") + "</div>" +
        sectionTitle("🗂️ Collections", "#/collections", "Browse all →") +
        '<div class="trending-grid">' + COLLECTIONS.slice(0, 3).map(collectionCard).join("") + "</div>" +
        sectionTitle("💬 Discussions", "#/discussions", "Join in →") +
        '<div class="feed">' + DISCUSSIONS.slice(0, 3).map(discussionRow).join("") + "</div>" +
        sectionTitle("💼 Remote jobs", "#/jobs", "View all →") +
        '<div class="feed">' + JOBS.slice(0, 2).map(jobRow).join("") + "</div>" +
      "</div>";
  }
  function newsletterBand() {
    return '<div class="news-hero"><div><span class="big-emoji" aria-hidden="true">📬</span>' +
      "<h2>Get the daily digest</h2>" +
      '<p class="muted">Join 32,000+ early adopters who get the newest startups in their inbox every morning.</p>' +
      '<form class="news-form" id="newsletter-form"><input id="news-email" type="email" name="email" required placeholder="you@example.com" aria-label="Email address" />' +
      '<button class="btn btn-primary" type="submit">Subscribe</button></form>' +
      '<p class="form-status" id="news-status" role="status" aria-live="polite"></p></div></div>';
  }

  function viewLeaderboard(params) {
    var period = params.period || "day";
    var win = { day: 1, week: 7, month: 31, all: 9999 }[period] || 1;
    var list = STARTUPS.filter(function (s) { return s.daysAgo <= win; }).sort(function (a, b) { return points(b) - points(a); });
    var tabs = [["day", "Today"], ["week", "This week"], ["month", "This month"], ["all", "All-time"]].map(function (t) {
      return '<button class="tab' + (period === t[0] ? " is-active" : "") + '" data-action="tab-lead" data-period="' + t[0] + '">' + t[1] + "</button>";
    }).join("");
    var body = list.length ? '<div class="feed">' + list.map(function (s, i) { return startupRow(s, i + 1); }).join("") + "</div>"
      : '<div class="empty-state"><div class="big-emoji">🏁</div><h3>No launches in this window</h3></div>';
    return '<div class="wrap page"><div class="page-head"><h1>Leaderboard</h1><p>The most-upvoted startups, ranked. Winners earn a badge.</p></div>' +
      '<div class="tabs">' + tabs + "</div>" + body + "</div>";
  }

  function viewBrowse(params) {
    var q = (params.q || "").trim().toLowerCase(), cat = params.cat || "", view = params.view || "all";
    var platform = params.platform || "", useCase = params.useCase || "", audience = params.audience || "";
    var page = Math.max(1, parseInt(params.page, 10) || 1);
    var inList = function (arr, v) { return (arr || []).some(function (x) { return String(x).toLowerCase() === String(v).toLowerCase(); }); };
    var list = STARTUPS.filter(function (s) {
      if (cat && s.category !== cat) return false;
      if (platform && !inList(s.platforms, platform)) return false;
      if (useCase && !inList(s.useCases, useCase)) return false;
      if (audience && !inList(s.audiences, audience)) return false;
      if (view === "boosted" && !s.boosted) return false;
      if (q) {
        var h = (s.name + " " + s.tagline + " " + s.category + " " + (s.tags || []).join(" ") + " " +
          (s.useCases || []).join(" ") + " " + (s.audiences || []).join(" ") + " " + (s.platforms || []).join(" ")).toLowerCase();
        if (h.indexOf(q) === -1) return false;
      }
      return true;
    });
    var facet = platform || useCase || audience;
    if (view === "trending") list.sort(function (a, b) { return points(b) - points(a); });
    else if (view === "top") list.sort(function (a, b) { return b.rating - a.rating; });
    else list.sort(function (a, b) { return a.daysAgo - b.daysAgo; });
    var total = list.length, shown = list.slice(0, page * PAGE), cats = categoryList();
    var tabs = [["all", "Newest"], ["trending", "Trending"], ["top", "Top rated"], ["boosted", "Boosted"]].map(function (t) {
      return '<button class="tab' + (view === t[0] ? " is-active" : "") + '" data-action="tab-browse" data-view="' + t[0] + '">' + t[1] + "</button>";
    }).join("");
    var options = '<option value="">All topics</option>' + cats.map(function (c) {
      return '<option value="' + esc(c.name) + '"' + (cat === c.name ? " selected" : "") + ">" + esc(c.name) + " (" + c.count + ")</option>";
    }).join("");
    var body = !shown.length ? '<div class="empty-state"><div class="big-emoji">🔍</div><h3>No startups match</h3><p class="muted">Try a different search or topic.</p></div>'
      : (view === "all" && !q) ? dateGroups(shown) : '<div class="feed">' + shown.map(function (s) { return startupRow(s); }).join("") + "</div>";
    var more = shown.length < total ? '<div class="load-more-wrap"><button class="btn btn-ghost" data-action="load-more">Load next page… (' + shown.length + " of " + total + ")</button></div>" : "";
    return '<div class="wrap page"><div class="page-head"><h1>Browse startups</h1><p>' + total + ' startup' + (total === 1 ? "" : "s") +
      (cat ? " in " + esc(cat) : "") + (facet ? " for " + esc(facet) : "") +
      (q ? ' matching “' + esc(params.q) + "”" : "") + ".</p></div>" +
      '<div class="tabs">' + tabs + '</div><div class="toolbar">' +
      '<form class="search" id="browse-search" role="search"><span class="search-ico" aria-hidden="true">⌕</span>' +
      '<input id="browse-q" type="search" value="' + esc(params.q || "") + '" placeholder="Search startups…" aria-label="Search" /></form>' +
      '<select class="select" id="browse-cat" data-action="browse-control" aria-label="Filter by topic">' + options + "</select>" +
      "</div>" + body + more + "</div>";
  }

  function viewDetail(slug) {
    var s = bySlug(slug); if (!s) return notFound();
    ensureDetail(slug);
    var voted = votes.has(s.slug), saved = bookmarks.has(s.slug), mid = makerId(s.maker.name);
    var revs = reviewsFor(s), alts = STARTUPS.filter(function (o) { return o.category === s.category && o.slug !== s.slug; }).slice(0, 3);
    return '<div class="wrap page"><a class="back-link" href="#/browse" data-link>← Back to browse</a>' +
      '<div class="detail-head">' + logoLink(s, true) +
      '<div><div class="detail-title"><h1>' + esc(s.name) + "</h1>" +
      (s.boosted ? '<span class="badge boosted">Boosted</span>' : "") + awardTag(s) + "</div>" +
      '<p class="tagline">' + esc(s.tagline) + "</p>" +
      '<div class="rating-inline">' + stars(s.rating) + " <strong>" + (s.rating ? s.rating.toFixed(1) : "—") + "</strong> <span class=\"muted\">(" + ratingCount(s) + " reviews)</span>" +
      (s.pricing ? ' · <span class="tag">' + esc(s.pricing) + "</span>" : "") + "</div>" +
      '<div class="detail-actions">' +
      '<button class="btn btn-primary" data-action="want" data-slug="' + esc(s.slug) + '">' + (wants.has(s.slug) ? "✓ Upvoted" : "▲ Upvote") + " · " + wantCount(s) + "</button>" +
      '<button class="btn btn-ghost' + (voted ? " is-on" : "") + '" data-action="vote" data-slug="' + esc(s.slug) + '">👍 ' + voteCount(s) + "</button>" +
      '<button class="btn btn-ghost' + (saved ? " is-on" : "") + '" data-action="bookmark" data-slug="' + esc(s.slug) + '">' + (saved ? "♥ Saved" : "♡ Save") + "</button>" +
      '<a class="btn btn-ghost" href="' + esc(s.website) + '" target="_blank" rel="noopener nofollow">Visit ↗</a>' +
      '<button class="btn btn-ghost" data-action="share" data-slug="' + esc(s.slug) + '">Share</button></div></div></div>' +
      '<div class="gallery">' + (s.screenshots || []).map(function (sh) { return '<div class="shot ' + gp(sh.gp) + '"><span>' + esc(sh.label) + "</span></div>"; }).join("") + "</div>" +
      '<div class="detail-body"><div class="prose">' +
      "<h3>About " + esc(s.name) + "</h3><p>" + esc(s.description) + "</p>" +
      '<div class="chips">' + (s.tags || []).map(function (t) { return '<span class="tag">' + esc(t) + "</span>"; }).join("") + "</div>" +
      (s.deal ? '<div class="deal-banner"><div><strong>🏷️ ' + esc(s.deal.text) + "</strong>" +
        '<div class="muted small">Exclusive to Launchboard readers</div></div>' +
        '<button class="deal-code" data-action="copy-code" data-code="' + esc(s.deal.code) + '">' + esc(s.deal.code) + " · copy</button></div>" : "") +
      (s.stack.length ? '<h3>🧱 Built with</h3><div class="chips">' + s.stack.map(function (t) { return '<span class="tag alt">' + esc(t) + "</span>"; }).join("") + "</div>" : "") +
      taxoBlock(s) + updatesBlock(s) +
      reviewsBlock(s, revs) + commentsBlock(s, commentsFor(s)) +
      (alts.length ? "<h3>🔀 Alternatives to " + esc(s.name) + '</h3><div class="feed">' + alts.map(function (a) { return startupRow(a); }).join("") +
        '</div><p><a class="btn btn-ghost btn-sm" href="#/alternatives/' + esc(s.slug) + '" data-link>Full comparison table →</a></p>' : "") +
      embedBlock(s) +
      "</div><aside>" +
      '<div class="card side-card"><h4>Maker</h4><a class="maker-row" href="#/maker/' + esc(mid) + '" data-link>' +
      '<span class="avatar ' + gp(s.gp) + '">' + esc(s.maker.initials) + "</span>" +
      '<div><div class="maker-name">' + esc(s.maker.name) + '</div><div class="muted small">' + esc(s.maker.role) + "</div></div></a>" +
      '<button class="btn btn-ghost btn-sm btn-block' + (followMakers.has(mid) ? " is-on" : "") + '" data-action="follow-maker" data-id="' + esc(mid) + '">' + (followMakers.has(mid) ? "✓ Following" : "+ Follow maker") + "</button></div>" +
      '<div class="card side-card"><ul class="meta-list">' +
      '<li><span class="k">Rating</span><span class="v">' + (s.rating ? s.rating.toFixed(1) + " ★" : "—") + "</span></li>" +
      '<li><span class="k">Pricing</span><span class="v">' + esc(s.pricing || "—") + "</span></li>" +
      '<li><span class="k">Upvotes</span><span class="v">' + wantCount(s) + "</span></li>" +
      '<li><span class="k">Launch Score</span><span class="v">⚡ ' + fmt(launchScore(s)) + "</span></li>" +
      (s.aiRank ? '<li><span class="k">AI rank</span><span class="v">Top ' + s.aiRank + "%</span></li>" : "") +
      (s.impressions ? '<li><span class="k">Impressions 30d</span><span class="v">' + fmt(s.impressions) + "</span></li>" : "") +
      (s.mrr ? '<li><span class="k">MRR <span class="muted">(public)</span></span><span class="v">$' + fmt(s.mrr) + "</span></li>" : "") +
      '<li><span class="k">Topic</span><span class="v">' + esc(s.category) + "</span></li>" +
      '<li><span class="k">Launched</span><span class="v">' + esc(dateLabel(s.daysAgo)) + "</span></li></ul>" +
      '<button class="btn btn-ghost btn-sm btn-block' + (followTopics.has(s.category) ? " is-on" : "") + '" data-action="follow-topic" data-cat="' + esc(s.category) + '">' + (followTopics.has(s.category) ? "✓ Following topic" : "+ Follow " + esc(s.category)) + "</button></div>" +
      "</aside></div></div>";
  }

  function taxoBlock(s) {
    var row = function (label, arr, param) {
      if (!arr || !arr.length) return "";
      return '<div class="taxo-row"><span class="taxo-label">' + label + '</span><span class="chips">' +
        arr.map(function (v) { return '<a class="tag alt" href="#/browse?' + param + "=" + encodeURIComponent(v) + '" data-link>' + esc(v) + "</a>"; }).join("") + "</span></div>";
    };
    var out = row("Platforms", s.platforms, "platform") + row("Use cases", s.useCases, "useCase") + row("Audiences", s.audiences, "audience");
    return out ? "<h3>🧭 Where it fits</h3>" + out : "";
  }
  function updatesBlock(s) {
    if (!s.updates || !s.updates.length) return "";
    return "<h3>📣 Product updates (" + s.updates.length + ")</h3>" + s.updates.map(function (u) {
      return '<div class="update"><div class="update-head"><strong>' + esc(u.title) + '</strong><span class="muted small">' +
        esc(dateLabel(u.daysAgo || 0)) + "</span></div><p>" + esc(u.body) + "</p></div>";
    }).join("");
  }
  function embedSnippet(s) {
    var o = location.origin;
    return '<a href="' + o + "/#/startup/" + s.slug + '"><img src="' + o +
      '/assets/logo.svg" width="20" height="20" alt=""> Featured on Launchboard</a>';
  }
  function embedBlock(s) {
    return '<h3>🔖 Embed your badge</h3><p class="muted small">Show visitors you are listed — paste this anywhere on your site.</p>' +
      '<pre class="code">' + esc(embedSnippet(s)) + "</pre>" +
      '<button class="btn btn-ghost btn-sm" data-action="copy-embed" data-slug="' + esc(s.slug) + '">Copy embed code</button>';
  }

  function reviewsBlock(s, revs) {
    var items = revs.length ? revs.map(function (r) {
      return '<div class="review"><div class="review-head"><span class="avatar avatar-sm ' + gp(2) + '">' + esc(r.initials || "?") + "</span>" +
        '<div><div class="comment-author">' + esc(r.author) + "</div><div class=\"review-stars\">" + stars(r.rating) + '<span class="muted small"> · ' + esc(dateLabel(r.daysAgo || 0)) + "</span></div></div></div>" +
        (r.pros ? '<p class="pro">👍 ' + esc(r.pros) + "</p>" : "") + (r.cons ? '<p class="con">👎 ' + esc(r.cons) + "</p>" : "") +
        (r.body ? "<p>" + esc(r.body) + "</p>" : "") + "</div>";
    }).join("") : '<p class="muted small">No reviews yet — be the first.</p>';
    return '<h3>⭐ Reviews (' + revs.length + ")</h3>" + items +
      '<form class="review-form" id="review-form" data-slug="' + esc(s.slug) + '">' +
      '<div class="field"><label for="rv-rating">Your rating</label><select id="rv-rating" class="select"><option value="5">★★★★★ Love it</option><option value="4">★★★★ Great</option><option value="3">★★★ Good</option><option value="2">★★ Meh</option><option value="1">★ Nope</option></select></div>' +
      '<div class="field"><label for="rv-name">Your name</label><input id="rv-name" type="text" required maxlength="40" placeholder="Your name" /></div>' +
      '<div class="two-col"><div class="field"><label for="rv-pros">Pros</label><input id="rv-pros" type="text" maxlength="80" placeholder="What you love" /></div>' +
      '<div class="field"><label for="rv-cons">Cons</label><input id="rv-cons" type="text" maxlength="80" placeholder="What could be better" /></div></div>' +
      '<div class="field"><label for="rv-body">Review</label><textarea id="rv-body" maxlength="400" placeholder="Share your experience…"></textarea></div>' +
      '<div><button class="btn btn-primary btn-sm" type="submit">Post review</button></div>' +
      '<p class="form-status" id="review-status" role="status" aria-live="polite"></p></form>';
  }
  function commentsBlock(s, cmts) {
    var items = cmts.length ? cmts.map(function (c) {
      return '<div class="comment"><span class="avatar avatar-sm ' + gp(0) + '">' + esc(c.initials || "?") + "</span>" +
        '<div class="comment-body"><span class="comment-meta"><span class="comment-author">' + esc(c.author) + "</span> · " + esc(dateLabel(c.daysAgo || 0)) + "</span><p>" + esc(c.text) + "</p></div></div>";
    }).join("") : '<p class="muted small">No comments yet.</p>';
    return '<h3>💬 Discussion (' + cmts.length + ")</h3>" + items +
      '<form class="comment-form" id="comment-form" data-slug="' + esc(s.slug) + '">' +
      '<input id="comment-name" type="text" required maxlength="40" placeholder="Your name" aria-label="Your name" />' +
      '<textarea id="comment-text" required maxlength="400" placeholder="Join the discussion…" aria-label="Comment"></textarea>' +
      '<div><button class="btn btn-primary btn-sm" type="submit">Post comment</button></div>' +
      '<p class="form-status" id="comment-status" role="status" aria-live="polite"></p></form>';
  }

  function categoryList() {
    var counts = {}; STARTUPS.forEach(function (s) { counts[s.category] = (counts[s.category] || 0) + 1; });
    return Object.keys(counts).sort().map(function (n) { return { name: n, count: counts[n] }; });
  }
  function viewTopics() {
    var cats = categoryList();
    return '<div class="wrap page"><div class="page-head"><h1>Browse by topic</h1><p>Explore ' + cats.length + " categories. Follow the ones you care about.</p></div>" +
      '<div class="cat-grid">' + cats.map(function (c) {
        return '<div class="cat"><a class="cat-link" href="#/browse?cat=' + encodeURIComponent(c.name) + '" data-link><span class="cat-emoji" aria-hidden="true">' + emojiFor(c.name) + "</span>" +
          '<span class="cat-name">' + esc(c.name) + "</span></a><span class=\"cat-count\">" + c.count + "</span>" +
          '<button class="follow-dot' + (followTopics.has(c.name) ? " is-on" : "") + '" data-action="follow-topic" data-cat="' + esc(c.name) + '" title="Follow" aria-label="Follow ' + esc(c.name) + '">' + (followTopics.has(c.name) ? "✓" : "+") + "</button></div>";
      }).join("") + "</div></div>";
  }

  function collectionCard(c) {
    return '<a class="mini-card" href="#/collection/' + esc(c.slug) + '" data-link>' +
      '<div class="mini-top"><span class="logo ' + gp(c.gp) + '" aria-hidden="true">' + esc(c.emoji) + "</span>" +
      '<span class="mini-name">' + esc(c.title) + "</span></div><p>" + esc(c.description) + "</p>" +
      '<span class="count-pill">' + c.products.length + " products · by " + esc(c.curator) + "</span></a>";
  }
  function viewCollections() {
    return '<div class="wrap page"><div class="page-head"><h1>Collections</h1><p>Hand-picked sets of products, curated by the community.</p></div>' +
      '<div class="trending-grid">' + COLLECTIONS.map(collectionCard).join("") + "</div></div>";
  }
  function viewCollectionDetail(slug) {
    var c = null; for (var i = 0; i < COLLECTIONS.length; i++) if (COLLECTIONS[i].slug === slug) c = COLLECTIONS[i];
    if (!c) return notFound();
    var prods = c.products.map(bySlug).filter(Boolean), on = savedCollections.has(c.slug);
    return '<div class="wrap page"><a class="back-link" href="#/collections" data-link>← All collections</a>' +
      '<div class="detail-head"><span class="logo logo-lg ' + gp(c.gp) + '" aria-hidden="true">' + esc(c.emoji) + "</span>" +
      '<div><h1>' + esc(c.title) + "</h1><p class=\"tagline\">" + esc(c.description) + "</p>" +
      '<div class="detail-actions"><span class="muted small">' + prods.length + " products · curated by " + esc(c.curator) + "</span>" +
      '<button class="btn btn-ghost btn-sm' + (on ? " is-on" : "") + '" data-action="save-collection" data-slug="' + esc(c.slug) + '">' + (on ? "✓ Saved" : "♡ Save collection") + "</button></div></div></div>" +
      '<div class="feed">' + prods.map(function (s) { return startupRow(s); }).join("") + "</div></div>";
  }

  function makerCard(m) {
    var on = followMakers.has(m.id);
    return '<div class="maker-card"><a class="maker-row" href="#/maker/' + esc(m.id) + '" data-link>' +
      '<span class="avatar ' + gp(m.gp) + '">' + esc(m.initials) + "</span>" +
      '<div><div class="maker-name">' + esc(m.name) + '</div><div class="muted small">' + esc(m.role) + " · " + m.products.length + " product" + (m.products.length === 1 ? "" : "s") + "</div></div></a>" +
      '<button class="btn btn-ghost btn-sm' + (on ? " is-on" : "") + '" data-action="follow-maker" data-id="' + esc(m.id) + '">' + (on ? "✓ Following" : "+ Follow") + "</button></div>";
  }
  function viewMakers() {
    var ms = makersList().sort(function (a, b) { return makerFollowers(b) - makerFollowers(a); });
    return '<div class="wrap page"><div class="page-head"><h1>Makers</h1><p>The founders and builders behind the launches. Follow the ones you admire.</p></div>' +
      '<div class="makers-grid">' + ms.map(makerCard).join("") + "</div></div>";
  }
  function viewMakerProfile(id) {
    var m = makerById(id); if (!m) return notFound();
    var on = followMakers.has(m.id);
    return '<div class="wrap page"><a class="back-link" href="#/makers" data-link>← All makers</a>' +
      '<div class="detail-head"><span class="avatar avatar-xl ' + gp(m.gp) + '">' + esc(m.initials) + "</span>" +
      '<div><h1>' + esc(m.name) + '</h1><p class="tagline">' + esc(m.role) + "</p>" +
      '<div class="detail-actions"><span class="count-pill">' + makerFollowers(m) + " followers</span>" +
      '<button class="btn btn-primary btn-sm" data-action="follow-maker" data-id="' + esc(m.id) + '">' + (on ? "✓ Following" : "+ Follow") + "</button></div></div></div>" +
      "<h3>Launches by " + esc(m.name) + '</h3><div class="feed">' + m.products.map(function (s) { return startupRow(s); }).join("") + "</div></div>";
  }

  function allDiscussions() { return userDiscussions.concat(DISCUSSIONS); }
  function discById(id) { var all = allDiscussions(); for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i]; return null; }
  function discUpvotes(d) { return (d.upvotes || 0) + (discVotes.has(d.id) ? 1 : 0); }
  function discReplyList(d) { return (d.replies || []).concat(discReplies[d.id] || []); }
  function discussionRow(d) {
    var on = discVotes.has(d.id);
    return '<article class="disc-row"><button class="want-btn' + (on ? " is-on" : "") + '" type="button" data-action="disc-vote" data-id="' + esc(d.id) + '">' +
      '<span class="want-ico" aria-hidden="true">▲</span><span class="want-num">' + discUpvotes(d) + "</span></button>" +
      '<div class="disc-main"><a class="startup-name" href="#/discussion/' + esc(d.id) + '" data-link>' + esc(d.title) + "</a>" +
      '<div class="startup-meta"><span class="tag">' + esc(d.category) + "</span><span>by " + esc(d.author) + "</span><span>" + esc(dateLabel(d.daysAgo)) + "</span><span>💬 " + discReplyList(d).length + "</span></div></div></article>";
  }
  function viewDiscussions() {
    return '<div class="wrap page"><div class="page-head"><h1>Discussions</h1><p>Ask questions, share wins, and talk shop with other makers.</p></div>' +
      '<form class="form-card" id="discussion-form"><div class="field"><label for="dc-title">Start a discussion</label><input id="dc-title" type="text" required maxlength="90" placeholder="Ask the community something…" /></div>' +
      '<div class="field"><label for="dc-body">Details</label><textarea id="dc-body" required maxlength="500" placeholder="Add context…"></textarea></div>' +
      '<div class="two-col"><div class="field"><label for="dc-name">Your name</label><input id="dc-name" type="text" required maxlength="40" placeholder="Your name" /></div>' +
      '<div class="field"><label for="dc-cat">Topic</label><input id="dc-cat" type="text" maxlength="30" placeholder="e.g. Growth" /></div></div>' +
      '<div><button class="btn btn-primary btn-sm" type="submit">Post discussion</button></div>' +
      '<p class="form-status" id="discussion-status" role="status" aria-live="polite"></p></form>' +
      '<div class="feed">' + allDiscussions().map(discussionRow).join("") + "</div></div>";
  }
  function viewDiscussionDetail(id) {
    var d = discById(id); if (!d) return notFound();
    var reps = discReplyList(d), on = discVotes.has(d.id);
    return '<div class="wrap page narrow"><a class="back-link" href="#/discussions" data-link>← All discussions</a>' +
      '<div class="disc-detail-head"><button class="want-btn' + (on ? " is-on" : "") + '" type="button" data-action="disc-vote" data-id="' + esc(d.id) + '"><span class="want-ico" aria-hidden="true">▲</span><span class="want-num">' + discUpvotes(d) + "</span></button>" +
      '<div><h1>' + esc(d.title) + '</h1><div class="startup-meta"><span class="tag">' + esc(d.category) + "</span><span>by " + esc(d.author) + "</span><span>" + esc(dateLabel(d.daysAgo)) + "</span></div></div></div>" +
      '<p class="prose">' + esc(d.body) + "</p>" +
      '<h3>' + reps.length + " repl" + (reps.length === 1 ? "y" : "ies") + "</h3>" +
      reps.map(function (r) {
        return '<div class="comment"><span class="avatar avatar-sm ' + gp(r.gp || 3) + '">' + esc(r.initials || "?") + "</span>" +
          '<div class="comment-body"><span class="comment-meta"><span class="comment-author">' + esc(r.author) + "</span> · " + esc(dateLabel(r.daysAgo || 0)) + "</span><p>" + esc(r.body) + "</p></div></div>";
      }).join("") +
      '<form class="comment-form" id="reply-form" data-id="' + esc(d.id) + '"><input id="reply-name" type="text" required maxlength="40" placeholder="Your name" />' +
      '<textarea id="reply-body" required maxlength="400" placeholder="Add a reply…"></textarea>' +
      '<div><button class="btn btn-primary btn-sm" type="submit">Reply</button></div>' +
      '<p class="form-status" id="reply-status" role="status" aria-live="polite"></p></form></div>';
  }

  function viewFollowing() {
    var makers = makersList().filter(function (m) { return followMakers.has(m.id); });
    var prods = STARTUPS.filter(function (s) { return followTopics.has(s.category); }).sort(function (a, b) { return a.daysAgo - b.daysAgo; });
    if (!makers.length && !followTopics.size) {
      return '<div class="wrap page"><div class="page-head"><h1>Following</h1></div><div class="empty-state"><div class="big-emoji">🧲</div><h3>You\'re not following anything yet</h3><p class="muted">Follow makers and topics to build your feed.</p><p><a class="btn btn-primary" href="#/makers" data-link>Find makers</a> <a class="btn btn-ghost" href="#/topics" data-link>Browse topics</a></p></div></div>';
    }
    var out = '<div class="wrap page"><div class="page-head"><h1>Following</h1><p>Fresh launches from the makers and topics you follow.</p></div>';
    if (makers.length) out += sectionTitle("Makers you follow", "#/makers", "Manage →") + '<div class="makers-grid">' + makers.map(makerCard).join("") + "</div>";
    if (prods.length) out += sectionTitle("From your topics", "#/topics", "Manage →") + '<div class="feed">' + prods.slice(0, 8).map(function (s) { return startupRow(s); }).join("") + "</div>";
    return out + "</div>";
  }

  function viewProfile() {
    var bm = STARTUPS.filter(function (s) { return bookmarks.has(s.slug); });
    var myRevCount = myReviews;
    var stat = function (n, l) { return '<div class="stat"><div class="stat-n">' + n + '</div><div class="stat-l">' + l + "</div></div>"; };
    return '<div class="wrap page"><div class="page-head"><h1>Your activity</h1><p>Everything you\'ve done on Launchboard, saved in this browser.</p></div>' +
      '<div class="stat-row">' + stat(wants.size, "Upvotes") + stat(bookmarks.size, "Saved") + stat(myRevCount, "Reviews") +
      stat(followMakers.size, "Makers") + stat(followTopics.size, "Topics") + "</div>" +
      (bm.length ? sectionTitle("♥ Saved startups", "#/bookmarks", "View all →") + '<div class="feed">' + bm.slice(0, 5).map(function (s) { return startupRow(s); }).join("") + "</div>" :
        '<div class="empty-state"><div class="big-emoji">👋</div><h3>Start exploring</h3><p class="muted">Upvote, review and save startups — it all shows up here.</p><p><a class="btn btn-primary" href="#/leaderboard" data-link>See the leaderboard</a></p></div>') +
      "</div>";
  }

  function jobRow(j) {
    return '<a class="job-row" href="' + esc(j.url) + '" target="_blank" rel="noopener nofollow"><span class="logo ' + gp(j.gp) + '" aria-hidden="true">' + esc(j.glyph) + "</span>" +
      '<div><div class="job-title">' + esc(j.title) + '</div><div class="job-meta"><span>' + esc(j.company) + "</span><span>" + esc(j.location) + "</span><span>" + esc(j.type) + "</span><span>" + esc(j.salary) + "</span></div>" +
      '<div class="job-tags">' + (j.tags || []).map(function (t) { return '<span class="tag">' + esc(t) + "</span>"; }).join("") + "</div></div><span class=\"btn btn-ghost btn-sm\">Apply ↗</span></a>";
  }
  function viewJobs() {
    return '<div class="wrap page"><div class="page-head"><h1>Remote startup jobs</h1><p>Work at the startups launching on Launchboard. ' + JOBS.length + " open roles.</p></div><div class=\"feed\">" + JOBS.map(jobRow).join("") + "</div></div>";
  }
  function viewNewsletter() {
    return '<div class="wrap page narrow"><div class="news-hero"><span class="big-emoji" aria-hidden="true">📬</span><h1>The Launchboard daily digest</h1>' +
      '<p class="muted">One short email each morning with the newest startups worth a look. No spam, unsubscribe anytime.</p>' +
      '<form class="news-form" id="newsletter-form"><input id="news-email" type="email" name="email" required placeholder="you@example.com" aria-label="Email address" /><button class="btn btn-primary" type="submit">Subscribe free</button></form>' +
      '<p class="form-status" id="news-status" role="status" aria-live="polite"></p>' +
      '<div class="news-stats"><span><strong>32,418</strong> subscribers</span><span><strong>4.9★</strong> rating</span><span><strong>Daily</strong> at 8am</span></div></div></div>';
  }
  function viewSubmit() {
    var cats = ["AI Assistant", "AI Tools", "Developer Tools", "SaaS", "Analytics", "Marketing Analytics", "Lead Generation", "Content Marketing", "Habit Tracking", "Image Generation", "Tracking", "Productivity"];
    return '<div class="wrap page narrow"><div class="page-head"><h1>Submit your startup</h1><p>Free and permanent. Your startup joins the directory and the daily digest once approved.</p></div>' +
      '<form class="form-card" id="submit-form" novalidate>' +
      '<div class="field"><label for="f-name">Startup name</label><input id="f-name" name="name" type="text" required maxlength="60" placeholder="e.g. Draftly" /></div>' +
      '<div class="field"><label for="f-url">Website URL</label><input id="f-url" name="url" type="url" required placeholder="https://yourstartup.com" /></div>' +
      '<div class="field"><label for="f-tagline">One-line pitch</label><input id="f-tagline" name="tagline" type="text" required maxlength="90" placeholder="What does it do, in one sentence?" /></div>' +
      '<div class="field"><label for="f-category">Topic</label><select id="f-category" name="category" required><option value="">Choose a topic…</option>' + cats.map(function (c) { return "<option>" + esc(c) + "</option>"; }).join("") + "</select></div>" +
      '<div class="field"><label for="f-email">Your email <span class="muted">(for launch updates)</span></label><input id="f-email" name="email" type="email" required placeholder="you@example.com" /></div>' +
      '<button class="btn btn-primary btn-lg btn-block" id="submit-btn" type="submit">Submit for review</button>' +
      '<p class="form-status" id="form-status" role="status" aria-live="polite"></p>' +
      '<p class="muted small">Protected by a CSRF token issued by our API. No third-party trackers.</p></form></div>';
  }
  function viewAdvertise() {
    return '<div class="wrap page"><div class="page-head center"><h1>Advertise on Launchboard</h1><p>Reach founders, early adopters and the AI assistants that recommend tools. Free to list — pay only to move faster.</p></div><div class="tiers four">' +
      tier("Free", "$0", "forever", ["Permanent directory listing", "Enters the publishing queue", "Topic + use-case placement", "Included in the public API"], false, "Submit free", "#/submit") +
      tier("Basic", "$39", "one-time", ["Skip the queue — publish instantly", "Permanent listing link", "Dofollow backlink", "Product updates feed"], false, "Publish now", "#/submit") +
      tier("Boosted", "$89", "7 days", ["Everything in Basic", "Pinned across the site for 7 days", "“Boosted” badge", "20,000+ impressions"], true, "Get boosted", "#/submit") +
      tier("Max-Boosted", "$229", "30 days", ["Everything in Boosted", "Top placement for 30 days", "100,000+ impressions", "Newsletter feature + report"], false, "Go max", "#/support") + "</div></div>";
  }
  function tier(name, amount, per, items, featured, cta, href) {
    return '<article class="tier' + (featured ? " tier-featured" : "") + '">' + (featured ? '<div class="tier-badge">Most popular</div>' : "") +
      '<h3 class="tier-name">' + name + '</h3><p class="tier-price"><span class="amount">' + amount + '</span><span class="per">' + per + '</span></p><ul class="tier-list">' +
      items.map(function (i) { return "<li>" + esc(i) + "</li>"; }).join("") + "</ul>" +
      '<a class="btn ' + (featured ? "btn-primary" : "btn-ghost") + ' tier-cta" href="' + href + '" data-link>' + esc(cta) + "</a></article>";
  }
  function viewFaq() {
    var qa = [
      ["Is Launchboard free?", "Yes. Listing your startup and appearing in the daily digest is free and permanent. Paid options only add visibility."],
      ["What can I submit?", "Any upcoming or newly launched startup — SaaS, micro-SaaS, AI tools, mobile apps, developer tools and more."],
      ["How does the leaderboard work?", "Products are ranked by upvotes over each period (day, week, month). The daily winners earn a badge on their profile."],
      ["What are reviews and ratings?", "Anyone can leave a star rating with pros and cons. Ratings power the “Top rated” sort and show real signal to other founders."],
      ["Do you sell my email?", "Never. We use it only for digest delivery and your own submission updates. See SECURITY.md in the repo for how data is handled."]
    ];
    return '<div class="wrap page narrow"><div class="page-head"><h1>Frequently asked questions</h1></div><div class="faq">' +
      qa.map(function (x) { return "<details><summary>" + esc(x[0]) + "</summary><p>" + esc(x[1]) + "</p></details>"; }).join("") + "</div></div>";
  }
  function viewSupport() {
    return '<div class="wrap page narrow"><div class="page-head"><h1>Support</h1><p>We usually reply within a day.</p></div><div class="support-grid">' +
      '<div class="card"><h4>📧 Email</h4><p class="muted small">support@launchboard.example — general questions, listing help, billing.</p></div>' +
      '<div class="card"><h4>📚 FAQ</h4><p class="muted small">Most answers live in the <a href="#/faq" data-link>FAQ</a>.</p></div>' +
      '<div class="card"><h4>🐛 Report an issue</h4><p class="muted small">Found a bug or a bad listing? Let us know and we\'ll fix it fast.</p></div></div></div>';
  }
  function viewBookmarks() {
    var saved = STARTUPS.filter(function (s) { return bookmarks.has(s.slug); });
    if (!saved.length) return '<div class="wrap page"><div class="page-head"><h1>Saved startups</h1></div><div class="empty-state"><div class="big-emoji">♡</div><h3>Nothing saved yet</h3><p class="muted">Tap “Save” on any startup to keep it here.</p><p><a class="btn btn-primary" href="#/browse" data-link>Browse startups</a></p></div></div>';
    return '<div class="wrap page"><div class="page-head"><h1>Saved startups</h1><p>' + saved.length + " saved.</p></div><div class=\"feed\">" + saved.map(function (s) { return startupRow(s); }).join("") + "</div></div>";
  }
  function notFound() { return '<div class="wrap page"><div class="empty-state"><div class="big-emoji">🧭</div><h3>Page not found</h3><p><a class="btn btn-primary" href="#/" data-link>Go home</a></p></div></div>'; }

  /* ---------------- discovery: taxonomies, comparisons, signals ---------------- */
  function viewDiscover() {
    var cards = [
      ["🗂️", "Collections", "Curated sets of products", "#/collections"],
      ["🧩", "Categories", "Browse by topic", "#/topics"],
      ["💻", "Platforms", "Web, iOS, Android, MCP…", "#/platforms"],
      ["🎯", "Use cases", "What people use them for", "#/use-cases"],
      ["👥", "Audiences", "Who they are built for", "#/audiences"],
      ["🔀", "Alternatives", "Compare similar products", "#/alternatives"],
      ["⭐", "Top rated", "Highest community ratings", "#/top-rated"],
      ["🏛️", "Hall of Fame", "Award winners", "#/hall-of-fame"],
      ["🏷️", "Deals", "Active discount codes", "#/deals"],
      ["📡", "Outrank", "Impressions across AI systems", "#/outrank"],
      ["🧑‍🚀", "Makers", "The people behind the launches", "#/makers"],
      ["🔌", "Integrate", "API, llms.txt and AI agents", "#/integrate"]
    ];
    return '<div class="wrap page"><div class="page-head"><h1>Discover</h1><p>Every way to explore the directory.</p></div>' +
      '<div class="trending-grid">' + cards.map(function (c, i) {
        return '<a class="mini-card" href="' + c[3] + '" data-link><div class="mini-top">' +
          '<span class="logo ' + gp(i) + '" aria-hidden="true">' + c[0] + "</span>" +
          '<span class="mini-name">' + esc(c[1]) + "</span></div><p>" + esc(c[2]) + "</p></a>";
      }).join("") + "</div></div>";
  }

  function viewTaxonomy(title, subtitle, field, param, emoji) {
    var items = taxCounts(field);
    return '<div class="wrap page"><div class="page-head"><h1>' + esc(title) + "</h1><p>" + esc(subtitle) + "</p></div>" +
      '<div class="cat-grid">' + items.map(function (c) {
        return '<a class="cat" href="#/browse?' + param + "=" + encodeURIComponent(c.name) + '" data-link>' +
          '<span class="cat-emoji" aria-hidden="true">' + emoji + "</span>" +
          '<span class="cat-name">' + esc(c.name) + '</span><span class="cat-count">' + c.count + "</span></a>";
      }).join("") + "</div></div>";
  }

  function peersOf(s) { return STARTUPS.filter(function (o) { return o.category === s.category && o.slug !== s.slug; }); }
  function viewAlternatives() {
    var list = STARTUPS.filter(function (s) { return peersOf(s).length; });
    return '<div class="wrap page"><div class="page-head"><h1>🔀 Alternatives</h1><p>Side-by-side comparisons of products that solve the same problem.</p></div>' +
      '<div class="feed">' + list.map(function (s) {
        var n = peersOf(s).length;
        return '<a class="job-row" href="#/alternatives/' + esc(s.slug) + '" data-link>' +
          '<span class="logo ' + gp(s.gp) + '" aria-hidden="true">' + esc(s.glyph) + "</span>" +
          '<div><div class="job-title">Alternatives to ' + esc(s.name) + "</div>" +
          '<div class="job-meta"><span>' + esc(s.category) + "</span><span>" + n + " comparable product" + (n === 1 ? "" : "s") + "</span></div></div>" +
          '<span class="btn btn-ghost btn-sm">Compare →</span></a>';
      }).join("") + "</div></div>";
  }
  function viewAlternativeDetail(slug) {
    var s = bySlug(slug); if (!s) return notFound();
    var peers = peersOf(s), rows = [s].concat(peers);
    return '<div class="wrap page"><a class="back-link" href="#/alternatives" data-link>← All comparisons</a>' +
      '<div class="page-head"><h1>Best alternatives to ' + esc(s.name) + "</h1><p>" + peers.length +
      " product" + (peers.length === 1 ? "" : "s") + " in " + esc(s.category) + ", compared on rating, pricing and Launch Score.</p></div>" +
      '<div class="table-wrap"><table class="cmp"><thead><tr><th>Product</th><th>Rating</th><th>Pricing</th><th>Upvotes</th><th>Score</th><th>AI rank</th></tr></thead><tbody>' +
      rows.map(function (o) {
        return "<tr" + (o.slug === s.slug ? ' class="is-self"' : "") + '><td><a href="#/startup/' + esc(o.slug) + '" data-link>' +
          '<span class="cmp-glyph" aria-hidden="true">' + esc(o.glyph) + "</span> " + esc(o.name) + "</a></td>" +
          "<td>" + (o.rating ? o.rating.toFixed(1) + " ★" : "—") + "</td><td>" + esc(o.pricing || "—") + "</td>" +
          "<td>" + fmt(wantCount(o)) + "</td><td>" + fmt(launchScore(o)) + "</td>" +
          "<td>" + (o.aiRank ? "Top " + o.aiRank + "%" : "—") + "</td></tr>";
      }).join("") + "</tbody></table></div></div>";
  }

  function viewTopRated() {
    var list = STARTUPS.filter(function (s) { return s.rating; }).sort(function (a, b) { return b.rating - a.rating; });
    return '<div class="wrap page"><div class="page-head"><h1>⭐ Top rated</h1><p>The highest-rated products, by community reviews.</p></div>' +
      '<div class="feed">' + list.map(function (s, i) { return startupRow(s, i + 1); }).join("") + "</div></div>";
  }
  function viewHallOfFame() {
    var list = awardProducts().sort(function (a, b) { return launchScore(b) - launchScore(a); });
    return '<div class="wrap page"><div class="page-head center"><h1>🏛️ Hall of Fame</h1><p>Every product that has won a Launchboard award.</p></div>' +
      (list.length ? '<div class="feed">' + list.map(function (s) { return startupRow(s); }).join("") + "</div>"
        : '<div class="empty-state"><div class="big-emoji">🏛️</div><h3>No winners yet</h3></div>') + "</div>";
  }
  function viewDeals() {
    var list = dealProducts();
    return '<div class="wrap page"><div class="page-head"><h1>🏷️ Deals</h1><p>Active discount codes from products in the directory.</p></div>' +
      (list.length ? '<div class="trending-grid">' + list.map(function (s) {
        return '<div class="deal-card"><div class="mini-top"><span class="logo ' + gp(s.gp) + '" aria-hidden="true">' + esc(s.glyph) + "</span>" +
          '<a class="mini-name" href="#/startup/' + esc(s.slug) + '" data-link>' + esc(s.name) + "</a></div>" +
          '<p class="deal-text">' + esc(s.deal.text) + "</p>" +
          '<button class="deal-code" data-action="copy-code" data-code="' + esc(s.deal.code) + '">' + esc(s.deal.code) + " · copy</button></div>";
      }).join("") + "</div>" : '<div class="empty-state"><div class="big-emoji">🏷️</div><h3>No active deals</h3></div>') + "</div>";
  }

  function viewSignals() {
    var ranked = STARTUPS.filter(function (s) { return s.aiRank; }).sort(function (a, b) { return a.aiRank - b.aiRank; });
    var stat = function (n, l) { return '<div class="stat"><div class="stat-n">' + n + '</div><div class="stat-l">' + l + "</div></div>"; };
    return '<div class="wrap page"><div class="page-head"><h1>📡 Signals</h1><p>Discovery intelligence — how visible these products are to people and to AI assistants.</p></div>' +
      '<div class="stat-row">' + stat(fmt(totalImpressions()), "Impressions 30d") + stat(STARTUPS.length, "Products indexed") +
      stat(ranked.filter(function (s) { return s.aiRank <= 5; }).length, "In AI top 5%") + stat("36", "AI systems") + stat("163", "Countries") + "</div>" +
      sectionTitle("AI visibility ranking", "#/outrank", "Impression board →") +
      '<div class="feed">' + ranked.map(function (s) {
        return '<article class="startup-row">' + logoLink(s) + '<div class="startup-main"><div class="startup-head">' +
          '<a class="startup-name" href="#/startup/' + esc(s.slug) + '" data-link>' + esc(s.name) + "</a>" + aiBadge(s) + "</div>" +
          '<p class="startup-tagline">' + esc(s.tagline) + "</p>" +
          '<div class="startup-meta"><span class="tag">' + esc(s.category) + "</span><span>" + fmt(s.impressions) + " impressions</span></div></div>" +
          '<div class="startup-side"><div class="score-box"><div class="score-n">Top ' + s.aiRank + '%</div><div class="score-l">AI rank</div></div></div></article>';
      }).join("") + "</div></div>";
  }
  function viewOutrank() {
    var list = STARTUPS.slice().sort(function (a, b) { return (b.impressions || 0) - (a.impressions || 0); });
    var max = list.length ? (list[0].impressions || 1) : 1;
    return '<div class="wrap page"><div class="page-head"><h1>📡 Outrank</h1><p>' + fmt(totalImpressions()) +
      " impressions across AI systems in the last 30 days.</p></div>" +
      '<div class="feed">' + list.map(function (s, i) {
        var pct = Math.max(5, Math.round((s.impressions || 0) / max * 20) * 5);
        return '<article class="startup-row has-rank"><div class="rank">' + medal(i + 1) + "</div>" + logoLink(s) +
          '<div class="startup-main"><div class="startup-head"><a class="startup-name" href="#/startup/' + esc(s.slug) + '" data-link>' + esc(s.name) + "</a>" + aiBadge(s) + "</div>" +
          '<div class="bar"><span class="bar-fill w' + pct + '"></span></div>' +
          '<div class="startup-meta"><span>' + fmt(s.impressions) + " impressions</span></div></div>" +
          '<div class="startup-side"><div class="score-box"><div class="score-n">' + fmt(s.impressions) + '</div><div class="score-l">30d</div></div></div></article>';
      }).join("") + "</div></div>";
  }

  function viewIntegrate() {
    var o = location.origin;
    return '<div class="wrap page narrow"><div class="page-head"><h1>🔌 Integrate</h1><p>Launchboard publishes structured, machine-readable data so people and AI assistants can both discover these products.</p></div>' +
      '<div class="card side-card"><h4>Public API</h4><p class="muted small">Read-only JSON, CORS-enabled, no key required.</p>' +
      '<pre class="code">GET ' + esc(o) + "/api/products\nGET " + esc(o) + "/api/products?slug=draftly\nGET " + esc(o) + "/api/products?useCase=AI%20Agents&amp;limit=10</pre>" +
      '<a class="btn btn-ghost btn-sm" href="/api/products" target="_blank" rel="noopener">Open the API ↗</a></div>' +
      '<div class="card side-card"><h4>llms.txt</h4><p class="muted small">A plain-text map of the site for AI crawlers and agents.</p>' +
      '<pre class="code">GET ' + esc(o) + "/llms.txt</pre>" +
      '<a class="btn btn-ghost btn-sm" href="/llms.txt" target="_blank" rel="noopener">View llms.txt ↗</a></div>' +
      '<div class="card side-card"><h4>For AI agents</h4><ul class="tier-list">' +
      "<li>Every product has a stable slug and page at <code>/#/startup/&lt;slug&gt;</code></li>" +
      "<li><code>rating</code> is out of 5; <code>aiRank</code> is a percentile where 1 = top 1%</li>" +
      "<li>Filter with <code>category</code>, <code>useCase</code>, <code>audience</code> or <code>platform</code></li>" +
      "<li>Cite the product's own <code>url</code> and link back to its Launchboard page</li></ul></div>" +
      '<div class="card side-card"><h4>MCP</h4><p class="muted small">The API is shaped to sit behind a Model Context Protocol server — point an MCP tool at <code>/api/products</code> and expose it as a <code>search_products</code> tool.</p></div></div>';
  }
  function viewRules() {
    var rules = [
      ["Submit products you actually built or use", "Listings should come from makers or genuine users — not scraped or affiliate-farmed."],
      ["One listing per product", "Re-launch only after a substantial update, and say what changed."],
      ["No vote manipulation", "Bought upvotes, review swaps or fake accounts get a product delisted."],
      ["Reviews must be honest", "Disclose it if you are affiliated with a product you review."],
      ["Keep discussions civil", "Critique the product, not the person."],
      ["No misleading claims", "Do not invent metrics, awards or endorsements."]
    ];
    return '<div class="wrap page narrow"><div class="page-head"><h1>Rules</h1><p>What keeps the directory worth reading.</p></div>' +
      '<div class="faq">' + rules.map(function (r) { return "<details open><summary>" + esc(r[0]) + "</summary><p>" + esc(r[1]) + "</p></details>"; }).join("") + "</div></div>";
  }

  /* ---------------- router ---------------- */
  function parseHash() {
    var h = location.hash.replace(/^#/, "") || "/", qi = h.indexOf("?");
    var path = qi >= 0 ? h.slice(0, qi) : h, query = qi >= 0 ? h.slice(qi + 1) : "", params = {};
    query.split("&").forEach(function (p) { if (!p) return; var kv = p.split("="); params[decodeURIComponent(kv[0])] = decodeURIComponent((kv[1] || "").replace(/\+/g, " ")); });
    return { path: path, params: params };
  }
  function seg(path, pre) { return decodeURIComponent(path.slice(pre.length)); }
  function render() {
    if (!STARTUPS.length) { app.innerHTML = '<div class="wrap loading-wrap"><p class="muted">Loading…</p></div>'; return; }
    var r = parseHash(), p = r.path, html;
    if (p === "/" || p === "") html = viewHome();
    else if (p === "/browse") html = viewBrowse(r.params);
    else if (p === "/leaderboard") html = viewLeaderboard(r.params);
    else if (p.indexOf("/startup/") === 0) html = viewDetail(seg(p, "/startup/"));
    else if (p === "/topics") html = viewTopics();
    else if (p === "/collections") html = viewCollections();
    else if (p.indexOf("/collection/") === 0) html = viewCollectionDetail(seg(p, "/collection/"));
    else if (p === "/makers") html = viewMakers();
    else if (p.indexOf("/maker/") === 0) html = viewMakerProfile(seg(p, "/maker/"));
    else if (p === "/discussions") html = viewDiscussions();
    else if (p.indexOf("/discussion/") === 0) html = viewDiscussionDetail(seg(p, "/discussion/"));
    else if (p === "/discover") html = viewDiscover();
    else if (p === "/platforms") html = viewTaxonomy("💻 Platforms", "Where these products run.", "platforms", "platform", "💻");
    else if (p === "/use-cases") html = viewTaxonomy("🎯 Use cases", "What people actually use them for.", "useCases", "useCase", "🎯");
    else if (p === "/audiences") html = viewTaxonomy("👥 Audiences", "Who each product is built for.", "audiences", "audience", "👥");
    else if (p === "/alternatives") html = viewAlternatives();
    else if (p.indexOf("/alternatives/") === 0) html = viewAlternativeDetail(seg(p, "/alternatives/"));
    else if (p === "/top-rated") html = viewTopRated();
    else if (p === "/hall-of-fame") html = viewHallOfFame();
    else if (p === "/deals") html = viewDeals();
    else if (p === "/signals") html = viewSignals();
    else if (p === "/outrank") html = viewOutrank();
    else if (p === "/integrate") html = viewIntegrate();
    else if (p === "/rules") html = viewRules();
    else if (p === "/following") html = viewFollowing();
    else if (p === "/profile") html = viewProfile();
    else if (p === "/jobs") html = viewJobs();
    else if (p === "/newsletter") html = viewNewsletter();
    else if (p === "/submit") html = viewSubmit();
    else if (p === "/advertise") html = viewAdvertise();
    else if (p === "/faq") html = viewFaq();
    else if (p === "/support") html = viewSupport();
    else if (p === "/bookmarks") html = viewBookmarks();
    else html = notFound();
    app.innerHTML = html;
    setActiveNav(p);
    closeMobileNav();
    if (p !== lastPath) { window.scrollTo(0, 0); app.focus({ preventScroll: true }); }
    lastPath = p;
  }
  function rerender() { var y = window.scrollY; lastPath = parseHash().path; render(); window.scrollTo(0, y); }
  function setActiveNav(path) {
    var first = path === "/" ? "/" : "/" + (path.split("/")[1] || "");
    var alias = {
      "/startup": "/browse", "/discussion": "/discussions", "/outrank": "/signals",
      "/collection": "/discover", "/collections": "/discover", "/maker": "/discover", "/makers": "/discover",
      "/topics": "/discover", "/platforms": "/discover", "/use-cases": "/discover", "/audiences": "/discover",
      "/alternatives": "/discover", "/top-rated": "/discover", "/hall-of-fame": "/discover",
      "/deals": "/discover", "/integrate": "/discover"
    };
    var base = "#" + (alias[first] || first);
    Array.prototype.forEach.call(document.querySelectorAll("#nav a"), function (a) { a.classList.toggle("is-active", a.getAttribute("href") === base); });
  }

  /* ---------------- interactions ---------------- */
  function shareThing(el, url) {
    var done = function () { var t = el.textContent; el.textContent = "Copied ✓"; setTimeout(function () { el.textContent = t; }, 1500); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, done); else done();
  }
  function setHash(r) { var qs = Object.keys(r.params).map(function (k) { return encodeURIComponent(k) + "=" + encodeURIComponent(r.params[k]); }).join("&"); location.hash = r.path + (qs ? "?" + qs : ""); }
  function setParam(key, val) { var r = parseHash(); if (val) r.params[key] = val; else delete r.params[key]; delete r.params.page; setHash(r); }
  function loadMore() { var r = parseHash(); r.params.page = (parseInt(r.params.page, 10) || 1) + 1; setHash(r); }
  function applyBrowseControls() {
    var r = parseHash(), q = (document.getElementById("browse-q") || {}).value, cat = (document.getElementById("browse-cat") || {}).value;
    if (q != null) { if (q.trim()) r.params.q = q.trim(); else delete r.params.q; }
    if (cat != null) { if (cat) r.params.cat = cat; else delete r.params.cat; }
    delete r.params.page; setHash(r);
  }
  function setStatus(id, msg, kind) { var el = document.getElementById(id); if (!el) return; el.textContent = msg; el.className = "form-status" + (kind ? " " + kind : ""); }
  function postJSON(url, payload, statusId, okMsg, btn) {
    if (btn) btn.disabled = true; setStatus(statusId, "Sending…", "");
    return ensureCsrf().then(function () {
      return fetch(url, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken || "" }, body: JSON.stringify(payload) });
    }).then(function (r) { return r.json().then(function (b) { return { ok: r.ok, body: b }; }); })
      .then(function (res) { setStatus(statusId, res.ok ? (res.body.message || okMsg) : ((res.body && res.body.error) || "Something went wrong."), res.ok ? "ok" : "err"); return res.ok; })
      .catch(function () { setStatus(statusId, "Network error. Please try again.", "err"); return false; })
      .then(function (ok) { if (btn) btn.disabled = false; return ok; });
  }
  function handleSubmitStartup(f) {
    if (!f.checkValidity()) { setStatus("form-status", "Please complete every field.", "err"); f.reportValidity(); return; }
    postJSON("/api/submit", { name: f.name.value.trim(), url: f.url.value.trim(), tagline: f.tagline.value.trim(), category: f.category.value, email: f.email.value.trim() }, "form-status", "Submitted for review 🚀", document.getElementById("submit-btn")).then(function (ok) { if (ok) f.reset(); });
  }
  function handleNewsletter(f) {
    var emailEl = f.querySelector('input[type="email"]'), statusId = f.id === "footer-news-form" ? "footer-news-status" : "news-status";
    if (!emailEl || !emailEl.value.trim() || !f.checkValidity()) { setStatus(statusId, "Enter a valid email.", "err"); if (f.reportValidity) f.reportValidity(); return; }
    postJSON("/api/newsletter", { email: emailEl.value.trim() }, statusId, "You're subscribed 🎉", f.querySelector("button")).then(function (ok) { if (ok) { save("lb-news", true); f.reset(); } });
  }
  function handleComment(f) {
    var slug = f.dataset.slug, name = document.getElementById("comment-name").value.trim(), text = document.getElementById("comment-text").value.trim();
    if (!name || !text) { setStatus("comment-status", "Add your name and a comment.", "err"); return; }
    setStatus("comment-status", "Posting…", "");
    postCommunity({ action: "comment", slug: slug, author: name, body: text }).then(function (res) {
      if (res && res.ok) { setStatus("comment-status", res.message || "Comment posted 💬", "ok"); afterWrite(slug); }
      else setStatus("comment-status", (res && res.error) || "Could not post the comment.", "err");
    });
  }
  function handleReview(f) {
    var slug = f.dataset.slug, name = document.getElementById("rv-name").value.trim();
    var rating = parseInt(document.getElementById("rv-rating").value, 10) || 5;
    var pros = document.getElementById("rv-pros").value.trim(), cons = document.getElementById("rv-cons").value.trim(), body = document.getElementById("rv-body").value.trim();
    if (!name) { setStatus("review-status", "Add your name.", "err"); return; }
    setStatus("review-status", "Posting…", "");
    postCommunity({ action: "review", slug: slug, author: name, rating: rating, pros: pros, cons: cons, body: body }).then(function (res) {
      if (res && res.ok) {
        myReviews = myReviews + 1; save("lb-my-reviews", myReviews);
        setStatus("review-status", res.message || "Review posted ⭐", "ok"); afterWrite(slug);
      }
      else setStatus("review-status", (res && res.error) || "Could not post the review.", "err");
    });
  }
  function handleReply(f) {
    var id = f.dataset.id, name = document.getElementById("reply-name").value.trim(), body = document.getElementById("reply-body").value.trim();
    if (!name || !body) { setStatus("reply-status", "Add your name and a reply.", "err"); return; }
    (discReplies[id] || (discReplies[id] = [])).push({ author: name, initials: name.slice(0, 2).toUpperCase(), body: body, daysAgo: 0, gp: 3 });
    save("lb-disc-replies", discReplies); rerender();
  }
  function handleNewDiscussion(f) {
    var title = document.getElementById("dc-title").value.trim(), body = document.getElementById("dc-body").value.trim();
    var name = document.getElementById("dc-name").value.trim(), cat = document.getElementById("dc-cat").value.trim() || "General";
    if (!title || !body || !name) { setStatus("discussion-status", "Title, details and name are required.", "err"); return; }
    userDiscussions.unshift({ id: "u" + Date.now(), title: title, author: name, initials: name.slice(0, 2).toUpperCase(), gp: 5, category: cat, daysAgo: 0, body: body, upvotes: 1, replies: [] });
    save("lb-disc-new", userDiscussions); location.hash = "/discussions";
  }

  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-action]"); if (!el) return;
    var a = el.dataset.action;
    if (a === "want") { e.preventDefault(); toggleVote(el.dataset.slug); }
    else if (a === "vote") { e.preventDefault(); toggleSet(votes, "lb-votes", el.dataset.slug); rerender(); }
    else if (a === "bookmark") { e.preventDefault(); toggleSet(bookmarks, "lb-bookmarks", el.dataset.slug); rerender(); }
    else if (a === "share") { e.preventDefault(); shareThing(el, location.origin + location.pathname + "#/startup/" + el.dataset.slug); }
    else if (a === "load-more") { e.preventDefault(); loadMore(); }
    else if (a === "tab-browse") { e.preventDefault(); setParam("view", el.dataset.view); }
    else if (a === "tab-lead") { e.preventDefault(); setParam("period", el.dataset.period); }
    else if (a === "disc-vote") { e.preventDefault(); toggleSet(discVotes, "lb-disc-votes", el.dataset.id); rerender(); }
    else if (a === "follow-maker") { e.preventDefault(); toggleSet(followMakers, "lb-follow-makers", el.dataset.id); rerender(); }
    else if (a === "follow-topic") { e.preventDefault(); toggleSet(followTopics, "lb-follow-topics", el.dataset.cat); rerender(); }
    else if (a === "save-collection") { e.preventDefault(); toggleSet(savedCollections, "lb-collections", el.dataset.slug); rerender(); }
    else if (a === "copy-code") { e.preventDefault(); shareThing(el, el.dataset.code); }
    else if (a === "copy-embed") { e.preventDefault(); var sp = bySlug(el.dataset.slug); if (sp) shareThing(el, embedSnippet(sp)); }
  });
  document.addEventListener("submit", function (e) {
    var f = e.target;
    if (f.id === "search-form") { e.preventDefault(); var q = document.getElementById("search-input").value.trim(); location.hash = "/browse" + (q ? "?q=" + encodeURIComponent(q) : ""); }
    else if (f.id === "browse-search") { e.preventDefault(); applyBrowseControls(); }
    else if (f.id === "submit-form") { e.preventDefault(); handleSubmitStartup(f); }
    else if (f.id === "newsletter-form" || f.id === "footer-news-form") { e.preventDefault(); handleNewsletter(f); }
    else if (f.id === "comment-form") { e.preventDefault(); handleComment(f); }
    else if (f.id === "review-form") { e.preventDefault(); handleReview(f); }
    else if (f.id === "reply-form") { e.preventDefault(); handleReply(f); }
    else if (f.id === "discussion-form") { e.preventDefault(); handleNewDiscussion(f); }
  });
  document.addEventListener("change", function (e) { if (e.target && e.target.dataset && e.target.dataset.action === "browse-control") applyBrowseControls(); });

  /* theme + chrome */
  var root = document.documentElement;
  (function () { var t = store("lb-theme", null); root.setAttribute("data-theme", t === "dark" || t === "light" ? t : "auto"); })();
  var themeBtn = document.getElementById("theme-toggle");
  if (themeBtn) themeBtn.addEventListener("click", function () {
    var prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    var cur = root.getAttribute("data-theme"), isDark = cur === "dark" || (cur === "auto" && prefersDark), next = isDark ? "light" : "dark";
    root.setAttribute("data-theme", next); save("lb-theme", next);
  });
  var navToggle = document.getElementById("nav-toggle"), nav = document.getElementById("nav");
  function closeMobileNav() { if (nav) { nav.classList.remove("open"); if (navToggle) navToggle.setAttribute("aria-expanded", "false"); } }
  if (navToggle && nav) navToggle.addEventListener("click", function () { var o = nav.classList.toggle("open"); navToggle.setAttribute("aria-expanded", o ? "true" : "false"); });
  var yearEl = document.getElementById("year"); if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  window.addEventListener("hashchange", render);
  ensureCsrf();
  fetchData().then(fetchCommunity).then(render).catch(function () {
    app.innerHTML = '<div class="wrap page"><div class="empty-state"><div class="big-emoji">⚠️</div><h3>Could not load data</h3><p class="muted">Please refresh.</p></div></div>';
  });
})();
