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
} from './auth/login';
import { nextClientMsgId } from './util/client-msg-id';
import { MessageType, type MessageTypeValue } from './types/message';
import { Reactions, type ReactionTypeValue } from './types/reaction';
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
    type: MemberType;
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

export type MemberType = number;

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
};

type AuthFile = {
  userId?: number | string;
  accessToken?: string;
  oauthToken?: string;
  deviceUuid?: string;
  refreshToken?: string;
  savedAt?: string;
};

function loadAuthFile(authPath: string): AuthFile {
  if (!fs.existsSync(authPath)) {
    throw new Error(`auth.json not found at ${authPath}. Run: node cli/qr.js or node cli/login.js`);
  }
  const raw = fs.readFileSync(authPath, 'utf-8');
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid auth.json at ${authPath}: ${err instanceof Error ? err.message : String(err)}`);
  }
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
  type?: MemberType;
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
  let message = chatLog.message ?? chatLog.msg ?? chatLog.text ?? '';
  if (isBlankText(message) && typeof attachmentRaw === 'string') {
    message = attachmentRaw;
  }
  message = truncateChatLogMessage(String(message ?? ''));

  const attachmentJson = parseAttachmentJson(attachmentRaw);
  const messageBody: any = {};
  if (!isBlankText(message)) {
    messageBody.message = message;
  }
  if (attachmentJson && (Array.isArray(attachmentJson) ? attachmentJson.length > 0 : Object.keys(attachmentJson).length > 0)) {
    messageBody.attachment = attachmentJson;
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
  type: MemberType;
  chat: ChatModule;
  autoReconnect: boolean;
  reconnectMinDelayMs: number;
  reconnectMaxDelayMs: number;
  memberCacheTtlMs: number;
  memberRefreshIntervalMs: number;
  memberLookupTimeoutMs: number;
  pingIntervalMs: number;
  socketKeepAliveMs: number;
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
  _memberRefreshTimer: NodeJS.Timeout | null;
  _messageChains: Map<string, Promise<void>>;
  _connectPromise: Promise<any> | null;
  _reconnectTimer: NodeJS.Timeout | null;
  _reconnectAttempt: number;
  _disconnectRequested: boolean;

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
    this._memberRefreshTimer = null;
    this._messageChains = new Map();
    this._connectPromise = null;
    this._reconnectTimer = null;
    this._reconnectAttempt = 0;
    this._disconnectRequested = false;

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

    // Step 1: QR code login to get OAuth token
    console.log('[*] Starting QR code login...');
    const loginResult = await qrLogin({
      deviceUuid: this.deviceUuid,
      deviceName,
      modelName,
      forced,
      appVer: this.appVer,
      checkAllowlist,
      enforceAllowlist,
      onQrUrl,
      onPasscode,
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

    this._carriage.on('push', (packet) => this._onPush(packet));
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

  _onPush(packet) {
    // Emit to specific push handlers
    const handler = this._pushHandlers.get(packet.method);
    if (handler) {
      handler(packet);
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

  _resolveMemberType(chatId: number | string, userId: number | string): MemberType {
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

    const msgId = opts.msgId !== undefined && opts.msgId !== null ? opts.msgId : this._nextClientMsgId();
    const writeOpts = {
      ...opts,
      msgId,
      noSeen: opts.noSeen ?? false,
      scope: typeof opts.scope === 'number' ? opts.scope : 1,
      silence: opts.silence ?? opts.isSilence ?? false,
    };

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
    return await this._carriage.write(resolvedChatId, text, msgType, writeOpts);
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
    const targetInfo = normalizeOpenChatBlindTarget(target);
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
  const autoConnect = merged.autoConnect !== false;
  if (autoConnect) {
    client.connect().catch((err) => {
      client.emit('error', err);
    });
  }
  return client;
}

export const KakaoBot = KakaoForgeClient;

export { MessageType } from './types/message';
export { Reactions } from './types/reaction';

export type { MessageTypeValue } from './types/message';
export type { ReactionTypeValue } from './types/reaction';
export type KakaoBot = KakaoForgeClient;
