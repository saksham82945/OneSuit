import { useCallback, useState } from 'react';

/** Ids picked in a list, for "Export selected". */
export function useRowSelection() {
  const [selected, setSelected] = useState<string[]>([]);
  const toggle = useCallback(
    (id: string) => setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])),
    [],
  );
  const clear = useCallback(() => setSelected([]), []);
  return { selected, toggle, clear, isSelected: (id: string) => selected.includes(id) };
}
