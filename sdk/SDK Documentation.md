# MiniApp SDK Documentation

**Version:** 1.0.0  
**Description:** Universal Bridge SDK for Mini App Integration  
**License:** Proprietary  

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Part I: Mini App Developer Guide](#part-i-mini-app-developer-guide)
   - [Installation](#installation)
   - [Initialization](#initialization)
   - [Lifecycle Hooks](#lifecycle-hooks)
   - [API Reference](#api-reference)
4. [Part II: Host App Integration Guide](#part-ii-host-app-integration-guide)
   - [Bridge Protocol](#bridge-protocol)
   - [Implementing Handlers](#implementing-handlers)
   - [Security Considerations](#security-considerations)
5. [Permissions System](#permissions-system)
6. [Error Handling](#error-handling)

---

## Overview

The **MiniApp SDK** provides a standardized interface for Mini Apps to communicate with their Host Container (Webview, Native App, or Super App). It abstracts native capabilities (Payments, Device Hardware, Storage, Auth) into a unified JavaScript API using a secure message-passing bridge.

### Key Features
- **Unified Bridge:** Secure `postMessage` communication between Mini App and Host.
- **Lifecycle Management:** Hooks for app state (Launch, Show, Hide, Close).
- **Permission Model:** Declarative permissions enforced at runtime.
- **Native Capabilities:** Access to Camera, Location, Storage, Payments, and UI components.

---

## Architecture

The SDK operates on a **Request-Response** pattern over `window.postMessage`.

1. **Mini App:** Calls SDK methods (e.g., `MiniApp.auth.login()`).
2. **SDK:** Serializes the request and posts a message to `window.parent`.
3. **Host App:** Listens for messages, processes the logic (e.g., opens native payment sheet), and posts a response back.
4. **SDK:** Resolves or rejects the original Promise based on the Host's response.

---

## Part I: Mini App Developer Guide

This section is for developers building the Mini Apps that run inside the Host Container.

### Installation

Include the SDK script in your Mini App's HTML `<head>` or before your main application script.

```html
<script src="path/to/miniapp-sdk.js"></script>
```

Once loaded, the global object `window.MiniApp` becomes available.

### Initialization

Before using any API, you must initialize the SDK with your app manifest.

```javascript
async function bootstrap() {
  try {
    const manifest = {
      appId: "YOUR_APP_ID",
      permissions: ["auth.profile", "storage.kv", "payments.request"]
    };

    const info = await MiniApp.init(manifest);
    
    console.log("Instance ID:", info.instanceId);
    console.log("Capabilities:", info.capabilities);
    
    // Start your app logic
    startApp();
  } catch (error) {
    console.error("Initialization failed:", error);
  }
}

bootstrap();
```

### Lifecycle Hooks

Register callbacks to respond to Host App state changes.

```javascript
MiniApp.onLaunch(() => {
  console.log("App launched");
  // Fetch initial data
});

MiniApp.onShow(() => {
  console.log("App brought to foreground");
  // Refresh data
});

MiniApp.onHide(() => {
  console.log("App sent to background");
  // Pause timers/animations
});

MiniApp.onClose(() => {
  console.log("App closing");
  // Save state
});
```

### API Reference

#### 1. Authentication (`MiniApp.auth`)

| Method | Parameters | Returns | Description |
| :--- | :--- | :--- | :--- |
| `login()` | None | `Promise<User>` | Requests auth permissions and returns profile + token. |
| `getProfile()` | None | `Promise<Profile>` | Retrieves user profile data. |
| `getToken(options)` | `{ refresh?: boolean }` | `Promise<Token>` | Retrieves access token. |
| `logout()` | None | `Promise<void>` | Logs out the user. |

**Example:**
```javascript
const user = await MiniApp.auth.login();
console.log(`Welcome, ${user.name}`);
```

#### 2. Storage (`MiniApp.storage`)

Persistent key-value storage scoped to the Mini App.

| Method | Parameters | Returns | Description |
| :--- | :--- | :--- | :--- |
| `setItem(key, value)` | `string`, `any` | `Promise<void>` | Saves data (auto-stringifies objects). |
| `getItem(key)` | `string` | `Promise<any>` | Retrieves data. |
| `removeItem(key)` | `string` | `Promise<void>` | Deletes a key. |
| `clear()` | None | `Promise<void>` | Clears all storage. |
| `getQuota()` | None | `Promise<Quota>` | Returns usage limits. |

#### 3. User Interface (`MiniApp.ui`)

Display native UI components.

| Method | Parameters | Returns | Description |
| :--- | :--- | :--- | :--- |
| `showModal(options)` | `{ title, content }` | `Promise<void>` | Shows a standard alert dialog. |
| `toast(options)` | `{ message, duration }` | `Promise<void>` | Shows a temporary notification. |
| `loading.show()` | `{ text }` | `Promise<void>` | Shows a loading spinner. |
| `loading.hide()` | None | `Promise<void>` | Hides the loading spinner. |

#### 4. Payments (`MiniApp.payments` / `MiniApp.pay`)

| Method | Parameters | Returns | Description |
| :--- | :--- | :--- | :--- |
| `requestPayment(req)` | `{ amount, currency, description }` | `Promise<Receipt>` | Initiates a payment flow. |
| `pay(options)` | `{ amount, currency, description }` | `Promise<Receipt>` | Convenience wrapper for `requestPayment`. |

**Example:**
```javascript
await MiniApp.pay({
  amount: 19.99,
  currency: "USD",
  description: "Premium Subscription"
});
```

#### 5. Device Hardware (`MiniApp.device`)

| Module | Method | Description |
| :--- | :--- | :--- |
| `camera` | `open()` | Opens camera to capture image. |
| `clipboard` | `writeText(text)`, `readText()` | Access system clipboard. |
| `location` | `getCurrentPosition()`, `watchPosition()` | Geolocation services. |
| `scanner` | `scan()` | Opens QR/Barcode scanner. |
| `file` | `pick()` | Opens native file picker. |

#### 6. Navigation (`MiniApp.navigation`)

| Method | Parameters | Description |
| :--- | :--- | :--- |
| `open(options)` | `{ url }` | Opens a new Mini App or Webview. |
| `back()` | None | Closes current view or goes back. |
| `setTitle(title)` | `string` | Updates the Host App header title. |

#### 7. Events & Messaging

Custom event bus for communication.

```javascript
// Listen for custom event
MiniApp.on("custom:event", (data) => {
  console.log("Received:", data);
});

// Emit custom event (to Host or other modules)
MiniApp.emit("custom:event", { payload: "hello" });

// Send notification
MiniApp.notify({ title: "Update", body: "New message received" });
```

---

## Part II: Host App Integration Guide

This section is for developers building the **Container** (Webview/Native App) that hosts the Mini Apps. The Host App must implement the bridge protocol to respond to SDK requests.

### Bridge Protocol

All communication happens via `window.postMessage` (for Web Containers) or equivalent WebView message handlers (for Native).

#### Message Structure

**1. Request (Mini App → Host)**
```json
{
  "__miniapp_bridge__": true,
  "type": "request",
  "id": "req_unique_id",
  "method": "auth.getProfile",
  "params": { ... },
  "meta": {
    "appId": "APP_123",
    "instanceId": "INST_456",
    "timestamp": 1715623400000
  }
}
```

**2. Response (Host → Mini App)**
```json
{
  "__miniapp_bridge__": true,
  "type": "response",
  "id": "req_unique_id",
  "ok": true,
  "result": { "id": 1, "name": "John" }
}
```
*Or on error:*
```json
{
  "__miniapp_bridge__": true,
  "type": "response",
  "id": "req_unique_id",
  "ok": false,
  "error": {
    "code": "ERR_AUTH_FAILED",
    "message": "User not logged in"
  }
}
```

**3. Event (Host → Mini App)**
```json
{
  "__miniapp_bridge__": true,
  "type": "event",
  "name": "lifecycle.onShow",
  "data": null
}
```

### Implementing Handlers

The Host App must listen for incoming messages and route them to appropriate native logic.

**Web Container Example:**
```javascript
window.addEventListener("message", (event) => {
  const msg = event.data;
  
  // Security: Verify origin
  if (event.origin !== "https://trusted-miniapp-domain.com") return;
  
  if (msg.__miniapp_bridge__ && msg.type === "request") {
    handleRequest(msg, event.source);
  }
});

async function handleRequest(msg, source) {
  let result, error = null, ok = true;

  try {
    switch (msg.method) {
      case "core.init":
        result = { instanceId: generateId(), capabilities: ["payments"] };
        break;
      case "auth.getProfile":
        result = await nativeAuth.getProfile();
        break;
      case "ui.toast":
        await nativeUI.showToast(msg.params);
        result = true;
        break;
      // ... implement all other methods
      default:
        throw new Error("Method not supported");
    }
  } catch (e) {
    ok = false;
    error = { code: "ERR_HOST", message: e.message };
  }

  // Send Response
  source.postMessage({
    __miniapp_bridge__: true,
    type: "response",
    id: msg.id,
    ok,
    result,
    error
  }, "*");
}
```

### Required Method Handlers

The Host App must implement logic for the following methods received via `msg.method`:

| Category | Methods |
| :--- | :--- |
| **Core** | `core.init`, `core.getCapabilities` |
| **Auth** | `auth.getProfile`, `auth.getToken`, `auth.logout` |
| **Permissions** | `permissions.query`, `permissions.request` |
| **Storage** | `storage.setItem`, `storage.getItem`, `storage.removeItem`, `storage.clear`, `storage.getQuota` |
| **UI** | `ui.modal`, `ui.loading.show`, `ui.loading.hide`, `ui.toast` |
| **Payments** | `payments.requestPayment` |
| **Navigation** | `navigation.open`, `navigation.back`, `navigation.setTitle` |
| **Device** | `device.camera.capture`, `device.clipboard.*`, `device.location.*`, `device.scanner.scan`, `device.file.pick` |
| **Messaging** | `messaging.notify` |

### Lifecycle Events

The Host App must notify the Mini App of state changes by posting **Event** messages.

```javascript
// When Mini App becomes visible
postMessageToMiniApp({
  __miniapp_bridge__: true,
  type: "event",
  name: "lifecycle.onShow"
});

// When Mini App is hidden
postMessageToMiniApp({
  __miniapp_bridge__: true,
  type: "event",
  name: "lifecycle.onHide"
});
```

### Security Considerations

1.  **Origin Checking:** Always validate `event.origin` in web containers to prevent XSS or data leakage.
2.  **Permission Validation:** The Host must verify that the `appId` sending the request actually holds the permission required for the method (e.g., don't allow `payments.request` if the app isn't verified).
3.  **Input Sanitization:** Treat all `msg.params` as untrusted input.
4.  **Idempotency:** Payment requests include an `idempotencyKey`. Host implementations should use this to prevent double-charging.

---

## Permissions System

The SDK enforces a declarative permission model.

### Declaring Permissions
In `MiniApp.init(manifest)`, the Mini App must list required permissions:
```javascript
permissions: ["auth.profile", "device.location"]
```

### Runtime Checks
The SDK automatically throws `ERR_PERMISSION_REQUIRED` if a method is called without the declared permission.

### Host-Side Granting
When the Host receives `permissions.request`, it should display a native dialog to the user to grant or deny access. The response should indicate which scopes were granted:
```json
{
  "auth.profile": "granted",
  "device.location": "denied"
}
```

---

## Error Handling

All SDK methods return Promises. Errors are standardized objects.

```javascript
try {
  await MiniApp.pay({ amount: 100 });
} catch (err) {
  if (err.code === "ERR_PERMISSION_DENIED") {
    // Prompt user to enable permissions
  } else if (err.code === "ERR_PAYMENT_FAILED") {
    // Show payment error UI
  } else {
    // Generic error
    console.error(err);
  }
}
```

### Common Error Codes

| Code | Description |
| :--- | :--- |
| `ERR_PERMISSION_REQUIRED` | Method called without declaring permission in manifest. |
| `ERR_PERMISSION_DENIED` | User or Host denied the permission request. |
| `ERR_NETWORK` | Bridge communication failed. |
| `ERR_HOST_UNAVAILABLE` | Host app does not support the requested method. |

---

## Support & Contact

For questions, bug reports, or integration assistance regarding the MiniApp SDK, please reach out to the development team directly.

📧 **Primary Contact:**  
`ebisatesfaye30@gmail.com`
`desukasaye19@gmail.com`

📧 **Team Distribution List:**  
`dexel202518@gmail.com`

### What to Include in Your Message
To help us resolve your issue faster, please provide:
- SDK version you're using (`MiniApp.meta.sdkVersion`)
- Host App environment (Web, iOS WebView, Android WebView, etc.)
- Steps to reproduce the issue
- Relevant error codes or logs
- Mini App `appId` (if applicable)
