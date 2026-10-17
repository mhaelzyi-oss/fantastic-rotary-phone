(function () {
  "use strict";
  var file = null;
  function label(id, suffix) {
    var el = KuiUi.qs("#" + id);
    KuiUi.qs("#" + id + "-label").textContent = el.value + suffix;
  }
  KuiUi.qs("#scale").addEventListener("input", function () {
    label("scale", "%");
  });
  KuiUi.qs("#quality").addEventListener("input", function () {
    label("quality", "%");
  });
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
    KuiUi.busy(true);
    KuiUi.status("Encoding… this stays on your computer.");
    KuiCodecs.compressFile(file, {
      scale: Number(KuiUi.qs("#scale").value) / 100,
      quality: Number(KuiUi.qs("#quality").value) / 100,
    })
      .then(function (out) {
        var name = KuiUi.baseName(file.name) + "-small." + out.nameExt;
        KuiUi.download(out.blob, name);
        KuiUi.status("Saved " + name, "ok");
      })
      .catch(KuiUi.catch)
      .then(function () {
        KuiUi.busy(false);
      });
  });
})();
