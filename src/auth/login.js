const https = require('https');
const zlib = require('zlib');
const { URL } = require('url');
const crypto = require('crypto');
const { generateXVCHeader } = require('./crypto');

const KATALK_HOST = 'katalk.kakao.com';
const AUTH_HOST = 'auth.kakao.com';

// Default Android KakaoTalk-like values
const DEFAULT_APP_VER = '26.1.2';
const DEFAULT_OS_VER = '14';
const DEFAULT_DEVICE_NAME = 'KakaoForge';
const DEFAULT_MODEL_NAME = 'SM-G998N';
// QR 로그인은 태블릿 모델만 허용 (allowlist.json 기준)
const DEFAULT_QR_MODEL_NAME = 'SM-X800';
// QR 서비스는 별도 OkHttpClient 사용 → User-Agent가 다름
const QR_USER_AGENT = 'okhttp/4.12.0';

/**
 * Generate a random device UUID.
 */
function generateDeviceUuid() {
  return crypto.randomBytes(32).toString('hex').substring(0, 64);
}

/**
 * Make an HTTPS POST request with form-encoded body.
 */
function httpsPost(host, path, formData, headers = {}) {
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
function httpsPostJson(host, path, jsonData, headers = {}) {
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
  appVer = DEFAULT_APP_VER,
}) {
  if (!deviceUuid) {
    deviceUuid = generateDeviceUuid();
  }

  // XVC header: account key is empty string for login (not yet authenticated)
  const xvc = generateXVCHeader(deviceUuid, '');

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
  deviceUuid,
  appVer = DEFAULT_APP_VER,
}) {
  const xvc = generateXVCHeader(deviceUuid, '');

  const formData = {
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  };

  const headers = {
    'User-Agent': buildUserAgent(appVer),
    'A': buildAHeader(appVer),
    'X-VC': xvc,
  };

  const res = await httpsPost(
    KATALK_HOST,
    '/android/account/oauth2_token.json',
    formData,
    headers,
  );

  if (res.status !== 200 || (res.body.status && res.body.status !== 0)) {
    throw new Error(`Token refresh failed: ${JSON.stringify(res.body)}`);
  }

  return {
    accessToken: res.body.access_token,
    refreshToken: res.body.refresh_token || refreshToken,
    tokenType: res.body.token_type,
    expiresIn: res.body.expires_in,
  };
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
}) {
  const jsonData = {
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
}) {
  const jsonData = {
    device: {
      uuid: deviceUuid,
    },
    id: qrId,
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
  appVer = DEFAULT_APP_VER,
}) {
  const jsonData = {
    id: qrId,
    passcode,
  };
  if (forced) jsonData.forced = true;
  if (permanent) jsonData.permanent = true;

  const headers = {
    'User-Agent': QR_USER_AGENT,
    'A': buildAHeader(appVer),
    'Content-Type': 'application/json',
  };

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
}) {
  const jsonData = {
    device: {
      uuid: deviceUuid,
    },
    id: qrId,
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
  appVer = DEFAULT_APP_VER,
  onQrUrl = null,
  onPasscode = null,
}) {
  if (!deviceUuid) {
    deviceUuid = generateDeviceUuid();
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

  // Extract QR ID from URL query parameter
  const idMatch = qrPath.match(/[?&]id=([^&]+)/);
  const qrId = idMatch ? decodeURIComponent(idMatch[1]) : qrPath;

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

module.exports = {
  subDeviceLogin,
  refreshOAuthToken,
  qrGenerate,
  qrPollLogin,
  qrConfirm,
  qrCancel,
  qrLogin,
  generateDeviceUuid,
  buildUserAgent,
  buildAHeader,
  httpsPost,
  httpsPostJson,
  KATALK_HOST,
  AUTH_HOST,
  DEFAULT_APP_VER,
  DEFAULT_QR_MODEL_NAME,
};
