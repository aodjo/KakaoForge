export const AttachmentTypes = {
  Photo: 'photo',
  Video: 'video',
  Audio: 'audio',
  File: 'file',
  Contact: 'contact',
  Location: 'location',
  Schedule: 'schedule',
  Link: 'link',
  Unknown: 'unknown',
} as const;

export type AttachmentType = typeof AttachmentTypes[keyof typeof AttachmentTypes];

export type AttachmentBase<T extends AttachmentType, D = any> = {
  type: T;
  raw: any;
  data?: D;
};

export type ScheduleAttachmentData = {
  calendar: any;
  preview: any;
  card: any;
};

export type LocationAttachmentData = {
  lat: number | null;
  lng: number | null;
  address: string | null;
  title: string | null;
};

export type ContactAttachmentData = {
  name: string | null;
  phone: string | null;
  phones: string[] | null;
  email: string | null;
  vcard: string | null;
};

export type MediaAttachmentData = {
  urls: any;
  url: string | null;
  name: string | null;
  size: number | null;
  mime: string | null;
  width: number | null;
  height: number | null;
  duration: number | null;
};

export type LinkAttachmentData = {
  url: string | null;
  text: string | null;
  title: string | null;
};

export type ScheduleAttachment = AttachmentBase<'schedule', ScheduleAttachmentData>;
export type LocationAttachment = AttachmentBase<'location', LocationAttachmentData>;
export type ContactAttachment = AttachmentBase<'contact', ContactAttachmentData>;
export type PhotoAttachment = AttachmentBase<'photo', MediaAttachmentData>;
export type VideoAttachment = AttachmentBase<'video', MediaAttachmentData>;
export type AudioAttachment = AttachmentBase<'audio', MediaAttachmentData>;
export type FileAttachment = AttachmentBase<'file', MediaAttachmentData>;
export type LinkAttachment = AttachmentBase<'link', LinkAttachmentData>;
export type UnknownAttachment = AttachmentBase<'unknown', any>;

export type AttachmentItem =
  | ScheduleAttachment
  | LocationAttachment
  | ContactAttachment
  | PhotoAttachment
  | VideoAttachment
  | AudioAttachment
  | FileAttachment
  | LinkAttachment
  | UnknownAttachment;
