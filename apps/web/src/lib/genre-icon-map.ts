import type { LucideIcon } from 'lucide-react'
import {
  AudioWaveform,
  CloudMoon,
  Cpu,
  Disc3,
  Drum,
  Flame,
  Flower2,
  Guitar,
  Headphones,
  Heart,
  Mic2,
  Mountain,
  Music2,
  Music4,
  PartyPopper,
  Piano,
  Radio,
  Skull,
  Sparkles,
  Star,
  Trees,
  Waves,
  Zap,
} from 'lucide-react'

type GenreIconRule = {
  test: RegExp
  icon: LucideIcon
}

const GENRE_ICON_RULES: GenreIconRule[] = [
  { test: /\bk-?pop\b|\bj-?pop\b|\bc-?pop\b/i, icon: Star },
  {
    test: /\breggaeton\b|\bdancehall\b|\bsalsa\b|\bbachata\b|\blatin\b/i,
    icon: Flame,
  },
  { test: /\bhip\s*hop\b|\brap\b|\bgrime\b/i, icon: Mic2 },
  { test: /\btrap\b|\bdrill\b/i, icon: Headphones },
  { test: /\br&b\b|\brnb\b|\bsoul\b|\bneo[\s-]?soul\b/i, icon: Heart },
  { test: /\bafrobeats?\b|\bafro\b|\bhighlife\b/i, icon: Drum },
  {
    test: /\bdrum\s*(and|&)\s*bass\b|\bdnb\b|\bjungle\b/i,
    icon: AudioWaveform,
  },
  { test: /\btechno\b|\btech[\s-]?house\b/i, icon: Cpu },
  { test: /\bhouse\b|\bedm\b|\belectro\b|\belectroni/i, icon: Disc3 },
  { test: /\bdance\b|\bdisco\b|\bfunk\b/i, icon: PartyPopper },
  { test: /\bsynthwave\b|\bvaporwave\b|\bretrowave\b/i, icon: Radio },
  { test: /\blo-?fi\b|\bambient\b|\bchill\b|\bdowntempo\b/i, icon: CloudMoon },
  { test: /\bmetal\b|\bhardcore\b|\bdeath\b|\bblack metal\b/i, icon: Skull },
  { test: /\bpunk\b|\bemo\b|\bgrunge\b/i, icon: Zap },
  { test: /\bindie\b|\balternative\b/i, icon: Flower2 },
  { test: /\brock\b/i, icon: Guitar },
  { test: /\bcountry\b|\bbluegrass\b|\bamericana\b/i, icon: Mountain },
  {
    test: /\bfolk\b|\bsinger[\s-]?songwriter\b|\bacoustic\b/i,
    icon: Trees,
  },
  { test: /\bjazz\b|\bbebop\b/i, icon: Piano },
  { test: /\bblues\b/i, icon: Waves },
  { test: /\bclassical\b|\bopera\b|\borchestr/i, icon: Music4 },
  { test: /\bpop\b/i, icon: Sparkles },
  { test: /\bgospel\b|\bworship\b/i, icon: Heart },
  { test: /\breggae\b|\bdub\b/i, icon: Disc3 },
]

export function resolveGenreIcon(name: string, id?: string): LucideIcon {
  const haystack = `${name} ${id ?? ''}`.trim()
  for (const rule of GENRE_ICON_RULES) {
    if (rule.test.test(haystack)) return rule.icon
  }
  return Music2
}
