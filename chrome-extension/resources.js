import"./assets/modulepreload-polyfill.js";import{a as s}from"./assets/preferences.js";async function t(){const e=await chrome.runtime.sendMessage({type:"GET_STATE"});s(e.state.settings)}t();
