type DescriptionKey =
  | 'playlist.description.empty'
  | 'playlist.description.one'
  | 'playlist.description.two'
  | 'playlist.description.many'

type NameKey =
  | 'playlist.name.mix'
  | 'playlist.name.mixEmpty'
  | 'playlist.name.discover'
  | 'playlist.name.discoverFallback'

type DescriptionTranslate = (
  key: DescriptionKey,
  vars?: Record<string, string | number>,
) => string

type NameTranslate = (
  key: NameKey,
  vars?: Record<string, string | number>,
) => string

export const GENERATED_NAME_PREFIX = 'Blendify · '

export function buildDefaultPlaylistName(input: {
  names: string[]
  translate?: NameTranslate
}): string {
  const names = input.names.map((n) => n.trim()).filter(Boolean)
  if (names.length === 0) {
    return input.translate
      ? truncate(input.translate('playlist.name.mixEmpty'))
      : `${GENERATED_NAME_PREFIX}Mix`
  }

  let seeds: string
  if (names.length === 1) {
    seeds = names[0]
  } else if (names.length === 2) {
    seeds = `${names[0]} + ${names[1]}`
  } else {
    seeds = `${names[0]} + ${names.length - 1}`
  }

  return truncate(
    input.translate
      ? input.translate('playlist.name.mix', { seeds })
      : `${GENERATED_NAME_PREFIX}Mix · ${seeds}`,
  )
}

export function buildDiscoverPlaylistName(
  seedName: string,
  translate?: NameTranslate,
): string {
  const fallback = translate
    ? translate('playlist.name.discoverFallback')
    : 'Discover'
  const seed = seedName.trim() || fallback
  return truncate(
    translate
      ? translate('playlist.name.discover', { seed })
      : `${GENERATED_NAME_PREFIX}Discover · ${seed}`,
  )
}

export function buildDefaultPlaylistDescription(
  names: string[],
  translate?: DescriptionTranslate,
): string {
  const clean = names.map((n) => n.trim()).filter(Boolean)
  if (clean.length === 0) {
    return translate
      ? truncate(translate('playlist.description.empty'), 300)
      : 'Made with Blendify.'
  }
  if (clean.length === 1) {
    return truncate(
      translate
        ? translate('playlist.description.one', { name: clean[0] })
        : `Made with Blendify from ${clean[0]}.`,
      300,
    )
  }
  if (clean.length === 2) {
    return truncate(
      translate
        ? translate('playlist.description.two', {
            first: clean[0],
            second: clean[1],
          })
        : `Made with Blendify from ${clean[0]} and ${clean[1]}.`,
      300,
    )
  }
  return truncate(
    translate
      ? translate('playlist.description.many', {
          first: clean[0],
          count: clean.length - 1,
        })
      : `Made with Blendify from ${clean[0]} and ${clean.length - 1} more.`,
    300,
  )
}

function truncate(value: string, max = 100): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`
}
