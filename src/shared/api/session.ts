export const authProviders = ["apple", "google", "kakao"] as const;
export type OAuthProvider = (typeof authProviders)[number];
export type AuthProvider = "email" | OAuthProvider;
export type UserRole = "user" | "admin";

export type AccountIdentityProfile = {
  id: string;
  provider: AuthProvider;
  email?: string;
};

export type AccountProfile = {
  email?: string;
  displayName?: string;
  identities?: AccountIdentityProfile[];
  providers: AuthProvider[];
  role?: UserRole;
};

export type TutiSession = {
  accessToken: string;
  userId: string;
  account?: AccountProfile;
};

export type SessionResponse = {
  session: TutiSession;
};

export type AccountDeletionResponse = {
  deleted: true;
  deletionReference: string;
};

export type AccountProfileUpdateRequest = {
  displayName: string;
};

export type AccountProfileUpdateResponse = {
  displayName: string;
};

export type AccountProfileResponse = {
  account: AccountProfile;
};

export type AccountIdentityUnlinkResponse = AccountProfileResponse & {
  unlinked: true;
};

export type EmailCodeRequest = {
  email: string;
};

export type AccountJournalResolution = "merge" | "discard";

export type EmailCodeVerification = EmailCodeRequest & {
  code: string;
  journalResolution?: AccountJournalResolution;
};

export type EmailCodeRequestResponse = {
  expiresInSeconds: number;
  message: string;
};

export type EmailCodeVerificationResult =
  | {
      status: "authenticated";
      session: TutiSession;
      linked?: boolean;
    }
  | {
      status: "journal-resolution-required";
      currentJournalCount: number;
    };

export type OAuthCompletionRequest = {
  ticket: string;
  journalResolution?: AccountJournalResolution;
};

export type OAuthCompletionResult = EmailCodeVerificationResult;

export type OAuthStartResponse = {
  authorizationUrl: string;
};
