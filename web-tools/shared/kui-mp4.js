/* ISO BMFF remux: parse MP4/M4A/MOV, copy samples, write a clean ftyp+moov+mdat file. No network. No decrypt. */
(function (global) {
  "use strict";

  var MAX_BYTES = 512 * 1024 * 1024;
  var KuiMp4 = { MAX_BYTES: MAX_BYTES };

  function concat(parts) {
    var i, n = 0;
    for (i = 0; i < parts.length; i++) n += parts[i].length;
    var out = new Uint8Array(n), o = 0;
    for (i = 0; i < parts.length; i++) {
      out.set(parts[i], o);
      o += parts[i].length;
    }
    return out;
  }

  function u8(n) {
    return new Uint8Array([n & 255]);
  }

  function u16(n) {
    return new Uint8Array([(n >>> 8) & 255, n & 255]);
  }

  function u32(n) {
    return new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
  }

  function i32(n) {
    return u32(n);
  }

  function fourcc(s) {
    return new Uint8Array([s.charCodeAt(0), s.charCodeAt(1), s.charCodeAt(2), s.charCodeAt(3)]);
  }

  function typeAt(bytes, off) {
    return String.fromCharCode(bytes[off], bytes[off + 1], bytes[off + 2], bytes[off + 3]);
  }

  function viewOf(bytes) {
    return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  function box(type, payload) {
    return concat([u32(8 + payload.length), fourcc(type), payload]);
  }

  function fullBox(type, ver, flags, payload) {
    return box(type, concat([u8(ver), u8((flags >>> 16) & 255), u8((flags >>> 8) & 255), u8(flags & 255), payload]));
  }

  function readBox(bytes, off, end) {
    if (off + 8 > end) return null;
    var v = viewOf(bytes);
    var size = v.getUint32(off);
    var type = typeAt(bytes, off + 4);
    var header = 8;
    if (size === 1) {
      if (off + 16 > end) return null;
      size = v.getUint32(off + 8) * 0x100000000 + v.getUint32(off + 12);
      header = 16;
    } else if (size === 0) {
      size = end - off;
    }
    if (size < header || off + size > end) return null;
    return { type: type, size: size, header: header, start: off, end: off + size };
  }

  function walk(bytes, start, end, fn) {
    var off = start;
    while (off + 8 <= end) {
      var b = readBox(bytes, off, end);
      if (!b) break;
      fn(b);
      off = b.end;
    }
  }

  function children(bytes, parent) {
    var list = [];
    walk(bytes, parent.start + parent.header, parent.end, function (c) {
      list.push(c);
    });
    return list;
  }

  function child(bytes, parent, type) {
    var found = null;
    walk(bytes, parent.start + parent.header, parent.end, function (c) {
      if (!found && c.type === type) found = c;
    });
    return found;
  }

  function sniff(bytes) {
    if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return "webm";
    if (bytes.length >= 12 && typeAt(bytes, 0) === "RIFF") return "riff";
    if (bytes.length >= 3 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return "id3";
    if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return "mpeg";
    if (bytes.length >= 8) {
      var t = typeAt(bytes, 4);
      if (t === "ftyp" || t === "moov" || t === "mdat" || t === "wide" || t === "free" || t === "skip" || t === "sidx" || t === "styp" || t === "moof") return "mp4";
    }
    return "unknown";
  }

  function sniffError(kind) {
    if (kind === "mp4") return null;
    if (kind === "webm") return "This is a WebM or Matroska file. Convert remuxes MP4, M4A, and MOV.";
    if (kind === "riff") return "This is an AVI or WAV file. Convert remuxes MP4, M4A, and MOV.";
    if (kind === "id3" || kind === "mpeg") return "This is an MP3 file. Convert remuxes MP4, M4A, and MOV.";
    return "This tool remuxes MP4, M4A, and MOV. Open a local media file, not a playlist or a web address.";
  }

  function readFullVer(bytes, box) {
    return bytes[box.start + box.header];
  }

  function mdhdTimescale(bytes, mdhd) {
    var v = viewOf(bytes);
    var p = mdhd.start + mdhd.header + 4;
    if (readFullVer(bytes, mdhd) === 1) p += 16;
    else p += 8;
    return v.getUint32(p);
  }

  function tkhdIdAndSize(bytes, tkhd) {
    var v = viewOf(bytes);
    var ver = readFullVer(bytes, tkhd);
    var p = tkhd.start + tkhd.header + 4;
    var id;
    var width = 0;
    var height = 0;
    if (ver === 1) {
      p += 16;
      id = v.getUint32(p);
      p += 4 + 4 + 8 + 8 + 2 + 2 + 2 + 2 + 36;
    } else {
      p += 8;
      id = v.getUint32(p);
      p += 4 + 4 + 4 + 8 + 2 + 2 + 2 + 2 + 36;
    }
    if (p + 8 <= tkhd.end) {
      width = Math.round(v.getUint32(p) / 65536);
      height = Math.round(v.getUint32(p + 4) / 65536);
    }
    return { id: id, width: width, height: height };
  }

  function hdlrType(bytes, hdlr) {
    var p = hdlr.start + hdlr.header + 4 + 4;
    return typeAt(bytes, p);
  }

  function readStts(bytes, box) {
    var v = viewOf(bytes);
    var p = box.start + box.header + 4;
    var count = v.getUint32(p);
    p += 4;
    var durs = [];
    var i, j, c, d;
    for (i = 0; i < count; i++) {
      c = v.getUint32(p);
      d = v.getUint32(p + 4);
      p += 8;
      for (j = 0; j < c; j++) durs.push(d);
    }
    return durs;
  }

  function readStsz(bytes, box) {
    var v = viewOf(bytes);
    var p = box.start + box.header + 4;
    var uniform = v.getUint32(p);
    p += 4;
    var count = v.getUint32(p);
    p += 4;
    var sizes = [];
    var i;
    if (uniform) {
      for (i = 0; i < count; i++) sizes.push(uniform);
    } else {
      for (i = 0; i < count; i++) {
        sizes.push(v.getUint32(p));
        p += 4;
      }
    }
    return sizes;
  }

  function readOffsets(bytes, box, wide) {
    var v = viewOf(bytes);
    var p = box.start + box.header + 4;
    var count = v.getUint32(p);
    p += 4;
    var offs = [];
    var i;
    for (i = 0; i < count; i++) {
      if (wide) {
        offs.push(v.getUint32(p) * 0x100000000 + v.getUint32(p + 4));
        p += 8;
      } else {
        offs.push(v.getUint32(p));
        p += 4;
      }
    }
    return offs;
  }

  function readStsc(bytes, box) {
    var v = viewOf(bytes);
    var p = box.start + box.header + 4;
    var count = v.getUint32(p);
    p += 4;
    var rows = [];
    var i;
    for (i = 0; i < count; i++) {
      rows.push({ first: v.getUint32(p), spc: v.getUint32(p + 4), desc: v.getUint32(p + 8) });
      p += 12;
    }
    return rows;
  }

  function readStss(bytes, box, n) {
    var flags = new Array(n);
    var i;
    for (i = 0; i < n; i++) flags[i] = !box;
    if (!box) return flags;
    for (i = 0; i < n; i++) flags[i] = false;
    var v = viewOf(bytes);
    var p = box.start + box.header + 4;
    var count = v.getUint32(p);
    p += 4;
    for (i = 0; i < count; i++) {
      var idx = v.getUint32(p) - 1;
      p += 4;
      if (idx >= 0 && idx < n) flags[idx] = true;
    }
    return flags;
  }

  function readCtts(bytes, box, n) {
    var offs = new Array(n);
    var i;
    for (i = 0; i < n; i++) offs[i] = 0;
    if (!box) return offs;
    var v = viewOf(bytes);
    var ver = readFullVer(bytes, box);
    var p = box.start + box.header + 4;
    var count = v.getUint32(p);
    p += 4;
    var k = 0;
    var j, c, o;
    for (i = 0; i < count; i++) {
      c = v.getUint32(p);
      o = ver === 1 ? v.getInt32(p + 4) : v.getUint32(p + 4);
      p += 8;
      for (j = 0; j < c && k < n; j++, k++) offs[k] = o;
    }
    return offs;
  }

  function sampleFileOffsets(stsc, stco, stsz) {
    var offsets = new Array(stsz.length);
    var sample = 0;
    var i, c, s, chunkIndex, nextFirst, nChunks, pos;
    for (i = 0; i < stsc.length && sample < stsz.length; i++) {
      nextFirst = i + 1 < stsc.length ? stsc[i + 1].first : stco.length + 1;
      nChunks = nextFirst - stsc[i].first;
      for (c = 0; c < nChunks && sample < stsz.length; c++) {
        chunkIndex = stsc[i].first - 1 + c;
        pos = stco[chunkIndex];
        for (s = 0; s < stsc[i].spc && sample < stsz.length; s++) {
          offsets[sample] = pos;
          pos += stsz[sample];
          sample++;
        }
      }
    }
    return offsets;
  }

  function copySamples(bytes, sizes, fileOffs, durs, ctts, sync) {
    var samples = [];
    var dts = 0;
    var i, off, size;
    for (i = 0; i < sizes.length; i++) {
      size = sizes[i];
      off = fileOffs[i];
      if (off == null || off < 0 || off + size > bytes.length) {
        throw new Error("This file's sample table points outside the file.");
      }
      samples.push({
        data: bytes.subarray(off, off + size),
        dts: dts,
        cts: dts + (ctts[i] || 0),
        duration: durs[i] || 1,
        isSync: !!sync[i],
      });
      dts += durs[i] || 1;
    }
    return samples;
  }

  function descIsEncrypted(bytes, stsd) {
    var v = viewOf(bytes);
    var p = stsd.start + stsd.header + 4;
    var count = v.getUint32(p);
    p += 4;
    var i;
    for (i = 0; i < count && p + 8 <= stsd.end; i++) {
      var entry = readBox(bytes, p, stsd.end);
      if (!entry) break;
      if (entry.type === "encv" || entry.type === "enca" || entry.type === "encs") return true;
      var bad = false;
      walk(bytes, entry.start + entry.header, entry.end, function (c) {
        if (c.type === "sinf" || c.type === "tenc" || c.type === "schm") bad = true;
      });
      if (bad) return true;
      p = entry.end;
    }
    return false;
  }

  function sampleDescBytes(bytes, stsd) {
    var v = viewOf(bytes);
    var p = stsd.start + stsd.header + 4;
    var count = v.getUint32(p);
    p += 4;
    if (count < 1) throw new Error("No sample description in this track.");
    var entry = readBox(bytes, p, stsd.end);
    if (!entry) throw new Error("Broken sample description.");
    return { type: entry.type, bytes: bytes.subarray(entry.start, entry.end) };
  }

  function visualSize(desc) {
    if (desc.bytes.length < 40) return { width: 0, height: 0 };
    var v = viewOf(desc.bytes);
    return { width: v.getUint16(32), height: v.getUint16(34) };
  }

  function parseTrex(bytes, moov) {
    var map = {};
    var mvex = child(bytes, moov, "mvex");
    if (!mvex) return map;
    walk(bytes, mvex.start + mvex.header, mvex.end, function (c) {
      if (c.type !== "trex") return;
      var v = viewOf(bytes);
      var p = c.start + c.header + 4;
      var id = v.getUint32(p);
      map[id] = {
        desc: v.getUint32(p + 4),
        duration: v.getUint32(p + 8),
        size: v.getUint32(p + 12),
        flags: v.getUint32(p + 16),
      };
    });
    return map;
  }

  function parseFragments(bytes, topBoxes, trexById) {
    var byId = {};
    var i, moof, mdat, trafs;
    for (i = 0; i < topBoxes.length; i++) {
      if (topBoxes[i].type !== "moof") continue;
      moof = topBoxes[i];
      mdat = null;
      if (i + 1 < topBoxes.length && topBoxes[i + 1].type === "mdat") mdat = topBoxes[i + 1];
      trafs = children(bytes, moof).filter(function (c) {
        return c.type === "traf";
      });
      trafs.forEach(function (traf) {
        var tfhd = child(bytes, traf, "tfhd");
        var trun = child(bytes, traf, "trun");
        var tfdt = child(bytes, traf, "tfdt");
        if (!tfhd || !trun) return;
        var v = viewOf(bytes);
        var flags = (bytes[tfhd.start + tfhd.header + 1] << 16) | (bytes[tfhd.start + tfhd.header + 2] << 8) | bytes[tfhd.start + tfhd.header + 3];
        var p = tfhd.start + tfhd.header + 4;
        var id = v.getUint32(p);
        p += 4;
        var trex = trexById[id] || { duration: 0, size: 0, flags: 0 };
        var base = 0;
        var defDur = trex.duration;
        var defSize = trex.size;
        var defFlags = trex.flags;
        var defaultBaseIsMoof = !!(flags & 0x20000);
        if (flags & 0x1) {
          base = v.getUint32(p) * 0x100000000 + v.getUint32(p + 4);
          p += 8;
        }
        if (flags & 0x2) p += 4;
        if (flags & 0x8) {
          defDur = v.getUint32(p);
          p += 4;
        }
        if (flags & 0x10) {
          defSize = v.getUint32(p);
          p += 4;
        }
        if (flags & 0x20) {
          defFlags = v.getUint32(p);
          p += 4;
        }
        if (defaultBaseIsMoof) base = moof.start;
        var dts = 0;
        if (tfdt) {
          var dv = tfdt.start + tfdt.header;
          if (bytes[dv] === 1) dts = v.getUint32(dv + 4) * 0x100000000 + v.getUint32(dv + 8);
          else dts = v.getUint32(dv + 4);
        }
        var tFlags = (bytes[trun.start + trun.header + 1] << 16) | (bytes[trun.start + trun.header + 2] << 8) | bytes[trun.start + trun.header + 3];
        var tp = trun.start + trun.header + 4;
        var count = v.getUint32(tp);
        tp += 4;
        var dataOff = 0;
        var firstFlags = defFlags;
        if (tFlags & 0x1) {
          dataOff = v.getInt32(tp);
          tp += 4;
        }
        if (tFlags & 0x4) {
          firstFlags = v.getUint32(tp);
          tp += 4;
        }
        var cursor = (tFlags & 0x1 ? base + dataOff : mdat ? mdat.start + mdat.header : base);
        if (!byId[id]) byId[id] = [];
        var s;
        for (s = 0; s < count; s++) {
          var dur = defDur;
          var size = defSize;
          var sFlags = s === 0 ? firstFlags : defFlags;
          var cto = 0;
          if (tFlags & 0x100) {
            dur = v.getUint32(tp);
            tp += 4;
          }
          if (tFlags & 0x200) {
            size = v.getUint32(tp);
            tp += 4;
          }
          if (tFlags & 0x400) {
            sFlags = v.getUint32(tp);
            tp += 4;
          }
          if (tFlags & 0x800) {
            cto = v.getInt32(tp);
            tp += 4;
          }
          if (cursor + size > bytes.length) throw new Error("A fragment points outside the file.");
          byId[id].push({
            data: bytes.subarray(cursor, cursor + size),
            dts: dts,
            cts: dts + cto,
            duration: dur || 1,
            isSync: !(sFlags & 0x10000),
          });
          cursor += size;
          dts += dur || 1;
        }
      });
    }
    return byId;
  }

  function parseTrack(bytes, trak) {
    var tkhd = child(bytes, trak, "tkhd");
    var mdia = child(bytes, trak, "mdia");
    if (!tkhd || !mdia) return null;
    var mdhd = child(bytes, mdia, "mdhd");
    var hdlr = child(bytes, mdia, "hdlr");
    var minf = child(bytes, mdia, "minf");
    if (!mdhd || !hdlr || !minf) return null;
    var stbl = child(bytes, minf, "stbl");
    var meta = tkhdIdAndSize(bytes, tkhd);
    var handler = hdlrType(bytes, hdlr);
    var timescale = mdhdTimescale(bytes, mdhd);
    var encrypted = false;
    var desc = { type: "unknown", bytes: new Uint8Array(0) };
    var samples = [];
    if (stbl) {
      var stsd = child(bytes, stbl, "stsd");
      if (stsd) {
        encrypted = descIsEncrypted(bytes, stsd);
        desc = sampleDescBytes(bytes, stsd);
      }
      var stsz = child(bytes, stbl, "stsz") || child(bytes, stbl, "stz2");
      var stts = child(bytes, stbl, "stts");
      var stsc = child(bytes, stbl, "stsc");
      var stco = child(bytes, stbl, "stco");
      var co64 = child(bytes, stbl, "co64");
      var stss = child(bytes, stbl, "stss");
      var ctts = child(bytes, stbl, "ctts");
      if (stsz && stts && stsc && (stco || co64)) {
        var sizes = readStsz(bytes, stsz);
        if (sizes.length) {
          var durs = readStts(bytes, stts);
          var chunks = readOffsets(bytes, co64 || stco, !!co64);
          var map = readStsc(bytes, stsc);
          var offs = sampleFileOffsets(map, chunks, sizes);
          var sync = readStss(bytes, stss, sizes.length);
          var cto = readCtts(bytes, ctts, sizes.length);
          samples = copySamples(bytes, sizes, offs, durs, cto, sync);
        }
      }
    }
    var vis = handler === "vide" ? visualSize(desc) : { width: 0, height: 0 };
    return {
      id: meta.id,
      handler: handler,
      timescale: timescale,
      width: vis.width || meta.width,
      height: vis.height || meta.height,
      sampleDesc: desc.bytes,
      codec: desc.type,
      encrypted: encrypted,
      samples: samples,
    };
  }

  function parse(arrayBuffer) {
    if (arrayBuffer.byteLength > MAX_BYTES) throw new Error("This file is larger than 512 MB.");
    var bytes = arrayBuffer instanceof Uint8Array ? arrayBuffer : new Uint8Array(arrayBuffer);
    var kind = sniff(bytes);
    var why = sniffError(kind);
    if (why) throw new Error(why);
    var top = [];
    var encrypted = false;
    walk(bytes, 0, bytes.length, function (b) {
      top.push(b);
      if (b.type === "pssh") encrypted = true;
    });
    var moov = null;
    var i;
    for (i = 0; i < top.length; i++) if (top[i].type === "moov") moov = top[i];
    if (!moov) throw new Error("This MP4 has no movie header.");
    walk(bytes, moov.start + moov.header, moov.end, function (c) {
      if (c.type === "pssh") encrypted = true;
    });
    var trex = parseTrex(bytes, moov);
    var frag = parseFragments(bytes, top, trex);
    var tracks = [];
    walk(bytes, moov.start + moov.header, moov.end, function (c) {
      if (c.type !== "trak") return;
      var track = parseTrack(bytes, c);
      if (!track) return;
      if (track.encrypted) encrypted = true;
      if ((!track.samples || !track.samples.length) && frag[track.id]) track.samples = frag[track.id];
      tracks.push(track);
    });
    return { bytes: bytes, tracks: tracks, encrypted: encrypted };
  }

  function refuseReason(movie) {
    if (!movie) return "Could not read this file.";
    if (movie.encrypted) return "This file is protected. The tool will not open it.";
    if (!movie.tracks || !movie.tracks.length) return "No media tracks in this file.";
    var usable = movie.tracks.filter(function (t) {
      return (t.handler === "vide" || t.handler === "soun") && t.samples && t.samples.length;
    });
    if (!usable.length) return "No video or audio samples in this file.";
    return null;
  }

  function videoTracks(movie) {
    return movie.tracks.filter(function (t) {
      return t.handler === "vide" && t.samples && t.samples.length;
    });
  }

  function audioTracks(movie) {
    return movie.tracks.filter(function (t) {
      return t.handler === "soun" && t.samples && t.samples.length;
    });
  }

  function trackDuration(track) {
    if (!track.samples.length) return 0;
    var last = track.samples[track.samples.length - 1];
    return last.dts + last.duration - track.samples[0].dts;
  }

  function cloneTrack(track, samples) {
    return {
      id: track.id,
      handler: track.handler,
      timescale: track.timescale,
      width: track.width,
      height: track.height,
      sampleDesc: track.sampleDesc,
      codec: track.codec,
      encrypted: false,
      samples: samples,
    };
  }

  function rebase(samples) {
    if (!samples.length) return samples;
    var base = samples[0].dts;
    return samples.map(function (s) {
      return {
        data: s.data,
        dts: s.dts - base,
        cts: s.cts - base,
        duration: s.duration,
        isSync: s.isSync,
      };
    });
  }

  function sliceTrack(track, startSec, endSec) {
    var start = Math.max(0, startSec) * track.timescale;
    var end = endSec * track.timescale;
    if (!(end > start)) throw new Error("End must be after start.");
    var samples = track.samples;
    var i, first = 0, last = samples.length;
    for (i = 0; i < samples.length; i++) {
      if (samples[i].cts + samples[i].duration > start) {
        first = i;
        break;
      }
    }
    if (track.handler === "vide") {
      while (first > 0 && !samples[first].isSync) first--;
    }
    for (i = first; i < samples.length; i++) {
      if (samples[i].cts >= end) {
        last = i;
        break;
      }
    }
    var cut = rebase(samples.slice(first, last));
    if (!cut.length) throw new Error("Nothing in that time range.");
    return cloneTrack(track, cut);
  }

  function sameBytes(a, b) {
    if (a.length !== b.length) return false;
    var i;
    for (i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  function convertTs(value, from, to) {
    if (from === to) return value;
    return Math.round((value * to) / from);
  }

  function concatTracks(tracks) {
    if (!tracks.length) throw new Error("Nothing to join.");
    var head = tracks[0];
    var samples = [];
    var offset = 0;
    var i, j, t, s, scale = head.timescale;
    for (i = 0; i < tracks.length; i++) {
      t = tracks[i];
      if (t.handler !== head.handler) throw new Error("Cannot join a video track with an audio track.");
      if (!sameBytes(head.sampleDesc, t.sampleDesc)) {
        throw new Error("These clips use different codecs. Remux only joins matching codecs.");
      }
      for (j = 0; j < t.samples.length; j++) {
        s = t.samples[j];
        samples.push({
          data: s.data,
          dts: convertTs(s.dts, t.timescale, scale) + offset,
          cts: convertTs(s.cts, t.timescale, scale) + offset,
          duration: Math.max(1, convertTs(s.duration, t.timescale, scale)),
          isSync: s.isSync,
        });
      }
      offset += convertTs(trackDuration(t), t.timescale, scale);
    }
    return cloneTrack(head, samples);
  }

  function packRuns(values, writePair) {
    var parts = [];
    var i = 0, count, val;
    var n = 0;
    while (i < values.length) {
      val = values[i];
      count = 1;
      i++;
      while (i < values.length && values[i] === val) {
        count++;
        i++;
      }
      parts.push(writePair(count, val));
      n++;
    }
    return { count: n, bytes: concat(parts) };
  }

  function dinfBox() {
    var url = fullBox("url ", 0, 1, new Uint8Array(0));
    var dref = fullBox("dref", 0, 0, concat([u32(1), url]));
    return box("dinf", dref);
  }

  function hdlrBox(handler) {
    var name = handler === "soun" ? "SoundHandler" : "VideoHandler";
    var nb = new Uint8Array(name.length + 1);
    var i;
    for (i = 0; i < name.length; i++) nb[i] = name.charCodeAt(i);
    return fullBox("hdlr", 0, 0, concat([u32(0), fourcc(handler), u32(0), u32(0), u32(0), nb]));
  }

  function mdhdBox(track) {
    var dur = trackDuration(track);
    return fullBox("mdhd", 0, 0, concat([u32(0), u32(0), u32(track.timescale), u32(dur), u16(0x55c4), u16(0)]));
  }

  function tkhdBox(track, movieTimescale, id) {
    var dur = convertTs(trackDuration(track), track.timescale, movieTimescale);
    var w = (track.width || 0) * 65536;
    var h = (track.height || 0) * 65536;
    var volume = track.handler === "soun" ? 0x0100 : 0;
    var matrix = concat([u32(0x00010000), u32(0), u32(0), u32(0), u32(0x00010000), u32(0), u32(0), u32(0), u32(0x40000000)]);
    return fullBox(
      "tkhd",
      0,
      7,
      concat([u32(0), u32(0), u32(id), u32(0), u32(dur), u32(0), u32(0), u16(0), u16(0), u16(volume), u16(0), matrix, u32(w), u32(h)]),
    );
  }

  function mvhdBox(duration, timescale, nextId) {
    var matrix = concat([u32(0x00010000), u32(0), u32(0), u32(0), u32(0x00010000), u32(0), u32(0), u32(0), u32(0x40000000)]);
    return fullBox("mvhd", 0, 0, concat([u32(0), u32(0), u32(timescale), u32(duration), u32(0x00010000), u16(0x0100), u16(0), u32(0), u32(0), matrix, u32(0), u32(0), u32(0), u32(0), u32(0), u32(0), u32(nextId)]));
  }

  function stblBox(track, chunkOffset) {
    var samples = track.samples;
    var n = samples.length;
    var durs = [];
    var sizes = [];
    var cto = [];
    var sync = [];
    var i, hasCto = false, hasNonSync = false;
    for (i = 0; i < n; i++) {
      durs.push(Math.max(1, samples[i].duration | 0));
      sizes.push(samples[i].data.length);
      cto.push((samples[i].cts - samples[i].dts) | 0);
      if (cto[i]) hasCto = true;
      if (samples[i].isSync) sync.push(i + 1);
      else hasNonSync = true;
    }
    var stts = packRuns(durs, function (c, d) {
      return concat([u32(c), u32(d)]);
    });
    var stszParts = [u32(0), u32(n)];
    for (i = 0; i < n; i++) stszParts.push(u32(sizes[i]));
    var stcoParts = [u32(n)];
    var pos = chunkOffset;
    for (i = 0; i < n; i++) {
      stcoParts.push(u32(pos));
      pos += sizes[i];
    }
    var stsc = fullBox("stsc", 0, 0, concat([u32(1), u32(1), u32(1), u32(1)]));
    var parts = [
      fullBox("stsd", 0, 0, concat([u32(1), track.sampleDesc])),
      fullBox("stts", 0, 0, concat([u32(stts.count), stts.bytes])),
      stsc,
      fullBox("stsz", 0, 0, concat(stszParts)),
      fullBox("stco", 0, 0, concat(stcoParts)),
    ];
    if (hasNonSync && sync.length) {
      var stssParts = [u32(sync.length)];
      for (i = 0; i < sync.length; i++) stssParts.push(u32(sync[i]));
      parts.push(fullBox("stss", 0, 0, concat(stssParts)));
    }
    if (hasCto) {
      var ctts = packRuns(cto, function (c, d) {
        return concat([u32(c), i32(d)]);
      });
      parts.push(fullBox("ctts", 1, 0, concat([u32(ctts.count), ctts.bytes])));
    }
    return box("stbl", concat(parts));
  }

  function minfBox(track, chunkOffset) {
    var media = track.handler === "soun" ? fullBox("smhd", 0, 0, concat([u16(0), u16(0)])) : fullBox("vmhd", 0, 1, concat([u16(0), u16(0), u16(0), u16(0)]));
    return box("minf", concat([media, dinfBox(), stblBox(track, chunkOffset)]));
  }

  function trakBox(track, movieTimescale, id, chunkOffset) {
    var mdia = box("mdia", concat([mdhdBox(track), hdlrBox(track.handler), minfBox(track, chunkOffset)]));
    return box("trak", concat([tkhdBox(track, movieTimescale, id), mdia]));
  }

  function ftypBox() {
    return box("ftyp", concat([fourcc("isom"), u32(0x200), fourcc("isom"), fourcc("iso2"), fourcc("mp41")]));
  }

  function mdatBox(tracks) {
    var parts = [];
    var i, j;
    for (i = 0; i < tracks.length; i++) {
      for (j = 0; j < tracks[i].samples.length; j++) parts.push(tracks[i].samples[j].data);
    }
    var payload = concat(parts);
    return box("mdat", payload);
  }

  function build(tracks) {
    var usable = (tracks || []).filter(function (t) {
      return t && t.samples && t.samples.length && t.sampleDesc && t.sampleDesc.length;
    });
    if (!usable.length) throw new Error("Nothing to write.");
    var movieTimescale = 1000;
    var i, dur = 0, d;
    for (i = 0; i < usable.length; i++) {
      d = convertTs(trackDuration(usable[i]), usable[i].timescale, movieTimescale);
      if (d > dur) dur = d;
    }
    var ftyp = ftypBox();
    function moovAt(offs) {
      var traks = [];
      var t;
      for (t = 0; t < usable.length; t++) traks.push(trakBox(usable[t], movieTimescale, t + 1, offs[t]));
      return box("moov", concat([mvhdBox(dur, movieTimescale, usable.length + 1)].concat(traks)));
    }
    var zeros = [];
    for (i = 0; i < usable.length; i++) zeros.push(0);
    var moov = moovAt(zeros);
    var prefix = ftyp.length + moov.length + 8;
    var offsets = [];
    var cursor = prefix;
    var j, nbytes;
    for (i = 0; i < usable.length; i++) {
      offsets.push(cursor);
      nbytes = 0;
      for (j = 0; j < usable[i].samples.length; j++) nbytes += usable[i].samples[j].data.length;
      cursor += nbytes;
    }
    moov = moovAt(offsets);
    return concat([ftyp, moov, mdatBox(usable)]);
  }

  function makeAvc1Desc(width, height, avcC) {
    var reserved6 = new Uint8Array(6);
    var compressor = new Uint8Array(32);
    var avcCBox = avcC && avcC.length ? (avcC[4] === 0x61 && avcC[5] === 0x76 && avcC[6] === 0x63 && avcC[7] === 0x43 ? avcC : box("avcC", avcC)) : box("avcC", new Uint8Array([1, 0x42, 0, 0x1e, 0xff, 0xe0, 0xe0]));
    var payload = concat([
      reserved6,
      u16(1),
      u16(0),
      u16(0),
      u32(0),
      u32(0),
      u32(0),
      u16(width),
      u16(height),
      u32(0x00480000),
      u32(0x00480000),
      u32(0),
      u16(1),
      compressor,
      u16(0x0018),
      u16(0xffff),
      avcCBox,
    ]);
    return box("avc1", payload);
  }

  function makeMp4aDesc(esds) {
    var reserved6 = new Uint8Array(6);
    var inner = concat([
      reserved6,
      u16(1),
      u32(0),
      u32(0),
      u16(2),
      u16(16),
      u16(0),
      u16(0),
      u32(0xbb800000),
      esds && esds.length ? esds : fullBox("esds", 0, 0, new Uint8Array(0)),
    ]);
    return box("mp4a", inner);
  }

  KuiMp4.concat = concat;
  KuiMp4.box = box;
  KuiMp4.fullBox = fullBox;
  KuiMp4.sniff = sniff;
  KuiMp4.parse = parse;
  KuiMp4.refuseReason = refuseReason;
  KuiMp4.videoTracks = videoTracks;
  KuiMp4.audioTracks = audioTracks;
  KuiMp4.trackDuration = trackDuration;
  KuiMp4.sliceTrack = sliceTrack;
  KuiMp4.concatTracks = concatTracks;
  KuiMp4.build = build;
  KuiMp4.makeAvc1Desc = makeAvc1Desc;
  KuiMp4.makeMp4aDesc = makeMp4aDesc;
  KuiMp4.cloneTrack = cloneTrack;
  KuiMp4.seconds = function (track) {
    return trackDuration(track) / track.timescale;
  };

  global.KuiMp4 = KuiMp4;
})(typeof globalThis !== "undefined" ? globalThis : this);
