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
    KuiUi.busy(true);
    KuiUi.status("Extracting audio…");
    KuiUi.readFile(file)
      .then(function (buf) {
        var movie = KuiMp4.parse(buf);
        var why = KuiMp4.refuseReason(movie);
        if (why) throw new Error(why);
        var audio = KuiMp4.audioTracks(movie);
        if (!audio.length) throw new Error("No audio track in this file.");
        var bytes = KuiMp4.build(audio);
        var name = KuiUi.baseName(file.name) + ".m4a";
        KuiUi.download(new Blob([bytes], { type: "audio/mp4" }), name);
        KuiUi.status("Saved " + name, "ok");
      })
      .catch(KuiUi.catch)
      .then(function () {
        KuiUi.busy(false);
      });
  });
})();
