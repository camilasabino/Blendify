import type { GenreLabelLocale } from './index';
import { genreLookupKey } from './genre-lookup-key';

export type GenreLocalizedLabels = Readonly<
  Partial<Record<Exclude<GenreLabelLocale, 'en'>, string>>
>;

export const GENRE_LABELS: Readonly<Record<string, GenreLocalizedLabels>> = {
  'acoustic blues': { es: 'Blues acústico', pt: 'Blues acústico' },
  'acoustic rock': { es: 'Rock acústico', pt: 'Rock acústico' },
  'alternative country': { es: 'Country alternativo', pt: 'Country alternativo' },
  'alternative folk': { es: 'Folk alternativo', pt: 'Folk alternativo' },
  'alternative hip hop': { es: 'Hip hop alternativo', pt: 'Hip hop alternativo' },
  'alternative metal': { es: 'Metal alternativo', pt: 'Metal alternativo' },
  'alternative pop': { es: 'Pop alternativo', pt: 'Pop alternativo' },
  'alternative punk': { es: 'Punk alternativo', pt: 'Punk alternativo' },
  'alternative r&b': { es: 'R&B alternativo', pt: 'R&B alternativo' },
  'alternative rock': { es: 'Rock alternativo', pt: 'Rock alternativo' },
  'andalusian classical': {
    es: 'Música clásica andalusí',
    pt: 'Música clássica andaluza',
  },
  'atmospheric black metal': {
    es: 'Black metal atmosférico',
    pt: 'Black metal atmosférico',
  },
  'avant-garde jazz': { es: 'Jazz de vanguardia', pt: 'Jazz de vanguarda' },
  'avant-garde metal': { es: 'Metal de vanguardia', pt: 'Metal de vanguarda' },
  ballad: { es: 'Balada', pt: 'Balada' },
  baroque: { es: 'Barroco', pt: 'Barroco' },
  'baroque pop': { es: 'Pop barroco', pt: 'Pop barroco' },
  'beijing opera': { es: 'Ópera de Pekín', pt: 'Ópera de Pequim' },
  'british blues': { es: 'Blues británico', pt: 'Blues britânico' },
  'british folk rock': { es: 'Folk rock británico', pt: 'Folk rock britânico' },
  'burmese classical': {
    es: 'Música clásica birmana',
    pt: 'Música clássica birmanesa',
  },
  'cantonese opera': { es: 'Ópera cantonesa', pt: 'Ópera cantonesa' },
  'carnatic classical': {
    es: 'Música clásica carnática',
    pt: 'Música clássica carnática',
  },
  celtic: { es: 'Música celta', pt: 'Música celta' },
  'celtic metal': { es: 'Metal celta', pt: 'Metal celta' },
  'celtic punk': { es: 'Punk celta', pt: 'Punk celta' },
  'celtic rock': { es: 'Rock celta', pt: 'Rock celta' },
  'chamber pop': { es: 'Pop de cámara', pt: 'Pop de câmara' },
  "children's music": { es: 'Música infantil', pt: 'Música infantil' },
  'chinese classical': {
    es: 'Música clásica china',
    pt: 'Música clássica chinesa',
  },
  'chinese opera': { es: 'Ópera china', pt: 'Ópera chinesa' },
  'choral symphony': { es: 'Sinfonía coral', pt: 'Sinfonia coral' },
  'christian hip hop': { es: 'Hip hop cristiano', pt: 'Hip hop cristão' },
  'christian metal': { es: 'Metal cristiano', pt: 'Metal cristão' },
  'christian rock': { es: 'Rock cristiano', pt: 'Rock cristão' },
  'christmas music': { es: 'Música navideña', pt: 'Música natalina' },
  'classic blues': { es: 'Blues clásico', pt: 'Blues clássico' },
  'classic country': { es: 'Country clásico', pt: 'Country clássico' },
  'classic jazz': { es: 'Jazz clásico', pt: 'Jazz clássico' },
  'classic rock': { es: 'Rock clásico', pt: 'Rock clássico' },
  classical: { es: 'Música clásica', pt: 'Música clássica' },
  'classical period': { es: 'Período clásico', pt: 'Período clássico' },
  'conscious hip hop': { es: 'Hip hop consciente', pt: 'Hip hop consciente' },
  'contemporary christian': {
    es: 'Música cristiana contemporánea',
    pt: 'Música cristã contemporânea',
  },
  'contemporary classical': {
    es: 'Música clásica contemporánea',
    pt: 'Música clássica contemporânea',
  },
  'contemporary country': {
    es: 'Country contemporáneo',
    pt: 'Country contemporâneo',
  },
  'contemporary folk': { es: 'Folk contemporáneo', pt: 'Folk contemporâneo' },
  'contemporary gospel': {
    es: 'Gospel contemporáneo',
    pt: 'Gospel contemporâneo',
  },
  'contemporary jazz': { es: 'Jazz contemporáneo', pt: 'Jazz contemporâneo' },
  'contemporary r&b': { es: 'R&B contemporáneo', pt: 'R&B contemporâneo' },
  'east coast hip hop': {
    es: 'Hip hop de la Costa Este',
    pt: 'Hip hop da Costa Leste',
  },
  electroacoustic: { es: 'Música electroacústica', pt: 'Música eletroacústica' },
  electronic: { es: 'Electrónica', pt: 'Eletrônica' },
  'electronic rock': { es: 'Rock electrónico', pt: 'Rock eletrônico' },
  'experimental electronic': {
    es: 'Electrónica experimental',
    pt: 'Eletrônica experimental',
  },
  'experimental hip hop': {
    es: 'Hip hop experimental',
    pt: 'Hip hop experimental',
  },
  'experimental rock': { es: 'Rock experimental', pt: 'Rock experimental' },
  'funeral march': { es: 'Marcha fúnebre', pt: 'Marcha fúnebre' },
  'gothic metal': { es: 'Metal gótico', pt: 'Metal gótico' },
  'gothic rock': { es: 'Rock gótico', pt: 'Rock gótico' },
  'grand opera': { es: 'Gran ópera', pt: 'Grande ópera' },
  'gregorian chant': { es: 'Canto gregoriano', pt: 'Canto gregoriano' },
  'gypsy jazz': { es: 'Jazz gitano', pt: 'Jazz cigano' },
  'hindustani classical': {
    es: 'Música clásica hindustaní',
    pt: 'Música clássica hindustâni',
  },
  'hungarian folk': { es: 'Folk húngaro', pt: 'Folk húngaro' },
  'indian classical': {
    es: 'Música clásica india',
    pt: 'Música clássica indiana',
  },
  'instrumental hip hop': {
    es: 'Hip hop instrumental',
    pt: 'Hip hop instrumental',
  },
  'instrumental jazz': { es: 'Jazz instrumental', pt: 'Jazz instrumental' },
  'instrumental rock': { es: 'Rock instrumental', pt: 'Rock instrumental' },
  'irish folk': { es: 'Folk irlandés', pt: 'Folk irlandês' },
  'japanese classical': {
    es: 'Música clásica japonesa',
    pt: 'Música clássica japonesa',
  },
  'jazz fusion': { es: 'Jazz fusión' },
  'korean ballad': { es: 'Balada coreana', pt: 'Balada coreana' },
  'korean classical': {
    es: 'Música clásica coreana',
    pt: 'Música clássica coreana',
  },
  latin: { es: 'Música latina', pt: 'Música latina' },
  'latin ballad': { es: 'Balada latina', pt: 'Balada latina' },
  'latin disco': { es: 'Disco latino', pt: 'Disco latino' },
  'latin funk': { es: 'Funk latino', pt: 'Funk latino' },
  'latin house': { es: 'House latino', pt: 'House latino' },
  'latin jazz': { es: 'Jazz latino', pt: 'Jazz latino' },
  'latin pop': { es: 'Pop latino', pt: 'Pop latino' },
  'latin rock': { es: 'Rock latino', pt: 'Rock latino' },
  'latin soul': { es: 'Soul latino', pt: 'Soul latino' },
  lullaby: { es: 'Canción de cuna', pt: 'Canção de ninar' },
  march: { es: 'Marcha', pt: 'Marcha' },
  'marching band': { es: 'Banda de marcha', pt: 'Banda marcial' },
  medieval: { es: 'Música medieval', pt: 'Música medieval' },
  'melodic death metal': {
    es: 'Death metal melódico',
    pt: 'Death metal melódico',
  },
  'melodic metalcore': { es: 'Metalcore melódico', pt: 'Metalcore melódico' },
  minimalism: { es: 'Minimalismo', pt: 'Minimalismo' },
  'neo-progressive rock': {
    es: 'Rock neoprogresivo',
    pt: 'Rock neoprogressivo',
  },
  'neoclassical metal': { es: 'Metal neoclásico', pt: 'Metal neoclássico' },
  opera: { es: 'Ópera', pt: 'Ópera' },
  orchestral: { es: 'Orquestal', pt: 'Orquestral' },
  'orchestral jazz': { es: 'Jazz orquestal', pt: 'Jazz orquestral' },
  'oriental ballad': { es: 'Balada oriental', pt: 'Balada oriental' },
  'persian classical': {
    es: 'Música clásica persa',
    pt: 'Música clássica persa',
  },
  plainchant: { es: 'Canto llano', pt: 'Cantochão' },
  'political hip hop': { es: 'Hip hop político', pt: 'Hip hop político' },
  'post-minimalism': { es: 'Posminimalismo', pt: 'Pós-minimalismo' },
  'praise & worship': { es: 'Alabanza y adoración', pt: 'Louvor e adoração' },
  'progressive bluegrass': {
    es: 'Bluegrass progresivo',
    pt: 'Bluegrass progressivo',
  },
  'progressive country': {
    es: 'Country progresivo',
    pt: 'Country progressivo',
  },
  'progressive electronic': {
    es: 'Electrónica progresiva',
    pt: 'Eletrônica progressiva',
  },
  'progressive folk': { es: 'Folk progresivo', pt: 'Folk progressivo' },
  'progressive house': { es: 'House progresivo', pt: 'House progressivo' },
  'progressive metal': { es: 'Metal progresivo', pt: 'Metal progressivo' },
  'progressive metalcore': {
    es: 'Metalcore progresivo',
    pt: 'Metalcore progressivo',
  },
  'progressive pop': { es: 'Pop progresivo', pt: 'Pop progressivo' },
  'progressive rock': { es: 'Rock progresivo', pt: 'Rock progressivo' },
  'progressive soul': { es: 'Soul progresivo', pt: 'Soul progressivo' },
  'progressive trance': { es: 'Trance progresivo', pt: 'Trance progressivo' },
  psychedelic: { es: 'Psicodelia', pt: 'Psicodelia' },
  'psychedelic folk': { es: 'Folk psicodélico', pt: 'Folk psicodélico' },
  'psychedelic pop': { es: 'Pop psicodélico', pt: 'Pop psicodélico' },
  'psychedelic rock': { es: 'Rock psicodélico', pt: 'Rock psicodélico' },
  'psychedelic soul': { es: 'Soul psicodélico', pt: 'Soul psicodélico' },
  reggaeton: { es: 'Reguetón' },
  renaissance: { es: 'Música renacentista', pt: 'Música renascentista' },
  'rock opera': { es: 'Ópera rock', pt: 'Ópera rock' },
  'romantic classical': {
    es: 'Música clásica romántica',
    pt: 'Música clássica romântica',
  },
  'salsa romántica': { pt: 'Salsa romântica' },
  'singer-songwriter': { es: 'Cantautor', pt: 'Cantor-compositor' },
  'southeast asian classical': {
    es: 'Música clásica del sudeste asiático',
    pt: 'Música clássica do Sudeste Asiático',
  },
  'spiritual jazz': { es: 'Jazz espiritual', pt: 'Jazz espiritual' },
  'symphonic black metal': {
    es: 'Black metal sinfónico',
    pt: 'Black metal sinfônico',
  },
  'symphonic metal': { es: 'Metal sinfónico', pt: 'Metal sinfônico' },
  'symphonic poem': { es: 'Poema sinfónico', pt: 'Poema sinfônico' },
  'symphonic rock': { es: 'Rock sinfónico', pt: 'Rock sinfônico' },
  'technical death metal': {
    es: 'Death metal técnico',
    pt: 'Death metal técnico',
  },
  'thai classical': {
    es: 'Música clásica tailandesa',
    pt: 'Música clássica tailandesa',
  },
  'traditional country': {
    es: 'Country tradicional',
    pt: 'Country tradicional',
  },
  'traditional pop': { es: 'Pop tradicional', pt: 'Pop tradicional' },
  'tropical rock': { es: 'Rock tropical', pt: 'Rock tropical' },
  'turkish classical': {
    es: 'Música clásica turca',
    pt: 'Música clássica turca',
  },
  'turkish folk': { es: 'Folk turco', pt: 'Folk turco' },
  'vietnamese classical': {
    es: 'Música clásica vietnamita',
    pt: 'Música clássica vietnamita',
  },
  'vocal jazz': { es: 'Jazz vocal', pt: 'Jazz vocal' },
  'west coast hip hop': {
    es: 'Hip hop de la Costa Oeste',
    pt: 'Hip hop da Costa Oeste',
  },
  'western classical': {
    es: 'Música clásica occidental',
    pt: 'Música clássica ocidental',
  },
  'yue opera': { es: 'Ópera yue', pt: 'Ópera yue' },
};

const LABELS_BY_KEY: ReadonlyMap<string, GenreLocalizedLabels> = new Map(
  Object.entries(GENRE_LABELS).map(([genre, labels]) => [
    genreLookupKey(genre),
    labels,
  ]),
);

export function getGenreDisplayLabel(
  genre: Readonly<{ id?: string; name: string }>,
  locale: GenreLabelLocale,
): string {
  if (locale === 'en') {
    return genre.name;
  }

  const labels = LABELS_BY_KEY.get(genreLookupKey(genre.id ?? genre.name));
  return labels?.[locale] ?? genre.name;
}
