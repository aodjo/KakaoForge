import { type MemberTypeValue } from './member-type';

export type TransportMode = 'loco' | null;

export type MessageEvent = {
  message: {
    id: number | string;
    text: string;
    type: number;
    logId: number | string;
  };
  attachmentsRaw: any[];
  sender: {
    id: number | string;
    name: string;
    type: MemberTypeValue;
  };
  room: {
    id: number | string;
    name: string;
    isGroupChat: boolean;
    isOpenChat: boolean;
    openLinkId?: number | string;
  };
  raw: any;
  // Legacy aliases for compatibility
  chatId: number | string;
  senderId: number | string;
  text: string;
  type: number;
  logId: number | string;
};

export type MemberAction = 'join' | 'leave' | 'invite' | 'kick';

export type MemberEvent = {
  type: MemberAction;
  room: MessageEvent['room'];
  actor?: MessageEvent['sender'];
  member?: {
    ids: Array<number | string>;
    names: string[];
  };
  members?: MessageEvent['sender'][];
  message?: MessageEvent;
  raw: any;
};

export type DeleteEvent = {
  type: 'delete';
  room: MessageEvent['room'];
  actor: MessageEvent['sender'];
  member: {
    ids: Array<number | string>;
    names: string[];
  };
  members: MessageEvent['sender'][];
  message: {
    id: number | string;
    logId: number | string;
  };
  raw: any;
  // Legacy aliases for compatibility
  chatId: number | string;
  logId: number | string;
};

export type HideEvent = {
  type: 'hide';
  room: MessageEvent['room'];
  actor: MessageEvent['sender'];
  member: {
    ids: Array<number | string>;
    names: string[];
  };
  members: MessageEvent['sender'][];
  message: {
    id: number | string;
    logId: number | string;
  };
  category?: string;
  report?: boolean;
  hidden?: boolean;
  coverType?: string;
  feedType?: number;
  raw: any;
  // Legacy aliases for compatibility
  chatId: number | string;
  logId: number | string;
};
