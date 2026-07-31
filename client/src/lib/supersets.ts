export type Linkable = { key: string; linkedToNext: boolean };

/**
 * A(linked), B, C -> "A1","A2","B","C". Consecutive items with
 * linkedToNext=true share a letter with sub-numbers; everything else gets
 * its own bare letter.
 */
export function computeExerciseLabels(items: Linkable[]): Record<string, string> {
  const labels: Record<string, string> = {};
  let letterIndex = 0;
  let i = 0;
  while (i < items.length) {
    let j = i;
    while (j < items.length - 1 && items[j].linkedToNext) j++;
    const letter = String.fromCharCode(65 + letterIndex);
    if (j === i) {
      labels[items[i].key] = letter;
    } else {
      for (let k = i; k <= j; k++) {
        labels[items[k].key] = `${letter}${k - i + 1}`;
      }
    }
    letterIndex++;
    i = j + 1;
  }
  return labels;
}

/**
 * Converts local linkedToNext flags into opaque supersetGroup tokens for
 * persistence. Items sharing a fresh uuid are grouped; solo items get null.
 */
export function assignSupersetGroups<T extends Linkable>(
  items: T[],
): (T & { supersetGroup: string | null })[] {
  let groupToken: string | null = null;
  return items.map((item, i) => {
    const prevLinked = i > 0 && items[i - 1].linkedToNext;
    if (!prevLinked) {
      groupToken = item.linkedToNext ? crypto.randomUUID() : null;
    }
    return { ...item, supersetGroup: prevLinked || item.linkedToNext ? groupToken : null };
  });
}

/** Groups consecutive items sharing a non-null supersetGroup into blocks (read-only view use). */
export function groupConsecutiveBySupersetGroup<T extends { supersetGroup?: string | null }>(
  items: T[],
): T[][] {
  const blocks: T[][] = [];
  let i = 0;
  while (i < items.length) {
    let j = i;
    while (
      j < items.length - 1 &&
      items[j].supersetGroup != null &&
      items[j].supersetGroup === items[j + 1].supersetGroup
    ) {
      j++;
    }
    blocks.push(items.slice(i, j + 1));
    i = j + 1;
  }
  return blocks;
}

/** Reverse of assignSupersetGroups -- derive linkedToNext from loaded supersetGroup values. */
export function deriveLinkedToNext<T extends { supersetGroup?: string | null }>(
  items: T[],
): (T & { linkedToNext: boolean })[] {
  return items.map((item, i, arr) => ({
    ...item,
    linkedToNext:
      item.supersetGroup != null &&
      i < arr.length - 1 &&
      item.supersetGroup === arr[i + 1].supersetGroup,
  }));
}
