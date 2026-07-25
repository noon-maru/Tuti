export type AnonymousSession = {
  accessToken: string;
  userId: string;
};

export type AnonymousSessionResponse = {
  session: AnonymousSession;
};
