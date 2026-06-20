/**
 * Minimal User-Agent → { browser, os } parser, used to record where a passkey was
 * registered ("Chrome on Windows"). Deliberately tiny and dependency-free: it only
 * needs to recognize the mainstream browsers/OSes, and a wrong guess just makes a
 * label slightly less precise. Token order matters — Edge/Opera UAs also contain
 * "Chrome", and Chrome UAs also contain "Safari", so the more specific checks come
 * first and Safari/Chrome come last.
 */
export function parseUserAgent(
  ua: string | null | undefined,
): { browser: string | null; os: string | null } {
  if (!ua) return { browser: null, os: null };

  const os = /Windows NT/.test(ua)
    ? "Windows"
    : /iPhone|iPad|iPod/.test(ua)
      ? "iOS"
      : /Mac OS X|Macintosh/.test(ua)
        ? "macOS"
        : /Android/.test(ua)
          ? "Android"
          : /CrOS/.test(ua)
            ? "ChromeOS"
            : /Linux/.test(ua)
              ? "Linux"
              : null;

  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : null;

  return { browser, os };
}
