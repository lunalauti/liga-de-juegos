import { useCallback, useEffect, useState } from 'react';
import { apiFetch, ApiClientError } from '../api/client';
import { useSession } from './useSession';

export interface MyGroup {
  id: string;
  name: string;
  inviteCode: string;
  role: 'admin' | 'member';
}

export interface Me {
  id: string;
  displayName: string;
  avatar: string | null;
  groups: MyGroup[];
}

/** GET /me — perfil + grupos (RF-2). Se refresca a demanda con refetch(). */
export function useMe() {
  const { session } = useSession();
  const token = session?.access_token;
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(() => {
    if (!token) return;
    setLoading(true);
    apiFetch<Me>('/me', { accessToken: token })
      .then(setMe)
      .catch((e) => setError(e instanceof ApiClientError ? e.message : 'No pudimos cargar tus datos'))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => refetch(), [refetch]);

  return { me, loading, error, refetch, token };
}
