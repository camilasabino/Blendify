export function boundedEditDistance(
  left: string,
  right: string,
  maxDistance: number,
): number | null {
  if (Math.abs(left.length - right.length) > maxDistance) {
    return null;
  }

  let beforePrevious: number[] = [];
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    let rowMinimum = i;

    for (let j = 1; j <= right.length; j += 1) {
      const substitution = left[i - 1] === right[j - 1] ? 0 : 1;
      let distance = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + substitution,
      );
      if (
        i > 1 &&
        j > 1 &&
        left[i - 1] === right[j - 2] &&
        left[i - 2] === right[j - 1]
      ) {
        distance = Math.min(distance, beforePrevious[j - 2] + 1);
      }
      current.push(distance);
      rowMinimum = Math.min(rowMinimum, distance);
    }

    if (rowMinimum > maxDistance) {
      return null;
    }
    beforePrevious = previous;
    previous = current;
  }

  const distance = previous[right.length];
  return distance <= maxDistance ? distance : null;
}
