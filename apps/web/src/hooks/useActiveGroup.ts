import { useEffect, useState } from 'react';
import type { MyGroup } from './useMe';

const STORAGE_KEY = 'liga:activeGroupId';

/**
 * Selector de grupo persistido en localStorage (specs/02-design.md §6.6).
 * No hay artboard propio para el selector; se deriva de la lista de grupos de /me.
 */
export function useActiveGroup(groups: MyGroup[] | undefined) {
  const [activeGroupId, setActiveGroupId] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY));

  useEffect(() => {
    if (!groups || groups.length === 0) return;
    const stillValid = activeGroupId && groups.some((g) => g.id === activeGroupId);
    if (!stillValid) {
      const first = groups[0]!.id;
      setActiveGroupId(first);
      localStorage.setItem(STORAGE_KEY, first);
    }
  }, [groups, activeGroupId]);

  function selectGroup(id: string) {
    setActiveGroupId(id);
    localStorage.setItem(STORAGE_KEY, id);
  }

  const activeGroup = groups?.find((g) => g.id === activeGroupId) ?? null;
  return { activeGroupId, activeGroup, selectGroup };
}
