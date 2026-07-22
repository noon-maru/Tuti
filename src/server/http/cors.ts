const capacitorOrigins = new Set([
  "capacitor://localhost",
  "https://localhost",
  "https://tuti.today",
]);

export function isRequestOriginAllowed(request: Request) {
  const origin = request.headers.get("origin");

  if (!origin) return true;
  if (capacitorOrigins.has(origin)) return true;

  return getRequestOrigins(request).has(origin);
}

export function withCors(request: Request, response: Response) {
  const origin = request.headers.get("origin");

  if (!origin || !isRequestOriginAllowed(request)) return response;

  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Vary", appendVary(headers.get("Vary"), "Origin"));

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function createPreflightResponse(request: Request) {
  if (!isRequestOriginAllowed(request)) {
    return Response.json({ error: "허용되지 않은 요청 출처예요." }, { status: 403 });
  }

  const response = new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Max-Age": "86400",
    },
  });

  return withCors(request, response);
}

function appendVary(currentValue: string | null, value: string) {
  const values = new Set(
    (currentValue ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );

  values.add(value);
  return [...values].join(", ");
}

function getRequestOrigins(request: Request) {
  const requestUrl = new URL(request.url);
  const origins = new Set([requestUrl.origin]);
  const host = firstForwardedValue(
    request.headers.get("x-forwarded-host") ?? request.headers.get("host"),
  );

  if (!host) return origins;

  const forwardedProtocol = firstForwardedValue(
    request.headers.get("x-forwarded-proto"),
  );
  const protocol = forwardedProtocol
    ? `${forwardedProtocol.replace(/:$/, "")}:`
    : requestUrl.protocol;

  origins.add(`${protocol}//${host}`);

  return origins;
}

function firstForwardedValue(value: string | null) {
  return value?.split(",", 1)[0]?.trim();
}
