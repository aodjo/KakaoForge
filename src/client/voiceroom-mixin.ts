import { normalizeIdValue, safeNumber } from '../utils';
import {
  type VoiceRoomMeta,
  type VoiceRoomJoinInfo,
  type VoiceRoomCurrentInfo,
  type VoiceRoomControlResult,
  type VoiceRoomControlOptions,
  type VoiceRoomRequestType,
  type ReactionTypeValue,
} from '../types';
import type { KakaoForgeClient } from './client';

const VOICE_ROOM_METHOD_CANDIDATES: Partial<Record<VoiceRoomRequestType, string[]>> = {
  JOIN: ['VRCJVC'],
  LEAVE: ['VRCLEAV'],
  SPEAKER_PERMISSION: ['VRCRSP'],
  CANCEL_SPEAKER_PERMISSION: ['VRCCSP'],
  ACCEPT_SPEAKER_INVITATION: ['VRCASI'],
  DECLINE_SPEAKER_INVITATION: ['VRCDSI'],
  ACCEPT_MODERATOR_INVITATION: ['VRCAMI'],
  DECLINE_MODERATOR_INVITATION: ['VRCDMI'],
  AUTHORIZE_SPEAKER_PERMISSION: ['VRCASP'],
  REJECT_SPEAKER_PERMISSION: ['VRCRSP'],
  REVOKE_SPEAKER_PERMISSION: ['VRCASI'],
  TURN_OFF_SPEAKER_PERMISSION: ['VRCTSP'],
  INVITE_AS_SPEAKER: ['VRCIAS'],
  INVITE_AS_MODERATOR: ['VRCIAM'],
  REVOKE_MODERATOR_PRIVILEGES: ['VRCRMP'],
  SET_REQ_SPEAKER_PERMISSION_ENABLE: ['VRCCTR'],
  SHARE_CONTENT: ['VRCSHC'],
  CHANGE_TITLE: ['VRCCHT'],
  RAISE_HAND: ['VRCNN'],
  LOWER_HAND: ['VRCNN'],
  LOWER_HAND_OF: ['VRCNN'],
  SET_MIC_MUTE: ['AMCN'],
  TURN_OFF_REMOTE_MIC: ['VRCCTR'],
  TURN_OFF_REMOTE_CAMERA: ['VRCCTR'],
  SET_VOICE_FILTER: ['AMCN'],
  SEND_REACTION: ['VRCNN'],
};

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
  sendVoiceRoomReaction(reaction: string | ReactionTypeValue, opts?: VoiceRoomControlOptions): Promise<VoiceRoomControlResult>;
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

function requestControl(
  this: KakaoForgeClient,
  requestType: VoiceRoomRequestType,
  payload: any = {},
  opts: VoiceRoomControlOptions = {}
) {
  const methodCandidates = VOICE_ROOM_METHOD_CANDIDATES[requestType] || [];
  return this._requestVoiceRoomControl(requestType, methodCandidates, payload, opts);
}

async function joinVoiceRoom(
  this: KakaoForgeClient,
  joinInfo: VoiceRoomJoinInfo | { chatId: number | string },
  opts: VoiceRoomControlOptions = {}
) {
  const rawJoinInfo = (joinInfo || {}) as any;
  const chatId = normalizeIdValue(rawJoinInfo.chatId || 0) || 0;
  let callId = normalizeIdValue(rawJoinInfo.callId || rawJoinInfo.cid || rawJoinInfo.callIdx || 0) || 0;
  let resolvedJoinInfo: any = rawJoinInfo;

  if ((!callId || String(callId) === '0') && chatId) {
    try {
      const fromMeta = await this.getVoiceRoomJoinInfo(chatId);
      if (fromMeta) {
        resolvedJoinInfo = { ...fromMeta, ...rawJoinInfo };
        callId = normalizeIdValue(resolvedJoinInfo.callId || 0) || 0;
      }
    } catch {
      // Keep caller-supplied joinInfo when metadata lookup fails.
    }
  }

  const port = safeNumber(
    resolvedJoinInfo.port ??
    resolvedJoinInfo.joinPort ??
    resolvedJoinInfo.csPort ??
    0,
    0
  );

  const payload: any = {
    chatId,
    callId,
    joinInfo: resolvedJoinInfo,
    hostV4: resolvedJoinInfo.hostV4 || resolvedJoinInfo.csIP || undefined,
    hostV6: resolvedJoinInfo.hostV6 || resolvedJoinInfo.csIP6 || undefined,
    port: port || undefined,
    joinPort: port || undefined,
    title: resolvedJoinInfo.title || undefined,
    blind: typeof resolvedJoinInfo.blind === 'boolean' ? resolvedJoinInfo.blind : undefined,
    tls: true,
    isSpeakerOn: true,
    svcType: 11,
  };

  return requestControl.call(this, 'JOIN', payload, {
    ...opts,
    chatId,
    callId,
    joinInfo: resolvedJoinInfo,
  });
}

function leaveVoiceRoom(this: KakaoForgeClient, opts: VoiceRoomControlOptions = {}) {
  const current = this._getCurrentVoiceRoomState();
  return requestControl.call(this, 'LEAVE', {
    chatId: current.chatId,
    callId: current.callId,
  }, {
    ...opts,
    chatId: current.chatId,
    callId: current.callId,
  });
}

function requestVoiceRoomSpeakerPermission(this: KakaoForgeClient, opts: VoiceRoomControlOptions = {}) {
  return requestControl.call(this, 'SPEAKER_PERMISSION', {}, opts);
}

function cancelVoiceRoomSpeakerPermission(this: KakaoForgeClient, opts: VoiceRoomControlOptions = {}) {
  return requestControl.call(this, 'CANCEL_SPEAKER_PERMISSION', {}, opts);
}

function acceptVoiceRoomSpeakerInvitation(this: KakaoForgeClient, opts: VoiceRoomControlOptions = {}) {
  return requestControl.call(this, 'ACCEPT_SPEAKER_INVITATION', {
    micOn: true,
    muted: false,
  }, opts);
}

function declineVoiceRoomSpeakerInvitation(this: KakaoForgeClient, opts: VoiceRoomControlOptions = {}) {
  return requestControl.call(this, 'DECLINE_SPEAKER_INVITATION', {}, opts);
}

function acceptVoiceRoomModeratorInvitation(this: KakaoForgeClient, opts: VoiceRoomControlOptions = {}) {
  return requestControl.call(this, 'ACCEPT_MODERATOR_INVITATION', {}, opts);
}

function declineVoiceRoomModeratorInvitation(this: KakaoForgeClient, opts: VoiceRoomControlOptions = {}) {
  return requestControl.call(this, 'DECLINE_MODERATOR_INVITATION', {}, opts);
}

function inviteVoiceRoomSpeaker(
  this: KakaoForgeClient,
  userId: number | string,
  opts: VoiceRoomControlOptions = {}
) {
  const targetUserId = normalizeIdValue(userId) || 0;
  return requestControl.call(this, 'INVITE_AS_SPEAKER', {
    userId: targetUserId,
    destUserId: targetUserId,
    targetUserId,
  }, {
    ...opts,
    targetUserId,
  });
}

function inviteVoiceRoomModerator(
  this: KakaoForgeClient,
  userId: number | string,
  opts: VoiceRoomControlOptions = {}
) {
  const targetUserId = normalizeIdValue(userId) || 0;
  return requestControl.call(this, 'INVITE_AS_MODERATOR', {
    userId: targetUserId,
    destUserId: targetUserId,
    targetUserId,
  }, {
    ...opts,
    targetUserId,
  });
}

function authorizeVoiceRoomSpeakerPermission(
  this: KakaoForgeClient,
  userId: number | string,
  opts: VoiceRoomControlOptions = {}
) {
  const targetUserId = normalizeIdValue(userId) || 0;
  return requestControl.call(this, 'AUTHORIZE_SPEAKER_PERMISSION', {
    userId: targetUserId,
    destUserId: targetUserId,
    targetUserId,
  }, {
    ...opts,
    targetUserId,
  });
}

function rejectVoiceRoomSpeakerPermission(
  this: KakaoForgeClient,
  userId: number | string,
  opts: VoiceRoomControlOptions = {}
) {
  const targetUserId = normalizeIdValue(userId) || 0;
  return requestControl.call(this, 'REJECT_SPEAKER_PERMISSION', {
    userId: targetUserId,
    destUserId: targetUserId,
    targetUserId,
  }, {
    ...opts,
    targetUserId,
  });
}

function revokeVoiceRoomSpeakerPermission(
  this: KakaoForgeClient,
  userId: number | string,
  opts: VoiceRoomControlOptions = {}
) {
  const targetUserId = normalizeIdValue(userId) || 0;
  return requestControl.call(this, 'REVOKE_SPEAKER_PERMISSION', {
    userId: targetUserId,
    destUserId: targetUserId,
    targetUserId,
  }, {
    ...opts,
    targetUserId,
  });
}

function revokeVoiceRoomModeratorPrivileges(
  this: KakaoForgeClient,
  userId: number | string,
  opts: VoiceRoomControlOptions = {}
) {
  const targetUserId = normalizeIdValue(userId) || 0;
  return requestControl.call(this, 'REVOKE_MODERATOR_PRIVILEGES', {
    userId: targetUserId,
    destUserId: targetUserId,
    targetUserId,
  }, {
    ...opts,
    targetUserId,
  });
}

function setVoiceRoomReqSpeakerPermissionEnabled(
  this: KakaoForgeClient,
  enabled: boolean,
  opts: VoiceRoomControlOptions = {}
) {
  return requestControl.call(this, 'SET_REQ_SPEAKER_PERMISSION_ENABLE', {
    enabled: !!enabled,
    enable: !!enabled,
    control: enabled ? 'enable_req_speaker_permission' : 'disable_req_speaker_permission',
  }, opts);
}

function shareVoiceRoomContent(
  this: KakaoForgeClient,
  content: string,
  clear = false,
  opts: VoiceRoomControlOptions = {}
) {
  return requestControl.call(this, 'SHARE_CONTENT', {
    content: String(content || ''),
    clear: !!clear,
  }, opts);
}

function changeVoiceRoomTitle(
  this: KakaoForgeClient,
  title: string,
  opts: VoiceRoomControlOptions = {}
) {
  return requestControl.call(this, 'CHANGE_TITLE', {
    title: String(title || ''),
  }, opts);
}

function raiseVoiceRoomHand(this: KakaoForgeClient, opts: VoiceRoomControlOptions = {}) {
  return requestControl.call(this, 'RAISE_HAND', {
    handUp: true,
  }, opts);
}

function lowerVoiceRoomHand(this: KakaoForgeClient, opts: VoiceRoomControlOptions = {}) {
  return requestControl.call(this, 'LOWER_HAND', {
    handUp: false,
    cancel: true,
  }, opts);
}

function lowerVoiceRoomHandOf(
  this: KakaoForgeClient,
  userId: number | string,
  opts: VoiceRoomControlOptions = {}
) {
  const targetUserId = normalizeIdValue(userId) || 0;
  return requestControl.call(this, 'LOWER_HAND_OF', {
    userId: targetUserId,
    destUserId: targetUserId,
    targetUserId,
    handUp: false,
  }, {
    ...opts,
    targetUserId,
  });
}

function setVoiceRoomMyMicMuted(
  this: KakaoForgeClient,
  muted: boolean,
  opts: VoiceRoomControlOptions = {}
) {
  return requestControl.call(this, 'SET_MIC_MUTE', {
    muted: !!muted,
    micMute: !!muted,
    audioMute: !!muted,
    micOn: !muted,
  }, opts);
}

function setVoiceRoomSpeakerOutputMuted(
  this: KakaoForgeClient,
  muted: boolean,
  opts: VoiceRoomControlOptions = {}
) {
  const current = this._getCurrentVoiceRoomState();
  return Promise.resolve(this._voiceRoomControlLocalSuccess('SET_SPK_MUTE', {
    ...opts,
    chatId: current.chatId,
    callId: current.callId,
    muted: !!muted,
    message: 'Applied locally to playback output.',
  }));
}

function turnOffVoiceRoomRemoteMic(
  this: KakaoForgeClient,
  userId: number | string,
  opts: VoiceRoomControlOptions = {}
) {
  const targetUserId = normalizeIdValue(userId) || 0;
  return requestControl.call(this, 'TURN_OFF_REMOTE_MIC', {
    userId: targetUserId,
    destUserId: targetUserId,
    targetUserId,
    control: 'mic_off',
  }, {
    ...opts,
    targetUserId,
  });
}

function turnOffVoiceRoomRemoteCamera(
  this: KakaoForgeClient,
  userId: number | string,
  opts: VoiceRoomControlOptions = {}
) {
  const targetUserId = normalizeIdValue(userId) || 0;
  return requestControl.call(this, 'TURN_OFF_REMOTE_CAMERA', {
    userId: targetUserId,
    destUserId: targetUserId,
    targetUserId,
    control: 'camera_off',
  }, {
    ...opts,
    targetUserId,
  });
}

function sendVoiceRoomReaction(
  this: KakaoForgeClient,
  reaction: string | ReactionTypeValue,
  opts: VoiceRoomControlOptions = {}
) {
  const femo = String(reaction || '');
  return requestControl.call(this, 'SEND_REACTION', {
    reaction: femo,
    femo,
    value: femo,
    type: 1,
  }, opts);
}

function setVoiceRoomFilter(
  this: KakaoForgeClient,
  value: number,
  opts: VoiceRoomControlOptions = {}
) {
  const voiceFilter = safeNumber(value, 0);
  return requestControl.call(this, 'SET_VOICE_FILTER', {
    value: voiceFilter,
    voiceFilter,
    filter: voiceFilter,
    aFilter: voiceFilter,
  }, opts);
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
