import { useEffect, useRef, useState } from 'react';

// Lee códigos de barras con la cámara. Usa BarcodeDetector (Chrome/Android) y, si no existe
// (Safari/iPhone, Firefox), cae a ZXing, que se descarga recién cuando se abre el escáner.
const FORMATOS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

export default function Escaner({ onCodigo, onCerrar }) {
  const video = useRef(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let vivo = true;
    let stream = null;
    let parar = () => { };
    const fin = (codigo) => { if (vivo) { vivo = false; onCodigo(codigo); } };

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) { setError('Este navegador no permite usar la cámara (hace falta HTTPS).'); return; }
      try {
        if ('BarcodeDetector' in window) {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
          if (!vivo) return;
          video.current.srcObject = stream;
          await video.current.play();
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
          if (!vivo) ctl.stop(); else parar = () => ctl.stop();
        }
      } catch (e) {
        setError(e?.name === 'NotAllowedError' ? 'Permití el acceso a la cámara para escanear.' : 'No se pudo abrir la cámara.');
      }
    })();

    return () => { vivo = false; parar(); stream?.getTracks().forEach((t) => t.stop()); };
  }, []);

  useEffect(() => {
    const tecla = (e) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, []);

  return (
    <div role="dialog" aria-modal="true" aria-label="Escanear código de barras" className="fixed inset-0 z-50 flex flex-col bg-black/90 p-4">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4">
        <div className="relative overflow-hidden rounded-3xl bg-black">
          <video ref={video} playsInline muted className="aspect-[3/4] w-full object-cover" />
          <div className="pointer-events-none absolute inset-x-8 top-1/2 h-24 -translate-y-1/2 rounded-2xl border-2 border-white/80" />
        </div>
        <p className="text-center text-sm text-white/80" role="status">{error || 'Apuntá al código de barras del producto'}</p>
        <button type="button" onClick={onCerrar} className="h-12 rounded-2xl bg-white/15 font-bold text-white hover:bg-white/25">Cancelar</button>
      </div>
    </div>
  );
}
