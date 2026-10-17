/* First-party counts. Stays on this device unless /studio/hit exists (optional worker). */
(function () {
  "use strict";
  var KEY_V = "kui.pulse.visits";
  var KEY_D = "kui.pulse.downloads";
  var KEY_S = "kui.pulse.session";
  var KEY_H = "kui.pulse.here";

  function num(key) {
    try {
      return Number(localStorage.getItem(key) || 0) || 0;
    } catch {
      return 0;
    }
  }

  function set(key, value) {
    try {
      localStorage.setItem(key, String(value));
    } catch {
      /* quota */
    }
  }

  function ping(body) {
    try {
      fetch("/studio/hit", { method: "POST", keepalive: true, body: body, mode: "same-origin" }).catch(function () {
        /* no worker */
      });
    } catch {
      /* offline */
    }
  }

  try {
    if (!sessionStorage.getItem(KEY_S)) {
      sessionStorage.setItem(KEY_S, "1");
      set(KEY_V, num(KEY_V) + 1);
    }
  } catch {
    /* private mode */
  }

  document.addEventListener(
    "click",
    function (e) {
      var node = e.target && e.target.closest ? e.target.closest("a[download], a[data-kui-zip]") : null;
      if (!node) return;
      set(KEY_D, num(KEY_D) + 1);
      ping("d");
    },
    true,
  );

  ping("v");

  try {
    var ch = new BroadcastChannel("kui-pulse");
    var id = Math.random().toString(36).slice(2);
    var live = {};
    live[id] = Date.now();
    ch.onmessage = function (ev) {
      if (!ev.data) return;
      if (ev.data.t === "ping") live[ev.data.id] = Date.now();
      if (ev.data.t === "bye") delete live[ev.data.id];
    };
    var tick = function () {
      var now = Date.now();
      var n = 0;
      Object.keys(live).forEach(function (k) {
        if (now - live[k] < 8000) n += 1;
        else delete live[k];
      });
      live[id] = now;
      try {
        sessionStorage.setItem(KEY_H, String(Math.max(1, n)));
      } catch {
        /* private mode */
      }
      ch.postMessage({ t: "ping", id: id });
    };
    tick();
    setInterval(tick, 2500);
    window.addEventListener("pagehide", function () {
      ch.postMessage({ t: "bye", id: id });
    });
  } catch {
    try {
      sessionStorage.setItem(KEY_H, "1");
    } catch {
      /* private mode */
    }
  }
})();
