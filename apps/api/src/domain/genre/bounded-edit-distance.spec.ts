import { boundedEditDistance } from './bounded-edit-distance';

describe('boundedEditDistance', () => {
  it.each([
    ['trance', 'trance', 0],
    ['corrdo', 'corrido', 1],
    ['trnace', 'trance', 1],
    ['alternatve', 'alternative', 1],
    ['progresiva', 'progressive', 2],
  ])('measures %p against %p as %p', (left, right, distance) => {
    expect(boundedEditDistance(left, right, 2)).toBe(distance);
  });

  it.each([
    ['rock', 'folk', 1],
    ['americana', 'mexicana', 1],
    ['metal', 'metalcore', 2],
  ])('stops once %p and %p exceed %p edits', (left, right, maxDistance) => {
    expect(boundedEditDistance(left, right, maxDistance)).toBeNull();
  });
});
