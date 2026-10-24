export let csrfToken = "";
export function setCsrf(value: string) {
  csrfToken = value;
}
export async function api<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    credentials: "include",
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken,
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({
    error: {
      message:
        response.status === 429
          ? "Too many requests. Please wait before retrying."
          : "The service returned an unexpected response. Please retry.",
    },
  }));
  if (!response.ok)
    throw new Error(data.error?.message ?? "Request could not be completed");
  return data;
}
export const post = (path: string, body: unknown = {}, key?: string) =>
  api(path, {
    method: "POST",
    body: JSON.stringify(body),
    headers: key ? { "Idempotency-Key": key } : {},
  });
export function label(value: string) {
  return (
    value
      ?.replaceAll("_", " ")
      .toLowerCase()
      .replace(/(^|\s)\S/g, (s) => s.toUpperCase()) ?? ""
  );
}
