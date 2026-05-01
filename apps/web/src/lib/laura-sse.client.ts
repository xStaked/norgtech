import { getSessionTokenClient } from "./auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export function streamLauraMessage(
  payload: { sessionId?: string; content: string; contextType?: string; contextEntityId?: string },
  onEvent: (event: unknown) => void,
  onError: (error: Error) => void,
): AbortController {
  const controller = new AbortController();
  const token = getSessionTokenClient();
  const params = new URLSearchParams({ content: payload.content });
  if (payload.sessionId) params.set("sessionId", payload.sessionId);
  if (payload.contextType) params.set("contextType", payload.contextType);
  if (payload.contextEntityId) params.set("contextEntityId", payload.contextEntityId);

  const url = `${API_URL}/laura/messages/stream?${params.toString()}`;

  fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream" },
    signal: controller.signal,
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Laura streaming failed: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No readable stream");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("data:")) {
            const data = line.slice(5).trim();
            try {
              onEvent(JSON.parse(data));
            } catch {
              // Skip non-JSON lines
            }
          }
        }
      }
    })
    .catch((error: unknown) => {
      if (error instanceof Error && error.name !== "AbortError") {
        onError(error);
      }
    });

  return controller;
}