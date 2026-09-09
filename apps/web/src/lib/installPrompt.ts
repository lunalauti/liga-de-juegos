/**
 * T10.1/T10.4, specs/02-design.md §10.1 — captura el evento `beforeinstallprompt`
 * (Chrome/Android/desktop) apenas el navegador lo dispara, mucho antes de que
 * el jugador llegue a Perfil. Si no se captura acá arriba y se guarda, se
 * pierde: el navegador sólo lo dispara una vez por carga de página, y no hay
 * forma de "pedirlo" después a demanda.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); // si no, Chrome muestra su propio mini-banner además del botón nuestro
  deferredPrompt = e as BeforeInstallPromptEvent;
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
});

export function getInstallPrompt(): BeforeInstallPromptEvent | null {
  return deferredPrompt;
}

/** Dispara el prompt capturado. Se consume una sola vez — como el navegador lo hace. */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferredPrompt) return 'unavailable';
  const prompt = deferredPrompt;
  deferredPrompt = null;
  await prompt.prompt();
  const { outcome } = await prompt.userChoice;
  return outcome;
}
