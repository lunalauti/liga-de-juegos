import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.warn('[supabase] Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY en el .env');
}

// persistSession (default true) es lo que cumple RNF: "mantener la sesión entre visitas".
export const supabase = createClient(url, anonKey);
