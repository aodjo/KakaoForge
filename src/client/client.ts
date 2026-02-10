import { EventEmitter } from 'events';
import * as LosslessJSON from 'lossless-json';
import { Long } from 'bson';
import { BookingClient } from '../net/booking-client';
import { CarriageClient } from '../net/carriage-client';
import { TicketClient } from '../net/ticket-client';
import { CalendarClient } from '../net/calendar-client';
import { BubbleClient } from '../net/bubble-client';
import {
  subDeviceLogin,
  refreshOAuthToken,
  qrLogin,
  generateDeviceUuid,
  buildDeviceId,
  DEFAULT_QR_MODEL_NAME,
} from '../auth/login';
import { nextClientMsgId } from '../util/client-msg-id';

import {
  sleepMs,
  uniqueStrings,
  uniqueNumbers,
  toLong,
  safeNumber,
  previewLossless,
  normalizeIdValue,
  resolveTimeZone,
  parseAttachments,
  extractChatLogPayload,
  parseAttachmentJson,
  extractOpenLinkIdFromRaw,
  resolveRoomFlags,
  extractOpenLinkNameFromMr,
  MESSAGE_SENDER_CACHE_LIMIT,
  buildMentionMarker,
  buildSpoilerMarker,
  normalizeLogTarget,
  extractFeedPayload,
  extractMemberIdsFromPayload,
  extractFeedMemberIds,
  extractPushMemberIds,
  buildMemberNameMap,
  buildFeedMemberNameMap,
  extractActorIdFromPayload,
  DEFAULT_FEED_TYPE_MAP,
  resolveMemberActionFromPush,
  resolveDeleteActionFromPush,
  resolveHideActionFromPush,
  normalizeMemberAction,
  buildQrLoginHandlers,
} from '../utils';

import {
  type MemberTypeValue,
  type TransportMode,
  type MessageEvent,
  type MemberAction,
  type MemberEvent,
  type DeleteEvent,
  type HideEvent,
  type VideoQuality,
  type KakaoForgeConfig,
  type ChatModule,
  type ChatRoomInfo,
  type ChatListCursor,
  type MessageHandler,
  type MemberEventHandler,
  type DeleteEventHandler,
  type HideEventHandler,
  type MemberNameCache,
  type VoiceRoomMeta,
  type VoiceRoomJoinInfo,
  type VoiceRoomCurrentInfo,
  type VoiceRoomControlResult,
  type VoiceRoomRequestType,
  type VoiceRoomMetaEvent,
  type VoiceRoomLiveOnEvent,
  type VoiceRoomJoinableEvent,
  type VoiceRoomStartedEvent,
  type VoiceRoomEndedEvent,
  type VoiceRoomMembersEvent,
  type VoiceRoomNotifyEvent,
  type VoiceRoomResponseEvent,
  type VoiceRoomRoomInfoEvent,
  type VoiceRoomRemainTimeEvent,
  type VoiceRoomMicForcedEvent,
  type VoiceRoomReactionEvent,
  type VoiceRoomErrorEvent,
  type VoiceRoomRawEvent,
  type VoiceRoomEventHandler,
  resolveVoiceRoomNotifyType,
  resolveVoiceRoomRequestType,
  resolveVoiceRoomResponseCodeName,
} from '../types';

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
  _logIdAliases: Map<string, string>;
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
  _voiceRoomMetaCache: Map<string, VoiceRoomMeta>;
  _voiceRoomJoinableCache: Map<string, boolean>;
  _voiceRoomCurrent: VoiceRoomCurrentInfo;

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
    this._logIdAliases = new Map();
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
    this._voiceRoomMetaCache = new Map();
    this._voiceRoomJoinableCache = new Map();
    this._voiceRoomCurrent = {
      active: false,
      chatId: 0,
      callId: 0,
      source: 'internal',
    };

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
      voiceRoom: {
        getMeta: (chatId) => this.getVoiceRoomMeta(chatId),
        refreshMeta: (chatId) => this.refreshVoiceRoomMeta(chatId),
        isLiveOn: (chatId) => this.isVoiceRoomLiveOn(chatId),
        getJoinInfo: (chatId) => this.getVoiceRoomJoinInfo(chatId),
        getCurrent: () => this.getCurrentVoiceRoom(),
        join: (joinInfo, opts) => this.joinVoiceRoom(joinInfo, opts),
        leave: (opts) => this.leaveVoiceRoom(opts),
        requestSpeakerPermission: (opts) => this.requestVoiceRoomSpeakerPermission(opts),
        cancelSpeakerPermission: (opts) => this.cancelVoiceRoomSpeakerPermission(opts),
        acceptSpeakerInvitation: (opts) => this.acceptVoiceRoomSpeakerInvitation(opts),
        declineSpeakerInvitation: (opts) => this.declineVoiceRoomSpeakerInvitation(opts),
        acceptModeratorInvitation: (opts) => this.acceptVoiceRoomModeratorInvitation(opts),
        declineModeratorInvitation: (opts) => this.declineVoiceRoomModeratorInvitation(opts),
        inviteAsSpeaker: (userId, opts) => this.inviteVoiceRoomSpeaker(userId, opts),
        inviteAsModerator: (userId, opts) => this.inviteVoiceRoomModerator(userId, opts),
        authorizeSpeakerPermission: (userId, opts) => this.authorizeVoiceRoomSpeakerPermission(userId, opts),
        rejectSpeakerPermission: (userId, opts) => this.rejectVoiceRoomSpeakerPermission(userId, opts),
        revokeSpeakerPermission: (userId, opts) => this.revokeVoiceRoomSpeakerPermission(userId, opts),
        revokeModeratorPrivileges: (userId, opts) => this.revokeVoiceRoomModeratorPrivileges(userId, opts),
        setReqSpeakerPermissionEnabled: (enabled, opts) => this.setVoiceRoomReqSpeakerPermissionEnabled(enabled, opts),
        shareContent: (content, clear, opts) => this.shareVoiceRoomContent(content, clear, opts),
        changeTitle: (title, opts) => this.changeVoiceRoomTitle(title, opts),
        raiseHand: (opts) => this.raiseVoiceRoomHand(opts),
        lowerHand: (opts) => this.lowerVoiceRoomHand(opts),
        lowerHandOf: (userId, opts) => this.lowerVoiceRoomHandOf(userId, opts),
        setMyMicMuted: (muted, opts) => this.setVoiceRoomMyMicMuted(muted, opts),
        setSpeakerOutputMuted: (muted, opts) => this.setVoiceRoomSpeakerOutputMuted(muted, opts),
        turnOffRemoteMic: (userId, opts) => this.turnOffVoiceRoomRemoteMic(userId, opts),
        turnOffRemoteCamera: (userId, opts) => this.turnOffVoiceRoomRemoteCamera(userId, opts),
        sendReaction: (reaction, opts) => this.sendVoiceRoomReaction(reaction, opts),
        setVoiceFilter: (value, opts) => this.setVoiceRoomFilter(value, opts),
      },
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
    if (typeof chatId === 'number' && !Number.isSafeInteger(chatId)) {
      const approx = String(chatId);
      const aliased = this._chatIdAliases.get(approx);
      if (aliased) return aliased;
      // Fallback to approximate string instead of throwing
      return approx;
    }
    const normalized = normalizeIdValue(chatId);
    const key = String(normalized);
    return this._chatIdAliases.get(key) || normalized;
  }

  _recordLogAlias(chatId: number | string, logIdValue: number | string) {
    const idStr = typeof logIdValue === 'string' ? logIdValue : String(logIdValue);
    if (!/^\d+$/.test(idStr)) return;
    if (idStr.length < 16) return;
    const approx = safeNumber(idStr, 0);
    if (!approx) return;
    const approxStr = String(approx);
    const chatKey = String(normalizeIdValue(chatId));
    const aliasKey = `${chatKey}:${approxStr}`;
    if (approxStr !== idStr) {
      // LRU eviction: limit map size to 10000 entries
      if (this._logIdAliases.size >= 10000) {
        const firstKey = this._logIdAliases.keys().next().value;
        if (firstKey) this._logIdAliases.delete(firstKey);
      }
      this._logIdAliases.set(approxStr, idStr);
    }
  }

  _resolveLogId(chatId: number | string, logId: number | string) {
    const chatKey = String(normalizeIdValue(chatId));
    if (typeof logId === 'number' && !Number.isSafeInteger(logId)) {
      const approx = String(logId);
      const aliasKey = `${chatKey}:${approx}`;
      const aliased = this._logIdAliases.get(aliasKey);
      if (aliased) return aliased;
      // If the unsafe integer's string representation is a plain digit string,
      // treat that as the normalized logId instead of forcing callers to pass a string.
      if (/^\d+$/.test(approx)) {
        return approx;
      }
      throw new Error('logId exceeds Number.MAX_SAFE_INTEGER. Pass logId as string.');
    }
    const normalized = normalizeIdValue(logId);
    const key = String(normalized);
    const aliasKey = `${chatKey}:${key}`;
    return this._logIdAliases.get(aliasKey) || normalized;
  }

  _safeVoiceRoomBoolean(value: any) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
      const trimmed = value.trim().toLowerCase();
      return trimmed === 'true' || trimmed === '1' || trimmed === 'y' || trimmed === 'yes' || trimmed === 'on';
    }
    return false;
  }

  _parseVoiceRoomMetaCandidate(candidate: any, chatId: number | string): VoiceRoomMeta | null {
    if (candidate === undefined || candidate === null) return null;

    let parsed: any = candidate;
    if (typeof parsed === 'string') {
      const trimmed = parsed.trim();
      if (!trimmed) return null;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        return null;
      }
    }

    if (!parsed || typeof parsed !== 'object') return null;

    const hasVoiceKeys =
      parsed.liveon !== undefined ||
      parsed.liveOn !== undefined ||
      parsed.isLiveOn !== undefined ||
      parsed.callId !== undefined ||
      parsed.csIP !== undefined ||
      parsed.csIP6 !== undefined ||
      parsed.csPort !== undefined ||
      parsed.blind !== undefined ||
      parsed.url !== undefined ||
      parsed.title !== undefined ||
      parsed.voiceRoom !== undefined ||
      parsed.voiceroom !== undefined;

    if (!hasVoiceKeys) return null;

    const nested = parsed.voiceRoom || parsed.voiceroom || null;
    if (nested && typeof nested === 'object') {
      parsed = { ...parsed, ...nested };
    }

    const callIdValue = normalizeIdValue(parsed.callId || parsed.cid || parsed.callid || 0) || 0;
    const csPort = safeNumber(parsed.csPort ?? parsed.csport ?? parsed.port ?? 0, 0);
    const joinPort = safeNumber(parsed.joinPort ?? 0, 0) || (csPort > 0 ? csPort + 1 : 0);
    const hostV4 = typeof parsed.csIP === 'string' ? parsed.csIP : (typeof parsed.hostV4 === 'string' ? parsed.hostV4 : '');
    const hostV6 = typeof parsed.csIP6 === 'string' ? parsed.csIP6 : (typeof parsed.hostV6 === 'string' ? parsed.hostV6 : '');
    const title = typeof parsed.title === 'string'
      ? parsed.title
      : (typeof parsed.name === 'string' ? parsed.name : (typeof parsed.subject === 'string' ? parsed.subject : ''));

    return {
      chatId,
      liveOn: this._safeVoiceRoomBoolean(parsed.liveon ?? parsed.liveOn ?? parsed.isLiveOn),
      callId: callIdValue,
      title: title || undefined,
      blind: this._safeVoiceRoomBoolean(parsed.blind),
      hostV4: hostV4 || undefined,
      hostV6: hostV6 || undefined,
      csPort: csPort > 0 ? csPort : undefined,
      joinPort: joinPort > 0 ? joinPort : undefined,
      url: typeof parsed.url === 'string' && parsed.url ? parsed.url : undefined,
      raw: parsed,
    };
  }

  _extractVoiceRoomMetaFromChat(chat: any, chatId: number | string): VoiceRoomMeta | null {
    if (!chat || typeof chat !== 'object') return null;

    const candidates: any[] = [];
    const pushCandidate = (value: any) => {
      if (value === undefined || value === null) return;
      candidates.push(value);
    };

    pushCandidate(chat.voiceRoom);
    pushCandidate(chat.voiceroom);
    pushCandidate(chat.voiceRoomMeta);
    pushCandidate(chat.meta);
    pushCandidate(chat.chatMeta?.content ?? chat.chatMeta);

    if (Array.isArray(chat.chatMetas)) {
      for (const meta of chat.chatMetas) {
        pushCandidate(meta?.content ?? meta);
      }
    }

    let best: VoiceRoomMeta | null = null;
    let bestScore = -1;

    const scoreMeta = (meta: VoiceRoomMeta) => {
      let score = 0;
      if (meta.liveOn) score += 2;
      if (meta.callId && String(meta.callId) !== '0') score += 2;
      if (meta.hostV4 || meta.hostV6) score += 1;
      if (meta.csPort || meta.joinPort) score += 1;
      return score;
    };

    for (const candidate of candidates) {
      const parsed = this._parseVoiceRoomMetaCandidate(candidate, chatId);
      if (!parsed) continue;
      const score = scoreMeta(parsed);
      if (!best || score > bestScore) {
        best = parsed;
        bestScore = score;
      }
    }

    if (!best) return null;

    if (!best.title) {
      const fallbackTitle = this._extractTitle(chat);
      if (fallbackTitle) best.title = fallbackTitle;
    }

    return best;
  }

  _isSameVoiceRoomMeta(a: VoiceRoomMeta | null, b: VoiceRoomMeta | null) {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return (
      String(a.chatId) === String(b.chatId) &&
      !!a.liveOn === !!b.liveOn &&
      String(a.callId || 0) === String(b.callId || 0) &&
      String(a.title || '') === String(b.title || '') &&
      !!a.blind === !!b.blind &&
      String(a.hostV4 || '') === String(b.hostV4 || '') &&
      String(a.hostV6 || '') === String(b.hostV6 || '') &&
      safeNumber(a.csPort || 0, 0) === safeNumber(b.csPort || 0, 0) &&
      safeNumber(a.joinPort || 0, 0) === safeNumber(b.joinPort || 0, 0) &&
      String(a.url || '') === String(b.url || '')
    );
  }

  _isVoiceRoomJoinableMeta(meta: VoiceRoomMeta | null) {
    if (!meta || !meta.liveOn) return false;
    const hasCallId = !!meta.callId && String(meta.callId) !== '0';
    const hasHost = !!(meta.hostV4 || meta.hostV6);
    const port = safeNumber(meta.joinPort || meta.csPort || 0, 0);
    return hasCallId && hasHost && port > 0;
  }

  _getVoiceRoomJoinInfoFromMeta(meta: VoiceRoomMeta | null): VoiceRoomJoinInfo | null {
    if (!this._isVoiceRoomJoinableMeta(meta) || !meta) return null;
    const port = safeNumber(meta.joinPort || meta.csPort || 0, 0);
    if (port <= 0) return null;
    return {
      chatId: meta.chatId,
      callId: meta.callId,
      hostV4: meta.hostV4 || '',
      hostV6: meta.hostV6 || '',
      port,
      title: meta.title,
      blind: meta.blind,
    };
  }

  _getVoiceRoomMetaFromCache(chatId: number | string): VoiceRoomMeta | null {
    const key = String(this._resolveChatId(chatId));
    const meta = this._voiceRoomMetaCache.get(key);
    if (!meta) return null;
    return { ...meta };
  }

  _getCurrentVoiceRoomState(): VoiceRoomCurrentInfo {
    return { ...this._voiceRoomCurrent };
  }

  _emitVoiceRoomEvent(eventName: string, event: any) {
    this.emit(eventName, this.chat, event);
  }

  _emitVoiceRoomMetaDelta(
    chatId: number | string,
    previousMeta: VoiceRoomMeta | null,
    nextMeta: VoiceRoomMeta | null,
    raw: any = null,
    source: 'loco' | 'vox' | 'internal' = 'loco'
  ) {
    const prevLiveOn = !!previousMeta?.liveOn;
    const nextLiveOn = !!nextMeta?.liveOn;
    const prevJoinable = this._isVoiceRoomJoinableMeta(previousMeta);
    const nextJoinable = this._isVoiceRoomJoinableMeta(nextMeta);
    const callId = normalizeIdValue(nextMeta?.callId || previousMeta?.callId || 0) || 0;

    if (!this._isSameVoiceRoomMeta(previousMeta, nextMeta)) {
      if (nextMeta) {
        const metaEvent: VoiceRoomMetaEvent = {
          at: Date.now(),
          source,
          room: { chatId, callId },
          meta: { ...nextMeta },
          raw,
        };
        this._emitVoiceRoomEvent('voiceroom:meta', metaEvent);
      }
    }

    if (prevLiveOn !== nextLiveOn) {
      const liveOnEvent: VoiceRoomLiveOnEvent = {
        at: Date.now(),
        source,
        room: { chatId, callId },
        liveOn: nextLiveOn,
        previousLiveOn: prevLiveOn,
        meta: nextMeta ? { ...nextMeta } : null,
        raw,
      };
      this._emitVoiceRoomEvent('voiceroom:liveon', liveOnEvent);

      if (!prevLiveOn && nextLiveOn) {
        const startedEvent: VoiceRoomStartedEvent = {
          at: Date.now(),
          source,
          room: { chatId, callId },
          trigger: 'liveon',
          raw,
        };
        this._emitVoiceRoomEvent('voiceroom:started', startedEvent);
      } else if (prevLiveOn && !nextLiveOn) {
        if (String(this._voiceRoomCurrent.chatId || 0) === String(chatId || 0)) {
          this._voiceRoomCurrent = {
            active: false,
            chatId: 0,
            callId: 0,
            source: 'internal',
          };
        }
        const endedEvent: VoiceRoomEndedEvent = {
          at: Date.now(),
          source,
          room: { chatId, callId },
          reason: 'liveoff',
          raw,
        };
        this._emitVoiceRoomEvent('voiceroom:ended', endedEvent);
      }
    }

    if (prevJoinable !== nextJoinable) {
      const joinableEvent: VoiceRoomJoinableEvent = {
        at: Date.now(),
        source,
        room: { chatId, callId },
        joinable: nextJoinable,
        previousJoinable: prevJoinable,
        joinInfo: this._getVoiceRoomJoinInfoFromMeta(nextMeta),
        meta: nextMeta ? { ...nextMeta } : null,
        raw,
      };
      this._emitVoiceRoomEvent('voiceroom:joinable', joinableEvent);
    }
  }

  _updateVoiceRoomMetaCache(chat: any, chatId: number | string, source: 'loco' | 'vox' | 'internal' = 'loco') {
    const key = String(chatId);
    const previous = this._voiceRoomMetaCache.get(key) || null;
    const hasMetaSource =
      chat?.meta !== undefined ||
      chat?.chatMeta !== undefined ||
      chat?.chatMetas !== undefined ||
      chat?.voiceRoom !== undefined ||
      chat?.voiceroom !== undefined ||
      chat?.voiceRoomMeta !== undefined;

    const next = this._extractVoiceRoomMetaFromChat(chat, chatId);
    if (next) {
      this._voiceRoomMetaCache.set(key, next);
      this._voiceRoomJoinableCache.set(key, this._isVoiceRoomJoinableMeta(next));
    } else if (hasMetaSource) {
      this._voiceRoomMetaCache.delete(key);
      this._voiceRoomJoinableCache.delete(key);
    } else {
      return previous;
    }

    const finalMeta = next || null;
    this._emitVoiceRoomMetaDelta(chatId, previous, finalMeta, chat, source);
    return finalMeta;
  }

  _resolveVoiceRoomControlContext(context: any = {}) {
    const current = this._getCurrentVoiceRoomState();
    const chatId = normalizeIdValue(
      context.chatId ??
      context.roomId ??
      context.chatRoomId ??
      context.c ??
      context.joinInfo?.chatId ??
      current.chatId ??
      0
    ) || 0;

    let callId = normalizeIdValue(
      context.callId ??
      context.callIdx ??
      context.cid ??
      context.joinInfo?.callId ??
      current.callId ??
      0
    ) || 0;

    if ((!callId || String(callId) === '0') && chatId) {
      const meta = this._getVoiceRoomMetaFromCache(chatId);
      const joinInfo = this._getVoiceRoomJoinInfoFromMeta(meta);
      const fallbackCallId = normalizeIdValue(joinInfo?.callId || meta?.callId || 0) || 0;
      if (fallbackCallId && String(fallbackCallId) !== '0') {
        callId = fallbackCallId;
      }
    }

    const targetUserId = normalizeIdValue(
      context.targetUserId ??
      context.destUserId ??
      context.destId ??
      context.memberId ??
      context.subjectUserId ??
      0
    ) || 0;

    return { chatId, callId, targetUserId };
  }

  _buildVoiceRoomControlPayload(
    requestType: VoiceRoomRequestType | string,
    context: any = {},
    payload: any = {}
  ) {
    const room = this._resolveVoiceRoomControlContext(context);
    const normalizedRequestType = resolveVoiceRoomRequestType(requestType);
    const body: any = { ...payload };

    if (body.requestType === undefined) body.requestType = normalizedRequestType;
    if (body.reqType === undefined) body.reqType = normalizedRequestType;
    if (body.actionType === undefined) body.actionType = normalizedRequestType;

    if (body.chatId === undefined) body.chatId = room.chatId;
    if (body.c === undefined) body.c = room.chatId;
    if (body.roomId === undefined) body.roomId = room.chatId;
    if (body.chatRoomId === undefined) body.chatRoomId = room.chatId;

    if (body.callId === undefined) body.callId = room.callId;
    if (body.callIdx === undefined) body.callIdx = room.callId;
    if (body.cid === undefined) body.cid = room.callId;

    if (body.me === undefined) body.me = this.userId || 0;
    if (body.userId === undefined && room.targetUserId) body.userId = room.targetUserId;
    if (body.userID === undefined && room.targetUserId) body.userID = room.targetUserId;
    if (body.destUserId === undefined && room.targetUserId) body.destUserId = room.targetUserId;
    if (body.destId === undefined && room.targetUserId) body.destId = room.targetUserId;

    const longKeys = [
      'chatId',
      'c',
      'roomId',
      'chatRoomId',
      'callId',
      'callIdx',
      'cid',
      'userId',
      'userID',
      'me',
      'destUserId',
      'destId',
      'targetUserId',
      'shareUserId',
      'titleUserID',
      'titleUserId',
    ];

    for (const key of longKeys) {
      if (body[key] === undefined || body[key] === null || body[key] === '') continue;
      body[key] = toLong(body[key]);
    }

    if (body.enabled !== undefined) body.enabled = !!body.enabled;
    if (body.enable !== undefined) body.enable = !!body.enable;
    if (body.clear !== undefined) body.clear = !!body.clear;
    if (body.muted !== undefined) body.muted = !!body.muted;
    if (body.micMute !== undefined) body.micMute = !!body.micMute;
    if (body.audioMute !== undefined) body.audioMute = !!body.audioMute;
    if (body.micOn !== undefined) body.micOn = !!body.micOn;
    if (body.camOn !== undefined) body.camOn = !!body.camOn;
    if (body.audioMute === undefined && body.muted !== undefined) body.audioMute = !!body.muted;
    if (body.micMute === undefined && body.muted !== undefined) body.micMute = !!body.muted;

    if (body.control !== undefined) body.control = String(body.control);
    if (body.content !== undefined) body.content = String(body.content);
    if (body.title !== undefined) body.title = String(body.title);
    if (body.femo !== undefined) body.femo = String(body.femo);

    if (body.type !== undefined) body.type = safeNumber(body.type, 0);
    if (body.value !== undefined && typeof body.value !== 'string') body.value = safeNumber(body.value, 0);
    if (body.voiceFilter !== undefined) body.voiceFilter = safeNumber(body.voiceFilter, 0);
    if (body.filter !== undefined) body.filter = safeNumber(body.filter, 0);
    if (body.aFilter !== undefined) body.aFilter = safeNumber(body.aFilter, 0);

    return body;
  }

  _voiceRoomControlLocalSuccess(requestType: VoiceRoomRequestType | string, context: any = {}): VoiceRoomControlResult {
    const now = Date.now();
    const room = this._resolveVoiceRoomControlContext(context);
    const code = 0;
    const codeName = resolveVoiceRoomResponseCodeName(code);
    const normalizedRequestType = resolveVoiceRoomRequestType(requestType);

    const responseEvent: VoiceRoomResponseEvent = {
      at: now,
      source: 'internal',
      room: { chatId: room.chatId, callId: room.callId },
      requestType: normalizedRequestType,
      code,
      codeName,
      ok: true,
      targetUserId: room.targetUserId || undefined,
      raw: context.raw ?? context,
    };
    this._emitVoiceRoomEvent('voiceroom:response', responseEvent);

    return {
      ok: true,
      requestType: normalizedRequestType,
      code,
      codeName,
      message: context.message ? String(context.message) : undefined,
      raw: context.raw ?? context,
    };
  }

  async _requestVoiceRoomControl(
    requestType: VoiceRoomRequestType | string,
    methodCandidates: string[] = [],
    payload: any = {},
    context: any = {}
  ): Promise<VoiceRoomControlResult> {
    const normalizedRequestType = resolveVoiceRoomRequestType(requestType);
    const room = this._resolveVoiceRoomControlContext({ ...context, ...payload });
    const timeoutMs = safeNumber(context.timeoutMs ?? payload.timeoutMs ?? 10000, 10000) || 10000;

    const rawMethodOverrides = Array.isArray(context.methods)
      ? context.methods
      : (Array.isArray(payload.methods) ? payload.methods : []);
    const normalizedMethods = uniqueStrings([...(methodCandidates || []), ...(rawMethodOverrides || [])])
      .map((method) => String(method || '').trim().toUpperCase())
      .filter((method) => method.length > 0)
      .map((method) => method.length > 11 ? method.slice(0, 11) : method);

    if (normalizedMethods.length === 0) {
      return this._voiceRoomControlUnavailable(normalizedRequestType, {
        ...room,
        reason: 'No voice-room control method candidates provided.',
        raw: { payload, context },
      });
    }

    if (!this._carriage && !this._locoAutoConnectAttempted) {
      this._locoAutoConnectAttempted = true;
      try {
        await this.connect();
      } catch (err: any) {
        if (this.debug) {
          console.error('[DBG] LOCO auto-connect failed (voice-room control):', err?.message || String(err));
        }
      }
    }

    if (!this._carriage) {
      return this._voiceRoomControlUnavailable(normalizedRequestType, {
        ...room,
        reason: 'LOCO not connected. Call client.connect() first.',
        raw: { payload, context, methods: normalizedMethods },
      });
    }

    const attempts: any[] = [];
    let selectedPacket: any = null;
    let selectedMethod = '';
    let selectedCode = -9999;
    let selectedRequestBody: any = null;
    let recognized = false;
    let lastError: any = null;

    for (const method of normalizedMethods) {
      const requestBody = this._buildVoiceRoomControlPayload(normalizedRequestType, { ...context, ...room }, payload);
      try {
        const packet = await this._carriage.request(method, requestBody, timeoutMs);
        const responseBody = packet?.body || {};
        const codeFromBody = safeNumber(
          responseBody.responseCode ??
          responseBody.resCode ??
          responseBody.vcsResponseCode ??
          responseBody.code,
          NaN
        );
        const codeFromStatus = safeNumber(packet?.status, NaN);
        const code = Number.isFinite(codeFromBody)
          ? codeFromBody
          : (Number.isFinite(codeFromStatus) ? codeFromStatus : -9999);

        const hasBody = !!responseBody && typeof responseBody === 'object' && Object.keys(responseBody).length > 0;
        const looksVoiceRoomBody =
          responseBody.responseCode !== undefined ||
          responseBody.resCode !== undefined ||
          responseBody.vcsResponseCode !== undefined ||
          responseBody.reqSpkPermitEnable !== undefined ||
          responseBody.eventType !== undefined ||
          responseBody.notifyType !== undefined ||
          responseBody.remainTime !== undefined ||
          responseBody.femo !== undefined ||
          responseBody.spkRequestors !== undefined;
        const looksRecognized = looksVoiceRoomBody || Number.isFinite(codeFromBody) || codeFromStatus === 0 || hasBody;

        attempts.push({
          method,
          status: packet?.status,
          code,
          recognized: looksRecognized,
        });

        selectedPacket = packet;
        selectedMethod = method;
        selectedCode = code;
        selectedRequestBody = requestBody;
        if (looksRecognized) {
          recognized = true;
          break;
        }
      } catch (err: any) {
        lastError = err;
        attempts.push({
          method,
          error: err?.message || String(err),
        });
      }
    }

    if (!selectedPacket) {
      return this._voiceRoomControlUnavailable(normalizedRequestType, {
        ...room,
        reason: lastError?.message || 'Voice-room control request failed.',
        raw: { payload, context, methods: normalizedMethods, attempts },
      });
    }

    const responseBody = selectedPacket?.body || {};
    const responseChatId = normalizeIdValue(
      responseBody.chatId ?? responseBody.c ?? room.chatId ?? 0
    ) || room.chatId || 0;
    const responseCallId = normalizeIdValue(
      responseBody.callId ?? responseBody.callIdx ?? responseBody.cid ?? room.callId ?? 0
    ) || room.callId || 0;
    const responseRequestType = resolveVoiceRoomRequestType(
      responseBody.requestType ?? responseBody.reqType ?? responseBody.actionType ?? normalizedRequestType
    );
    const codeName = resolveVoiceRoomResponseCodeName(selectedCode);
    const ok = selectedCode === 0;

    const responseRaw = {
      method: selectedMethod,
      packet: selectedPacket,
      requestBody: selectedRequestBody,
      attempts,
      recognized,
    };

    const responseEvent: VoiceRoomResponseEvent = {
      at: Date.now(),
      source: 'loco',
      room: { chatId: responseChatId, callId: responseCallId },
      requestType: responseRequestType,
      code: selectedCode,
      codeName,
      ok,
      targetUserId: room.targetUserId || undefined,
      raw: responseRaw,
    };
    this._emitVoiceRoomEvent('voiceroom:response', responseEvent);

    if (!ok) {
      const message = String(
        responseBody.message ||
        responseBody.error ||
        `Voice-room control failed (${selectedMethod}, code=${selectedCode})`
      );
      const errorEvent: VoiceRoomErrorEvent = {
        at: Date.now(),
        source: 'loco',
        room: { chatId: responseChatId, callId: responseCallId },
        requestType: responseRequestType,
        code: selectedCode,
        message,
        raw: responseRaw,
      };
      this._emitVoiceRoomEvent('voiceroom:error', errorEvent);
    }

    if (ok && responseRequestType === 'JOIN') {
      this._voiceRoomCurrent = {
        active: true,
        chatId: responseChatId || room.chatId,
        callId: responseCallId || room.callId,
        joinedAt: Date.now(),
        source: 'loco',
      };
    } else if (ok && responseRequestType === 'LEAVE') {
      this._voiceRoomCurrent = {
        active: false,
        chatId: 0,
        callId: 0,
        source: 'internal',
      };
    }

    return {
      ok,
      requestType: responseRequestType,
      code: selectedCode,
      codeName,
      message: !ok
        ? String(responseBody.message || responseBody.error || `Voice-room control failed (${selectedMethod})`)
        : undefined,
      raw: responseRaw,
    };
  }

  _voiceRoomControlUnavailable(requestType: VoiceRoomRequestType | string, context: any = {}): VoiceRoomControlResult {
    const now = Date.now();
    const room = this._resolveVoiceRoomControlContext(context);
    const chatId = room.chatId;
    const callId = room.callId;
    const message = context.reason || 'Voice-room control request is unavailable.';
    const code = -9999;
    const codeName = resolveVoiceRoomResponseCodeName(code);
    const normalizedRequestType = resolveVoiceRoomRequestType(requestType);

    const responseEvent: VoiceRoomResponseEvent = {
      at: now,
      source: 'internal',
      room: { chatId, callId },
      requestType: normalizedRequestType,
      code,
      codeName,
      ok: false,
      raw: context.raw ?? context,
    };
    this._emitVoiceRoomEvent('voiceroom:response', responseEvent);

    const errorEvent: VoiceRoomErrorEvent = {
      at: now,
      source: 'internal',
      room: { chatId, callId },
      requestType: normalizedRequestType,
      code,
      message,
      raw: context.raw ?? context,
    };
    this._emitVoiceRoomEvent('voiceroom:error', errorEvent);

    return {
      ok: false,
      requestType: normalizedRequestType,
      code,
      codeName,
      message,
      raw: context.raw ?? context,
    };
  }

  _toVoiceRoomUserList(input: any, role: 'moderator' | 'speaker' | 'listener') {
    const source = Array.isArray(input) ? input : (input && typeof input === 'object' ? Object.values(input) : []);
    const users: any[] = [];
    for (const item of source as any[]) {
      if (!item || typeof item !== 'object') continue;
      const userId = normalizeIdValue(item.userID || item.userId || item.id || 0) || 0;
      if (!userId) continue;
      users.push({
        userId,
        role,
        micOn: typeof item.bMicOn === 'boolean' ? item.bMicOn : (typeof item.micOn === 'boolean' ? item.micOn : undefined),
        camOn: typeof item.bCamOn === 'boolean' ? item.bCamOn : (typeof item.camOn === 'boolean' ? item.camOn : undefined),
        handUp: typeof item.handsUp === 'boolean' ? item.handsUp : (typeof item.handUp === 'boolean' ? item.handUp : undefined),
        muted: typeof item.isMute === 'boolean' ? item.isMute : undefined,
        voiceFilter: safeNumber(item.voiceFilter?.value ?? item.voiceFilter ?? 0, 0),
        raw: item,
      });
    }
    return users;
  }

  _emitVoiceRoomEventsFromPush(packet: any) {
    if (!packet || typeof packet !== 'object') return;

    const method = String(packet.method || '');
    const methodUpper = method.toUpperCase();
    const body = packet.body || {};
    const roomPayload = body.chatInfo || body.chat || body.chatData || body.chatRoom || body;
    const roomChatId = normalizeIdValue(
      roomPayload?.chatId || roomPayload?.c || body.chatId || body.c || body.roomId || body.chatRoomId || 0
    ) || 0;
    const roomCallId = normalizeIdValue(
      roomPayload?.callId || body.callId || body.cid || body.currentCallId || 0
    ) || 0;

    const looksVoiceRoom =
      methodUpper.includes('VRC') ||
      methodUpper.includes('VOICE') ||
      methodUpper.includes('VOX') ||
      body.liveon !== undefined ||
      body.liveOn !== undefined ||
      body.callId !== undefined ||
      body.csIP !== undefined ||
      body.reqSpkPermitEnable !== undefined ||
      body.eventType !== undefined ||
      body.responseCode !== undefined ||
      body.remainTime !== undefined ||
      body.femo !== undefined ||
      body.spkRequestors !== undefined ||
      body.moderators !== undefined ||
      body.speakers !== undefined ||
      body.listeners !== undefined;

    if (!looksVoiceRoom) return;

    const source = methodUpper.includes('VRC') || methodUpper.includes('VOX') ? 'vox' : 'loco';
    const rawEvent: VoiceRoomRawEvent = {
      at: Date.now(),
      source,
      room: { chatId: roomChatId || 0, callId: roomCallId || 0 },
      method,
      body,
      raw: packet,
    };
    this._emitVoiceRoomEvent('voiceroom:raw', rawEvent);

    if (roomChatId) {
      this._updateVoiceRoomMetaCache(roomPayload, roomChatId, source);
    }

    const notifyCode = safeNumber(body.eventType ?? body.notifyType ?? body.vrcEventType, NaN);
    if (Number.isFinite(notifyCode)) {
      const speakerRequestorsRaw = Array.isArray(body.spkRequestors)
        ? body.spkRequestors
        : (Array.isArray(body.speakerRequestors) ? body.speakerRequestors : []);
      const speakerRequestors = speakerRequestorsRaw
        .map((id: any) => normalizeIdValue(id))
        .filter((id: any) => id !== undefined && id !== null && id !== 0 && id !== '0');

      const notifyEvent: VoiceRoomNotifyEvent = {
        at: Date.now(),
        source,
        room: { chatId: roomChatId || 0, callId: roomCallId || 0 },
        notifyType: resolveVoiceRoomNotifyType(notifyCode),
        notifyCode,
        destUserId: normalizeIdValue(body.destUserId || body.destId || body.userId || 0) || undefined,
        speakerRequestors: speakerRequestors.length > 0 ? speakerRequestors : undefined,
        raw: packet,
      };
      this._emitVoiceRoomEvent('voiceroom:notify', notifyEvent);
    }

    const responseCode = safeNumber(body.responseCode ?? body.resCode ?? body.vcsResponseCode, NaN);
    if (Number.isFinite(responseCode)) {
      const requestType = resolveVoiceRoomRequestType(body.requestType ?? body.reqType ?? body.actionType);
      const responseEvent: VoiceRoomResponseEvent = {
        at: Date.now(),
        source,
        room: { chatId: roomChatId || 0, callId: roomCallId || 0 },
        requestType,
        code: responseCode,
        codeName: resolveVoiceRoomResponseCodeName(responseCode),
        ok: responseCode === 0,
        targetUserId: normalizeIdValue(body.destUserId || body.destId || body.userId || 0) || undefined,
        raw: packet,
      };
      this._emitVoiceRoomEvent('voiceroom:response', responseEvent);
    }

    const hasRoomInfo =
      body.reqSpkPermitEnable !== undefined ||
      body.shareContent !== undefined ||
      body.titleContent !== undefined;
    if (hasRoomInfo) {
      const roomInfoEvent: VoiceRoomRoomInfoEvent = {
        at: Date.now(),
        source,
        room: { chatId: roomChatId || 0, callId: roomCallId || 0 },
        reqSpeakerPermissionEnabled: !!body.reqSpkPermitEnable,
        shareContent: String(body.shareContent || ''),
        shareUserId: normalizeIdValue(body.shareUserId || 0) || 0,
        shareTimeStamp: safeNumber(body.shareTimeStamp || 0, 0),
        shareMode: safeNumber(body.shareMode?.value ?? body.shareMode ?? 0, 0),
        titleContent: String(body.titleContent || ''),
        titleUserId: normalizeIdValue(body.titleUserID || body.titleUserId || 0) || 0,
        titleTimeStamp: safeNumber(body.titleTimeStamp || 0, 0),
        titleMode: safeNumber(body.titleMode?.value ?? body.titleMode ?? 0, 0),
        raw: packet,
      };
      this._emitVoiceRoomEvent('voiceroom:roomInfo', roomInfoEvent);
    }

    if (body.remainTime !== undefined) {
      const remainTimeEvent: VoiceRoomRemainTimeEvent = {
        at: Date.now(),
        source,
        room: { chatId: roomChatId || 0, callId: roomCallId || 0 },
        remainTime: safeNumber(body.remainTime, 0),
        raw: packet,
      };
      this._emitVoiceRoomEvent('voiceroom:remainTime', remainTimeEvent);
    }

    if (body.isMicOff !== undefined) {
      const micForcedEvent: VoiceRoomMicForcedEvent = {
        at: Date.now(),
        source,
        room: { chatId: roomChatId || 0, callId: roomCallId || 0 },
        isMicOff: !!body.isMicOff,
        userId: normalizeIdValue(body.userId || body.destUserId || 0) || undefined,
        raw: packet,
      };
      this._emitVoiceRoomEvent('voiceroom:micForced', micForcedEvent);
    }

    if (body.femo !== undefined) {
      const reactionEvent: VoiceRoomReactionEvent = {
        at: Date.now(),
        source,
        room: { chatId: roomChatId || 0, callId: roomCallId || 0 },
        reaction: String(body.femo || ''),
        userId: normalizeIdValue(body.userID || body.userId || 0) || 0,
        raw: packet,
      };
      this._emitVoiceRoomEvent('voiceroom:reaction', reactionEvent);
    }

    if (body.moderators !== undefined || body.speakers !== undefined || body.listeners !== undefined) {
      const membersEvent: VoiceRoomMembersEvent = {
        at: Date.now(),
        source,
        room: { chatId: roomChatId || 0, callId: roomCallId || 0 },
        moderators: this._toVoiceRoomUserList(body.moderators, 'moderator'),
        speakers: this._toVoiceRoomUserList(body.speakers, 'speaker'),
        listeners: this._toVoiceRoomUserList(body.listeners, 'listener'),
        raw: packet,
      };
      this._emitVoiceRoomEvent('voiceroom:members', membersEvent);
    }

    const startSignal =
      methodUpper.includes('START') ||
      methodUpper.includes('JOINVOICE') ||
      methodUpper.includes('VOICEROOMSTART');

    const stateToken = String(
      body.treminateState ??
      body.terminateState ??
      body.TreminateState ??
      body.connStateName ??
      body.connState ??
      body.callState ??
      body.stateName ??
      ''
    ).toUpperCase();
    const endSignalByMethod =
      methodUpper.includes('END') ||
      methodUpper.includes('HANGUP') ||
      methodUpper.includes('LEAVE') ||
      methodUpper.includes('TERMINATE') ||
      methodUpper.includes('VREE');
    const endSignalByState =
      stateToken.includes('TERMINAT') ||
      stateToken.includes('ENDED') ||
      stateToken.includes('HANGUP') ||
      stateToken.includes('LEAVE');
    const liveOnValue = roomPayload?.liveon ?? roomPayload?.liveOn ?? body.liveon ?? body.liveOn;
    const endSignalByLiveOff = liveOnValue !== undefined && !this._safeVoiceRoomBoolean(liveOnValue);
    const endSignal = endSignalByMethod || endSignalByState || endSignalByLiveOff;

    if (startSignal) {
      this._voiceRoomCurrent = {
        active: true,
        chatId: roomChatId || this._voiceRoomCurrent.chatId,
        callId: roomCallId || this._voiceRoomCurrent.callId,
        joinedAt: Date.now(),
        source,
      };
      const startedEvent: VoiceRoomStartedEvent = {
        at: Date.now(),
        source,
        room: { chatId: this._voiceRoomCurrent.chatId, callId: this._voiceRoomCurrent.callId },
        trigger: method,
        raw: packet,
      };
      this._emitVoiceRoomEvent('voiceroom:started', startedEvent);
    } else if (endSignal) {
      const reason = endSignalByMethod
        ? method
        : (endSignalByState
          ? `state:${stateToken || 'TERMINATED'}`
          : 'liveoff');
      const endedEvent: VoiceRoomEndedEvent = {
        at: Date.now(),
        source,
        room: { chatId: roomChatId || this._voiceRoomCurrent.chatId, callId: roomCallId || this._voiceRoomCurrent.callId },
        reason,
        raw: packet,
      };
      this._emitVoiceRoomEvent('voiceroom:ended', endedEvent);
      this._voiceRoomCurrent = {
        active: false,
        chatId: 0,
        callId: 0,
        source: 'internal',
      };
    }
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
    this._emitVoiceRoomEventsFromPush(packet);

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

  _onVoiceRoom(eventName: string, handler: VoiceRoomEventHandler<any>) {
    const wrapped = (chat: ChatModule, event: any) => {
      if (handler.length <= 1) {
        (handler as (event: any) => void)(event);
      } else {
        (handler as (chat: ChatModule, event: any) => void)(chat, event);
      }
    };
    this.on(eventName, wrapped);
    return this;
  }

  onVoiceRoomMeta(handler: VoiceRoomEventHandler<VoiceRoomMetaEvent>) {
    return this._onVoiceRoom('voiceroom:meta', handler);
  }

  onVoiceRoomLiveOn(handler: VoiceRoomEventHandler<VoiceRoomLiveOnEvent>) {
    return this._onVoiceRoom('voiceroom:liveon', handler);
  }

  onVoiceRoomJoinable(handler: VoiceRoomEventHandler<VoiceRoomJoinableEvent>) {
    return this._onVoiceRoom('voiceroom:joinable', handler);
  }

  onVoiceRoomStarted(handler: VoiceRoomEventHandler<VoiceRoomStartedEvent>) {
    return this._onVoiceRoom('voiceroom:started', handler);
  }

  onVoiceRoomEnded(handler: VoiceRoomEventHandler<VoiceRoomEndedEvent>) {
    return this._onVoiceRoom('voiceroom:ended', handler);
  }

  onVoiceRoomMembers(handler: VoiceRoomEventHandler<VoiceRoomMembersEvent>) {
    return this._onVoiceRoom('voiceroom:members', handler);
  }

  onVoiceRoomNotify(handler: VoiceRoomEventHandler<VoiceRoomNotifyEvent>) {
    return this._onVoiceRoom('voiceroom:notify', handler);
  }

  onVoiceRoomResponse(handler: VoiceRoomEventHandler<VoiceRoomResponseEvent>) {
    return this._onVoiceRoom('voiceroom:response', handler);
  }

  onVoiceRoomRoomInfo(handler: VoiceRoomEventHandler<VoiceRoomRoomInfoEvent>) {
    return this._onVoiceRoom('voiceroom:roomInfo', handler);
  }

  onVoiceRoomRemainTime(handler: VoiceRoomEventHandler<VoiceRoomRemainTimeEvent>) {
    return this._onVoiceRoom('voiceroom:remainTime', handler);
  }

  onVoiceRoomMicForced(handler: VoiceRoomEventHandler<VoiceRoomMicForcedEvent>) {
    return this._onVoiceRoom('voiceroom:micForced', handler);
  }

  onVoiceRoomReaction(handler: VoiceRoomEventHandler<VoiceRoomReactionEvent>) {
    return this._onVoiceRoom('voiceroom:reaction', handler);
  }

  onVoiceRoomError(handler: VoiceRoomEventHandler<VoiceRoomErrorEvent>) {
    return this._onVoiceRoom('voiceroom:error', handler);
  }

  onVoiceRoomRaw(handler: VoiceRoomEventHandler<VoiceRoomRawEvent>) {
    return this._onVoiceRoom('voiceroom:raw', handler);
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
    this._recordLogAlias(roomIdValue, logIdValue);
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

      const voiceRoomMeta = this._updateVoiceRoomMetaCache(chat, chatIdValue);
      if (voiceRoomMeta) {
        (next as any).voiceRoomMeta = voiceRoomMeta;
      } else if ((next as any).voiceRoomMeta) {
        delete (next as any).voiceRoomMeta;
      }

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
    const normalizedLogId = this._resolveLogId(chatId, logId);
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
    this._recordLogAlias(resolvedChatId, normalizedLogId);
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

// Apply mixins
import { applyMessageMixin, type MessageMixin } from './message-mixin';
import { applyMediaMixin, type MediaMixin } from './media-mixin';
import { applyOpenChatMixin, type OpenChatMixin } from './openchat-mixin';
import { applyVoiceRoomMixin, type VoiceRoomMixin } from './voiceroom-mixin';
applyMessageMixin(KakaoForgeClient);
applyMediaMixin(KakaoForgeClient);
applyOpenChatMixin(KakaoForgeClient);
applyVoiceRoomMixin(KakaoForgeClient);

// Declare interface merging for mixins
export interface KakaoForgeClient extends MessageMixin, MediaMixin, OpenChatMixin, VoiceRoomMixin {}
