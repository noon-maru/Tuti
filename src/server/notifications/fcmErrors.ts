export function isInvalidRegistrationError(status: number, body: string) {
  return (
    (status === 400 || status === 404) &&
    (body.includes("UNREGISTERED") ||
      body.includes("registration-token-not-registered"))
  );
}
