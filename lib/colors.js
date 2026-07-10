// Minimal ANSI color helper. Colors are disabled automatically when output is
// not a TTY, when NO_COLOR is set, or for dumb terminals — so piped/CI output
// stays clean.

const CODES = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
}

export const colorEnabled =
  Boolean(process.stdout.isTTY) && !process.env.NO_COLOR && process.env.TERM !== "dumb"

// paint("text", "green", "bold") → colored string (or plain when disabled).
export function paint(text, ...styles) {
  if (!colorEnabled || styles.length === 0) return String(text)
  const prefix = styles.map((style) => CODES[style] ?? "").join("")
  return `${prefix}${text}${CODES.reset}`
}

// OSC 8 terminal hyperlink — clickable in VS Code's terminal, iTerm2, etc.
// Falls back to plain text (URL appended when it differs) when not a TTY.
export function link(url, label = url) {
  if (!colorEnabled) return label === url ? url : `${label} (${url})`
  return `\x1b]8;;${url}\x07${label}\x1b]8;;\x07`
}
