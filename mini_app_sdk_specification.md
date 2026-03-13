
# Mini-App SDK Specification (Production)

This document is a normative specification for a Mini-App platform consisting of:

- **Host App**: the native app (or web shell) that embeds Mini-Apps.
- **Runtime**: the execution environment and sandbox for Mini-Apps.
- **Bridge**: the request/response and event channel between Mini-App and Host.
- **SDK**: the developer-facing API layered over the Bridge.

Unless explicitly stated, the keywords **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** are to be interpreted as described in RFC 2119.

---

## 1. Goals and Non-Goals

### 1.1 Goals

- **Security first**: strict sandboxing and permission-gated access to host capabilities.
- **Predictable UX**: consistent navigation, modals, toasts, and system UI.
- **Strong compatibility**: explicit versioning, capability negotiation, and stable contracts.
- **Observability**: structured logs, performance metrics, and crash reporting hooks.
- **Production readiness**: offline/error handling, rate limiting, timeouts, and recovery.

### 1.2 Non-goals

- Defining a specific UI framework. Mini-Apps MAY use any framework compatible with the runtime.
- Providing unrestricted native execution. All native capabilities are mediated by the host.

---

## 2. Terminology

- **Mini-App**: an app package running inside the Host App.
- **Mini-App Instance**: a specific running session of a Mini-App.
- **App ID**: globally unique identifier assigned at publishing time.
- **Scope**: a named permission capability (e.g., `device.camera`).
- **Bridge Call**: a method invocation from Mini-App to Host (or vice-versa).

---

## 3. Supported Targets

The platform MUST support the following host environments (at minimum):

- **Android Host** (native container)
- **iOS Host** (native container)

Optional targets:

- **Web Host** (embedded container)

Mini-App languages:

- **JavaScript/TypeScript** (required)
- **Flutter/Dart** (optional; if provided, MUST map to the same Bridge contracts)

---

## 4. High-level Architecture

### 4.1 Components

- **Mini-App Container**
  - Loads and renders Mini-App content (WebView or equivalent).
  - Enforces sandboxing and isolates storage.
- **Bridge Layer**
  - Bidirectional channel: request/response + event stream.
  - Performs validation, permission checks, and argument sanitization.
- **Host Services**
  - Auth/session, payments, navigation, device access, storage, network proxy (optional).

### 4.2 Trust boundaries

- Mini-App code is **untrusted**.
- Host App code is **trusted**.
- All sensitive actions MUST be:
  - Permission-gated
  - User-consented where applicable
  - Audited and logged

---

## 5. Packaging and Manifest

### 5.1 Package format

The platform MUST support a distributable package format containing:

- `miniapp.json` (manifest, required)
- Entry assets (HTML/JS/CSS and other static assets)
- Optional signatures/attestations

### 5.1.1 Package distribution and authenticated download

Mini-App packages are typically distributed as a zip (or equivalent archive) and MAY be hosted behind authenticated endpoints.

Requirements:

- The Host MUST support fetching a package from a URL requiring authorization headers (for example `Authorization: Bearer <token>`).
- The Host MUST obtain any required access token from the Host’s authenticated session subsystem. Mini-Apps MUST NOT be given direct access to package download tokens.
- The Host MUST NOT forward Mini-App-provided arbitrary headers to the package CDN.
- The Host SHOULD support resumable downloads and retry with backoff.

Caching:

- The Host SHOULD cache packages by `{appId, version}` and avoid re-downloading when a verified package already exists.
- The Host MUST ensure caches are isolated per app sandbox and SHOULD be isolated per user profile when policy requires.

Integrity:

- The Host SHOULD verify package integrity prior to execution.
- For production deployments, the Host MUST verify package integrity prior to execution.
- The integrity mechanism MUST be a signature over the archive.
- The signature scheme MUST be **Ed25519 detached signature**.
- The platform MUST publish a detached signature for each package (e.g., alongside `appId/version.zip` publish `appId/version.zip.sig`).
- The Host MUST verify the signature using a platform-managed Ed25519 public key (pinned in the Host or delivered via a trusted update mechanism).
- If signature verification fails, the Host MUST refuse to execute the package.

#### 5.1.2 Ed25519 detached signature details (normative)

This section defines the exact bytes and file formats used for package integrity.

Signed content:

- The signed message MUST be the **raw bytes** of the downloaded archive file `version.zip` exactly as stored/transferred (no re-compression, no canonicalization, no newline transformations).

Signature artifact:

- The signature artifact MUST be available at `version.zip.sig`.
- The signature file MUST contain the Ed25519 signature encoded as **base64** of the 64-byte signature.
- The signature file MUST contain only the base64 string (optional trailing newline is allowed).

Public key:

- The Host MUST have access to a trusted Ed25519 public key.
- The Ed25519 public key SHOULD be stored as a 32-byte value and MAY be distributed as base64.
- Key rotation MUST occur via a trusted host update mechanism.

Verification algorithm:

1. Download `version.zip` using authenticated host headers.
2. Download the corresponding `version.zip.sig` using authenticated host headers.
3. Decode base64 signature; if decoding fails, verification fails.
4. Verify Ed25519 signature over the raw `version.zip` bytes.
5. If verification succeeds, the Host MAY cache the archive and extracted contents.
6. If verification fails, the Host MUST delete the archive (if persisted) and MUST refuse execution.
- If signature verification fails, the Host MUST refuse to execute the package.

Failure behavior:

- If a package cannot be authenticated, fetched, validated, or verified, the Host MUST refuse to execute it and MUST surface an actionable error.

### 5.2 Manifest: `miniapp.json`

#### 5.2.1 Required fields

- `schemaVersion`: string, MUST be `"1"` for this spec
- `appId`: string (assigned by platform; during development MAY be placeholder)
- `name`: string (1..64)
- `version`: string (SemVer)
- `entry`: string (relative path)
- `developer`: object
- `permissions`: array of scopes (may be empty)

#### 5.2.2 Optional fields

- `description`: string (0..140)
- `icons`: object with size keys (`"48"`, `"96"`, `"192"`) and relative paths
- `minHostVersion`: string (SemVer)
- `capabilities`: object (feature flags)
- `screenshots`: array of paths
- `privacyPolicyUrl`: string (https URL)
- `termsOfServiceUrl`: string (https URL)
- `redirectAllowlist`: array of hostnames (for webview navigation)

#### 5.2.3 Manifest JSON Schema (authoritative)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["schemaVersion", "appId", "name", "version", "entry", "developer", "permissions"],
  "properties": {
    "schemaVersion": {"type": "string", "const": "1"},
    "appId": {"type": "string", "minLength": 1, "maxLength": 128},
    "name": {"type": "string", "minLength": 1, "maxLength": 64},
    "version": {"type": "string", "pattern": "^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?$"},
    "entry": {"type": "string", "minLength": 1},
    "description": {"type": "string", "maxLength": 140},
    "developer": {
      "type": "object",
      "required": ["name"],
      "properties": {
        "name": {"type": "string", "minLength": 1, "maxLength": 80},
        "website": {"type": "string"},
        "contactEmail": {"type": "string"}
      },
      "additionalProperties": false
    },
    "permissions": {
      "type": "array",
      "items": {"type": "string"},
      "uniqueItems": true
    },
    "icons": {
      "type": "object",
      "properties": {
        "48": {"type": "string"},
        "96": {"type": "string"},
        "192": {"type": "string"}
      },
      "additionalProperties": false
    },
    "minHostVersion": {"type": "string"},
    "privacyPolicyUrl": {"type": "string"},
    "termsOfServiceUrl": {"type": "string"},
    "redirectAllowlist": {"type": "array", "items": {"type": "string"}, "uniqueItems": true}
  },
  "additionalProperties": false
}
```

#### 5.2.4 Example manifest

```json
{
  "schemaVersion": "1",
  "appId": "com.example.food.delivery",
  "name": "Food Delivery",
  "version": "1.0.0",
  "entry": "index.html",
  "description": "Order meals from nearby restaurants",
  "developer": {
    "name": "Example Studio",
    "website": "https://example.com",
    "contactEmail": "dev@example.com"
  },
  "permissions": ["auth.profile", "device.location", "payments.request"],
  "minHostVersion": "1.0.0",
  "redirectAllowlist": ["example.com", "payments.example.com"]
}
```

---

## 6. Bridge Protocol (Authoritative)

All SDK APIs MUST compile down to Bridge messages described in this section.

### 6.1 Transport

- The runtime MUST provide a reliable, ordered channel between Mini-App and Host.
- Message payloads MUST be JSON-serializable.
- The host MUST reject messages exceeding configured limits (default SHOULD be 256 KB).

### 6.2 Message envelopes

#### 6.2.1 Request

```json
{
  "v": 1,
  "type": "request",
  "id": "uuid-or-monotonic-id",
  "method": "namespace.method",
  "params": {},
  "meta": {
    "sdkVersion": "1.0.0",
    "appId": "com.example.food.delivery",
    "instanceId": "...",
    "timestamp": 1710000000000
  }
}
```

#### 6.2.2 Response

```json
{
  "v": 1,
  "type": "response",
  "id": "same-as-request-id",
  "ok": true,
  "result": {},
  "error": null
}
```

If `ok` is `false`, `result` MUST be `null` and `error` MUST be present.

#### 6.2.3 Error object

```json
{
  "code": "STRING_CODE",
  "message": "Human readable message",
  "details": {},
  "retryable": false
}
```

### 6.3 Timeouts, cancellation, idempotency

- Each request MUST have a host-enforced timeout.
  - Default SHOULD be 10 seconds.
  - Long operations MUST provide progress events and SHOULD allow cancellation.
- The bridge MUST support cancellation by request `id`.
- Payment and other financial calls MUST be idempotent via an idempotency key.

### 6.4 Events

Events are one-way messages.

```json
{
  "v": 1,
  "type": "event",
  "name": "lifecycle.onShow",
  "data": {},
  "meta": {"timestamp": 1710000000000}
}
```

---

## 7. SDK Surface (JavaScript/TypeScript)

### 7.1 Initialization and capability negotiation

The Mini-App MUST initialize and negotiate capabilities before calling privileged APIs.

```ts
type Capability = {
  name: string;
  version: string;
};

type InitResult = {
  hostVersion: string;
  sdkBridgeVersion: string;
  capabilities: Capability[];
  instanceId: string;
};

MiniApp.init(): Promise<InitResult>;
MiniApp.getCapabilities(): Promise<Capability[]>;
```

Bridge methods:

- `core.init`
- `core.getCapabilities`

### 7.2 Lifecycle

Lifecycle events are delivered from Host to Mini-App.

- `lifecycle.onLaunch`
- `lifecycle.onShow`
- `lifecycle.onHide`
- `lifecycle.onClose`
- `lifecycle.onDeepLink` (optional)

```ts
MiniApp.on("lifecycle.onShow", (payload) => {});
MiniApp.on("lifecycle.onHide", () => {});
```

### 7.3 Permissions

Permissions are declared in the manifest and granted at runtime.

```ts
type PermissionState = "granted" | "denied" | "prompt";

MiniApp.permissions.query(scope: string): Promise<PermissionState>;
MiniApp.permissions.request(scopes: string[]): Promise<Record<string, PermissionState>>;
```

Rules:

- Host MUST enforce permission checks server-side (host side) even if the SDK checks client-side.
- Host MUST show system-consistent prompts for sensitive permissions.

### 7.4 Authentication and identity

```ts
type UserProfile = {
  id: string;
  displayName?: string;
  avatarUrl?: string;
};

type AuthToken = {
  accessToken: string;
  tokenType: "Bearer";
  expiresAt: number;
};

MiniApp.auth.getProfile(): Promise<UserProfile>;
MiniApp.auth.getToken(options?: { audience?: string; scopes?: string[] }): Promise<AuthToken>;
MiniApp.auth.logout(): Promise<void>;
```

Rules:

- Tokens MUST be minted by Host.
- Mini-App MUST NOT gain access to Host refresh tokens.
- Token audience MUST be validated by Host.

### 7.5 Storage

Storage is per-app and per-user by default.

```ts
MiniApp.storage.setItem(key: string, value: string): Promise<void>;
MiniApp.storage.getItem(key: string): Promise<string | null>;
MiniApp.storage.removeItem(key: string): Promise<void>;
MiniApp.storage.clear(): Promise<void>;
MiniApp.storage.getQuota(): Promise<{ usedBytes: number; totalBytes: number }>;
```

Rules:

- Host SHOULD encrypt at rest on device.
- Keys MUST be namespaced by `appId` and user.

### 7.6 Network

Two modes MAY be supported:

1. **Direct fetch** inside runtime (webview fetch) with restrictions.
2. **Host-proxied** network calls to apply policy, headers, and monitoring.

If host-proxied mode is supported, it MUST define:

```ts
type HttpRequest = {
  url: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
};

type HttpResponse = {
  status: number;
  headers: Record<string, string>;
  body: string;
};

MiniApp.network.request(req: HttpRequest): Promise<HttpResponse>;
```

Rules:

- Host MUST enforce an allowlist policy (e.g., via manifest `redirectAllowlist` or platform settings).
- Host MUST strip or set protected headers (e.g., `Authorization`) according to policy.

### 7.7 Navigation

```ts
type OpenOptions = {
  path: string;
  params?: Record<string, string>;
  replace?: boolean;
};

MiniApp.navigation.open(options: OpenOptions): Promise<void>;
MiniApp.navigation.back(options?: { steps?: number }): Promise<void>;
MiniApp.navigation.setTitle(title: string): Promise<void>;
```

### 7.8 UI primitives

```ts
MiniApp.ui.toast(options: { message: string; durationMs?: number }): Promise<void>;
MiniApp.ui.modal(options: { title: string; message: string; confirmText?: string; cancelText?: string }): Promise<{ confirmed: boolean }>;
MiniApp.ui.loading.show(options?: { message?: string }): Promise<void>;
MiniApp.ui.loading.hide(): Promise<void>;
```

### 7.9 Device APIs

All device APIs MUST be permission-gated.

#### 7.9.1 Camera

```ts
type CameraResult = { uri: string; mimeType: string; sizeBytes: number };

MiniApp.device.camera.capture(options?: { quality?: number }): Promise<CameraResult>;
```

Required scope: `device.camera`

#### 7.9.2 Location

```ts
type Location = { latitude: number; longitude: number; accuracyMeters?: number; timestamp: number };

MiniApp.device.location.getCurrentPosition(options?: { timeoutMs?: number }): Promise<Location>;
MiniApp.device.location.watchPosition(options?: {}): Promise<{ watchId: string }>;
MiniApp.device.location.clearWatch(watchId: string): Promise<void>;
```

Required scope: `device.location`

#### 7.9.3 Clipboard

```ts
MiniApp.device.clipboard.writeText(text: string): Promise<void>;
MiniApp.device.clipboard.readText(): Promise<string>;
```

Required scope: `device.clipboard`

#### 7.9.4 QR / barcode scan

```ts
MiniApp.device.scanner.scan(options?: { formats?: string[] }): Promise<{ value: string; format?: string }>;
```

Required scope: `device.scanner`

### 7.10 Payments

Payments are a mandatory capability of the platform. A conformant Host implementation MUST implement the payments methods in this section.

The following MUST apply:

- Host MUST render the payment sheet.
- Mini-App MUST NOT access raw card data.
- All payment requests MUST be idempotent.
- Host MUST bind the payment to the currently authenticated user/session.
- Host MUST provide a user-confirmation step prior to executing a charge.
- Host MUST return a final, terminal status: `succeeded`, `failed`, or `canceled`.

```ts
type PaymentRequest = {
  idempotencyKey: string;
  amountMinor: number;
  currency: string;
  description: string;
  metadata?: Record<string, string>;
};

type PaymentResult = {
  status: "succeeded" | "failed" | "canceled";
  transactionId?: string;
  failureCode?: string;
};

MiniApp.payments.requestPayment(req: PaymentRequest): Promise<PaymentResult>;
```

Required scope: `payments.request`

---

## 8. Error Codes (Standard)

All SDK methods MUST reject with a structured error corresponding to the bridge error object.

Standard codes (non-exhaustive):

- `ERR_INVALID_ARGUMENT`
- `ERR_NOT_INITIALIZED`
- `ERR_TIMEOUT`
- `ERR_CANCELED`
- `ERR_PERMISSION_DENIED`
- `ERR_PERMISSION_REQUIRED`
- `ERR_NOT_SUPPORTED`
- `ERR_RATE_LIMITED`
- `ERR_NETWORK`
- `ERR_AUTH_REQUIRED`
- `ERR_AUTH_FAILED`
- `ERR_STORAGE_QUOTA`
- `ERR_PAYMENT_FAILED`
- `ERR_INTERNAL`

---

## 9. Security Requirements

### 9.1 Sandbox

- Mini-App MUST run in a restricted environment.
- Host MUST isolate Mini-App storage and cookies by `appId`.
- Host MUST prevent access to arbitrary local files.

### 9.2 Content integrity and signing

- Production packages SHOULD be signed.
- Host MUST verify signature and package integrity before execution.

### 9.3 Data handling

- Sensitive data MUST NOT be logged.
- Host MUST provide a way to clear Mini-App data.

### 9.4 Navigation and URL policy

- External navigation MUST be constrained by an allowlist policy.
- Host SHOULD display an interstitial confirmation for external domains.

---

## 10. Observability

### 10.1 Logging

```ts
MiniApp.logger.log(level: "debug" | "info" | "warn" | "error", message: string, fields?: Record<string, unknown>): Promise<void>;
```

Host SHOULD tag logs with `appId`, `instanceId`, and correlation IDs.

### 10.2 Performance

Host SHOULD expose performance markers:

- Time to first render
- Bridge call latency
- Error rate

---

## 11. Versioning and Compatibility

### 11.1 SDK versioning

- SDK uses SemVer.
- Breaking changes MUST bump MAJOR.

### 11.2 Capability negotiation

- Mini-App MUST use `core.getCapabilities` to feature-detect.
- Host MUST maintain backwards compatibility for bridge `v=1` unless `minHostVersion` is not met.

---

## 12. Publishing and Review (Process)

The platform SHOULD provide a pipeline:

1. **Upload** package
2. **Static validation** (manifest schema, size limits, allowlists)
3. **Security scan** (known vulnerable deps, prohibited APIs)
4. **Manual review** (if required)
5. **Release** with staged rollout

Host MUST be able to revoke or disable Mini-App versions.

---

## 13. Conformance Checklist

A Host implementation is conformant if it:

- Enforces bridge envelope validation and size limits.
- Enforces permission checks for every privileged API.
- Implements `core.init` and capability negotiation.
- Implements lifecycle events and clean shutdown.
- Provides consistent error objects and standard error codes.
- Isolates storage per `appId` and user.
- Implements signature verification (or documents why it is not available).
- Implements `payments.requestPayment` and enforces idempotency.

A Mini-App is conformant if it:

- Calls `MiniApp.init()` before privileged APIs.
- Handles `ERR_PERMISSION_DENIED` and fallback flows.
- Uses capability negotiation rather than UA sniffing.
- Avoids storing sensitive tokens in plain text.

---

## 14. Appendix: Bridge Method Catalog (v1)

The following method names are reserved for Bridge v1:

- `core.init`
- `core.getCapabilities`
- `permissions.query`
- `permissions.request`
- `auth.getProfile`
- `auth.getToken`
- `auth.logout`
- `storage.setItem`
- `storage.getItem`
- `storage.removeItem`
- `storage.clear`
- `storage.getQuota`
- `network.request` (optional)
- `navigation.open`
- `navigation.back`
- `navigation.setTitle`
- `ui.toast`
- `ui.modal`
- `ui.loading.show`
- `ui.loading.hide`
- `device.camera.capture`
- `device.location.getCurrentPosition`
- `device.location.watchPosition`
- `device.location.clearWatch`
- `device.clipboard.writeText`
- `device.clipboard.readText`
- `device.scanner.scan`
- `payments.requestPayment`
