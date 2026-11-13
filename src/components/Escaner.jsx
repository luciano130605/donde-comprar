import { useEffect, useRef, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { FlashIcon, FlashOffIcon} from '@hugeicons/core-free-icons';


// Lee códigos de barras con la cámara. Usa BarcodeDetector (Chrome/Android) y, si no existe
// (Safari/iPhone, Firefox), cae a ZXing, que se descarga recién cuando se abre el escáner.
const FORMATOS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];
const esCodigo = (s) => /^\d{8,14}$/.test(s);

export default function Escaner({ onCodigo, onCerrar }) {
  const video = useRef(null);
  const [error, setError] = useState('');
  const [linterna, setLinterna] = useState(null); // null: no disponible · false/true: apagada/encendida
  const [manual, setManual] = useState('');
  const [errorManual, setErrorManual] = useState('');

  const pista = () => video.current?.srcObject?.getVideoTracks?.()[0];

  useEffect(() => {
    let vivo = true;
    let stream = null;
    let parar = () => { };
    const fin = (codigo) => {
      if (!vivo) return;
      vivo = false;
      try { navigator.vibrate?.(60); } catch { }
      onCodigo(codigo);
    };
    const ver = () => {
      try { if (pista()?.getCapabilities?.().torch) setLinterna(false); } catch { }
    };

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) { setError('Este navegador no permite usar la cámara (hace falta HTTPS). Podés escribir el código abajo.'); return; }
      try {
        if ('BarcodeDetector' in window) {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
          if (!vivo) return;
          video.current.srcObject = stream;
          await video.current.play();
          ver();
          const det = new window.BarcodeDetector({ formats: FORMATOS });
          let timer;
          const tick = async () => {
            if (!vivo) return;
            try { const r = await det.detect(video.current); if (r[0]?.rawValue) return fin(r[0].rawValue); } catch { }
            timer = setTimeout(tick, 150);
          };
          tick();
          parar = () => clearTimeout(timer);
        } else {
          const { BrowserMultiFormatReader } = await import('@zxing/browser');
          const { DecodeHintType, BarcodeFormat } = await import('@zxing/library');
          const hints = new Map([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E]]]);
          const lector = new BrowserMultiFormatReader(hints);
          const ctl = await lector.decodeFromConstraints(
            { video: { facingMode: { ideal: 'environment' } }, audio: false },
            video.current,
            (res) => { if (res) fin(res.getText()); },
          );
          if (!vivo) ctl.stop(); else { parar = () => ctl.stop(); ver(); }
        }
      } catch (e) {
        setError(e?.name === 'NotAllowedError' ? 'Permití el acceso a la cámara para escanear, o escribí el código abajo.' : 'No se pudo abrir la cámara. Podés escribir el código abajo.');
      }
    })();

    return () => { vivo = false; parar(); stream?.getTracks().forEach((t) => t.stop()); };
  }, []);

  useEffect(() => {
    const tecla = (e) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, []);

  const alternarLinterna = async () => {
    try {
      await pista().applyConstraints({ advanced: [{ torch: !linterna }] });
      setLinterna(!linterna);
    } catch { setLinterna(null); }
  };

  const enviarManual = (e) => {
    e.preventDefault();
    const c = manual.replace(/\s+/g, '');
    if (!esCodigo(c)) { setErrorManual('El código tiene entre 8 y 14 números.'); return; }
    onCodigo(c);
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Escanear código de barras" className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-black/90 p-4">
      <div className="mx-auto my-auto flex w-full max-w-md flex-col gap-3">
        <div className="relative overflow-hidden rounded-3xl bg-black">
          <video ref={video} playsInline muted className="aspect-[4/3] w-full object-cover" />
          <div className="pointer-events-none absolute inset-x-8 top-1/2 h-24 -translate-y-1/2 rounded-2xl border-2 border-white/80" />
          {linterna !== null && (
            <button type="button" onClick={alternarLinterna} aria-pressed={linterna}
              className={'absolute right-3 top-3 h-10 rounded-full px-4 text-sm font-bold ' + (linterna ? 'bg-white text-black' : 'bg-black/60 text-white')}>
              <HugeiconsIcon icon={linterna ? 'FlashOffIcon' : 'FlashIcon'} className="mr-2 inline h-5 w-5" />
            </button>
          )}
        </div>
        <p className="text-center text-sm text-white/80" role="status">{error || 'Apuntá al código de barras del producto'}</p>
        <form onSubmit={enviarManual} className="flex gap-2">
          <input type="text" inputMode="numeric" autoComplete="off" value={manual} onChange={(e) => { setManual(e.target.value); setErrorManual(''); }} placeholder="¿No lo lee? Escribí el código"
            aria-label="Código de barras" className="h-12 min-w-0 flex-1 rounded-2xl bg-white/15 px-4 text-white placeholder:text-white/60" />
          <button type="submit" className="h-12 rounded-2xl bg-white px-5 font-bold text-black">Buscar</button>
        </form>
        {errorManual && <p className="text-center text-sm text-white" role="alert">{errorManual}</p>}
        <button type="button" onClick={onCerrar} className="h-12 rounded-2xl bg-white/15 font-bold text-white hover:bg-white/25">Cancelar</button>
      </div>
    </div>
  );
}
