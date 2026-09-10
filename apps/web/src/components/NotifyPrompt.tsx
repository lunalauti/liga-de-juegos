import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPushUiState, subscribeToPush, type PushUiState } from '../lib/push';

const STORAGE_KEY = 'liga:notifyPromptSeen';

/**
 * Pedido del usuario, 2026-09-09: preguntar por los avisos (RF-22) la primera
 * vez que alguien entra, en vez de esperar a que encuentre la tarjeta en
 * Perfil por su cuenta. "Primera vez" es por dispositivo (localStorage), no
 * por cuenta — una suscripción push es por navegador, así que tiene sentido
 * volver a preguntar en un dispositivo nuevo aunque ya hayas contestado en
 * otro. Se pregunta una sola vez: decida lo que decida, no vuelve a insistir
 * solo (RNF-9, mismo criterio que el permiso denegado en Perfil).
 */
export function NotifyPrompt({ token }: { token: string | undefined }) {
  const [state, setState] = useState<PushUiState | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY)) return;
    getPushUiState()
      .then((s) => {
        if (s === 'not-subscribed' || s === 'ios-not-installed') setState(s);
      })
      .catch(() => {});
  }, []);

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, '1');
    setState(null);
  }

  async function accept() {
    if (state === 'not-subscribed' && token) {
      // Suscripción directa: este click es el gesto real que hace falta para
      // que el navegador muestre el permiso de notificaciones — no hay razón
      // para mandar a Perfil si ya se puede resolver acá mismo.
      try {
        await subscribeToPush(token);
      } catch {
        // Si denegó el permiso no hay nada más que hacer acá — Perfil explica
        // cómo reactivarlo a mano si cambia de idea.
      }
      dismiss();
      return;
    }
    // iOS sin instalar: el flujo completo (con instrucciones) vive en
    // Perfil, no tiene sentido duplicarlo acá.
    dismiss();
    navigate('/perfil');
  }

  if (!state) return null;

  return (
    <div style={{ background: '#F1EBDD', border: '1px solid #DDD6C8', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>¿Querés que te avisemos si te faltan tiempos?</p>
        <p style={{ fontSize: 12, color: '#6B6357', margin: '4px 0 0' }}>Un aviso por día, a la noche, sólo si te queda algo pendiente. Lo podés apagar cuando quieras desde tu perfil.</p>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={() => void accept()}>Sí, avisame</button>
        <button type="button" className="btn btn-outline-dark" style={{ flex: 1 }} onClick={dismiss}>Ahora no</button>
      </div>
    </div>
  );
}
