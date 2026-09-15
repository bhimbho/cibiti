"use client";

export type ApiResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string; details?: unknown };

/** JSON request helper for staff screens; never throws. */
export async function callApi<T = unknown>(url: string, method: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error ?? "Something went wrong.", details: data.details };
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, error: "No connection to the server. Check the network and try again." };
  }
}
