// Talks to WorkOS using its "CLI Auth" (OAuth device code) flow, which fits a telnet game with no browser:
// we ask WorkOS for a short code, the player confirms it in any web browser, and we poll until they've signed in.
// Docs: https://workos.com/docs/authkit/cli-auth
// Only a Client ID is needed (no secret API key), set via the WORKOS_CLIENT_ID environment variable.

const API_BASE = 'https://api.workos.com/user_management';
const DEVICE_CODE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';
const REQUEST_TIMEOUT_MS = 10000;

function isConfigured() {
  return !!process.env.WORKOS_CLIENT_ID;
}

async function post(endpoint, params) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.WORKOS_CLIENT_ID, ...params }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, body };
}

// Starts a login. Returns { device_code, user_code, verification_uri, verification_uri_complete, expires_in, interval }.
async function startDeviceLogin() {
  const { ok, body } = await post('/authorize/device', {});
  if (!ok) {
    throw new Error(body.error_description || body.error || 'WorkOS rejected the login request');
  }
  return body;
}

// Checks once whether the player has finished signing in. Returns one of:
//   { status: 'success', user }   - signed in; user.id is their permanent WorkOS user ID
//   { status: 'pending' }         - not yet, keep waiting
//   { status: 'slow_down' }       - we're polling too fast, wait longer between checks
//   { status: 'denied' | 'expired' | 'error', message }
async function pollDeviceLogin(deviceCode) {
  const { ok, body } = await post('/authenticate', { grant_type: DEVICE_CODE_GRANT, device_code: deviceCode });
  if (ok) return { status: 'success', user: body.user };
  switch (body.error) {
    case 'authorization_pending': return { status: 'pending' };
    case 'slow_down': return { status: 'slow_down' };
    case 'access_denied': return { status: 'denied', message: 'Login was declined.' };
    case 'expired_token': return { status: 'expired', message: 'The login code expired.' };
    default: return { status: 'error', message: body.error_description || body.error || 'Unknown WorkOS error' };
  }
}

module.exports = { isConfigured, startDeviceLogin, pollDeviceLogin };
