import { buildAHeader, buildAuthorizationHeader, buildUserAgent, httpsGet, httpsPostJson } from '../auth/login';

export const CALENDAR_HOST = 'talk-pilsner.kakao.com';
const CALENDAR_BASE = '/calendar/talk';

export type CalendarClientOptions = {
  oauthToken: string;
  deviceUuid: string;
  appVer?: string;
  lang?: string;
  os?: string;
  timeZone?: string;
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
  appVer: string;
  lang: string;
  os: string;
  timeZone: string;

  constructor(opts: CalendarClientOptions) {
    this.oauthToken = opts.oauthToken;
    this.deviceUuid = opts.deviceUuid;
    this.appVer = opts.appVer || '26.1.2';
    this.lang = opts.lang || 'ko';
    this.os = opts.os || 'android';
    this.timeZone = opts.timeZone || 'Asia/Seoul';
  }

  _headers(extra: Record<string, string> = {}) {
    return {
      'Authorization': buildAuthorizationHeader(this.oauthToken, this.deviceUuid),
      'A': buildAHeader(this.appVer, this.lang),
      'User-Agent': buildUserAgent(this.appVer),
      'talk-agent': `${this.os}/${this.appVer}`,
      'talk-language': this.lang,
      'TZ': this.timeZone,
      ...extra,
    };
  }

  async createEvent(event: any, { referer, templateId, originalEId }: any = {}) {
    const query = buildQuery({ referer, templateId, originalEId });
    const path = `${CALENDAR_BASE}/events${query}`;
    return await httpsPostJson(CALENDAR_HOST, path, event, this._headers());
  }

  async connectEvent(eId: string, chatId: number | string, referer?: string) {
    const query = buildQuery({ eId, chatId, referer });
    const path = `${CALENDAR_BASE}/chat/connectEvent${query}`;
    return await httpsPostJson(CALENDAR_HOST, path, {}, this._headers());
  }

  async shareMessage(eId: string, referer?: string) {
    const query = buildQuery({ eId, referer });
    const path = `${CALENDAR_BASE}/chat/shareMessage${query}`;
    return await httpsGet(CALENDAR_HOST, path, this._headers());
  }
}
