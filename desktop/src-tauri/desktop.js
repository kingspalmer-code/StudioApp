// Runs on every page the Oatcake Mac app shows (see src/lib.rs). The app can't receive web push,
// so while it's open this asks oatcake.xyz once a minute for new client requests and shows each
// one as a Mac notification.
(function () {
  if (window.top !== window || !/(^|\.)oatcake\.xyz$/.test(location.hostname)) return;
  // Tells the site it's inside the app, so it makes room for the window buttons, and that the
  // window is frosted glass, so it lets the sidebar and background show through (see globals.css).
  window.__OATCAKE_GLASS__ = true;
  var markApp = function () { document.documentElement.classList.add("in-app", "app-glass"); };
  if (document.documentElement) markApp();
  else document.addEventListener("DOMContentLoaded", markApp);

  // Browser shortcuts the app window doesn't have on its own: reload, back and forward.
  document.addEventListener("keydown", function (e) {
    if (!e.metaKey || e.altKey || e.ctrlKey) return;
    if (e.key === "r") location.reload();
    else if (e.key === "[") history.back();
    else if (e.key === "]") history.forward();
    else return;
    e.preventDefault();
  });
  var invoke = function (cmd, args) {
    return window.__TAURI_INTERNALS__.invoke(cmd, args || {});
  };
  var KEY = "oatcake-desktop-since";
  var busy = false;

  async function check() {
    if (busy) return;
    busy = true;
    try {
      var since = localStorage.getItem(KEY);
      if (!since) {
        // First run: start from now rather than announcing everything already in the queue.
        localStorage.setItem(KEY, new Date().toISOString());
        return;
      }
      var res = await fetch("/api/desktop/alerts?since=" + encodeURIComponent(since), { credentials: "same-origin" });
      if (!res.ok) return;
      var data = await res.json();
      if (data.now) localStorage.setItem(KEY, data.now);
      for (var i = 0; i < (data.alerts || []).length; i++) {
        var a = data.alerts[i];
        await invoke("plugin:notification|notify", { options: { title: a.title, body: a.body } });
      }
    } catch (e) {
      // Offline or signed out: try again next minute.
    } finally {
      busy = false;
    }
  }

  // The frost follows the Mac's light or dark mode unless Oatcake is set to one (data-theme on <html>).
  var theme;
  function syncTheme() {
    var t = document.documentElement.getAttribute("data-theme");
    t = t === "light" || t === "dark" ? t : null;
    if (t === theme) return;
    theme = t;
    invoke("plugin:window|set_theme", { value: t }).catch(function () {});
  }

  async function start() {
    syncTheme();
    new MutationObserver(syncTheme).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    try {
      var granted = await invoke("plugin:notification|is_permission_granted");
      if (!granted) await invoke("plugin:notification|request_permission");
    } catch (e) {}
    check();
    setInterval(check, 60000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
