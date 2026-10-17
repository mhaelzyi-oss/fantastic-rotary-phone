(function () {
  "use strict";
  var files = [];
  KuiUi.bindDrop(KuiUi.qs("#drop"), function (picked) {
    files = picked.slice(0, 20);
    KuiUi.qs("#files").textContent = files.map(function (f) {
      return f.name;
    }).join("\n");
    KuiUi.status(files.length ? files.length + " files" : "");
  });
  KuiUi.qs("#run").addEventListener("click", function () {
    if (files.length < 2) {
      KuiUi.status("Choose at least two local files.", "err");
      return;
    }
    KuiUi.busy(true);
    KuiUi.status("Joining…");
    Promise.all(files.map(KuiUi.readFile))
      .then(function (bufs) {
        var movies = bufs.map(function (buf) {
          var movie = KuiMp4.parse(buf);
          var why = KuiMp4.refuseReason(movie);
          if (why) throw new Error(why);
          return movie;
        });
        var videos = movies.map(function (m) {
          return KuiMp4.videoTracks(m)[0];
        }).filter(Boolean);
        var audios = movies.map(function (m) {
          return KuiMp4.audioTracks(m)[0];
        }).filter(Boolean);
        var out = [];
        if (videos.length) {
          if (videos.length !== movies.length) throw new Error("Every clip needs a video track to merge video.");
          out.push(KuiMp4.concatTracks(videos));
        }
        if (audios.length === movies.length) out.push(KuiMp4.concatTracks(audios));
        if (!out.length) throw new Error("Nothing to join.");
        var bytes = KuiMp4.build(out);
        var name = KuiUi.baseName(files[0].name) + "-merge.mp4";
        KuiUi.download(new Blob([bytes], { type: "video/mp4" }), name);
        KuiUi.status("Saved " + name, "ok");
      })
      .catch(KuiUi.catch)
      .then(function () {
        KuiUi.busy(false);
      });
  });
})();
