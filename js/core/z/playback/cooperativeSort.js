// Stable merge sort with the same comparator as the synchronous policy. Large
// catalogues release the UI thread between comparisons, never a partial result.
export async function cooperativeSort(items, compare, { isCurrent, yieldTask, now }) {
  let input = items.slice(),
    output = new Array(input.length),
    start = now();
  for (let width = 1; width < input.length; width *= 2) {
    for (let left = 0; left < input.length; left += width * 2) {
      const middle = Math.min(left + width, input.length),
        end = Math.min(left + width * 2, input.length);
      let a = left,
        b = middle;
      for (let at = left; at < end; at++) {
        output[at] =
          a < middle && (b >= end || compare(input[a], input[b]) <= 0) ? input[a++] : input[b++];
        if (now() - start >= 6) {
          await yieldTask();
          if (!isCurrent()) return null;
          start = now();
        }
      }
    }
    [input, output] = [output, input];
  }
  return isCurrent() ? input : null;
}
