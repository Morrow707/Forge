// THE ARTIFACT'S STAND-IN FOR THE SERVER. Runs before the app boots. It answers every /api call
// from responses recorded off the real server (fixtures.js) and keeps every save in memory, so the
// real Forge screens run unchanged: previews update as you type, Save stores the value, and a
// reload of the artifact starts again from the recorded state.
(function () {
  var FIX = window.__FORGE_FIXTURES__ || {};
  // A returning coach has already dismissed the two once-per-device camera notices.
  try {
    localStorage.setItem("forge:non-ios-accuracy-notice-seen", "1");
    localStorage.setItem("forge:camera-accuracy-notice-seen", "1");
  } catch (e) {}
  var state = JSON.parse(JSON.stringify(FIX));
  delete state.__writes;

  // Keep relative asset URLs pointing at the artifact while the app's router sees app paths.
  var here = document.baseURI.replace(/[^/]*$/, "");
  var baseEl = document.createElement("base");
  baseEl.href = here;
  document.head.prepend(baseEl);
  window.__FORGE_ARTIFACT_HOME__ = here;
  var start = (location.hash && location.hash.slice(1)) || "/coach/branding";
  history.replaceState(null, "", start);

  function body(key) {
    return state[key] ? state[key].body : undefined;
  }
  function setBody(key, value) {
    state[key] = { status: 200, body: value };
  }
  function json(status, value) {
    return new Response(value === undefined ? null : JSON.stringify(value), {
      status: status,
      headers: { "Content-Type": "application/json" },
    });
  }
  function fileToDataUrl(file) {
    return new Promise(function (resolve) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.readAsDataURL(file);
    });
  }
  function firstFile(form) {
    if (!form || typeof form.forEach !== "function") return null;
    var found = null;
    form.forEach(function (v) { if (!found && v instanceof Blob) found = v; });
    return found;
  }

  // Program fields: the branding page sends short names, the server stores brand* names.
  var ORG_FIELDS = {
    teamName: "brandTeamName", primaryColor: "brandPrimaryColor", secondaryColor: "brandSecondaryColor",
    motto: "brandMotto", mission: "brandMission", contactEmail: "brandContactEmail",
    welcomeMessage: "brandWelcomeMessage", backgroundHue: "brandBackgroundHue",
    backgroundStrength: "brandBackgroundStrength", headingFont: "brandHeadingFont",
    slug: "brandSlug", senderName: "brandSenderName",
  };
  function patchOrg(patch) {
    var org = body("/api/coach/branding") || {};
    var me = body("/api/branding/me") || {};
    Object.keys(patch).forEach(function (k) {
      var key = ORG_FIELDS[k] || k;
      org[key] = patch[k];
      if (key.indexOf("brand") === 0) me[key] = patch[k];
    });
    setBody("/api/coach/branding", org);
    setBody("/api/branding/me", me);
    return org;
  }
  function patchExtras(patch) {
    var org = body("/api/coach/branding") || {};
    var extras = Object.assign({}, org.brandExtras || {});
    Object.keys(patch).forEach(function (k) {
      if (patch[k] === null) delete extras[k];
      else extras[k] = patch[k];
    });
    org.brandExtras = extras;
    setBody("/api/coach/branding", org);
    var me = body("/api/branding/me");
    if (me) { me.brandExtras = extras; setBody("/api/branding/me", me); }
    return { brandExtras: extras };
  }
  function teams() { return body("/api/coach/teams") || []; }
  function patchTeam(id, patch) {
    var list = teams();
    var team = list.find(function (t) { return String(t.id) === String(id); });
    if (!team) return null;
    Object.keys(patch).forEach(function (k) { team[ORG_FIELDS[k] || k] = patch[k]; });
    setBody("/api/coach/teams", list);
    return team;
  }
  function patchStaff(id, patch) {
    var data = body("/api/coach/staff");
    if (!data) return;
    var s = (data.staff || []).find(function (x) { return String(x.id) === String(id); });
    if (s) Object.assign(s, patch);
    setBody("/api/coach/staff", data);
  }

  async function handle(method, url, init) {
    var path = url.pathname;
    var key = path + url.search;
    var payload = null;
    if (init && typeof init.body === "string") { try { payload = JSON.parse(init.body); } catch (e) { payload = null; } }
    var form = init && init.body && typeof init.body !== "string" ? init.body : null;
    var m;

    if (method === "GET") {
      var files = window.__FORGE_FILES__ || {};
      if (files[path]) {
        var raw = atob(files[path].base64);
        var bytes = new Uint8Array(raw.length);
        for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
        return new Response(bytes, { status: 200, headers: { "Content-Type": files[path].type } });
      }
      if (state[key]) return json(state[key].status, state[key].body);
      if (state[path]) return json(state[path].status, state[path].body);
      return json(404, { message: "This screen is not part of the personalization preview." });
    }

    if (path === "/api/coach/branding" && method === "PATCH") return json(200, patchOrg(payload || {}));
    if (path === "/api/coach/branding/extras" && method === "PATCH") return json(200, patchExtras(payload || {}));
    if (path === "/api/coach/branding/logo") {
      if (method === "DELETE") return json(200, patchOrg({ brandLogoUrl: null }));
      var logo = await fileToDataUrl(firstFile(form));
      return json(201, patchOrg({ brandLogoUrl: logo }));
    }
    if ((m = path.match(/^\/api\/coach\/branding\/(wordmark|background)$/))) {
      var field = m[1] === "wordmark" ? "wordmarkUrl" : "backgroundImageUrl";
      var patch = {};
      patch[field] = method === "DELETE" ? null : await fileToDataUrl(firstFile(form));
      return json(201, patchExtras(patch));
    }
    if (path === "/api/coach/branding/test-email") return json(200, { ok: true });
    if (path === "/api/coach/features") {
      var org = body("/api/coach/branding") || {};
      org.features = Object.assign({}, org.features || {}, payload || {});
      setBody("/api/coach/branding", org);
      return json(200, org.features);
    }
    if ((m = path.match(/^\/api\/coach\/teams\/(\d+)\/branding$/))) return json(200, patchTeam(m[1], payload || {}));
    if ((m = path.match(/^\/api\/coach\/teams\/(\d+)\/branding\/logo$/))) {
      var teamLogo = method === "DELETE" ? null : await fileToDataUrl(firstFile(form));
      return json(201, patchTeam(m[1], { brandLogoUrl: teamLogo }));
    }
    if (path === "/api/coach/exercise-page-theme") {
      var current = body(path) || { theme: {}, entitled: true };
      current.theme = Object.assign({}, current.theme || {}, payload || {});
      setBody(path, current);
      return json(200, current);
    }
    if ((m = path.match(/^\/api\/coach\/staff\/(\d+)\/permissions$/))) { patchStaff(m[1], payload || {}); return json(200, { ok: true }); }
    if ((m = path.match(/^\/api\/coach\/staff\/(\d+)\/title$/))) { patchStaff(m[1], { staffTitle: payload && payload.title }); return json(200, { ok: true }); }
    if ((m = path.match(/^(\/api\/coach\/exercises\/\d+\/program-video)(\/upload)?$/))) {
      if (method === "DELETE") { setBody(m[1], { videoUrl: null }); return new Response(null, { status: 204 }); }
      var videoUrl = m[2] ? URL.createObjectURL(firstFile(form)) : payload && payload.videoUrl;
      setBody(m[1], { videoUrl: videoUrl });
      return json(m[2] ? 201 : 200, { videoUrl: videoUrl });
    }
    // Anything else that writes (a CSP report, a seen-marker) is accepted and forgotten.
    return json(200, {});
  }

  var realFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    var url = new URL(raw, location.origin);
    if (url.pathname.indexOf("/api/") === 0) {
      var method = ((init && init.method) || (input && input.method) || "GET").toUpperCase();
      return handle(method, url, init);
    }
    return realFetch(input, init);
  };
  // The app has no service worker here, and a beacon has nowhere to go.
  if (navigator.sendBeacon) navigator.sendBeacon = function () { return true; };
})();
