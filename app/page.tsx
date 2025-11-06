'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type RemovalMode = 'blur' | 'pixelate' | 'black';

export default function HomePage() {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [mode, setMode] = useState<RemovalMode>('blur');
  const [intensity, setIntensity] = useState<number>(12);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageElRef = useRef<HTMLImageElement | null>(null);
  const modelRef = useRef<any>(null);

  const loadModel = useCallback(async () => {
    if (modelRef.current) return modelRef.current;
    const [{ default: blazeface }, tf] = await Promise.all([
      import('@tensorflow-models/blazeface'),
      import('@tensorflow/tfjs'),
    ]);
    // Ensure WebGL backend if available for performance
    try {
      if (tf.getBackend() !== 'webgl' && tf.findBackend('webgl')) {
        await tf.setBackend('webgl');
        await tf.ready();
      }
    } catch {}
    modelRef.current = await blazeface.load();
    return modelRef.current;
  }, []);

  const onFile = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    setImageUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
  }, []);

  // Draw uploaded image to canvas
  useEffect(() => {
    if (!imageUrl) return;
    const img = new Image();
    img.onload = () => {
      imageElRef.current = img;
      const canvas = canvasRef.current!;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.onerror = () => {
      setImageUrl(null);
    };
    img.src = imageUrl;
  }, [imageUrl]);

  const processFaces = useCallback(async () => {
    if (!imageElRef.current || !canvasRef.current) return;
    setIsProcessing(true);
    try {
      const model = await loadModel();
      const predictions = await model.estimateFaces(imageElRef.current, false);
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d')!;

      // Redraw original as base
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(imageElRef.current, 0, 0, canvas.width, canvas.height);

      if (Array.isArray(predictions)) {
        for (const pred of predictions) {
          // pred.topLeft and pred.bottomRight are coordinates
          const [x1, y1] = pred.topLeft as [number, number];
          const [x2, y2] = pred.bottomRight as [number, number];
          const w = x2 - x1;
          const h = y2 - y1;
          applyRemoval(ctx, x1, y1, w, h, mode, intensity);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsProcessing(false);
    }
  }, [intensity, loadModel, mode]);

  const download = useCallback(() => {
    if (!canvasRef.current) return;
    const url = canvasRef.current.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = 'face-removed.png';
    a.click();
  }, []);

  return (
    <div className="container">
      <div className="header">
        <h1>Face Remove AI Agent</h1>
        <span className="badge">Runs 100% in-browser</span>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <label htmlFor="file">Upload Image</label>
            <input
              id="file"
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
              }}
            />
            <div className="small">Hint: Chehra auto-detect hoga, aur hide kiya jayega.</div>
          </div>

          <div className="controls" style={{ maxWidth: 520 }}>
            <div>
              <label>Mode</label>
              <select value={mode} onChange={(e) => setMode(e.target.value as RemovalMode)}>
                <option value="blur">Blur</option>
                <option value="pixelate">Pixelate</option>
                <option value="black">Black Box</option>
              </select>
            </div>
            <div>
              <label>Intensity</label>
              <input
                type="range"
                min={4}
                max={40}
                step={1}
                value={intensity}
                onChange={(e) => setIntensity(parseInt(e.target.value, 10))}
              />
            </div>
          </div>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="button" onClick={processFaces} disabled={!imageUrl || isProcessing}>
            {isProcessing ? 'Processing?' : 'Detect & Remove Faces'}
          </button>
          <button className="button" onClick={download} disabled={!imageUrl || isProcessing}>
            Download Result
          </button>
        </div>
      </div>

      <div className="card">
        <div className="canvasWrap">
          <canvas ref={canvasRef} style={{ maxWidth: '100%', height: 'auto', display: 'block' }} />
        </div>
      </div>
    </div>
  );
}

function applyRemoval(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  mode: RemovalMode,
  intensity: number,
) {
  if (mode === 'black') {
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(x, y, w, h);
    return;
  }

  if (mode === 'pixelate') {
    const scale = Math.max(4, Math.floor(intensity));
    const tmp = document.createElement('canvas');
    const tctx = tmp.getContext('2d')!;
    tmp.width = Math.max(1, Math.floor(w / scale));
    tmp.height = Math.max(1, Math.floor(h / scale));
    // Draw face region small
    tctx.imageSmoothingEnabled = false;
    tctx.drawImage(ctx.canvas, x, y, w, h, 0, 0, tmp.width, tmp.height);
    // Draw back scaled up
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, 0, 0, tmp.width, tmp.height, x, y, w, h);
    ctx.imageSmoothingEnabled = true;
    return;
  }

  // blur
  const blurPx = Math.max(4, intensity);
  const sub = document.createElement('canvas');
  const sctx = sub.getContext('2d')!;
  sub.width = Math.max(1, Math.floor(w));
  sub.height = Math.max(1, Math.floor(h));
  sctx.drawImage(ctx.canvas, x, y, w, h, 0, 0, sub.width, sub.height);
  ctx.save();
  ctx.filter = `blur(${blurPx}px)`;
  ctx.drawImage(sub, 0, 0, sub.width, sub.height, x, y, w, h);
  ctx.restore();
}
