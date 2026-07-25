export type AccountProfile = {
  email: string;
};

export type TutiSession = {
  accessToken: string;
  userId: string;
  account?: AccountProfile;
};

export type SessionResponse = {
  session: TutiSession;
};

export type AccountCredentials = {
  email: string;
  password: string;
};
