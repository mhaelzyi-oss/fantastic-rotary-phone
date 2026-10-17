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
    KuiUi.status("Trimming…");
    KuiUi.readFile(file)
      .then(function (buf) {
        var movie = KuiMp4.parse(buf);
        var why = KuiMp4.refuseReason(movie);
        if (why) throw new Error(why);
        var tracks = movie.tracks
          .filter(function (t) {
            return (t.handler === "vide" || t.handler === "soun") && t.samples.length;
          })
          .map(function (t) {
            return KuiMp4.sliceTrack(t, start, end);
          });
        var bytes = KuiMp4.build(tracks);
        var name = KuiUi.baseName(file.name) + "-trim.mp4";
        KuiUi.download(new Blob([bytes], { type: "video/mp4" }), name);
        KuiUi.status("Saved " + name, "ok");
      })
      .catch(KuiUi.catch)
      .then(function () {
        KuiUi.busy(false);
      });
  });
})();
