import { type AttachmentInput } from './options';

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
