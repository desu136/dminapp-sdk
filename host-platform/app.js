loadAppRegistry();

let activeIframe = null;

function postEventToActiveFrame(name, data = {}) {
  if (!activeIframe || !activeIframe.contentWindow) return;

  activeIframe.contentWindow.postMessage({
    __miniapp_bridge__: true,
    v: 1,
    type: "event",
    name,
    data,
    meta: { timestamp: Date.now() }
  }, "*");
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    postEventToActiveFrame("lifecycle.onHide", {});
  } else if (document.visibilityState === "visible") {
    postEventToActiveFrame("lifecycle.onShow", {});
  }
});

async function loadAppRegistry() {

  const response = await fetch("./apps.json");

  const apps = await response.json();

  const container = document.getElementById("app-list");

  apps.forEach(app => {

    const button = document.createElement("button");

    button.innerText = app.name;

    button.onclick = () => {

      loadMiniApp(app.path);

    };

    container.appendChild(button);

  });

}

async function loadMiniApp(appPath) {

  console.log("Loading mini app...");

  const container = document.getElementById("miniapp-container");

  container.innerHTML = "Loading mini-app...";

  if (activeIframe) {
    postEventToActiveFrame("lifecycle.onClose", {});
  }

  try {

    const response = await fetch("../" + appPath + "miniapp.json");

    const manifest = await response.json();

    console.log("MiniApp Manifest:", manifest);

    validatePermissions(manifest.permissions);

    const iframe = document.createElement("iframe");

    iframe.src = "../" + appPath + manifest.entry;
    // ../miniapps/demo-app/index.html

    iframe.width = "100%";
    iframe.height = "500px";
    iframe.style.border = "none";

    iframe.id = "miniapp-frame";

    iframe.onload = () => {

      console.log("Mini app launched");

      postEventToActiveFrame("lifecycle.onLaunch", {});
      postEventToActiveFrame("lifecycle.onShow", {});

    };

    container.innerHTML = "";
    container.appendChild(iframe);

    activeIframe = iframe;

  } catch (error) {

    container.innerHTML = "Failed to load mini-app";

    console.error(error);

  }

}


/* PERMISSION VALIDATION */

function validatePermissions(permissions) {

  const allowedPermissions = [
    "auth.profile",
    "auth.token",
    "auth.logout",
    "storage.kv",
    "device.camera",
    "device.location",
    "device.clipboard",
    "device.scanner",
    "device.file",
    "payments.request"
  ];

  permissions.forEach(p => {

    if (!allowedPermissions.includes(p)) {
      throw new Error("Permission not allowed: " + p);
    }

  });

  console.log("Permissions validated:", permissions);

}


/* MESSAGE LISTENER */

const hostState = {
  instanceId: "host_" + Date.now() + "_" + Math.random().toString(16).slice(2),
  capabilities: [
    { name: "core", version: "1.0.0" },
    { name: "permissions", version: "1.0.0" },
    { name: "auth", version: "1.0.0" },
    { name: "storage", version: "1.0.0" },
    { name: "ui", version: "1.0.0" },
    { name: "payments", version: "1.0.0" },
    { name: "device", version: "1.0.0" },
    { name: "messaging", version: "1.0.0" }
  ],
  declaredPermissions: [],
  granted: new Set(),
  idempotency: new Map(),
  storage: new Map(),
  locationWatchNextId: 1,
  locationWatches: new Map()
};

window.addEventListener("message", async function (event) {

  const message = event.data;

  if (!message || message.__miniapp_bridge__ !== true || message.type !== "request") {
    return;
  }

  const response = await handleBridgeRequest(message, event.source, hostState);
  event.source.postMessage(response, "*");

});

/* BRIDGE REQUEST HANDLER */

function okResponse(req, result) {
  return {
    __miniapp_bridge__: true,
    v: 1,
    type: "response",
    id: req.id,
    ok: true,
    result,
    error: null
  };
}

function errResponse(req, code, message, details = {}, retryable = false) {
  return {
    __miniapp_bridge__: true,
    v: 1,
    type: "response",
    id: req.id,
    ok: false,
    result: null,
    error: { code, message, details, retryable }
  };
}

function permissionState(scope, hostState) {
  if (hostState.granted.has(scope)) return "granted";
  if (hostState.declaredPermissions.includes(scope)) return "prompt";
  return "denied";
}

async function handleBridgeRequest(req, source, hostState) {
  try {

    if (!req.method || typeof req.method !== "string") {
      return errResponse(req, "ERR_INVALID_ARGUMENT", "Missing method");
    }

    if (req.method === "core.init") {
      const appId = req.params?.appId || null;
      const permissions = Array.isArray(req.params?.permissions) ? req.params.permissions : [];

      hostState.declaredPermissions = permissions;

      return okResponse(req, {
        hostVersion: "1.0.0",
        sdkBridgeVersion: "1.0.0",
        capabilities: hostState.capabilities,
        instanceId: hostState.instanceId,
        appId
      });
    }

    if (req.method === "core.getCapabilities") {
      return okResponse(req, hostState.capabilities);
    }

    if (req.method === "permissions.query") {
      const scope = req.params?.scope;
      if (!scope) return errResponse(req, "ERR_INVALID_ARGUMENT", "Missing scope");
      return okResponse(req, permissionState(scope, hostState));
    }

    if (req.method === "permissions.request") {
      const scopes = req.params?.scopes;
      if (!Array.isArray(scopes)) return errResponse(req, "ERR_INVALID_ARGUMENT", "Missing scopes");

      const result = {};
      for (const s of scopes) {
        if (!hostState.declaredPermissions.includes(s)) {
          result[s] = "denied";
          continue;
        }

        const allowed = confirm("Allow mini app to access: " + s + " ?");
        if (allowed) {
          hostState.granted.add(s);
          result[s] = "granted";
        } else {
          result[s] = "denied";
        }
      }

      return okResponse(req, result);
    }

    if (req.method === "auth.getProfile") {
      if (permissionState("auth.profile", hostState) !== "granted") {
        return errResponse(req, "ERR_PERMISSION_DENIED", "Permission denied", { scope: "auth.profile" });
      }

      return okResponse(req, {
        id: "user_1001",
        displayName: "Test User",
        avatarUrl: ""
      });
    }

    if (req.method === "auth.getToken") {
      if (permissionState("auth.token", hostState) !== "granted") {
        return errResponse(req, "ERR_PERMISSION_DENIED", "Permission denied", { scope: "auth.token" });
      }

      const expiresAt = Date.now() + 60 * 60 * 1000;
      return okResponse(req, {
        accessToken: "demo_access_token",
        tokenType: "Bearer",
        expiresAt
      });
    }

    if (req.method === "auth.logout") {
      if (permissionState("auth.logout", hostState) !== "granted") {
        return errResponse(req, "ERR_PERMISSION_DENIED", "Permission denied", { scope: "auth.logout" });
      }

      return okResponse(req, {});
    }

    if (req.method === "storage.setItem") {
      if (permissionState("storage.kv", hostState) !== "granted") {
        return errResponse(req, "ERR_PERMISSION_DENIED", "Permission denied", { scope: "storage.kv" });
      }

      const appId = req.meta?.appId || "__unknown_app__";
      const key = req.params?.key;
      const value = req.params?.value;

      if (!key || typeof key !== "string") {
        return errResponse(req, "ERR_INVALID_ARGUMENT", "Invalid key", { key });
      }
      if (typeof value !== "string") {
        return errResponse(req, "ERR_INVALID_ARGUMENT", "Value must be a string", { key });
      }

      hostState.storage.set(appId + ":" + key, value);
      return okResponse(req, {});
    }

    if (req.method === "storage.getItem") {
      if (permissionState("storage.kv", hostState) !== "granted") {
        return errResponse(req, "ERR_PERMISSION_DENIED", "Permission denied", { scope: "storage.kv" });
      }

      const appId = req.meta?.appId || "__unknown_app__";
      const key = req.params?.key;

      if (!key || typeof key !== "string") {
        return errResponse(req, "ERR_INVALID_ARGUMENT", "Invalid key", { key });
      }

      const val = hostState.storage.has(appId + ":" + key) ? hostState.storage.get(appId + ":" + key) : null;
      return okResponse(req, val);
    }

    if (req.method === "storage.removeItem") {
      if (permissionState("storage.kv", hostState) !== "granted") {
        return errResponse(req, "ERR_PERMISSION_DENIED", "Permission denied", { scope: "storage.kv" });
      }

      const appId = req.meta?.appId || "__unknown_app__";
      const key = req.params?.key;

      if (!key || typeof key !== "string") {
        return errResponse(req, "ERR_INVALID_ARGUMENT", "Invalid key", { key });
      }

      hostState.storage.delete(appId + ":" + key);
      return okResponse(req, {});
    }

    if (req.method === "storage.clear") {
      if (permissionState("storage.kv", hostState) !== "granted") {
        return errResponse(req, "ERR_PERMISSION_DENIED", "Permission denied", { scope: "storage.kv" });
      }

      const appId = req.meta?.appId || "__unknown_app__";
      for (const k of hostState.storage.keys()) {
        if (k.startsWith(appId + ":")) {
          hostState.storage.delete(k);
        }
      }

      return okResponse(req, {});
    }

    if (req.method === "storage.getQuota") {
      if (permissionState("storage.kv", hostState) !== "granted") {
        return errResponse(req, "ERR_PERMISSION_DENIED", "Permission denied", { scope: "storage.kv" });
      }

      const appId = req.meta?.appId || "__unknown_app__";
      let usedBytes = 0;
      for (const [k, v] of hostState.storage.entries()) {
        if (k.startsWith(appId + ":")) {
          usedBytes += String(k).length + String(v).length;
        }
      }

      return okResponse(req, { usedBytes, totalBytes: 1024 * 1024 });
    }

    if (req.method === "ui.modal") {
      const title = req.params?.title || "";
      const message = req.params?.message || req.params?.content || "";
      const confirmed = confirm(title + (message ? ("\n\n" + message) : ""));
      return okResponse(req, { confirmed });
    }

    if (req.method === "ui.loading.show") {
      return okResponse(req, {});
    }

    if (req.method === "ui.loading.hide") {
      return okResponse(req, {});
    }

    if (req.method === "ui.toast") {
      const msg = req.params?.message || "";
      alert(msg);
      return okResponse(req, {});
    }

    if (req.method === "messaging.notify") {
      const title = req.params?.title || "";
      const message = req.params?.message || "";
      alert((title ? (title + "\n\n") : "") + message);
      return okResponse(req, {});
    }

    // if(req.method === "device.camera.capture"){
    //   if(permissionState("device.camera", hostState) !== "granted"){
    //     return errResponse(req, "ERR_PERMISSION_DENIED", "Permission denied", { scope: "device.camera" });
    //   }

    //   const input = document.createElement("input");
    //   input.type = "file";
    //   input.accept = "image/*";
    //   input.capture = "user";

    //   const result = await new Promise((resolve) => {
    //     input.onchange = () => {
    //       const file = input.files && input.files[0];
    //       if(!file){
    //         resolve(null);
    //         return;
    //       }
    //       const uri = URL.createObjectURL(file);
    //       resolve({
    //         uri,
    //         mimeType: file.type || "application/octet-stream",
    //         sizeBytes: file.size || 0
    //       });
    //     };

    //     input.click();
    //   });

    //   if(!result){
    //     return errResponse(req, "ERR_CANCELED", "Canceled", {}, false);
    //   }

    //   return okResponse(req, result);
    // }

    if (req.method === "device.camera.capture") {
      if (permissionState("device.camera", hostState) !== "granted") {
        return errResponse(req, "ERR_PERMISSION_DENIED", "Permission denied", { scope: "device.camera" });
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        return errResponse(req, "ERR_NOT_SUPPORTED", "Camera not supported");
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" } // back camera on mobile, default cam on PC
        });

        const video = document.createElement("video");
        video.srcObject = stream;
        video.play();

        await new Promise(resolve => video.onloadedmetadata = resolve);

        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const ctx = canvas.getContext("2d");
        ctx.drawImage(video, 0, 0);

        // stop camera
        stream.getTracks().forEach(track => track.stop());

        const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg"));

        const uri = URL.createObjectURL(blob);

        return okResponse(req, {
          uri,
          mimeType: "image/jpeg",
          sizeBytes: blob.size
        });

      } catch (e) {
        return errResponse(req, "ERR_CAMERA_FAILED", "Camera access failed", { message: e.message });
      }
    }

    if (req.method === "device.location.getCurrentPosition") {
      if (permissionState("device.location", hostState) !== "granted") {
        return errResponse(req, "ERR_PERMISSION_DENIED", "Permission denied", { scope: "device.location" });
      }

      if (!navigator?.geolocation?.getCurrentPosition) {
        return errResponse(req, "ERR_NOT_SUPPORTED", "Geolocation not supported");
      }

      const timeoutMs = typeof req.params?.timeoutMs === "number" ? req.params.timeoutMs : 10000;

      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (p) => resolve(p),
          (e) => reject(e),
          { enableHighAccuracy: true, timeout: timeoutMs }
        );
      });

      return okResponse(req, {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracyMeters: pos.coords.accuracy,
        timestamp: pos.timestamp || Date.now()
      });
    }

    if (req.method === "device.location.watchPosition") {
      if (permissionState("device.location", hostState) !== "granted") {
        return errResponse(req, "ERR_PERMISSION_DENIED", "Permission denied", { scope: "device.location" });
      }

      if (!navigator?.geolocation?.watchPosition) {
        return errResponse(req, "ERR_NOT_SUPPORTED", "Geolocation not supported");
      }

      const timeoutMs = typeof req.params?.timeoutMs === "number" ? req.params.timeoutMs : 10000;
      const watchId = "watch_" + (hostState.locationWatchNextId++);

      const browserWatchId = navigator.geolocation.watchPosition(
        (p) => {
          try {
            source.postMessage({
              __miniapp_bridge__: true,
              v: 1,
              type: "event",
              name: "device.location.onChange",
              data: {
                watchId,
                latitude: p.coords.latitude,
                longitude: p.coords.longitude,
                accuracyMeters: p.coords.accuracy,
                timestamp: p.timestamp || Date.now()
              },
              meta: { timestamp: Date.now() }
            }, "*");
          } catch (e) {
          }
        },
        () => {
        },
        { enableHighAccuracy: true, timeout: timeoutMs }
      );

      hostState.locationWatches.set(watchId, browserWatchId);
      return okResponse(req, { watchId });
    }

    if (req.method === "device.location.clearWatch") {
      if (permissionState("device.location", hostState) !== "granted") {
        return errResponse(req, "ERR_PERMISSION_DENIED", "Permission denied", { scope: "device.location" });
      }

      const watchId = req.params?.watchId;
      if (typeof watchId !== "string") {
        return errResponse(req, "ERR_INVALID_ARGUMENT", "Invalid watchId", { watchId });
      }

      const browserWatchId = hostState.locationWatches.get(watchId);
      if (browserWatchId !== undefined) {
        navigator.geolocation.clearWatch(browserWatchId);
        hostState.locationWatches.delete(watchId);
      }

      return okResponse(req, {});
    }

    if (req.method === "device.scanner.scan") {
      if (permissionState("device.scanner", hostState) !== "granted") {
        return errResponse(req, "ERR_PERMISSION_DENIED", "Permission denied", { scope: "device.scanner" });
      }

      const value = prompt("Enter QR value");
      if (value === null) {
        return errResponse(req, "ERR_CANCELED", "Canceled", {}, false);
      }
      return okResponse(req, { value: String(value) });
    }

    if (req.method === "device.file.pick") {
      if (permissionState("device.file", hostState) !== "granted") {
        return errResponse(req, "ERR_PERMISSION_DENIED", "Permission denied", { scope: "device.file" });
      }

      const accept = typeof req.params?.accept === "string" ? req.params.accept : "*/*";

      const input = document.createElement("input");
      input.type = "file";
      input.accept = accept;

      const fileInfo = await new Promise((resolve) => {
        input.onchange = () => {
          const file = input.files && input.files[0];
          if (!file) {
            resolve(null);
            return;
          }
          resolve({
            uri: URL.createObjectURL(file),
            name: file.name,
            mimeType: file.type || "application/octet-stream",
            sizeBytes: file.size || 0
          });
        };

        input.click();
      });

      if (!fileInfo) {
        return errResponse(req, "ERR_CANCELED", "Canceled", {}, false);
      }

      return okResponse(req, fileInfo);
    }

    if (req.method === "device.clipboard.writeText") {
      if (permissionState("device.clipboard", hostState) !== "granted") {
        return errResponse(req, "ERR_PERMISSION_DENIED", "Permission denied", { scope: "device.clipboard" });
      }

      const text = req.params?.text;
      if (typeof text !== "string") {
        return errResponse(req, "ERR_INVALID_ARGUMENT", "Invalid text");
      }

      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return okResponse(req, {});
      }

      return errResponse(req, "ERR_NOT_SUPPORTED", "Clipboard API not supported");
    }

    if (req.method === "navigation.setTitle") {
      const title = req.params?.title;
      if (typeof title !== "string") {
        return errResponse(req, "ERR_INVALID_ARGUMENT", "Invalid title");
      }

      document.title = title;
      return okResponse(req, {});
    }

    if (req.method === "navigation.open") {
      return okResponse(req, {});
    }

    if (req.method === "navigation.back") {
      return okResponse(req, {});
    }

    if (req.method === "device.clipboard.readText") {
      if (permissionState("device.clipboard", hostState) !== "granted") {
        return errResponse(req, "ERR_PERMISSION_DENIED", "Permission denied", { scope: "device.clipboard" });
      }

      if (navigator?.clipboard?.readText) {
        const text = await navigator.clipboard.readText();
        return okResponse(req, text);
      }

      return errResponse(req, "ERR_NOT_SUPPORTED", "Clipboard API not supported");
    }

    if (req.method === "payments.requestPayment") {
      if (permissionState("payments.request", hostState) !== "granted") {
        return errResponse(req, "ERR_PERMISSION_DENIED", "Permission denied", { scope: "payments.request" });
      }

      const idempotencyKey = req.params?.idempotencyKey;
      if (!idempotencyKey) return errResponse(req, "ERR_INVALID_ARGUMENT", "Missing idempotencyKey");

      if (hostState.idempotency.has(idempotencyKey)) {
        return okResponse(req, hostState.idempotency.get(idempotencyKey));
      }

      const amountMinor = req.params?.amountMinor;
      const currency = req.params?.currency;
      const description = req.params?.description;

      if (typeof amountMinor !== "number" || !currency || !description) {
        return errResponse(req, "ERR_INVALID_ARGUMENT", "Invalid payment request", { amountMinor, currency, description });
      }

      const sheetText = "Confirm payment\n\n" +
        "Amount: " + (amountMinor / 100).toFixed(2) + " " + currency + "\n" +
        "Description: " + description;

      const confirmed = confirm(sheetText);
      let result;

      if (!confirmed) {
        result = { status: "canceled" };
      } else {
        result = {
          status: "succeeded",
          transactionId: "TXN_" + Date.now()
        };
      }

      hostState.idempotency.set(idempotencyKey, result);
      return okResponse(req, result);
    }

    return errResponse(req, "ERR_NOT_SUPPORTED", "Method not supported", { method: req.method });

  } catch (e) {
    return errResponse(req, "ERR_INTERNAL", "Internal error", { message: String(e?.message || e) }, false);
  }
}
