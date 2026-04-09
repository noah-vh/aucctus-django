import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";

const FETCH_TIMEOUT_MS = 10_000;

/**
 * Strip HTML to readable plain text.
 * 1. Remove <script> and <style> blocks with their content.
 * 2. Replace block-level tags with newlines for readability.
 * 3. Strip remaining tags.
 * 4. Collapse whitespace.
 */
function htmlToText(html: string): string {
  // Remove script and style blocks entirely (including content)
  let text = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");

  // Replace common block-level tags with newlines
  text = text
    .replace(/<\/?(p|div|section|article|header|footer|h[1-6]|li|tr|br)[^>]*>/gi, "\n")
    .replace(/<\/?(ul|ol|table|thead|tbody)[^>]*>/gi, "\n");

  // Strip all remaining HTML tags
  text = text.replace(/<[^>]+>/g, "");

  // Decode common HTML entities
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");

  // Collapse runs of whitespace and trim
  text = text
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return text;
}

const parameters = Type.Object({
  url: Type.String({ description: "The URL to fetch" }),
  max_length: Type.Optional(
    Type.Number({
      description: "Maximum characters to return (default 8000)",
    })
  ),
});

type WebFetchParams = Static<typeof parameters>;

export const webFetchTool: AgentTool<typeof parameters> = {
  name: "web_fetch",
  label: "Web Fetch",
  description:
    "Fetch and extract the text content of a URL. Use this to read company pages, product pages, " +
    "blog posts, or any publicly accessible web page. Returns cleaned plain text.",
  parameters,
  execute: async (_toolCallId, params: WebFetchParams, signal, _onUpdate) => {
    const maxLength = params.max_length ?? 8000;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    // Merge caller's signal with our timeout signal if provided.
    const fetchSignal = signal
      ? (() => {
          const merged = new AbortController();
          signal.addEventListener("abort", () => merged.abort());
          controller.signal.addEventListener("abort", () => merged.abort());
          return merged.signal;
        })()
      : controller.signal;

    try {
      const response = await fetch(params.url, {
        signal: fetchSignal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; AucctusBot/1.0; +https://aucctus.com)",
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          content: [
            {
              type: "text" as const,
              text: `HTTP error ${response.status} (${response.statusText}) fetching ${params.url}`,
            },
          ],
          details: { url: params.url, status: response.status },
        };
      }

      const contentType = response.headers.get("content-type") ?? "";
      const isHtml =
        contentType.includes("text/html") ||
        contentType.includes("application/xhtml");

      const raw = await response.text();
      const text = isHtml ? htmlToText(raw) : raw;
      const truncated =
        text.length > maxLength
          ? text.slice(0, maxLength) + "\n\n[content truncated]"
          : text;

      return {
        content: [
          {
            type: "text" as const,
            text: `Content from ${params.url}:\n\n${truncated}`,
          },
        ],
        details: {
          url: params.url,
          status: response.status,
          content_length: text.length,
          truncated: text.length > maxLength,
        },
      };
    } catch (err: unknown) {
      clearTimeout(timeoutId);

      const message = err instanceof Error ? err.message : String(err);
      const isTimeout =
        err instanceof Error &&
        (err.name === "AbortError" || message.includes("abort"));

      return {
        content: [
          {
            type: "text" as const,
            text: isTimeout
              ? `Timeout fetching ${params.url} (limit: ${FETCH_TIMEOUT_MS / 1000}s)`
              : `Network error fetching ${params.url}: ${message}`,
          },
        ],
        details: {
          url: params.url,
          error: message,
          timeout: isTimeout,
        },
      };
    }
  },
};
