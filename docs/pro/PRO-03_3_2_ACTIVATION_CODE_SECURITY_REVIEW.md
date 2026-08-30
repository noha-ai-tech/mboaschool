# PRO-03.3.2 — Activation code security review

Status: **NOT EXECUTED / NOT ACTIVATED**.

## Data flow

The delivery message contains the activation code as an ephemeral value plus the non-secret path `/auth/activer-invitation`. The path never receives the code as a query parameter or fragment. The public page renders no code and has no client state, Server Action, analytics, iframe, remote image, external script, or third-party resource.

The browser submits a standard form using `method="post"` and the relative same-origin action `/auth/preparer-invitation`. That route compares the request `Origin` with `request.nextUrl.origin`; missing or foreign origins fail generically. It accepts the code from form data only. The code is not echoed on failure and is never attached to a redirect.

After validation, the code is stored only in `ecoles237_targeted_invitation`, with `HttpOnly`, `SameSite=Lax`, path `/auth`, a ten-minute maximum age, and `Secure` in production. All terminal success/failure responses clear it with `Max-Age=0`. Authentication redirects preserve only the cookie. The Auth callback never reads an invitation query parameter.

## Consumption boundary

`GET /auth/consommer-invitation` is confirmation-only and performs no RPC. Consumption is `POST` only, same-origin, session-authenticated with `auth.getUser()`, atomic in `consume_targeted_invitation`, and single-use. A pending, failed, revoked, expired, already-consumed, wrong-email, wrong-user, wrong-school, or cross-resource invitation cannot link data. Teacher/staff companion linkage remains in the same SQL transaction and establishment.

## Response controls

The activation, preparation, consumption, callback, and completion surfaces use `Cache-Control: no-store, max-age=0`, `Pragma: no-cache`, `Referrer-Policy: no-referrer`, and `X-Robots-Tag: noindex, nofollow, noarchive`. Errors are generic and exclude the code. The activation field disables autocomplete, autocapitalization, and spellcheck and uses a masked input.

## Residual considerations

The out-of-band channel must itself authenticate the recipient adequately; this change does not enable such a channel. A device extension or compromised browser can still observe user input, which cannot be solved by HTTP headers. Rate limiting, code expiry, one-time consumption, and rapid revocation limit exposure. No real message delivery occurs in PRO-03.3.2.

