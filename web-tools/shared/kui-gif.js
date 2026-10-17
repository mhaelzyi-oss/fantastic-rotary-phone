/* GIF89a encoder. Local frames only. */
(function (global) {
  "use strict";

  function lzw(minCodeSize, indexStream) {
    var clear = 1 << minCodeSize;
    var eoi = clear + 1;
    var codeSize = minCodeSize + 1;
    var nextCode = eoi + 1;
    var dict = Object.create(null);
    var bits = [];
    var bitLen = 0;

    function write(code, size) {
      bits.push({ code: code, size: size });
      bitLen += size;
    }

    function reset() {
      dict = Object.create(null);
      codeSize = minCodeSize + 1;
      nextCode = eoi + 1;
    }

    write(clear, codeSize);
    var w = String.fromCharCode(indexStream[0]);
    var i, k, wk;
    for (i = 1; i < indexStream.length; i++) {
      k = String.fromCharCode(indexStream[i]);
      wk = w + k;
      if (dict[wk] != null) {
        w = wk;
      } else {
        write(w.length === 1 ? w.charCodeAt(0) : dict[w], codeSize);
        dict[wk] = nextCode++;
        if (nextCode === 1 << codeSize && codeSize < 12) codeSize++;
        if (nextCode === 4096) {
          write(clear, codeSize);
          reset();
        }
        w = k;
      }
    }
    write(w.length === 1 ? w.charCodeAt(0) : dict[w], codeSize);
    write(eoi, codeSize);

    var out = new Uint8Array(Math.ceil(bitLen / 8));
    var acc = 0, nbits = 0, o = 0;
    for (i = 0; i < bits.length; i++) {
      acc |= bits[i].code << nbits;
      nbits += bits[i].size;
      while (nbits >= 8) {
        out[o++] = acc & 255;
        acc >>= 8;
        nbits -= 8;
      }
    }
    if (nbits) out[o++] = acc & 255;
    return out.subarray(0, o);
  }

  function paletteIndex(r, g, b) {
    return ((r >> 5) << 5) | ((g >> 5) << 2) | (b >> 6);
  }

  function paletteColors() {
    var colors = new Uint8Array(256 * 3);
    var i, r, g, b;
    for (i = 0; i < 256; i++) {
      r = ((i >> 5) & 7) * 36;
      g = ((i >> 2) & 7) * 36;
      b = (i & 3) * 85;
      colors[i * 3] = r;
      colors[i * 3 + 1] = g;
      colors[i * 3 + 2] = b;
    }
    return colors;
  }

  function indexFrame(data, width, height) {
    var idx = new Uint8Array(width * height);
    var i, p;
    for (i = 0, p = 0; i < idx.length; i++, p += 4) {
      idx[i] = paletteIndex(data[p], data[p + 1], data[p + 2]);
    }
    return idx;
  }

  function blockData(bytes) {
    var parts = [];
    var i = 0;
    while (i < bytes.length) {
      var n = Math.min(255, bytes.length - i);
      var chunk = new Uint8Array(n + 1);
      chunk[0] = n;
      chunk.set(bytes.subarray(i, i + n), 1);
      parts.push(chunk);
      i += n;
    }
    parts.push(new Uint8Array([0]));
    var len = 0, p = 0, j;
    for (j = 0; j < parts.length; j++) len += parts[j].length;
    var out = new Uint8Array(len);
    for (j = 0; j < parts.length; j++) {
      out.set(parts[j], p);
      p += parts[j].length;
    }
    return out;
  }

  function encode(frames, width, height, delayCs) {
    if (!frames.length) throw new Error("No frames to encode.");
    var header = new Uint8Array([71, 73, 70, 56, 57, 97]);
    var w = new Uint8Array([width & 255, (width >> 8) & 255, height & 255, (height >> 8) & 255, 0xf7, 0, 0]);
    var pal = paletteColors();
    var loop = new Uint8Array([0x21, 0xff, 0x0b, 78, 69, 84, 83, 67, 65, 80, 69, 50, 46, 48, 0x03, 0x01, 0, 0, 0]);
    var parts = [header, w, pal, loop];
    var i, gce, img, minCode, compressed;
    var delay = Math.max(2, delayCs | 0);
    for (i = 0; i < frames.length; i++) {
      gce = new Uint8Array([0x21, 0xf9, 0x04, 0x00, delay & 255, (delay >> 8) & 255, 0, 0]);
      img = new Uint8Array([0x2c, 0, 0, 0, 0, width & 255, (width >> 8) & 255, height & 255, (height >> 8) & 255, 0, 8]);
      minCode = 8;
      compressed = lzw(minCode, frames[i]);
      parts.push(gce, img, blockData(compressed));
    }
    parts.push(new Uint8Array([0x3b]));
    var n = 0, o = 0;
    for (i = 0; i < parts.length; i++) n += parts[i].length;
    var out = new Uint8Array(n);
    for (i = 0; i < parts.length; i++) {
      out.set(parts[i], o);
      o += parts[i].length;
    }
    return out;
  }

  global.KuiGif = { encode: encode, indexFrame: indexFrame };
})(typeof globalThis !== "undefined" ? globalThis : this);
