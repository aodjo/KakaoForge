import * as fs from 'fs';
import * as path from 'path';
import {
  qrLogin,
  DEFAULT_QR_MODEL_NAME,
} from './auth/login';

import {
  loadAuthFile,
  formatKstTimestamp,
  buildMentionMarker,
  buildSpoilerMarker,
  buildQrLoginHandlers,
} from './utils';

import {
  type MemberTypeValue,
  type KakaoForgeConfig,
  type AuthFile,
  type AuthPayload,
} from './types';

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
  type VoiceRoomSource,
  type VoiceRoomNotifyType,
  type VoiceRoomRequestType,
  type VoiceRoomResponseCodeName,
  type VoiceRoomMeta,
  type VoiceRoomJoinInfo,
  type VoiceRoomCurrentInfo,
  type VoiceRoomControlResult,
  type VoiceRoomControlOptions,
  type VoiceRoomBaseEvent,
  type VoiceRoomMetaEvent,
  type VoiceRoomLiveOnEvent,
  type VoiceRoomJoinableEvent,
  type VoiceRoomStartedEvent,
  type VoiceRoomEndedEvent,
  type VoiceRoomUser,
  type VoiceRoomMembersEvent,
  type VoiceRoomNotifyEvent,
  type VoiceRoomResponseEvent,
  type VoiceRoomRoomInfoEvent,
  type VoiceRoomRemainTimeEvent,
  type VoiceRoomMicForcedEvent,
  type VoiceRoomReactionEvent,
  type VoiceRoomErrorEvent,
  type VoiceRoomRawEvent,
  type VoiceRoomEventMap,
  type VoiceRoomEventHandler,
  type VoiceRoomChatModule,
  VOICE_ROOM_NOTIFY_TYPE_BY_CODE,
  VOICE_ROOM_RESPONSE_CODE_NAME_BY_CODE,
  VOICE_ROOM_REQUEST_TYPE_BY_ORDINAL,
  resolveVoiceRoomNotifyType,
  resolveVoiceRoomResponseCodeName,
  resolveVoiceRoomRequestType,
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
