/* Launchboard front-end.
 * Everything is same-origin: styles from /assets, this script from /assets,
 * and the only network calls go to /api/* — so the strict CSP
 * (script-src 'self'; connect-src 'self') never has to be loosened.
 * The page is fully usable with JS disabled; this only enhances it. */
(function () {
  "use strict";

  var root = document.documentElement;

  /* ---------- Theme toggle (persisted, respects system default) ---------- */
  var THEME_KEY = "lb-theme";
  function applyStoredTheme() {
    var stored = null;
    try { stored = localStorage.getItem(THEME_KEY); } catch (e) {}
    if (stored === "dark" || stored === "light") {
      root.setAttribute("data-theme", stored);
    } else {
      root.setAttribute("data-theme", "auto");
    }
  }
  applyStoredTheme();

  var themeBtn = document.getElementById("theme-toggle");
  if (themeBtn) {
    themeBtn.addEventListener("click", function () {
      var prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
      var current = root.getAttribute("data-theme");
      var isDark = current === "dark" || (current === "auto" && prefersDark);
      var next = isDark ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
    });
  }

  /* ---------- Mobile nav ---------- */
  var navToggle = document.getElementById("nav-toggle");
  var nav = document.querySelector(".nav");
  if (navToggle && nav) {
    navToggle.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      navToggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    nav.addEventListener("click", function (e) {
      if (e.target && e.target.tagName === "A") {
        nav.classList.remove("open");
        navToggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  /* ---------- Footer year ---------- */
  var yearEl = document.getElementById("year");
  if (yearEl) { yearEl.textContent = String(new Date().getFullYear()); }

  /* ---------- Upvotes (demo: remembered per-browser) ---------- */
  var VOTE_KEY = "lb-votes";
  var voted = {};
  try { voted = JSON.parse(localStorage.getItem(VOTE_KEY) || "{}") || {}; } catch (e) { voted = {}; }

  function persistVotes() {
    try { localStorage.setItem(VOTE_KEY, JSON.stringify(voted)); } catch (e) {}
  }

  Array.prototype.forEach.call(document.querySelectorAll(".product"), function (card) {
    var id = card.getAttribute("data-id");
    var btn = card.querySelector(".vote");
    if (!btn) return;
    var base = parseInt(btn.getAttribute("data-votes"), 10) || 0;
    var countEl = btn.querySelector(".vote-count");
    if (voted[id]) {
      btn.classList.add("voted");
      countEl.textContent = String(base + 1);
    }
    btn.addEventListener("click", function () {
      if (voted[id]) {
        delete voted[id];
        btn.classList.remove("voted");
        countEl.textContent = String(base);
      } else {
        voted[id] = true;
        btn.classList.add("voted");
        countEl.textContent = String(base + 1);
      }
      persistVotes();
    });
  });

  /* ---------- CSRF token + submit ----------
   * We fetch a token from /api/csrf. The server also sets the token in an
   * HttpOnly, Secure, SameSite=Strict cookie (XSRF-TOKEN). We echo the token
   * value back in the X-CSRF-Token header; the server compares the two. This
   * is the "synchronizer token" pattern and is why our cookie can stay
   * HttpOnly (fixing both cookie findings) without breaking the form. */
  var csrfToken = null;

  function loadCsrf() {
    return fetch("/api/csrf", { method: "GET", credentials: "same-origin", cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) { if (data && data.csrfToken) { csrfToken = data.csrfToken; } })
      .catch(function () { /* form still validates client-side; submit will retry token */ });
  }
  loadCsrf();

  var form = document.getElementById("submit-form");
  var status = document.getElementById("form-status");
  var submitBtn = document.getElementById("submit-btn");

  function setStatus(msg, kind) {
    if (!status) return;
    status.textContent = msg;
    status.className = "form-status" + (kind ? " " + kind : "");
  }

  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!form.checkValidity()) {
        setStatus("Please fill in every field with a valid value.", "err");
        form.reportValidity();
        return;
      }
      var payload = {
        name: form.name.value.trim(),
        url: form.url.value.trim(),
        tagline: form.tagline.value.trim(),
        category: form.category.value,
        email: form.email.value.trim()
      };

      submitBtn.disabled = true;
      setStatus("Submitting…", "");

      var tokenReady = csrfToken ? Promise.resolve() : loadCsrf();
      tokenReady.then(function () {
        return fetch("/api/submit", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken || ""
          },
          body: JSON.stringify(payload)
        });
      }).then(function (r) {
        return r.json().then(function (body) { return { ok: r.ok, body: body }; });
      }).then(function (res) {
        if (res.ok) {
          setStatus(res.body.message || "Submitted! We'll review it shortly. 🚀", "ok");
          form.reset();
        } else {
          setStatus(res.body && res.body.error ? res.body.error : "Something went wrong. Please try again.", "err");
        }
      }).catch(function () {
        setStatus("Network error. Please try again.", "err");
      }).then(function () {
        submitBtn.disabled = false;
      });
    });
  }
})();
