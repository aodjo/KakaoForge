export type VoiceRoomSource = 'loco' | 'vox' | 'internal';

export type VoiceRoomNotifyType =
  | 'REQ_SPEAKER_PERMISSION'
  | 'CANCEL_SPEAKER_PERMISSION'
  | 'REVOKED_MODERATOR_PRIVILEGES'
  | 'INVITED_AS_MODERATOR'
  | 'REVOKED_SPEAKER_PERMISSION'
  | 'AUTHORIZED_SPEAKER_PERMISSION'
  | 'REJECTED_SPEAKER_PERMISSION'
  | 'INVITED_AS_SPEAKER'
  | 'CHANGED_SPK_REQUESTORS'
  | 'UNKNOWN';

export type VoiceRoomRequestType =
  | 'SPEAKER_PERMISSION'
  | 'CANCEL_SPEAKER_PERMISSION'
  | 'ACCEPT_SPEAKER_INVITATION'
  | 'DECLINE_SPEAKER_INVITATION'
  | 'ACCEPT_MODERATOR_INVITATION'
  | 'DECLINE_MODERATOR_INVITATION'
  | 'AUTHORIZE_SPEAKER_PERMISSION'
  | 'REJECT_SPEAKER_PERMISSION'
  | 'REVOKE_SPEAKER_PERMISSION'
  | 'TURN_OFF_SPEAKER_PERMISSION'
  | 'INVITE_AS_SPEAKER'
  | 'INVITE_AS_MODERATOR'
  | 'REVOKE_MODERATOR_PRIVILEGES'
  | 'SET_REQ_SPEAKER_PERMISSION_ENABLE'
  | 'SHARE_CONTENT'
  | 'CHANGE_TITLE'
  | 'RAISE_HAND'
  | 'LOWER_HAND'
  | 'LOWER_HAND_OF'
  | 'SET_MIC_MUTE'
  | 'SET_SPK_MUTE'
  | 'TURN_OFF_REMOTE_MIC'
  | 'TURN_OFF_REMOTE_CAMERA'
  | 'SET_VOICE_FILTER'
  | 'SEND_REACTION'
  | 'JOIN'
  | 'LEAVE'
  | 'UNKNOWN';

export type VoiceRoomResponseCodeName =
  | 'SUCCESS'
  | 'SPEAKER_IS_FULL'
  | 'ALREADY_PROCESSED'
  | 'CHANGE_RESTRICTED'
  | 'FORBIDDEN_WORD'
  | 'DISABLE_REQUEST_SPEAKER_PERMISSION'
  | 'NO_PERMISSION'
  | 'INVALID_STATE'
  | 'INVALID_ROLE'
  | 'FAIL'
  | 'NOT_IMPLEMENTED'
  | 'UNKNOWN';

export type VoiceRoomMeta = {
  chatId: number | string;
  liveOn: boolean;
  callId: number | string;
  title?: string;
  blind?: boolean;
  hostV4?: string;
  hostV6?: string;
  csPort?: number;
  joinPort?: number;
  url?: string;
  raw?: any;
};

export type VoiceRoomJoinInfo = {
  chatId: number | string;
  callId: number | string;
  hostV4: string;
  hostV6: string;
  port: number;
  title?: string;
  blind?: boolean;
};

export type VoiceRoomCurrentInfo = {
  active: boolean;
  chatId: number | string;
  callId: number | string;
  joinedAt?: number;
  source?: VoiceRoomSource;
};

export type VoiceRoomControlResult = {
  ok: boolean;
  requestType: VoiceRoomRequestType | string;
  code: number;
  codeName: VoiceRoomResponseCodeName | string;
  message?: string;
  raw?: any;
};

export type VoiceRoomControlOptions = {
  reason?: string;
  raw?: any;
  methods?: string[];
  timeoutMs?: number;
};

export type VoiceRoomBaseEvent = {
  at: number;
  source: VoiceRoomSource;
  room: {
    chatId: number | string;
    callId?: number | string;
  };
  raw?: any;
};

export type VoiceRoomMetaEvent = VoiceRoomBaseEvent & {
  meta: VoiceRoomMeta;
};

export type VoiceRoomLiveOnEvent = VoiceRoomBaseEvent & {
  liveOn: boolean;
  previousLiveOn: boolean;
  meta: VoiceRoomMeta | null;
};

export type VoiceRoomJoinableEvent = VoiceRoomBaseEvent & {
  joinable: boolean;
  previousJoinable: boolean;
  joinInfo: VoiceRoomJoinInfo | null;
  meta: VoiceRoomMeta | null;
};

export type VoiceRoomStartedEvent = VoiceRoomBaseEvent & {
  trigger?: string;
};

export type VoiceRoomEndedEvent = VoiceRoomBaseEvent & {
  reason?: string;
};

export type VoiceRoomUser = {
  userId: number | string;
  role?: 'moderator' | 'speaker' | 'listener' | 'unknown';
  micOn?: boolean;
  camOn?: boolean;
  handUp?: boolean;
  muted?: boolean;
  voiceFilter?: number;
  raw?: any;
};

export type VoiceRoomMembersEvent = VoiceRoomBaseEvent & {
  moderators: VoiceRoomUser[];
  speakers: VoiceRoomUser[];
  listeners: VoiceRoomUser[];
};

export type VoiceRoomNotifyEvent = VoiceRoomBaseEvent & {
  notifyType: VoiceRoomNotifyType;
  notifyCode: number;
  destUserId?: number | string;
  speakerRequestors?: Array<number | string>;
};

export type VoiceRoomResponseEvent = VoiceRoomBaseEvent & {
  requestType: VoiceRoomRequestType | string;
  code: number;
  codeName: VoiceRoomResponseCodeName | string;
  ok: boolean;
  targetUserId?: number | string;
};

export type VoiceRoomRoomInfoEvent = VoiceRoomBaseEvent & {
  reqSpeakerPermissionEnabled: boolean;
  shareContent: string;
  shareUserId: number | string;
  shareTimeStamp: number;
  shareMode: number;
  titleContent: string;
  titleUserId: number | string;
  titleTimeStamp: number;
  titleMode: number;
};

export type VoiceRoomRemainTimeEvent = VoiceRoomBaseEvent & {
  remainTime: number;
};

export type VoiceRoomMicForcedEvent = VoiceRoomBaseEvent & {
  isMicOff: boolean;
  userId?: number | string;
};

export type VoiceRoomReactionEvent = VoiceRoomBaseEvent & {
  reaction: string;
  userId: number | string;
};

export type VoiceRoomErrorEvent = VoiceRoomBaseEvent & {
  requestType?: VoiceRoomRequestType | string;
  code?: number;
  message: string;
};

export type VoiceRoomRawEvent = VoiceRoomBaseEvent & {
  method?: string;
  body?: any;
};

export type VoiceRoomEventMap = {
  'voiceroom:meta': VoiceRoomMetaEvent;
  'voiceroom:liveon': VoiceRoomLiveOnEvent;
  'voiceroom:joinable': VoiceRoomJoinableEvent;
  'voiceroom:started': VoiceRoomStartedEvent;
  'voiceroom:ended': VoiceRoomEndedEvent;
  'voiceroom:members': VoiceRoomMembersEvent;
  'voiceroom:notify': VoiceRoomNotifyEvent;
  'voiceroom:response': VoiceRoomResponseEvent;
  'voiceroom:roomInfo': VoiceRoomRoomInfoEvent;
  'voiceroom:remainTime': VoiceRoomRemainTimeEvent;
  'voiceroom:micForced': VoiceRoomMicForcedEvent;
  'voiceroom:reaction': VoiceRoomReactionEvent;
  'voiceroom:error': VoiceRoomErrorEvent;
  'voiceroom:raw': VoiceRoomRawEvent;
};

export type VoiceRoomEventHandler<T> =
  | ((event: T) => void)
  | ((chat: any, event: T) => void);

export type VoiceRoomChatModule = {
  getMeta: (chatId: number | string) => Promise<VoiceRoomMeta | null>;
  refreshMeta: (chatId: number | string) => Promise<VoiceRoomMeta | null>;
  isLiveOn: (chatId: number | string) => Promise<boolean>;
  getJoinInfo: (chatId: number | string) => Promise<VoiceRoomJoinInfo | null>;
  getCurrent: () => VoiceRoomCurrentInfo;
  join: (joinInfo: VoiceRoomJoinInfo | { chatId: number | string }, opts?: VoiceRoomControlOptions) => Promise<VoiceRoomControlResult>;
  leave: (opts?: VoiceRoomControlOptions) => Promise<VoiceRoomControlResult>;
  requestSpeakerPermission: (opts?: VoiceRoomControlOptions) => Promise<VoiceRoomControlResult>;
  cancelSpeakerPermission: (opts?: VoiceRoomControlOptions) => Promise<VoiceRoomControlResult>;
  acceptSpeakerInvitation: (opts?: VoiceRoomControlOptions) => Promise<VoiceRoomControlResult>;
  declineSpeakerInvitation: (opts?: VoiceRoomControlOptions) => Promise<VoiceRoomControlResult>;
  acceptModeratorInvitation: (opts?: VoiceRoomControlOptions) => Promise<VoiceRoomControlResult>;
  declineModeratorInvitation: (opts?: VoiceRoomControlOptions) => Promise<VoiceRoomControlResult>;
  inviteAsSpeaker: (userId: number | string, opts?: VoiceRoomControlOptions) => Promise<VoiceRoomControlResult>;
  inviteAsModerator: (userId: number | string, opts?: VoiceRoomControlOptions) => Promise<VoiceRoomControlResult>;
  authorizeSpeakerPermission: (userId: number | string, opts?: VoiceRoomControlOptions) => Promise<VoiceRoomControlResult>;
  rejectSpeakerPermission: (userId: number | string, opts?: VoiceRoomControlOptions) => Promise<VoiceRoomControlResult>;
  revokeSpeakerPermission: (userId: number | string, opts?: VoiceRoomControlOptions) => Promise<VoiceRoomControlResult>;
  revokeModeratorPrivileges: (userId: number | string, opts?: VoiceRoomControlOptions) => Promise<VoiceRoomControlResult>;
  setReqSpeakerPermissionEnabled: (enabled: boolean, opts?: VoiceRoomControlOptions) => Promise<VoiceRoomControlResult>;
  shareContent: (content: string, clear?: boolean, opts?: VoiceRoomControlOptions) => Promise<VoiceRoomControlResult>;
  changeTitle: (title: string, opts?: VoiceRoomControlOptions) => Promise<VoiceRoomControlResult>;
  raiseHand: (opts?: VoiceRoomControlOptions) => Promise<VoiceRoomControlResult>;
  lowerHand: (opts?: VoiceRoomControlOptions) => Promise<VoiceRoomControlResult>;
  lowerHandOf: (userId: number | string, opts?: VoiceRoomControlOptions) => Promise<VoiceRoomControlResult>;
  setMyMicMuted: (muted: boolean, opts?: VoiceRoomControlOptions) => Promise<VoiceRoomControlResult>;
  setSpeakerOutputMuted: (muted: boolean, opts?: VoiceRoomControlOptions) => Promise<VoiceRoomControlResult>;
  turnOffRemoteMic: (userId: number | string, opts?: VoiceRoomControlOptions) => Promise<VoiceRoomControlResult>;
  turnOffRemoteCamera: (userId: number | string, opts?: VoiceRoomControlOptions) => Promise<VoiceRoomControlResult>;
  sendReaction: (reaction: string, opts?: VoiceRoomControlOptions) => Promise<VoiceRoomControlResult>;
  setVoiceFilter: (value: number, opts?: VoiceRoomControlOptions) => Promise<VoiceRoomControlResult>;
};

export const VOICE_ROOM_NOTIFY_TYPE_BY_CODE: Record<number, VoiceRoomNotifyType> = {
  11: 'REQ_SPEAKER_PERMISSION',
  12: 'CANCEL_SPEAKER_PERMISSION',
  13: 'REVOKED_MODERATOR_PRIVILEGES',
  21: 'INVITED_AS_MODERATOR',
  22: 'REVOKED_SPEAKER_PERMISSION',
  31: 'AUTHORIZED_SPEAKER_PERMISSION',
  32: 'REJECTED_SPEAKER_PERMISSION',
  33: 'INVITED_AS_SPEAKER',
  1000: 'CHANGED_SPK_REQUESTORS',
};

export const VOICE_ROOM_RESPONSE_CODE_NAME_BY_CODE: Record<number, VoiceRoomResponseCodeName> = {
  [-9999]: 'NOT_IMPLEMENTED',
  0: 'SUCCESS',
  13: 'FAIL',
  18: 'NO_PERMISSION',
  19: 'INVALID_STATE',
  21: 'DISABLE_REQUEST_SPEAKER_PERMISSION',
  25: 'SPEAKER_IS_FULL',
  27: 'INVALID_ROLE',
  28: 'ALREADY_PROCESSED',
  29: 'CHANGE_RESTRICTED',
  30: 'FORBIDDEN_WORD',
};

export const VOICE_ROOM_REQUEST_TYPE_BY_ORDINAL: Record<number, VoiceRoomRequestType> = {
  0: 'SPEAKER_PERMISSION',
  1: 'CANCEL_SPEAKER_PERMISSION',
  2: 'ACCEPT_SPEAKER_INVITATION',
  3: 'ACCEPT_MODERATOR_INVITATION',
  4: 'AUTHORIZE_SPEAKER_PERMISSION',
  5: 'INVITE_AS_SPEAKER',
  6: 'SHARE_CONTENT',
  7: 'CHANGE_TITLE',
};

export function resolveVoiceRoomNotifyType(code: number): VoiceRoomNotifyType {
  return VOICE_ROOM_NOTIFY_TYPE_BY_CODE[code] || 'UNKNOWN';
}

export function resolveVoiceRoomResponseCodeName(code: number): VoiceRoomResponseCodeName {
  return VOICE_ROOM_RESPONSE_CODE_NAME_BY_CODE[code] || 'UNKNOWN';
}

export function resolveVoiceRoomRequestType(value: any): VoiceRoomRequestType | string {
  if (typeof value === 'string' && value.trim()) {
    return value.trim().toUpperCase();
  }
  if (typeof value === 'number') {
    return VOICE_ROOM_REQUEST_TYPE_BY_ORDINAL[value] || 'UNKNOWN';
  }
  return 'UNKNOWN';
}
