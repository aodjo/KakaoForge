import { type MemberTypeValue } from './member-type';
import { type ReactionTypeValue } from './reaction';
import { type MemberAction, type MessageEvent, type MemberEvent, type DeleteEvent, type HideEvent } from './events';
import {
  type SendOptions,
  type ReplyTarget,
  type ReplyOptions,
  type ReactionOptions,
  type OpenChatKickOptions,
  type OpenChatBlindOptions,
  type EditMessageOptions,
  type UploadOptions,
  type UploadResult,
  type AttachmentInput,
  type AttachmentSendOptions,
  type VideoQuality,
} from './options';
import { type LocationPayload, type SchedulePayload, type ContactPayload, type ProfilePayload } from './payloads';
import { type VoiceRoomChatModule, type VoiceRoomMeta } from './voiceroom';

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

export type AuthFile = {
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
  sendLink: (chatId: number | string, link: string | AttachmentInput, opts?: AttachmentSendOptions) => Promise<any>;
  voiceRoom: VoiceRoomChatModule;
  type?: MemberTypeValue;
};

export type ChatRoomInfo = {
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
  voiceRoomMeta?: VoiceRoomMeta;
};

export type ChatListCursor = {
  lastTokenId: number | string;
  lastChatId: number | string;
};

export type MessageHandler = ((chat: ChatModule, msg: MessageEvent) => void) | ((msg: MessageEvent) => void);
export type MemberEventHandler = ((chat: ChatModule, evt: MemberEvent) => void) | ((evt: MemberEvent) => void);
export type DeleteEventHandler = ((chat: ChatModule, evt: DeleteEvent) => void) | ((evt: DeleteEvent) => void);
export type HideEventHandler = ((chat: ChatModule, evt: HideEvent) => void) | ((evt: HideEvent) => void);

export type MemberNameCache = Map<string, Map<string, string>>;
