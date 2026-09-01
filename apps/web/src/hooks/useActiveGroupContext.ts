import { useMe } from './useMe';
import { useActiveGroup } from './useActiveGroup';

/**
 * Combina /me (grupos del usuario) + el selector persistido en localStorage.
 * Usado por Home, Ranking y Detalle del día — todas necesitan "en qué grupo estoy parado".
 */
export function useActiveGroupContext() {
  const me = useMe();
  const { activeGroup, activeGroupId, selectGroup } = useActiveGroup(me.me?.groups);
  return { ...me, activeGroup, activeGroupId, selectGroup };
}
