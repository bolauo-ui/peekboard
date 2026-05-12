import { useEffect, useRef } from 'react';

// Lightweight wrapper around Google Identity Services (GIS). Renders Google's
// official "Sign in with Google" button and fires onCredential(id_token) when
// the user signs in. The page-load injection of the GIS script is idempotent
// so multiple instances on the same page won't re-fetch it.

declare global {
  interface Window {
    google?: any;
    __gisLoaderPromise?: Promise<void>;
  }
}

const GIS_SRC = 'https://accounts.google.com/gsi/client';

function loadGisOnce(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (window.__gisLoaderPromise) return window.__gisLoaderPromise;
  window.__gisLoaderPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GIS_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('GIS load failed')));
      return;
    }
    const s = document.createElement('script');
    s.src   = GIS_SRC;
    s.async = true;
    s.defer = true;
    s.onload  = () => resolve();
    s.onerror = () => reject(new Error('GIS load failed'));
    document.head.appendChild(s);
  });
  return window.__gisLoaderPromise;
}

interface Props {
  onCredential: (idToken: string) => void;
  onError?:     (err: Error) => void;
}

export default function GoogleSignInButton({ onCredential, onError }: Props) {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  const slotRef  = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!clientId || !slotRef.current) return;
    let cancelled = false;

    loadGisOnce()
      .then(() => {
        if (cancelled || !slotRef.current) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (resp: { credential?: string }) => {
            if (resp.credential) onCredential(resp.credential);
            else onError?.(new Error('No credential returned'));
          },
          // Prevent FedCM crashes on browsers that don't support it.
          use_fedcm_for_prompt: true,
          auto_select: false,
        });
        window.google.accounts.id.renderButton(slotRef.current, {
          theme: 'filled_black',
          size:  'large',
          text:  'continue_with',
          shape: 'rectangular',
          width: 320,
        });
      })
      .catch(err => onError?.(err));

    return () => { cancelled = true; };
  }, [clientId, onCredential, onError]);

  if (!clientId) return null; // Hide button entirely if not configured

  return (
    <div className="flex flex-col items-center gap-3 my-4">
      <div ref={slotRef} />
    </div>
  );
}
