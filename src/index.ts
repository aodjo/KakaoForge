import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import * as LosslessJSON from 'lossless-json';
import { spawn, spawnSync } from 'child_process';
import { Long } from 'bson';
import { BookingClient } from './net/booking-client';
import { CarriageClient } from './net/carriage-client';
import { TicketClient } from './net/ticket-client';
import { CalendarClient } from './net/calendar-client';
import { BubbleClient, type ReactionPayload } from './net/bubble-client';
import {
  subDeviceLogin,
  refreshOAuthToken,
  qrLogin,
  generateDeviceUuid,
  buildDeviceId,
  buildUserAgent,
  buildAuthorizationHeader,
  buildAHeader,
  httpsGet,
  KATALK_HOST,
  DEFAULT_QR_MODEL_NAME,
} from './auth/login';
import { nextClientMsgId } from './util/client-msg-id';
import { MessageType, type MessageTypeValue } from './types/message';
import { Reactions, type ReactionTypeValue } from './types/reaction';
import { type MemberTypeValue } from './types/member-type';
import { guessMime, readImageSize } from './util/media';
import { uploadMultipartFile } from './net/upload-client';

export type TransportMode = 'loco' | null;

export type MessageEvent = {
  message: {
    id: number | string;
    text: string;
    type: number;
    logId: number | string;
  };
  attachmentsRaw: any[];
  sender: {
    id: number | string;
    name: string;
    type: MemberTypeValue;
  };
  room: {
    id: number | string;
    name: string;
    isGroupChat: boolean;
    isOpenChat: boolean;
    openLinkId?: number | string;
  };
  raw: any;
  // Legacy aliases for compatibility
  chatId: number | string;
  senderId: number | string;
  text: string;
  type: number;
  logId: number | string;
};

export type MemberAction = 'join' | 'leave' | 'invite' | 'kick';

export type MemberEvent = {
  type: MemberAction;
  room: MessageEvent['room'];
  actor?: MessageEvent['sender'];
  member?: {
    ids: Array<number | string>;
    names: string[];
  };
  members?: MessageEvent['sender'][];
  message?: MessageEvent;
  raw: any;
};

export type DeleteEvent = {
  type: 'delete';
  room: MessageEvent['room'];
  actor: MessageEvent['sender'];
  member: {
    ids: Array<number | string>;
    names: string[];
  };
  members: MessageEvent['sender'][];
  message: {
    id: number | string;
    logId: number | string;
  };
  raw: any;
  // Legacy aliases for compatibility
  chatId: number | string;
  logId: number | string;
};

export type HideEvent = {
  type: 'hide';
  room: MessageEvent['room'];
  actor: MessageEvent['sender'];
  member: {
    ids: Array<number | string>;
    names: string[];
  };
  members: MessageEvent['sender'][];
  message: {
    id: number | string;
    logId: number | string;
  };
  category?: string;
  report?: boolean;
  hidden?: boolean;
  coverType?: string;
  feedType?: number;
  raw: any;
  // Legacy aliases for compatibility
  chatId: number | string;
  logId: number | string;
};

export { MemberType } from './types/member-type';
export type { MemberTypeValue } from './types/member-type';
export type MemberType = MemberTypeValue;

export type SendOptions = {
  msgId?: number;
  noSeen?: boolean;
  supplement?: string;
  from?: string;
  extra?: string;
  scope?: number;
  sendToChatRoom?: boolean;
  threadId?: number | string | Long;
  featureStat?: string;
  silence?: boolean;
  isSilence?: boolean;
  type?: number;
  mentions?: MentionInput[];
  spoilers?: SpoilerInput[];
};

export type ReplyTarget = {
  logId: number | string;
  userId: number | string;
  text?: string;
  type?: number;
  linkId?: number | string;
  isOpenChat?: boolean;
  mentions?: any[];
};

export type ReplyOptions = SendOptions & {
  attachOnly?: boolean;
  attachType?: number;
};

export type ReactionOptions = {
  linkId?: number | string;
  reqId?: number | string;
};

export type MentionInput = {
  userId?: number | string;
  user_id?: number | string;
  id?: number | string;
  at?: number[] | number;
  len?: number;
  length?: number;
  text?: string;
  name?: string;
  nickname?: string;
  nickName?: string;
};

export type SpoilerInput = {
  loc?: number;
  len?: number;
  length?: number;
  start?: number;
  end?: number;
};


export type OpenChatKickOptions = {
  linkId?: number | string;
  report?: boolean;
};

export type OpenChatBlindOptions = OpenChatKickOptions & {
  chatLogInfo?: string;
  category?: string;
};

export type EditMessageOptions = {
  type?: number;
  extra?: string | Record<string, any> | any[];
  supplement?: string;
};

export type AttachmentInput = Record<string, any> | any[] | string | UploadResult | { attachment: any };

export type AttachmentSendOptions = SendOptions & UploadOptions & {
  text?: string;
};



export type VideoQuality = 'low' | 'high';

export type VideoTranscodeOptions = {
  transcode?: boolean;
  videoQuality?: VideoQuality;
  ffmpegPath?: string;
  ffprobePath?: string;
  tempDir?: string;
  keepTemp?: boolean;
  videoBitrate?: number;
  videoResolution?: number;
};

export type UploadMediaType = 'photo' | 'video' | 'audio' | 'file';

export type UploadOptions = {
  chatId?: number | string;
  msgId?: number;
  noSeen?: boolean;
  scope?: number;
  threadId?: number | string | Long;
  sendToChatRoom?: boolean;
  supplement?: string;
  featureStat?: string;
  silence?: boolean;
  isSilence?: boolean;
  extra?: string;
  uploadUrl?: string;
  headers?: Record<string, string>;
  fields?: Record<string, any>;
  fieldName?: string;
  filename?: string;
  name?: string;
  mime?: string;
  width?: number;
  height?: number;
  duration?: number;
  timeoutMs?: number;
  onProgress?: (sent: number, total: number) => void;
  auth?: boolean;
  transcode?: boolean;
  videoQuality?: VideoQuality;
  ffmpegPath?: string;
  ffprobePath?: string;
  tempDir?: string;
  keepTemp?: boolean;
  videoBitrate?: number;
  videoResolution?: number;
};

export type UploadResult = {
  accessKey: string;
  attachment: Record<string, any>;
  msgId?: number;
  info?: any;
  raw: any;
  chatLog?: any;
  complete?: any;
};

export type LocationPayload = {
  lat: number;
  lng: number;
  address?: string;
  title?: string;
  isCurrent?: boolean;
  placeId?: number | string;
  extra?: Record<string, any>;
};

export type SchedulePayload = {
  eventAt: number | Date;
  endAt?: number | Date;
  title: string;
  location?: string | Record<string, any>;
  allDay?: boolean;
  members?: Array<number | string>;
  timeZone?: string;
  referer?: string;
  postId?: number | string;
  scheduleId?: number | string;
  subtype?: number;
  alarmAt?: number | Date;
  extra?: Record<string, any>;
};

export type ContactPayload = {
  name: string;
  phone?: string;
  phones?: string[];
  email?: string;
  vcard?: string;
  url?: string;
  path?: string;
  filePath?: string;
  extra?: Record<string, any>;
};

export type ProfilePayload = {
  userId: number | string;
  nickName?: string;
  fullProfileImageUrl?: string;
  profileImageUrl?: string;
  statusMessage?: string;
  accessPermit?: string;
  extra?: Record<string, any>;
};

export type LinkPayload = {
  url?: string;
  text?: string;
  attachment?: AttachmentInput;
  extra?: Record<string, any>;
};

export type KakaoForgeConfig = {
  userId?: number;
  oauthToken?: string;
  deviceUuid?: string;
  authPath?: string;
  autoConnect?: boolean;
  autoReconnect?: boolean;
  sendIntervalMs?: number;
  reconnectMinDelayMs?: number;
  reconnectMaxDelayMs?: number;
  memberCacheTtlMs?: number;
  memberRefreshIntervalMs?: number;
  memberLookupTimeoutMs?: number;
  pingIntervalMs?: number;
  socketKeepAliveMs?: number;
  timeZone?: string;
  hasAccount?: string | boolean;
  adid?: string;
  dtype?: string | number;
  deviceId?: string;
  os?: string;
  appVer?: string;
  lang?: string;
  mccmnc?: string;
  MCCMNC?: string;
  ntype?: number;
  networkType?: number;
  refreshToken?: string;
  debug?: boolean;
  debugGetConf?: boolean;
  videoQuality?: VideoQuality;
  transcodeVideos?: boolean;
  ffmpegPath?: string;
  ffprobePath?: string;
  feedTypeMap?: Record<number, MemberAction>;
};

type AuthFile = {
  userId?: number | string;
  accessToken?: string;
  oauthToken?: string;
  deviceUuid?: string;
  refreshToken?: string;
  savedAt?: string;
};

export type AuthPayload = {
  userId: number | string;
  accessToken: string;
  refreshToken?: string;
  deviceUuid: string;
  savedAt?: string;
  authPath?: string;
  raw?: any;
};

function loadAuthFile(authPath: string): AuthFile {
  if (!fs.existsSync(authPath)) {
    throw new Error(`auth.json not found at ${authPath}. Run createAuthByQR() first.`);
  }
  const raw = fs.readFileSync(authPath, 'utf-8');
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid auth.json at ${authPath}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function sleepMs(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type ChatModule = {
  sendText: (chatId: number | string, text: string, opts?: SendOptions) => Promise<any>;
  sendReply: (chatId: number | string, text: string, replyTo: ReplyTarget | MessageEvent | any, opts?: ReplyOptions) => Promise<any>;
  sendThreadReply: (chatId: number | string, threadId: number | string, text: string, opts?: SendOptions) => Promise<any>;
  sendReaction: (chatId: number | string, target: any, reactionType: ReactionTypeValue, opts?: ReactionOptions) => Promise<any>;
  openChatKick: (chatId: number | string, target: any, opts?: OpenChatKickOptions) => Promise<any>;
  openChatBlind: (chatId: number | string, target: any, opts?: OpenChatBlindOptions) => Promise<any>;
  fetchMessage: (chatId: number | string, logId: number | string) => Promise<MessageEvent>;
  fetchMessagesByUser: (
    chatId: number | string,
    userId: number | string,
    opts?: { since?: number | string; max?: number | string; count?: number; limit?: number; maxPages?: number }
  ) => Promise<MessageEvent[]>;
  getUsernameById: (chatId: number | string, userId: number | string) => Promise<string>;
  deleteMessage: (chatId: number | string, target: any) => Promise<any>;
  editMessage: (chatId: number | string, target: any, text: string, opts?: EditMessageOptions) => Promise<any>;
  send: (chatId: number | string, text: string, opts?: SendOptions) => Promise<any>;
  mention: (userId: number | string, nameOrChatId?: string | number, chatId?: number | string) => string;
  spoiler: (text: string) => string;
  uploadPhoto: (filePath: string, opts?: UploadOptions) => Promise<UploadResult>;
  uploadVideo: (filePath: string, opts?: UploadOptions) => Promise<UploadResult>;
  uploadAudio: (filePath: string, opts?: UploadOptions) => Promise<UploadResult>;
  uploadFile: (filePath: string, opts?: UploadOptions) => Promise<UploadResult>;
  sendPhoto: (chatId: number | string, attachment: AttachmentInput, opts?: AttachmentSendOptions) => Promise<any>;
  sendVideo: (chatId: number | string, attachment: AttachmentInput, opts?: AttachmentSendOptions) => Promise<any>;
  sendAudio: (chatId: number | string, attachment: AttachmentInput, opts?: AttachmentSendOptions) => Promise<any>;
  sendFile: (chatId: number | string, attachment: AttachmentInput, opts?: AttachmentSendOptions) => Promise<any>;
  sendPhotoAtThread: (chatId: number | string, threadId: number | string, attachment: AttachmentInput, opts?: AttachmentSendOptions) => Promise<any>;
  sendVideoAtThread: (chatId: number | string, threadId: number | string, attachment: AttachmentInput, opts?: AttachmentSendOptions) => Promise<any>;
  sendAudioAtThread: (chatId: number | string, threadId: number | string, attachment: AttachmentInput, opts?: AttachmentSendOptions) => Promise<any>;
  sendFileAtThread: (chatId: number | string, threadId: number | string, attachment: AttachmentInput, opts?: AttachmentSendOptions) => Promise<any>;
  sendContact: (chatId: number | string, contact: ContactPayload | AttachmentInput, opts?: AttachmentSendOptions) => Promise<any>;
  sendKakaoProfile: (chatId: number | string, profile: ProfilePayload | AttachmentInput, opts?: AttachmentSendOptions) => Promise<any>;
  sendLocation: (chatId: number | string, location: LocationPayload | AttachmentInput, opts?: AttachmentSendOptions) => Promise<any>;
  sendSchedule: (chatId: number | string, schedule: SchedulePayload | AttachmentInput, opts?: AttachmentSendOptions) => Promise<any>;
  sendLink: (chatId: number | string, link: string | LinkPayload | AttachmentInput, opts?: AttachmentSendOptions) => Promise<any>;
  type?: MemberTypeValue;
};

type ChatRoomInfo = {
  chatId?: number | string;
  type?: string;
  title?: string;
  roomName?: string;
  displayMembers?: any[];
  isGroupChat?: boolean;
  isOpenChat?: boolean;
  openLinkId?: number | string;
  openChatId?: number | string;
  li?: number | string;
  openToken?: number;
  directChat?: boolean;
  needsTitle?: boolean;
  lastChatLogId?: number;
  lastSeenLogId?: number;
  lastLogId?: number;
};

type ChatListCursor = {
  lastTokenId: number | string;
  lastChatId: number | string;
};

type MessageHandler = ((chat: ChatModule, msg: MessageEvent) => void) | ((msg: MessageEvent) => void);
type MemberEventHandler = ((chat: ChatModule, evt: MemberEvent) => void) | ((evt: MemberEvent) => void);
type DeleteEventHandler = ((chat: ChatModule, evt: DeleteEvent) => void) | ((evt: DeleteEvent) => void);
type HideEventHandler = ((chat: ChatModule, evt: HideEvent) => void) | ((evt: HideEvent) => void);

type MemberNameCache = Map<string, Map<string, string>>;

function uniqueStrings(list) {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.map((v) => String(v).trim()).filter(Boolean))];
}

function uniqueNumbers(list) {
  if (!Array.isArray(list)) return [];
  const nums = list.map((v) => Number(v)).filter((v) => Number.isFinite(v) && v > 0);
  return [...new Set(nums)];
}

function toLong(value: any) {
  if (Long.isLong(value)) return value;
  if (typeof value === 'string') {
    if (!value) return Long.fromNumber(0);
    return Long.fromString(value);
  }
  if (typeof value === 'bigint') return Long.fromString(value.toString());
  const num = typeof value === 'number' ? value : parseInt(value, 10);
  return Long.fromNumber(Number.isFinite(num) ? num : 0);
}

function safeNumber(value: any, fallback = 0) {
  const num = typeof value === 'number' ? value : parseInt(value, 10);
  return Number.isFinite(num) ? num : fallback;
}

async function sha1FileHex(filePath: string) {
  return await new Promise<string>((resolve, reject) => {
    const hash = crypto.createHash('sha1');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', (err) => reject(err));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}
type VideoProbe = {
  width: number;
  height: number;
  bitrate: number;
  duration: number;
  rotation: number;
};

function resolveFfmpegBinary(name: 'ffmpeg' | 'ffprobe', opts: { ffmpegPath?: string; ffprobePath?: string } = {}) {
  const envFfmpeg = process.env.KAKAOFORGE_FFMPEG_PATH || process.env.FFMPEG_PATH || '';
  const envFfprobe = process.env.KAKAOFORGE_FFPROBE_PATH || process.env.FFPROBE_PATH || '';
  if (name === 'ffmpeg') {
    return opts.ffmpegPath || envFfmpeg || 'ffmpeg';
  }
  const direct = opts.ffprobePath || envFfprobe;
  if (direct) return direct;
  const ffmpegPath = opts.ffmpegPath || envFfmpeg;
  if (ffmpegPath) {
    const ext = path.extname(ffmpegPath);
    const probeName = ext ? `ffprobe${ext}` : 'ffprobe';
    return path.join(path.dirname(ffmpegPath), probeName);
  }
  return 'ffprobe';
}

function assertBinaryAvailable(binPath: string, label: string) {
  const res = spawnSync(binPath, ['-version'], { windowsHide: true, stdio: 'ignore' });
  if (res.error || res.status !== 0) {
    throw new Error(`${label} not found. Install ffmpeg and ensure it is in PATH, or pass ${label.toLowerCase()}Path.`);
  }
}

function probeVideo(filePath: string, ffprobePath: string): VideoProbe {
  const res = spawnSync(ffprobePath, [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,bit_rate,rotation,codec_type,codec_name:format=duration,bit_rate',
    '-of', 'json',
    filePath,
  ], { windowsHide: true, encoding: 'utf8' });
  if (res.error || res.status !== 0) {
    const errMsg = res.stderr ? String(res.stderr).trim() : 'ffprobe failed';
    throw new Error(`ffprobe failed: ${errMsg}`);
  }
  let data: any = {};
  try {
    data = JSON.parse(res.stdout || '{}');
  } catch {
    data = {};
  }
  const stream = Array.isArray(data.streams)
    ? data.streams.find((s) => s && s.codec_type === 'video')
    : null;
  const width = Number(stream?.width || 0);
  const height = Number(stream?.height || 0);
  const rotation = Number(stream?.rotation ?? stream?.tags?.rotate ?? 0);
  const streamBitrate = Number(stream?.bit_rate || 0);
  const formatBitrate = Number(data.format?.bit_rate || 0);
  const bitrate = Number.isFinite(streamBitrate) && streamBitrate > 0
    ? streamBitrate
    : (Number.isFinite(formatBitrate) ? formatBitrate : 0);
  const duration = Number(data.format?.duration || 0);
  return {
    width: Number.isFinite(width) ? width : 0,
    height: Number.isFinite(height) ? height : 0,
    bitrate: Number.isFinite(bitrate) ? bitrate : 0,
    duration: Number.isFinite(duration) ? duration : 0,
    rotation: Number.isFinite(rotation) ? rotation : 0,
  };
}

function toEven(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 2;
  const floored = Math.floor(value);
  return floored % 2 === 0 ? floored : floored - 1;
}

function computeTargetVideoSize(meta: VideoProbe, resolution: number) {
  let width = meta.width;
  let height = meta.height;
  if (meta.rotation === 90 || meta.rotation === 270) {
    width = meta.height;
    height = meta.width;
  }
  if (resolution && resolution > 0) {
    const shortSide = Math.min(width, height);
    if (shortSide >= resolution + 1) {
      const scale = resolution / shortSide;
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }
  }
  return { width: toEven(width), height: toEven(height) };
}

function runProcess(binPath: string, args: string[], timeoutMs = 0): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(binPath, args, { windowsHide: true });
    const stderr: Buffer[] = [];
    const timer = timeoutMs && timeoutMs > 0
      ? setTimeout(() => {
          proc.kill();
          reject(new Error(`${binPath} timed out`));
        }, timeoutMs)
      : null;
    proc.stderr?.on('data', (chunk) => stderr.push(Buffer.from(chunk)));
    proc.on('error', (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });
    proc.on('close', (code) => {
      if (timer) clearTimeout(timer);
      if (code === 0) {
        resolve();
      } else {
        const message = Buffer.concat(stderr).toString('utf8').trim();
        reject(new Error(message || `${binPath} failed with code ${code}`));
      }
    });
  });
}

function hasTrailerProfile(conf: any) {
  const trailerInfo = conf?.trailerInfo || {};
  const trailerHighInfo = conf?.trailerHighInfo || {};
  const base = Object.keys(trailerHighInfo).length ? trailerHighInfo : trailerInfo;
  const bitrate = Number(base?.videoTranscodingBitrate || 0);
  const resolution = Number(base?.videoTranscodingResolution || 0);
  return Number.isFinite(bitrate) && bitrate > 0 && Number.isFinite(resolution) && resolution > 0;
}

function summarizeTrailerKeys(raw: any) {
  if (!raw || typeof raw !== 'object') return null;
  const keys = Object.keys(raw);
  const trailerKeys = keys.filter((k) => /trailer|transcod|video/i.test(k));
  if (trailerKeys.length === 0) return null;
  const summary: Record<string, any> = {};
  for (const key of trailerKeys) {
    const value = raw[key];
    if (value && typeof value === 'object') {
      summary[key] = Array.isArray(value) ? `array(${value.length})` : Object.keys(value);
    } else {
      summary[key] = value;
    }
  }
  return summary;
}

function waitForPushMethod(client: CarriageClient, method: string, timeoutMs: number) {
  let settled = false;
  let timer: NodeJS.Timeout | null = null;
  let resolveFn: (packet: any) => void = () => {};
  let rejectFn: (err: Error) => void = () => {};

  const cleanup = () => {
    if (settled) return;
    settled = true;
    if (timer) clearTimeout(timer);
    client.off('push', onPush);
    client.off('error', onError);
    client.off('disconnected', onClose);
  };

  const onPush = (packet: any) => {
    if (packet?.method !== method) return;
    cleanup();
    resolveFn(packet);
  };

  const onError = (err: Error) => {
    cleanup();
    rejectFn(err);
  };

  const onClose = () => {
    cleanup();
    rejectFn(new Error(`Upload connection closed before ${method}`));
  };

  const promise = new Promise<any>((resolve, reject) => {
    resolveFn = resolve;
    rejectFn = reject;
    client.on('push', onPush);
    client.on('error', onError);
    client.on('disconnected', onClose);
    if (timeoutMs && timeoutMs > 0) {
      timer = setTimeout(() => {
        cleanup();
        reject(new Error(`${method} timeout`));
      }, timeoutMs);
    }
  });

  return { promise, cancel: cleanup };
}

function parseAttachments(raw: any): any[] {
  if (raw === undefined || raw === null) return [];
  let parsed: any = raw;
  if (typeof parsed === 'string') {
    const trimmed = parsed.trim();
    if (!trimmed) return [];
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return [];
    }
  }
  if (!parsed) return [];
  if (Array.isArray(parsed)) return parsed;
  if (typeof parsed === 'object') return [parsed];
  return [];
}

function isBlankText(value: any) {
  if (value === undefined || value === null) return true;
  return String(value).trim().length === 0;
}

function truncateChatLogMessage(value: string) {
  if (!value) return value;
  if (value.length <= 500) return value;
  return `${value.slice(0, 500)} ...`;
}

function extractChatLogPayload(raw: any): any {
  if (!raw || typeof raw !== 'object') return null;
  const chatLog = raw.chatLog;
  if (chatLog && typeof chatLog === 'object') {
    if (chatLog.chatLog && typeof chatLog.chatLog === 'object') return chatLog.chatLog;
    return chatLog;
  }
  return raw;
}

function parseAttachmentJson(raw: any): any {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
  if (typeof raw === 'object') return raw;
  return null;
}

function buildSpamChatLogInfo(raw: any): string | null {
  const chatLog = extractChatLogPayload(raw);
  if (!chatLog || typeof chatLog !== 'object') return null;

  const attachmentRaw = chatLog.attachment ?? chatLog.attachments ?? chatLog.extra ?? null;
  const attachmentJson = parseAttachmentJson(attachmentRaw);
  let message = chatLog.message ?? chatLog.msg ?? chatLog.text ?? '';
  if (isBlankText(message) && typeof attachmentRaw === 'string' && attachmentJson === null) {
    message = attachmentRaw;
  }
  message = truncateChatLogMessage(String(message ?? ''));

  const hasAttachmentRaw =
    attachmentRaw !== undefined &&
    attachmentRaw !== null &&
    !(typeof attachmentRaw === 'string' && attachmentRaw.trim().length === 0);
  const messageBody: any = {};
  if (!isBlankText(message)) {
    messageBody.message = message;
  }
  if (attachmentJson !== null) {
    const isArray = Array.isArray(attachmentJson);
    const isObject = !isArray && typeof attachmentJson === 'object';
    const hasContent = isArray ? attachmentJson.length > 0 : isObject ? Object.keys(attachmentJson).length > 0 : true;
    if (hasContent || hasAttachmentRaw) {
      messageBody.attachment = attachmentJson;
    }
  } else if (hasAttachmentRaw) {
    messageBody.attachment = attachmentRaw;
  }
  if (typeof chatLog.referer === 'number') {
    messageBody.referer = chatLog.referer;
  }
  if (typeof chatLog.revision === 'number') {
    messageBody.revision = chatLog.revision;
  }

  if (Object.keys(messageBody).length === 0) return null;

  const info = {
    u: toLong(chatLog.authorId ?? chatLog.userId ?? chatLog.senderId ?? 0),
    m: messageBody,
    s: toLong(chatLog.sendAt ?? chatLog.createdAt ?? chatLog.s ?? 0),
    t: safeNumber(chatLog.type ?? chatLog.msgType ?? 1, 1),
    l: toLong(chatLog.logId ?? chatLog.msgId ?? chatLog.id ?? 0),
    scope: typeof chatLog.scope === 'number' ? chatLog.scope : safeNumber(chatLog.scope ?? 1, 1),
    threadId: toLong(chatLog.threadId ?? chatLog.tid ?? chatLog.thread ?? 0),
  };

  return stringifyLossless([info].reverse());
}

function normalizeOpenChatBlindTarget(
  input: any
): { memberId: number | string | Long; linkId?: number | string; isOpenChat?: boolean; chatLogInfo?: string } | null {
  if (!input) return null;
  const raw = input.raw ?? input;
  const chatLog = extractChatLogPayload(raw);
  if (!chatLog || typeof chatLog !== 'object') return null;

  const memberId = chatLog.authorId ?? chatLog.userId ?? chatLog.senderId;
  if (memberId === undefined || memberId === null) return null;

  const linkId = extractOpenLinkIdFromRaw(raw) ?? (input.room?.openLinkId ? normalizeIdValue(input.room.openLinkId) : undefined);
  const isOpenChat = input.room?.isOpenChat;
  const chatLogInfo = buildSpamChatLogInfo(raw) ?? undefined;

  return { memberId, linkId, isOpenChat, chatLogInfo };
}

function extractOpenLinkIdFromRaw(raw: any): number | string | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  if (raw.li !== undefined && raw.li !== null && raw.li !== '') {
    return normalizeIdValue(raw.li);
  }
  const chatLog = raw.chatLog;
  if (chatLog && typeof chatLog === 'object') {
    if (chatLog.li !== undefined && chatLog.li !== null && chatLog.li !== '') {
      return normalizeIdValue(chatLog.li);
    }
    const nested = chatLog.chatLog;
    if (nested && typeof nested === 'object' && nested.li !== undefined && nested.li !== null && nested.li !== '') {
      return normalizeIdValue(nested.li);
    }
  }
  return undefined;
}

function resolveRoomFlags(source: any) {
  const typeRaw = source?.type ?? source?.t ?? source?.chatType ?? '';
  const typeName = String(typeRaw).toLowerCase();
  const openLinkId = source?.openLinkId ?? source?.openChatId ?? source?.li ?? source?.openLink ?? source?.openChat;
  const openToken = source?.openToken ?? source?.otk;

  let isOpenChat = false;
  if (typeof source?.isOpenChat === 'boolean') {
    isOpenChat = source.isOpenChat;
  } else if (typeof source?.openChat === 'boolean') {
    isOpenChat = source.openChat;
  } else if (typeof source?.isOpen === 'boolean') {
    isOpenChat = source.isOpen;
  } else if (typeName === 'om' || typeName === 'od') {
    isOpenChat = true;
  } else if (typeName.includes('open')) {
    isOpenChat = true;
  } else if (openLinkId || openToken) {
    isOpenChat = true;
  } else if (source?.meta) {
    try {
      const meta = typeof source.meta === 'string' ? JSON.parse(source.meta) : source.meta;
      if (meta?.openLink || meta?.openLinkId || meta?.openChatId) {
        isOpenChat = true;
      }
    } catch {
      // ignore
    }
  } else if (Array.isArray(source?.chatMetas)) {
    for (const meta of source.chatMetas) {
      try {
        const content = meta?.content ?? meta;
        const parsed = typeof content === 'string' ? JSON.parse(content) : content;
        if (parsed?.openLink || parsed?.openLinkId || parsed?.openChatId) {
          isOpenChat = true;
          break;
        }
      } catch {
        // ignore
      }
    }
  }

  let isGroupChat = false;
  if (typeof source?.isGroupChat === 'boolean') {
    isGroupChat = source.isGroupChat;
  } else if (typeof source?.isMultiChat === 'boolean') {
    isGroupChat = source.isMultiChat;
  } else if (typeof source?.multiChat === 'boolean') {
    isGroupChat = source.multiChat;
  } else if (typeof source?.isGroup === 'boolean') {
    isGroupChat = source.isGroup;
  } else if (typeof source?.directChat === 'boolean') {
    isGroupChat = !source.directChat;
  } else if (isOpenChat) {
    if (typeName === 'od') {
      isGroupChat = false;
    } else {
      isGroupChat = true;
    }
  } else if (typeName.includes('multi') || typeName.includes('group') || typeName.includes('moim')) {
    isGroupChat = true;
  } else if (typeName.includes('direct') || typeName.includes('memo') || typeName.includes('self')) {
    isGroupChat = false;
  }

  return { isGroupChat, isOpenChat };
}

function extractOpenLinkNameFromMr(input: any): string {
  if (!input) return '';
  let parsed: any = input;
  if (typeof parsed === 'string') {
    const trimmed = parsed.trim();
    if (!trimmed) return '';
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return '';
    }
  }
  if (!parsed || typeof parsed !== 'object') return '';

  const candidates = [
    'ln',
    'linkName',
    'name',
    'title',
    'subject',
    'roomName',
  ];

  for (const key of candidates) {
    const value = parsed[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }

  const nested = [parsed.openLink, parsed.link, parsed.ol, parsed.open];
  for (const node of nested) {
    if (!node || typeof node !== 'object') continue;
    for (const key of candidates) {
      const value = node[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
  }

  return '';
}

function unwrapAttachment(input: any) {
  if (!input || typeof input !== 'object') return input;
  if ('attachment' in input && (input as any).attachment !== undefined) {
    return (input as any).attachment;
  }
  return input;
}




function toUnixSeconds(value?: number | Date) {
  if (value === undefined || value === null) return undefined;
  if (value instanceof Date) {
    return Math.floor(value.getTime() / 1000);
  }
  const num = typeof value === 'number' ? value : parseInt(value, 10);
  if (!Number.isFinite(num)) return undefined;
  return num > 1e12 ? Math.floor(num / 1000) : Math.floor(num);
}

function snapToFiveMinutes(date: Date, mode: 'floor' | 'round' | 'ceil' = 'ceil') {
  const step = 5 * 60 * 1000;
  const ms = date.getTime();
  const remainder = ms % step;
  if (remainder === 0) return new Date(ms);
  let snapped: number;
  if (mode === 'floor') snapped = Math.floor(ms / step) * step;
  else if (mode === 'round') snapped = Math.round(ms / step) * step;
  else snapped = Math.ceil(ms / step) * step;
  return new Date(snapped);
}

function toDate(value?: number | Date) {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value;
  const num = typeof value === 'number' ? value : parseInt(value, 10);
  if (!Number.isFinite(num)) return null;
  return num > 1e12 ? new Date(num) : new Date(num * 1000);
}

function formatCalendarDate(date: Date) {
  const iso = date.toISOString();
  return iso.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function resolveTimeZone(fallback = 'Asia/Seoul') {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) return tz;
  } catch {
    // ignore
  }
  return fallback;
}

function extractShareMessageData(body: any) {
  if (!body) return null;
  const data = body.data ?? body.shareMessage ?? body;
  if (!data) return null;
  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch {
      return data;
    }
  }
  return data;
}

function normalizeScheduleShareData(data: any) {
  if (!data) return data;
  if (Array.isArray(data)) return data;
  if (typeof data === 'object') {
    if (data.P || data.CAL || data.C) return [data];
  }
  return data;
}

function extractEventId(body: any) {
  const eId = body?.eId || body?.eventId || body?.data?.eId || body?.data?.eventId || body?.result?.eId;
  if (eId === undefined || eId === null) return '';
  return String(eId);
}

function ensureScheduleAttachment(base: any, fallback: any) {
  if (typeof base === 'string') return base;
  if (Array.isArray(base)) return base;
  const result: any = typeof base === 'object' && base ? { ...base } : {};
  if (result.eventAt === undefined && fallback.eventAt !== undefined) result.eventAt = fallback.eventAt;
  if (!result.title && fallback.title) result.title = fallback.title;
  if (result.subtype === undefined && fallback.subtype !== undefined) result.subtype = fallback.subtype;
  if (result.alarmAt === undefined && fallback.alarmAt !== undefined) result.alarmAt = fallback.alarmAt;
  if (!result.postId && !result.scheduleId) {
    if (fallback.postId !== undefined) result.postId = fallback.postId;
    if (fallback.scheduleId !== undefined) result.scheduleId = fallback.scheduleId;
  }
  return result;
}

function previewCalendarBody(body: any, limit = 800) {
  if (body === undefined || body === null) return '';
  let text = '';
  if (typeof body === 'string') {
    text = body;
  } else {
    try {
      text = JSON.stringify(body);
    } catch {
      text = String(body);
    }
  }
  if (limit > 0 && text.length > limit) {
    return `${text.slice(0, limit)}...`;
  }
  return text;
}

function assertCalendarOk(res: any, label: string) {
  const statusCode = res?.status;
  if (typeof statusCode === 'number' && statusCode >= 400) {
    const bodyPreview = previewCalendarBody(res?.body);
    const suffix = bodyPreview ? ` body=${bodyPreview}` : '';
    throw new Error(`${label} status=${statusCode}${suffix}`);
  }
  const body = res?.body;
  if (body && typeof body === 'object' && typeof body.status === 'number' && body.status !== 0) {
    const message = body.message ? ` (${body.message})` : '';
    const bodyPreview = previewCalendarBody(body);
    const suffix = bodyPreview ? ` body=${bodyPreview}` : '';
    throw new Error(`${label} status=${body.status}${message}${suffix}`);
  }
}

function previewBubbleBody(body: any, limit = 800) {
  if (body === undefined || body === null) return '';
  let text = '';
  if (typeof body === 'string') {
    text = body;
  } else {
    try {
      text = JSON.stringify(body);
    } catch {
      text = String(body);
    }
  }
  if (limit > 0 && text.length > limit) {
    return `${text.slice(0, limit)}...`;
  }
  return text;
}

function assertBubbleOk(res: any, label: string) {
  const statusCode = res?.status;
  if (typeof statusCode === 'number' && statusCode >= 400) {
    const bodyPreview = previewBubbleBody(res?.body);
    const suffix = bodyPreview ? ` body=${bodyPreview}` : '';
    throw new Error(`${label} status=${statusCode}${suffix}`);
  }
  const body = res?.body;
  if (body && typeof body === 'object' && typeof body.status === 'number' && body.status !== 0) {
    const message = body.message ? ` (${body.message})` : '';
    const bodyPreview = previewBubbleBody(body);
    const suffix = bodyPreview ? ` body=${bodyPreview}` : '';
    throw new Error(`${label} status=${body.status}${message}${suffix}`);
  }
}

function stringifyLossless(obj: unknown) {
  return LosslessJSON.stringify(obj, (key, value) => {
    if (typeof value === 'bigint' || Long.isLong(value)) {
      return new (LosslessJSON as any).LosslessNumber(value.toString());
    }
    return value;
  });
}

function previewLossless(obj: unknown, maxLen = 800) {
  let text = '';
  try {
    text = stringifyLossless(obj);
  } catch {
    text = String(obj);
  }
  if (text.length > maxLen) {
    return `${text.slice(0, maxLen)}...`;
  }
  return text;
}

function formatKstTimestamp(date = new Date()) {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().replace('Z', '+09:00');
}

function buildQrLoginHandlers() {
  let qrcode: any = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    qrcode = require('qrcode-terminal');
  } catch {
    qrcode = null;
  }

  const onQrUrl = (url: string) => {
    console.log('\n[QR] Scan this code in KakaoTalk > Settings > QR Login.\n');
    if (qrcode && typeof qrcode.generate === 'function') {
      qrcode.generate(url, { small: true }, (qr: string) => {
        console.log(qr);
      });
    }
    console.log(`  ${url}\n`);
  };

  const onPasscode = (passcode: string) => {
    if (!passcode) return;
    const digits = String(passcode).split('');
    const big: Record<string, string[]> = {
      '0': [' 000 ', '0   0', '0   0', '0   0', ' 000 '],
      '1': ['  1  ', ' 11  ', '  1  ', '  1  ', ' 111 '],
      '2': [' 222 ', '2   2', '  2  ', ' 2   ', '22222'],
      '3': ['3333 ', '    3', ' 333 ', '    3', '3333 '],
      '4': ['4   4', '4   4', '44444', '    4', '    4'],
      '5': ['55555', '5    ', '5555 ', '    5', '5555 '],
      '6': [' 666 ', '6    ', '6666 ', '6   6', ' 666 '],
      '7': ['77777', '   7 ', '  7  ', ' 7   ', ' 7   '],
      '8': [' 888 ', '8   8', ' 888 ', '8   8', ' 888 '],
      '9': [' 999 ', '9   9', ' 9999', '    9', ' 999 '],
    };

    process.stdout.write('\x1B[2J\x1B[H');
    console.log('\n[QR] Passcode:\n');
    for (let row = 0; row < 5; row += 1) {
      const line = digits.map((d) => (big[d] ? big[d][row] : '     ')).join('   ');
      console.log('      ' + line);
    }
    console.log('\nEnter this passcode on your phone.\n');
  };

  return { onQrUrl, onPasscode };
}

function buildExtra(attachment?: AttachmentInput, extra?: string) {
  if (typeof extra === 'string' && extra.length > 0) return extra;
  if (attachment === undefined || attachment === null) return undefined;
  if (typeof attachment === 'string') return attachment;
  try {
    return stringifyLossless(attachment);
  } catch {
    return String(attachment);
  }
}

function normalizeMediaAttachment(input: any) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  const attachment: any = { ...input };
  if (attachment.size !== undefined && attachment.s === undefined) attachment.s = attachment.size;
  if (attachment.mime !== undefined && attachment.mt === undefined) attachment.mt = attachment.mime;
  if (attachment.duration !== undefined && attachment.d === undefined) attachment.d = attachment.duration;
  if (attachment.width !== undefined && attachment.w === undefined) attachment.w = attachment.width;
  if (attachment.height !== undefined && attachment.h === undefined) attachment.h = attachment.height;
  if (attachment.token !== undefined && attachment.tk === undefined) attachment.tk = attachment.token;
  if (attachment.tokenHigh !== undefined && attachment.tkh === undefined) attachment.tkh = attachment.tokenHigh;
  if (attachment.urlHigh !== undefined && attachment.urlh === undefined) attachment.urlh = attachment.urlHigh;
  return attachment;
}

function normalizeFileAttachment(input: any) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  const attachment: any = { ...input };
  if (attachment.size === undefined && attachment.s !== undefined) attachment.size = attachment.s;
  if (attachment.name === undefined && attachment.filename !== undefined) attachment.name = attachment.filename;
  return attachment;
}

function normalizeLocationAttachment(input: any) {
  if (!input) return input;
  if (typeof input === 'string') return input;
  if (typeof input === 'object' && 'lat' in input && 'lng' in input) {
    const attachment: any = {
      lat: Number(input.lat),
      lng: Number(input.lng),
    };
    if (input.address) attachment.a = input.address;
    if (input.title) attachment.t = input.title;
    if (typeof input.isCurrent === 'boolean') attachment.c = input.isCurrent;
    if (input.placeId !== undefined) attachment.cid = String(input.placeId);
    if (input.extra && typeof input.extra === 'object') {
      Object.assign(attachment, input.extra);
    }
    return attachment;
  }
  return input;
}

function normalizeScheduleAttachment(input: any) {
  if (!input) return input;
  if (typeof input === 'string') return input;
  if (typeof input === 'object' && ('eventAt' in input || 'title' in input)) {
    const attachment: any = {};
    const eventAt = toUnixSeconds(input.eventAt);
    if (eventAt !== undefined) attachment.eventAt = eventAt;
    if (input.title) attachment.title = input.title;
    if (input.postId !== undefined) attachment.postId = String(input.postId);
    if (input.scheduleId !== undefined) attachment.scheduleId = String(input.scheduleId);
    if (input.subtype !== undefined) attachment.subtype = input.subtype;
    const alarmAt = toUnixSeconds(input.alarmAt);
    if (alarmAt !== undefined) attachment.alarmAt = alarmAt;
    if (input.extra && typeof input.extra === 'object') {
      Object.assign(attachment, input.extra);
    }
    return attachment;
  }
  return input;
}

function normalizeContactAttachment(input: any) {
  if (!input) return input;
  if (typeof input === 'string') return { name: input };
  if (typeof input === 'object') {
    const attachment: any = { ...input };
    if (attachment.extra && typeof attachment.extra === 'object') {
      Object.assign(attachment, attachment.extra);
      delete attachment.extra;
    }
    if (!attachment.url && attachment.path) {
      attachment.url = attachment.path;
      delete attachment.path;
    }
    return attachment;
  }
  return input;
}

function normalizeProfileAttachment(input: any) {
  if (!input) return input;
  if (typeof input === 'string') {
    return { accessPermit: input };
  }
  if (typeof input === 'object') {
    const attachment: any = { ...input };
    if (attachment.extra && typeof attachment.extra === 'object') {
      Object.assign(attachment, attachment.extra);
      delete attachment.extra;
    }
    if (attachment.userId === undefined && attachment.id !== undefined) attachment.userId = attachment.id;
    if (attachment.nickName === undefined && attachment.nickname !== undefined) attachment.nickName = attachment.nickname;
    if (attachment.fullProfileImageUrl === undefined && attachment.fullProfileImage !== undefined) {
      attachment.fullProfileImageUrl = attachment.fullProfileImage;
    }
    if (attachment.profileImageUrl === undefined && attachment.profileImage !== undefined) {
      attachment.profileImageUrl = attachment.profileImage;
    }
    if (attachment.statusMessage === undefined && attachment.status !== undefined) {
      attachment.statusMessage = attachment.status;
    }
    return attachment;
  }
  return input;
}

function extractMentions(raw: any): any[] | undefined {
  if (!raw) return undefined;
  if (Array.isArray(raw)) {
    if (raw.length > 0 && raw.every((entry) => typeof entry === 'object' && entry && 'user_id' in entry)) {
      return raw;
    }
    for (const entry of raw) {
      if (entry && Array.isArray(entry.mentions)) {
        return entry.mentions;
      }
    }
    return undefined;
  }
  if (typeof raw === 'object' && Array.isArray(raw.mentions)) {
    return raw.mentions;
  }
  return undefined;
}

const MENTION_MARK_START = '\u0002';
const MENTION_MARK_MID = '\u0003';
const MENTION_MARK_END = '\u0004';
const SPOILER_MARK_START = '\u0005';
const SPOILER_MARK_END = '\u0006';
const MESSAGE_SENDER_CACHE_LIMIT = 200;

function buildMentionMarker(userId: number | string, name: string) {
  const safeName = String(name || '')
    .split(MENTION_MARK_START).join('')
    .split(MENTION_MARK_MID).join('')
    .split(MENTION_MARK_END).join('');
  return `${MENTION_MARK_START}${userId}${MENTION_MARK_MID}${safeName}${MENTION_MARK_END}`;
}

function buildSpoilerMarker(text: string) {
  const safeText = String(text || '')
    .split(SPOILER_MARK_START).join('')
    .split(SPOILER_MARK_END).join('');
  return `${SPOILER_MARK_START}${safeText}${SPOILER_MARK_END}`;
}

function extractMarkedMentions(text: string): { text: string; mentions: MentionInput[] } {
  if (!text || !text.includes(MENTION_MARK_START)) {
    return { text, mentions: [] };
  }

  let out = '';
  const mentions: MentionInput[] = [];
  let mentionIndex = 0;
  let cursor = 0;

  while (cursor < text.length) {
    const start = text.indexOf(MENTION_MARK_START, cursor);
    if (start === -1) {
      out += text.slice(cursor);
      break;
    }

    out += text.slice(cursor, start);
    const mid = text.indexOf(MENTION_MARK_MID, start + 1);
    const end = text.indexOf(MENTION_MARK_END, mid + 1);
    if (mid === -1 || end === -1) {
      out += text.slice(start, start + 1);
      cursor = start + 1;
      continue;
    }

    const userId = text.slice(start + 1, mid);
    const name = text.slice(mid + 1, end);
    const mentionText = `@${name}`;
    mentionIndex += 1;
    const len = name.length || String(userId).length;
    mentions.push({ userId, at: [mentionIndex], len });
    out += mentionText;
    cursor = end + 1;
  }

  return { text: out, mentions };
}

function extractMarkedSpoilers(text: string): { text: string; spoilers: SpoilerInput[] } {
  if (!text || !text.includes(SPOILER_MARK_START)) {
    return { text, spoilers: [] };
  }

  let out = '';
  const spoilers: SpoilerInput[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const start = text.indexOf(SPOILER_MARK_START, cursor);
    if (start === -1) {
      out += text.slice(cursor);
      break;
    }

    out += text.slice(cursor, start);
    const end = text.indexOf(SPOILER_MARK_END, start + 1);
    if (end === -1) {
      out += text.slice(start, start + 1);
      cursor = start + 1;
      continue;
    }

    const spoilerText = text.slice(start + 1, end);
    const loc = out.length;
    const len = spoilerText.length;
    if (len > 0) {
      spoilers.push({ loc, len });
    }
    out += spoilerText;
    cursor = end + 1;
  }

  return { text: out, spoilers };
}

function findAllIndices(text: string, token: string) {
  if (!token) return [];
  const indices: number[] = [];
  let start = 0;
  while (start <= text.length) {
    const idx = text.indexOf(token, start);
    if (idx === -1) break;
    indices.push(idx);
    start = idx + token.length;
  }
  return indices;
}

function normalizeMentionInputs(text: string, mentions?: MentionInput[]) {
  if (!Array.isArray(mentions) || mentions.length === 0) return [];
  const result: Array<{ user_id: number | string; at: number[]; len: number }> = [];

  const occurrenceBuckets = new Map<number, number[]>();
  const occurrenceMeta: Array<{ idx: number; inputIndex: number }> = [];
  const mentionTokens: string[] = [];
  for (let i = 0; i < mentions.length; i += 1) {
    const input = mentions[i];
    const rawAt = (input as any)?.at;
    const hasAt =
      Array.isArray(rawAt)
        ? rawAt.some((v) => safeNumber(v, -1) >= 0)
        : typeof rawAt === 'number' && safeNumber(rawAt, -1) >= 0;
    if (hasAt) continue;

    const mentionText =
      (input as any)?.text ??
      (input as any)?.name ??
      (input as any)?.nickname ??
      (input as any)?.nickName ??
      '';
    if (!mentionText || !text) continue;
    const trimmed = String(mentionText);
    const token = trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
    mentionTokens[i] = token;
    const hits = findAllIndices(text, token);
    for (const idx of hits) {
      occurrenceMeta.push({ idx, inputIndex: i });
    }
  }

  if (occurrenceMeta.length > 0) {
    occurrenceMeta.sort((a, b) => a.idx - b.idx);
    let ordinal = 0;
    for (const entry of occurrenceMeta) {
      ordinal += 1;
      const list = occurrenceBuckets.get(entry.inputIndex) || [];
      list.push(ordinal);
      occurrenceBuckets.set(entry.inputIndex, list);
    }
  }

  for (let inputIndex = 0; inputIndex < mentions.length; inputIndex += 1) {
    const input = mentions[inputIndex];
    if (!input) continue;
    const userId = normalizeIdValue(
      (input as any).userId ?? (input as any).user_id ?? (input as any).id ?? 0
    );
    if (!userId) continue;

    const rawAt = (input as any).at;
    let atList = Array.isArray(rawAt) ? rawAt.map((v) => safeNumber(v, -1)).filter((v) => v >= 0) : [];
    if (typeof rawAt === 'number') {
      const idx = safeNumber(rawAt, -1);
      if (idx >= 0) atList = [idx];
    }

    const mentionText =
      (input as any).text ??
      (input as any).name ??
      (input as any).nickname ??
      (input as any).nickName ??
      '';

    let len = safeNumber((input as any).len ?? (input as any).length, 0);
    if (atList.length === 0 && occurrenceBuckets.has(inputIndex)) {
      atList = occurrenceBuckets.get(inputIndex) || [];
    }

    if (atList.length === 0) continue;
    if (!len || len <= 0) {
      len = mentionText ? String(mentionText).replace(/^@/, '').length : 1;
      if (!len || len <= 0) len = 1;
    }

    const cleanedAt = [...new Set(atList)].sort((a, b) => a - b);
    result.push({ user_id: userId, at: cleanedAt, len });
  }

  return result;
}

function normalizeSpoilerInputs(text: string, spoilers?: SpoilerInput[]) {
  if (!Array.isArray(spoilers) || spoilers.length === 0) return [];
  const result: Array<{ loc: number; len: number }> = [];
  const maxLen = text ? text.length : 0;

  for (const input of spoilers) {
    if (!input) continue;
    let loc = safeNumber(input.loc ?? input.start, -1);
    let len = safeNumber(input.len ?? input.length, 0);
    if ((!len || len <= 0) && input.end !== undefined) {
      const end = safeNumber(input.end, -1);
      if (end >= 0 && loc >= 0) {
        len = end - loc;
      }
    }
    if (loc < 0 || len <= 0) continue;
    if (maxLen > 0) {
      if (loc >= maxLen) continue;
      if (loc + len > maxLen) {
        len = maxLen - loc;
      }
      if (len <= 0) continue;
    }
    result.push({ loc, len });
  }

  result.sort((a, b) => a.loc - b.loc);
  return result;
}

function normalizeIdValue(value: any): number | string {
  if (value === undefined || value === null) return 0;
  if (Long.isLong(value)) return value.toString();
  if (typeof value === 'object' && value !== null) {
    if (typeof (value as any).low === 'number' && typeof (value as any).high === 'number') {
      try {
        const unsigned = typeof (value as any).unsigned === 'boolean' ? (value as any).unsigned : false;
        return Long.fromBits((value as any).low, (value as any).high, unsigned).toString();
      } catch {
        // fall through
      }
    }
  }
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'string') return value;
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) return value.toString();
    return value;
  }
  if (typeof value === 'object' && typeof value.toString === 'function') {
    const str = value.toString();
    if (/^\d+$/.test(str)) return str;
  }
  return Number(value) || 0;
}

function extractFeedPayload(chatLog: any, attachmentsRaw: any[]): any | null {
  if (chatLog && typeof chatLog === 'object') {
    if (chatLog.feed && typeof chatLog.feed === 'object') return chatLog.feed;
    if (chatLog.message && typeof chatLog.message === 'object') {
      const maybeFeed = chatLog.message as any;
      if (maybeFeed && typeof maybeFeed === 'object' && ('feedType' in maybeFeed || 'ft' in maybeFeed || 'feed' in maybeFeed)) {
        return maybeFeed.feed || maybeFeed;
      }
    }
    if (typeof chatLog.message === 'string') {
      const text = chatLog.message.trim();
      if (text.startsWith('{') || text.startsWith('[')) {
        try {
          const parsed = LosslessJSON.parse(text) as any;
          if (parsed && typeof parsed === 'object' && ('feedType' in parsed || 'ft' in parsed || 'feed' in parsed)) {
            return parsed.feed || parsed;
          }
        } catch {
          // ignore
        }
      }
    }
    if (chatLog.extra !== undefined && chatLog.extra !== null) {
      const extra = parseAttachmentJson(chatLog.extra) ?? chatLog.extra;
      if (extra && typeof extra === 'object') {
        if ('feedType' in extra || 'ft' in extra || 'feed' in extra) {
          return (extra as any).feed || extra;
        }
      }
    }
  }

  if (Array.isArray(attachmentsRaw)) {
    for (const entry of attachmentsRaw) {
      if (!entry || typeof entry !== 'object') continue;
      if ('feedType' in entry || 'ft' in entry || 'feed' in entry) {
        return (entry as any).feed || entry;
      }
    }
  }
  return null;
}

function extractMemberIdsFromPayload(payload: any, opts: { excludeUserId?: boolean } = {}) {
  const out: Array<number | string> = [];
  const seen = new Set<string>();
  const add = (value: any) => {
    const id = normalizeIdValue(value);
    if (!id) return;
    const key = String(id);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(id);
  };

  if (Array.isArray(payload?.memberIds)) {
    payload.memberIds.forEach(add);
  }
  if (Array.isArray(payload?.mids)) {
    payload.mids.forEach(add);
  }
  if (Array.isArray(payload?.memberIds)) {
    payload.memberIds.forEach(add);
  }
  if (Array.isArray(payload?.members)) {
    for (const mem of payload.members) {
      add(mem?.userId);
    }
  }
  if (!opts.excludeUserId) {
    add(payload?.userId);
  }
  return out;
}

function extractFeedMemberIds(feed: any) {
  const out: Array<number | string> = [];
  const seen = new Set<string>();
  const add = (value: any) => {
    const id = normalizeIdValue(value);
    if (!id) return;
    const key = String(id);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(id);
  };
  if (feed?.member && typeof feed.member === 'object') {
    add(feed.member.userId);
  }
  if (Array.isArray(feed?.members)) {
    for (const mem of feed.members) {
      add(mem?.userId);
    }
  }
  return out;
}

function extractPushMemberIds(body: any, method: string) {
  const out: Array<number | string> = [];
  const seen = new Set<string>();
  const add = (value: any) => {
    const id = normalizeIdValue(value);
    if (!id) return;
    const key = String(id);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(id);
  };

  if (method === 'DELMEM' && body?.kid !== undefined) {
    add(body.kid);
  }

  if (Array.isArray(body?.memberIds)) {
    body.memberIds.forEach(add);
  }

  if (Array.isArray(body?.members)) {
    for (const mem of body.members) {
      add(mem?.userId);
    }
  }

  if (body?.userId !== undefined) {
    add(body.userId);
  }

  return out;
}

function buildMemberNameMap(payload: any) {
  const map = new Map<string, string>();
  const add = (idValue: any, nameValue: any) => {
    const id = normalizeIdValue(idValue);
    if (!id) return;
    const name = nameValue ? String(nameValue) : '';
    map.set(String(id), name);
  };
  if (Array.isArray(payload?.members)) {
    for (const mem of payload.members) {
      add(mem?.userId, mem?.nickName ?? mem?.nickname ?? mem?.name);
    }
  }
  add(payload?.userId, payload?.memberName ?? payload?.nickName);
  return map;
}

function buildFeedMemberNameMap(feed: any) {
  const map = new Map<string, string>();
  const add = (idValue: any, nameValue: any) => {
    const id = normalizeIdValue(idValue);
    if (!id) return;
    const name = nameValue ? String(nameValue) : '';
    map.set(String(id), name);
  };
  if (feed?.member && typeof feed.member === 'object') {
    add(feed.member.userId, feed.member.nickName);
  }
  if (Array.isArray(feed?.members)) {
    for (const mem of feed.members) {
      add(mem?.userId, mem?.nickName);
    }
  }
  return map;
}

function extractActorIdFromPayload(payload: any) {
  return normalizeIdValue(
    payload?.actorId ??
      payload?.aid ??
      payload?.inviterId ??
      payload?.fromUserId ??
      payload?.ownerId ??
      0
  );
}

const PUSH_MEMBER_ACTIONS: Record<string, MemberAction> = {
  NEWMEM: 'join',
  JOIN: 'join',
  INVMEM: 'invite',
  INVITEMEM: 'invite',
  DELMEM: 'leave',
  LEAVEMEM: 'leave',
  LEAVE: 'leave',
  KICKMEM: 'kick',
  KICK: 'kick',
};

const PUSH_DELETE_ACTIONS = new Set(['DELETEMSG', 'DELMSG', 'DELM', 'DELMESSAGE', 'MSGDEL', 'SYNCDLMSG']);
const PUSH_HIDE_ACTIONS = new Set(['BLIND', 'BLINDMSG', 'HIDEMSG', 'HIDE', 'SYNCREWR']);

const DEFAULT_FEED_TYPE_MAP: Record<number, MemberAction> = {
  4: 'join',
  6: 'kick',
};

function resolveMemberActionFromPush(method: string): MemberAction | null {
  return PUSH_MEMBER_ACTIONS[method] || null;
}

function resolveDeleteActionFromPush(method: string): boolean {
  const key = String(method || '').toUpperCase();
  return PUSH_DELETE_ACTIONS.has(key);
}

function resolveHideActionFromPush(method: string): boolean {
  const key = String(method || '').toUpperCase();
  return PUSH_HIDE_ACTIONS.has(key);
}

function normalizeMemberAction(value: any): MemberAction | null {
  if (!value) return null;
  const text = String(value).toLowerCase();
  if (text.includes('join') || text.includes('enter')) return 'join';
  if (text.includes('leave') || text.includes('exit')) return 'leave';
  if (text.includes('invite')) return 'invite';
  if (text.includes('kick') || text.includes('ban')) return 'kick';
  return null;
}

function truncateReplyMessage(text: string, maxLen = 100) {
  if (!text) return '';
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen);
}

function buildReplyAttachment(target: ReplyTarget, opts: ReplyOptions = {}) {
  if (!target || !target.logId || !target.userId) {
    throw new Error('reply target requires logId and userId');
  }
  const linkIdValue = target.linkId ?? 0;
  if (target.isOpenChat && (!linkIdValue || linkIdValue === 0 || linkIdValue === '0')) {
    throw new Error('open chat reply requires openLinkId');
  }
  const srcMessage = truncateReplyMessage(target.text || '');
  const attachment: any = {
    src_logId: toLong(target.logId),
    src_userId: toLong(target.userId),
    src_message: srcMessage,
    src_type: typeof target.type === 'number' ? target.type : MessageType.Text,
    src_linkId: toLong(linkIdValue),
    src_mentions: Array.isArray(target.mentions) ? target.mentions : [],
    mentions: null,
    attach_type: typeof opts.attachType === 'number' ? opts.attachType : 0,
    attach_only: !!opts.attachOnly,
    attach_content: null,
    src_emojis: null,
    src_spoilers: null,
  };
  return attachment;
}

function normalizeReplyTarget(input: any): ReplyTarget | null {
  if (!input) return null;

  if (input.raw && input.raw.chatLog) {
    const rawLog = input.raw.chatLog;
    const inner = rawLog?.chatLog || rawLog;
    const logId = normalizeIdValue(inner.logId || inner.msgId || rawLog.logId || rawLog.msgId || input.logId || input.message?.id || 0);
    const userId = normalizeIdValue(
      inner.authorId ||
        inner.senderId ||
        inner.userId ||
        rawLog.authorId ||
        rawLog.senderId ||
        rawLog.userId ||
        input.sender?.id ||
        input.senderId ||
        0
    );
    const text = inner.message || inner.msg || inner.text || rawLog.message || rawLog.msg || rawLog.text || input.message?.text || input.text || '';
    const type = safeNumber(
      inner.type || inner.msgType || rawLog.type || rawLog.msgType || input.message?.type || input.type || MessageType.Text,
      MessageType.Text
    );
    const mentions = extractMentions(
      inner.attachment ??
        inner.attachments ??
        inner.extra ??
        rawLog.attachment ??
        rawLog.attachments ??
        rawLog.extra ??
        input.attachmentsRaw
    );
    const linkId = extractOpenLinkIdFromRaw(input.raw) ?? input.room?.openLinkId;
    const isOpenChat = input.room?.isOpenChat === true || !!linkId;
    return { logId, userId, text, type, mentions, linkId, isOpenChat };
  }

  if (input.message && input.sender) {
    const message = input.message || {};
    const sender = input.sender || {};
    const linkId = extractOpenLinkIdFromRaw(input.raw) ?? input.room?.openLinkId;
    const isOpenChat = input.room?.isOpenChat === true || !!linkId;
    return {
      logId: normalizeIdValue(message.logId || message.id || input.logId || 0),
      userId: normalizeIdValue(sender.id || input.senderId || 0),
      text: message.text || input.text || '',
      type: safeNumber(message.type || input.type || MessageType.Text, MessageType.Text),
      mentions: extractMentions(input.attachmentsRaw),
      linkId,
      isOpenChat,
    };
  }

  const logId = normalizeIdValue(input.logId || input.msgId || input.id || 0);
  const userId = normalizeIdValue(
    input.userId || input.senderId || input.authorId || input.sender?.id || 0
  );
  const text = input.message || input.text || input.msg || '';
  const type = safeNumber(input.type || input.msgType || MessageType.Text, MessageType.Text);
  const mentions = input.mentions || input.src_mentions || extractMentions(input.attachmentsRaw);
  const linkId = extractOpenLinkIdFromRaw(input.raw) ?? input.room?.openLinkId;
  const isOpenChat = input.room?.isOpenChat === true || !!linkId;

  return { logId, userId, text, type, mentions, linkId, isOpenChat };
}

function normalizeReactionTarget(input: any): { logId: number | string; linkId?: number | string; isOpenChat?: boolean } | null {
  if (input === undefined || input === null) return null;
  if (Long.isLong(input) || typeof input === 'number' || typeof input === 'bigint' || typeof input === 'string') {
    return { logId: normalizeIdValue(input) };
  }

  const message = input.message || input.chatLog || input.raw?.chatLog || input;
  const logId = normalizeIdValue(
    input.logId ||
      input.msgId ||
      input.id ||
      message?.logId ||
      message?.msgId ||
      message?.id ||
      input.raw?.logId ||
      input.raw?.msgId ||
      input.raw?.chatLog?.logId ||
      0
  );
  const linkId = input.linkId ?? message?.linkId ?? extractOpenLinkIdFromRaw(input.raw) ?? input.room?.openLinkId;
  const isOpenChat = input.room?.isOpenChat;

  return { logId, linkId, isOpenChat };
}

function normalizeOpenChatMemberTarget(
  input: any
): { memberId: number | string; linkId?: number | string; isOpenChat?: boolean } | null {
  if (input === undefined || input === null) return null;
  if (Long.isLong(input) || typeof input === 'number' || typeof input === 'bigint' || typeof input === 'string') {
    return { memberId: normalizeIdValue(input) };
  }

  const raw = input.raw || {};
  const memberId = normalizeIdValue(
    input.memberId ||
      input.userId ||
      input.senderId ||
      input.authorId ||
      input.sender?.id ||
      raw.authorId ||
      raw.userId ||
      raw.senderId ||
      raw.chatLog?.authorId ||
      raw.chatLog?.userId ||
      0
  );
  if (!memberId) return null;

  const linkId = extractOpenLinkIdFromRaw(raw) ?? (input.room?.openLinkId ? normalizeIdValue(input.room.openLinkId) : undefined);
  const isOpenChat = input.room?.isOpenChat;

  return { memberId, linkId, isOpenChat };
}

function normalizeLogTarget(input: any): number | string {
  if (input === undefined || input === null) return 0;
  if (Long.isLong(input) || typeof input === 'number' || typeof input === 'bigint' || typeof input === 'string') {
    return normalizeIdValue(input);
  }

  const body = input.body || input.response?.body || input.result?.body;
  if (body?.logId) return normalizeIdValue(body.logId);
  if (body?.chatLog?.logId) return normalizeIdValue(body.chatLog.logId);

  const message = input.message || input.chatLog || input.raw?.chatLog || input;
  const logId = normalizeIdValue(
    input.logId ||
      input.msgId ||
      input.id ||
      message?.logId ||
      message?.msgId ||
      message?.id ||
      input.raw?.logId ||
      input.raw?.msgId ||
      input.raw?.chatLog?.logId ||
      0
  );
  return logId;
}

function normalizeEditTarget(input: any): { logId: number | string; type?: number; extra?: string } | null {
  if (!input) return null;
  const logId = normalizeLogTarget(input);
  if (!logId) return null;

  const body = input.body || input.response?.body || input.result?.body;
  const message = input.message || input.chatLog || input.raw?.chatLog || body?.chatLog || input;
  const type = safeNumber(
    message?.type || message?.msgType || input.message?.type || input.type || MessageType.Text,
    MessageType.Text
  );
  const extra =
    typeof message?.extra === 'string'
      ? message.extra
      : typeof message?.attachment === 'string'
        ? message.attachment
        : typeof message?.attachments === 'string'
          ? message.attachments
          : typeof input.extra === 'string'
            ? input.extra
            : undefined;

  return { logId, type, extra };
}

function pickFirstValue<T>(...values: T[]): T | undefined {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return undefined;
}

function pickFirstObject(...values: any[]) {
  for (const value of values) {
    if (value && typeof value === 'object') {
      return value;
    }
  }
  return undefined;
}

function extractProfileFromResponse(body: any, fallbackUserId?: number | string) {
  const root = body && typeof body === 'object' && 'result' in body ? (body as any).result : body;
  const data = root && typeof root === 'object' && 'data' in root ? (root as any).data : root;
  const profile = pickFirstObject(
    data?.profile,
    data?.profile3,
    data?.profileInfo,
    data?.profileData,
    data?.userProfile
  );
  const user = pickFirstObject(
    data?.user,
    data?.friend,
    data?.member,
    data?.target,
    data?.profileUser,
    data?.profileOwner
  );

  const accessPermit = pickFirstValue(
    data?.accessPermit,
    user?.accessPermit,
    profile?.accessPermit
  );
  const nickName = pickFirstValue(
    data?.nickName,
    data?.nickname,
    user?.nickName,
    user?.nickname,
    profile?.nickName,
    profile?.nickname
  );
  const statusMessage = pickFirstValue(
    data?.statusMessage,
    user?.statusMessage,
    profile?.statusMessage
  );
  const profileImageUrl = pickFirstValue(
    data?.profileImageUrl,
    user?.profileImageUrl,
    profile?.profileImageUrl
  );
  const fullProfileImageUrl = pickFirstValue(
    data?.fullProfileImageUrl,
    user?.fullProfileImageUrl,
    profile?.fullProfileImageUrl,
    profile?.originalProfileImageUrl
  );

  const resolvedUserId = pickFirstValue(
    data?.userId,
    data?.id,
    user?.userId,
    user?.id,
    user?.talkUserId,
    user?.targetUserId,
    fallbackUserId
  );

  return {
    userId: resolvedUserId,
    nickName,
    fullProfileImageUrl,
    profileImageUrl,
    statusMessage,
    accessPermit,
  };
}

function escapeVCardValue(value: string) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

function buildVCard(contact: ContactPayload) {
  const name = contact?.name ? String(contact.name) : '';
  const lines = ['BEGIN:VCARD', 'VERSION:3.0'];
  const escapedName = escapeVCardValue(name);
  lines.push(`N:;${escapedName};;;`);
  if (escapedName) {
    lines.push(`FN:${escapedName}`);
  }
  const phones: string[] = [];
  if (contact?.phone) phones.push(String(contact.phone));
  if (Array.isArray(contact?.phones)) {
    for (const phone of contact.phones) {
      if (phone) phones.push(String(phone));
    }
  }
  for (const phone of phones) {
    lines.push(`TEL;TYPE=CELL:${escapeVCardValue(phone)}`);
  }
  if (contact?.email) {
    lines.push(`EMAIL:${escapeVCardValue(contact.email)}`);
  }
  lines.push('END:VCARD');
  return `${lines.join('\r\n')}\r\n`;
}

function normalizeLinkAttachment(input: any) {
  if (!input) return input;
  if (typeof input === 'string') return input;
  if (typeof input === 'object') {
    if (input.attachment) return input.attachment;
    const { text, extra, ...rest } = input;
    if (extra && typeof extra === 'object') {
      return { ...rest, ...extra };
    }
    return rest;
  }
  return input;
}

async function streamEncryptedFile(
  client: CarriageClient,
  filePath: string,
  startOffset: number,
  totalSize: number,
  onProgress?: (sent: number, total: number) => void
) {
  const stream = fs.createReadStream(filePath, {
    start: startOffset > 0 ? startOffset : 0,
    highWaterMark: 64 * 1024,
  });
  let sent = startOffset > 0 ? startOffset : 0;
  for await (const chunk of stream) {
    await client.writeEncrypted(chunk as Buffer);
    sent += (chunk as Buffer).length;
    if (onProgress) onProgress(sent, totalSize);
  }
}

/**
 * KakaoForge Bot - KakaoTalk bot framework (LOCO only).
 *
 * Events emitted:
 *   - 'message'     : Chat message received (chat, msg)
 *   - 'join'        : Member joined (chat, evt)
 *   - 'leave'       : Member left (chat, evt)
 *   - 'invite'      : Member invited (chat, evt)
 *   - 'kick'        : Member kicked (chat, evt)
 *   - 'ready'       : LOCO login + push ready (chat)
 *   - 'connected'   : LOCO socket connected
 *   - 'disconnected': Bot disconnected
 *   - 'error'       : Error occurred
 */
export class KakaoForgeClient extends EventEmitter {
  userId: number;
  oauthToken: string;
  deviceUuid: string;
  os: string;
  appVer: string;
  lang: string;
  mccmnc: string;
  ntype: number;
  timeZone: string;
  hasAccount: string;
  adid: string;
  dtype: string;
  deviceId: string;
  useSub: boolean;
  refreshToken: string;
  debug: boolean;
  type: MemberTypeValue;
  chat: ChatModule;
  autoReconnect: boolean;
  sendIntervalMs: number;
  reconnectMinDelayMs: number;
  reconnectMaxDelayMs: number;
  memberCacheTtlMs: number;
  memberRefreshIntervalMs: number;
  memberLookupTimeoutMs: number;
  pingIntervalMs: number;
  socketKeepAliveMs: number;
  feedTypeMap: Record<number, MemberAction>;
  videoQuality: VideoQuality;
  transcodeVideos: boolean;
  ffmpegPath: string;
  ffprobePath: string;
  debugGetConf: boolean;
  _conf: any;
  _booking: BookingClient | null;
  _carriage: CarriageClient | null;
  _calendar: CalendarClient | null;
  _bubble: BubbleClient | null;
  _messageHandler: MessageHandler | null;
  _joinHandler: MemberEventHandler | null;
  _leaveHandler: MemberEventHandler | null;
  _inviteHandler: MemberEventHandler | null;
  _kickHandler: MemberEventHandler | null;
  _deleteHandler: DeleteEventHandler | null;
  _hideHandler: HideEventHandler | null;
  _pushHandlers: Map<string, (payload: any) => void>;
  _locoAutoConnectAttempted: boolean;
  _chatRooms: Map<string, ChatRoomInfo>;
  _chatIdAliases: Map<string, string>;
  _openChatInitInFlight: Map<string, Promise<void>>;
  _openChatInitialized: Set<string>;
  _chatInfoInFlight: Map<string, Promise<void>>;
  _chatTitleChecked: Set<string>;
  _openLinkInfoCache: Map<string, { name: string }>;
  _openLinkInfoInFlight: Map<string, Promise<string | null>>;
  _openLinkSyncToken: number;
  _chatListCursor: ChatListCursor;
  _memberNames: MemberNameCache;
  _memberTypes: Map<string, Map<string, number>>;
  _memberFetchInFlight: Map<string, Promise<void>>;
  _memberListFetchInFlight: Map<string, Promise<void>>;
  _memberCacheUpdatedAt: Map<string, number>;
  _messageSenderCache: Map<string, Map<string, MessageEvent['sender']>>;
  _memberRefreshTimer: NodeJS.Timeout | null;
  _messageChains: Map<string, Promise<void>>;
  _activeChatId: number | string | null;
  _connectPromise: Promise<any> | null;
  _reconnectTimer: NodeJS.Timeout | null;
  _reconnectAttempt: number;
  _disconnectRequested: boolean;
  _sendQueue: Promise<void>;
  _lastSendAt: number;

  constructor(config: KakaoForgeConfig = {}) {
    super();
    this.userId = config.userId || 0;
    this.oauthToken = config.oauthToken || '';
    this.deviceUuid = config.deviceUuid || '';
    this.os = config.os || 'android';
    this.appVer = config.appVer || '26.1.2';
    this.lang = config.lang || 'ko';
    this.mccmnc = config.mccmnc || config.MCCMNC || '45005';
    this.ntype = typeof config.ntype === 'number'
      ? config.ntype
      : (typeof config.networkType === 'number' ? config.networkType : 0);
    this.timeZone = config.timeZone || resolveTimeZone();
    if (typeof config.hasAccount === 'boolean') {
      this.hasAccount = config.hasAccount ? 'true' : 'false';
    } else if (typeof config.hasAccount === 'string') {
      this.hasAccount = config.hasAccount;
    } else {
      this.hasAccount = '';
    }
    this.adid = config.adid || this.deviceUuid || '';
    this.dtype = config.dtype !== undefined && config.dtype !== null ? String(config.dtype) : '2';
    this.deviceId = config.deviceId || (this.deviceUuid ? buildDeviceId(this.deviceUuid) : '');

    // Sub-device mode only: always connect as secondary device
    this.useSub = true;

    // Refresh token for token renewal
    this.refreshToken = config.refreshToken || '';

    // Debug mode: log all raw events
    this.debug = config.debug || false;
    this.type = 0;

    this.autoReconnect = config.autoReconnect !== false;
    this.sendIntervalMs = 400;
    if (typeof config.sendIntervalMs === 'number') {
      this.sendIntervalMs = config.sendIntervalMs;
    }
    this.reconnectMinDelayMs = typeof config.reconnectMinDelayMs === 'number'
      ? config.reconnectMinDelayMs
      : 1000;
    this.reconnectMaxDelayMs = typeof config.reconnectMaxDelayMs === 'number'
      ? config.reconnectMaxDelayMs
      : 30000;
    this.memberCacheTtlMs = typeof config.memberCacheTtlMs === 'number'
      ? config.memberCacheTtlMs
      : 10 * 60 * 1000;
    this.memberRefreshIntervalMs = typeof config.memberRefreshIntervalMs === 'number'
      ? config.memberRefreshIntervalMs
      : 60 * 1000;
    this.memberLookupTimeoutMs = typeof config.memberLookupTimeoutMs === 'number'
      ? config.memberLookupTimeoutMs
      : 3000;
    this.pingIntervalMs = typeof config.pingIntervalMs === 'number'
      ? config.pingIntervalMs
      : 60000;
    this.socketKeepAliveMs = typeof config.socketKeepAliveMs === 'number'
      ? config.socketKeepAliveMs
      : 30000;
    this.feedTypeMap = {
      ...DEFAULT_FEED_TYPE_MAP,
      ...(config.feedTypeMap || {}),
    };

    this.videoQuality = config.videoQuality || 'high';
    this.transcodeVideos = config.transcodeVideos !== false;
    this.ffmpegPath = config.ffmpegPath || '';
    this.ffprobePath = config.ffprobePath || '';
    this.debugGetConf = config.debugGetConf === true;
    this._conf = null;

    // LOCO clients
    this._booking = null;
    this._carriage = null;
    this._calendar = null;
    this._bubble = null;

    this._messageHandler = null;
    this._joinHandler = null;
    this._leaveHandler = null;
    this._inviteHandler = null;
    this._kickHandler = null;
    this._deleteHandler = null;
    this._hideHandler = null;
    this._pushHandlers = new Map();
    this._locoAutoConnectAttempted = false;
    this._chatRooms = new Map();
    this._chatIdAliases = new Map();
    this._openChatInitInFlight = new Map();
    this._openChatInitialized = new Set();
    this._chatInfoInFlight = new Map();
    this._chatTitleChecked = new Set();
    this._openLinkInfoCache = new Map();
    this._openLinkInfoInFlight = new Map();
    this._openLinkSyncToken = 0;
    this._chatListCursor = { lastTokenId: 0, lastChatId: 0 };
    this._memberNames = new Map();
    this._memberTypes = new Map();
    this._memberFetchInFlight = new Map();
    this._memberListFetchInFlight = new Map();
    this._memberCacheUpdatedAt = new Map();
    this._messageSenderCache = new Map();
    this._memberRefreshTimer = null;
    this._messageChains = new Map();
    this._activeChatId = null;
    this._connectPromise = null;
    this._reconnectTimer = null;
    this._reconnectAttempt = 0;
    this._disconnectRequested = false;
    this._sendQueue = Promise.resolve();
    this._lastSendAt = 0;

    this.chat = {
      sendText: (chatId, text, opts) => this.sendMessage(chatId, text, 1, opts),
      sendReply: (chatId, text, replyTo, opts) => this.sendReply(chatId, text, replyTo, opts),
      sendThreadReply: (chatId, threadId, text, opts) => this.sendThreadReply(chatId, threadId, text, opts),
      sendReaction: (chatId, target, reactionType, opts) => this.sendReaction(chatId, target, reactionType, opts),
      openChatKick: (chatId, target, opts) => this.openChatKick(chatId, target, opts),
      openChatBlind: (chatId, target, opts) => this.openChatBlind(chatId, target, opts),
      fetchMessage: (chatId, logId) => this.fetchMessage(chatId, logId),
      fetchMessagesByUser: (chatId, userId, opts) => this.fetchMessagesByUser(chatId, userId, opts),
      getUsernameById: (chatId, userId) => this.getUsernameById(chatId, userId),
      deleteMessage: (chatId, target) => this.deleteMessage(chatId, target),
      editMessage: (chatId, target, text, opts) => this.editMessage(chatId, target, text, opts),
      send: (chatId, text, opts) => this.sendMessage(chatId, text, opts),
      mention: (userId, nameOrChatId, chatId) => this._mention(userId, nameOrChatId, chatId),
      spoiler: (text) => buildSpoilerMarker(text),
      uploadPhoto: (filePath, opts) => this.uploadPhoto(filePath, opts),
      uploadVideo: (filePath, opts) => this.uploadVideo(filePath, opts),
      uploadAudio: (filePath, opts) => this.uploadAudio(filePath, opts),
      uploadFile: (filePath, opts) => this.uploadFile(filePath, opts),
      sendPhoto: (chatId, attachment, opts) => this.sendPhoto(chatId, attachment, opts),
      sendVideo: (chatId, attachment, opts) => this.sendVideo(chatId, attachment, opts),
      sendAudio: (chatId, attachment, opts) => this.sendAudio(chatId, attachment, opts),
      sendFile: (chatId, attachment, opts) => this.sendFile(chatId, attachment, opts),
      sendPhotoAtThread: (chatId, threadId, attachment, opts) => this.sendPhotoAtThread(chatId, threadId, attachment, opts),
      sendVideoAtThread: (chatId, threadId, attachment, opts) => this.sendVideoAtThread(chatId, threadId, attachment, opts),
      sendAudioAtThread: (chatId, threadId, attachment, opts) => this.sendAudioAtThread(chatId, threadId, attachment, opts),
      sendFileAtThread: (chatId, threadId, attachment, opts) => this.sendFileAtThread(chatId, threadId, attachment, opts),
      sendContact: (chatId, contact, opts) => this.sendContact(chatId, contact, opts),
      sendKakaoProfile: (chatId, profile, opts) => this.sendKakaoProfile(chatId, profile, opts),
      sendLocation: (chatId, location, opts) => this.sendLocation(chatId, location, opts),
      sendSchedule: (chatId, schedule, opts) => this.sendSchedule(chatId, schedule, opts),
      sendLink: (chatId, link, opts) => this.sendLink(chatId, link, opts),
    };
  }

  _nextClientMsgId() {
    const seed = this.deviceUuid || String(this.userId || '');
    return nextClientMsgId(seed);
  }

  _recordChatAlias(chatIdValue: number | string) {
    const idStr = typeof chatIdValue === 'string' ? chatIdValue : String(chatIdValue);
    if (!/^\d+$/.test(idStr)) return;
    if (idStr.length < 16) return;
    const approx = safeNumber(idStr, 0);
    if (!approx) return;
    const approxStr = String(approx);
    if (approxStr !== idStr) {
      this._chatIdAliases.set(approxStr, idStr);
    }
  }

  _resolveChatId(chatId: number | string) {
    const normalized = normalizeIdValue(chatId);
    const key = String(normalized);
    return this._chatIdAliases.get(key) || normalized;
  }

  async _ensureChatInfo(chatId: number | string) {
    if (!this._carriage) return;
    const resolvedChatId = this._resolveChatId(chatId);
    const key = String(resolvedChatId);
    const existing = this._chatInfoInFlight.get(key);
    if (existing) return existing;

    const task = (async () => {
      const res = await this._carriage.chatInfo(resolvedChatId);
      const info = res?.body?.chatInfo || res?.body?.chat || res?.body?.chatData || res?.body?.chatRoom;
      if (info) {
        this._updateChatRooms([info]);
      }
    })()
      .catch((err) => {
        if (this.debug) {
          console.error('[DBG] chatInfo failed:', err.message);
        }
      })
      .finally(() => {
        this._chatInfoInFlight.delete(key);
      });

    this._chatInfoInFlight.set(key, task);
    return task;
  }

  async _ensureOpenChatInfo(chatId: number | string, senderId?: number | string) {
    if (!this._carriage) return;
    const resolvedChatId = this._resolveChatId(chatId);
    const key = String(resolvedChatId);
    if (this._openChatInitialized.has(key)) {
      if (senderId && !this._getCachedMemberName(resolvedChatId, senderId)) {
        try {
          const memRes = await this._carriage.member(resolvedChatId, [senderId]);
          const members = memRes?.body?.members || memRes?.body?.memberList || memRes?.body?.memList || [];
          if (Array.isArray(members) && members.length > 0) {
            this._cacheMembers(resolvedChatId, members);
          }
        } catch (err) {
          if (this.debug) {
            console.error('[DBG] open member fetch failed:', err.message);
          }
        }
      }
      return;
    }

    const existing = this._openChatInitInFlight.get(key);
    if (existing) return existing;

    const task = (async () => {
      const res = await this._carriage.chatOnRoom({ chatId: resolvedChatId, token: 0, opt: 0 });
      const body = res?.body || {};
      if (body) {
        const prev = this._chatRooms.get(key) || {};
        const updatedChatId = normalizeIdValue(body.c) || resolvedChatId;
        const openTitle = extractOpenLinkNameFromMr(body.mr);
        const next: ChatRoomInfo = {
          ...prev,
          chatId: updatedChatId,
          type: body.t || prev.type,
          openToken: body.otk ?? prev.openToken,
          openLinkId: normalizeIdValue(body.li || body.linkId || prev.openLinkId || 0) || prev.openLinkId,
        };
        const flags = resolveRoomFlags({ ...next, openToken: next.openToken });
        next.isOpenChat = flags.isOpenChat;
        next.isGroupChat = flags.isGroupChat;
        if (openTitle) {
          next.title = openTitle;
          next.roomName = openTitle;
        }
        this._chatRooms.set(key, next);
        const members = body.m || body.members || body.memberList || [];
        if (Array.isArray(members) && members.length > 0) {
          if (this.debug) {
            const sample = members[0] || {};
            const keys = Object.keys(sample || {});
            console.log('[DBG] chatOnRoom members keys:', keys.join(','));
            console.log('[DBG] chatOnRoom member sample:', previewLossless(sample));
          }
          this._cacheMembers(resolvedChatId, members);
        }

        if (senderId && !this._getCachedMemberName(resolvedChatId, senderId)) {
          try {
            const memRes = await this._carriage.member(resolvedChatId, [senderId]);
            const memList = memRes?.body?.members || memRes?.body?.memberList || memRes?.body?.memList || [];
            if (Array.isArray(memList) && memList.length > 0) {
              this._cacheMembers(resolvedChatId, memList);
            }
          } catch (err) {
            if (this.debug) {
              console.error('[DBG] open member fetch failed:', err.message);
            }
          }
        }
      }
      this._openChatInitialized.add(key);
    })()
      .catch((err) => {
        if (this.debug) {
          console.error('[DBG] chatOnRoom failed:', err.message);
        }
      })
      .finally(() => {
        this._openChatInitInFlight.delete(key);
      });

    this._openChatInitInFlight.set(key, task);
    return task;
  }

  async _ensureOpenLinkName(linkId: number | string) {
    if (!this._carriage) return null;
    const key = String(normalizeIdValue(linkId));
    if (!key || key === '0') return null;
    const cached = this._openLinkInfoCache.get(key);
    if (cached?.name) return cached.name;
    const existing = this._openLinkInfoInFlight.get(key);
    if (existing) return existing;

    const task = (async () => {
      const res = await this._carriage!.infoLink([linkId]);
      const list = res?.body?.ols || res?.body?.links || [];
      if (Array.isArray(list) && list.length > 0) {
        const info = list[0];
        const name = String(info?.ln || info?.name || info?.title || '').trim();
        if (name) {
          this._openLinkInfoCache.set(key, { name });
          return name;
        }
      }
      return null;
    })()
      .catch((err) => {
        if (this.debug) {
          console.error('[DBG] infolink failed:', err.message);
        }
        return null;
      })
      .finally(() => {
        this._openLinkInfoInFlight.delete(key);
      });

    this._openLinkInfoInFlight.set(key, task);
    return task;
  }

  async _syncOpenLinks() {
    if (!this._carriage) return;
    try {
      const res = await this._carriage.syncLink(this._openLinkSyncToken || 0);
      const body = res?.body || {};
      const list = body.ols || body.links || [];
      if (Array.isArray(list)) {
        for (const info of list) {
          const id = normalizeIdValue(info?.li || info?.linkId || info?.id || 0);
          const name = String(info?.ln || info?.name || info?.title || '').trim();
          if (id && name) {
            this._openLinkInfoCache.set(String(id), { name });
          }
        }
      }
      if (body.ltk !== undefined) {
        const nextToken = safeNumber(body.ltk, this._openLinkSyncToken);
        this._openLinkSyncToken = Number.isFinite(nextToken) ? nextToken : this._openLinkSyncToken;
      }
    } catch (err) {
      if (this.debug) {
        console.error('[DBG] synclink failed:', err.message);
      }
    }
  }

  /**
   * Login with email/password (sub-device mode).
   * This authenticates via HTTP, then connects to LOCO servers.
   */
  async login({ email, password, deviceName, modelName, forced = false, checkAllowlist, enforceAllowlist }: any) {
    if (!this.deviceUuid) {
      this.deviceUuid = generateDeviceUuid();
      console.log(`[*] Generated device UUID: ${this.deviceUuid.substring(0, 16)}...`);
    }

    // Step 1: HTTP login to get OAuth token
    console.log('[*] Authenticating via sub-device login...');
    const loginResult = await subDeviceLogin({
      email,
      password,
      deviceUuid: this.deviceUuid,
      deviceName,
      modelName,
      forced,
      checkAllowlist,
      enforceAllowlist,
      appVer: this.appVer,
    });

    this.userId = loginResult.userId;
    this.oauthToken = loginResult.accessToken;
    this.refreshToken = loginResult.refreshToken || '';

    console.log(`[+] Authenticated: userId=${this.userId}`);

    // Step 2: Connect to servers (LOCO only)
    return await this.connect();
  }

  /**
   * Login with QR code (sub-device mode).
   */
  async loginQR({
    deviceName,
    modelName,
    forced = false,
    checkAllowlist,
    enforceAllowlist,
    onQrUrl,
    onPasscode,
  }: any = {}) {
    if (!this.deviceUuid) {
      this.deviceUuid = generateDeviceUuid();
      console.log(`[*] Generated device UUID: ${this.deviceUuid.substring(0, 16)}...`);
    }

    let resolvedDeviceName = deviceName;
    let resolvedModelName = modelName;
    if (!resolvedDeviceName) {
      resolvedDeviceName = DEFAULT_QR_MODEL_NAME;
    }
    if (!resolvedModelName) {
      resolvedModelName = DEFAULT_QR_MODEL_NAME;
    }

    let resolvedOnQrUrl = onQrUrl;
    let resolvedOnPasscode = onPasscode;
    if (!resolvedOnQrUrl || !resolvedOnPasscode) {
      const defaults = buildQrLoginHandlers();
      if (!resolvedOnQrUrl) {
        resolvedOnQrUrl = defaults.onQrUrl;
      }
      if (!resolvedOnPasscode) {
        resolvedOnPasscode = defaults.onPasscode;
      }
    }

    // Step 1: QR code login to get OAuth token
    console.log('[*] Starting QR code login...');
    const loginResult = await qrLogin({
      deviceUuid: this.deviceUuid,
      deviceName: resolvedDeviceName,
      modelName: resolvedModelName,
      forced,
      appVer: this.appVer,
      checkAllowlist,
      enforceAllowlist,
      onQrUrl: resolvedOnQrUrl,
      onPasscode: resolvedOnPasscode,
    });

    this.userId = loginResult.userId;
    this.oauthToken = loginResult.accessToken;
    this.refreshToken = loginResult.refreshToken || '';

    console.log(`[+] QR authenticated: userId=${this.userId}`);

    // Step 2: Connect to servers (LOCO only)
    return await this.connect();
  }

  _clearReconnectTimer() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }

  _scheduleReconnect(reason?: any) {
    if (!this.autoReconnect || this._disconnectRequested) return;
    if (this._reconnectTimer) return;

    const attempt = this._reconnectAttempt + 1;
    this._reconnectAttempt = attempt;
    const delay = Math.min(
      this.reconnectMinDelayMs * Math.pow(2, attempt - 1),
      this.reconnectMaxDelayMs
    );

    if (reason && this.debug) {
      console.error('[DBG] reconnect reason:', reason?.message || reason);
    }
    console.log(`[!] Reconnecting in ${delay}ms...`);

    this._reconnectTimer = setTimeout(async () => {
      this._reconnectTimer = null;
      try {
        await this.connect();
        this._reconnectAttempt = 0;
      } catch (err) {
        console.error('[!] Reconnect failed:', err.message);
        this._scheduleReconnect(err);
      }
    }, delay);
  }

  _startMemberRefresh() {
    this._stopMemberRefresh();
    if (!this.memberRefreshIntervalMs || this.memberRefreshIntervalMs <= 0) return;

    this._memberRefreshTimer = setInterval(() => {
      if (!this._carriage) return;
      const now = Date.now();
      for (const [chatId, updatedAt] of this._memberCacheUpdatedAt.entries()) {
        if (this._shouldRefreshMembers(chatId, now, updatedAt)) {
          this._fetchMemberList(chatId).catch(() => {});
        }
      }
    }, this.memberRefreshIntervalMs);
  }

  _stopMemberRefresh() {
    if (this._memberRefreshTimer) {
      clearInterval(this._memberRefreshTimer);
      this._memberRefreshTimer = null;
    }
  }

  _touchMemberCache(chatId: number | string) {
    this._memberCacheUpdatedAt.set(String(chatId), Date.now());
  }

  _shouldRefreshMembers(chatId: string, now: number, updatedAt?: number) {
    if (!this.memberCacheTtlMs || this.memberCacheTtlMs <= 0) return false;
    const last = typeof updatedAt === 'number'
      ? updatedAt
      : this._memberCacheUpdatedAt.get(chatId) || 0;
    if (!last) return true;
    return now - last >= this.memberCacheTtlMs;
  }

  /**
   * Connect to KakaoTalk LOCO servers.
   * Requires userId, oauthToken, deviceUuid.
   */
  async connect() {
    if (this._connectPromise) return this._connectPromise;
    this._disconnectRequested = false;
    this._clearReconnectTimer();

    this._connectPromise = (async () => {
    if (!this.oauthToken) {
      throw new Error('No OAuth token. Call login() first or set oauthToken in constructor.');
    }
    if (!this.deviceUuid) {
      throw new Error('No deviceUuid. Use auth.json or call login() first.');
    }

    if (this._carriage) {
      await this._carriage.end().catch(() => {});
      this._carriage = null;
    }
    if (this._booking) {
      this._booking.disconnect();
      this._booking = null;
    }

    // Step 1: Booking - GETCONF
    console.log('[*] Connecting to Booking server...');
    this._booking = new BookingClient();
    await this._booking.connect();
    console.log('[+] Connected to Booking server');

    let checkinResult = null;
    try {
      let conf = null;
      try {
        conf = await this._booking.getConf({
          userId: this.userId,
          os: this.os,
          mccmnc: this.mccmnc,
          appVer: this.appVer,
        });
        this._conf = conf;
        const ticketHosts = [
          ...(conf.ticket?.lsl || []),
          ...(conf.ticket?.lsl6 || []),
        ];
        console.log(`[+] GETCONF response: ticketHosts=${ticketHosts.length}, wifiPorts=${conf.portsWifi.length}, cellPorts=${conf.portsCellular.length}`);
      } catch (err) {
        console.warn(`[!] GETCONF failed: ${err.message}`);
      }

      if (conf) {
        const preferCellular = this.ntype && this.ntype !== 0;
        const hosts = uniqueStrings([
          ...(conf.ticket?.lsl || []),
          ...(conf.ticket?.lsl6 || []),
        ]);
        const primaryPorts = preferCellular ? conf.portsCellular : conf.portsWifi;
        const fallbackPorts = preferCellular ? conf.portsWifi : conf.portsCellular;
        let ports = uniqueNumbers([...(primaryPorts || []), ...(fallbackPorts || [])]);
        if (hosts.length > 0 && ports.length === 0) {
          ports = [443];
          console.warn('[!] GETCONF returned no ports; using 443 as fallback');
        }

        if (hosts.length > 0 && ports.length > 0) {
          try {
            checkinResult = await this._checkinViaTicket(hosts, ports, {
              userId: this.userId,
              os: this.os,
              appVer: this.appVer,
              lang: this.lang,
              ntype: this.ntype,
              useSub: this.useSub,
              mccmnc: this.mccmnc,
            });
          } catch (err) {
            console.warn(`[!] Ticket CHECKIN failed: ${err.message}`);
          }
        }
      }

      if (!checkinResult) {
        console.log('[*] Falling back to Booking CHECKIN...');
        checkinResult = await this._booking.checkin({
          userId: this.userId,
          os: this.os,
          appVer: this.appVer,
          lang: this.lang,
          ntype: this.ntype,
          useSub: this.useSub,
          mccmnc: this.mccmnc,
        });
      }
    } finally {
      this._booking.disconnect();
    }

    console.log(`[+] CHECKIN ok`);

    if (!checkinResult.host || !checkinResult.port) {
      throw new Error('CHECKIN failed: no host/port received');
    }

    // Step 2: Carriage - V2SL handshake + LOGINLIST
    console.log(`[*] Connecting to Carriage server ${checkinResult.host}:${checkinResult.port}...`);
    this._carriage = new CarriageClient();

    this._carriage.on('push', (packet) => {
      void this._onPush(packet);
    });
    this._carriage.on('error', (err) => console.error('[!] Carriage error:', err.message));
    this._carriage.on('disconnected', () => {
      console.log('[!] Disconnected from Carriage');
      this.emit('disconnected');
      this._stopMemberRefresh();
      this._scheduleReconnect();
    });

    await this._carriage.connect(checkinResult.host, checkinResult.port, 10000, this.socketKeepAliveMs);
    this.emit('connected');
    console.log('[+] Connected to Carriage server (V2SL handshake done)');

    const loginRes = await this._carriage.loginList({
      os: this.os,
      appVer: this.appVer,
      lang: this.lang,
      duuid: this.deviceUuid,
      oauthToken: this.oauthToken,
      ntype: this.ntype,
    });

    console.log(`[+] LOGINLIST response: status=${loginRes.status}`);
    if (loginRes.status !== 0) {
      console.error('[!] LOGINLIST failed with status:', loginRes.status);
      console.error('[!] Body:', JSON.stringify(loginRes.body, null, 2));
    }

    this._applyChatList(loginRes.body);

    // Sync open link list for open chat titles
    await this._syncOpenLinks();

    // Start keepalive
    this._carriage.startPing(this.pingIntervalMs);
    console.log('[+] Bot is ready!');
    this.emit('ready', this.chat);
    this._startMemberRefresh();

      return loginRes;
    })();

    try {
      const result = await this._connectPromise;
      this._reconnectAttempt = 0;
      return result;
    } catch (err) {
      this._scheduleReconnect(err);
      throw err;
    } finally {
      this._connectPromise = null;
    }
  }

  async _checkinViaTicket(hosts, ports, opts) {
    let lastErr = null;
    for (const host of hosts) {
      for (const port of ports) {
        const ticket = new TicketClient();
        try {
          console.log(`[*] Ticket CHECKIN -> ${host}:${port}`);
          await ticket.connect(host, port);
          const res = await ticket.checkin(opts);
          if (res.host && res.port) {
            return res;
          }
          lastErr = new Error(`Ticket CHECKIN returned no host/port (${host}:${port})`);
        } catch (err) {
          lastErr = err;
          console.warn(`[!] Ticket CHECKIN error (${host}:${port}): ${err.message}`);
        } finally {
          ticket.disconnect();
        }
      }
    }
    if (lastErr) {
      throw lastErr;
    }
    throw new Error('Ticket CHECKIN failed: no endpoints attempted');
  }

  async _onPush(packet) {
    // Emit to specific push handlers
    const handler = this._pushHandlers.get(packet.method);
    if (handler) {
      handler(packet);
    }

    const memberAction = resolveMemberActionFromPush(packet.method);
    if (memberAction) {
      const handled = await this._emitMemberEventFromPush(memberAction, packet);
      if (handled) {
        return;
      }
    }

    const deleteHandled = await this._emitDeleteEventFromPush(packet);
    if (deleteHandled) {
      return;
    }

    const hideHandled = await this._emitHideEventFromPush(packet);
    if (hideHandled) {
      return;
    }

    if (packet.method === 'MSG') {
      const { chatId, chatLog } = packet.body || {};
      if (chatLog) {
        this._emitMessage({ ...packet.body, chatId, chatLog });
      }
    } else if (packet.method === 'CHATINFO' || packet.method === 'UPDATECHAT') {
      const info = packet.body?.chatInfo || packet.body?.chat || packet.body?.chatData || packet.body?.chatRoom;
      if (info) {
        this._updateChatRooms([info]);
      }
    } else if (packet.method === 'SYNCMEMT' || packet.method === 'SETMEMTYPE') {
      const applied = this._applyMemberTypePush(packet);
      if (!applied && this.debug) {
        console.log(`[DBG] Push: ${packet.method}`, JSON.stringify(packet.body).substring(0, 200));
      }
    } else if (packet.method === 'KICKOUT') {
      console.error('[!] KICKOUT received:', JSON.stringify(packet.body));
      this.emit('kickout', packet.body);
    } else if (this.debug) {
      console.log(`[DBG] Push: ${packet.method}`, JSON.stringify(packet.body).substring(0, 200));
    }
  }

  onMessage(handler: MessageHandler) {
    this._messageHandler = handler;
  }

  onJoin(handler: MemberEventHandler) {
    this._joinHandler = handler;
  }

  onLeave(handler: MemberEventHandler) {
    this._leaveHandler = handler;
  }

  onInvite(handler: MemberEventHandler) {
    this._inviteHandler = handler;
  }

  onKick(handler: MemberEventHandler) {
    this._kickHandler = handler;
  }

  onDelete(handler: DeleteEventHandler) {
    this._deleteHandler = handler;
  }

  onHide(handler: HideEventHandler) {
    this._hideHandler = handler;
  }

  onReady(handler: (chat: ChatModule) => void) {
    this.on('ready', handler);
  }

  onPush(method: string, handler: (payload: any) => void) {
    this._pushHandlers.set(method, handler);
  }

  _emitMessage(data: any) {
    const chatLog = data.chatLog || data;
    const roomIdValue = normalizeIdValue(
      data.chatId || data.c || chatLog.chatId || chatLog.chatRoomId || chatLog.roomId || chatLog.c || 0
    );
    if (roomIdValue) {
      this._recordChatAlias(roomIdValue);
    }
    const key = roomIdValue ? String(roomIdValue) : '_global';
    const prev = this._messageChains.get(key) || Promise.resolve();
    const next = prev
      .catch(() => {})
      .then(() => this._emitMessageInternal(data))
      .catch((err) => {
        if (this.debug) {
          console.error('[DBG] emit message failed:', err.message);
        }
      })
      .finally(() => {
        if (this._messageChains.get(key) === next) {
          this._messageChains.delete(key);
        }
      });
    this._messageChains.set(key, next);
  }

  async _emitMessageInternal(data: any) {
    const msg = await this._buildMessageEvent(data);
    if (!msg) return;

    this._activeChatId = msg.room.id;

    const clientType = this._resolveMemberType(msg.room.id, this.userId);
    this.type = clientType;
    this.chat.type = clientType;

    if (this._messageHandler) {
      if (this._messageHandler.length <= 1) {
        (this._messageHandler as (msg: MessageEvent) => void)(msg);
      } else {
        (this._messageHandler as (chat: ChatModule, msg: MessageEvent) => void)(this.chat, msg);
      }
    }
    this.emit('message', this.chat, msg);

    this._emitMemberEventsFromMessage(msg, data);
  }

  _emitMemberEvent(action: MemberAction, event: MemberEvent) {
    const handler =
      action === 'join'
        ? this._joinHandler
        : action === 'leave'
          ? this._leaveHandler
          : action === 'invite'
            ? this._inviteHandler
            : this._kickHandler;

    if (handler) {
      if (handler.length <= 1) {
        (handler as (evt: MemberEvent) => void)(event);
      } else {
        (handler as (chat: ChatModule, evt: MemberEvent) => void)(this.chat, event);
      }
    }
    this.emit(action, this.chat, event);
  }

  _emitDeleteEvent(event: DeleteEvent) {
    const handler = this._deleteHandler;
    if (handler) {
      if (handler.length <= 1) {
        (handler as (evt: DeleteEvent) => void)(event);
      } else {
        (handler as (chat: ChatModule, evt: DeleteEvent) => void)(this.chat, event);
      }
    }
    this.emit('delete', this.chat, event);
  }

  _emitHideEvent(event: HideEvent) {
    const handler = this._hideHandler;
    if (handler) {
      if (handler.length <= 1) {
        (handler as (evt: HideEvent) => void)(event);
      } else {
        (handler as (chat: ChatModule, evt: HideEvent) => void)(this.chat, event);
      }
    }
    this.emit('hide', this.chat, event);
  }

  _emitMemberEventsFromMessage(msg: MessageEvent, raw: any) {
    const chatLog = extractChatLogPayload(raw);
    const feed = extractFeedPayload(chatLog, msg.attachmentsRaw);
    if (!feed) return;

    const action = this._resolveFeedAction(feed);
    if (!action) return;

    const memberIds = extractFeedMemberIds(feed);
    const nameMap = buildFeedMemberNameMap(feed);

    const feedActorId = extractActorIdFromPayload(feed);
    const actorId = feedActorId || msg.sender.id;
    const actorName = feedActorId ? nameMap.get(String(actorId)) : msg.sender.name;

    const event = this._buildMemberEvent(action, msg.room.id, {
      actorId,
      actorName,
      memberIds,
      memberNameMap: nameMap,
      message: msg,
      raw: { feed, raw },
    });
    this._emitMemberEvent(action, event);
  }

  async _emitMemberEventFromPush(action: MemberAction, packet: any) {
    const body = packet?.body || {};
    const chatLog = extractChatLogPayload(body.chatLog || body.chatlog || body);
    const roomId = normalizeIdValue(
      body.chatId || body.c || body.roomId || chatLog?.chatId || chatLog?.c || 0
    );
    if (!roomId) return false;

    let resolvedAction = action;
    let memberIds = extractPushMemberIds(body, packet.method);
    let nameMap = buildMemberNameMap(body);
    let actorId = extractActorIdFromPayload(body);
    let actorName = actorId ? nameMap.get(String(actorId)) : '';

    if (chatLog) {
      const attachmentsRaw = parseAttachments(
        chatLog.attachment ?? chatLog.attachments ?? chatLog.extra ?? null
      );
      const feed = extractFeedPayload(chatLog, attachmentsRaw);
      if (feed) {
        const feedAction = this._resolveFeedAction(feed);
        if (feedAction) resolvedAction = feedAction;
        const feedMemberIds = extractFeedMemberIds(feed);
        if (feedMemberIds.length > 0) memberIds = feedMemberIds;
        const feedNameMap = buildFeedMemberNameMap(feed);
        if (feedNameMap.size > 0) nameMap = feedNameMap;
        const feedActorId = extractActorIdFromPayload(feed);
        if (feedActorId) {
          actorId = feedActorId;
          actorName = nameMap.get(String(feedActorId)) || actorName;
        }
      }
    }

    if (memberIds.length === 0 && chatLog) {
      const fallbackIds = extractMemberIdsFromPayload(chatLog, { excludeUserId: packet.method === 'DELMEM' });
      if (fallbackIds.length > 0) {
        memberIds = fallbackIds;
      }
    }

    const chatAuthorId = normalizeIdValue(
      chatLog?.authorId || chatLog?.userId || chatLog?.senderId || chatLog?.writerId || 0
    );
    if (
      packet.method === 'DELMEM' &&
      chatAuthorId &&
      memberIds.length === 1 &&
      String(chatAuthorId) !== String(memberIds[0])
    ) {
      resolvedAction = 'kick';
      if (!actorId) {
        actorId = chatAuthorId;
        actorName = nameMap.get(String(chatAuthorId)) || actorName;
      }
    }

    if (memberIds.length === 0 && chatLog?.authorId && packet.method !== 'DELMEM') {
      memberIds = [normalizeIdValue(chatLog.authorId)];
    }

    if (!actorId && chatAuthorId) {
      actorId = chatAuthorId;
      actorName = nameMap.get(String(chatAuthorId)) || actorName;
    }

    if (!actorId) {
      if ((resolvedAction === 'join' || resolvedAction === 'leave') && memberIds.length === 1) {
        actorId = memberIds[0];
        actorName = nameMap.get(String(actorId)) || actorName;
      }
    }

    if (memberIds.length === 0 && actorId && (resolvedAction === 'join' || resolvedAction === 'leave')) {
      memberIds = [actorId];
    }

    const roomKey = String(roomId);
    const roomPayload = this._buildRoomPayload(roomId);
    const hasName = (idValue: any) => {
      if (!idValue) return false;
      const key = String(idValue);
      const fromMap = nameMap.get(key);
      if (fromMap) return true;
      return Boolean(this._getCachedMemberName(roomId, idValue));
    };
    const missingRoomName = !roomPayload.name;
    const missingActorName = actorId ? !hasName(actorId) : false;
    let missingMemberName = false;
    for (const memberId of memberIds) {
      if (!hasName(memberId)) {
        missingMemberName = true;
        break;
      }
    }

    if (missingRoomName || missingActorName || missingMemberName) {
      const roomInfo = this._chatRooms.get(roomKey) || {};
      const flags = resolveRoomFlags({ ...roomInfo, ...body, ...chatLog });
      if (flags.isOpenChat) {
        await this._ensureOpenChatInfo(roomId, actorId || memberIds[0]);
        const refreshed = this._chatRooms.get(roomKey) || {};
        const linkId = normalizeIdValue(
          refreshed.openLinkId || refreshed.openChatId || refreshed.li || body?.li || body?.linkId || chatLog?.li || 0
        );
        if (linkId && !this._buildRoomPayload(roomId).name) {
          await this._ensureOpenLinkName(linkId);
        }
      } else {
        await this._ensureChatInfo(roomId);
        await this._waitForMemberList(roomId, this.memberLookupTimeoutMs);
      }

      const missingIds = new Set<number | string>();
      if (actorId && !this._getCachedMemberName(roomId, actorId)) {
        missingIds.add(actorId);
      }
      for (const memberId of memberIds) {
        if (memberId && !this._getCachedMemberName(roomId, memberId)) {
          missingIds.add(memberId);
        }
      }
      if (missingIds.size > 0) {
        await Promise.all(
          [...missingIds].map((id) => this._waitForMemberName(roomId, id, this.memberLookupTimeoutMs))
        );
      }

      if (!flags.isOpenChat) {
        const derived = this._buildRoomNameFromMembers(roomKey);
        if (derived) {
          const prev = this._chatRooms.get(roomKey) || {};
          this._chatRooms.set(roomKey, { ...prev, roomName: derived });
        }
      }
    }

    const filledNameMap = new Map<string, string>(nameMap);
    const fillName = (idValue: any) => {
      if (!idValue) return;
      const cached = this._getCachedMemberName(roomId, idValue);
      if (cached && !filledNameMap.get(String(idValue))) {
        filledNameMap.set(String(idValue), cached);
      }
    };
    if (actorId) {
      fillName(actorId);
      actorName = filledNameMap.get(String(actorId)) || this._getCachedMemberName(roomId, actorId) || actorName;
    }
    for (const memberId of memberIds) {
      fillName(memberId);
    }
    nameMap = filledNameMap;

    if (this.debug && (!actorId || memberIds.length === 0)) {
      console.log(`[DBG] memberEvent incomplete (${packet.method})`, previewLossless({ body, chatLog }));
    }

    const event = this._buildMemberEvent(resolvedAction, roomId, {
      actorId,
      actorName,
      memberIds,
      memberNameMap: nameMap,
      raw: body,
    });
    this._emitMemberEvent(resolvedAction, event);
    return true;
  }

  async _emitDeleteEventFromPush(packet: any): Promise<boolean> {
    if (!resolveDeleteActionFromPush(packet?.method)) return false;
    const event = await this._buildModerationEventFromPush('delete', packet);
    if (!event || event.type !== 'delete') return false;
    this._emitDeleteEvent(event);
    return true;
  }

  async _emitHideEventFromPush(packet: any): Promise<boolean> {
    if (!resolveHideActionFromPush(packet?.method)) return false;
    const event = await this._buildModerationEventFromPush('hide', packet);
    if (!event || event.type !== 'hide') return false;
    this._emitHideEvent(event);
    return true;
  }

  async _buildModerationEventFromPush(type: 'delete' | 'hide', packet: any): Promise<DeleteEvent | HideEvent | null> {
    const body = packet?.body || {};
    const chatLog = extractChatLogPayload(body.chatLog || body.chatlog || body);
    const attachmentRaw =
      chatLog?.attachment ??
      chatLog?.attachments ??
      chatLog?.extra ??
      body?.attachment ??
      body?.attachments ??
      body?.extra ??
      null;
    const attachmentJson = parseAttachmentJson(attachmentRaw);
    const messageRaw = chatLog?.message ?? chatLog?.msg ?? chatLog?.text ?? null;
    let messageJson: any = null;
    if (typeof messageRaw === 'string') {
      const trimmed = messageRaw.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          messageJson = LosslessJSON.parse(trimmed);
        } catch {
          messageJson = null;
        }
      }
    }
    const roomIdValue = normalizeIdValue(
      body.chatId || body.c || body.roomId || body.chatRoomId || chatLog?.chatId || chatLog?.c || 0
    ) || this._activeChatId || 0;
    if (!roomIdValue) return null;

    const coverType = messageJson?.coverType ? String(messageJson.coverType) : '';
    const inferredOpenChat = coverType.toLowerCase().includes('openchat');

    let logIdValue = normalizeLogTarget(body) || normalizeLogTarget(chatLog);
    if (messageJson && typeof messageJson === 'object') {
      const targetLogId = normalizeIdValue(
        messageJson.logId ||
          (Array.isArray(messageJson.chatLogInfos) && messageJson.chatLogInfos[0]
            ? messageJson.chatLogInfos[0].logId || messageJson.chatLogInfos[0].l
            : 0)
      );
      if (targetLogId) {
        logIdValue = targetLogId;
      }
    }
    if (!logIdValue) return null;

    const openLinkIdValue = normalizeIdValue(
      extractOpenLinkIdFromRaw(body) || extractOpenLinkIdFromRaw(chatLog) || 0
    );
    if (openLinkIdValue && openLinkIdValue !== 0 && openLinkIdValue !== '0') {
      const key = String(roomIdValue);
      const prev = this._chatRooms.get(key) || {};
      if (!prev.openLinkId || prev.isOpenChat !== true) {
        this._chatRooms.set(key, {
          ...prev,
          openLinkId: prev.openLinkId || openLinkIdValue,
          isOpenChat: prev.isOpenChat === undefined ? true : prev.isOpenChat,
        });
      }
    } else if (inferredOpenChat) {
      const key = String(roomIdValue);
      const prev = this._chatRooms.get(key) || {};
      if (prev.isOpenChat !== true) {
        this._chatRooms.set(key, { ...prev, isOpenChat: true });
      }
    }

    const actorIdValue = normalizeIdValue(
      body.userId ||
        body.actorId ||
        body.authorId ||
        body.aid ||
        body.uid ||
        chatLog?.authorId ||
        chatLog?.userId ||
        0
    );
    const rawActorName =
      body.memberName ||
      body.nickName ||
      body.nickname ||
      body.name ||
      body.actorName ||
      '';
    let actorName = rawActorName || this._getCachedMemberName(roomIdValue, actorIdValue) || '';
    if (!actorName && actorIdValue) {
      const roomKey = String(roomIdValue);
      const roomInfo = this._chatRooms.get(roomKey) || {};
      const flags = resolveRoomFlags({ ...roomInfo, ...body, ...chatLog });
      if (flags.isOpenChat) {
        await this._ensureOpenChatInfo(roomIdValue, actorIdValue);
      } else {
        await this._ensureChatInfo(roomIdValue);
      }
      await this._waitForMemberName(roomIdValue, actorIdValue, this.memberLookupTimeoutMs);
      actorName = this._getCachedMemberName(roomIdValue, actorIdValue) || '';
    }
    if (!actorName && actorIdValue) {
      actorName = String(actorIdValue);
    }
    const actor = this._buildMemberRef(roomIdValue, actorIdValue || 0, actorName);

    let roomBase = this._buildRoomPayload(roomIdValue);
    if (!roomBase.name) {
      const roomKey = String(roomIdValue);
      const roomInfo = this._chatRooms.get(roomKey) || {};
      const flags = resolveRoomFlags({ ...roomInfo, ...body, ...chatLog, isOpenChat: inferredOpenChat || roomInfo.isOpenChat });
      if (flags.isOpenChat || inferredOpenChat) {
        await this._ensureOpenChatInfo(roomIdValue, actorIdValue || undefined);
        let linkIdToUse = openLinkIdValue;
        if (!linkIdToUse) {
          const refreshed = this._chatRooms.get(roomKey) || {};
          linkIdToUse = normalizeIdValue(
            refreshed.openLinkId || refreshed.openChatId || refreshed.li || 0
          );
        }
        if (linkIdToUse && linkIdToUse !== 0 && linkIdToUse !== '0') {
          await this._ensureOpenLinkName(linkIdToUse);
        }
      } else {
        await this._ensureChatInfo(roomIdValue);
      }
      roomBase = this._buildRoomPayload(roomIdValue);
    }
    if (roomBase.isOpenChat || inferredOpenChat) {
      const derived = this._buildRoomNameFromMembers(String(roomIdValue));
      const isDerived = derived && roomBase.name === derived;
      if (!roomBase.name || isDerived) {
        const roomKey = String(roomIdValue);
        let linkIdToUse = openLinkIdValue;
        if (!linkIdToUse) {
          const refreshed = this._chatRooms.get(roomKey) || {};
          linkIdToUse = normalizeIdValue(
            refreshed.openLinkId || refreshed.openChatId || refreshed.li || 0
          );
        }
        if (linkIdToUse && linkIdToUse !== 0 && linkIdToUse !== '0') {
          const openName = await this._ensureOpenLinkName(linkIdToUse);
          if (openName) {
            const prev = this._chatRooms.get(roomKey) || {};
            this._chatRooms.set(roomKey, {
              ...prev,
              title: openName,
              roomName: openName,
              isOpenChat: true,
              openLinkId: prev.openLinkId || linkIdToUse,
            });
            roomBase = this._buildRoomPayload(roomIdValue);
          }
        }
      }
    }
    let room = roomBase;
    if (openLinkIdValue && !roomBase.openLinkId) {
      room = { ...roomBase, openLinkId: openLinkIdValue };
    }

    const base = {
      type,
      room,
      actor,
      message: { id: logIdValue, logId: logIdValue },
      raw: packet,
      chatId: roomIdValue,
      logId: logIdValue,
    } as DeleteEvent | HideEvent;

    if (type === 'hide') {
      const categoryRaw =
        body.category ||
        body.cat ||
        body.reason ||
        body.reportCategory ||
        attachmentJson?.category ||
        attachmentJson?.cat ||
        attachmentJson?.reason ||
        attachmentJson?.reportCategory;
      const reportRaw =
        body.report ??
        body.r ??
        body.reported ??
        attachmentJson?.report ??
        attachmentJson?.r ??
        attachmentJson?.reported;
      const report =
        typeof reportRaw === 'boolean'
          ? reportRaw
          : reportRaw !== undefined
            ? !!safeNumber(reportRaw, 0)
            : undefined;
      const hideEvent: HideEvent = {
        ...(base as HideEvent),
        actor,
        member: { ids: [0], names: [''] },
        members: [this._buildMemberRef(roomIdValue, 0, '')],
        category: categoryRaw ? String(categoryRaw) : undefined,
        report,
        hidden: typeof messageJson?.hidden === 'boolean' ? messageJson.hidden : undefined,
        coverType: messageJson?.coverType ? String(messageJson.coverType) : undefined,
        feedType: typeof messageJson?.feedType === 'number' ? messageJson.feedType : undefined,
      };

      if (logIdValue && roomIdValue) {
        try {
          const targetMsg = await this.fetchMessage(roomIdValue, logIdValue);
          const targetSender = targetMsg?.sender;
          if (targetSender?.id) {
            const ref = this._buildMemberRef(roomIdValue, targetSender.id, targetSender.name);
            hideEvent.member = { ids: [ref.id], names: [ref.name] };
            hideEvent.members = [ref];
          }
        } catch (err) {
          if (this.debug) {
            console.error(
              '[DBG] hide fetchMessage failed:',
              err instanceof Error ? err.message : String(err)
            );
          }
        }
      }

      return hideEvent;
    }
    const deleteEvent: DeleteEvent = {
      ...(base as DeleteEvent),
      actor,
      member: { ids: [0], names: [''] },
      members: [this._buildMemberRef(roomIdValue, 0, '')],
    };

    let memberRef = this._getCachedMessageSender(roomIdValue, logIdValue);
    if (!memberRef) {
      const authorIdValue = normalizeIdValue(
        body.authorId ||
          body.userId ||
          body.memberId ||
          body.uid ||
          chatLog?.authorId ||
          chatLog?.userId ||
          0
      );
      if (authorIdValue) {
        const name = this._getCachedMemberName(roomIdValue, authorIdValue) || '';
        memberRef = this._buildMemberRef(roomIdValue, authorIdValue, name);
      }
    }
    if (memberRef) {
      deleteEvent.member = { ids: [memberRef.id], names: [memberRef.name] };
      deleteEvent.members = [memberRef];
    }

    return deleteEvent;
  }

  _buildMemberEvent(
    action: MemberAction,
    chatId: number | string,
    opts: {
      actorId?: number | string;
      actorName?: string;
      memberIds?: Array<number | string>;
      memberNameMap?: Map<string, string>;
      message?: MessageEvent;
      raw?: any;
    }
  ): MemberEvent {
    const room = this._buildRoomPayload(chatId);
    const event: MemberEvent = {
      type: action,
      room,
      raw: opts.raw,
    };
    if (opts.message) event.message = opts.message;

    if (opts.actorId) {
      event.actor = this._buildMemberRef(chatId, opts.actorId, opts.actorName);
    }

    if (opts.memberIds && opts.memberIds.length > 0) {
      const ids = opts.memberIds.slice();
      const names: string[] = [];
      const members: MessageEvent['sender'][] = [];
      for (const memberId of opts.memberIds) {
        const name =
          opts.memberNameMap?.get(String(memberId)) ||
          this._getCachedMemberName(chatId, memberId) ||
          '';
        names.push(name);
        members.push(this._buildMemberRef(chatId, memberId, name));
      }
      event.member = { ids, names };
      event.members = members;
    }

    return event;
  }

  _buildMemberRef(chatId: number | string, userId: number | string, fallbackName?: string) {
    const name = fallbackName || this._getCachedMemberName(chatId, userId) || '';
    const type = this._resolveMemberType(chatId, userId);
    return { id: userId, name, type };
  }

  _mention(userId: number | string, nameOrChatId?: string | number, chatId?: number | string) {
    let name = '';
    let resolvedChatId: number | string | null = null;

    if (chatId !== undefined && chatId !== null) {
      resolvedChatId = chatId;
      if (typeof nameOrChatId === 'string') {
        name = nameOrChatId;
      }
    } else if (nameOrChatId !== undefined && nameOrChatId !== null) {
      if (typeof nameOrChatId === 'number') {
        resolvedChatId = nameOrChatId;
      } else if (typeof nameOrChatId === 'string' && /^\d+$/.test(nameOrChatId)) {
        resolvedChatId = nameOrChatId;
      } else if (typeof nameOrChatId === 'string') {
        name = nameOrChatId;
      }
    }

    if (!name) {
      const fallbackChatId = resolvedChatId ?? this._activeChatId ?? null;
      if (fallbackChatId !== null && fallbackChatId !== undefined) {
        name = this._getCachedMemberName(fallbackChatId, userId) || '';
      }
    }

    if (!name) {
      name = String(userId);
    }

    return buildMentionMarker(userId, name);
  }

  _buildRoomPayload(chatId: number | string): MessageEvent['room'] {
    const resolvedChatId = this._resolveChatId(chatId);
    const roomInfo = this._chatRooms.get(String(resolvedChatId)) || {};
    const flags = resolveRoomFlags(roomInfo);
    let roomName = flags.isOpenChat
      ? (roomInfo.title || '')
      : (roomInfo.roomName || roomInfo.title || '');
    if (!roomName) {
      roomName = roomInfo.roomName || roomInfo.title || '';
    }
    const openLinkIdValue = normalizeIdValue(
      roomInfo.openLinkId || roomInfo.openChatId || roomInfo.li || 0
    );
    if (!roomName && flags.isOpenChat && openLinkIdValue) {
      const cached = this._openLinkInfoCache.get(String(openLinkIdValue));
      if (cached?.name) {
        roomName = cached.name;
      }
    }
    return {
      id: resolvedChatId,
      name: roomName,
      isGroupChat: flags.isGroupChat,
      isOpenChat: flags.isOpenChat,
      openLinkId: openLinkIdValue || undefined,
    };
  }

  _resolveFeedAction(feed: any): MemberAction | null {
    const rawAction =
      feed?.action ??
      feed?.event ??
      feed?.typeName ??
      feed?.feedTypeName ??
      feed?.feedAction;
    const fromString = normalizeMemberAction(rawAction);
    if (fromString) return fromString;

    const rawType = feed?.feedType ?? feed?.ft ?? feed?.type ?? feed?.t;
    const numeric = safeNumber(rawType, NaN);
    if (!Number.isNaN(numeric)) {
      const mapped = this.feedTypeMap[numeric];
      if (mapped) return mapped;
      if (this.debug) {
        console.log(`[DBG] feedType ${numeric} has no mapping`);
      }
    }
    return null;
  }

  async _buildMessageEvent(data: any): Promise<MessageEvent | null> {
    const chatLog = data.chatLog || data;
    const roomIdValue = normalizeIdValue(
      data.chatId || data.c || chatLog.chatId || chatLog.chatRoomId || chatLog.roomId || chatLog.c || 0
    );
    const senderIdValue = normalizeIdValue(
      chatLog.authorId || chatLog.senderId || chatLog.userId || 0
    );
    const text = chatLog.message || chatLog.msg || chatLog.text || '';
    const type = safeNumber(chatLog.type || chatLog.msgType || 1, 1);
    const logIdValue = normalizeIdValue(chatLog.logId || chatLog.msgId || 0);
    const logIdNumeric = safeNumber(logIdValue, 0);
    const attachmentsRaw = parseAttachments(
      chatLog.attachment ?? chatLog.attachments ?? chatLog.extra ?? null
    );

    let senderName =
      chatLog.authorName ||
      chatLog.authorNickname ||
      chatLog.nickName ||
      chatLog.nickname ||
      chatLog.name ||
      '';
    if (!senderName) {
      senderName = data.authorNickname || data.authorName || data.nickname || data.nickName || data.name || senderName;
    }

    const roomInfo = this._chatRooms.get(String(roomIdValue)) || {};
    const initialFlags = resolveRoomFlags(roomInfo);
    let roomName = initialFlags.isOpenChat
      ? (roomInfo.title || '')
      : (roomInfo.roomName || roomInfo.title || '');
    if (!roomName) {
      roomName = data.roomName || data.chatRoomName || data.title || roomName;
    }

    let flags = initialFlags;
    const openLinkIdValue = normalizeIdValue(
      extractOpenLinkIdFromRaw(data) ||
        data.openLinkId ||
        roomInfo.openLinkId ||
        0
    );
    if (openLinkIdValue && roomIdValue) {
      const key = String(roomIdValue);
      if (!roomInfo.openLinkId) {
        this._chatRooms.set(key, { ...roomInfo, openLinkId: openLinkIdValue });
      }
    }
    if (openLinkIdValue && this._openLinkInfoCache.has(String(openLinkIdValue))) {
      const cached = this._openLinkInfoCache.get(String(openLinkIdValue));
      if (cached?.name && !roomName) {
        roomName = cached.name;
      }
    }

    if (roomIdValue) {
      if (flags.isOpenChat) {
        this._ensureOpenChatInfo(roomIdValue, senderIdValue).catch(() => {});
      } else {
        this._ensureMemberList(roomIdValue);
      }
    }

    if (roomIdValue && flags.isOpenChat) {
      await this._ensureMemberType(roomIdValue, senderIdValue);
      await this._ensureMemberType(roomIdValue, this.userId);
    }

    if (roomIdValue && (!senderName || !roomName)) {
      if (flags.isOpenChat) {
        await this._ensureOpenChatInfo(roomIdValue, senderIdValue);
      } else {
        await this._waitForMemberContext(roomIdValue, senderIdValue);
      }

      if (!roomName) {
        await this._ensureChatInfo(roomIdValue);
      }

      const refreshed = this._chatRooms.get(String(roomIdValue)) || roomInfo;
      flags = resolveRoomFlags(refreshed);

      if (!senderName && senderIdValue) {
        if (flags.isOpenChat) {
          await this._ensureOpenChatInfo(roomIdValue, senderIdValue);
        }
        senderName = this._getCachedMemberName(roomIdValue, senderIdValue) || senderName;
      }
      if (!roomName) {
        roomName = flags.isOpenChat
          ? (refreshed.title || roomName)
          : (refreshed.roomName || refreshed.title || roomName);
      }
      if (!roomName && flags.isOpenChat && openLinkIdValue) {
        const openName = await this._ensureOpenLinkName(openLinkIdValue);
        if (openName) {
          roomName = openName;
          const key = String(roomIdValue);
          const prev = this._chatRooms.get(key) || {};
          this._chatRooms.set(key, { ...prev, title: openName, roomName: openName, openLinkId: openLinkIdValue });
        }
      }
      if (!roomName && flags.isOpenChat) {
        const derived = extractOpenLinkNameFromMr(data.mr);
        if (derived) {
          roomName = derived;
          const key = String(roomIdValue);
          const prev = this._chatRooms.get(key) || {};
          this._chatRooms.set(key, { ...prev, title: derived, roomName: derived });
        }
      }
      if (!flags.isOpenChat) {
        const titleKey = String(roomIdValue);
        const derived = this._buildRoomNameFromMembers(titleKey);
        const refreshedInfo = this._chatRooms.get(titleKey);
        const needsTitle = refreshedInfo?.needsTitle;
        const shouldCheckTitle =
          (!roomName || (derived && roomName === derived) || needsTitle) && !this._chatTitleChecked.has(titleKey);
        if (shouldCheckTitle) {
          this._chatTitleChecked.add(titleKey);
          await this._ensureChatInfo(roomIdValue);
          const titled = this._chatRooms.get(titleKey);
          if (titled?.title) {
            roomName = titled.title;
          }
        }
      }
    if (!roomName && !flags.isOpenChat) {
      const derived = this._buildRoomNameFromMembers(String(roomIdValue));
      if (derived) {
        roomName = derived;
        this._chatRooms.set(String(roomIdValue), { ...refreshed, roomName });
      }
    }
  }
    const hasExplicitTitle = Boolean(data?.title || data?.roomName || data?.chatRoomName);
    if (roomIdValue) {
      const key = String(roomIdValue);
      const prevRoom = this._chatRooms.get(key) || {};
      const nextRoom: ChatRoomInfo = { ...prevRoom };
      let changed = false;
      if (roomName && (!nextRoom.roomName || nextRoom.needsTitle)) {
        nextRoom.roomName = roomName;
        changed = true;
      }
      if (roomName && (flags.isOpenChat || hasExplicitTitle) && (!nextRoom.title || nextRoom.needsTitle)) {
        nextRoom.title = roomName;
        if (nextRoom.needsTitle) nextRoom.needsTitle = false;
        changed = true;
      }
      if (flags.isOpenChat && nextRoom.isOpenChat !== true) {
        nextRoom.isOpenChat = true;
        changed = true;
      }
      if (flags.isGroupChat && nextRoom.isGroupChat !== true) {
        nextRoom.isGroupChat = true;
        changed = true;
      }
      if (openLinkIdValue && !nextRoom.openLinkId) {
        nextRoom.openLinkId = openLinkIdValue;
        changed = true;
      }
      if (changed) {
        this._chatRooms.set(key, nextRoom);
      }
    }
    const senderType = this._resolveMemberType(roomIdValue, senderIdValue);
    const msg: MessageEvent = {
      message: { id: logIdValue, text, type, logId: logIdValue },
      attachmentsRaw,
      sender: { id: senderIdValue, name: senderName, type: senderType },
      room: {
        id: roomIdValue,
        name: roomName,
        isGroupChat: flags.isGroupChat,
        isOpenChat: flags.isOpenChat,
        openLinkId: openLinkIdValue || undefined,
      },
      raw: data,
      chatId: roomIdValue,
      senderId: senderIdValue,
      text,
      type,
      logId: logIdValue,
    };

    if (roomIdValue && logIdValue) {
      this._cacheMessageSender(roomIdValue, logIdValue, msg.sender);
    }

    if (roomIdValue) {
      const key = String(roomIdValue);
      const prev = this._chatRooms.get(key) || {};
      const prevLast = safeNumber(prev.lastLogId || 0, 0);
      if (logIdNumeric > prevLast) {
        this._chatRooms.set(key, { ...prev, lastLogId: logIdNumeric });
      }
    }

    return msg;
  }

  async _ensureMemberType(chatId: number | string, userId: number | string) {
    if (!userId) return;
    const cached = this._getCachedMemberType(chatId, userId);
    if (typeof cached === 'number') return;
    const resolvedChatId = this._resolveChatId(chatId);
    const roomInfo = this._chatRooms.get(String(resolvedChatId)) || {};
    const flags = resolveRoomFlags(roomInfo);
    if (flags.isOpenChat) {
      await this._ensureOpenChatInfo(resolvedChatId, userId);
      const refreshed = this._getCachedMemberType(resolvedChatId, userId);
      if (typeof refreshed === 'number') return;
      await this._waitForMemberName(resolvedChatId, userId, this.memberLookupTimeoutMs);
      return;
    }
    await this._waitForMemberList(resolvedChatId, this.memberLookupTimeoutMs);
  }

  _applyChatList(body: any) {
    if (!body) return [];

    const chats = this._extractChatList(body);
    this._updateChatRooms(chats);

    const delChatIds = Array.isArray(body.delChatIds) ? body.delChatIds : [];
    for (const id of delChatIds) {
      this._chatRooms.delete(String(id));
    }

    if (body.lastTokenId !== undefined) {
      this._chatListCursor.lastTokenId = normalizeIdValue(body.lastTokenId) || this._chatListCursor.lastTokenId || 0;
    }
    if (body.lastChatId !== undefined) {
      this._chatListCursor.lastChatId = normalizeIdValue(body.lastChatId) || this._chatListCursor.lastChatId || 0;
    }

    return chats;
  }

  _extractChatList(body: any): any[] {
    if (!body) return [];
    if (Array.isArray(body.chatDatas)) return body.chatDatas;
    if (Array.isArray(body.chatInfos)) return body.chatInfos;
    if (Array.isArray(body.chats)) return body.chats;
    if (Array.isArray(body.chatRooms)) return body.chatRooms;
    if (Array.isArray(body.chatList)) return body.chatList;
    return [];
  }

  _extractDisplayMembers(chat: any): string[] {
    if (!chat) return [];
    const names: string[] = [];

    if (Array.isArray(chat.displayMembers)) {
      for (const member of chat.displayMembers) {
        const name = member?.nickname || member?.nickName || member?.name || '';
        if (name) names.push(name);
      }
    }

    if (names.length === 0 && Array.isArray(chat.displayNickNames)) {
      for (const name of chat.displayNickNames) {
        if (name) names.push(String(name));
      }
    }

    if (names.length === 0 && Array.isArray(chat.displayNicknames)) {
      for (const name of chat.displayNicknames) {
        if (name) names.push(String(name));
      }
    }

    return names.filter(Boolean);
  }

  _extractTitleFromMeta(meta: any): string {
    if (!meta) return '';

    if (typeof meta === 'string') {
      const trimmed = meta.trim();
      if (!trimmed) return '';
      try {
        const parsed = JSON.parse(trimmed);
        return parsed?.title || parsed?.name || parsed?.subject || '';
      } catch {
        return trimmed.length <= 100 ? trimmed : '';
      }
    }

    if (typeof meta === 'object') {
      return meta.title || meta.name || meta.subject || '';
    }

    return '';
  }

  _extractTitle(chat: any): string {
    if (!chat) return '';

    const direct = chat.title || chat.roomName || chat.name || chat.subject;
    if (direct) return String(direct);

    const metaTitle = this._extractTitleFromMeta(chat.meta);
    if (metaTitle) return metaTitle;

    if (Array.isArray(chat.chatMetas)) {
      const titleMeta = chat.chatMetas.find((meta) => meta?.type === 3);
      if (titleMeta) {
        const title = this._extractTitleFromMeta(titleMeta?.content ?? titleMeta);
        if (title) return title;
      }
      for (const meta of chat.chatMetas) {
        const title = this._extractTitleFromMeta(meta?.content);
        if (title) return title;
      }
    }

    return '';
  }

  _updateChatRooms(chats: any[]) {
    if (!Array.isArray(chats)) return;

    for (const chat of chats) {
      const chatIdValue = normalizeIdValue(chat?.chatId || chat?.id || chat?.roomId || chat?.chatRoomId || chat?.c || 0);
      if (!chatIdValue) continue;

      const key = String(chatIdValue);
      this._recordChatAlias(chatIdValue);
      const prev = this._chatRooms.get(key) || {};
      const flags = resolveRoomFlags(chat);
      const displayMembers = this._extractDisplayMembers(chat);
      const title = this._extractTitle(chat);
      let roomName = '';
      if (title) {
        roomName = title;
      } else if (flags.isOpenChat) {
        roomName = prev.title || '';
      } else if (displayMembers.length > 0) {
        roomName = displayMembers.join(', ');
      } else {
        roomName = prev.roomName || '';
      }

      const lastChatLogId = safeNumber(
        chat.lastChatLogId || chat.lastMessageId || chat.lastLogId || chat.lastSeenLogId,
        prev.lastChatLogId || 0
      );

      const lastSeenLogId = safeNumber(chat.lastSeenLogId, prev.lastSeenLogId || 0);

      const needsTitle = !flags.isOpenChat && !title && displayMembers.length > 0;
      const next: ChatRoomInfo = {
        ...prev,
        chatId: chatIdValue,
        type: chat.type || chat.t || prev.type,
        title: title || prev.title || '',
        roomName,
        displayMembers: displayMembers.length > 0 ? displayMembers : prev.displayMembers,
        isGroupChat: flags.isGroupChat,
        isOpenChat: flags.isOpenChat,
        openLinkId: chat.openLinkId || chat.openChatId || chat.li || prev.openLinkId,
        openToken: chat.openToken || chat.otk || prev.openToken,
        directChat: typeof chat.directChat === 'boolean' ? chat.directChat : prev.directChat,
        needsTitle,
        lastChatLogId,
        lastSeenLogId,
      };

      this._chatRooms.set(key, next);
    }
  }

  _ensureMemberList(chatId: number | string) {
    const resolvedChatId = this._resolveChatId(chatId);
    const key = String(resolvedChatId);
    if (!this._memberCacheUpdatedAt.has(key)) {
      this._fetchMemberList(resolvedChatId, { force: true }).catch(() => {});
    }
  }

  async _waitForMemberContext(chatId: number | string, senderId: number | string) {
    const timeoutMs = this.memberLookupTimeoutMs;
    const resolvedChatId = this._resolveChatId(chatId);
    const key = String(resolvedChatId);

    if (!this._memberCacheUpdatedAt.has(key)) {
      await this._waitForMemberList(resolvedChatId, timeoutMs);
    }

    if (senderId) {
      const cached = this._getCachedMemberName(resolvedChatId, senderId);
      if (!cached) {
        await this._waitForMemberName(resolvedChatId, senderId, timeoutMs);
      }
    }
  }

  async _waitForMemberList(chatId: number | string, timeoutMs: number) {
    await this._waitWithTimeout(this._fetchMemberList(chatId, { force: true }), timeoutMs);
  }

  async _waitForMemberName(chatId: number | string, userId: number | string, timeoutMs: number) {
    await this._waitWithTimeout(this._fetchMemberName(chatId, userId), timeoutMs);
  }

  async _waitWithTimeout(promise?: Promise<void>, timeoutMs?: number) {
    if (!promise) return;
    if (!timeoutMs || timeoutMs <= 0) {
      await promise;
      return;
    }
    await Promise.race([
      promise,
      new Promise((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  }

  _buildRoomNameFromMembers(chatId: number | string) {
    const map = this._memberNames.get(String(chatId));
    if (!map || map.size === 0) return '';
    const names: string[] = [];
    for (const [id, name] of map.entries()) {
      if (!name) continue;
      if (String(id) === String(this.userId)) continue;
      names.push(name);
    }
    if (names.length === 0) return '';
    const max = 4;
    if (names.length <= max) return names.join(', ');
    return `${names.slice(0, max).join(', ')}...`;
  }

  async _fetchMemberList(chatId: number | string, { force = false }: any = {}) {
    if (!this._carriage) return;
    const resolvedChatId = this._resolveChatId(chatId);
    const key = String(resolvedChatId);
    const existing = this._memberListFetchInFlight.get(key);
    if (existing) return existing;
    if (!force && !this._shouldRefreshMembers(key, Date.now())) return;

    const task = (async () => {
      let token = 0;
      let pages = 0;
      while (pages < 30) {
        const res = await this._carriage.memList({ chatId: resolvedChatId, token, excludeMe: false });
        const body = res?.body || {};
        const members = body.members || body.memberList || body.memList || [];
        if (Array.isArray(members) && members.length > 0) {
          this._cacheMembers(resolvedChatId, members);
        }
        const nextToken = safeNumber(
          body.token || body.nextToken || body.memberToken || 0,
          0
        );
        if (!nextToken || nextToken === token) break;
        token = nextToken;
        pages += 1;
      }
      this._touchMemberCache(resolvedChatId);
    })()
      .catch((err) => {
        if (this.debug) {
          console.error('[DBG] memList failed:', err.message);
        }
      })
      .finally(() => {
        this._memberListFetchInFlight.delete(key);
      });

    this._memberListFetchInFlight.set(key, task);
    return task;
  }

  _getCachedMemberName(chatId: number | string, userId: number | string) {
    const resolvedChatId = this._resolveChatId(chatId);
    const map = this._memberNames.get(String(resolvedChatId));
    if (!map) return '';
    return map.get(String(userId)) || '';
  }

  _getCachedMemberType(chatId: number | string, userId: number | string) {
    const resolvedChatId = this._resolveChatId(chatId);
    const map = this._memberTypes.get(String(resolvedChatId));
    if (!map) return null;
    const value = map.get(String(userId));
    return value === undefined ? null : value;
  }

  _getCachedMemberIds(chatId: number | string) {
    const resolvedChatId = this._resolveChatId(chatId);
    const map = this._memberNames.get(String(resolvedChatId));
    if (!map) return [];
    return uniqueNumbers([...map.keys()].map((id) => Number(id)));
  }

  _extractMemberName(member: any) {
    return (
      member?.nickName ||
      member?.nickname ||
      member?.name ||
      member?.profileName ||
      ''
    );
  }

  _cacheMembers(chatId: number | string, members: any[]) {
    if (!Array.isArray(members)) return;
    const key = String(chatId);
    const map = this._memberNames.get(key) || new Map<string, string>();
    const typeMap = this._memberTypes.get(key) || new Map<string, number>();
    for (const mem of members) {
      const userId = normalizeIdValue(mem?.userId || mem?.id || mem?.memberId || mem?.user_id || 0);
      if (!userId) continue;
      const name = this._extractMemberName(mem);
      map.set(String(userId), String(name || ''));
      const rawMemberType = mem?.mt ?? mem?.ut ?? mem?.userType ?? mem?.memberType ?? mem?.linkMemberType;
      if (rawMemberType !== undefined && rawMemberType !== null) {
        const parsed = safeNumber(rawMemberType, NaN);
        if (!Number.isNaN(parsed)) {
          typeMap.set(String(userId), parsed);
        }
      }
    }
    if (map.size > 0) {
      this._memberNames.set(key, map);
    }
    if (typeMap.size > 0) {
      this._memberTypes.set(key, typeMap);
    }
    this._touchMemberCache(chatId);

    const room = this._chatRooms.get(key);
    if (room && !room.roomName) {
      const derived = this._buildRoomNameFromMembers(chatId);
      if (derived) {
        this._chatRooms.set(key, { ...room, roomName: derived });
      }
    }
  }

  _cacheMessageSender(chatId: number | string, logId: number | string, sender: MessageEvent['sender']) {
    if (!chatId || !logId || !sender) return;
    const logKey = String(normalizeIdValue(logId));
    if (!logKey || logKey === '0') return;
    const chatKey = String(chatId);
    let map = this._messageSenderCache.get(chatKey);
    if (!map) {
      map = new Map();
      this._messageSenderCache.set(chatKey, map);
    }
    if (map.has(logKey)) {
      map.delete(logKey);
    }
    map.set(logKey, { id: sender.id, name: sender.name, type: sender.type });
    while (map.size > MESSAGE_SENDER_CACHE_LIMIT) {
      const firstKey = map.keys().next().value;
      if (firstKey === undefined) break;
      map.delete(firstKey);
    }
  }

  _getCachedMessageSender(chatId: number | string, logId: number | string): MessageEvent['sender'] | null {
    if (!chatId || !logId) return null;
    const logKey = String(normalizeIdValue(logId));
    if (!logKey || logKey === '0') return null;
    const map = this._messageSenderCache.get(String(chatId));
    if (!map) return null;
    const cached = map.get(logKey);
    return cached || null;
  }

  _applyMemberTypePush(packet: any) {
    const body = packet?.body || {};
    const resolvedChatId = normalizeIdValue(body.chatId || body.c || 0);
    if (!resolvedChatId) return false;

    const members = body.members || body.memberList || body.memList;
    if (Array.isArray(members) && members.length > 0) {
      this._cacheMembers(resolvedChatId, members);
      return true;
    }

    const memberIds = body.memberIds || body.mids;
    const memberTypes = body.memberTypes || body.mts;
    if (!Array.isArray(memberIds) || !Array.isArray(memberTypes)) return false;
    if (memberIds.length === 0 || memberIds.length !== memberTypes.length) return false;

    const key = String(resolvedChatId);
    const typeMap = this._memberTypes.get(key) || new Map<string, number>();
    for (let i = 0; i < memberIds.length; i += 1) {
      const userId = normalizeIdValue(memberIds[i]);
      if (!userId) continue;
      const parsed = safeNumber(memberTypes[i], NaN);
      if (Number.isNaN(parsed)) continue;
      typeMap.set(String(userId), parsed);
    }
    if (typeMap.size > 0) {
      this._memberTypes.set(key, typeMap);
      this._touchMemberCache(resolvedChatId);
      return true;
    }
    return false;
  }

  _resolveMemberType(chatId: number | string, userId: number | string): MemberTypeValue {
    const memberType = this._getCachedMemberType(chatId, userId);
    return typeof memberType === 'number' ? memberType : 0;
  }

  async _fetchMemberName(chatId: number | string, userId: number | string) {
    if (!this._carriage) return;
    const resolvedChatId = this._resolveChatId(chatId);
    const key = `${resolvedChatId}:${userId}`;
    const existing = this._memberFetchInFlight.get(key);
    if (existing) return existing;

    const task = (async () => {
      const res = await this._carriage.member(resolvedChatId, [userId]);
      const members = res?.body?.members || res?.body?.memberList || res?.body?.memList || [];
      if (this.debug && Array.isArray(members) && members.length > 0) {
        const roomInfo = this._chatRooms.get(String(resolvedChatId)) || {};
        const flags = resolveRoomFlags(roomInfo);
        if (flags.isOpenChat) {
          const sample = members[0] || {};
          const keys = Object.keys(sample || {});
          console.log('[DBG] member(openchat) keys:', keys.join(','));
          console.log('[DBG] member(openchat) sample:', previewLossless(sample));
        }
      }
      this._cacheMembers(resolvedChatId, members);
    })()
      .catch((err) => {
        if (this.debug) {
          console.error('[DBG] member fetch failed:', err.message);
        }
      })
      .finally(() => {
        this._memberFetchInFlight.delete(key);
      });

    this._memberFetchInFlight.set(key, task);
    return task;
  }

  async _resolveChatMembers(chatId: number) {
    const key = String(chatId);
    const now = Date.now();
    const cached = this._getCachedMemberIds(chatId);
    if (cached.length > 0 && !this._shouldRefreshMembers(key, now)) {
      return cached;
    }
    if (!this._carriage) return cached;

    const ids = new Set<number>(cached);
    let token = 0;
    let pages = 0;
    while (pages < 30) {
      const res = await this._carriage.memList({ chatId, token, excludeMe: false });
      const body = res?.body || {};
      const members = body.members || body.memberList || body.memList || [];
      if (Array.isArray(members) && members.length > 0) {
        for (const mem of members) {
          const userId = safeNumber(mem?.userId || mem?.id || mem?.memberId || mem?.user_id, 0);
          if (userId) ids.add(userId);
        }
        this._cacheMembers(chatId, members);
      }
      const nextToken = safeNumber(
        body.token || body.nextToken || body.memberToken || 0,
        0
      );
      if (!nextToken || nextToken === token) break;
      token = nextToken;
      pages += 1;
    }
    if (ids.size > 0) {
      this._touchMemberCache(chatId);
    }
    return [...ids];
  }


  /**
   * Fetch chat room list via LOCO (LCHATLIST).
   * Returns { chats: [...] }
   */
  async getChatRooms() {
    if (!this._carriage) throw new Error('LOCO not connected');

    const chatIds: Long[] = [];
    const maxIds: Long[] = [];
    for (const [key, room] of this._chatRooms.entries()) {
      const chatIdValue = normalizeIdValue(key);
      if (!chatIdValue) continue;
      chatIds.push(toLong(chatIdValue));
      maxIds.push(toLong(room.lastChatLogId || 0));
    }

    const res = await this._carriage.lchatList({
      chatIds,
      maxIds,
      lastTokenId: this._chatListCursor.lastTokenId || 0,
      lastChatId: this._chatListCursor.lastChatId || 0,
    });

    const chats = this._applyChatList(res.body);
    return { ...res.body, chats };
  }

  /**
   * Sync messages via LOCO (SYNCMSG).
   */
  async syncMessages(chatId: number | string, { since = 0, count = 50, max = 0, emit = true }: any = {}) {
    if (!this._carriage) throw new Error('LOCO not connected');

    const key = String(normalizeIdValue(chatId));
    const room = this._chatRooms.get(key) || {};
    const cur = since || room.lastLogId || 0;

    const res = await this._carriage.syncMsg({
      chatId,
      cur,
      max,
      cnt: count,
    });

    const logs = res?.body?.chatLogs || [];
    if (Array.isArray(logs)) {
      let maxLogId = cur;
      for (const log of logs) {
        const logId = safeNumber(log?.logId || log?.msgId || 0, 0);
        if (logId > cur) {
          if (emit) {
            this._emitMessage({ chatId, chatLog: log });
          }
        }
        if (logId > maxLogId) maxLogId = logId;
      }
      this._chatRooms.set(key, { ...room, lastLogId: maxLogId });
    }

    return res?.body || res;
  }

  /**
   * Fetch a specific message via LOCO (GETMSGS) and build MessageEvent.
   */
  async fetchMessage(chatId: number | string, logId: number | string) {
    const normalizedLogId = normalizeIdValue(logId);
    if (!normalizedLogId || normalizedLogId === 0 || normalizedLogId === '0') {
      throw new Error('fetchMessage requires logId');
    }

    if (!this._carriage && !this._locoAutoConnectAttempted) {
      this._locoAutoConnectAttempted = true;
      try {
        await this.connect();
      } catch (err) {
        if (this.debug) {
          console.error('[DBG] LOCO auto-connect failed:', err.message);
        }
      }
    }

    if (!this._carriage) {
      throw new Error('LOCO not connected. Call client.connect() first.');
    }

    const resolvedChatId = this._resolveChatId(chatId);
    this._recordChatAlias(resolvedChatId);
    const res = await this._carriage.getMsgs([resolvedChatId], [normalizedLogId]);
    const body = res?.body || {};
    const logs =
      body.chatLogs ||
      body.chatLog ||
      body.logs ||
      body.msgs ||
      body.messages ||
      body;
    let chatLog: any = null;
    if (Array.isArray(logs)) {
      chatLog = logs.find((item) => item) || null;
    } else if (logs && typeof logs === 'object') {
      chatLog = logs;
    }
    if (!chatLog) {
      throw new Error('message not found');
    }

    const msg = await this._buildMessageEvent({ chatId: resolvedChatId, chatLog });
    if (!msg) {
      throw new Error('message not found');
    }
    return msg;
  }

  /**
   * Fetch recent messages by a specific userId via LOCO (SYNCMSG).
   */
  async fetchMessagesByUser(
    chatId: number | string,
    userId: number | string,
    opts: { since?: number | string; max?: number | string; count?: number; limit?: number; maxPages?: number } = {}
  ) {
    const normalizedUserId = normalizeIdValue(userId);
    if (!normalizedUserId || normalizedUserId === 0 || normalizedUserId === '0') {
      throw new Error('fetchMessagesByUser requires userId');
    }

    if (!this._carriage && !this._locoAutoConnectAttempted) {
      this._locoAutoConnectAttempted = true;
      try {
        await this.connect();
      } catch (err) {
        if (this.debug) {
          console.error('[DBG] LOCO auto-connect failed:', err.message);
        }
      }
    }

    if (!this._carriage) {
      throw new Error('LOCO not connected. Call client.connect() first.');
    }

    const resolvedChatId = this._resolveChatId(chatId);
    this._recordChatAlias(resolvedChatId);

    const since = opts.since ?? 0;
    const max = opts.max ?? 0;
    const count = typeof opts.count === 'number' ? opts.count : 50;
    const limit = typeof opts.limit === 'number' ? opts.limit : 50;
    const maxPages = typeof opts.maxPages === 'number' ? opts.maxPages : 5;

    const results: MessageEvent[] = [];
    let cur = safeNumber(since, 0);
    let pages = 0;

    while (pages < maxPages && results.length < limit) {
      const res = await this._carriage.syncMsg({
        chatId: resolvedChatId,
        cur,
        max,
        cnt: count,
      });

      const logs = res?.body?.chatLogs || [];
      if (!Array.isArray(logs) || logs.length === 0) {
        break;
      }

      let maxLogId = cur;
      for (const log of logs) {
        const logIdValue = safeNumber(log?.logId || log?.msgId || 0, 0);
        if (logIdValue > maxLogId) {
          maxLogId = logIdValue;
        }

        const authorIdValue = normalizeIdValue(log?.authorId || log?.userId || log?.senderId || 0);
        if (authorIdValue && String(authorIdValue) === String(normalizedUserId)) {
          const msg = await this._buildMessageEvent({ chatId: resolvedChatId, chatLog: log });
          if (msg) {
            results.push(msg);
            if (results.length >= limit) break;
          }
        }
      }

      if (maxLogId <= cur) break;
      cur = maxLogId;
      pages += 1;
    }

    return results;
  }

  /**
   * Resolve username by userId within a chat (MEMBER).
   */
  async getUsernameById(chatId: number | string, userId: number | string) {
    const normalizedUserId = normalizeIdValue(userId);
    if (!normalizedUserId || normalizedUserId === 0 || normalizedUserId === '0') {
      throw new Error('getUsernameById requires userId');
    }

    const resolvedChatId = this._resolveChatId(chatId);
    let cached = this._getCachedMemberName(resolvedChatId, normalizedUserId);
    if (cached) return cached;

    if (!this._carriage && !this._locoAutoConnectAttempted) {
      this._locoAutoConnectAttempted = true;
      try {
        await this.connect();
      } catch (err) {
        if (this.debug) {
          console.error('[DBG] LOCO auto-connect failed:', err.message);
        }
      }
    }

    if (this._carriage) {
      await this._fetchMemberName(resolvedChatId, normalizedUserId);
      cached = this._getCachedMemberName(resolvedChatId, normalizedUserId);
    }

    return cached || '';
  }

  async _enqueueSend<T>(task: () => Promise<T>) {
    const prev = this._sendQueue;
    const interval = this.sendIntervalMs;
    const next = prev
      .catch(() => {})
      .then(async () => {
        if (interval > 0) {
          const now = Date.now();
          let waitMs = this._lastSendAt + interval - now;
          if (waitMs < 0) waitMs = 0;
          if (waitMs > 0) {
            await sleepMs(waitMs);
          }
        }
        this._lastSendAt = Date.now();
        return task();
      });
    this._sendQueue = next.then(
      () => {},
      () => {}
    );
    return next;
  }

  /**
   * Send a text message to a chatroom (LOCO WRITE).
   */
  async sendMessage(chatId: number | string, text: string, type: number | SendOptions = 1, opts: SendOptions = {}) {
    let msgType = typeof type === 'number' ? type : 1;
    if (type && typeof type === 'object') {
      opts = type;
      msgType = typeof opts.type === 'number' ? opts.type : 1;
    }
    if (!opts || typeof opts !== 'object') opts = {};

    let messageText = text || '';
    const extractedMentions = extractMarkedMentions(messageText);
    if (extractedMentions.mentions.length > 0) {
      messageText = extractedMentions.text;
      const mergedMentions = Array.isArray(opts.mentions)
        ? [...opts.mentions, ...extractedMentions.mentions]
        : extractedMentions.mentions;
      opts = { ...opts, mentions: mergedMentions };
    }

    const extractedSpoilers = extractMarkedSpoilers(messageText);
    if (extractedSpoilers.spoilers.length > 0) {
      messageText = extractedSpoilers.text;
      const mergedSpoilers = Array.isArray(opts.spoilers)
        ? [...opts.spoilers, ...extractedSpoilers.spoilers]
        : extractedSpoilers.spoilers;
      opts = { ...opts, spoilers: mergedSpoilers };
    }

    const msgId = opts.msgId !== undefined && opts.msgId !== null ? opts.msgId : this._nextClientMsgId();
    const writeOpts = {
      ...opts,
      msgId,
      noSeen: opts.noSeen ?? false,
      scope: typeof opts.scope === 'number' ? opts.scope : 1,
      silence: opts.silence ?? opts.isSilence ?? false,
    };
    const normalizedMentions = normalizeMentionInputs(messageText || '', opts.mentions);
    const normalizedSpoilers = normalizeSpoilerInputs(messageText || '', opts.spoilers);
    if (normalizedMentions.length > 0 || normalizedSpoilers.length > 0) {
      const sourceExtra: any = opts.extra as any;
      let extraObj: any = {};
      if (sourceExtra && typeof sourceExtra === 'object' && !Array.isArray(sourceExtra)) {
        extraObj = { ...sourceExtra };
      }
      if (normalizedMentions.length > 0) {
        extraObj.mentions = normalizedMentions;
      }
      if (normalizedSpoilers.length > 0) {
        extraObj.spoilers = normalizedSpoilers;
      }
      writeOpts.extra = buildExtra(extraObj);
    }

    if (!this._carriage && !this._locoAutoConnectAttempted) {
      this._locoAutoConnectAttempted = true;
      try {
        await this.connect();
      } catch (err) {
        if (this.debug) {
          console.error('[DBG] LOCO auto-connect failed:', err.message);
        }
      }
    }

    if (!this._carriage) {
      throw new Error('LOCO not connected. Call client.connect() first.');
    }

    const resolvedChatId = this._resolveChatId(chatId);
    return await this._enqueueSend(() => {
      if (!this._carriage) {
        throw new Error('LOCO not connected. Call client.connect() first.');
      }
      return this._carriage.write(resolvedChatId, messageText, msgType, writeOpts);
    });
  }

  /**
   * Delete a message for everyone (DELETEMSG).
   */
  async deleteMessage(chatId: number | string, target: any) {
    const logId = normalizeLogTarget(target);
    if (!logId) {
      throw new Error('deleteMessage requires a logId or MessageEvent');
    }

    if (!this._carriage && !this._locoAutoConnectAttempted) {
      this._locoAutoConnectAttempted = true;
      try {
        await this.connect();
      } catch (err) {
        if (this.debug) {
          console.error('[DBG] LOCO auto-connect failed:', err.message);
        }
      }
    }

    if (!this._carriage) {
      throw new Error('LOCO not connected. Call client.connect() first.');
    }

    const resolvedChatId = this._resolveChatId(chatId);
    return await this._carriage.deleteMsg(resolvedChatId, logId);
  }

  /**
   * Modify a text message within 24 hours (MODIFYMSG).
   */
  async editMessage(chatId: number | string, target: any, text: string, opts: EditMessageOptions = {}) {
    const normalized = normalizeEditTarget(target);
    if (!normalized?.logId) {
      throw new Error('editMessage requires a logId or MessageEvent');
    }

    if (!this._carriage && !this._locoAutoConnectAttempted) {
      this._locoAutoConnectAttempted = true;
      try {
        await this.connect();
      } catch (err) {
        if (this.debug) {
          console.error('[DBG] LOCO auto-connect failed:', err.message);
        }
      }
    }

    if (!this._carriage) {
      throw new Error('LOCO not connected. Call client.connect() first.');
    }

    const type = typeof opts.type === 'number'
      ? opts.type
      : (normalized.type ?? MessageType.Text);
    let extra =
      opts.extra !== undefined
        ? (typeof opts.extra === 'string' ? opts.extra : buildExtra(opts.extra as any))
        : normalized.extra;
    if (extra === undefined) {
      extra = '{}';
    }
    const resolvedChatId = this._resolveChatId(chatId);
    return await this._carriage.modifyMsg(resolvedChatId, normalized.logId, text, {
      type,
      extra,
      supplement: opts.supplement,
    });
  }

  async _ensureVideoConf() {
    if (this._conf && hasTrailerProfile(this._conf)) {
      return this._conf;
    }
    const booking = new BookingClient();
    try {
      await booking.connect();
      const conf = await booking.getConf({
        userId: this.userId,
        os: this.os,
        mccmnc: this.mccmnc,
        appVer: this.appVer,
      });
      this._conf = conf;
      if (this.debugGetConf || this.debug) {
        const summary = summarizeTrailerKeys(conf?.raw);
        if (summary) {
          console.log('[DBG] GETCONF trailer keys:', JSON.stringify(summary));
        } else {
          console.log('[DBG] GETCONF trailer keys: none');
        }
        console.log('[DBG] GETCONF trailerInfo:', JSON.stringify({
          trailerInfo: conf?.trailerInfo || {},
          trailerHighInfo: conf?.trailerHighInfo || {},
        }));
      }
      return conf;
    } finally {
      booking.disconnect();
    }
  }

  async _getVideoProfile(quality: VideoQuality) {
    const conf = await this._ensureVideoConf();
    const trailerInfo = conf?.trailerInfo || {};
    const trailerHighInfo = conf?.trailerHighInfo || {};
    const highBitrate = Number(trailerHighInfo?.videoTranscodingBitrate || 0);
    const highResolution = Number(trailerHighInfo?.videoTranscodingResolution || 0);
    const base = quality === 'high' && highBitrate > 0 && highResolution > 0
      ? trailerHighInfo
      : trailerInfo;
    const bitrate = Number(base?.videoTranscodingBitrate || 0);
    const resolution = Number(base?.videoTranscodingResolution || 0);
    if (!bitrate || !resolution) {
      throw new Error('GETCONF missing trailerInfo. Cannot determine video transcode profile.');
    }
    return { bitrate, resolution };
  }

  async _transcodeVideo(filePath: string, opts: UploadOptions = {}) {
    const ffmpegPath = resolveFfmpegBinary('ffmpeg', {
      ffmpegPath: opts.ffmpegPath || this.ffmpegPath,
      ffprobePath: opts.ffprobePath || this.ffprobePath,
    });
    const ffprobePath = resolveFfmpegBinary('ffprobe', {
      ffmpegPath: opts.ffmpegPath || this.ffmpegPath,
      ffprobePath: opts.ffprobePath || this.ffprobePath,
    });
    assertBinaryAvailable(ffmpegPath, 'ffmpeg');
    assertBinaryAvailable(ffprobePath, 'ffprobe');

    const meta = probeVideo(filePath, ffprobePath);
    if (!meta.width || !meta.height) {
      throw new Error('ffprobe failed: no video stream');
    }

    const quality: VideoQuality = opts.videoQuality || this.videoQuality || 'high';
    const profile = await this._getVideoProfile(quality);
    const resolution = Number(opts.videoResolution) > 0 ? Number(opts.videoResolution) : profile.resolution;
    const targetSize = computeTargetVideoSize(meta, resolution);

    const targetBitrate = Number(opts.videoBitrate) > 0
      ? Number(opts.videoBitrate)
      : profile.bitrate;
    const sourceBitrate = meta.bitrate > 0 ? meta.bitrate : 0;
    const finalBitrate = sourceBitrate > 0 ? Math.min(sourceBitrate, targetBitrate) : targetBitrate;
    const bitrateK = Math.max(128, Math.round(finalBitrate / 1000));

    const tempDir = opts.tempDir || os.tmpdir();
    const outputPath = path.join(
      tempDir,
      `kakaoforge-video-${Date.now()}-${Math.random().toString(16).slice(2)}.mp4`
    );

    const codec = quality === 'high' ? 'libx265' : 'libx264';
    const args = [
      '-y',
      '-i', filePath,
      '-map', '0:v:0',
      '-map', '0:a?',
      '-c:v', codec,
      '-pix_fmt', 'yuv420p',
      '-vf', `scale=${targetSize.width}:${targetSize.height}:flags=lanczos,setsar=1`,
      '-r', '30',
      '-b:v', `${bitrateK}k`,
      '-maxrate', `${bitrateK}k`,
      '-bufsize', `${bitrateK * 2}k`,
      '-preset', 'medium',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ar', '44100',
      '-ac', '2',
      '-movflags', '+faststart',
      outputPath,
    ];

    await runProcess(ffmpegPath, args, opts.timeoutMs || 0);

    const cleanup = () => {
      if (opts.keepTemp) return;
      try {
        fs.unlinkSync(outputPath);
      } catch {
        // ignore
      }
    };

    return {
      path: outputPath,
      width: targetSize.width,
      height: targetSize.height,
      duration: meta.duration > 0 ? Math.round(meta.duration * 1000) : undefined,
      cleanup,
    };
  }

  async _uploadContactVCard(
    contact: ContactPayload,
    opts: AttachmentSendOptions = {},
    chatId?: number | string
  ) {
    if (!contact || !contact.name) {
      throw new Error('연락처 전송에는 name이 필요합니다.');
    }

    let filePath = contact.filePath || '';
    let cleanupTemp: (() => void) | null = null;
    if (!filePath) {
      const vcard = contact.vcard || buildVCard(contact);
      const tempDir = os.tmpdir();
      const safeName = contact.name.replace(/[\\/:*?"<>|]+/g, '_');
      filePath = path.join(tempDir, `kakaoforge-contact-${Date.now()}-${safeName || 'contact'}.vcf`);
      fs.writeFileSync(filePath, vcard, 'utf-8');
      cleanupTemp = () => {
        if ((opts as any).keepTemp) return;
        try {
          fs.unlinkSync(filePath);
        } catch {
          // ignore
        }
      };
    }

    let stat: fs.Stats;
    try {
      stat = fs.statSync(filePath);
    } catch {
      throw new Error(`file not found: ${filePath}`);
    }
    if (!stat.isFile()) {
      throw new Error(`not a file: ${filePath}`);
    }

    try {
      const res = await uploadMultipartFile({
        url: 'https://up-m.talk.kakao.com/upload',
        filePath,
        fieldName: 'attachment',
        filename: path.basename(filePath),
        mime: 'text/x-vcard',
        fields: {
          user_id: 0,
          attachment_type: 'text/x-vcard',
        },
        headers: {
          'Accept': '*/*',
          'Accept-Language': this.lang || 'ko',
          'User-Agent': buildUserAgent(this.appVer),
        },
        timeoutMs: opts.timeoutMs || 15000,
      });

      const bodyText = (res.body || '').trim();
      let rawPath = '';
      if (res.json && typeof res.json === 'object') {
        rawPath = String((res.json as any).path || (res.json as any).url || '');
      } else if (typeof res.json === 'string') {
        rawPath = res.json;
      } else {
        rawPath = bodyText;
      }
      rawPath = rawPath.trim();
      if (rawPath.startsWith('"') && rawPath.endsWith('"') && rawPath.length >= 2) {
        rawPath = rawPath.slice(1, -1);
      }
      if (!rawPath) {
        throw new Error(`contact upload failed: empty response`);
      }
      const key = rawPath.startsWith('/') ? rawPath.slice(1) : rawPath;
      return {
        name: contact.name,
        k: key,
        s: stat.size,
      };
    } finally {
      if (cleanupTemp) cleanupTemp();
    }
  }

  _profileHeaders(extra: Record<string, string> = {}) {
    return {
      'Authorization': buildAuthorizationHeader(this.oauthToken, this.deviceId || this.deviceUuid),
      'A': buildAHeader(this.appVer, this.lang),
      'User-Agent': buildUserAgent(this.appVer),
      'talk-agent': `${this.os}/${this.appVer}`,
      'talk-language': this.lang,
      ...extra,
    };
  }

  async _fetchProfileAttachment(userId: number | string) {
    if (!this.oauthToken || !this.deviceUuid) {
      throw new Error('프로필 조회에는 oauthToken/deviceUuid가 필요합니다.');
    }
    const idStr = String(userId);
    const candidates: string[] = [];
    if (Number(userId) === this.userId) {
      candidates.push('/android/profile3/me.json');
    }
    candidates.push(`/android/profile3/friend_info.json?id=${encodeURIComponent(idStr)}`);

    let lastError: Error | null = null;
    for (const path of candidates) {
      try {
        const res = await httpsGet(KATALK_HOST, path, this._profileHeaders());
        if (res?.status && res.status >= 400) {
          lastError = new Error(`프로필 조회 실패: status=${res.status}`);
          continue;
        }
        const body = res?.body;
        if (body && typeof body === 'object') {
          const status = (body as any).status;
          if (typeof status === 'number' && status !== 0) {
            lastError = new Error(`프로필 조회 실패: ${JSON.stringify(body)}`);
            continue;
          }
        }
        const extracted = extractProfileFromResponse(body, userId);
        return extracted;
      } catch (err) {
        lastError = err as Error;
      }
    }
    if (lastError) throw lastError;
    throw new Error('프로필 정보를 가져오지 못했습니다.');
  }

  async _uploadMedia(
    type: UploadMediaType,
    filePath: string,
    opts: UploadOptions = {},
    chatId?: number | string
  ): Promise<UploadResult> {
    if (!filePath) {
      throw new Error('filePath is required');
    }

    let cleanupTemp: (() => void) | null = null;
    if (type === 'video' && (opts.transcode ?? this.transcodeVideos)) {
      const transcode = await this._transcodeVideo(filePath, opts);
      filePath = transcode.path;
      cleanupTemp = transcode.cleanup;
      opts = {
        ...opts,
        mime: opts.mime || 'video/mp4',
        width: transcode.width ?? opts.width,
        height: transcode.height ?? opts.height,
        duration: transcode.duration ?? opts.duration,
      };
    }

    let result: UploadResult;
    try {
      let stat: fs.Stats;
      try {
        stat = fs.statSync(filePath);
      } catch (err) {
        throw new Error(`file not found: ${filePath}`);
      }
      if (!stat.isFile()) {
        throw new Error(`not a file: ${filePath}`);
      }

    const uploadChatId = chatId ?? opts.chatId;
    if (!uploadChatId) {
      throw new Error('chatId is required for LOCO upload. Use sendPhoto(chatId, path) or pass { chatId }.');
    }

    const msgId = opts.msgId !== undefined && opts.msgId !== null ? opts.msgId : this._nextClientMsgId();

    if (!this._carriage && !this._locoAutoConnectAttempted) {
      this._locoAutoConnectAttempted = true;
      try {
        await this.connect();
      } catch (err) {
        if (this.debug) {
          console.error('[DBG] LOCO auto-connect failed:', err.message);
        }
      }
    }

    if (!this._carriage) {
      throw new Error('LOCO not connected. Call client.connect() first.');
    }

    const logType = type === 'photo'
      ? MessageType.Photo
      : type === 'video'
        ? MessageType.Video
        : type === 'audio'
          ? MessageType.Audio
          : MessageType.File;

    const fallbackMime = type === 'photo'
      ? 'image/jpeg'
      : type === 'video'
        ? 'video/mp4'
        : type === 'audio'
          ? 'audio/mpeg'
          : 'application/octet-stream';
    const mime = opts.mime || guessMime(filePath, fallbackMime);

    let width = opts.width;
    let height = opts.height;
    if (type === 'photo' && (!width || !height)) {
      const size = readImageSize(filePath);
      if (size) {
        width = width || size.width;
        height = height || size.height;
      }
    }

    const checksum = (await sha1FileHex(filePath)).toLowerCase();
    const extRaw = path.extname(filePath);
    const ext = extRaw ? extRaw.replace('.', '').toLowerCase() : '';

    const shipBody: any = {
      c: toLong(uploadChatId),
      s: toLong(stat.size),
      t: logType,
      cs: checksum,
    };
    if (ext) shipBody.e = ext;
    if (opts.extra) shipBody.ex = opts.extra;

    const shipRes = await this._carriage.request('SHIP', shipBody, opts.timeoutMs || 10000);
    if (typeof shipRes.status === 'number' && shipRes.status !== 0) {
      throw new Error(`SHIP failed: status=${shipRes.status}`);
    }
    const shipBodyRes = shipRes?.body || {};
    const token = shipBodyRes.k || shipBodyRes.key || shipBodyRes.token;
    if (!token) {
      const preview = shipBodyRes ? JSON.stringify(shipBodyRes).slice(0, 400) : '(empty)';
      throw new Error(`SHIP response missing token: ${preview}`);
    }

    let host = shipBodyRes.vh || shipBodyRes.host || '';
    let port = Number(shipBodyRes.p || shipBodyRes.port || 0);
    if (!host || !port) {
      const trailerRes = await this._carriage.request('GETTRAILER', { k: token, t: logType }, opts.timeoutMs || 10000);
      if (typeof trailerRes.status === 'number' && trailerRes.status !== 0) {
        throw new Error(`GETTRAILER failed: status=${trailerRes.status}`);
      }
      const trailerBody = trailerRes?.body || {};
      host = host || trailerBody.vh || trailerBody.host || '';
      port = port || Number(trailerBody.p || trailerBody.port || 0);
    }

    if (!host || !port) {
      throw new Error('UPLOAD failed: no trailer host/port');
    }

    const uploadClient = new CarriageClient();
    uploadClient.on('error', (err) => {
      if (this.debug) {
        console.error('[DBG] Upload error:', err.message);
      }
    });
    let postRes: any = null;
    let completePacket: any = null;
    let completeWait: { promise: Promise<any>; cancel: () => void } | null = null;
    try {
      await uploadClient.connect(host, port, opts.timeoutMs || 10000, this.socketKeepAliveMs || 30000);
      const threadId = opts.threadId;
      let scope = opts.scope;
      if (scope === undefined && threadId) {
        scope = opts.sendToChatRoom === true ? 3 : 2;
      }
      const deviceType = Number(this.dtype);
      const silenceValue = opts.isSilence ?? opts.silence;
      const postBody: any = {
        k: token,
        s: toLong(stat.size),
        f: opts.filename || opts.name || path.basename(filePath),
        t: logType,
        c: toLong(uploadChatId),
        mid: toLong(1),
        ns: opts.noSeen ?? true,
        u: toLong(this.userId),
        os: this.os,
        av: this.appVer,
        nt: this.ntype,
        mm: this.mccmnc,
      };
      if (Number.isFinite(deviceType)) {
        postBody.dt = deviceType;
      }
      if (width) postBody.w = Math.floor(width);
      if (height) postBody.h = Math.floor(height);
      if (scope !== undefined) postBody.scp = scope;
      if (threadId) postBody.tid = toLong(threadId);
      if (opts.supplement) postBody.sp = String(opts.supplement);
      if (opts.featureStat) postBody.featureStat = String(opts.featureStat);
      if (typeof silenceValue === 'boolean') postBody.silence = silenceValue;
      const extraValue = typeof opts.extra === 'string' ? opts.extra : '';
      const captionValue =
        typeof (opts as any).text === 'string' && (opts as any).text.trim().length > 0
          ? String((opts as any).text)
          : '';
      if (extraValue) {
        postBody.ex = extraValue;
      } else if (captionValue) {
        postBody.ex = JSON.stringify({ cmt: captionValue });
      }

      completeWait = waitForPushMethod(uploadClient, 'COMPLETE', opts.timeoutMs || 20000);
      postRes = await uploadClient.request('POST', postBody, opts.timeoutMs || 10000);
      if (typeof postRes.status === 'number' && postRes.status !== 0) {
        throw new Error(`UPLOAD POST failed: status=${postRes.status}`);
      }
      const offset = safeNumber(postRes?.body?.o, 0);
      if (offset < stat.size) {
        await streamEncryptedFile(uploadClient, filePath, offset, stat.size, opts.onProgress);
      }
      completePacket = await completeWait.promise;
      const completeBody = completePacket?.body || {};
      if (typeof completeBody.status === 'number' && completeBody.status !== 0) {
        throw new Error(`UPLOAD COMPLETE failed: status=${completeBody.status}`);
      }
      await uploadClient.end();
    } finally {
      if (completeWait) completeWait.cancel();
      uploadClient.disconnect();
    }

    const postBodyRes = postRes?.body && typeof postRes.body === 'object' ? postRes.body : {};
    const shipKey = shipBodyRes?.k || shipBodyRes?.key || shipBodyRes?.token || token;
    const completeBody = completePacket?.body || {};
    const completeChatLog = completeBody.chatLog || completeBody.chatlog || null;
    const completeAttachment = completeChatLog
      ? parseAttachments(completeChatLog.attachment ?? completeChatLog.attachments ?? completeChatLog.extra ?? null)[0]
      : null;
    let attachment: Record<string, any> = {};
    if (type === 'video') {
      const tk = postBodyRes.tk || postBodyRes.token || '';
      if (tk) {
        attachment.tk = tk;
        attachment.k = shipKey;
        if (postBodyRes.tkh) attachment.tkh = postBodyRes.tkh;
        if (postBodyRes.urlh) attachment.urlh = postBodyRes.urlh;
      } else if (completeAttachment) {
        attachment = normalizeMediaAttachment(completeAttachment) || {};
        if (!attachment.k && shipKey) attachment.k = shipKey;
      } else {
        const preview = postBodyRes ? JSON.stringify(postBodyRes).slice(0, 400) : '(empty)';
        throw new Error(`UPLOAD POST missing video token: ${preview}`);
      }
    } else {
      attachment.k = shipKey;
    }

    attachment.cs = postBodyRes.cs || checksum;
    if (type === 'file') {
      attachment.s = postBodyRes.s ?? stat.size;
      attachment.name = postBodyRes.name || opts.name || opts.filename || path.basename(filePath);
      attachment.size = postBodyRes.size ?? stat.size;
      const mimeValue = postBodyRes.mt || postBodyRes.mime || mime;
      if (mimeValue) {
        attachment.mime = mimeValue;
      }
    } else {
      attachment.s = postBodyRes.s ?? stat.size;
      const mimeValue = postBodyRes.mt || mime;
      if (mimeValue) {
        attachment.mt = mimeValue;
      }
      const widthValue = postBodyRes.w ?? width;
      const heightValue = postBodyRes.h ?? height;
      if (widthValue) attachment.w = widthValue;
      if (heightValue) attachment.h = heightValue;
      if (postBodyRes.d ?? opts.duration) attachment.d = postBodyRes.d ?? opts.duration;
    }

    result = {
      accessKey: String(token),
      attachment,
      msgId,
        info: { ship: shipBodyRes, post: postRes?.body, complete: completeBody },
        raw: { ship: shipRes, post: postRes, complete: completePacket },
        chatLog: completeBody.chatLog,
        complete: completeBody,
      };
    } finally {
      if (cleanupTemp) cleanupTemp();
    }

    return result;
  }

  async uploadPhoto(filePath: string, opts: UploadOptions = {}) {
    return this._uploadMedia('photo', filePath, opts);
  }

  async uploadVideo(filePath: string, opts: UploadOptions = {}) {
    return this._uploadMedia('video', filePath, opts);
  }

  async uploadAudio(filePath: string, opts: UploadOptions = {}) {
    return this._uploadMedia('audio', filePath, opts);
  }

  async uploadFile(filePath: string, opts: UploadOptions = {}) {
    return this._uploadMedia('file', filePath, opts);
  }

  async _sendWithAttachment(
    chatId: number | string,
    type: number,
    text: string,
    attachment: AttachmentInput,
    opts: AttachmentSendOptions = {},
    label = 'attachment'
  ) {
    const extra = buildExtra(unwrapAttachment(attachment), opts.extra);
    if (!extra) {
      throw new Error(`${label} attachment is required. Upload first and pass attachment info.`);
    }
    const { text: _text, ...sendOpts } = opts;
    return this.sendMessage(chatId, text || '', { ...sendOpts, type, extra });
  }

  async _prepareMediaAttachment(
    type: UploadMediaType,
    attachment: AttachmentInput,
    opts: AttachmentSendOptions = {},
    chatId?: number | string
  ) {
    if (typeof attachment === 'string') {
      let stat: fs.Stats;
      try {
        stat = fs.statSync(attachment);
      } catch {
        throw new Error(`file not found: ${attachment}`);
      }
      if (!stat.isFile()) {
        throw new Error(`not a file: ${attachment}`);
      }
      return await this._uploadMedia(type, attachment, opts, chatId);
    }
    return attachment;
  }

  async sendText(chatId: number | string, text: string, opts: SendOptions = {}) {
    return this.sendMessage(chatId, text, MessageType.Text, opts);
  }

  async sendReply(
    chatId: number | string,
    text: string,
    replyTo: ReplyTarget | MessageEvent | any,
    opts: ReplyOptions = {}
  ) {
    const target = normalizeReplyTarget(replyTo);
    if (!target || !target.logId || !target.userId) {
      throw new Error('reply target requires logId/userId');
    }
    const attachment = buildReplyAttachment(target, opts);
    const extra = buildExtra(attachment, opts.extra);
    if (!extra) {
      throw new Error('reply attachment is required');
    }
    const { extra: _extra, attachOnly: _attachOnly, attachType: _attachType, ...sendOpts } = opts as ReplyOptions;
    return this.sendMessage(chatId, text, { ...sendOpts, type: MessageType.Reply, extra });
  }

  async sendThreadReply(
    chatId: number | string,
    threadId: number | string,
    text: string,
    opts: SendOptions = {}
  ) {
    const threadValue = Long.isLong(threadId) ? threadId : Long.fromString(String(threadId));
    let scope = typeof opts.scope === 'number' ? opts.scope : undefined;
    if (scope === undefined) {
      if (opts.sendToChatRoom === true) {
        scope = 3;
      } else {
        scope = 2;
      }
    }
    return this.sendMessage(chatId, text, {
      ...opts,
      type: MessageType.Text,
      threadId: threadValue,
      scope,
    });
  }

  async sendPhoto(chatId: number | string, attachment: AttachmentInput, opts: AttachmentSendOptions = {}) {
    const attachmentMsgId = typeof attachment === 'object' && attachment && 'msgId' in attachment
      ? (attachment as any).msgId
      : undefined;
    const msgId = opts.msgId !== undefined && opts.msgId !== null
      ? opts.msgId
      : (attachmentMsgId !== undefined ? attachmentMsgId : this._nextClientMsgId());
    const sendOpts = { ...opts, msgId };
    if (typeof attachment === 'string') {
      return this._uploadMedia('photo', attachment, sendOpts, chatId);
    }
    const prepared = await this._prepareMediaAttachment('photo', attachment, sendOpts, chatId);
    const normalized = normalizeMediaAttachment(unwrapAttachment(prepared));
    return this._sendWithAttachment(chatId, MessageType.Photo, opts.text || '', normalized, sendOpts, 'photo');
  }

  async sendPhotoAtThread(
    chatId: number | string,
    threadId: number | string,
    attachment: AttachmentInput,
    opts: AttachmentSendOptions = {}
  ) {
    const scope = typeof opts.scope === 'number'
      ? opts.scope
      : (opts.sendToChatRoom === true ? 3 : 2);
    return this.sendPhoto(chatId, attachment, { ...opts, threadId, scope });
  }

  async sendVideo(chatId: number | string, attachment: AttachmentInput, opts: AttachmentSendOptions = {}) {
    const attachmentMsgId = typeof attachment === 'object' && attachment && 'msgId' in attachment
      ? (attachment as any).msgId
      : undefined;
    const msgId = opts.msgId !== undefined && opts.msgId !== null
      ? opts.msgId
      : (attachmentMsgId !== undefined ? attachmentMsgId : this._nextClientMsgId());
    const sendOpts = { ...opts, msgId };
    if (typeof attachment === 'string') {
      return this._uploadMedia('video', attachment, sendOpts, chatId);
    }
    const prepared = await this._prepareMediaAttachment('video', attachment, sendOpts, chatId);
    const normalized = normalizeMediaAttachment(unwrapAttachment(prepared));
    return this._sendWithAttachment(chatId, MessageType.Video, opts.text || '', normalized, sendOpts, 'video');
  }

  async sendVideoAtThread(
    chatId: number | string,
    threadId: number | string,
    attachment: AttachmentInput,
    opts: AttachmentSendOptions = {}
  ) {
    const scope = typeof opts.scope === 'number'
      ? opts.scope
      : (opts.sendToChatRoom === true ? 3 : 2);
    return this.sendVideo(chatId, attachment, { ...opts, threadId, scope });
  }

  async sendAudio(chatId: number | string, attachment: AttachmentInput, opts: AttachmentSendOptions = {}) {
    const attachmentMsgId = typeof attachment === 'object' && attachment && 'msgId' in attachment
      ? (attachment as any).msgId
      : undefined;
    const msgId = opts.msgId !== undefined && opts.msgId !== null
      ? opts.msgId
      : (attachmentMsgId !== undefined ? attachmentMsgId : this._nextClientMsgId());
    const sendOpts = { ...opts, msgId };
    if (typeof attachment === 'string') {
      return this._uploadMedia('audio', attachment, sendOpts, chatId);
    }
    const prepared = await this._prepareMediaAttachment('audio', attachment, sendOpts, chatId);
    const normalized = normalizeMediaAttachment(unwrapAttachment(prepared));
    return this._sendWithAttachment(chatId, MessageType.Audio, opts.text || '', normalized, sendOpts, 'audio');
  }

  async sendAudioAtThread(
    chatId: number | string,
    threadId: number | string,
    attachment: AttachmentInput,
    opts: AttachmentSendOptions = {}
  ) {
    const scope = typeof opts.scope === 'number'
      ? opts.scope
      : (opts.sendToChatRoom === true ? 3 : 2);
    return this.sendAudio(chatId, attachment, { ...opts, threadId, scope });
  }

  async sendFile(chatId: number | string, attachment: AttachmentInput, opts: AttachmentSendOptions = {}) {
    const attachmentMsgId = typeof attachment === 'object' && attachment && 'msgId' in attachment
      ? (attachment as any).msgId
      : undefined;
    const msgId = opts.msgId !== undefined && opts.msgId !== null
      ? opts.msgId
      : (attachmentMsgId !== undefined ? attachmentMsgId : this._nextClientMsgId());
    const sendOpts = { ...opts, msgId };
    if (typeof attachment === 'string') {
      return this._uploadMedia('file', attachment, sendOpts, chatId);
    }
    const prepared = await this._prepareMediaAttachment('file', attachment, sendOpts, chatId);
    const normalized = normalizeFileAttachment(unwrapAttachment(prepared));
    return this._sendWithAttachment(chatId, MessageType.File, opts.text || '', normalized, sendOpts, 'file');
  }

  async sendFileAtThread(
    chatId: number | string,
    threadId: number | string,
    attachment: AttachmentInput,
    opts: AttachmentSendOptions = {}
  ) {
    const scope = typeof opts.scope === 'number'
      ? opts.scope
      : (opts.sendToChatRoom === true ? 3 : 2);
    return this.sendFile(chatId, attachment, { ...opts, threadId, scope });
  }

  async sendContact(chatId: number | string, contact: ContactPayload | AttachmentInput, opts: AttachmentSendOptions = {}) {
    const unwrapped = unwrapAttachment(contact);
    const normalized = normalizeContactAttachment(unwrapped);
    const fallbackText = typeof contact === 'string'
      ? contact
      : (contact && typeof contact === 'object' ? (contact as ContactPayload).name || '' : '');
    if (normalized && typeof normalized === 'object' && !Array.isArray(normalized)) {
      const contactUrl = (normalized as any).url || (normalized as any).path;
      if (contactUrl) {
        const attachment = normalizeContactAttachment({ ...(normalized as any), url: contactUrl });
        return this._sendWithAttachment(
          chatId,
          MessageType.Contact,
          opts.text || fallbackText || '',
          attachment,
          opts,
          'contact'
        );
      }
    }

    const payload: ContactPayload = typeof contact === 'string'
      ? { name: contact }
      : (contact as ContactPayload);
    const uploaded = await this._uploadContactVCard(payload, opts, chatId);
    const uploadedAttachment = normalizeContactAttachment({
      ...unwrapAttachment(uploaded),
      name: payload.name,
    });
    return this._sendWithAttachment(
      chatId,
      MessageType.Contact,
      opts.text || fallbackText || '',
      uploadedAttachment,
      opts,
      'contact'
    );
  }

  async sendKakaoProfile(chatId: number | string, profile: ProfilePayload | AttachmentInput, opts: AttachmentSendOptions = {}) {
    const unwrapped = unwrapAttachment(profile);
    const normalized = normalizeProfileAttachment(unwrapped);
    if (!normalized || typeof normalized !== 'object' || Array.isArray(normalized)) {
      throw new Error('카카오 프로필 전송에는 profile 정보가 필요합니다.');
    }
    const userId = (normalized as any).userId ?? (normalized as any).id;
    if (!userId) {
      throw new Error('카카오 프로필 전송에는 userId가 필요합니다.');
    }

    const hasAccessPermit = !!(normalized as any).accessPermit;
    const missingProfileFields = !(normalized as any).nickName
      || !(normalized as any).profileImageUrl
      || !(normalized as any).fullProfileImageUrl
      || !(normalized as any).statusMessage;
    let fetched: any = null;
    if ((!hasAccessPermit || missingProfileFields) && this.oauthToken && this.deviceUuid) {
      fetched = await this._fetchProfileAttachment(userId);
    }

    const attachment: any = {
      userId: Number(userId),
      nickName: (normalized as any).nickName || (normalized as any).nickname || fetched?.nickName || '',
      fullProfileImageUrl: (normalized as any).fullProfileImageUrl || fetched?.fullProfileImageUrl || '',
      profileImageUrl: (normalized as any).profileImageUrl || fetched?.profileImageUrl || '',
      statusMessage: (normalized as any).statusMessage || fetched?.statusMessage || '',
      accessPermit: String((normalized as any).accessPermit || fetched?.accessPermit || ''),
    };
    if (!attachment.accessPermit) {
      throw new Error('카카오 프로필 전송에는 accessPermit이 필요합니다.');
    }
    const fallbackText = attachment.nickName || '';
    return this._sendWithAttachment(
      chatId,
      MessageType.Profile,
      opts.text || fallbackText || '',
      attachment,
      opts,
      'profile'
    );
  }

  async sendLocation(chatId: number | string, location: LocationPayload | AttachmentInput, opts: AttachmentSendOptions = {}) {
    const normalized = normalizeLocationAttachment(location);
    const fallbackText = location && typeof location === 'object'
      ? ((location as LocationPayload).title || (location as LocationPayload).address || '')
      : '';
    return this._sendWithAttachment(
      chatId,
      MessageType.Location,
      opts.text || fallbackText || '',
      normalized,
      opts,
      'location'
    );
  }

  async sendSchedule(chatId: number | string, schedule: SchedulePayload | AttachmentInput, opts: AttachmentSendOptions = {}) {
    const normalized = normalizeScheduleAttachment(schedule);
    const fallbackText = schedule && typeof schedule === 'object'
      ? ((schedule as SchedulePayload).title || '')
      : '';

    if (typeof normalized === 'string') {
      return this._sendWithAttachment(
        chatId,
        MessageType.Schedule,
        opts.text || fallbackText || '',
        normalized,
        opts,
        'schedule'
      );
    }

    if (normalized && typeof normalized === 'object' && !Array.isArray(normalized)) {
      const hasId = normalized.postId || normalized.scheduleId;
      if (hasId) {
        return this._sendWithAttachment(
          chatId,
          MessageType.Schedule,
          opts.text || fallbackText || '',
          normalized,
          opts,
          'schedule'
        );
      }
    }

    if (!schedule || typeof schedule !== 'object') {
      throw new Error('일정 전송에는 일정 정보가 필요합니다.');
    }

    const payload = schedule as SchedulePayload;
    if (payload.eventAt === undefined || payload.eventAt === null) {
      throw new Error('일정 전송에는 eventAt이 필요합니다.');
    }
    if (!payload.title) {
      throw new Error('일정 전송에는 title이 필요합니다.');
    }

    let eventAtDate = toDate(payload.eventAt);
    if (!eventAtDate) {
      throw new Error('일정 전송: eventAt 형식이 올바르지 않습니다.');
    }
    eventAtDate = snapToFiveMinutes(eventAtDate, 'ceil');
    let endAtDate = payload.endAt ? toDate(payload.endAt) : new Date(eventAtDate.getTime() + 60 * 60 * 1000);
    if (!endAtDate) {
      throw new Error('일정 전송: endAt 형식이 올바르지 않습니다.');
    }
    endAtDate = snapToFiveMinutes(endAtDate, 'ceil');
    if (endAtDate.getTime() <= eventAtDate.getTime()) {
      endAtDate = snapToFiveMinutes(new Date(eventAtDate.getTime() + 60 * 60 * 1000), 'ceil');
    }

    const chatIdNum = safeNumber(chatId, 0);
    if (!chatIdNum) {
      throw new Error('일정 전송: chatId가 필요합니다.');
    }

    const calendar = this._getCalendarClient();
    const eventAtStr = formatCalendarDate(eventAtDate);
    const endAtStr = formatCalendarDate(endAtDate);
    let members = uniqueNumbers(payload.members);
    if (members.length === 0) {
      members = uniqueNumbers(await this._resolveChatMembers(chatIdNum));
    }
    if (this.userId) {
      members = uniqueNumbers([...members, this.userId]);
    }
    const timeZone = payload.timeZone || this.timeZone || resolveTimeZone();
    const referer = payload.referer || 'detail';

    const addEvent: any = {
      startAt: eventAtStr,
      endAt: endAtStr,
      subject: payload.title,
      members,
      allDay: !!payload.allDay,
      chatId: chatIdNum,
      timeZone,
      attendOn: true,
    };

    if (payload.location) {
      addEvent.location = typeof payload.location === 'string'
        ? { name: payload.location }
        : payload.location;
    }

    const alarmAtDate = payload.alarmAt ? toDate(payload.alarmAt) : null;
    const eventAtSec = Math.floor(eventAtDate.getTime() / 1000);
    const alarmAtSec = alarmAtDate ? Math.floor(alarmAtDate.getTime() / 1000) : undefined;
    if (alarmAtSec !== undefined && alarmAtSec <= eventAtSec) {
      const diffMin = Math.max(0, Math.round((eventAtSec - alarmAtSec) / 60));
      addEvent.alarmMin = [diffMin];
    }

    let refreshed = false;
    const runCalendar = async (fn: () => Promise<any>) => {
      let res = await fn();
      if (res?.status === 401 && !refreshed) {
        refreshed = true;
        await this.refreshAuth();
        if (this._calendar) {
          this._calendar.oauthToken = this.oauthToken;
        }
        res = await fn();
      }
      return res;
    };

    const createRes = await runCalendar(() => calendar.createEvent(addEvent, { referer }));
    assertCalendarOk(createRes, '일정 생성');
    const eId = extractEventId(createRes?.body);
    if (!eId) {
      throw new Error('일정 생성 실패: eId 없음');
    }

    const connectRes = await runCalendar(() => calendar.connectEvent(eId, chatIdNum, referer));
    assertCalendarOk(connectRes, '일정 연결');

    const shareRes = await runCalendar(() => calendar.shareMessage(eId, referer));
    assertCalendarOk(shareRes, '일정 공유');
    let attachment = extractShareMessageData(shareRes?.body);
    attachment = normalizeScheduleShareData(attachment);
    if (this.debug) {
      const sharePreview = previewCalendarBody(shareRes?.body, 1200);
      if (sharePreview) {
        console.log('[DBG] schedule shareMessage body:', sharePreview);
      }
      const extraPreview = buildExtra(attachment);
      if (extraPreview) {
        const max = 1200;
        const trimmed = extraPreview.length > max ? `${extraPreview.slice(0, max)}...` : extraPreview;
        console.log(`[DBG] schedule extra (${extraPreview.length}):`, trimmed);
      }
    }

    const scheduleIdCandidate = parseInt(String(eId).split('_')[0], 10);
    const scheduleId = Number.isFinite(scheduleIdCandidate) ? scheduleIdCandidate : undefined;
    const postId = Number.isFinite(scheduleIdCandidate) ? undefined : eId;

    attachment = ensureScheduleAttachment(attachment, {
      eventAt: eventAtSec,
      alarmAt: alarmAtSec,
      title: payload.title,
      subtype: payload.subtype ?? 1,
      scheduleId,
      postId,
    });

    if (payload.extra && typeof payload.extra === 'object' && attachment && typeof attachment === 'object' && !Array.isArray(attachment)) {
      attachment = { ...attachment, ...payload.extra };
    }

    const forceWrite = !!(opts as any).forceWrite;
    if (!forceWrite) {
      return {
        eventId: eId,
        share: shareRes?.body ?? shareRes,
        attachment,
      };
    }

    return this._sendWithAttachment(
      chatId,
      MessageType.Schedule,
      opts.text || payload.title || '',
      attachment,
      opts,
      'schedule'
    );
  }

  async sendLink(chatId: number | string, link: string | LinkPayload | AttachmentInput, opts: AttachmentSendOptions = {}) {
    if (typeof link === 'string') {
      const { text: _text, ...sendOpts } = opts;
      return this.sendMessage(chatId, link, MessageType.Text, sendOpts);
    }

    const normalized = normalizeLinkAttachment(link);
    const fallbackText = link && typeof link === 'object'
      ? ((link as LinkPayload).text || (link as LinkPayload).url || '')
      : '';
    const text = opts.text || fallbackText || '';
    const extra = buildExtra(normalized, opts.extra);

    if (!extra) {
      const { text: _text, extra: _extra, type, ...sendOpts } = opts;
      return this.sendMessage(chatId, text, MessageType.Text, sendOpts);
    }

    const { text: _text, ...sendOpts } = opts;
    return this.sendMessage(chatId, text, { ...sendOpts, type: MessageType.Link, extra });
  }

  async sendReaction(chatId: number | string, target: any, reactionType: ReactionTypeValue, opts: ReactionOptions = {}) {
    const resolvedChatId = this._resolveChatId(chatId);
    const targetInfo = normalizeReactionTarget(target);
    const logIdValue = normalizeIdValue(targetInfo?.logId ?? 0);
    if (!logIdValue || logIdValue === 0 || logIdValue === '0') {
      throw new Error('reaction target requires logId');
    }

    const typeValue = typeof reactionType === 'number' ? reactionType : parseInt(String(reactionType), 10);
    if (!Number.isFinite(typeValue)) {
      throw new Error('reactionType must be a number');
    }

    let linkIdValue: number | string | undefined;
    if (opts.linkId !== undefined && opts.linkId !== null && opts.linkId !== '') {
      linkIdValue = normalizeIdValue(opts.linkId);
    } else if (targetInfo?.linkId !== undefined && targetInfo?.linkId !== null && targetInfo?.linkId !== '') {
      linkIdValue = normalizeIdValue(targetInfo.linkId);
    }

    const roomKey = String(resolvedChatId);
    const roomInfo = this._chatRooms.get(roomKey);
    const isOpenChat = targetInfo?.isOpenChat ?? roomInfo?.isOpenChat ?? false;

    if (!linkIdValue && roomInfo?.openLinkId) {
      linkIdValue = normalizeIdValue(roomInfo.openLinkId);
    }

    if (!linkIdValue && isOpenChat) {
      await this._ensureOpenChatInfo(resolvedChatId);
      const refreshed = this._chatRooms.get(roomKey);
      if (refreshed?.openLinkId) {
        linkIdValue = normalizeIdValue(refreshed.openLinkId);
      }
    }

    if (isOpenChat && (!linkIdValue || linkIdValue === 0 || linkIdValue === '0')) {
      throw new Error('open chat reaction requires openLinkId');
    }

    const bubble = this._getBubbleClient();
    const payload: ReactionPayload = {
      logId: logIdValue,
      type: typeValue,
      reqId: opts.reqId ?? Date.now(),
    };
    if (linkIdValue && linkIdValue !== 0 && linkIdValue !== '0') {
      payload.linkId = linkIdValue;
    }

    const res = await bubble.sendReaction(resolvedChatId, payload);
    assertBubbleOk(res, '공감 전송');
    return res;
  }

  async openChatKick(chatId: number | string, target: any, opts: OpenChatKickOptions = {}) {
    if (!this._carriage) throw new Error('LOCO not connected');
    const resolvedChatId = this._resolveChatId(chatId);
    const targetInfo = normalizeOpenChatMemberTarget(target);
    if (!targetInfo?.memberId) {
      throw new Error('open chat kick requires memberId');
    }

    let linkIdValue: number | string | undefined;
    if (opts.linkId !== undefined && opts.linkId !== null && opts.linkId !== '') {
      linkIdValue = normalizeIdValue(opts.linkId);
    } else if (targetInfo.linkId !== undefined) {
      linkIdValue = normalizeIdValue(targetInfo.linkId);
    }

    const roomKey = String(resolvedChatId);
    const roomInfo = this._chatRooms.get(roomKey);
    const isOpenChat = targetInfo.isOpenChat ?? roomInfo?.isOpenChat ?? false;

    if (!linkIdValue && roomInfo?.openLinkId) {
      linkIdValue = normalizeIdValue(roomInfo.openLinkId);
    }

    if (!linkIdValue && isOpenChat) {
      await this._ensureOpenChatInfo(resolvedChatId);
      const refreshed = this._chatRooms.get(roomKey);
      if (refreshed?.openLinkId) {
        linkIdValue = normalizeIdValue(refreshed.openLinkId);
      }
    }

    if (!linkIdValue || linkIdValue === 0 || linkIdValue === '0') {
      throw new Error('open chat kick requires openLinkId');
    }

    return await this._carriage.kickMem({
      linkId: linkIdValue,
      chatId: resolvedChatId,
      memberId: targetInfo.memberId,
      reported: !!opts.report,
    });
  }

  async openChatBlind(chatId: number | string, target: any, opts: OpenChatBlindOptions = {}) {
    if (!this._carriage) throw new Error('LOCO not connected');
    const resolvedChatId = this._resolveChatId(chatId);
    const logIdValue = normalizeLogTarget(target);
    let targetInfo = normalizeOpenChatBlindTarget(target);
    if (logIdValue && (!targetInfo?.memberId || !targetInfo?.chatLogInfo)) {
      try {
        const fetched = await this.fetchMessage(resolvedChatId, logIdValue);
        const fetchedInfo = normalizeOpenChatBlindTarget(fetched);
        if (fetchedInfo) {
          targetInfo = { ...fetchedInfo, ...(targetInfo || {}) };
        }
      } catch (err) {
        if (this.debug) {
          console.error('[DBG] openChatBlind fetchMessage failed:', err instanceof Error ? err.message : String(err));
        }
      }
    }
    if (!targetInfo?.memberId) {
      throw new Error('open chat blind requires MessageEvent or raw chatLog');
    }
    const memberIdValue = normalizeIdValue(targetInfo.memberId);
    if (!memberIdValue) {
      throw new Error('open chat blind requires MessageEvent or raw chatLog');
    }

    let linkIdValue: number | string | undefined;
    if (opts.linkId !== undefined && opts.linkId !== null && opts.linkId !== '') {
      linkIdValue = normalizeIdValue(opts.linkId);
    } else if (targetInfo.linkId !== undefined) {
      linkIdValue = normalizeIdValue(targetInfo.linkId);
    }

    const roomKey = String(resolvedChatId);
    const roomInfo = this._chatRooms.get(roomKey);
    const isOpenChat = targetInfo.isOpenChat ?? roomInfo?.isOpenChat ?? false;

    if (!linkIdValue && roomInfo?.openLinkId) {
      linkIdValue = normalizeIdValue(roomInfo.openLinkId);
    }

    if (!linkIdValue && isOpenChat) {
      await this._ensureOpenChatInfo(resolvedChatId);
      const refreshed = this._chatRooms.get(roomKey);
      if (refreshed?.openLinkId) {
        linkIdValue = normalizeIdValue(refreshed.openLinkId);
      }
    }

    if (!linkIdValue || linkIdValue === 0 || linkIdValue === '0') {
      throw new Error('open chat blind requires openLinkId');
    }

    const chatLogInfo = opts.chatLogInfo ?? targetInfo.chatLogInfo;
    if (!chatLogInfo) {
      throw new Error('open chat blind requires chatLogInfo');
    }

    return await this._carriage.blind({
      linkId: linkIdValue,
      chatId: resolvedChatId,
      memberId: memberIdValue,
      report: !!opts.report,
      chatLogInfo,
      category: opts.category,
    });
  }

  _getCalendarClient() {
    if (this._calendar) return this._calendar;
    if (!this.oauthToken || !this.deviceUuid) {
      throw new Error('Calendar API requires oauthToken/deviceUuid');
    }
    const adid = this.adid || this.deviceUuid || '';
    this.adid = adid;
    this._calendar = new CalendarClient({
      oauthToken: this.oauthToken,
      deviceUuid: this.deviceUuid,
      deviceId: this.deviceId,
      appVer: this.appVer,
      lang: this.lang,
      os: this.os,
      timeZone: this.timeZone,
      hasAccount: this.hasAccount,
      adid,
      dtype: this.dtype,
    });
    return this._calendar;
  }

  _getBubbleClient() {
    if (this._bubble) return this._bubble;
    if (!this.oauthToken || !this.deviceUuid) {
      throw new Error('Bubble API requires oauthToken/deviceUuid');
    }
    const adid = this.adid || this.deviceUuid || '';
    this.adid = adid;
    this._bubble = new BubbleClient({
      oauthToken: this.oauthToken,
      deviceUuid: this.deviceUuid,
      deviceId: this.deviceId,
      appVer: this.appVer,
      lang: this.lang,
      os: this.os,
      timeZone: this.timeZone,
      hasAccount: this.hasAccount,
      adid,
      dtype: this.dtype,
    });
    return this._bubble;
  }

  async request(method, body = {}) {
    if (!this._carriage) throw new Error('LOCO not connected');
    return await this._carriage.request(method, body);
  }

  async refreshAuth() {
    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }

    const result = await refreshOAuthToken({
      refreshToken: this.refreshToken,
      accessToken: this.oauthToken,
      deviceUuid: this.deviceUuid,
      appVer: this.appVer,
    });

    this.oauthToken = result.accessToken;
    if (result.refreshToken) {
      this.refreshToken = result.refreshToken;
    }
    if (this._calendar) {
      this._calendar.oauthToken = this.oauthToken;
    }
    if (this._bubble) {
      this._bubble.oauthToken = this.oauthToken;
    }

    console.log('[+] Token refreshed');
    return result;
  }

  get connected() {
    return !!this._carriage?._socket;
  }

  get transport(): TransportMode {
    if (this._carriage?._socket) return 'loco';
    return null;
  }

  disconnect() {
    this._disconnectRequested = true;
    this._clearReconnectTimer();
    this._reconnectAttempt = 0;
    this._stopMemberRefresh();
    if (this._booking) this._booking.disconnect();
    if (this._carriage) this._carriage.disconnect();
    this.emit('disconnected');
  }
}

let _lastClient: KakaoForgeClient | null = null;

export function createClient(config: KakaoForgeConfig = {}) {
  let merged: KakaoForgeConfig = { ...config };
  const missingAuth = !merged.userId || !merged.oauthToken || !merged.deviceUuid;

  if (missingAuth) {
    const authPath = merged.authPath || path.join(process.cwd(), 'auth.json');
    let auth: AuthFile;
    try {
      auth = loadAuthFile(authPath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[!] ${msg}`);
      throw err;
    }

    const authConfig: KakaoForgeConfig = {};
    if (auth.userId !== undefined && auth.userId !== null && auth.userId !== '') {
      authConfig.userId = Number(auth.userId);
    }
    if (auth.accessToken || auth.oauthToken) {
      authConfig.oauthToken = auth.accessToken || auth.oauthToken;
    }
    if (auth.deviceUuid) {
      authConfig.deviceUuid = auth.deviceUuid;
    }
    if (auth.refreshToken) {
      authConfig.refreshToken = auth.refreshToken;
    }

    merged = { ...authConfig, ...merged };

    if (!merged.userId || !merged.oauthToken || !merged.deviceUuid) {
      const msg = 'auth.json is missing required fields (userId/accessToken/deviceUuid). Please re-authenticate.';
      console.error(`[!] ${msg}`);
      throw new Error(msg);
    }
  }

  const client = new KakaoForgeClient(merged);
  _lastClient = client;
  const autoConnect = merged.autoConnect !== false;
  if (autoConnect) {
    client.connect().catch((err) => {
      client.emit('error', err);
    });
  }
  return client;
}

export async function createAuthByQR({
  authPath,
  deviceUuid,
  deviceName,
  modelName,
  forced = false,
  checkAllowlist,
  enforceAllowlist,
  appVer,
  onQrUrl,
  onPasscode,
  save = true,
}: any = {}): Promise<AuthPayload> {
  const resolvedDeviceName = deviceName || DEFAULT_QR_MODEL_NAME;
  const resolvedModelName = modelName || DEFAULT_QR_MODEL_NAME;
  const handlers = buildQrLoginHandlers();
  const resolvedOnQrUrl = onQrUrl || handlers.onQrUrl;
  const resolvedOnPasscode = onPasscode || handlers.onPasscode;

  const loginResult = await qrLogin({
    deviceUuid,
    deviceName: resolvedDeviceName,
    modelName: resolvedModelName,
    forced,
    appVer,
    checkAllowlist,
    enforceAllowlist,
    onQrUrl: resolvedOnQrUrl,
    onPasscode: resolvedOnPasscode,
  });

  const payload: AuthPayload = {
    userId: loginResult.userId,
    accessToken: loginResult.accessToken,
    refreshToken: loginResult.refreshToken || '',
    deviceUuid: loginResult.deviceUuid || deviceUuid || '',
    savedAt: formatKstTimestamp(),
    raw: loginResult.raw,
  };

  if (save !== false) {
    const targetPath = authPath || path.join(process.cwd(), 'auth.json');
    fs.writeFileSync(targetPath, JSON.stringify(payload, null, 2), 'utf-8');
    payload.authPath = targetPath;
    console.log(`[+] Saved auth.json at ${targetPath}`);
  }

  return payload;
}

export function Mention(userId: number | string, nameOrChatId?: string | number, chatId?: number | string) {
  if (_lastClient) {
    return _lastClient._mention(userId, nameOrChatId, chatId);
  }
  const name = typeof nameOrChatId === 'string' ? nameOrChatId : String(userId);
  return buildMentionMarker(userId, name);
}

export function Spoiler(text: string) {
  return buildSpoilerMarker(text);
}

export const KakaoBot = KakaoForgeClient;

export { MessageType } from './types/message';
export { Reactions } from './types/reaction';

export type { MessageTypeValue } from './types/message';
export type { ReactionTypeValue } from './types/reaction';
export type KakaoBot = KakaoForgeClient;
