(function () {
  "use strict";
  var hash = (document.body.getAttribute("data-studio-hash") || "").toLowerCase();
  var gate = document.getElementById("gate");
  var pulse = document.getElementById("pulse");
  var status = document.getElementById("status");

  function hex(buf) {
    return Array.from(new Uint8Array(buf))
      .map(function (b) {
        return b.toString(16).padStart(2, "0");
      })
      .join("");
  }

  function sha(text) {
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)).then(hex);
  }

  function readLocal() {
    var here = "1";
    var visits = "0";
    var downloads = "0";
    try {
      here = sessionStorage.getItem("kui.pulse.here") || "1";
      visits = localStorage.getItem("kui.pulse.visits") || "0";
      downloads = localStorage.getItem("kui.pulse.downloads") || "0";
    } catch {
      /* private mode */
    }
    return { here: here, visits: visits, downloads: downloads };
  }

  function show(data) {
    document.getElementById("here").textContent = data.here;
    document.getElementById("visits").textContent = data.visits;
    document.getElementById("downloads").textContent = data.downloads;
    pulse.hidden = false;
    gate.hidden = true;
  }

  function fail(msg) {
    status.hidden = false;
    status.textContent = msg;
  }

  if (!hash) {
    fail("Set STUDIO_KEY when building the site.");
    gate.hidden = true;
    return;
  }

  gate.addEventListener("submit", function (e) {
    e.preventDefault();
    var key = document.getElementById("key").value;
    sha(key).then(function (got) {
      if (got !== hash) {
        fail("Wrong passphrase.");
        return;
      }
      status.hidden = true;
      fetch("/studio/stats", { headers: { "X-Kui-Key": key } })
        .then(function (res) {
          if (!res.ok) throw new Error("local");
          return res.json();
        })
        .then(show)
        .catch(function () {
          show(readLocal());
        });
    });
  });
})();
