import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as LosslessJSON from 'lossless-json';
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
import { guessMime, readImageSize } from './util/media';
import { uploadMultipartFile } from './net/upload-client';

// Import utilities from centralized utility modules
import {
  loadAuthFile,
  sleepMs,
  uniqueStrings,
  uniqueNumbers,
  toLong,
  safeNumber,
  sha1FileHex,
  isBlankText,
  stringifyLossless,
  previewLossless,
  formatKstTimestamp,
  normalizeIdValue,
  toUnixSeconds,
  snapToFiveMinutes,
  toDate,
  formatCalendarDate,
  resolveTimeZone,
  pickFirstValue,
  pickFirstObject,
  // video utilities
  type VideoProbe,
  resolveFfmpegBinary,
  assertBinaryAvailable,
  probeVideo,
  toEven,
  computeTargetVideoSize,
  runProcess,
  hasTrailerProfile,
  summarizeTrailerKeys,
  // parsing utilities
  parseAttachments,
  extractChatLogPayload,
  parseAttachmentJson,
  buildSpamChatLogInfo,
  extractOpenLinkIdFromRaw,
  resolveRoomFlags,
  extractOpenLinkNameFromMr,
  unwrapAttachment,
  extractShareMessageData,
  normalizeScheduleShareData,
  extractEventId,
  ensureScheduleAttachment,
  previewCalendarBody,
  assertCalendarOk,
  previewBubbleBody,
  assertBubbleOk,
  waitForPushMethod,
  extractProfileFromResponse,
  escapeVCardValue,
  buildVCard,
  // mention utilities
  MENTION_MARK_START,
  MENTION_MARK_MID,
  MENTION_MARK_END,
  SPOILER_MARK_START,
  SPOILER_MARK_END,
  MESSAGE_SENDER_CACHE_LIMIT,
  buildMentionMarker,
  buildSpoilerMarker,
  extractMarkedMentions,
  extractMarkedSpoilers,
  findAllIndices,
  normalizeMentionInputs,
  normalizeSpoilerInputs,
  extractMentions,
  // attachment utilities
  buildExtra,
  normalizeMediaAttachment,
  normalizeFileAttachment,
  normalizeLocationAttachment,
  normalizeScheduleAttachment,
  normalizeContactAttachment,
  normalizeProfileAttachment,
  normalizeLinkAttachment,
  truncateReplyMessage,
  buildReplyAttachment,
  normalizeReplyTarget,
  normalizeReactionTarget,
  normalizeOpenChatMemberTarget,
  normalizeOpenChatBlindTarget,
  normalizeLogTarget,
  normalizeEditTarget,
  // feed utilities
  extractFeedPayload,
  extractMemberIdsFromPayload,
  extractFeedMemberIds,
  extractPushMemberIds,
  buildMemberNameMap,
  buildFeedMemberNameMap,
  extractActorIdFromPayload,
  PUSH_MEMBER_ACTIONS,
  PUSH_DELETE_ACTIONS,
  PUSH_HIDE_ACTIONS,
  DEFAULT_FEED_TYPE_MAP,
  resolveMemberActionFromPush,
  resolveDeleteActionFromPush,
  resolveHideActionFromPush,
  normalizeMemberAction,
  // client helpers
  buildQrLoginHandlers,
  streamEncryptedFile,
} from './utils';

// Import types from centralized type modules
import {
  MessageType,
  type MessageTypeValue,
  Reactions,
  type ReactionTypeValue,
  type MemberTypeValue,
  type TransportMode,
  type MessageEvent,
  type MemberAction,
  type MemberEvent,
  type DeleteEvent,
  type HideEvent,
  type SendOptions,
  type ReplyTarget,
  type ReplyOptions,
  type ReactionOptions,
  type MentionInput,
  type SpoilerInput,
  type OpenChatKickOptions,
  type OpenChatBlindOptions,
  type EditMessageOptions,
  type AttachmentInput,
  type AttachmentSendOptions,
  type VideoQuality,
  type VideoTranscodeOptions,
  type UploadMediaType,
  type UploadOptions,
  type UploadResult,
  type LocationPayload,
  type SchedulePayload,
  type ContactPayload,
  type ProfilePayload,
  type LinkPayload,
  type KakaoForgeConfig,
  type AuthFile,
  type AuthPayload,
  type ChatModule,
  type ChatRoomInfo,
  type ChatListCursor,
  type MessageHandler,
  type MemberEventHandler,
  type DeleteEventHandler,
  type HideEventHandler,
  type MemberNameCache,
} from './types';

// Re-export types for external consumers
export {
  MessageType,
  type MessageTypeValue,
  Reactions,
  type ReactionTypeValue,
  type TransportMode,
  type MessageEvent,
  type MemberAction,
  type MemberEvent,
  type DeleteEvent,
  type HideEvent,
  type SendOptions,
  type ReplyTarget,
  type ReplyOptions,
  type ReactionOptions,
  type MentionInput,
  type SpoilerInput,
  type OpenChatKickOptions,
  type OpenChatBlindOptions,
  type EditMessageOptions,
  type AttachmentInput,
  type AttachmentSendOptions,
  type VideoQuality,
  type VideoTranscodeOptions,
  type UploadMediaType,
  type UploadOptions,
  type UploadResult,
  type LocationPayload,
  type SchedulePayload,
  type ContactPayload,
  type ProfilePayload,
  type LinkPayload,
  type KakaoForgeConfig,
  type AuthPayload,
  type ChatModule,
} from './types';

export { MemberType } from './types/member-type';
export type { MemberTypeValue } from './types/member-type';
export type MemberType = MemberTypeValue;


// Import client class from client module
import { KakaoForgeClient } from './client';
export { KakaoForgeClient };

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

export type KakaoBot = KakaoForgeClient;
