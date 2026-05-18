type XanoRequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
};

export function hasXanoConfig(): boolean {
  return Boolean(process.env.XANO_BASE_URL);
}

export async function xanoRequest<T>(endpoint: string, options: XanoRequestOptions = {}): Promise<T> {
  const baseUrl = process.env.XANO_BASE_URL;
  const apiKey = process.env.XANO_API_KEY;

  if (!baseUrl) {
    throw new Error("Missing XANO_BASE_URL. Add it in .env.local.");
  }

  const method = options.method ?? "GET";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const url = endpoint.startsWith("http") ? endpoint : `${baseUrl}${endpoint}`;

  const response = await fetch(url, {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Xano request failed (${response.status}): ${message}`);
  }

  return (await response.json()) as T;
}
