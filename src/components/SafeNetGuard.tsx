import { useEffect, useRef, useState } from "react";
import "@/lib/safenet_full.js";

type Results = any;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.crossOrigin = "anonymous";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load " + src));
    document.head.appendChild(s);
  });
}

async function loadMediapipe() {
  await loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js");
  await loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js");
}
import { Shield, ShieldOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";

declare global {
  interface Window {
    SafeNet?: any;
    classifyImage?: (img: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement) => Promise<Record<string, number>>;
  }
}

/**
 * SafeNetGuard — webcam-based real-time NSFW + pose moderation overlay.
 * Toggle bilan ishga tushadi; aniqlanganda butun ekranni blur qiladi.
 * Og'ir hisoblashlar throttle qilingan (RAF emas, ~3 FPS).
 */
export default function SafeNetGuard() {
  const [active, setActive] = useState(false);
  const [blur, setBlur] = useState(false);
  const [status, setStatus] = useState<string>("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraRef = useRef<any>(null);
  const poseRef = useRef<any>(null);
  const lastAnalyzeRef = useRef(0);
  const busyRef = useRef(false);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let cleanupFn: (() => void) | null = null;

    (async () => {
      try {
        await loadMediapipe();
      } catch (e: any) {
        setStatus("Mediapipe yuklanmadi: " + e.message);
        return;
      }
      if (cancelled) return;

      const PoseCtor = (window as any).Pose;
      const CameraCtor = (window as any).Camera;
      if (!PoseCtor || !CameraCtor) {
        setStatus("Mediapipe konstruktor topilmadi");
        return;
      }

      const video = document.createElement("video");
      video.style.display = "none";
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true;
      document.body.appendChild(video);
      videoRef.current = video;

      const pose = new PoseCtor({
        locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
      });
      pose.setOptions({
        modelComplexity: 0,
        smoothLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      poseRef.current = pose;

      pose.onResults(async (results: Results) => {
        const now = performance.now();
        if (busyRef.current) return;
        if (now - lastAnalyzeRef.current < 350) return;
        lastAnalyzeRef.current = now;
        busyRef.current = true;
        try {
          const landmarks = results.poseLandmarks || null;
          const out = await window.SafeNet.analyze(video, landmarks);
          if (out?.shouldBlur) {
            setBlur(true);
            setStatus(
              `Bloklandi — Porn:${(out.nsfw?.Porn ?? 0).toFixed(2)} WHR:${out.body?.whr?.toFixed(2) ?? "-"}`
            );
          } else {
            setBlur(false);
            setStatus(`Xavfsiz — Porn:${(out?.nsfw?.Porn ?? 0).toFixed(2)}`);
          }
        } catch {
          /* engine isiyapti */
        } finally {
          busyRef.current = false;
        }
      });

      const camera = new CameraCtor(video, {
        onFrame: async () => {
          await pose.send({ image: video });
        },
        width: 320,
        height: 240,
      });
      cameraRef.current = camera;
      camera.start().catch((e: any) => setStatus("Kamera xatosi: " + e.message));

      cleanupFn = () => {
        try { camera.stop(); } catch {}
        try { pose.close(); } catch {}
        video.remove();
        videoRef.current = null;
        cameraRef.current = null;
        poseRef.current = null;
      };
    })();

    return () => {
      cancelled = true;
      if (cleanupFn) cleanupFn();
      setBlur(false);
      setStatus("");
    };
  }, [active]);



  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setActive((v) => !v)}
        className="fixed bottom-4 right-4 z-[9998] flex items-center gap-2 rounded-full border border-primary/40 bg-background/80 px-3 py-2 text-xs font-mono text-primary shadow-lg backdrop-blur hover:bg-primary/10"
        title="SafeNet Live Guard"
      >
        {active ? <Shield className="h-4 w-4" /> : <ShieldOff className="h-4 w-4" />}
        SafeNet {active ? "ON" : "OFF"}
        {status && <span className="ml-1 text-muted-foreground">{status}</span>}
      </button>

      {/* Fullscreen blur overlay */}
      {blur && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center backdrop-blur-3xl bg-background/70">
          <div className="rounded-2xl border border-destructive/40 bg-card p-6 text-center shadow-2xl max-w-sm">
            <Shield className="mx-auto mb-3 h-10 w-10 text-destructive" />
            <h2 className="mb-1 text-lg font-bold text-destructive">Xavfli kontent aniqlandi</h2>
            <p className="mb-4 text-xs text-muted-foreground font-mono">{status}</p>
            <Button size="sm" variant="outline" onClick={() => setBlur(false)}>
              <X className="mr-1 h-3 w-3" /> Yopish
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
