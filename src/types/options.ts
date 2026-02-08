import { Long } from 'bson';

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

// Forward declaration for circular dependency
export type AttachmentInput = Record<string, any> | any[] | string | UploadResult | { attachment: any };

export type AttachmentSendOptions = SendOptions & UploadOptions & {
  text?: string;
};
