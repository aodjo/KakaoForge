import { normalizeIdValue } from '../utils';
import {
  type VoiceRoomMeta,
  type VoiceRoomJoinInfo,
  type VoiceRoomCurrentInfo,
  type VoiceRoomControlResult,
  type VoiceRoomControlOptions,
  type VoiceRoomRequestType,
} from '../types';
import type { KakaoForgeClient } from './client';

export interface VoiceRoomMixin {
  getVoiceRoomMeta(chatId: number | string): Promise<VoiceRoomMeta | null>;
  refreshVoiceRoomMeta(chatId: number | string): Promise<VoiceRoomMeta | null>;
  isVoiceRoomLiveOn(chatId: number | string): Promise<boolean>;
  getVoiceRoomJoinInfo(chatId: number | string): Promise<VoiceRoomJoinInfo | null>;
  getCurrentVoiceRoom(): VoiceRoomCurrentInfo;
  joinVoiceRoom(joinInfo: VoiceRoomJoinInfo | { chatId: number | string }, opts?: VoiceRoomControlOptions): Promise<VoiceRoomControlResult>;
  leaveVoiceRoom(opts?: VoiceRoomControlOptions): Promise<VoiceRoomControlResult>;
  requestVoiceRoomSpeakerPermission(opts?: VoiceRoomControlOptions): Promise<VoiceRoomControlResult>;
  cancelVoiceRoomSpeakerPermission(opts?: VoiceRoomControlOptions): Promise<VoiceRoomControlResult>;
  acceptVoiceRoomSpeakerInvitation(opts?: VoiceRoomControlOptions): Promise<VoiceRoomControlResult>;
  declineVoiceRoomSpeakerInvitation(opts?: VoiceRoomControlOptions): Promise<VoiceRoomControlResult>;
  acceptVoiceRoomModeratorInvitation(opts?: VoiceRoomControlOptions): Promise<VoiceRoomControlResult>;
  declineVoiceRoomModeratorInvitation(opts?: VoiceRoomControlOptions): Promise<VoiceRoomControlResult>;
  inviteVoiceRoomSpeaker(userId: number | string, opts?: VoiceRoomControlOptions): Promise<VoiceRoomControlResult>;
  inviteVoiceRoomModerator(userId: number | string, opts?: VoiceRoomControlOptions): Promise<VoiceRoomControlResult>;
  authorizeVoiceRoomSpeakerPermission(userId: number | string, opts?: VoiceRoomControlOptions): Promise<VoiceRoomControlResult>;
  rejectVoiceRoomSpeakerPermission(userId: number | string, opts?: VoiceRoomControlOptions): Promise<VoiceRoomControlResult>;
  revokeVoiceRoomSpeakerPermission(userId: number | string, opts?: VoiceRoomControlOptions): Promise<VoiceRoomControlResult>;
  revokeVoiceRoomModeratorPrivileges(userId: number | string, opts?: VoiceRoomControlOptions): Promise<VoiceRoomControlResult>;
  setVoiceRoomReqSpeakerPermissionEnabled(enabled: boolean, opts?: VoiceRoomControlOptions): Promise<VoiceRoomControlResult>;
  shareVoiceRoomContent(content: string, clear?: boolean, opts?: VoiceRoomControlOptions): Promise<VoiceRoomControlResult>;
  changeVoiceRoomTitle(title: string, opts?: VoiceRoomControlOptions): Promise<VoiceRoomControlResult>;
  raiseVoiceRoomHand(opts?: VoiceRoomControlOptions): Promise<VoiceRoomControlResult>;
  lowerVoiceRoomHand(opts?: VoiceRoomControlOptions): Promise<VoiceRoomControlResult>;
  lowerVoiceRoomHandOf(userId: number | string, opts?: VoiceRoomControlOptions): Promise<VoiceRoomControlResult>;
  setVoiceRoomMyMicMuted(muted: boolean, opts?: VoiceRoomControlOptions): Promise<VoiceRoomControlResult>;
  setVoiceRoomSpeakerOutputMuted(muted: boolean, opts?: VoiceRoomControlOptions): Promise<VoiceRoomControlResult>;
  turnOffVoiceRoomRemoteMic(userId: number | string, opts?: VoiceRoomControlOptions): Promise<VoiceRoomControlResult>;
  turnOffVoiceRoomRemoteCamera(userId: number | string, opts?: VoiceRoomControlOptions): Promise<VoiceRoomControlResult>;
  sendVoiceRoomReaction(reaction: string, opts?: VoiceRoomControlOptions): Promise<VoiceRoomControlResult>;
  setVoiceRoomFilter(value: number, opts?: VoiceRoomControlOptions): Promise<VoiceRoomControlResult>;
}

async function getVoiceRoomMeta(
  this: KakaoForgeClient,
  chatId: number | string
) {
  const resolvedChatId = this._resolveChatId(chatId);
  const cached = this._getVoiceRoomMetaFromCache(resolvedChatId);
  if (cached) return cached;
  return this.refreshVoiceRoomMeta(resolvedChatId);
}

async function refreshVoiceRoomMeta(
  this: KakaoForgeClient,
  chatId: number | string
) {
  const resolvedChatId = this._resolveChatId(chatId);

  if (!this._carriage && !this._locoAutoConnectAttempted) {
    this._locoAutoConnectAttempted = true;
    try {
      await this.connect();
    } catch (err: any) {
      if (this.debug) {
        console.error('[DBG] LOCO auto-connect failed:', err?.message || String(err));
      }
    }
  }

  if (!this._carriage) {
    throw new Error('LOCO not connected. Call client.connect() first.');
  }

  const res = await this._carriage.chatInfo(resolvedChatId);
  const info = res?.body?.chatInfo || res?.body?.chat || res?.body?.chatData || res?.body?.chatRoom;
  if (info) {
    this._updateChatRooms([info]);
  } else if (res?.body) {
    this._updateChatRooms([res.body]);
  }
  return this._getVoiceRoomMetaFromCache(resolvedChatId);
}

async function isVoiceRoomLiveOn(
  this: KakaoForgeClient,
  chatId: number | string
) {
  const meta = await this.getVoiceRoomMeta(chatId);
  return !!meta?.liveOn;
}

async function getVoiceRoomJoinInfo(
  this: KakaoForgeClient,
  chatId: number | string
) {
  const meta = await this.getVoiceRoomMeta(chatId);
  if (!meta) return null;
  return this._getVoiceRoomJoinInfoFromMeta(meta);
}

function getCurrentVoiceRoom(this: KakaoForgeClient) {
  return this._getCurrentVoiceRoomState();
}

function unsupported(
  this: KakaoForgeClient,
  requestType: VoiceRoomRequestType,
  ctx: any = {}
) {
  return Promise.resolve(this._voiceRoomControlUnavailable(requestType, ctx));
}

function joinVoiceRoom(
  this: KakaoForgeClient,
  joinInfo: VoiceRoomJoinInfo | { chatId: number | string },
  opts: VoiceRoomControlOptions = {}
) {
  const chatId = normalizeIdValue((joinInfo as any)?.chatId || 0);
  const callId = normalizeIdValue((joinInfo as any)?.callId || 0);
  return unsupported.call(this, 'JOIN', { chatId, callId, joinInfo, ...opts });
}

function leaveVoiceRoom(this: KakaoForgeClient, opts: VoiceRoomControlOptions = {}) {
  const current = this._getCurrentVoiceRoomState();
  return unsupported.call(this, 'LEAVE', { chatId: current.chatId, callId: current.callId, ...opts });
}

function requestVoiceRoomSpeakerPermission(this: KakaoForgeClient, opts: VoiceRoomControlOptions = {}) {
  return unsupported.call(this, 'SPEAKER_PERMISSION', opts);
}

function cancelVoiceRoomSpeakerPermission(this: KakaoForgeClient, opts: VoiceRoomControlOptions = {}) {
  return unsupported.call(this, 'CANCEL_SPEAKER_PERMISSION', opts);
}

function acceptVoiceRoomSpeakerInvitation(this: KakaoForgeClient, opts: VoiceRoomControlOptions = {}) {
  return unsupported.call(this, 'ACCEPT_SPEAKER_INVITATION', opts);
}

function declineVoiceRoomSpeakerInvitation(this: KakaoForgeClient, opts: VoiceRoomControlOptions = {}) {
  return unsupported.call(this, 'DECLINE_SPEAKER_INVITATION', opts);
}

function acceptVoiceRoomModeratorInvitation(this: KakaoForgeClient, opts: VoiceRoomControlOptions = {}) {
  return unsupported.call(this, 'ACCEPT_MODERATOR_INVITATION', opts);
}

function declineVoiceRoomModeratorInvitation(this: KakaoForgeClient, opts: VoiceRoomControlOptions = {}) {
  return unsupported.call(this, 'DECLINE_MODERATOR_INVITATION', opts);
}

function inviteVoiceRoomSpeaker(
  this: KakaoForgeClient,
  userId: number | string,
  opts: VoiceRoomControlOptions = {}
) {
  return unsupported.call(this, 'INVITE_AS_SPEAKER', { userId: normalizeIdValue(userId), ...opts });
}

function inviteVoiceRoomModerator(
  this: KakaoForgeClient,
  userId: number | string,
  opts: VoiceRoomControlOptions = {}
) {
  return unsupported.call(this, 'INVITE_AS_MODERATOR', { userId: normalizeIdValue(userId), ...opts });
}

function authorizeVoiceRoomSpeakerPermission(
  this: KakaoForgeClient,
  userId: number | string,
  opts: VoiceRoomControlOptions = {}
) {
  return unsupported.call(this, 'AUTHORIZE_SPEAKER_PERMISSION', { userId: normalizeIdValue(userId), ...opts });
}

function rejectVoiceRoomSpeakerPermission(
  this: KakaoForgeClient,
  userId: number | string,
  opts: VoiceRoomControlOptions = {}
) {
  return unsupported.call(this, 'REJECT_SPEAKER_PERMISSION', { userId: normalizeIdValue(userId), ...opts });
}

function revokeVoiceRoomSpeakerPermission(
  this: KakaoForgeClient,
  userId: number | string,
  opts: VoiceRoomControlOptions = {}
) {
  return unsupported.call(this, 'REVOKE_SPEAKER_PERMISSION', { userId: normalizeIdValue(userId), ...opts });
}

function revokeVoiceRoomModeratorPrivileges(
  this: KakaoForgeClient,
  userId: number | string,
  opts: VoiceRoomControlOptions = {}
) {
  return unsupported.call(this, 'REVOKE_MODERATOR_PRIVILEGES', { userId: normalizeIdValue(userId), ...opts });
}

function setVoiceRoomReqSpeakerPermissionEnabled(
  this: KakaoForgeClient,
  enabled: boolean,
  opts: VoiceRoomControlOptions = {}
) {
  return unsupported.call(this, 'SET_REQ_SPEAKER_PERMISSION_ENABLE', { enabled: !!enabled, ...opts });
}

function shareVoiceRoomContent(
  this: KakaoForgeClient,
  content: string,
  clear = false,
  opts: VoiceRoomControlOptions = {}
) {
  return unsupported.call(this, 'SHARE_CONTENT', { content: String(content || ''), clear: !!clear, ...opts });
}

function changeVoiceRoomTitle(
  this: KakaoForgeClient,
  title: string,
  opts: VoiceRoomControlOptions = {}
) {
  return unsupported.call(this, 'CHANGE_TITLE', { title: String(title || ''), ...opts });
}

function raiseVoiceRoomHand(this: KakaoForgeClient, opts: VoiceRoomControlOptions = {}) {
  return unsupported.call(this, 'RAISE_HAND', opts);
}

function lowerVoiceRoomHand(this: KakaoForgeClient, opts: VoiceRoomControlOptions = {}) {
  return unsupported.call(this, 'LOWER_HAND', opts);
}

function lowerVoiceRoomHandOf(
  this: KakaoForgeClient,
  userId: number | string,
  opts: VoiceRoomControlOptions = {}
) {
  return unsupported.call(this, 'LOWER_HAND_OF', { userId: normalizeIdValue(userId), ...opts });
}

function setVoiceRoomMyMicMuted(
  this: KakaoForgeClient,
  muted: boolean,
  opts: VoiceRoomControlOptions = {}
) {
  return unsupported.call(this, 'SET_MIC_MUTE', { muted: !!muted, ...opts });
}

function setVoiceRoomSpeakerOutputMuted(
  this: KakaoForgeClient,
  muted: boolean,
  opts: VoiceRoomControlOptions = {}
) {
  return unsupported.call(this, 'SET_SPK_MUTE', { muted: !!muted, ...opts });
}

function turnOffVoiceRoomRemoteMic(
  this: KakaoForgeClient,
  userId: number | string,
  opts: VoiceRoomControlOptions = {}
) {
  return unsupported.call(this, 'TURN_OFF_REMOTE_MIC', { userId: normalizeIdValue(userId), ...opts });
}

function turnOffVoiceRoomRemoteCamera(
  this: KakaoForgeClient,
  userId: number | string,
  opts: VoiceRoomControlOptions = {}
) {
  return unsupported.call(this, 'TURN_OFF_REMOTE_CAMERA', { userId: normalizeIdValue(userId), ...opts });
}

function sendVoiceRoomReaction(
  this: KakaoForgeClient,
  reaction: string,
  opts: VoiceRoomControlOptions = {}
) {
  return unsupported.call(this, 'SEND_REACTION', { reaction: String(reaction || ''), ...opts });
}

function setVoiceRoomFilter(
  this: KakaoForgeClient,
  value: number,
  opts: VoiceRoomControlOptions = {}
) {
  return unsupported.call(this, 'SET_VOICE_FILTER', { value, ...opts });
}

export function applyVoiceRoomMixin(ClientClass: typeof KakaoForgeClient) {
  ClientClass.prototype.getVoiceRoomMeta = getVoiceRoomMeta;
  ClientClass.prototype.refreshVoiceRoomMeta = refreshVoiceRoomMeta;
  ClientClass.prototype.isVoiceRoomLiveOn = isVoiceRoomLiveOn;
  ClientClass.prototype.getVoiceRoomJoinInfo = getVoiceRoomJoinInfo;
  ClientClass.prototype.getCurrentVoiceRoom = getCurrentVoiceRoom;
  ClientClass.prototype.joinVoiceRoom = joinVoiceRoom;
  ClientClass.prototype.leaveVoiceRoom = leaveVoiceRoom;
  ClientClass.prototype.requestVoiceRoomSpeakerPermission = requestVoiceRoomSpeakerPermission;
  ClientClass.prototype.cancelVoiceRoomSpeakerPermission = cancelVoiceRoomSpeakerPermission;
  ClientClass.prototype.acceptVoiceRoomSpeakerInvitation = acceptVoiceRoomSpeakerInvitation;
  ClientClass.prototype.declineVoiceRoomSpeakerInvitation = declineVoiceRoomSpeakerInvitation;
  ClientClass.prototype.acceptVoiceRoomModeratorInvitation = acceptVoiceRoomModeratorInvitation;
  ClientClass.prototype.declineVoiceRoomModeratorInvitation = declineVoiceRoomModeratorInvitation;
  ClientClass.prototype.inviteVoiceRoomSpeaker = inviteVoiceRoomSpeaker;
  ClientClass.prototype.inviteVoiceRoomModerator = inviteVoiceRoomModerator;
  ClientClass.prototype.authorizeVoiceRoomSpeakerPermission = authorizeVoiceRoomSpeakerPermission;
  ClientClass.prototype.rejectVoiceRoomSpeakerPermission = rejectVoiceRoomSpeakerPermission;
  ClientClass.prototype.revokeVoiceRoomSpeakerPermission = revokeVoiceRoomSpeakerPermission;
  ClientClass.prototype.revokeVoiceRoomModeratorPrivileges = revokeVoiceRoomModeratorPrivileges;
  ClientClass.prototype.setVoiceRoomReqSpeakerPermissionEnabled = setVoiceRoomReqSpeakerPermissionEnabled;
  ClientClass.prototype.shareVoiceRoomContent = shareVoiceRoomContent;
  ClientClass.prototype.changeVoiceRoomTitle = changeVoiceRoomTitle;
  ClientClass.prototype.raiseVoiceRoomHand = raiseVoiceRoomHand;
  ClientClass.prototype.lowerVoiceRoomHand = lowerVoiceRoomHand;
  ClientClass.prototype.lowerVoiceRoomHandOf = lowerVoiceRoomHandOf;
  ClientClass.prototype.setVoiceRoomMyMicMuted = setVoiceRoomMyMicMuted;
  ClientClass.prototype.setVoiceRoomSpeakerOutputMuted = setVoiceRoomSpeakerOutputMuted;
  ClientClass.prototype.turnOffVoiceRoomRemoteMic = turnOffVoiceRoomRemoteMic;
  ClientClass.prototype.turnOffVoiceRoomRemoteCamera = turnOffVoiceRoomRemoteCamera;
  ClientClass.prototype.sendVoiceRoomReaction = sendVoiceRoomReaction;
  ClientClass.prototype.setVoiceRoomFilter = setVoiceRoomFilter;
}
