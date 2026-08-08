import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          padding: "80px",
          background:
            "radial-gradient(ellipse farthest-corner at top left, #03130d 0%, #0a3d28 15%, #0f9d68 38%, #5fc29e 65%, #eaf6f0 100%)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 40 }}>
          <div style={{ display: "flex", width: 64, height: 64, borderRadius: 16, overflow: "hidden" }}>
            <div style={{ flex: 1, background: "#059669" }} />
            <div style={{ flex: 1, background: "#ef4444" }} />
            <div style={{ flex: 1, background: "#facc15" }} />
          </div>
          <div style={{ display: "flex", fontSize: 44, fontWeight: 900, color: "white" }}>
            Écoles<span style={{ color: "#34d399" }}>237</span>
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 56, fontWeight: 900, color: "white", maxWidth: 900, lineHeight: 1.1 }}>
          Trouvez et inscrivez votre enfant dans une école au Cameroun
        </div>
        <div style={{ display: "flex", fontSize: 28, color: "rgba(255,255,255,0.75)", marginTop: 24, maxWidth: 820 }}>
          Annuaire scolaire — Douala, Yaoundé et partout au Cameroun
        </div>
      </div>
    ),
    { ...size }
  );
}
