"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Camera, CheckCircle2, Delete, LoaderCircle, LogIn, LogOut, ShieldAlert, XCircle } from "lucide-react";

type TypePointage = "arrivee" | "depart";
type Status = "idle" | "loading" | "success" | "denied" | "error";
const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "DEL"] as const;

export default function KiosquePage() {
  return <Suspense fallback={<div className="fixed inset-0 bg-[#07110d]" role="status" aria-label="Chargement du kiosque" />}><KiosqueContent /></Suspense>;
}

function KiosqueContent() {
  const requestedEstablishmentId = useSearchParams().get("school");
  const [pin, setPin] = useState("");
  const [type, setType] = useState<TypePointage>("arrivee");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [cameraReady, setCameraReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let active = true;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } } }).then((stream) => {
      if (!active) { stream.getTracks().forEach((track) => track.stop()); return; }
      if (videoRef.current) videoRef.current.srcObject = stream;
      streamRef.current = stream; setCameraReady(true);
    }).catch(() => setCameraReady(false));
    return () => { active = false; streamRef.current?.getTracks().forEach((track) => track.stop()); };
  }, []);

  useEffect(() => {
    if (status !== "success") return;
    const timer = setTimeout(() => { setStatus("idle"); setMessage(""); }, 4000);
    return () => clearTimeout(timer);
  }, [status]);

  function capturePhoto(): string | null {
    const video = videoRef.current; const canvas = canvasRef.current;
    if (!video || !canvas) return null;
    canvas.width = video.videoWidth || 640; canvas.height = video.videoHeight || 480;
    const context = canvas.getContext("2d"); if (!context) return null;
    context.drawImage(video, 0, 0); return canvas.toDataURL("image/jpeg", 0.85);
  }

  async function handleConfirm() {
    if (pin.length < 4 || status === "loading") return;
    const submittedPin = pin;
    const photo = capturePhoto() ?? "data:image/jpeg;base64,/9j/4AAQ";
    setPin(""); setMessage(""); setStatus("loading");
    try {
      const response = await fetch("/api/pointage/enregistrer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code_pointage: submittedPin, type, photo, requestedEstablishmentId }) });
      const data = await response.json();
      if (!response.ok) { setMessage(data.error ?? "Pointage refusé"); setStatus("denied"); }
      else { setMessage(data.message); setStatus("success"); }
    } catch { setMessage("Erreur réseau — vérifiez la connexion internet"); setStatus("error"); }
  }

  function pressDigit(digit: string) {
    if (status === "loading") return;
    if (digit === "DEL") { setPin((current) => current.slice(0, -1)); return; }
    if (digit && pin.length < 6) setPin((current) => current + digit);
  }
  function reset() { setPin(""); setMessage(""); setStatus("idle"); }

  if (status === "success" || status === "denied" || status === "error") {
    const success = status === "success";
    const Icon = success ? CheckCircle2 : status === "denied" ? ShieldAlert : XCircle;
    return <div className={`fixed inset-0 z-50 flex flex-col items-center justify-center px-6 text-center text-white ${success ? "bg-emerald-700" : status === "denied" ? "bg-amber-700" : "bg-red-700"}`} role={success ? "status" : "alert"} aria-live="assertive"><Icon size={88} className="mb-6" aria-hidden="true" /><p className="text-sm font-bold uppercase tracking-[0.18em]">{success ? "Pointage enregistré" : status === "denied" ? "Pointage refusé" : "Erreur"}</p><p className="mt-3 max-w-md text-2xl font-bold leading-snug">{message}</p>{success ? <p className="mt-6 text-sm text-white/75">Retour automatique dans 4 secondes…</p> : <button type="button" onClick={reset} className="mt-8 min-h-14 rounded-2xl bg-white px-8 text-base font-bold text-slate-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/60">Réessayer</button>}</div>;
  }

  return <main className="fixed inset-0 z-50 overflow-y-auto bg-[#07110d] px-4 py-5 text-white sm:px-6"><div className="mx-auto flex min-h-full max-w-4xl flex-col items-center justify-center gap-5">
    <div className="text-center"><p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">Écoles237 · Mode kiosque</p><h1 className="mt-2 text-2xl font-black">Enregistrer un pointage</h1><p className="mt-1 text-sm text-white/60">Choisissez le mouvement puis saisissez votre code personnel.</p></div>
    <div className="grid w-full max-w-2xl gap-5 md:grid-cols-[12rem_1fr] md:items-center"><div className="relative mx-auto h-36 w-44 overflow-hidden rounded-2xl border border-white/15 bg-black/40"><video ref={videoRef} autoPlay muted playsInline aria-label="Aperçu de la photo de pointage" className="h-full w-full object-cover" style={{ transform: "scaleX(-1)" }} />{!cameraReady && <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center text-xs text-white/60"><Camera size={22} aria-hidden="true" />Caméra indisponible</div>}<canvas ref={canvasRef} className="hidden" /></div>
      <div className="space-y-4"><fieldset><legend className="sr-only">Type de pointage</legend><div className="grid grid-cols-2 gap-3"><button type="button" onClick={() => setType("arrivee")} aria-pressed={type === "arrivee"} className={`flex min-h-14 items-center justify-center gap-2 rounded-2xl border text-base font-bold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/50 ${type === "arrivee" ? "border-emerald-400 bg-emerald-600 ring-2 ring-white" : "border-white/15 bg-white/5 text-white/70"}`}><LogIn size={20} aria-hidden="true" />Arrivée</button><button type="button" onClick={() => setType("depart")} aria-pressed={type === "depart"} className={`flex min-h-14 items-center justify-center gap-2 rounded-2xl border text-base font-bold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/50 ${type === "depart" ? "border-amber-300 bg-amber-600 ring-2 ring-white" : "border-white/15 bg-white/5 text-white/70"}`}><LogOut size={20} aria-hidden="true" />Départ</button></div></fieldset>
      <div aria-label={`Code saisi : ${pin.length} chiffre${pin.length > 1 ? "s" : ""}`} className="flex justify-center gap-2">{Array.from({ length: 6 }).map((_, index) => <span key={index} className={`flex h-10 w-10 items-center justify-center rounded-full border-2 ${index < pin.length ? "border-emerald-300 bg-emerald-600" : "border-white/20"}`}>{index < pin.length && <span className="h-2.5 w-2.5 rounded-full bg-white" />}</span>)}</div></div></div>
    <div className="grid grid-cols-3 gap-3" aria-label="Pavé numérique">{DIGITS.map((digit, index) => digit === "" ? <span key={index} className="h-16 w-20 sm:h-20 sm:w-24" aria-hidden="true" /> : <button key={index} type="button" onClick={() => pressDigit(digit)} aria-label={digit === "DEL" ? "Effacer le dernier chiffre" : `Chiffre ${digit}`} disabled={status === "loading"} className="flex h-16 w-20 items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-2xl font-black hover:bg-white/15 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-300 disabled:opacity-40 sm:h-20 sm:w-24">{digit === "DEL" ? <Delete size={25} aria-hidden="true" /> : digit}</button>)}</div>
    <button type="button" onClick={handleConfirm} disabled={pin.length < 4 || status === "loading"} className={`flex min-h-14 min-w-56 items-center justify-center gap-2 rounded-2xl px-8 text-lg font-black focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/50 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/35 ${type === "arrivee" ? "bg-emerald-600" : "bg-amber-600"}`}>{status === "loading" ? <><LoaderCircle className="animate-spin" aria-hidden="true" />Vérification…</> : "Valider le pointage"}</button>
    <p className="sr-only" role="status" aria-live="polite">{status === "loading" ? "Vérification et enregistrement du pointage en cours" : "En attente de saisie"}</p>
  </div></main>;
}
