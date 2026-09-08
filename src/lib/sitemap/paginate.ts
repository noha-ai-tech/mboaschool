// RELEASE-CONSOLIDATION-07C — generic, dependency-free pagination helper.
// Deliberately has zero imports (no Supabase, no Next) so it's directly
// unit-testable with a mock page-fetcher, without hitting a real database
// and without the "@/" path-alias resolution issue that blocks dynamically
// importing modules that pull in next/headers or the Supabase client.
//
// Pages until a batch comes back shorter than pageSize — this is correct
// regardless of the true row count (0, 1, exactly one page, several full
// pages, or many thousands), so it scales automatically past whatever the
// caller's actual row count is today.
export async function paginateAll<T>(
  pageSize: number,
  fetchPage: (from: number, to: number) => Promise<T[]>
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  for (;;) {
    const batch = await fetchPage(from, from + pageSize - 1);
    all.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return all;
}
