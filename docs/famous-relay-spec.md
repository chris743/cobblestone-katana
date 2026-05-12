# Famous FAPI Relay — Build Spec

A relay on `192.168.128.233:9000`, plain HTTP, accepts JSON from `inf-01`, performs SOAP calls to Famous (`10.200.1.6`) on its behalf. `inf-01` cannot reach the `10.200.x.x` network directly; this relay bridges the two.

---

## 1. Network / host

| Requirement | Value |
|---|---|
| Bind | `192.168.128.233:9000` |
| Outbound to | `10.200.1.6:80` (Famous SOAP) |
| Inbound from | `inf-01` |

Pre-flight on the relay host:
```bash
curl -v --max-time 10 'http://10.200.1.6/FamousWebServices/Famous.asmx?WSDL'
```
Must return a WSDL.

---

## 2. Configuration (env vars)

```bash
RELAY_PORT=9000
RELAY_AUTH_TOKEN=<shared-secret-string>           # required on every request
FAMOUS_SOAP_URL=http://10.200.1.6/FamousWebServices/Famous.asmx
FAMOUS_CONNECTTO=10.200.1.6
FAMOUS_USERNAME=SIZERIMPORT
FAMOUS_PASSWORD=FAPI
FAMOUS_COMPANY=COBBLESTONE FRUIT
FAMOUS_TIMEOUT_MS=15000
```

The same `RELAY_AUTH_TOKEN` goes into `inf-01` config as `RELAY_TOKEN`. Static; no rotation.

---

## 3. API contract

### 3.1 Common headers

| Header | Value |
|---|---|
| `Authorization` | `Bearer <RELAY_AUTH_TOKEN>` |
| `Content-Type` | `application/json` |
| `X-Request-Id` | optional UUID, echoed in logs |

Missing/wrong `Authorization` → `401 { "error": "unauthorized" }`.

### 3.2 `GET /famous/health`

No auth. Returns:
```json
{ "ok": true, "version": "1.0.0", "uptime_s": 1234 }
```

### 3.3 `POST /famous/issue-import` — the only business endpoint

`inf-01` sends already-formatted, fixed-width Famous lines; relay wraps them in the FAPI document + SOAP envelope and posts to Famous.

**Request body:**
```json
{
  "lines": [
    "05/12/2026AUTO RELIEVE DOMBTM                      DOMBTM                                                                                              -2846.062   60.01                  ",
    "05/12/2026AUTO RELIEVE S4014054000                 S4014054000                                                                                         -108.000    60.01                  "
  ]
}
```

- `lines`: array of pre-formatted fixed-width strings (154 chars each).
- Each line MUST already have the leading negative sign on quantity. Relay does not interpret line content.
- Empty array → `400`.
- > 10,000 lines → `413` (configurable cap).

**Response 200 (Famous accepted):**
```json
{
  "ok": true,
  "lineCount": 23,
  "famousResponseText": "<soap:Envelope>...</soap:Envelope>",
  "durationMs": 1842
}
```

**Response 502 (any failure talking to Famous):**
```json
{
  "ok": false,
  "stage": "login | fapi | logout",
  "error": "human-readable description",
  "famousResponseText": "..."
}
```

**Response 400:**
```json
{ "error": "lines must be a non-empty array of strings" }
```

Relay always attempts logout in `finally`. Logout errors are logged but don't change the outer response.

---

## 4. Behavior requirements

1. **Fresh login per request** — `Login` → `FAPI` → `Logout`. No token caching.
2. **Timeout each Famous call** at `FAMOUS_TIMEOUT_MS` (use `AbortController` or equivalent).
3. **Logging** — one line per request: method, path, `X-Request-Id`, status, duration_ms, line count, failure stage if any. Never log the auth token, Famous password, or full SOAP bodies at info level — gate full dumps behind `DEBUG=true`.
4. **Body parser limit**: ~2 MB (10k × 154 chars ≈ 1.5 MB).
5. Run under `systemd` with auto-restart.

---

## 5. SOAP envelope templates

All three POST to `${FAMOUS_SOAP_URL}` with `Content-Type: text/xml; charset=utf-8`.

**Login** — `SOAPAction: http://FamousSoftware.com/FamousWebServices/Login`:
```xml
<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <Login xmlns="http://FamousSoftware.com/FamousWebServices">
      <connectto>${FAMOUS_CONNECTTO}</connectto>
      <username>${FAMOUS_USERNAME}</username>
      <password>${FAMOUS_PASSWORD}</password>
      <companyname>${FAMOUS_COMPANY}</companyname>
    </Login>
  </soap:Body>
</soap:Envelope>
```
Parse `<result>([^<]+)</result>` from the response body — that's the token.

**FAPI** — `SOAPAction: http://FamousSoftware.com/FamousWebServices/FAPI`:
```xml
<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <FAPI xmlns="http://FamousSoftware.com/FamousWebServices">
      <token>${token}</token>
      <xml><![CDATA[
<?Famous<ProcessingInstructions>
  <Settings>
    <Setting><Key>Version</Key><Value>1.0</Value></Setting>
    <Setting><Key>DocumentType</Key><Value>ICIssueFile</Value></Setting>
  </Settings>
</ProcessingInstructions>?>
<Payload>
${lines.join('\n')}
</Payload>
      ]]></xml>
    </FAPI>
  </soap:Body>
</soap:Envelope>
```

**Logout** — `SOAPAction: http://FamousSoftware.com/FamousWebServices/Logout`:
```xml
<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <Logout xmlns="http://FamousSoftware.com/FamousWebServices">
      <token>${token}</token>
    </Logout>
  </soap:Body>
</soap:Envelope>
```

---

## 6. Test plan (run from `inf-01` after deploy)

```bash
# 1) reachable + alive
curl -s http://192.168.128.233:9000/famous/health

# 2) round-trip a small issue (single line, tiny qty, known test SKU)
curl -s -X POST http://192.168.128.233:9000/famous/issue-import \
  -H "Authorization: Bearer $RELAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"lines":["05/12/2026TEST RELIEVE                            TESTSKU                                                                                                  -0.001    60.01                  "]}'
```

Both must succeed before wiring the real sync.

---

## 7. `inf-01` side changes (after relay is up)

`postIssueImport.ts` shrinks to one fetch — no SOAP, no login/logout:

```ts
// config.ts — new section
relay: {
  baseUrl: process.env.RELAY_URL || 'http://192.168.128.233:9000',
  token:   process.env.RELAY_TOKEN || ''
}

// postIssueImport.ts — outline
const lines = buildIssueLines(repacks);
if (lines.length === 0) return { success: true, lineCount: 0 };

const res = await fetch(`${config.relay.baseUrl}/famous/issue-import`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${config.relay.token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ lines }),
});
const data = await res.json();
return { success: data.ok, lineCount: data.lineCount, error: data.error, responseText: data.famousResponseText };
```

`buildIssueLines()` and the column-layout logic stay on `inf-01` — that's business format.
