import * as https from 'https';
import * as zlib from 'zlib';
import { URL } from 'url';
import * as crypto from 'crypto';
import { generateXVCHeader } from './crypto';

export const KATALK_HOST = 'katalk.kakao.com';
export const AUTH_HOST = 'auth.kakao.com';

export const DEFAULT_APP_VER = '26.1.2';
const DEFAULT_OS_VER = '14';
const DEFAULT_DEVICE_NAME = 'KakaoForge';
const DEFAULT_MODEL_NAME = 'SM-G998N';
export const DEFAULT_QR_MODEL_NAME = 'SM-T733';  // allowlist.json 기준
const QR_USER_AGENT = 'okhttp/4.12.0';

/**
 * Generate a device UUID (d_id).
 * KakaoTalk uses a hashed device id for sub-device login.
 */
function generateDeviceUuid() {
  const base = `${crypto.randomUUID()}-${Date.now()}`;
  return buildDeviceId(base);
}

/**
 * Make an HTTPS POST request with form-encoded body.
 */
function httpsPost(host, path, formData, headers = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(formData)) {
      if (value !== null && value !== undefined) {
        body.append(key, String(value));
      }
    }
    const bodyStr = body.toString();

    const defaultHeaders = {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Content-Length': Buffer.byteLength(bodyStr),
      'Accept': '*/*',
      'Accept-Language': 'ko',
      'Connection': 'keep-alive',
      ...headers,
    };

    const options = {
      hostname: host,
      port: 443,
      path,
      method: 'POST',
      headers: defaultHeaders,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, headers: res.headers, body: json });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, body: data });
        }
      });
    });

    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

/**
 * Make an HTTPS POST request with JSON body.
 */
function httpsPostJson(host, path, jsonData, headers = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(jsonData);

    const defaultHeaders = {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(bodyStr),
      'Connection': 'Keep-Alive',
      'Accept-Encoding': 'gzip',
      ...headers,
    };

    const options = {
      hostname: host,
      port: 443,
      path,
      method: 'POST',
      headers: defaultHeaders,
    };

    const req = https.request(options, (res) => {
      const chunks = [];
      const stream = res.headers['content-encoding'] === 'gzip'
        ? res.pipe(zlib.createGunzip())
        : res;
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', () => {
        const data = Buffer.concat(chunks).toString('utf-8');
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, headers: res.headers, body: json });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, body: data });
        }
      });
      stream.on('error', reject);
    });

    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

/**
 * Make an HTTPS GET request (JSON expected).
 */
function httpsGet(host, path, headers = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const defaultHeaders = {
      'Accept': '*/*',
      'Accept-Language': 'ko',
      'Connection': 'keep-alive',
      ...headers,
    };

    const options = {
      hostname: host,
      port: 443,
      path,
      method: 'GET',
      headers: defaultHeaders,
    };

    const req = https.request(options, (res) => {
      const chunks = [];
      const stream = res.headers['content-encoding'] === 'gzip'
        ? res.pipe(zlib.createGunzip())
        : res;
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', () => {
        const data = Buffer.concat(chunks).toString('utf-8');
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, headers: res.headers, body: json });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, body: data });
        }
      });
      stream.on('error', reject);
    });

    req.on('error', reject);
    req.end();
  });
}

/**
 * Build the User-Agent string for KakaoTalk Android.
 */
function buildUserAgent(appVer = DEFAULT_APP_VER, osVer = DEFAULT_OS_VER) {
  return `KT/${appVer} An/${osVer} ko`;
}

/**
 * Build the A (authorization) header.
 * Format: "android/{appVer}/{lang}"
 */
function buildAHeader(appVer = DEFAULT_APP_VER, lang = 'ko') {
  return `android/${appVer}/${lang}`;
}

/**
 * Build Authorization header for KakaoTalk API (accessToken + deviceUuid).
 *
 * From decompiled: BO/d.java (OauthHelper)
 * Format: "{accessToken}-{deviceUuid}"
 */
function buildAuthorizationHeader(accessToken, deviceUuid) {
  if (!accessToken || !deviceUuid) {
    throw new Error('accessToken and deviceUuid are required for Authorization header');
  }
  return `${accessToken}-${deviceUuid}`;
}

/**
 * Build device id (d_id) from device UUID.
 * KakaoTalk uses SHA-256("dkljleskljfeisflssljeif {deviceUuid}").
 */
function buildDeviceId(deviceUuid) {
  if (!deviceUuid) {
    throw new Error('deviceUuid is required to build deviceId');
  }
  const raw = String(deviceUuid);
  if (/^[a-f0-9]{40,64}$/i.test(raw)) {
    return raw;
  }
  const seed = `dkljleskljfeisflssljeif ${raw}`;
  return crypto.createHash('sha256').update(seed, 'utf-8').digest('hex');
}

/**
 * Build headers for QR login authorization endpoints (main device).
 */
function buildQrAuthHeaders({
  accessToken,
  deviceUuid,
  appVer = DEFAULT_APP_VER,
  lang = 'ko',
  userAgent = QR_USER_AGENT,
}: any = {}) {
  const headers = {
    'Authorization': buildAuthorizationHeader(accessToken, deviceUuid),
    'A': buildAHeader(appVer, lang),
  };
  if (userAgent) headers['User-Agent'] = userAgent;
  return headers;
}

/**
 * Extract QR id from url or return as-is.
 */
function extractQrId(qrUrlOrId) {
  if (!qrUrlOrId) {
    throw new Error('qrId is required');
  }
  const raw = String(qrUrlOrId);
  const match = raw.match(/[?&]id=([^&]+)/);
  const id = match ? match[1] : raw;
  try {
    return decodeURIComponent(id);
  } catch {
    return id;
  }
}

/**
 * Generate macResponse for QR authorize (HMAC-SHA256).
 *
 * From decompiled: QRLoginViewModel.kt
 * macResponse = Base64(HMAC_SHA256(refreshToken, challenge)).trim()
 */
function generateQrMacResponse(qrId, refreshToken) {
  if (!refreshToken) {
    throw new Error('refreshToken is required to generate macResponse');
  }
  const normalizedId = extractQrId(qrId);
  const decoded = Buffer.from(normalizedId, 'base64').toString('utf-8');
  let payload;
  try {
    payload = JSON.parse(decoded);
  } catch (err) {
    throw new Error(`Invalid QR id payload: ${err.message}`);
  }
  if (!payload || typeof payload.challenge !== 'string') {
    throw new Error('QR id payload missing challenge');
  }
  const mac = crypto.createHmac('sha256', refreshToken).update(payload.challenge, 'utf-8').digest('base64');
  return mac.trim();
}

/**
 * Check if a model name is allowlisted for sub-device login.
 *
 * GET https://katalk.kakao.com/android/account/allowlist.json?model_name=...
 *
 * From decompiled:
 *   - SubDeviceLoginService.java: GET allowlist.json (model_name)
 */
async function subDeviceAllowList({
  modelName,
  appVer = DEFAULT_APP_VER,
  lang = 'ko',
  osVer = DEFAULT_OS_VER,
}: any = {}) {
  if (!modelName) {
    throw new Error('modelName is required for allowlist check');
  }

  const headers = {
    'User-Agent': buildUserAgent(appVer, osVer),
    'A': buildAHeader(appVer, lang),
  };

  const path = `/android/account/allowlist.json?model_name=${encodeURIComponent(modelName)}`;
  const res = await httpsGet(KATALK_HOST, path, headers);

  if (res.status !== 200) {
    throw new Error(`allowlist HTTP error: ${res.status}`);
  }

  return res.body;
}

/**
 * Sub-device email/password login.
 *
 * POST https://katalk.kakao.com/android/account/login.json
 *
 * From decompiled:
 *   - SubDeviceLoginService.java: POST login.json
 *   - SubDeviceLoginParams.kt: email, password (plaintext), device_uuid, ...
 *   - XVCHeader.kt: X-VC = SHA512("BARD|{deviceUuid}|DANTE|{accountKey}|SIAN").substring(0,16)
 *
 * @param {Object} opts
 * @param {string} opts.email - Kakao account email
 * @param {string} opts.password - Kakao account password (plaintext)
 * @param {string} [opts.deviceUuid] - Device UUID (auto-generated if not provided)
 * @param {string} [opts.deviceName] - Device name
 * @param {string} [opts.modelName] - Device model name
 * @param {boolean} [opts.forced] - Force login (kick other sub-devices)
 * @param {boolean} [opts.permanent] - Permanent login
 * @param {boolean} [opts.checkAllowlist=true] - Check allowlist.json before login
 * @param {boolean} [opts.enforceAllowlist=false] - Throw if not allowlisted
 * @param {string} [opts.appVer] - App version
 * @returns {Promise<Object>} Login response with access_token, refresh_token, userId, etc.
 */
async function subDeviceLogin({
  email,
  password,
  deviceUuid,
  deviceName = DEFAULT_DEVICE_NAME,
  modelName = DEFAULT_MODEL_NAME,
  forced = false,
  permanent = true,
  checkAllowlist = true,
  enforceAllowlist = false,
  appVer = DEFAULT_APP_VER,
}: any) {
  if (!deviceUuid) {
    deviceUuid = generateDeviceUuid();
  }

  if (checkAllowlist && modelName) {
    try {
      const allowRes = await subDeviceAllowList({ modelName, appVer });
      const allowlisted = !!allowRes?.allowlisted;
      console.log(`[*] SubDevice allowlist: model=${modelName}, allowlisted=${allowlisted}`);
      if (!allowlisted && enforceAllowlist) {
        throw new Error('Model not allowlisted for sub-device login');
      }
    } catch (err) {
      if (enforceAllowlist) throw err;
      console.warn(`[!] Allowlist check failed: ${err.message}`);
    }
  }

  // XVC header: account key is email
  const xvc = generateXVCHeader(deviceUuid, email);

  const formData = {
    email,
    password,
    device_uuid: deviceUuid,
    device_name: deviceName,
    model_name: modelName,
    forced,
    permanent,
  };

  const headers = {
    'User-Agent': buildUserAgent(appVer),
    'A': buildAHeader(appVer),
    'X-VC': xvc,
  };

  console.log(`[*] SubDevice login: email=${email}, device=${deviceUuid.substring(0, 8)}...`);

  const res = await httpsPost(
    KATALK_HOST,
    '/android/account/login.json',
    formData,
    headers,
  );

  if (res.status !== 200) {
    console.error(`[!] Login HTTP error: ${res.status}`);
    console.error('[!] Body:', JSON.stringify(res.body, null, 2));
    throw new Error(`Login failed with HTTP ${res.status}`);
  }

  const body = res.body;

  if (body.status && body.status !== 0) {
    console.error(`[!] Login error status: ${body.status}`);
    console.error('[!] Body:', JSON.stringify(body, null, 2));
    throw new Error(`Login failed: status=${body.status}, message=${body.message || 'unknown'}`);
  }

  console.log(`[+] Login success: userId=${body.userId}`);

  return {
    userId: body.userId,
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    tokenType: body.token_type,
    deviceUuid,
    raw: body,
  };
}

/**
 * Refresh an OAuth2 token.
 *
 * POST https://katalk.kakao.com/android/account/oauth2_token.json
 *
 * From decompiled: OAuth2Service.java
 */
async function refreshOAuthToken({
  refreshToken,
  accessToken,
  deviceUuid,
  appVer = DEFAULT_APP_VER,
  lang = 'ko',
}: any) {
  if (!accessToken) {
    throw new Error('accessToken is required for token refresh');
  }
  if (!deviceUuid) {
    throw new Error('deviceUuid is required for token refresh');
  }

  const jsonData = {
    access_token: accessToken,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  };

  const authDevice = buildDeviceId(deviceUuid);
  const headers = {
    'Authorization': buildAuthorizationHeader(accessToken, authDevice),
    'User-Agent': buildUserAgent(appVer),
    'A': buildAHeader(appVer, lang),
    'Accept-Language': lang,
    'C': crypto.randomUUID(),
    'Connection': 'Close',
  };
  const res = await httpsPostJson(
    KATALK_HOST,
    '/android/account/oauth2_token.json',
    jsonData,
    headers,
  );

  if (res.status === 200 && (!res.body?.status || res.body.status === 0)) {
    return {
      accessToken: res.body.access_token,
      refreshToken: res.body.refresh_token || refreshToken,
      tokenType: res.body.token_type,
      expiresIn: res.body.expires_in,
    };
  }

  const body = res?.body ?? res;
  throw new Error(`Token refresh failed: ${JSON.stringify(body)}`);
}

/**
 * QR Code Login - Step 1: Generate QR code.
 *
 * POST https://katalk.kakao.com/android/account/qrCodeLogin/generate
 *
 * From decompiled: QRLoginService (r.java) → qrCodeLogin/generate
 * Request: { device: { name, uuid, model, osVersion }, previousId? }
 * Response: { status, url, remainingSeconds }
 *
 * @param {Object} opts
 * @param {string} opts.deviceUuid - Device UUID
 * @param {string} [opts.deviceName] - Device name
 * @param {string} [opts.modelName] - Device model name
 * @param {string} [opts.osVer] - OS version
 * @param {string} [opts.previousId] - Previous QR session ID (for refresh)
 * @param {string} [opts.appVer] - App version
 * @returns {Promise<Object>} { status, url, remainingSeconds }
 */
async function qrGenerate({
  deviceUuid,
  deviceName,
  modelName = DEFAULT_QR_MODEL_NAME,
  osVer = DEFAULT_OS_VER,
  previousId = null,
  appVer = DEFAULT_APP_VER,
}: any) {
  const jsonData: any = {
    device: {
      name: deviceName || modelName,
      uuid: deviceUuid,
      model: modelName,
      osVersion: osVer,
    },
  };
  if (previousId) {
    jsonData.previousId = previousId;
  }

  const headers = {
    'User-Agent': QR_USER_AGENT,
    'A': buildAHeader(appVer),
  };

  const res = await httpsPostJson(
    KATALK_HOST,
    '/android/account/qrCodeLogin/generate',
    jsonData,
    headers,
  );

  if (res.status !== 200) {
    throw new Error(`QR generate HTTP error: ${res.status}`);
  }

  const body = res.body;
  if (body.status && body.status !== 0) {
    throw new Error(`QR generate failed: status=${body.status}`);
  }

  return {
    status: body.status,
    url: body.url,
    remainingSeconds: body.remainingSeconds,
  };
}

/**
 * QR Code Login - Step 0: Get QR info (main device).
 *
 * GET https://katalk.kakao.com/android/account/qrCodeLogin/info?id=...
 */
async function qrInfo({
  qrId,
  accessToken,
  deviceUuid,
  appVer = DEFAULT_APP_VER,
  lang = 'ko',
}: any = {}) {
  const headers = buildQrAuthHeaders({ accessToken, deviceUuid, appVer, lang });
  const path = `/android/account/qrCodeLogin/info?id=${encodeURIComponent(extractQrId(qrId))}`;
  const res = await httpsGet(KATALK_HOST, path, headers);

  if (res.status !== 200) {
    throw new Error(`QR info HTTP error: ${res.status}`);
  }

  return res.body;
}

/**
 * QR Code Login - Step 2: Poll for login result.
 *
 * POST https://katalk.kakao.com/android/account/qrCodeLogin/login
 *
 * From decompiled: QRLoginService (r.java) → qrCodeLogin/login
 * Request: { device: { uuid }, id }
 * Response: { status, nextRequestIntervalInSeconds, passcode, remainingSeconds, user, accessToken, refreshToken, tokenType }
 *
 * @param {Object} opts
 * @param {string} opts.deviceUuid - Device UUID
 * @param {string} opts.qrId - QR session ID (from generate url or response)
 * @param {string} [opts.appVer] - App version
 * @returns {Promise<Object>} Poll response
 */
async function qrPollLogin({
  deviceUuid,
  qrId,
  appVer = DEFAULT_APP_VER,
}: any) {
  const jsonData: any = {
    device: {
      uuid: deviceUuid,
    },
    id: extractQrId(qrId),
  };

  const headers = {
    'User-Agent': QR_USER_AGENT,
    'A': buildAHeader(appVer),
  };

  const res = await httpsPostJson(
    KATALK_HOST,
    '/android/account/qrCodeLogin/login',
    jsonData,
    headers,
  );

  if (res.status !== 200) {
    throw new Error(`QR poll HTTP error: ${res.status}`);
  }

  return res.body;
}

/**
 * QR Code Login - Authorize (main device).
 *
 * POST https://katalk.kakao.com/android/account/qrCodeLogin/authorize
 *
 * Request: { id, macResponse, forceLogin }
 */
async function qrAuthorize({
  qrId,
  refreshToken,
  accessToken,
  deviceUuid,
  forceLogin = false,
  appVer = DEFAULT_APP_VER,
  lang = 'ko',
}: any = {}) {
  const macResponse = generateQrMacResponse(qrId, refreshToken);
  const headers = buildQrAuthHeaders({ accessToken, deviceUuid, appVer, lang });
  headers['Content-Type'] = 'application/json';

  const jsonData: any = {
    id: extractQrId(qrId),
    macResponse,
    forceLogin: !!forceLogin,
  };

  const res = await httpsPostJson(
    KATALK_HOST,
    '/android/account/qrCodeLogin/authorize',
    jsonData,
    headers,
  );

  if (res.status !== 200) {
    throw new Error(`QR authorize HTTP error: ${res.status}`);
  }

  return res.body;
}

/**
 * QR Code Login - Deny (main device).
 *
 * POST https://katalk.kakao.com/android/account/qrCodeLogin/deny
 *
 * Request: { id }
 */
async function qrDeny({
  qrId,
  accessToken,
  deviceUuid,
  appVer = DEFAULT_APP_VER,
  lang = 'ko',
}: any = {}) {
  const headers = buildQrAuthHeaders({ accessToken, deviceUuid, appVer, lang });
  headers['Content-Type'] = 'application/json';

  const jsonData: any = { id: extractQrId(qrId) };

  const res = await httpsPostJson(
    KATALK_HOST,
    '/android/account/qrCodeLogin/deny',
    jsonData,
    headers,
  );

  if (res.status !== 200) {
    throw new Error(`QR deny HTTP error: ${res.status}`);
  }

  return res.body;
}

/**
 * QR Code Login - Step 3: Confirm with passcode.
 *
 * POST https://katalk.kakao.com/android/account/qrCodeLogin/confirm
 *
 * From decompiled: QRLoginService (r.java) → qrCodeLogin/confirm
 * Request: { id, passcode, forced?, permanent? }
 * Response: { status }
 */
async function qrConfirm({
  qrId,
  passcode,
  forced = false,
  permanent = true,
  accessToken,
  deviceUuid,
  appVer = DEFAULT_APP_VER,
  lang = 'ko',
}: any) {
  const jsonData: any = {
    id: extractQrId(qrId),
    passcode,
  };
  if (forced) jsonData.forced = true;
  if (permanent) jsonData.permanent = true;

  const headers = {
    'User-Agent': QR_USER_AGENT,
    'A': buildAHeader(appVer, lang),
    'Content-Type': 'application/json',
  };
  if (accessToken && deviceUuid) {
    headers['Authorization'] = buildAuthorizationHeader(accessToken, deviceUuid);
  }

  const res = await httpsPostJson(
    KATALK_HOST,
    '/android/account/qrCodeLogin/confirm',
    jsonData,
    headers,
  );

  if (res.status !== 200) {
    throw new Error(`QR confirm HTTP error: ${res.status}`);
  }

  return res.body;
}

/**
 * QR Code Login - Cancel session.
 *
 * POST https://katalk.kakao.com/android/account/qrCodeLogin/cancel
 */
async function qrCancel({
  deviceUuid,
  qrId,
  appVer = DEFAULT_APP_VER,
}: any) {
  const jsonData: any = {
    device: {
      uuid: deviceUuid,
    },
    id: extractQrId(qrId),
  };

  const headers = {
    'User-Agent': QR_USER_AGENT,
    'A': buildAHeader(appVer),
  };

  const res = await httpsPostJson(
    KATALK_HOST,
    '/android/account/qrCodeLogin/cancel',
    jsonData,
    headers,
  );

  return res.body;
}

/**
 * High-level QR login flow.
 *
 * 1. Generate QR code → display URL
 * 2. Poll for login result until approved or timeout
 * 3. Confirm with passcode if needed
 *
 * @param {Object} opts
 * @param {string} opts.deviceUuid - Device UUID
 * @param {string} [opts.deviceName] - Device name
 * @param {string} [opts.modelName] - Device model name
 * @param {string} [opts.osVer] - OS version
 * @param {boolean} [opts.forced] - Force login
 * @param {boolean} [opts.permanent] - Permanent login
 * @param {boolean} [opts.checkAllowlist=true] - Check allowlist.json before QR login
 * @param {boolean} [opts.enforceAllowlist=false] - Throw if not allowlisted
 * @param {string} [opts.appVer] - App version
 * @param {function} [opts.onQrUrl] - Callback when QR URL is ready: (url) => {}
 * @param {function} [opts.onPasscode] - Callback when passcode is shown: (passcode) => {}
 * @returns {Promise<Object>} { userId, accessToken, refreshToken, tokenType, deviceUuid }
 */
async function qrLogin({
  deviceUuid,
  deviceName = DEFAULT_DEVICE_NAME,
  modelName = DEFAULT_QR_MODEL_NAME,
  osVer = DEFAULT_OS_VER,
  forced = false,
  permanent = true,
  checkAllowlist = true,
  enforceAllowlist = false,
  appVer = DEFAULT_APP_VER,
  onQrUrl = null,
  onPasscode = null,
}: any) {
  if (!deviceUuid) {
    deviceUuid = generateDeviceUuid();
  }

  if (checkAllowlist && modelName) {
    try {
      const allowRes = await subDeviceAllowList({ modelName, appVer });
      const allowlisted = !!allowRes?.allowlisted;
      console.log(`[*] SubDevice allowlist (QR): model=${modelName}, allowlisted=${allowlisted}`);
      if (!allowlisted && enforceAllowlist) {
        throw new Error('Model not allowlisted for sub-device QR login');
      }
    } catch (err) {
      if (enforceAllowlist) throw err;
      console.warn(`[!] Allowlist check failed: ${err.message}`);
    }
  }

  // Step 1: Generate QR
  console.log('[*] Generating QR code...');
  const qrResult = await qrGenerate({
    deviceUuid,
    deviceName,
    modelName,
    osVer,
    appVer,
  });

  const qrPath = qrResult.url;
  const qrId = extractQrId(qrPath);

  // 실제 앱은 서버 응답의 상대 경로를 그대로 QR에 인코딩함 (호스트 없이)
  const qrContent = qrPath;
  console.log(`[+] QR content: ${qrContent}`);
  console.log(`[*] QR expires in ${qrResult.remainingSeconds} seconds`);

  if (onQrUrl) {
    onQrUrl(qrContent);
  }

  // Step 2: Poll for login
  console.log('[*] Waiting for QR scan...');
  const pollStartTime = Date.now();
  const maxWaitMs = (qrResult.remainingSeconds || 180) * 1000;
  let pollInterval = 2000; // default 2s
  let passcodeSent = false;

  while (Date.now() - pollStartTime < maxWaitMs) {
    await new Promise(r => setTimeout(r, pollInterval));

    const pollRes = await qrPollLogin({
      deviceUuid,
      qrId,
      appVer,
    });

    // Update poll interval from server
    if (pollRes.nextRequestIntervalInSeconds) {
      pollInterval = pollRes.nextRequestIntervalInSeconds * 1000;
    }

    // status -100: QR 스캔됨, 패스코드 확인 대기
    if (pollRes.passcode && !passcodeSent) {
      passcodeSent = true;
      if (onPasscode) {
        onPasscode(pollRes.passcode);
      }
    }

    // Check if we got tokens (login approved)
    if (pollRes.accessToken) {
      console.log(`\n[+] QR login approved: userId=${pollRes.user?.userId}`);

      return {
        userId: pollRes.user?.userId,
        accessToken: pollRes.accessToken,
        refreshToken: pollRes.refreshToken,
        tokenType: pollRes.tokenType,
        deviceUuid,
        raw: pollRes,
      };
    }

    // If server gives a poll interval, it means "keep waiting"
    // Only treat as error if no poll interval and status is negative
    if (!pollRes.nextRequestIntervalInSeconds && pollRes.status && pollRes.status !== 0) {
      throw new Error(`QR login failed: status=${pollRes.status}`);
    }

    const elapsed = Math.round((Date.now() - pollStartTime) / 1000);
    const remaining = pollRes.remainingSeconds || Math.round((maxWaitMs - (Date.now() - pollStartTime)) / 1000);
    process.stdout.write(`\r[*] Waiting for QR scan... (${elapsed}s elapsed, ${remaining}s remaining)`);
  }

  // Timeout - cancel QR session
  console.log('\n[!] QR login timed out');
  await qrCancel({ deviceUuid, qrId, appVer }).catch(() => {});
  throw new Error('QR login timed out');
}

export {
  subDeviceLogin,
  subDeviceAllowList,
  refreshOAuthToken,
  qrGenerate,
  qrInfo,
  qrPollLogin,
  qrAuthorize,
  qrDeny,
  qrConfirm,
  qrCancel,
  qrLogin,
  buildAuthorizationHeader,
  buildDeviceId,
  buildQrAuthHeaders,
  generateQrMacResponse,
  extractQrId,
  generateDeviceUuid,
  buildUserAgent,
  buildAHeader,
  httpsPost,
  httpsPostJson,
  httpsGet,
};
