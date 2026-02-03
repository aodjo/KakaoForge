import { buildAHeader, buildAuthorizationHeader, buildDeviceId, buildLegacyDeviceId, buildUserAgent, httpsGet, httpsPostJson } from '../auth/login';

export const CALENDAR_HOST = 'talk-pilsner.kakao.com';
const CALENDAR_BASE = '/calendar/talk';

export type CalendarClientOptions = {
  oauthToken: string;
  deviceUuid: string;
  deviceId?: string;
  appVer?: string;
  lang?: string;
  os?: string;
  timeZone?: string;
  hasAccount?: string | boolean;
  adid?: string;
  dtype?: string | number;
};

function buildQuery(params: Record<string, any>) {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return parts.length > 0 ? `?${parts.join('&')}` : '';
}

export class CalendarClient {
  oauthToken: string;
  deviceUuid: string;
  deviceId: string;
  appVer: string;
  lang: string;
  os: string;
  timeZone: string;
  hasAccount: string;
  adid: string;
  dtype: string;

  constructor(opts: CalendarClientOptions) {
    this.oauthToken = opts.oauthToken;
    this.deviceUuid = opts.deviceUuid;
    this.deviceId = opts.deviceId || buildDeviceId(opts.deviceUuid);
    this.appVer = opts.appVer || '26.1.2';
    this.lang = opts.lang || 'ko';
    this.os = opts.os || 'android';
    this.timeZone = opts.timeZone || 'Asia/Seoul';
    if (typeof opts.hasAccount === 'boolean') {
      this.hasAccount = opts.hasAccount ? 'true' : 'false';
    } else if (typeof opts.hasAccount === 'string') {
      this.hasAccount = opts.hasAccount;
    } else {
      this.hasAccount = '';
    }
    this.adid = opts.adid || opts.deviceUuid || '';
    this.dtype = opts.dtype !== undefined && opts.dtype !== null ? String(opts.dtype) : '1';
  }

  _authDevices() {
    const candidates: string[] = [];
    if (this.deviceId) candidates.push(this.deviceId);
    if (this.deviceUuid) candidates.push(this.deviceUuid);
    try {
      const legacy = buildLegacyDeviceId(this.deviceUuid);
      if (legacy) candidates.push(legacy);
    } catch {
      // ignore
    }
    return Array.from(new Set(candidates.filter(Boolean)));
  }

  _headers(extra: Record<string, string> = {}, authDevice?: string) {
    const device = authDevice || this.deviceId || this.deviceUuid;
    return {
      'Authorization': buildAuthorizationHeader(this.oauthToken, device),
      'A': buildAHeader(this.appVer, this.lang),
      'User-Agent': buildUserAgent(this.appVer),
      'talk-agent': `${this.os}/${this.appVer}`,
      'talk-language': this.lang,
      'TZ': this.timeZone,
      'hasAccount': this.hasAccount,
      'ADID': this.adid,
      'dtype': this.dtype,
      ...extra,
    };
  }

  _captureHeaders(res: any) {
    const headers = res?.headers || {};
    const hasAccount = headers['hasaccount'] ?? headers['hasAccount'];
    if (hasAccount !== undefined && hasAccount !== null) {
      this.hasAccount = Array.isArray(hasAccount) ? String(hasAccount[0] ?? '') : String(hasAccount);
    }
  }

  async _requestWithFallback(requestFn: (authDevice: string) => Promise<any>) {
    const devices = this._authDevices();
    let lastRes: any = null;
    for (const device of devices) {
      lastRes = await requestFn(device);
      if (lastRes?.status !== 401) {
        if (device && device !== this.deviceId) {
          this.deviceId = device;
        }
        return lastRes;
      }
    }
    return lastRes;
  }

  async createEvent(event: any, { referer, templateId, originalEId }: any = {}) {
    const query = buildQuery({ referer, templateId, originalEId });
    const path = `${CALENDAR_BASE}/events${query}`;
    return await this._requestWithFallback(async (authDevice) => {
      const res = await httpsPostJson(CALENDAR_HOST, path, event, this._headers({}, authDevice));
      this._captureHeaders(res);
      return res;
    });
  }

  async connectEvent(eId: string, chatId: number | string, referer?: string) {
    const query = buildQuery({ eId, chatId, referer });
    const path = `${CALENDAR_BASE}/chat/connectEvent${query}`;
    return await this._requestWithFallback(async (authDevice) => {
      const res = await httpsPostJson(CALENDAR_HOST, path, {}, this._headers({}, authDevice));
      this._captureHeaders(res);
      return res;
    });
  }

  async shareMessage(eId: string, referer?: string) {
    const query = buildQuery({ eId, referer });
    const path = `${CALENDAR_BASE}/chat/shareMessage${query}`;
    return await this._requestWithFallback(async (authDevice) => {
      const res = await httpsGet(CALENDAR_HOST, path, this._headers({}, authDevice));
      this._captureHeaders(res);
      return res;
    });
  }
}
