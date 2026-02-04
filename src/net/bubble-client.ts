import { buildAHeader, buildAuthorizationHeader, buildDeviceId, buildUserAgent, httpsPostJson } from '../auth/login';

export const BUBBLE_HOST = 'talk-pilsner.kakao.com';
const BUBBLE_BASE = '/messaging/chats';

export type BubbleClientOptions = {
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

export type ReactionPayload = {
  logId: number | string;
  type: number;
  linkId?: number | string;
  reqId?: number | string;
};

export class BubbleClient {
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

  constructor(opts: BubbleClientOptions) {
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

  async sendReaction(chatId: number | string, reaction: ReactionPayload) {
    const payload: any = {
      logId: reaction.logId,
      type: reaction.type,
      reqId: reaction.reqId ?? Date.now(),
    };
    if (reaction.linkId !== undefined && reaction.linkId !== null && reaction.linkId !== '') {
      payload.linkId = reaction.linkId;
    }
    const path = `${BUBBLE_BASE}/${encodeURIComponent(String(chatId))}/bubble/reactions`;
    const res = await httpsPostJson(BUBBLE_HOST, path, payload, this._headers());
    this._captureHeaders(res);
    return res;
  }
}
