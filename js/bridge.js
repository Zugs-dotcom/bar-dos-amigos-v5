(() => {
  "use strict";
  const config = window.BAR_CONFIG || {};
  const frame = document.getElementById("backend-bridge");
  const pending = new Map();
  let ready = false;
  let frameOrigin = "";
  let sequence = 0;
  let readyPromise;

  function isGoogleOrigin(origin) {
    try {
      const host = new URL(origin).hostname;
      return host === "script.google.com" || host.endsWith(".googleusercontent.com");
    } catch (_) { return false; }
  }

  function connect() {
    if (!config.appsScriptUrl || !frame) return Promise.reject(new Error("O Apps Script ainda não foi configurado."));
    if (ready) return Promise.resolve();
    if (!readyPromise) {
      readyPromise = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("A conexão com o Google Sheets demorou demais.")), 20000);
        window.addEventListener("bar-v5-ready", () => { clearTimeout(timer); resolve(); }, { once: true });
        try {
          const url = new URL(config.appsScriptUrl);
          if (url.protocol !== "https:" || url.hostname !== "script.google.com") throw new Error("Endereço inválido do Apps Script.");
          url.searchParams.set("bridge", "1");
          if (frame.src !== url.href) frame.src = url.href;
        } catch (error) { clearTimeout(timer); reject(error); }
      });
    }
    return readyPromise;
  }

  window.addEventListener("message", event => {
    if (event.source !== frame?.contentWindow || !isGoogleOrigin(event.origin)) return;
    const message = event.data;
    if (!message || message.channel !== "bar-amigos-v5") return;
    if (message.type === "ready") {
      ready = true;
      frameOrigin = event.origin;
      window.dispatchEvent(new Event("bar-v5-ready"));
      return;
    }
    const entry = pending.get(message.id);
    if (!entry) return;
    clearTimeout(entry.timer);
    pending.delete(message.id);
    if (message.ok) entry.resolve(message.result);
    else entry.reject(new Error(message.error || "Não foi possível concluir a operação."));
  });

  async function call(action, ...args) {
    await connect();
    const id = `r${Date.now()}_${++sequence}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error("O servidor não respondeu a tempo.")); }, 25000);
      pending.set(id, { resolve, reject, timer });
      frame.contentWindow.postMessage({ channel: "bar-amigos-v5", id, action, args }, frameOrigin);
    });
  }

  window.BarBridge = Object.freeze({ available: () => Boolean(config.appsScriptUrl && frame), call });
})();
