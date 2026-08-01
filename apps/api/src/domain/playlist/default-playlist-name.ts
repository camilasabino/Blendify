export function buildDefaultPlaylistName(input: { names: string[] }): string {
  const names = input.names.map((n) => n.trim()).filter(Boolean);

  if (names.length === 0) return 'Blendify · Mix';
  if (names.length === 1) return truncate(`Blendify · Mix · ${names[0]}`);
  if (names.length === 2) {
    return truncate(`Blendify · Mix · ${names[0]} + ${names[1]}`);
  }
  return truncate(`Blendify · Mix · ${names[0]} + ${names.length - 1}`);
}

export function buildDefaultPlaylistDescription(input: {
  names: string[];
}): string {
  const names = input.names.map((n) => n.trim()).filter(Boolean);
  if (names.length === 0) {
    return 'Made with Blendify.';
  }
  if (names.length === 1) {
    return truncate(`Made with Blendify from ${names[0]}.`, 300);
  }
  if (names.length === 2) {
    return truncate(
      `Made with Blendify from ${names[0]} and ${names[1]}.`,
      300,
    );
  }
  return truncate(
    `Made with Blendify from ${names[0]} and ${names.length - 1} more.`,
    300,
  );
}

function truncate(value: string, max = 100): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}
