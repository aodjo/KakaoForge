import { buildAHeader, buildAuthorizationHeader, buildDeviceId, buildUserAgent, httpsGet, httpsPostJson } from '../auth/login';

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
    this.dtype = opts.dtype !== undefined && opts.dtype !== null ? String(opts.dtype) : '2';
  }

  _headers(extra: Record<string, string> = {}) {
    return {
      'Authorization': buildAuthorizationHeader(this.oauthToken, this.deviceId || this.deviceUuid),
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

  async createEvent(event: any, { referer, templateId, originalEId }: any = {}) {
    const query = buildQuery({ referer, templateId, originalEId });
    const path = `${CALENDAR_BASE}/events${query}`;
    const res = await httpsPostJson(CALENDAR_HOST, path, event, this._headers());
    this._captureHeaders(res);
    return res;
  }

  async connectEvent(eId: string, chatId: number | string, referer?: string) {
    const query = buildQuery({ eId, chatId, referer });
    const path = `${CALENDAR_BASE}/chat/connectEvent${query}`;
    const res = await httpsPostJson(CALENDAR_HOST, path, {}, this._headers());
    this._captureHeaders(res);
    return res;
  }

  async shareMessage(eId: string, referer?: string) {
    const query = buildQuery({ eId, referer });
    const path = `${CALENDAR_BASE}/chat/shareMessage${query}`;
    const res = await httpsGet(CALENDAR_HOST, path, this._headers());
    this._captureHeaders(res);
    return res;
  }
}
