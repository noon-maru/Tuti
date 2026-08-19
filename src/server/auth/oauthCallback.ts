export async function readOAuthCallbackParameters(request: Request) {
  if (request.method === "POST") {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/x-www-form-urlencoded")) {
      return new URLSearchParams(await request.text());
    }
  }

  return new URL(request.url).searchParams;
}
