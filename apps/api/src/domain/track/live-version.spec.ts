import { isLiveVersion } from './live-version';

describe('isLiveVersion', () => {
  it.each([
    'Fog (Again) [Live]',
    'Karma Police - Live',
    'Karma Police - Live at Earls Court',
    '2 + 2 = 5 (Live at Earls Court)',
    'Ai Se Eu Te Pego - Ao Vivo',
    'Voy a Pasármelo Bien (En Vivo)',
    'Gimme Tha Power - MTV Unplugged',
    'Entre Dos Tierras - En Directo',
    'Creep (Live from Austin City Limits)',
    'Paranoid Android – Live in Tokyo',
    'Lucky — Live',
    'Airbag (Live Version)',
    'Ceremonia (Remastered 2011 / Live at Wembley)',
    'De Música Ligera (Unplugged)',
  ])('rejects the live variant %p', (name) => {
    expect(isLiveVersion({ name })).toBe(true);
  });

  it.each([
    'Live Forever',
    'Live Forever - Remastered',
    'Live and Let Die',
    'Alive',
    'Deliverance',
    'Oliver’s Army',
    'Livewire',
    'Let Me Live (Remix)',
    'Tour 2007',
    'Persiana Americana - Gira 2007',
    'Hello (Tour 2012 Edit)',
    'Song - Buenos Aires 1997',
    'Live Wire (Remastered)',
    'Creep',
  ])('keeps %p', (name) => {
    expect(isLiveVersion({ name })).toBe(false);
  });

  it.each([
    'Live at Wembley',
    'Live',
    'MTV Unplugged in New York',
    'Unplugged',
    'Ao Vivo no Maracanã',
    'Gira Me Verás Volver (En Vivo)',
    'Stop Making Sense (Live)',
    'El Último Concierto - En Directo',
  ])('rejects a track from the clearly live album %p', (albumName) => {
    expect(isLiveVersion({ name: 'Song', albumName })).toBe(true);
  });

  it.each([
    'Live Through This',
    'Live Forever: The Best Of',
    'Alive in the Studio',
    'Tour 2007',
    'Greatest Hits',
    undefined,
  ])('keeps a track from the album %p', (albumName) => {
    expect(isLiveVersion({ name: 'Song', albumName })).toBe(false);
  });
});
