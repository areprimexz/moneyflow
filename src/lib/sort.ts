import type { SortDir } from "@/components/ui/table";

export function compareBy<T>(get: (row: T) => number | string, dir: SortDir) {
  return (a: T, b: T) => {
    const x = get(a);
    const y = get(b);
    const c = typeof x === "string" && typeof y === "string" ? x.localeCompare(y) : (x as number) - (y as number);
    return dir === "asc" ? c : -c;
  };
}
