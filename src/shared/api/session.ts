export const authProviders = ["apple", "google", "kakao"] as const;
export type OAuthProvider = (typeof authProviders)[number];
export type AuthProvider = "email" | OAuthProvider;
export type UserRole = "user" | "admin";

export type AccountProfile = {
  email?: string;
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
