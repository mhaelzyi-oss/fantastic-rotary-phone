/* WebCodecs helpers plus a local <video> fallback. No network. */
(function (global) {
  "use strict";

  var KuiCodecs = {};

  function loadVideo(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.preload = "metadata";
      video.src = url;
      video.onloadedmetadata = function () {
        resolve({ video: video, url: url });
      };
      video.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error("This browser could not decode that file."));
      };
    });
  }

  KuiCodecs.revoke = function (url) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  };

  KuiCodecs.drawFrame = function (video, maxWidth) {
    var w = video.videoWidth;
    var h = video.videoHeight;
    if (!w || !h) throw new Error("No video frames in this file.");
    if (maxWidth && w > maxWidth) {
      h = Math.max(1, Math.round((h * maxWidth) / w));
      w = maxWidth;
    }
    w -= w % 2;
    h -= h % 2;
    var canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, w, h);
    return { canvas: canvas, ctx: ctx, width: w, height: h };
  };

  KuiCodecs.seek = function (video, time) {
    return new Promise(function (resolve, reject) {
      function ok() {
        video.removeEventListener("seeked", ok);
        video.removeEventListener("error", bad);
        resolve();
      }
      function bad() {
        video.removeEventListener("seeked", ok);
        video.removeEventListener("error", bad);
        reject(new Error("Could not seek in this file."));
      }
      video.addEventListener("seeked", ok);
      video.addEventListener("error", bad);
      try {
        video.currentTime = Math.min(Math.max(0, time), Math.max(0, (video.duration || 0) - 0.001));
      } catch {
        bad();
      }
    });
  };

  KuiCodecs.captureFrames = async function (file, opts) {
    opts = opts || {};
    var start = opts.start || 0;
    var end = opts.end;
    var fps = opts.fps || 8;
    var maxWidth = opts.maxWidth || 480;
    var maxFrames = opts.maxFrames || 80;
    var loaded = await loadVideo(file);
    var video = loaded.video;
    var duration = video.duration;
    if (!isFinite(duration) || duration <= 0) {
      KuiCodecs.revoke(loaded.url);
      throw new Error("This file has no duration.");
    }
    if (end == null || end > duration) end = duration;
    if (end - start > 8) end = start + 8;
    var frames = [];
    var t = start;
    var step = 1 / fps;
    await video.play().catch(function () {});
    video.pause();
    while (t < end && frames.length < maxFrames) {
      await KuiCodecs.seek(video, t);
      var drawn = KuiCodecs.drawFrame(video, maxWidth);
      var image = drawn.ctx.getImageData(0, 0, drawn.width, drawn.height);
      frames.push({ image: image, width: drawn.width, height: drawn.height, time: t });
      t += step;
    }
    KuiCodecs.revoke(loaded.url);
    if (!frames.length) throw new Error("No frames in that range.");
    return frames;
  };

  KuiCodecs.pickVideoEncoder = async function (width, height, bitrate) {
    if (typeof VideoEncoder === "undefined") return null;
    var candidates = [
      { codec: "avc1.42001E", avc: { format: "avc" }, container: "mp4" },
      { codec: "avc1.4D401E", avc: { format: "avc" }, container: "mp4" },
      { codec: "vp8", container: "webm" },
      { codec: "vp09.00.10.08", container: "webm" },
    ];
    var i, cfg, support;
    for (i = 0; i < candidates.length; i++) {
      cfg = {
        codec: candidates[i].codec,
        width: width,
        height: height,
        bitrate: bitrate,
        framerate: 30,
        latencyMode: "quality",
      };
      if (candidates[i].avc) cfg.avc = candidates[i].avc;
      try {
        support = await VideoEncoder.isConfigSupported(cfg);
        if (support && support.supported) {
          return { config: support.config || cfg, container: candidates[i].container, codec: candidates[i].codec };
        }
      } catch {
        /* try next */
      }
    }
    return null;
  };

  KuiCodecs.compressFile = async function (file, opts) {
    opts = opts || {};
    var scale = opts.scale || 0.7;
    var quality = opts.quality || 0.6;
    var loaded = await loadVideo(file);
    var video = loaded.video;
    var duration = video.duration;
    if (!isFinite(duration) || duration <= 0) {
      KuiCodecs.revoke(loaded.url);
      throw new Error("This file has no duration.");
    }
    var srcW = video.videoWidth;
    var srcH = video.videoHeight;
    var width = Math.max(2, Math.round((srcW * scale) / 2) * 2);
    var height = Math.max(2, Math.round((srcH * scale) / 2) * 2);
    var bitrate = Math.max(120_000, Math.round(900_000 * quality * scale));
    var encoderPick = await KuiCodecs.pickVideoEncoder(width, height, bitrate);

    if (encoderPick && encoderPick.container === "mp4" && typeof VideoFrame !== "undefined") {
      var chunks = [];
      var description = null;
      var encoder = new VideoEncoder({
        output: function (chunk, meta) {
          if (meta && meta.decoderConfig && meta.decoderConfig.description) description = new Uint8Array(meta.decoderConfig.description);
          var buf = new Uint8Array(chunk.byteLength);
          chunk.copyTo(buf);
          chunks.push({
            data: buf,
            dts: chunk.timestamp,
            cts: chunk.timestamp,
            duration: chunk.duration || 33333,
            isSync: chunk.type === "key",
          });
        },
        error: function (e) {
          KuiUi.status(e.message || String(e), "err");
        },
      });
      encoder.configure(encoderPick.config);
      var fps = 24;
      var step = 1 / fps;
      var t = 0;
      var i = 0;
      await video.play().catch(function () {});
      video.pause();
      while (t < duration) {
        await KuiCodecs.seek(video, t);
        var frame = new VideoFrame(video, { timestamp: Math.round(t * 1e6), duration: Math.round(step * 1e6) });
        encoder.encode(frame, { keyFrame: i % 24 === 0 });
        frame.close();
        i++;
        t += step;
      }
      await encoder.flush();
      encoder.close();
      KuiCodecs.revoke(loaded.url);
      if (!chunks.length || !description) throw new Error("Encoding produced no samples.");
      var track = {
        handler: "vide",
        timescale: 1e6,
        width: width,
        height: height,
        codec: "avc1",
        sampleDesc: KuiMp4.makeAvc1Desc(width, height, description),
        samples: chunks.map(function (c) {
          return {
            data: c.data,
            dts: c.dts,
            cts: c.cts,
            duration: Math.max(1, c.duration),
            isSync: c.isSync,
          };
        }),
      };
      var bytes = KuiMp4.build([track]);
      return { blob: new Blob([bytes], { type: "video/mp4" }), nameExt: "mp4" };
    }

    if (typeof MediaRecorder === "undefined" || !window.MediaRecorder) {
      KuiCodecs.revoke(loaded.url);
      throw new Error("This browser cannot compress video (no WebCodecs encoder or MediaRecorder).");
    }
    var stream;
    try {
      stream = video.captureStream ? video.captureStream() : video.mozCaptureStream();
    } catch {
      KuiCodecs.revoke(loaded.url);
      throw new Error("This browser cannot capture the decoded video.");
    }
    var mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : MediaRecorder.isTypeSupported("video/webm;codecs=vp8")
        ? "video/webm;codecs=vp8"
        : "video/webm";
    var rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrate });
    var parts = [];
    rec.ondataavailable = function (e) {
      if (e.data && e.data.size) parts.push(e.data);
    };
    var stopped = new Promise(function (resolve, reject) {
      rec.onstop = resolve;
      rec.onerror = function () {
        reject(new Error("Recording failed."));
      };
    });
    rec.start();
    try {
      await video.play();
    } catch {
      rec.stop();
      KuiCodecs.revoke(loaded.url);
      throw new Error("Could not play this file locally.");
    }
    await new Promise(function (resolve) {
      video.onended = resolve;
      setTimeout(resolve, Math.min(duration * 1000 + 250, 10 * 60 * 1000));
    });
    if (rec.state !== "inactive") rec.stop();
    await stopped;
    stream.getTracks().forEach(function (tr) {
      tr.stop();
    });
    KuiCodecs.revoke(loaded.url);
    return { blob: new Blob(parts, { type: "video/webm" }), nameExt: "webm" };
  };

  KuiCodecs.loadVideo = loadVideo;
  global.KuiCodecs = KuiCodecs;
})(typeof globalThis !== "undefined" ? globalThis : this);
