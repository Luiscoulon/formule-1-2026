/*
 * Application : navigation par ancres (#/pilotes, #/calendrier/18…), rendu des pages,
 * panneau de détail, thème clair/sombre, compte à rebours, carte et mise à jour en direct.
 */
(function (P26) {
  "use strict";

  const U = P26.utils;
  const V = P26.views;
  const cfg = P26.config || {};

  const main = document.getElementById("main");
  const drawer = document.getElementById("drawer");
  const drawerPanel = drawer.querySelector(".drawer-panel");
  const drawerBody = document.getElementById("drawer-body");
  const drawerLabel = document.getElementById("drawer-label");
  const syncEl = document.getElementById("sync-status");
  const kerbEl = document.getElementById("season-kerb");
  const themeBtn = document.getElementById("theme-toggle");

  const PAGES = {
    accueil: { view: "home", title: "Saison " + P26.data.season + " de Formule 1" },
    calendrier: { view: "calendar", title: "Calendrier et circuits" },
    pilotes: { view: "drivers", title: "Pilotes" },
    ecuries: { view: "teams", title: "Écuries" },
    classements: { view: "standings", title: "Classements" }
  };

  const ui = {
    viewKey: null,
    revealTower: true,
    cal: { show: "all", sprintOnly: false, view: "list" },
    drivers: { team: "all", sort: "standing", q: "" },
    chart: { kind: "drivers", selected: {}, table: false }
  };

  let state = P26.compute.build(P26.data, null);
  let live = null;
  let lastSync = 0;
  let pageCharts = [];
  let drawerChart = null;
  let map = null;
  let mapTiles = null;
  let leafletPromise = null;
  let lastFocus = null;

  // ------------------------------------------------------------ couleurs des écuries
  function injectTeamColors() {
    let style = document.getElementById("team-colors");
    if (!style) {
      style = document.createElement("style");
      style.id = "team-colors";
      document.head.appendChild(style);
    }
    const light = ["--team-none:#7b848e;"];
    const dark = ["--team-none:#a9b1ba;"];
    state.teams.forEach(function (t) {
      const id = U.cssId(t.id);
      light.push("--team-" + id + ":" + (t.color || "#7b848e") + ";");
      dark.push("--team-" + id + ":" + (t.colorDark || t.color || "#a9b1ba") + ";");
    });
    style.textContent = ":root{" + light.join("") + '}:root[data-theme="dark"]{' + dark.join("") +
      '}@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){' + dark.join("") + "}}";
  }

  // ------------------------------------------------------------ thème
  function effectiveTheme() {
    const forced = document.documentElement.getAttribute("data-theme");
    if (forced) return forced;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function updateThemeButton() {
    const dark = effectiveTheme() === "dark";
    themeBtn.setAttribute("aria-label", dark ? "Passer au thème clair" : "Passer au thème sombre");
    themeBtn.title = dark ? "Thème clair" : "Thème sombre";
    themeBtn.innerHTML = dark
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
    const meta = document.querySelector('meta[name="theme-color"]:not([media])');
    if (meta) meta.setAttribute("content", dark ? "#121519" : "#eceef1");
  }

  function toggleTheme() {
    const next = effectiveTheme() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("p26-theme", next); } catch (e) { /* stockage indisponible */ }
    updateThemeButton();
    refreshMapTiles();
  }

  // ------------------------------------------------------------ navigation
  function parseRoute() {
    let hash = location.hash.replace(/^#\/?/, "");
    try { hash = decodeURIComponent(hash); } catch (e) { /* ancre mal formée */ }
    const parts = hash.split("/").filter(Boolean);
    return { page: parts[0] || "accueil", param: parts[1] || null };
  }

  function updateNav(page) {
    U.$$(".main-nav a").forEach(function (a) {
      if (a.getAttribute("data-nav") === page) {
        a.setAttribute("aria-current", "page");
        const nav = a.parentNode;
        if (nav.scrollWidth > nav.clientWidth) {
          nav.scrollLeft = Math.max(0, a.offsetLeft - (nav.clientWidth - a.offsetWidth) / 2);
        }
      } else {
        a.removeAttribute("aria-current");
      }
    });
  }

  function updateKerb() {
    const segs = state.races.map(function (r) {
      const isNext = state.next && state.next.round === r.round;
      const cls = r.status === "done" ? " done" : isNext ? " next" : "";
      return '<span class="kerb-seg' + cls + '" title="' + U.esc("Manche " + r.round + " : " + r.short) + '"></span>';
    }).join("");
    kerbEl.innerHTML = '<div class="kerb-track" role="img" aria-label="' +
      U.esc(state.doneCount + " " + U.pl(state.doneCount, "manche disputée", "manches disputées") + " sur " + state.totalRounds) + '">' + segs + "</div>" +
      '<p class="kerb-caption" aria-hidden="true"><b>' + state.doneCount + "</b> " + U.pl(state.doneCount, "manche disputée", "manches disputées") +
      " sur " + state.totalRounds + "</p>";
  }

  function setTitle(page, detailTitle) {
    const base = PAGES[page] ? PAGES[page].title : "";
    document.title = (detailTitle ? detailTitle + " – " : "") + base + " – " + (cfg.siteName || "Paddock 26");
  }

  function teardown() {
    pageCharts.forEach(function (c) { c.destroy(); });
    pageCharts = [];
    if (map) { map.remove(); map = null; mapTiles = null; }
  }

  function render(opts) {
    opts = opts || {};
    const route = parseRoute();
    const page = PAGES[route.page] ? route.page : "accueil";
    const viewKey = page + (page === "classements" ? "/" + (route.param || "") : "");
    const pageChanged = viewKey !== ui.viewKey;

    if (pageChanged || opts.force) {
      const y = window.scrollY;
      teardown();
      main.innerHTML = U.typo(V[PAGES[page].view](state, ui, route));
      ui.viewKey = viewKey;
      ui.revealTower = false;
      afterRender(page);
      updateNav(page);
      if (pageChanged && !opts.initial) {
        window.scrollTo(0, 0);
        main.focus({ preventScroll: true });
      } else if (opts.force) {
        window.scrollTo(0, y);
      }
    }
    updateKerb();

    let detail = null;
    if (route.param && (page === "calendrier" || page === "pilotes")) {
      detail = page === "calendrier" ? V.raceDetail(state, Number(route.param)) : V.driverDetail(state, route.param);
      if (detail) {
        openDrawer(detail, page);
      } else {
        closeDrawer();
        history.replaceState(null, "", "#/" + page);
      }
    } else {
      closeDrawer();
    }
    let detailTitle = null;
    if (detail && page === "calendrier") detailTitle = state.raceByRound.get(Number(route.param)).name;
    if (detail && page === "pilotes") detailTitle = V.fullName(state.drivers.get(route.param));
    setTitle(page, detailTitle);
  }

  function rerenderMain(focusSelector) {
    render({ force: true });
    if (focusSelector) {
      const el = main.querySelector(focusSelector);
      if (el) el.focus({ preventScroll: true });
    }
  }

  function afterRender(page) {
    if (page === "classements" && document.getElementById("evo-chart")) evolutionChart();
    if (page === "calendrier" && document.getElementById("circuit-map")) circuitMap();
  }

  // ------------------------------------------------------------ panneau de détail
  function setInert(on) {
    ["site-header", "main", "site-footer"].forEach(function (id) {
      const el = document.getElementById(id);
      if (!el) return;
      if (on) el.setAttribute("inert", "");
      else el.removeAttribute("inert");
    });
  }

  function openDrawer(detail, parent) {
    const wasOpen = !drawer.hidden;
    const scroll = drawerPanel.scrollTop;
    if (!wasOpen) lastFocus = document.activeElement;
    destroyDrawerChart();
    drawerLabel.textContent = detail.label;
    drawerBody.innerHTML = U.typo(detail.html);
    drawer.setAttribute("data-parent", parent);
    drawer.hidden = false;
    document.documentElement.style.overflow = "hidden";
    setInert(true);
    if (detail.chart) driverChart(detail.chart);
    if (wasOpen && drawer.getAttribute("data-key") === location.hash) {
      drawerPanel.scrollTop = scroll;
    } else {
      drawerPanel.scrollTop = 0;
      drawer.querySelector(".drawer-close").focus({ preventScroll: true });
    }
    drawer.setAttribute("data-key", location.hash);
  }

  function closeDrawer() {
    if (drawer.hidden) return;
    destroyDrawerChart();
    drawer.hidden = true;
    drawer.removeAttribute("data-key");
    document.documentElement.style.overflow = "";
    setInert(false);
    if (lastFocus && document.contains(lastFocus) && lastFocus !== document.body) lastFocus.focus({ preventScroll: true });
    else main.focus({ preventScroll: true });
    lastFocus = null;
  }

  function requestClose() {
    location.hash = "#/" + (drawer.getAttribute("data-parent") || "accueil");
  }

  function destroyDrawerChart() {
    if (drawerChart) { drawerChart.destroy(); drawerChart = null; }
  }

  // ------------------------------------------------------------ graphiques
  function axisLabels() {
    const max = state.progression.maxRound;
    const labels = new Array(max + 1).fill("");
    const titles = new Array(max + 1).fill("");
    titles[0] = "Avant la première manche";
    state.races.forEach(function (r) {
      labels[r.round] = r.code;
      titles[r.round] = U.typo("Après la manche " + r.round + " : " + r.name);
    });
    return { labels: labels, titles: titles };
  }

  function seriesFor(kind, ids) {
    const prog = kind === "teams" ? state.progression.teams : state.progression.drivers;
    return ids.map(function (id) {
      const meta = V.seriesMeta(state, kind, id);
      return { id: id, label: meta.label, short: meta.short, color: meta.color, dash: meta.dash, values: prog.get(id) || [] };
    });
  }

  function evolutionChart() {
    const host = document.getElementById("evo-chart");
    const kind = ui.chart.kind;
    const ids = ui.chart.selected[kind] || [];
    if (!ids.length) {
      host.innerHTML = '<p class="empty">Sélectionnez au moins une courbe ci-dessus.</p>';
      return;
    }
    const axis = axisLabels();
    pageCharts.push(P26.chart.line(host, {
      series: seriesFor(kind, ids), xLabels: axis.labels, xTitles: axis.titles, height: 380,
      ariaLabel: "Points cumulés au fil des manches. Utilisez les flèches gauche et droite pour parcourir les manches ; les données sont aussi disponibles sous forme de tableau."
    }));
  }

  function driverChart(id) {
    const host = document.getElementById("drawer-chart");
    const d = state.drivers.get(id);
    if (!host || !d) return;
    const ids = [id];
    state.drivers.forEach(function (x) {
      if (x.team === d.team && x.id !== id && !x.reserve && state.driverStats(x.id).entries > 0) ids.push(x.id);
    });
    const leader = state.standings.drivers[0];
    if (leader && ids.indexOf(leader.id) < 0) ids.push(leader.id);
    const axis = axisLabels();
    drawerChart = P26.chart.line(host, {
      series: seriesFor("drivers", ids), xLabels: axis.labels, xTitles: axis.titles, height: 260,
      ariaLabel: "Points cumulés de " + V.fullName(d) + " comparés à son coéquipier et au leader du championnat."
    });
  }

  function selectTop(n) {
    const kind = ui.chart.kind;
    const list = kind === "teams" ? state.standings.teams : state.standings.drivers;
    ui.chart.selected[kind] = list.slice(0, n).map(function (e) { return e.id; });
  }

  function toggleSeries(id) {
    const kind = ui.chart.kind;
    const list = (ui.chart.selected[kind] || []).slice();
    const i = list.indexOf(id);
    if (i >= 0) list.splice(i, 1);
    else if (list.length < 10) list.push(id);
    else return false;
    ui.chart.selected[kind] = list;
    return true;
  }

  // ------------------------------------------------------------ carte des circuits
  function loadLeaflet() {
    if (window.L) return Promise.resolve(window.L);
    if (leafletPromise) return leafletPromise;
    leafletPromise = new Promise(function (resolve, reject) {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = "leaflet.css";
      document.head.appendChild(css);
      const script = document.createElement("script");
      script.src = "leaflet.js";
      script.onload = function () { window.L ? resolve(window.L) : reject(new Error("Leaflet absent")); };
      script.onerror = function () { leafletPromise = null; reject(new Error("Leaflet introuvable")); };
      document.head.appendChild(script);
    });
    return leafletPromise;
  }

  function tileLayer(L) {
    const tiles = cfg.mapTiles || {};
    return L.tileLayer(effectiveTheme() === "dark" ? tiles.dark : tiles.light, {
      attribution: tiles.attribution, subdomains: "abcd", maxZoom: 19
    });
  }

  function refreshMapTiles() {
    if (!map || !window.L) return;
    if (mapTiles) map.removeLayer(mapTiles);
    mapTiles = tileLayer(window.L).addTo(map);
  }

  function circuitMap() {
    const el = document.getElementById("circuit-map");
    const fallback = document.getElementById("map-fallback");
    loadLeaflet().then(function (L) {
      if (!document.body.contains(el)) return;
      if (fallback) fallback.hidden = true;
      map = L.map(el, { scrollWheelZoom: false, worldCopyJump: true, minZoom: 1 });
      mapTiles = tileLayer(L).addTo(map);
      const points = [];
      state.races.forEach(function (r) {
        if (r.lat == null || r.lng == null) return;
        const isNext = state.next && state.next.round === r.round;
        const cls = isNext ? " next" : r.status === "done" ? " done" : "";
        const icon = L.divIcon({
          className: "pin-wrap", html: '<span class="pin' + cls + '">' + r.round + "</span>",
          iconSize: [28, 28], iconAnchor: [14, 14], popupAnchor: [0, -16]
        });
        const res = state.results.get(r.round);
        const winner = r.status === "done" && res && res.race[0] ? state.drivers.get(res.race[0]) : null;
        const popup = '<div class="map-pop"><b>' + U.esc("Manche " + r.round + " : " + r.name) + "</b>" +
          U.esc(r.circuit + ", " + r.city) + "<br>" + U.esc(U.range(r.weekendStart, r.start, r.tz || U.userTz)) +
          (winner ? "<br>Vainqueur : " + U.esc(V.fullName(winner)) : "") +
          '<br><a href="#/calendrier/' + r.round + '">Ouvrir la fiche</a></div>';
        L.marker([r.lat, r.lng], { icon: icon, title: "Manche " + r.round + " : " + r.name, riseOnHover: true, zIndexOffset: isNext ? 1000 : 0 })
          .bindPopup(U.typo(popup)).addTo(map);
        points.push([r.lat, r.lng]);
      });
      if (points.length) map.fitBounds(points, { padding: [28, 28] });
      map.on("click", function () { map.scrollWheelZoom.enable(); });
      map.on("mouseout", function () { map.scrollWheelZoom.disable(); });
    }).catch(function () {
      if (fallback) fallback.textContent = "La carte n'a pas pu être chargée. Utilisez la vue en liste.";
    });
  }

  // ------------------------------------------------------------ mise à jour en direct
  function setSync(kind) {
    const snap = state.snapshot || {};
    const snapDate = snap.date ? U.date(snap.date + "T12:00:00Z", "UTC", { day: "numeric", month: "short", year: "numeric" }) : "";
    syncEl.setAttribute("data-state", kind);
    if (kind === "loading") {
      syncEl.textContent = "Mise à jour des résultats…";
      syncEl.title = "Connexion à l'API Jolpica-F1";
    } else if (kind === "live") {
      const last = state.last;
      syncEl.textContent = U.typo(last ? "Résultats à jour : " + last.short : "Résultats à jour");
      syncEl.title = "Synchronisé avec l'API Jolpica-F1 le " + U.date(new Date(lastSync).toISOString(), U.userTz, { day: "numeric", month: "short" }) +
        " à " + U.time(new Date(lastSync).toISOString(), U.userTz);
    } else {
      syncEl.textContent = "Données du " + snapDate;
      syncEl.title = cfg.liveData
        ? "API indisponible pour le moment : données intégrées au site (" + (snap.label || "") + ")."
        : "Mise à jour automatique désactivée (js/config.js).";
    }
  }

  function signature(s) {
    return JSON.stringify([
      s.standingsRound, s.lastScoredRound,
      s.standings.drivers.map(function (e) { return e.id + ":" + e.points; }),
      s.races.map(function (r) { return r.round + r.status + r.start; })
    ]);
  }

  async function syncLive(force) {
    if (!cfg.liveData || typeof window.fetch !== "function") { setSync("offline"); return; }
    setSync("loading");
    try {
      live = await P26.api.sync(P26.data.season, { force: !!force });
      lastSync = Date.now();
      const fresh = P26.compute.build(P26.data, live);
      const changed = signature(fresh) !== signature(state);
      state = fresh;
      injectTeamColors();
      if (changed) render({ force: true });
      setSync("live");
      if (live.errors.length && window.console) console.info("Paddock 26 : données partielles de l'API (" + live.errors.join(", ") + ").");
    } catch (err) {
      if (window.console) console.info("Paddock 26 : API indisponible, données intégrées utilisées.", err && err.message);
      setSync("offline");
    }
  }

  // ------------------------------------------------------------ compte à rebours
  let lastRelative = 0;
  let lastStatusCheck = Date.now();

  function tick() {
    const now = Date.now();
    let expired = false;
    U.$$("[data-countdown]").forEach(function (el) {
      const target = Date.parse(el.getAttribute("data-countdown"));
      const c = U.countdown(target, now);
      U.$$("[data-cd]", el).forEach(function (b) {
        const k = b.getAttribute("data-cd");
        b.textContent = k === "d" ? c.d : U.pad(c[k]);
      });
      U.$$("[data-cd-label]", el).forEach(function (s) {
        const k = s.getAttribute("data-cd-label");
        s.textContent = U.pl(c[k], s.getAttribute("data-one"), s.getAttribute("data-many"));
      });
      if (target <= now) expired = true;
    });
    if (now - lastRelative > 30000) {
      lastRelative = now;
      U.$$("[data-relative]").forEach(function (el) { el.textContent = U.relative(Date.parse(el.getAttribute("data-relative")), now); });
    }
    if (expired || now - lastStatusCheck > 60000) {
      lastStatusCheck = now;
      const fresh = P26.compute.build(P26.data, live);
      const changed = signature(fresh) !== signature(state);
      state = fresh;
      if (changed) render({ force: true });
    }
  }

  // ------------------------------------------------------------ événements
  document.addEventListener("click", function (ev) {
    const el = ev.target.closest ? ev.target.closest("[data-action]") : null;
    if (!el) return;
    const action = el.getAttribute("data-action");
    const value = el.getAttribute("data-value");
    const sel = '[data-action="' + action + '"]' + (value != null ? '[data-value="' + value + '"]' : "");
    switch (action) {
      case "drawer-close": ev.preventDefault(); requestClose(); break;
      case "theme": toggleTheme(); break;
      case "cal-show": ui.cal.show = value; rerenderMain(sel); break;
      case "cal-view": ui.cal.view = value; rerenderMain(sel); break;
      case "evo-kind": ui.chart.kind = value; rerenderMain(sel); break;
      case "evo-top": selectTop(Number(value)); rerenderMain(sel); break;
      case "evo-toggle": if (toggleSeries(value)) rerenderMain(sel); break;
      case "evo-table": ui.chart.table = !ui.chart.table; rerenderMain(sel); break;
      default: break;
    }
  });

  const updateDriverGrid = function () {
    const grid = document.getElementById("driver-grid");
    if (grid) grid.innerHTML = U.typo(V.driverCards(state, ui));
  };
  const updateDriverGridSoon = U.debounce(updateDriverGrid, 120);

  document.addEventListener("change", function (ev) {
    const el = ev.target;
    const action = el.getAttribute && el.getAttribute("data-action");
    if (action === "cal-sprint") { ui.cal.sprintOnly = el.checked; rerenderMain('[data-action="cal-sprint"]'); }
    if (action === "drv-team") { ui.drivers.team = el.value; updateDriverGrid(); }
    if (action === "drv-sort") { ui.drivers.sort = el.value; updateDriverGrid(); }
  });

  document.addEventListener("input", function (ev) {
    if (ev.target.getAttribute && ev.target.getAttribute("data-action") === "drv-q") {
      ui.drivers.q = ev.target.value;
      updateDriverGridSoon();
    }
  });

  document.addEventListener("keydown", function (ev) {
    if (drawer.hidden) return;
    if (ev.key === "Escape") { ev.preventDefault(); requestClose(); return; }
    if (ev.key === "Tab") {
      // Piège à focus de secours pour les navigateurs sans l'attribut « inert »
      const focusables = U.$$('a[href], button:not([disabled]), input, select, [tabindex]:not([tabindex="-1"])', drawerPanel)
        .filter(function (el) { return el.offsetParent !== null; });
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
    }
  });

  // Drapeau indisponible (hors connexion) : on masque l'image sans casser la mise en page.
  document.addEventListener("error", function (ev) {
    const t = ev.target;
    if (t && t.classList && t.classList.contains("flag")) t.style.visibility = "hidden";
  }, true);

  window.addEventListener("hashchange", function () { render(); });

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState !== "visible") return;
    tick();
    if (cfg.liveData && Date.now() - lastSync > (cfg.cacheMinutes || 30) * 60000) syncLive(false);
  });

  if (window.matchMedia) {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = function () {
      if (!document.documentElement.getAttribute("data-theme")) { updateThemeButton(); refreshMapTiles(); }
    };
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }

  // ------------------------------------------------------------ démarrage
  function footer() {
    const el = document.getElementById("footer-data");
    if (!el) return;
    const snap = state.snapshot || {};
    el.textContent = U.typo("Données intégrées au site : à jour au " +
      U.date(snap.date + "T12:00:00Z", "UTC", { day: "numeric", month: "long", year: "numeric" }) + ", " + (snap.label || "") +
      " (manche " + snap.round + "). " + (cfg.liveData ? "Elles sont complétées automatiquement par l'API Jolpica-F1 dès qu'elle est joignable." : ""));
    const repo = document.getElementById("footer-repo");
    if (repo && cfg.repoUrl) {
      repo.innerHTML = '<a href="' + U.esc(cfg.repoUrl) + '">Code source sur GitHub</a>';
    }
  }

  document.querySelectorAll("[data-site-name]").forEach(function (el) { el.textContent = cfg.siteName || "Paddock 26"; });
  injectTeamColors();
  updateThemeButton();
  footer();
  render({ initial: true });
  setSync(cfg.liveData ? "loading" : "offline");
  syncLive(false);
  setInterval(tick, 1000);
})(window.P26);
