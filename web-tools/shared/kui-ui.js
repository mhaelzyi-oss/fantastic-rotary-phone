/* File picker / drag-drop / status / download. Never fetches URLs. */
(function (global) {
  "use strict";

  var KuiUi = {};

  KuiUi.qs = function (sel, root) {
    return (root || document).querySelector(sel);
  };

  KuiUi.baseName = function (name) {
    return String(name || "file")
      .replace(/\.[^.]+$/, "")
      .replace(/[^\w.-]+/g, "_") || "file";
  };

  KuiUi.download = function (blob, name) {
    var a = document.createElement("a");
    var url = URL.createObjectURL(blob);
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 2000);
  };

  KuiUi.readFile = function (file) {
    if (!file) return Promise.reject(new Error("Choose a local file."));
    if (file.size > 512 * 1024 * 1024) return Promise.reject(new Error("This file is larger than 512 MB."));
    return file.arrayBuffer();
  };

  KuiUi.status = function (msg, kind) {
    var el = KuiUi.qs("#status");
    if (!el) return;
    el.textContent = msg || "";
    el.className = "status" + (kind ? " " + kind : "");
  };

  function filesFrom(dt) {
    if (dt && dt.files && dt.files.length) return Array.prototype.slice.call(dt.files);
    return [];
  }

  KuiUi.bindDrop = function (el, onFiles) {
    var input = el.querySelector("input[type=file]");
    el.addEventListener("click", function () {
      if (input) input.click();
    });
    el.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (input) input.click();
      }
    });
    if (input) {
      input.addEventListener("change", function () {
        onFiles(Array.prototype.slice.call(input.files || []));
      });
    }
    el.addEventListener("dragover", function (e) {
      e.preventDefault();
      el.classList.add("on");
    });
    el.addEventListener("dragleave", function () {
      el.classList.remove("on");
    });
    el.addEventListener("drop", function (e) {
      e.preventDefault();
      el.classList.remove("on");
      onFiles(filesFrom(e.dataTransfer));
    });
  };

  KuiUi.busy = function (on) {
    var btn = KuiUi.qs("#run");
    if (btn) btn.disabled = !!on;
  };

  KuiUi.catch = function (err) {
    KuiUi.busy(false);
    KuiUi.status((err && err.message) || String(err), "err");
  };

  global.KuiUi = KuiUi;
})(typeof globalThis !== "undefined" ? globalThis : this);
