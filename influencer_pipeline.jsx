import { useState, useRef, useEffect } from "react";

// ── API helpers ───────────────────────────────────────────────────────────────

const callClaude = async (system, user) => {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": "API KEY HERE",
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  const data = await res.json();
  const text = data.content?.map((b) => b.text || "").join("") || "";
  return text.replace(/```json|```/g, "").trim();
};

const heygenGet = async (path, apiKey) => {
  const res = await fetch(`https://api.heygen.com${path}`, {
    headers: { "X-Api-Key": apiKey, accept: "application/json" },
  });
  return res.json();
};

const heygenPost = async (path, apiKey, body) => {
  const res = await fetch(`https://api.heygen.com${path}`, {
    method: "POST",
    headers: { "X-Api-Key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
};

const parseJSON = (str) => {
  try { return JSON.parse(str); } catch { return null; }
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Sub-components ────────────────────────────────────────────────────────────

function Tag({ children, color = "gray" }) {
  const map = {
    green: ["var(--color-background-success)", "var(--color-text-success)"],
    blue: ["var(--color-background-info)", "var(--color-text-info)"],
    amber: ["var(--color-background-warning)", "var(--color-text-warning)"],
    red: ["var(--color-background-danger)", "var(--color-text-danger)"],
    gray: ["var(--color-background-secondary)", "var(--color-text-secondary)"],
  };
  const [bg, fg] = map[color] || map.gray;
  return (
    <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 20, background: bg, color: fg, fontFamily: "var(--font-sans)", fontWeight: 500, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

function Card({ title, accent, children }) {
  return (
    <div style={{ borderRadius: "var(--border-radius-lg)", border: "0.5px solid var(--color-border-tertiary)", background: "var(--color-background-primary)", overflow: "hidden", marginBottom: 16 }}>
      <div style={{ padding: "11px 18px", borderBottom: "0.5px solid var(--color-border-tertiary)", background: "var(--color-background-secondary)", display: "flex", alignItems: "center", gap: 8 }}>
        {accent && <div style={{ width: 3, height: 14, borderRadius: 2, background: accent, flexShrink: 0 }} />}
        <span style={{ fontSize: 13, fontWeight: 500, fontFamily: "var(--font-sans)" }}>{title}</span>
      </div>
      <div style={{ padding: "16px 18px" }}>{children}</div>
    </div>
  );
}

function StepRow({ step, status }) {
  const done = status === "done";
  const running = status === "running";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
      <div style={{
        width: 26, height: 26, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 11, fontFamily: "var(--font-mono)",
        background: done ? "var(--color-background-success)" : running ? "var(--color-text-primary)" : "var(--color-background-secondary)",
        color: done ? "var(--color-text-success)" : running ? "var(--color-background-primary)" : "var(--color-text-tertiary)",
        transition: "all 0.3s",
      }}>
        {done ? "✓" : running ? <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>◌</span> : step.id}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: running ? 500 : 400, fontFamily: "var(--font-sans)", color: running || done ? "var(--color-text-primary)" : "var(--color-text-secondary)" }}>{step.name}</div>
        {running && <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", fontFamily: "var(--font-sans)", marginTop: 1 }}>{step.hint}</div>}
      </div>
      {done && <Tag color="green">done</Tag>}
      {running && <Tag color="gray">running…</Tag>}
    </div>
  );
}

// Avatar picker modal
function AvatarPicker({ avatars, voices, onConfirm, onCancel }) {
  const [selAvatar, setSelAvatar] = useState(avatars[0]);
  const [selVoice, setSelVoice] = useState(voices[0]);
  const [search, setSearch] = useState("");
  const [voiceSearch, setVoiceSearch] = useState("");
  const [voiceGender, setVoiceGender] = useState("all");
  const [voiceLang, setVoiceLang] = useState("all");

  const languages = ["all", ...new Set(voices.map(v => v.language).filter(Boolean))].slice(0, 20);

  const filteredVoices = voices.filter(v => {
    const name = (v.display_name || v.name || "").toLowerCase();
    const matchSearch = name.includes(voiceSearch.toLowerCase());
    const matchGender = voiceGender === "all" || (v.gender || "").toLowerCase() === voiceGender;
    const matchLang = voiceLang === "all" || v.language === voiceLang;
    return matchSearch && matchGender && matchLang;
  });

  const filtered = avatars.filter(a =>
    (a.avatar_name || a.name || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "var(--color-background-primary)", borderRadius: "var(--border-radius-lg)", border: "0.5px solid var(--color-border-secondary)", width: "100%", maxWidth: 600, maxHeight: "80vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "0.5px solid var(--color-border-tertiary)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 500, fontFamily: "var(--font-sans)" }}>Choose your influencer avatar</div>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", fontFamily: "var(--font-sans)", marginTop: 2 }}>Select an avatar and voice for your talking-head video</div>
          </div>
          <button onClick={onCancel} style={{ background: "transparent", border: "none", fontSize: 18, cursor: "pointer", color: "var(--color-text-secondary)", lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: "14px 20px", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search avatars…"
            style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", fontSize: 13 }} />
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "14px 20px" }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-secondary)", fontFamily: "var(--font-sans)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Avatars ({filtered.length})
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10, marginBottom: 20 }}>
            {filtered.map(a => {
              const id = a.avatar_id || a.id;
              const name = a.avatar_name || a.name || id;
              const thumb = a.preview_image_url || a.thumbnail_image_url;
              const selected = selAvatar?.avatar_id === id || selAvatar?.id === id;
              return (
                <div key={id} onClick={() => setSelAvatar(a)} style={{
                  border: selected ? "2px solid var(--color-border-info)" : "0.5px solid var(--color-border-tertiary)",
                  borderRadius: "var(--border-radius-md)", overflow: "hidden", cursor: "pointer",
                  background: selected ? "var(--color-background-info)" : "var(--color-background-secondary)",
                  transition: "all 0.15s"
                }}>
                  {thumb ? (
                    <img src={thumb} alt={name} style={{ width: "100%", aspectRatio: "1", objectFit: "cover", display: "block" }} />
                  ) : (
                    <div style={{ width: "100%", aspectRatio: "1", background: "var(--color-background-tertiary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>◉</div>
                  )}
                  <div style={{ padding: "6px 8px", fontSize: 11, fontFamily: "var(--font-sans)", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: selected ? "var(--color-text-info)" : "var(--color-text-primary)", fontWeight: selected ? 500 : 400 }}>{name}</div>
                </div>
              );
            })}
          </div>

          <div style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-secondary)", fontFamily: "var(--font-sans)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Voice
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input value={voiceSearch} onChange={e => setVoiceSearch(e.target.value)}
              placeholder="Search voices…"
              style={{ flex: 1, padding: "7px 10px", fontFamily: "var(--font-sans)", fontSize: 12 }} />
            <select value={voiceGender} onChange={e => setVoiceGender(e.target.value)}
              style={{ padding: "7px 10px", fontFamily: "var(--font-sans)", fontSize: 12 }}>
              <option value="all">All genders</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
            <select value={voiceLang} onChange={e => setVoiceLang(e.target.value)}
              style={{ padding: "7px 10px", fontFamily: "var(--font-sans)", fontSize: 12 }}>
              {languages.map(l => <option key={l} value={l}>{l === "all" ? "All languages" : l}</option>)}
            </select>
          </div>

          <div style={{ maxHeight: 180, overflowY: "auto", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-md)" }}>
            {filteredVoices.length === 0 && (
              <div style={{ padding: "12px", fontSize: 12, color: "var(--color-text-tertiary)", fontFamily: "var(--font-sans)", textAlign: "center" }}>No voices match your search</div>
            )}
            {filteredVoices.map(v => {
              const selected = selVoice?.voice_id === v.voice_id;
              return (
                <div key={v.voice_id} onClick={() => setSelVoice(v)} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "9px 12px", cursor: "pointer",
                  background: selected ? "var(--color-background-info)" : "transparent",
                  borderBottom: "0.5px solid var(--color-border-tertiary)",
                  transition: "background 0.1s"
                }}>
                  <span style={{ fontSize: 13, fontFamily: "var(--font-sans)", fontWeight: selected ? 500 : 400, color: selected ? "var(--color-text-info)" : "var(--color-text-primary)" }}>
                    {v.display_name || v.name}
                  </span>
                  <span style={{ fontSize: 11, color: selected ? "var(--color-text-info)" : "var(--color-text-tertiary)", fontFamily: "var(--font-sans)" }}>
                    {[v.gender, v.language].filter(Boolean).join(" · ")}
                  </span>
                </div>
              );
            })}
          </div>
          {selVoice && (
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", fontFamily: "var(--font-sans)", marginTop: 6 }}>
              Selected: <strong>{selVoice.display_name || selVoice.name}</strong>
            </div>
          )}
        </div>

        <div style={{ padding: "14px 20px", borderTop: "0.5px solid var(--color-border-tertiary)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onCancel} style={{ padding: "9px 18px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-md)", background: "transparent", fontSize: 13, cursor: "pointer" }}>Cancel</button>
          <button onClick={() => onConfirm(selAvatar, selVoice)} disabled={!selAvatar || !selVoice} style={{
            padding: "9px 20px", background: selAvatar && selVoice ? "var(--color-text-primary)" : "var(--color-background-secondary)",
            color: selAvatar && selVoice ? "var(--color-background-primary)" : "var(--color-text-tertiary)",
            border: "none", borderRadius: "var(--border-radius-md)", fontSize: 13, fontWeight: 500, cursor: selAvatar && selVoice ? "pointer" : "not-allowed"
          }}>
            Generate video →
          </button>
        </div>
      </div>
    </div>
  );
}

// Result sections
function IdeasSection({ ideas, chosen }) {
  if (!ideas) return null;
  return (
    <Card title="Step 1 — Content ideas" accent="#1D9E75">
      <div style={{ padding: "10px 12px", borderRadius: "var(--border-radius-md)", border: "2px solid var(--color-border-info)", background: "var(--color-background-info)", marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: "var(--color-text-info)", marginBottom: 2, fontFamily: "var(--font-sans)" }}>Agent selected</div>
        <div style={{ fontSize: 14, fontWeight: 500, fontFamily: "var(--font-sans)", color: "var(--color-text-info)" }}>{chosen?.title}</div>
        <div style={{ fontSize: 12, color: "var(--color-text-info)", fontFamily: "var(--font-sans)", marginTop: 2 }}>{chosen?.angle} · {chosen?.potential} potential</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {ideas.filter(i => i.title !== chosen?.title).slice(0, 3).map((idea, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "7px 10px", borderRadius: "var(--border-radius-md)", background: "var(--color-background-secondary)" }}>
            <span style={{ fontSize: 12, fontFamily: "var(--font-sans)" }}>{idea.title}</span>
            <Tag color={idea.potential === "High" ? "green" : "amber"}>{idea.potential}</Tag>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ScriptSection({ script }) {
  if (!script) return null;
  const parts = [
    { key: "hook", label: "Hook", color: "#E1306C" },
    { key: "point1", label: "Point 1", color: "#378ADD" },
    { key: "point2", label: "Point 2", color: "#378ADD" },
    { key: "point3", label: "Point 3", color: "#378ADD" },
    { key: "takeaway", label: "Takeaway", color: "#1D9E75" },
  ];
  return (
    <Card title="Step 2 — Video script" accent="#378ADD">
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {parts.map(p => (
          <div key={p.key} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <div style={{ fontSize: 10, padding: "3px 7px", borderRadius: 3, background: `${p.color}18`, color: p.color, fontFamily: "var(--font-mono)", flexShrink: 0, marginTop: 2, fontWeight: 500, whiteSpace: "nowrap" }}>{p.label}</div>
            <div style={{ fontSize: 13, fontFamily: "var(--font-sans)", lineHeight: 1.6 }}>{script[p.key]}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function VideoSection({ videoStatus, videoUrl, avatarName, voiceName, onGenerate, canGenerate }) {
  return (
    <Card title="Step 3 — AI influencer video" accent="#BA7517">
      {!videoStatus && (
        <div style={{ textAlign: "center", padding: "1.5rem 0" }}>
          <div style={{ fontSize: 13, color: "var(--color-text-secondary)", fontFamily: "var(--font-sans)", marginBottom: 14, lineHeight: 1.6 }}>
            Generate a realistic talking-head video using your HeyGen avatar.<br />
            You'll be able to choose your avatar and voice.
          </div>
          <button onClick={onGenerate} disabled={!canGenerate} style={{
            padding: "10px 24px", background: canGenerate ? "var(--color-text-primary)" : "var(--color-background-secondary)",
            color: canGenerate ? "var(--color-background-primary)" : "var(--color-text-tertiary)",
            border: "none", borderRadius: "var(--border-radius-md)", fontSize: 14, fontWeight: 500, cursor: canGenerate ? "pointer" : "not-allowed"
          }}>
            Pick avatar & generate video →
          </button>
        </div>
      )}

      {(videoStatus === "pending" || videoStatus === "waiting" || videoStatus === "processing") && (
        <div style={{ textAlign: "center", padding: "1.5rem 0" }}>
          <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 10 }}>
            {[0, 1, 2].map(i => <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--color-text-tertiary)", animation: `pulse 1s ${i * 0.2}s ease-in-out infinite` }} />)}
          </div>
          <div style={{ fontSize: 13, fontFamily: "var(--font-sans)", color: "var(--color-text-secondary)" }}>
            HeyGen is rendering your video… ({videoStatus})
          </div>
          {avatarName && <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", fontFamily: "var(--font-sans)", marginTop: 4 }}>Avatar: {avatarName} · Voice: {voiceName}</div>}
          <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", fontFamily: "var(--font-sans)", marginTop: 4 }}>This typically takes 1–3 minutes. Polling every 10s…</div>
        </div>
      )}

      {videoStatus === "completed" && videoUrl && (
        <div>
          <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
            {avatarName && <Tag color="blue">Avatar: {avatarName}</Tag>}
            {voiceName && <Tag color="blue">Voice: {voiceName}</Tag>}
            <Tag color="green">Completed</Tag>
          </div>
          <video controls style={{ width: "100%", borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-tertiary)", background: "#000", display: "block" }}>
            <source src={videoUrl} />
            Your browser does not support video.
          </video>
          <a href={videoUrl} download target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 10, fontSize: 13, fontFamily: "var(--font-sans)", color: "var(--color-text-info)", textDecoration: "none" }}>
            Download video ↓
          </a>
        </div>
      )}

      {videoStatus === "failed" && (
        <div style={{ padding: "12px 14px", borderRadius: "var(--border-radius-md)", background: "var(--color-background-danger)", color: "var(--color-text-danger)", fontSize: 13, fontFamily: "var(--font-sans)" }}>
          Video generation failed. Check your HeyGen API key and avatar/voice IDs, then try again.
          <button onClick={onGenerate} style={{ marginLeft: 12, padding: "4px 12px", border: "0.5px solid var(--color-text-danger)", borderRadius: "var(--border-radius-md)", background: "transparent", color: "var(--color-text-danger)", fontSize: 12, cursor: "pointer", fontFamily: "var(--font-sans)" }}>Retry</button>
        </div>
      )}
    </Card>
  );
}

function ScheduleSection({ schedule }) {
  if (!schedule) return null;
  const platformColors = { TikTok: "#E1306C", "Instagram Reels": "#833AB4", "YouTube Shorts": "#FF0000", LinkedIn: "#0077B5" };
  return (
    <Card title="Step 4 — 7-day posting schedule" accent="#7F77DD">
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {schedule.map((day) => (
          <div key={day.day} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "9px 12px", borderRadius: "var(--border-radius-md)", background: "var(--color-background-secondary)" }}>
            <div style={{ minWidth: 36, textAlign: "center", flexShrink: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 500, fontFamily: "var(--font-mono)" }}>{day.day}</div>
              <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", fontFamily: "var(--font-sans)" }}>{day.time}</div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ marginBottom: 3 }}>
                <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 20, fontFamily: "var(--font-sans)", fontWeight: 500, background: `${platformColors[day.platform] || "#888"}22`, color: platformColors[day.platform] || "var(--color-text-secondary)" }}>{day.platform}</span>
              </div>
              <div style={{ fontSize: 12, fontFamily: "var(--font-sans)", lineHeight: 1.5, marginBottom: 2 }}>{day.caption}</div>
              <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", fontFamily: "var(--font-sans)" }}>{day.hashtags?.join(" ")}</div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function OptSection({ opt }) {
  if (!opt) return null;
  return (
    <Card title="Step 5 — Viral optimization" accent="#D4537E">
      <div style={{ display: "flex", gap: 16, alignItems: "center", padding: "12px 14px", borderRadius: "var(--border-radius-md)", background: "var(--color-background-secondary)", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 32, fontWeight: 500, fontFamily: "var(--font-mono)", lineHeight: 1 }}>{opt.viralScore}<span style={{ fontSize: 14, color: "var(--color-text-tertiary)" }}>/10</span></div>
          <div style={{ fontSize: 11, color: "var(--color-text-secondary)", fontFamily: "var(--font-sans)", marginTop: 2 }}>Viral score</div>
        </div>
        <div style={{ flex: 1, height: 6, background: "var(--color-background-tertiary)", borderRadius: 3, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${(opt.viralScore || 0) * 10}%`, borderRadius: 3, background: (opt.viralScore || 0) >= 7 ? "var(--color-text-success)" : (opt.viralScore || 0) >= 5 ? "var(--color-text-warning)" : "var(--color-text-danger)" }} />
        </div>
      </div>
      <div style={{ fontSize: 13, fontFamily: "var(--font-sans)", fontStyle: "italic", color: "var(--color-text-secondary)", marginBottom: 12, lineHeight: 1.6 }}>{opt.scoreReason}</div>
      {[
        { label: "Strengths", items: opt.strengths, color: "green" },
        { label: "Improvements", items: opt.improvements, color: "red" },
        { label: "A/B tests", items: opt.abTests, color: "blue" },
      ].map(s => (
        <div key={s.label} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary)", fontFamily: "var(--font-sans)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.04em" }}>{s.label}</div>
          {s.items?.map((item, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 4, alignItems: "flex-start" }}>
              <Tag color={s.color}>{i + 1}</Tag>
              <span style={{ fontSize: 12, fontFamily: "var(--font-sans)", lineHeight: 1.5 }}>{item}</span>
            </div>
          ))}
        </div>
      ))}
      {opt.boldRec && (
        <div style={{ padding: "10px 12px", borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-tertiary)" }}>
          <div style={{ fontSize: 10, fontWeight: 500, color: "var(--color-text-secondary)", fontFamily: "var(--font-sans)", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.04em" }}>Bold recommendation</div>
          <div style={{ fontSize: 13, fontFamily: "var(--font-sans)", lineHeight: 1.6 }}>{opt.boldRec}</div>
        </div>
      )}
    </Card>
  );
}

// ── PIPELINE STEPS CONFIG ─────────────────────────────────────────────────────
const STEPS = [
  { id: 1, name: "Content Idea Mining", hint: "Generating viral angles…" },
  { id: 2, name: "Script Generation", hint: "Writing hook + 3 points + takeaway…" },
  { id: 3, name: "AI Video Generation", hint: "Submitting to HeyGen & polling…" },
  { id: 4, name: "Posting Schedule", hint: "Building 7-day multi-platform plan…" },
  { id: 5, name: "Viral Optimization", hint: "Scoring and optimizing…" },
];

// ── MAIN APP ──────────────────────────────────────────────────────────────────

const AVATAR_LIBRARY_KEY = "hg_avatar_library";

const loadAvatarLibrary = () => {
  try { return JSON.parse(localStorage.getItem(AVATAR_LIBRARY_KEY) || "[]"); } catch { return []; }
};

const saveAvatarToLibrary = (avatar) => {
  try {
    const lib = loadAvatarLibrary();
    const exists = lib.find(a => a.talkingPhotoId === avatar.talkingPhotoId);
    if (!exists) {
      lib.unshift({ ...avatar, savedAt: new Date().toISOString() });
      localStorage.setItem(AVATAR_LIBRARY_KEY, JSON.stringify(lib));
    }
    return lib;
  } catch { return []; }
};

export default function App() {
  const [heygenKey, setHeygenKey] = useState("");
  const [niche, setNiche] = useState("");
  const [phase, setPhase] = useState("input"); // input | running | review | approved | revising | library
  const [stepStatuses, setStepStatuses] = useState({ 1: "idle", 2: "idle", 3: "idle", 4: "idle", 5: "idle" });
  const [results, setResults] = useState({});
  const [log, setLog] = useState([]);
  const [error, setError] = useState(null);
  const [feedback, setFeedback] = useState("");
  const [avatarLibrary, setAvatarLibrary] = useState(loadAvatarLibrary);
  const [useExistingAvatar, setUseExistingAvatar] = useState(false);
  const [selectedLibraryAvatar, setSelectedLibraryAvatar] = useState(null);

  // HeyGen video state
  const [avatars, setAvatars] = useState([]);
  const [voices, setVoices] = useState([]);
  const [chosenAvatar, setChosenAvatar] = useState(null);
  const [chosenVoice, setChosenVoice] = useState(null);
  const [videoStatus, setVideoStatus] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [videoId, setVideoId] = useState(null);

  // Pending pipeline state (paused at video step)
  const pendingNiche = useRef("");
  const pendingFeedback = useRef("");
  const pendingResults = useRef({});

  const logRef = useRef(null);
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [log]);

  const addLog = (msg) => setLog(l => [...l, { time: new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }), msg }]);
  const setStepStatus = (id, s) => setStepStatuses(prev => ({ ...prev, [id]: s }));

  // ── Run pipeline steps 1, 2 (pause for avatar picker), then 4, 5 ────────────
  const runPipelinePhase1 = async (nicheTopic, fbText = "", existingAvatar = null) => {
    setError(null);
    setResults({});
    setVideoStatus(null);
    setVideoUrl(null);
    setVideoId(null);
    setLog([]);
    setStepStatuses({ 1: "idle", 2: "idle", 3: "idle", 4: "idle", 5: "idle" });
    setPhase("running");

    try {
      // Step 1
      setStepStatus(1, "running");
      addLog(`Mining ideas for "${nicheTopic}"…`);
      const ideasRaw = await callClaude(
        "You are a viral content strategist. You must respond with ONLY a valid JSON object. No explanation, no markdown, no extra text. Just the raw JSON.",
        `Generate 1 viral content idea for the niche: "${nicheTopic}"${fbText ? `. User feedback: ${fbText}` : ""}.
Respond with ONLY this exact JSON structure:
{"ideas":[{"title":"idea title","angle":"hook angle","potential":"High","reason":"why it works"}],"chosen":{"title":"idea title","angle":"hook angle","potential":"High","reason":"why it works"}}
The "chosen" field must be the same as the single idea in the list.`
      );
      const ideasData = parseJSON(ideasRaw);
      if (!ideasData) throw new Error("Step 1: bad JSON from Claude");
      pendingResults.current = { ideas: ideasData.ideas, chosen: ideasData.chosen };
      setResults({ ideas: ideasData.ideas, chosen: ideasData.chosen });
      setStepStatus(1, "done");
      addLog(`✓ ${ideasData.ideas.length} ideas mined → selected: "${ideasData.chosen.title}"`);

      // Step 2
      setStepStatus(2, "running");
      addLog("Writing video script…");
      const scriptRaw = await callClaude(
        "You are a viral short-form video scriptwriter. Return ONLY valid JSON, no markdown.",
        `Write a 60–90s influencer-style talking-head script for: "${ideasData.chosen.title}" (${ideasData.chosen.angle}).
Tone: direct, energetic, speaking to camera like a trusted friend.
Return: {"hook":"...","point1":"...","point2":"...","point3":"...","takeaway":"...","fullText":"<hook> <point1> <point2> <point3> <takeaway> — all joined as one natural spoken monologue under 900 chars"}`
      );
      const script = parseJSON(scriptRaw);
      if (!script) throw new Error("Step 2: bad JSON from Claude");
      pendingResults.current = { ...pendingResults.current, script };
      setResults(r => ({ ...r, script }));
      setStepStatus(2, "done");

      // If reusing an existing avatar, skip generation entirely
      if (existingAvatar) {
        addLog(`✓ Script ready — reusing saved avatar: ${existingAvatar.name}`);
        setStepStatus(3, "done");
        pendingResults.current = { ...pendingResults.current, avatarDesign: existingAvatar, talkingPhotoId: existingAvatar.talkingPhotoId };
        setResults(r => ({ ...r, avatarDesign: existingAvatar }));
        await runVideoAndSchedule(existingAvatar.talkingPhotoId, existingAvatar.voiceId, existingAvatar.name, script);
        return;
      }

      addLog("✓ Script ready — designing unique avatar…");

      // Step 3: Auto-generate unique avatar
      setStepStatus(3, "running");

      // Claude designs the avatar persona
      const avatarDesignRaw = await callClaude(
        "You are a creative director designing unique AI influencer avatars. Return ONLY valid JSON, no markdown, no extra text.",
        `Design a unique influencer avatar for the niche: "${nicheTopic}".
Return ONLY this JSON (no other text):
{"name":"FirstName","age":"Young Adult","gender":"Woman","ethnicity":"e.g. African American","pose":"half_body","style":"Realistic","appearance":"detailed description of person clothing background and expression relevant to ${nicheTopic}","voiceId":"e5a2359d1d564a3d801f6ca073d72acf"}`
      );
      const avatarDesign = parseJSON(avatarDesignRaw);
      if (!avatarDesign) throw new Error("Step 3: Could not design avatar");
      addLog(`✓ Designed: ${avatarDesign.name}, ${avatarDesign.gender}, ${avatarDesign.ethnicity}`);

      // Generate avatar photo
      addLog("Generating avatar face with HeyGen…");
      const genResp = await heygenPost("/v2/photo_avatar/photo/generate", heygenKey, {
        name: avatarDesign.name,
        age: avatarDesign.age,
        gender: avatarDesign.gender,
        ethnicity: avatarDesign.ethnicity,
        orientation: "vertical",
        pose: avatarDesign.pose,
        style: avatarDesign.style,
        appearance: avatarDesign.appearance,
      });
      const generationId = genResp?.data?.generation_id;
      if (!generationId) throw new Error("HeyGen avatar generation failed. Check API key and credits.");
      addLog(`Avatar generating — polling…`);

      // Poll for photo
      let photoData = null;
      for (let i = 0; i < 24; i++) {
        await sleep(5000);
        const sr = await heygenGet(`/v2/photo_avatar/generation/${generationId}`, heygenKey);
        const st = sr?.data?.status;
        addLog(`Photo poll ${i + 1}: ${st}`);
        if (st === "success" || st === "completed") { photoData = sr?.data; break; }
        if (st === "failed") throw new Error("Avatar photo generation failed.");
      }
      if (!photoData) throw new Error("Avatar photo timed out.");
      const imageKey = photoData?.image_key || photoData?.images?.[0]?.image_key;
      if (!imageKey) throw new Error("No image key from HeyGen.");
      addLog("✓ Photo ready — creating avatar group…");

      // Create avatar group
      const groupResp = await heygenPost("/v2/photo_avatar/avatar_group/create", heygenKey, {
        name: `${avatarDesign.name} — ${nicheTopic}`,
        image_key: imageKey,
        generation_id: generationId,
      });
      const groupId = groupResp?.data?.group_id;
      if (!groupId) throw new Error("Failed to create avatar group.");
      addLog("✓ Group created — training avatar…");

      // Train avatar
      await heygenPost("/v2/photo_avatar/train", heygenKey, { group_id: groupId });

      // Poll for training
      let talkingPhotoId = null;
      for (let i = 0; i < 24; i++) {
        await sleep(5000);
        const tr = await heygenGet(`/v2/photo_avatar/train/status/${groupId}`, heygenKey);
        const st = tr?.data?.status;
        addLog(`Training poll ${i + 1}: ${st}`);
        if (st === "success" || st === "completed") {
          const lr = await heygenGet(`/v2/photo_avatar/avatar_group/${groupId}`, heygenKey);
          talkingPhotoId = lr?.data?.avatars?.[0]?.id || lr?.data?.looks?.[0]?.id;
          break;
        }
        if (st === "failed") throw new Error("Avatar training failed.");
      }
      if (!talkingPhotoId) throw new Error("Could not get trained avatar ID.");
      addLog(`✓ Avatar "${avatarDesign.name}" ready!`);

      // Save to local library for reuse
      const avatarEntry = {
        talkingPhotoId,
        name: avatarDesign.name,
        niche: nicheTopic,
        gender: avatarDesign.gender,
        ethnicity: avatarDesign.ethnicity,
        age: avatarDesign.age,
        appearance: avatarDesign.appearance,
        voiceId: avatarDesign.voiceId,
        groupId,
      };
      const updatedLib = saveAvatarToLibrary(avatarEntry);
      setAvatarLibrary(updatedLib);
      addLog(`✓ Avatar saved to library (${updatedLib.length} total)`);

      pendingResults.current = { ...pendingResults.current, avatarDesign, talkingPhotoId };
      setResults(r => ({ ...r, avatarDesign }));

      // Kick off video + schedule automatically
      await runVideoAndSchedule(talkingPhotoId, avatarDesign.voiceId, avatarDesign.name, script);

    } catch (e) {
      setError(e.message);
      setPhase("input");
      addLog(`✗ ${e.message}`);
    }
  };

  const runVideoAndSchedule = async (talkingPhotoId, voiceId, avatarName, script) => {
    setPhase("running");
    setVideoStatus("pending");
    const spokenText = script.fullText || `${script.hook} ${script.point1} ${script.point2} ${script.point3} ${script.takeaway}`;

    try {
      addLog(`Generating video with avatar: ${avatarName}…`);
      const createResp = await heygenPost("/v2/video/generate", heygenKey, {
        video_inputs: [{
          character: { type: "talking_photo", talking_photo_id: talkingPhotoId },
          voice: { type: "text", input_text: spokenText, voice_id: voiceId },
          background: { type: "color", value: "#f5f5f0" },
        }],
        dimension: { width: 1080, height: 1920 },
        caption: true,
      });

      const vid = createResp?.data?.video_id;
      if (!vid) throw new Error("HeyGen did not return a video_id. Check API key and credits.");
      setVideoId(vid);
      addLog(`Video submitted — id: ${vid} — polling…`);

      let attempts = 0;
      while (attempts < 40) {
        await sleep(10000);
        attempts++;
        const statusResp = await heygenGet(`/v1/video_status.get?video_id=${vid}`, heygenKey);
        const st = statusResp?.data?.status;
        setVideoStatus(st);
        addLog(`Video poll ${attempts}: ${st}`);
        if (st === "completed") {
          setVideoUrl(statusResp?.data?.video_url);
          setStepStatus(3, "done");
          addLog("✓ Video ready!");
          break;
        }
        if (st === "failed") throw new Error("HeyGen video rendering failed.");
      }
      if (attempts >= 40) throw new Error("Video polling timed out (>6 min).");

      // Step 4 — Schedule
      setStepStatus(4, "running");
      addLog("Building posting schedule…");
      const schedRaw = await callClaude(
        "You are a social media distribution strategist. Return ONLY a valid JSON array, no markdown.",
        `Build a 7-day posting schedule for: "${pendingResults.current.chosen?.title}".
Platforms: TikTok, Instagram Reels, YouTube Shorts, LinkedIn.
Return: [{"day":1,"time":"HH:MM","platform":"...","caption":"under 150 chars","hashtags":["#..."],"hook":"engagement CTA"}]`
      );
      const schedule = parseJSON(schedRaw);
      if (!schedule) throw new Error("Step 4: bad JSON");
      pendingResults.current = { ...pendingResults.current, schedule };
      setResults(r => ({ ...r, schedule }));
      setStepStatus(4, "done");
      addLog(`✓ ${schedule.length}-day schedule built`);

      // Step 5 — Optimization
      setStepStatus(5, "running");
      addLog("Running viral optimization…");
      const chosen = pendingResults.current.chosen;
      const script2 = pendingResults.current.script;
      const optRaw = await callClaude(
        "You are a content performance strategist. Return ONLY valid JSON, no markdown.",
        `Analyze this content pipeline:
Niche: ${pendingNiche.current}
Idea: ${chosen?.title} (${chosen?.angle})
Hook: "${script2?.hook}"
Points: "${script2?.point1}" / "${script2?.point2}" / "${script2?.point3}"
Takeaway: "${script2?.takeaway}"
Schedule: ${schedule.length} days, platforms: ${[...new Set(schedule.map(d => d.platform))].join(", ")}
Return: {"viralScore":<1-10>,"scoreReason":"...","strengths":["...","...","..."],"improvements":["...","...","..."],"abTests":["...","..."],"boldRec":"..."}`
      );
      const opt = parseJSON(optRaw);
      if (!opt) throw new Error("Step 5: bad JSON");
      setResults(r => ({ ...r, opt }));
      setStepStatus(5, "done");
      addLog(`✓ Viral score: ${opt.viralScore}/10 — pipeline complete`);
      setPhase("review");

    } catch (e) {
      setError(e.message);
      setVideoStatus("failed");
      addLog(`✗ ${e.message}`);
      setPhase("review");
    }
  };

  const handleStart = () => {
    if (!niche.trim() || !heygenKey.trim()) return;
    pendingNiche.current = niche.trim();
    pendingFeedback.current = "";
    if (useExistingAvatar && selectedLibraryAvatar) {
      // Skip avatar generation, go straight to video
      runPipelinePhase1(niche.trim(), "", selectedLibraryAvatar);
    } else {
      runPipelinePhase1(niche.trim());
    }
  };

  const handleRevise = () => setPhase("revising");

  const handleSubmitRevision = () => {
    pendingFeedback.current = feedback.trim();
    runPipelinePhase1(pendingNiche.current, feedback.trim());
    setFeedback("");
  };

  const handleApprove = () => setPhase("approved");

  const handleReset = () => {
    setPhase("input");
    setNiche("");
    setResults({});
    setLog([]);
    setError(null);
    setFeedback("");
    setVideoStatus(null);
    setVideoUrl(null);
    setVideoId(null);
    setStepStatuses({ 1: "idle", 2: "idle", 3: "idle", 4: "idle", 5: "idle" });
    pendingResults.current = {};
  };

  const activeStep = Object.entries(stepStatuses).find(([, v]) => v === "running")?.[0];

  return (
    <div style={{ fontFamily: "var(--font-sans)", minHeight: "100vh", background: "var(--color-background-tertiary)", color: "var(--color-text-primary)" }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        @keyframes pulse { 0%,100%{opacity:.2} 50%{opacity:1} }
      `}</style>

      {phase === "picker" && null}

      <div style={{ maxWidth: 780, margin: "0 auto", padding: "2.5rem 1rem" }}>
        <div style={{ marginBottom: "2rem" }}>
          <h1 style={{ fontSize: 24, fontWeight: 500, margin: "0 0 4px", letterSpacing: "-0.3px" }}>Influencer Content Pipeline</h1>
          <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: 0 }}>AI mines idea → writes script → generates unique avatar → creates video → builds schedule → you approve</p>
        </div>

        {/* INPUT */}
        {phase === "input" && (
          <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "2rem", animation: "fadeIn 0.3s ease" }}>
            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 7 }}>HeyGen API key</label>
              <input type="password" value={heygenKey} onChange={e => setHeygenKey(e.target.value)}
                placeholder="Paste your HeyGen API key — Settings → API in HeyGen dashboard"
                style={{ width: "100%", boxSizing: "border-box", padding: "11px 14px", fontSize: 13 }} />
              <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 5, fontFamily: "var(--font-sans)" }}>
                Get a key at <a href="https://app.heygen.com/settings?nav=API" target="_blank" rel="noreferrer" style={{ color: "var(--color-text-info)" }}>app.heygen.com/settings</a> · API credits from $5 · key is never stored
              </div>
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 7 }}>Content niche</label>
              <input value={niche} onChange={e => setNiche(e.target.value)}
                onKeyDown={e => e.key === "Enter" && niche.trim() && heygenKey.trim() && handleStart()}
                placeholder="e.g. AI productivity, personal finance, fitness for busy parents…"
                style={{ width: "100%", boxSizing: "border-box", padding: "11px 14px", fontSize: 14 }} />
            </div>

            <button onClick={handleStart} disabled={!niche.trim() || !heygenKey.trim() || (useExistingAvatar && !selectedLibraryAvatar)} style={{
              padding: "11px 28px",
              background: niche.trim() && heygenKey.trim() ? "var(--color-text-primary)" : "var(--color-background-secondary)",
              color: niche.trim() && heygenKey.trim() ? "var(--color-background-primary)" : "var(--color-text-tertiary)",
              border: "none", borderRadius: "var(--border-radius-md)", fontSize: 14, fontWeight: 500, cursor: niche.trim() && heygenKey.trim() ? "pointer" : "not-allowed"
            }}>
              Run full pipeline →
            </button>

            {avatarLibrary.length > 0 && (
              <div style={{ marginTop: 20, padding: "14px 16px", borderRadius: "var(--border-radius-md)", background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-tertiary)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: useExistingAvatar ? 12 : 0 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, fontFamily: "var(--font-sans)" }}>Avatar library ({avatarLibrary.length} saved)</div>
                    <div style={{ fontSize: 11, color: "var(--color-text-secondary)", fontFamily: "var(--font-sans)", marginTop: 2 }}>Reuse a saved avatar instead of generating a new one</div>
                  </div>
                  <button onClick={() => { setUseExistingAvatar(!useExistingAvatar); setSelectedLibraryAvatar(null); }} style={{
                    padding: "6px 14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-md)",
                    background: useExistingAvatar ? "var(--color-text-primary)" : "transparent",
                    color: useExistingAvatar ? "var(--color-background-primary)" : "var(--color-text-primary)",
                    fontSize: 12, cursor: "pointer", fontFamily: "var(--font-sans)", fontWeight: 500
                  }}>
                    {useExistingAvatar ? "Using saved" : "Use saved avatar"}
                  </button>
                </div>

                {useExistingAvatar && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 200, overflowY: "auto" }}>
                    {avatarLibrary.map((av, i) => (
                      <div key={i} onClick={() => setSelectedLibraryAvatar(av)} style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "10px 12px", borderRadius: "var(--border-radius-md)", cursor: "pointer",
                        background: selectedLibraryAvatar?.talkingPhotoId === av.talkingPhotoId ? "var(--color-background-info)" : "var(--color-background-primary)",
                        border: selectedLibraryAvatar?.talkingPhotoId === av.talkingPhotoId ? "2px solid var(--color-border-info)" : "0.5px solid var(--color-border-tertiary)",
                        transition: "all 0.15s"
                      }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500, fontFamily: "var(--font-sans)", color: selectedLibraryAvatar?.talkingPhotoId === av.talkingPhotoId ? "var(--color-text-info)" : "var(--color-text-primary)" }}>{av.name}</div>
                          <div style={{ fontSize: 11, color: "var(--color-text-secondary)", fontFamily: "var(--font-sans)", marginTop: 1 }}>{av.gender} · {av.ethnicity} · created for: {av.niche}</div>
                        </div>
                        <button onClick={(e) => {
                          e.stopPropagation();
                          const updated = avatarLibrary.filter((_, idx) => idx !== i);
                          localStorage.setItem(AVATAR_LIBRARY_KEY, JSON.stringify(updated));
                          setAvatarLibrary(updated);
                          if (selectedLibraryAvatar?.talkingPhotoId === av.talkingPhotoId) setSelectedLibraryAvatar(null);
                        }} style={{ fontSize: 11, color: "var(--color-text-danger)", background: "transparent", border: "none", cursor: "pointer", fontFamily: "var(--font-sans)", padding: "2px 6px" }}>
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {error && <div style={{ marginTop: 14, fontSize: 13, color: "var(--color-text-danger)" }}>{error}</div>}

            <div style={{ marginTop: 24, paddingTop: 20, borderTop: "0.5px solid var(--color-border-tertiary)" }}>
              <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginBottom: 10 }}>What happens — fully automatic</div>
              {[
                "Claude generates a viral content idea for your niche",
                "Claude writes a full talking-head script",
                "Claude designs a unique avatar persona (age, look, style)",
                "HeyGen generates the avatar face from scratch — unique every time",
                "HeyGen trains and animates it speaking your script",
                "Claude builds a 7-day posting schedule across 4 platforms",
                "Claude scores and optimizes — you approve or request changes",
              ].map((s, i) => (
                "You approve or request changes — one click",
              ].map((s, i) => (
                <div key={i} style={{ display: "flex", gap: 10, padding: "5px 0", fontSize: 13, color: "var(--color-text-secondary)", fontFamily: "var(--font-sans)" }}>
                  <span style={{ color: "var(--color-text-tertiary)", fontFamily: "var(--font-mono)", minWidth: 16 }}>{i + 1}</span>
                  <span>{s}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* RUNNING */}
        {phase === "running" && (
          <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 16, animation: "fadeIn 0.3s ease" }}>
            <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "1.25rem" }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.04em" }}>Pipeline</div>
              {STEPS.map(s => <StepRow key={s.id} step={s} status={stepStatuses[s.id]} />)}
            </div>
            <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "1.25rem" }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.04em" }}>Agent log</div>
              <div ref={logRef} style={{ fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 1.9, maxHeight: 340, overflowY: "auto" }}>
                {log.map((l, i) => (
                  <div key={i} style={{ display: "flex", gap: 10 }}>
                    <span style={{ color: "var(--color-text-tertiary)", flexShrink: 0 }}>{l.time}</span>
                    <span style={{ color: l.msg.startsWith("✓") ? "var(--color-text-success)" : l.msg.startsWith("✗") ? "var(--color-text-danger)" : "var(--color-text-secondary)" }}>{l.msg}</span>
                  </div>
                ))}
                {log.length === 0 && <span style={{ color: "var(--color-text-tertiary)" }}>Starting…</span>}
              </div>
            </div>
          </div>
        )}

        {/* REVIEW */}
        {(phase === "review" || phase === "approved") && (
          <div style={{ animation: "fadeIn 0.3s ease" }}>
            {phase === "review" && (
              <div style={{ padding: "14px 18px", borderRadius: "var(--border-radius-lg)", background: "var(--color-background-warning)", border: "0.5px solid var(--color-border-warning)", marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-warning)" }}>Pipeline complete — your approval needed</div>
                  <div style={{ fontSize: 12, color: "var(--color-text-warning)", marginTop: 2 }}>Review everything below, then approve or request changes.</div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={handleRevise} style={{ padding: "9px 16px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-md)", background: "var(--color-background-primary)", fontSize: 13, cursor: "pointer" }}>Request changes</button>
                  <button onClick={handleApprove} style={{ padding: "9px 18px", background: "var(--color-text-primary)", color: "var(--color-background-primary)", border: "none", borderRadius: "var(--border-radius-md)", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Approve ✓</button>
                </div>
              </div>
            )}

            {phase === "approved" && (
              <div style={{ padding: "14px 18px", borderRadius: "var(--border-radius-lg)", background: "var(--color-background-success)", border: "0.5px solid var(--color-border-success)", marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-success)" }}>Pipeline approved!</div>
                  <div style={{ fontSize: 12, color: "var(--color-text-success)", marginTop: 2 }}>Your video and schedule are ready to publish.</div>
                </div>
                <button onClick={handleReset} style={{ padding: "9px 16px", border: "0.5px solid var(--color-border-success)", borderRadius: "var(--border-radius-md)", background: "transparent", fontSize: 13, cursor: "pointer", color: "var(--color-text-success)" }}>New pipeline</button>
              </div>
            )}

            <IdeasSection ideas={results.ideas} chosen={results.chosen} />
            <ScriptSection script={results.script} />

            {/* Avatar Design Card */}
            {results.avatarDesign && (
              <div style={{ borderRadius: "var(--border-radius-lg)", border: "0.5px solid var(--color-border-tertiary)", background: "var(--color-background-primary)", overflow: "hidden", marginBottom: 16 }}>
                <div style={{ padding: "11px 18px", borderBottom: "0.5px solid var(--color-border-tertiary)", background: "var(--color-background-secondary)", display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 3, height: 14, borderRadius: 2, background: "#BA7517", flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 500, fontFamily: "var(--font-sans)" }}>Step 3 — AI-generated avatar</span>
                </div>
                <div style={{ padding: "16px 18px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 12 }}>
                    {[
                      { label: "Name", val: results.avatarDesign.name },
                      { label: "Gender", val: results.avatarDesign.gender },
                      { label: "Age", val: results.avatarDesign.age },
                      { label: "Ethnicity", val: results.avatarDesign.ethnicity },
                      { label: "Style", val: results.avatarDesign.style },
                      { label: "Pose", val: results.avatarDesign.pose },
                    ].map(f => (
                      <div key={f.label} style={{ padding: "8px 10px", borderRadius: "var(--border-radius-md)", background: "var(--color-background-secondary)" }}>
                        <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", fontFamily: "var(--font-sans)", marginBottom: 2 }}>{f.label}</div>
                        <div style={{ fontSize: 13, fontFamily: "var(--font-sans)" }}>{f.val}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ padding: "10px 12px", borderRadius: "var(--border-radius-md)", background: "var(--color-background-secondary)" }}>
                    <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", fontFamily: "var(--font-sans)", marginBottom: 3 }}>Appearance</div>
                    <div style={{ fontSize: 13, fontFamily: "var(--font-sans)", lineHeight: 1.5 }}>{results.avatarDesign.appearance}</div>
                  </div>
                </div>
              </div>
            )}

            <VideoSection
              videoStatus={videoStatus}
              videoUrl={videoUrl}
              avatarName={results.avatarDesign?.name}
              voiceName={null}
              onGenerate={() => {}}
              canGenerate={false}
            />
            <ScheduleSection schedule={results.schedule} />
            <OptSection opt={results.opt} />

            {phase === "review" && (
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
                <button onClick={handleRevise} style={{ padding: "10px 18px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-md)", background: "var(--color-background-primary)", fontSize: 13, cursor: "pointer" }}>Request changes</button>
                <button onClick={handleApprove} style={{ padding: "10px 20px", background: "var(--color-text-primary)", color: "var(--color-background-primary)", border: "none", borderRadius: "var(--border-radius-md)", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Approve pipeline ✓</button>
              </div>
            )}
          </div>
        )}

        {/* REVISE */}
        {phase === "revising" && (
          <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "1.75rem", animation: "fadeIn 0.3s ease" }}>
            <h2 style={{ fontSize: 16, fontWeight: 500, margin: "0 0 6px" }}>Request changes</h2>
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "0 0 14px" }}>Describe what to do differently. The full pipeline will re-run with your feedback.</p>
            <textarea value={feedback} onChange={e => setFeedback(e.target.value)}
              placeholder="e.g. Make it more casual and funny, target Gen Z, focus on beginners…"
              style={{ width: "100%", boxSizing: "border-box", minHeight: 100, padding: "12px 14px", fontSize: 14, fontFamily: "var(--font-sans)", borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-secondary)", background: "transparent", color: "var(--color-text-primary)", resize: "vertical", lineHeight: 1.6, marginBottom: 14 }} />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setPhase("review")} style={{ padding: "9px 16px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-md)", background: "transparent", fontSize: 13, cursor: "pointer" }}>Cancel</button>
              <button onClick={handleSubmitRevision} disabled={!feedback.trim()} style={{
                padding: "9px 18px",
                background: feedback.trim() ? "var(--color-text-primary)" : "var(--color-background-secondary)",
                color: feedback.trim() ? "var(--color-background-primary)" : "var(--color-text-tertiary)",
                border: "none", borderRadius: "var(--border-radius-md)", fontSize: 13, fontWeight: 500, cursor: feedback.trim() ? "pointer" : "not-allowed"
              }}>Re-run pipeline →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
