export type WorkspaceColorPair = {
  background: string;
  foreground: string;
  label: string;
  threshold: 3 | 4.5;
};

export type WorkspaceContrastResult = WorkspaceColorPair & {
  ok: boolean;
  ratio: number;
};

export function workspaceContrastRatio(foreground: string, background: string) {
  const foregroundLuminance = workspaceRelativeLuminance(foreground);
  const backgroundLuminance = workspaceRelativeLuminance(background);
  if (foregroundLuminance === null || backgroundLuminance === null) return null;
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

export function inspectWorkspaceContrast(pairs: WorkspaceColorPair[]): WorkspaceContrastResult[] {
  return pairs.map((pair) => {
    const ratio = workspaceContrastRatio(pair.foreground, pair.background) ?? 0;
    return { ...pair, ok: ratio >= pair.threshold, ratio };
  });
}

export function formatWorkspaceContrastRatio(ratio: number) {
  return `${ratio.toFixed(2)}:1`;
}

function workspaceRelativeLuminance(value: string) {
  if (!/^#[0-9a-f]{6}$/i.test(value)) return null;
  const channels = [value.slice(1, 3), value.slice(3, 5), value.slice(5, 7)]
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}
