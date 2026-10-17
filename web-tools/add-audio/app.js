(function () {
  "use strict";
  var videoFile = null;
  var audioFile = null;
  function show() {
    KuiUi.qs("#files").textContent = [videoFile && videoFile.name, audioFile && audioFile.name].filter(Boolean).join(" + ");
  }
  KuiUi.bindDrop(KuiUi.qs("#drop-video"), function (files) {
    videoFile = files[0] || null;
    show();
  });
  KuiUi.bindDrop(KuiUi.qs("#drop-audio"), function (files) {
    audioFile = files[0] || null;
    show();
  });
  KuiUi.qs("#run").addEventListener("click", function () {
    if (!videoFile || !audioFile) {
      KuiUi.status("Choose a local video and a local audio file.", "err");
      return;
    }
    KuiUi.busy(true);
    KuiUi.status("Muxing…");
    Promise.all([KuiUi.readFile(videoFile), KuiUi.readFile(audioFile)])
      .then(function (bufs) {
        var videoMovie = KuiMp4.parse(bufs[0]);
        var audioMovie = KuiMp4.parse(bufs[1]);
        var why = KuiMp4.refuseReason(videoMovie) || KuiMp4.refuseReason(audioMovie);
        if (why) throw new Error(why);
        var video = KuiMp4.videoTracks(videoMovie);
        var audio = KuiMp4.audioTracks(audioMovie);
        if (!video.length) throw new Error("The first file has no video track.");
        if (!audio.length) throw new Error("The second file has no audio track.");
        var vDur = KuiMp4.seconds(video[0]);
        var aTrack = audio[0];
        if (KuiMp4.seconds(aTrack) > vDur) aTrack = KuiMp4.sliceTrack(aTrack, 0, vDur);
        var bytes = KuiMp4.build(video.concat([aTrack]));
        var name = KuiUi.baseName(videoFile.name) + "-audio.mp4";
        KuiUi.download(new Blob([bytes], { type: "video/mp4" }), name);
        KuiUi.status("Saved " + name, "ok");
      })
      .catch(KuiUi.catch)
      .then(function () {
        KuiUi.busy(false);
      });
  });
})();
