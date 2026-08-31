"use client";

import { Suspense, useState, useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";

type TypePointage = "arrivee" | "depart";
type Status = "idle" | "loading" | "success" | "error";

const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "DEL"] as const;

export default function KioskuePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#07111f]" />}>
      <KiosqueContent />
    </Suspense>
  );
}

function KiosqueContent() {
  const searchParams = useSearchParams();
  const requestedEstablishmentId = searchParams.get("school");
  const [pin, setPin] = useState("");
  const [type, setType] = useState<TypePointage>("arrivee");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [cameraReady, setCameraReady] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Démarrage de la caméra au montage
  useEffect(() => {
    let active = true;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } } })
      .then((stream) => {
        if (!active) { stream.getTracks().forEach((t) => t.stop()); return; }
        if (videoRef.current) videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setCameraReady(true);
      })
      .catch(() => setCameraReady(false));
    return () => {
      active = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Retour automatique à l'état initial après confirmation
  useEffect(() => {
    if (status !== "success" && status !== "error") return;
    const delay = status === "success" ? 4000 : 0;
    if (status === "success") {
      const timer = setTimeout(() => {
        setPin("");
        setStatus("idle");
        setMessage("");
      }, delay);
      return () => clearTimeout(timer);
    }
  }, [status]);

  function capturePhoto(): string | null {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return null;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.85);
  }

  async function handleConfirm() {
    if (pin.length < 4) return;
    const photo = capturePhoto() ?? "data:image/jpeg;base64,/9j/4AAQ"; // fallback vide si pas de caméra

    setStatus("loading");
    try {
      const res = await fetch("/api/pointage/enregistrer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code_pointage: pin, type, photo, requestedEstablishmentId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "Erreur inconnue");
        setStatus("error");
      } else {
        setMessage(data.message);
        setStatus("success");
      }
    } catch {
      setMessage("Erreur réseau — vérifiez la connexion internet");
      setStatus("error");
    }
  }

  function pressDigit(d: string) {
    if (d === "DEL") { setPin((p) => p.slice(0, -1)); return; }
    if (d === "") return;
    if (pin.length < 6) setPin((p) => p + d);
  }

  const accentColor = type === "arrivee" ? "#059669" : "#ea580c";
  const accentClass = type === "arrivee" ? "bg-emerald-600" : "bg-orange-600";
  const accentHover = type === "arrivee" ? "active:bg-emerald-700" : "active:bg-orange-700";

  // ── Écran succès ──────────────────────────────────────────────────────────
  if (status === "success") {
    return (
      <div
        className="fixed inset-0 flex flex-col items-center justify-center text-white z-50"
        style={{ backgroundColor: "#059669" }}
      >
        <CheckCircle2 size={96} className="mb-6 opacity-90" strokeWidth={1.5} />
        <p className="text-2xl font-bold text-center px-10 max-w-sm leading-snug">{message}</p>
        <p className="mt-6 text-sm opacity-50">Retour automatique dans 4 secondes…</p>
      </div>
    );
  }

  // ── Écran erreur ──────────────────────────────────────────────────────────
  if (status === "error") {
    return (
      <div className="fixed inset-0 bg-red-700 flex flex-col items-center justify-center text-white z-50">
        <XCircle size={96} className="mb-6 opacity-90" strokeWidth={1.5} />
        <p className="text-2xl font-bold text-center px-10 max-w-sm leading-snug">{message}</p>
        <button
          onClick={() => { setStatus("idle"); setMessage(""); setPin(""); }}
          className="mt-8 px-8 py-4 bg-white/20 hover:bg-white/30 rounded-2xl text-base font-semibold transition-colors"
        >
          Réessayer
        </button>
      </div>
    );
  }

  // ── Écran kiosque principal ────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-[#0a0f0d] flex flex-col items-center justify-center gap-5 select-none z-50">

      {/* Prévisualisation caméra */}
      <div className="relative w-44 h-36 rounded-2xl overflow-hidden border border-white/10 bg-black/40 shrink-0">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="w-full h-full object-cover"
          style={{ transform: "scaleX(-1)" }}
        />
        {!cameraReady && (
          <div className="absolute inset-0 flex items-center justify-center text-white/30 text-xs text-center px-4">
            Caméra indisponible
          </div>
        )}
        <canvas ref={canvasRef} className="hidden" />
      </div>

      {/* Toggle Arrivée / Départ */}
      <div className="flex rounded-2xl overflow-hidden border border-white/10">
        <button
          onClick={() => setType("arrivee")}
          className={`px-10 py-3.5 text-sm font-bold transition-colors ${
            type === "arrivee" ? "bg-emerald-600 text-white" : "bg-white/5 text-white/40 hover:text-white/70"
          }`}
        >
          Arrivée
        </button>
        <button
          onClick={() => setType("depart")}
          className={`px-10 py-3.5 text-sm font-bold transition-colors ${
            type === "depart" ? "bg-orange-600 text-white" : "bg-white/5 text-white/40 hover:text-white/70"
          }`}
        >
          Départ
        </button>
      </div>

      {/* Affichage du PIN (points masqués) */}
      <div className="flex gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="w-11 h-11 rounded-full border-2 flex items-center justify-center transition-colors"
            style={{
              borderColor: i < pin.length ? accentColor : "rgba(255,255,255,0.15)",
              backgroundColor: i < pin.length ? accentColor : "transparent",
            }}
          >
            {i < pin.length && <span className="w-3 h-3 rounded-full bg-white" />}
          </div>
        ))}
      </div>

      {/* Pavé numérique */}
      <div className="grid grid-cols-3 gap-3">
        {DIGITS.map((d, i) => {
          if (d === "") return <div key={i} className="w-24 h-24" />;
          if (d === "DEL") {
            return (
              <button
                key={i}
                onClick={() => pressDigit("DEL")}
                className="w-24 h-24 rounded-2xl bg-white/10 text-white text-2xl font-bold flex items-center justify-center active:bg-white/20 transition-colors"
              >
                ⌫
              </button>
            );
          }
          return (
            <button
              key={i}
              onClick={() => pressDigit(d)}
              className="w-24 h-24 rounded-2xl bg-white/10 text-white text-3xl font-bold flex items-center justify-center active:bg-white/20 transition-colors"
            >
              {d}
            </button>
          );
        })}
      </div>

      {/* Bouton Valider */}
      <button
        onClick={handleConfirm}
        disabled={pin.length < 4 || status === "loading"}
        className={`px-12 py-4 rounded-2xl text-white text-lg font-bold transition-all ${
          pin.length >= 4 && status !== "loading"
            ? `${accentClass} ${accentHover}`
            : "bg-white/10 opacity-30 cursor-not-allowed"
        }`}
      >
        {status === "loading" ? "Enregistrement…" : "Valider"}
      </button>

      <p className="text-white/20 text-xs mt-1">Écoles237 Pro · Mode kiosque</p>
    </div>
  );
}
