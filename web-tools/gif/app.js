(function () {
  "use strict";
  var file = null;
  KuiUi.bindDrop(KuiUi.qs("#drop"), function (files) {
    file = files[0] || null;
    KuiUi.qs("#files").textContent = file ? file.name : "";
    KuiUi.status(file ? "Ready." : "");
  });
  KuiUi.qs("#run").addEventListener("click", function () {
    if (!file) {
      KuiUi.status("Choose a local file.", "err");
      return;
    }
    var start = Number(KuiUi.qs("#start").value || 0);
    var end = Number(KuiUi.qs("#end").value || 0);
    KuiUi.busy(true);
    KuiUi.status("Grabbing frames…");
    KuiCodecs.captureFrames(file, { start: start, end: end, fps: 8, maxWidth: 480, maxFrames: 64 })
      .then(function (frames) {
        KuiUi.status("Encoding GIF…");
        var indexed = frames.map(function (f) {
          return KuiGif.indexFrame(f.image.data, f.width, f.height);
        });
        var bytes = KuiGif.encode(indexed, frames[0].width, frames[0].height, 12);
        var name = KuiUi.baseName(file.name) + ".gif";
        KuiUi.download(new Blob([bytes], { type: "image/gif" }), name);
        KuiUi.status("Saved " + name, "ok");
      })
      .catch(KuiUi.catch)
      .then(function () {
        KuiUi.busy(false);
      });
  });
})();
