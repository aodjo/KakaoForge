export const MemberType = {
  OpenChat: {
    Owner: 1,
    Manager: 4,
    Member: 2,
  },
} as const;

export type MemberTypeValue = typeof MemberType.OpenChat[keyof typeof MemberType.OpenChat] | number;