import { useState, useRef, useEffect } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// API HELPERS
// ─────────────────────────────────────────────────────────────────────────────

// ── Paste your Anthropic key here ────────────────────────────────────────────
const ANTHROPIC_KEY = "YOUR_ANTHROPIC_KEY_HERE";

const callClaude = async (_key, system, user) => {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`Claude error: ${data.error.message}`);
  return data.content.map(b => b.text || "").join("").replace(/```json|```/g, "").trim();
};

const heygenGet = async (key, path) => {
  const res = await fetch(`https://api.heygen.com${path}`, {
    headers: { "X-Api-Key": key, "Accept": "application/json" },
  });
  return res.json();
};

const heygenPost = async (key, path, body) => {
  const res = await fetch(`https://api.heygen.com${path}`, {
    method: "POST",
    headers: { "X-Api-Key": key, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
};

// Fetch HeyGen voices for the voice picker
const fetchHeygenVoices = async (key) => {
  const res = await heygenGet(key, "/v2/voices");
  return res?.data?.voices || [];
};

// Fetch all photo avatars from HeyGen account
const fetchHeygenAvatars = async (key) => {
  // Get all avatar groups (your photo avatars)
  const groupsRes = await heygenGet(key, "/v2/photo_avatar/avatar_group/list");
  const groups = groupsRes?.data?.avatar_groups || groupsRes?.data?.groups || [];

  const avatars = [];
  for (const group of groups) {
    const groupId = group.id || group.group_id;
    const groupName = group.name || "Unnamed";
    const imageUrl = group.image_url || group.preview_image_url || "";
    // Get avatars (looks) inside this group
    try {
      const lookRes = await heygenGet(key, `/v2/photo_avatar/avatar_group/${groupId}`);
      const looks = lookRes?.data?.avatars || lookRes?.data?.looks || [];
      for (const look of looks) {
        const talkingPhotoId = look.id || look.avatar_id;
        if (talkingPhotoId) {
          avatars.push({
            avatarId: talkingPhotoId,
            name: look.name || groupName,
            imageUrl: look.image_url || look.preview_image_url || imageUrl,
            groupId,
            groupName,
          });
        }
      }
      // If no looks, add the group itself as an avatar
      if (looks.length === 0 && groupId) {
        avatars.push({ avatarId: groupId, name: groupName, imageUrl, groupId, groupName });
      }
    } catch (e) {
      // fallback: add group as avatar
      avatars.push({ avatarId: groupId, name: groupName, imageUrl, groupId, groupName });
    }
  }
  return avatars;
};

const parseJSON = str => { try { return JSON.parse(str); } catch { return null; } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─────────────────────────────────────────────────────────────────────────────
// AVATAR LIBRARY  (localStorage)
// ─────────────────────────────────────────────────────────────────────────────

const LIB_KEY = "heygen_avatar_lib_v3";
const loadLib = () => { try { return JSON.parse(localStorage.getItem(LIB_KEY) || "[]"); } catch { return []; } };
const saveLib = lib => localStorage.setItem(LIB_KEY, JSON.stringify(lib));

// ─────────────────────────────────────────────────────────────────────────────
// PIPELINE STEPS
// ─────────────────────────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, name: "Content Idea",      hint: "Claude generating viral idea…" },
  { id: 2, name: "Script",            hint: "Claude writing script…" },
  { id: 3, name: "Video Generation",  hint: "HeyGen rendering talking-head video…" },
  { id: 4, name: "Posting Schedule",  hint: "Claude building 7-day plan…" },
  { id: 5, name: "Optimization",      hint: "Claude scoring pipeline…" },
];

// ─────────────────────────────────────────────────────────────────────────────
// SHARED UI COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

function Tag({ children, color = "gray" }) {
  const m = {
    green: ["var(--color-background-success)", "var(--color-text-success)"],
    blue:  ["var(--color-background-info)",    "var(--color-text-info)"],
    amber: ["var(--color-background-warning)", "var(--color-text-warning)"],
    red:   ["var(--color-background-danger)",  "var(--color-text-danger)"],
    gray:  ["var(--color-background-secondary)","var(--color-text-secondary)"],
  };
  const [bg, fg] = m[color] || m.gray;
  return <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 20, background: bg, color: fg, fontWeight: 500, whiteSpace: "nowrap" }}>{children}</span>;
}

function Card({ title, accent, children }) {
  return (
    <div style={{ borderRadius: "var(--border-radius-lg)", border: "0.5px solid var(--color-border-tertiary)", background: "var(--color-background-primary)", overflow: "hidden", marginBottom: 16 }}>
      <div style={{ padding: "11px 18px", borderBottom: "0.5px solid var(--color-border-tertiary)", background: "var(--color-background-secondary)", display: "flex", alignItems: "center", gap: 8 }}>
        {accent && <div style={{ width: 3, height: 14, borderRadius: 2, background: accent, flexShrink: 0 }} />}
        <span style={{ fontSize: 13, fontWeight: 500 }}>{title}</span>
      </div>
      <div style={{ padding: "16px 18px" }}>{children}</div>
    </div>
  );
}

function StepRow({ step, status }) {
  const done = status === "done", running = status === "running";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
      <div style={{
        width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 11, fontFamily: "var(--font-mono)",
        background: done ? "var(--color-background-success)" : running ? "var(--color-text-primary)" : "var(--color-background-secondary)",
        color: done ? "var(--color-text-success)" : running ? "var(--color-background-primary)" : "var(--color-text-tertiary)",
        transition: "all 0.3s",
      }}>
        {done ? "✓" : running ? <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>◌</span> : step.id}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: running ? 500 : 400, color: running || done ? "var(--color-text-primary)" : "var(--color-text-secondary)" }}>{step.name}</div>
        {running && <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 1 }}>{step.hint}</div>}
      </div>
      {done && <Tag color="green">done</Tag>}
      {running && <Tag color="gray">running…</Tag>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RESULT SECTIONS
// ─────────────────────────────────────────────────────────────────────────────

function IdeasSection({ ideas, chosen }) {
  if (!chosen) return null;
  return (
    <Card title="Step 1 — Content idea" accent="#1D9E75">
      <div style={{ padding: "10px 12px", borderRadius: "var(--border-radius-md)", border: "2px solid var(--color-border-info)", background: "var(--color-background-info)", marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: "var(--color-text-info)", marginBottom: 2 }}>Selected</div>
        <div style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-info)" }}>{chosen.title}</div>
        <div style={{ fontSize: 12, color: "var(--color-text-info)", marginTop: 2 }}>{chosen.angle}</div>
      </div>
      {ideas?.filter(i => i.title !== chosen.title).slice(0, 3).map((idea, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", borderRadius: "var(--border-radius-md)", background: "var(--color-background-secondary)", marginBottom: 4 }}>
          <span style={{ fontSize: 12 }}>{idea.title}</span>
          <Tag color={idea.potential === "High" ? "green" : "amber"}>{idea.potential}</Tag>
        </div>
      ))}
    </Card>
  );
}

function ScriptSection({ script }) {
  if (!script) return null;
  return (
    <Card title="Step 2 — Script" accent="#378ADD">
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {[["hook","Hook","#E1306C"],["point1","Point 1","#378ADD"],["point2","Point 2","#378ADD"],["point3","Point 3","#378ADD"],["takeaway","Takeaway","#1D9E75"]].map(([k, label, color]) => (
          <div key={k} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <div style={{ fontSize: 10, padding: "3px 7px", borderRadius: 3, background: `${color}18`, color, fontFamily: "var(--font-mono)", flexShrink: 0, marginTop: 2, fontWeight: 500 }}>{label}</div>
            <div style={{ fontSize: 13, lineHeight: 1.6 }}>{script[k]}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function VideoSection({ videoStatus, videoUrl, avatarName, voiceName, onGenerate, canGenerate }) {
  return (
    <Card title="Step 3 — Talking head video" accent="#BA7517">
      {!videoStatus && (
        <div style={{ textAlign: "center", padding: "1.5rem 0" }}>
          <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 14, lineHeight: 1.6 }}>
            {canGenerate ? "Script is ready. Pick an avatar and generate your video." : "Set up an avatar first, then run the pipeline."}
          </div>
          <button onClick={onGenerate} disabled={!canGenerate} style={{
            padding: "10px 24px",
            background: canGenerate ? "var(--color-text-primary)" : "var(--color-background-secondary)",
            color: canGenerate ? "var(--color-background-primary)" : "var(--color-text-tertiary)",
            border: "none", borderRadius: "var(--border-radius-md)", fontSize: 14, fontWeight: 500, cursor: canGenerate ? "pointer" : "not-allowed",
          }}>Pick avatar & generate →</button>
        </div>
      )}
      {(videoStatus === "pending" || videoStatus === "waiting" || videoStatus === "processing") && (
        <div style={{ textAlign: "center", padding: "1.5rem 0" }}>
          <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 10 }}>
            {[0,1,2].map(i => <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--color-text-tertiary)", animation: `pulse 1s ${i*0.2}s ease-in-out infinite` }} />)}
          </div>
          <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>HeyGen is rendering your video… ({videoStatus})</div>
          {avatarName && <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginTop: 4 }}>Avatar: {avatarName}{voiceName ? ` · Voice: ${voiceName}` : ""}</div>}
          <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginTop: 4 }}>Typically 1–3 minutes…</div>
        </div>
      )}
      {videoStatus === "completed" && videoUrl && (
        <div>
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            {avatarName && <Tag color="blue">Avatar: {avatarName}</Tag>}
            {voiceName && <Tag color="blue">Voice: {voiceName}</Tag>}
            <Tag color="green">Completed</Tag>
          </div>
          <video controls style={{ width: "100%", borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-tertiary)", background: "#000", display: "block" }}>
            <source src={videoUrl} />
          </video>
          <a href={videoUrl} download target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 10, fontSize: 13, color: "var(--color-text-info)", textDecoration: "none" }}>Download video ↓</a>
        </div>
      )}
      {videoStatus === "failed" && (
        <div style={{ padding: "12px 14px", borderRadius: "var(--border-radius-md)", background: "var(--color-background-danger)", color: "var(--color-text-danger)", fontSize: 13 }}>
          Video generation failed.
          <button onClick={onGenerate} style={{ marginLeft: 12, padding: "4px 12px", border: "0.5px solid var(--color-text-danger)", borderRadius: "var(--border-radius-md)", background: "transparent", color: "var(--color-text-danger)", fontSize: 12, cursor: "pointer" }}>Retry</button>
        </div>
      )}
    </Card>
  );
}

function ScheduleSection({ schedule }) {
  if (!schedule) return null;
  const colors = { TikTok: "#E1306C", "Instagram Reels": "#833AB4", "YouTube Shorts": "#FF0000", LinkedIn: "#0077B5" };
  return (
    <Card title="Step 4 — 7-day posting schedule" accent="#7F77DD">
      {schedule.map(day => (
        <div key={day.day} style={{ display: "flex", gap: 12, padding: "8px 10px", borderRadius: "var(--border-radius-md)", background: "var(--color-background-secondary)", marginBottom: 5 }}>
          <div style={{ minWidth: 32, textAlign: "center", flexShrink: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 500, fontFamily: "var(--font-mono)" }}>{day.day}</div>
            <div style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>{day.time}</div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 20, fontWeight: 500, background: `${colors[day.platform] || "#888"}22`, color: colors[day.platform] || "var(--color-text-secondary)" }}>{day.platform}</span>
            <div style={{ fontSize: 12, lineHeight: 1.5, marginTop: 3, marginBottom: 2 }}>{day.caption}</div>
            <div style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>{day.hashtags?.join(" ")}</div>
          </div>
        </div>
      ))}
    </Card>
  );
}

function OptSection({ opt }) {
  if (!opt) return null;
  return (
    <Card title="Step 5 — Optimization" accent="#D4537E">
      <div style={{ display: "flex", gap: 16, alignItems: "center", padding: "10px 12px", borderRadius: "var(--border-radius-md)", background: "var(--color-background-secondary)", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 32, fontWeight: 500, fontFamily: "var(--font-mono)", lineHeight: 1 }}>{opt.viralScore}<span style={{ fontSize: 14, color: "var(--color-text-tertiary)" }}>/10</span></div>
          <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 2 }}>Viral score</div>
        </div>
        <div style={{ flex: 1, height: 6, background: "var(--color-background-tertiary)", borderRadius: 3, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${(opt.viralScore || 0) * 10}%`, borderRadius: 3, background: (opt.viralScore || 0) >= 7 ? "var(--color-text-success)" : (opt.viralScore || 0) >= 5 ? "var(--color-text-warning)" : "var(--color-text-danger)" }} />
        </div>
      </div>
      <div style={{ fontSize: 13, fontStyle: "italic", color: "var(--color-text-secondary)", marginBottom: 12, lineHeight: 1.6 }}>{opt.scoreReason}</div>
      {[["Strengths", opt.strengths, "green"], ["Improvements", opt.improvements, "red"], ["A/B tests", opt.abTests, "blue"]].map(([label, items, color]) => (
        <div key={label} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
          {items?.map((item, i) => <div key={i} style={{ display: "flex", gap: 8, marginBottom: 4 }}><Tag color={color}>{i + 1}</Tag><span style={{ fontSize: 12, lineHeight: 1.5 }}>{item}</span></div>)}
        </div>
      ))}
      {opt.boldRec && (
        <div style={{ padding: "9px 10px", borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-tertiary)" }}>
          <div style={{ fontSize: 10, fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.04em" }}>Bold rec</div>
          <div style={{ fontSize: 12, lineHeight: 1.5 }}>{opt.boldRec}</div>
        </div>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AVATAR PICKER MODAL
// Lets user pick from saved library OR add a new avatar ID manually
// ─────────────────────────────────────────────────────────────────────────────

function AvatarPicker({ heygenKey, onSelect, onClose }) {
  const [avatars, setAvatars] = useState([]);
  const [voices, setVoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [selectedAvatar, setSelectedAvatar] = useState(null);
  const [selectedVoice, setSelectedVoice] = useState(null);
  const [voiceSearch, setVoiceSearch] = useState("");
  const [voiceGender, setVoiceGender] = useState("all");

  useEffect(() => {
    const load = async () => {
      setLoading(true); setLoadError(null);
      try {
        const [avs, vcs] = await Promise.all([
          fetchHeygenAvatars(heygenKey),
          fetchHeygenVoices(heygenKey),
        ]);
        setAvatars(avs);
        setVoices(vcs);
        if (avs.length > 0) setSelectedAvatar(avs[0]);
        const defaultVoice = vcs.find(v => (v.display_name || v.name || "").toLowerCase().includes("jenny")) || vcs[0];
        if (defaultVoice) setSelectedVoice(defaultVoice);
      } catch (e) {
        setLoadError(e.message);
      }
      setLoading(false);
    };
    load();
  }, [heygenKey]);

  const filteredVoices = voices.filter(v => {
    const name = (v.display_name || v.name || "").toLowerCase();
    const matchSearch = name.includes(voiceSearch.toLowerCase());
    const matchGender = voiceGender === "all" || (v.gender || "").toLowerCase() === voiceGender;
    return matchSearch && matchGender;
  }).slice(0, 60);

  const handleConfirm = () => {
    if (!selectedAvatar || !selectedVoice) return;
    onSelect({ ...selectedAvatar, voiceId: selectedVoice.voice_id, voiceName: selectedVoice.display_name || selectedVoice.name });
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "var(--color-background-primary)", borderRadius: "var(--border-radius-lg)", border: "0.5px solid var(--color-border-secondary)", width: "100%", maxWidth: 600, maxHeight: "88vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>

        <div style={{ padding: "16px 20px", borderBottom: "0.5px solid var(--color-border-tertiary)", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 500 }}>Choose Avatar & Voice</div>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 2 }}>Your HeyGen photo avatars — loaded from your account</div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", fontSize: 20, cursor: "pointer", color: "var(--color-text-secondary)" }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          {loading && (
            <div style={{ textAlign: "center", padding: "2rem", color: "var(--color-text-secondary)", fontSize: 13 }}>
              <span style={{ animation: "spin 1s linear infinite", display: "inline-block", marginRight: 8 }}>◌</span>
              Loading your HeyGen avatars…
            </div>
          )}

          {loadError && (
            <div style={{ padding: "12px", borderRadius: "var(--border-radius-md)", background: "var(--color-background-danger)", color: "var(--color-text-danger)", fontSize: 13, marginBottom: 14 }}>
              Failed to load avatars: {loadError}
            </div>
          )}

          {!loading && !loadError && avatars.length === 0 && (
            <div style={{ textAlign: "center", padding: "2rem 0" }}>
              <div style={{ fontSize: 14, color: "var(--color-text-secondary)", marginBottom: 8 }}>No photo avatars found</div>
              <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", lineHeight: 1.6 }}>
                Create a photo avatar at <a href="https://app.heygen.com/avatars" target="_blank" rel="noreferrer" style={{ color: "var(--color-text-info)" }}>app.heygen.com/avatars</a>, then come back here.
              </div>
            </div>
          )}

          {!loading && avatars.length > 0 && (
            <>
              {/* Avatars */}
              <div style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Your avatars ({avatars.length})
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 10, marginBottom: 20 }}>
                {avatars.map(av => {
                  const sel = selectedAvatar?.avatarId === av.avatarId;
                  return (
                    <div key={av.avatarId} onClick={() => setSelectedAvatar(av)} style={{
                      border: sel ? "2px solid var(--color-border-info)" : "0.5px solid var(--color-border-tertiary)",
                      borderRadius: "var(--border-radius-md)", overflow: "hidden", cursor: "pointer",
                      background: sel ? "var(--color-background-info)" : "var(--color-background-secondary)",
                      transition: "all 0.12s",
                    }}>
                      {av.imageUrl
                        ? <img src={av.imageUrl} alt={av.name} style={{ width: "100%", aspectRatio: "1", objectFit: "cover", display: "block" }} />
                        : <div style={{ width: "100%", aspectRatio: "1", background: "var(--color-background-tertiary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>◉</div>
                      }
                      <div style={{ padding: "6px 8px", fontSize: 11, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: sel ? "var(--color-text-info)" : "var(--color-text-primary)", fontWeight: sel ? 500 : 400 }}>{av.name}</div>
                    </div>
                  );
                })}
              </div>

              {/* Voices */}
              <div style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.04em" }}>Voice</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <input value={voiceSearch} onChange={e => setVoiceSearch(e.target.value)} placeholder="Search voices…"
                  style={{ flex: 1, padding: "7px 10px", fontSize: 12 }} />
                <select value={voiceGender} onChange={e => setVoiceGender(e.target.value)}
                  style={{ padding: "7px 10px", fontSize: 12, borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }}>
                  <option value="all">All genders</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </div>
              <div style={{ maxHeight: 190, overflowY: "auto", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-md)" }}>
                {filteredVoices.map(v => {
                  const sel = selectedVoice?.voice_id === v.voice_id;
                  return (
                    <div key={v.voice_id} onClick={() => setSelectedVoice(v)} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "9px 12px", cursor: "pointer", borderBottom: "0.5px solid var(--color-border-tertiary)",
                      background: sel ? "var(--color-background-info)" : "transparent", transition: "background 0.1s",
                    }}>
                      <span style={{ fontSize: 13, fontWeight: sel ? 500 : 400, color: sel ? "var(--color-text-info)" : "var(--color-text-primary)" }}>{v.display_name || v.name}</span>
                      <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>{[v.gender, v.language].filter(Boolean).join(" · ")}</span>
                    </div>
                  );
                })}
              </div>
              {selectedVoice && <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 6 }}>Selected: <strong>{selectedVoice.display_name || selectedVoice.name}</strong></div>}
            </>
          )}
        </div>

        <div style={{ padding: "14px 20px", borderTop: "0.5px solid var(--color-border-tertiary)", display: "flex", justifyContent: "flex-end", gap: 8, flexShrink: 0 }}>
          <button onClick={onClose} style={{ padding: "9px 18px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-md)", background: "transparent", fontSize: 13, cursor: "pointer" }}>Cancel</button>
          <button onClick={handleConfirm} disabled={!selectedAvatar || !selectedVoice} style={{
            padding: "9px 20px", fontSize: 13, fontWeight: 500, border: "none", borderRadius: "var(--border-radius-md)",
            cursor: selectedAvatar && selectedVoice ? "pointer" : "not-allowed",
            background: selectedAvatar && selectedVoice ? "var(--color-text-primary)" : "var(--color-background-secondary)",
            color: selectedAvatar && selectedVoice ? "var(--color-background-primary)" : "var(--color-text-tertiary)",
          }}>Generate video →</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  const [heygenKey, setHeygenKey] = useState("");
  const [niche,        setNiche]        = useState("");
  const [phase,        setPhase]        = useState("input");
  const [stepStatuses, setStepStatuses] = useState({ 1:"idle", 2:"idle", 3:"idle", 4:"idle", 5:"idle" });
  const [results,      setResults]      = useState({});
  const [log,          setLog]          = useState([]);
  const [error,        setError]        = useState(null);
  const [feedback,     setFeedback]     = useState("");
  const [videoStatus,  setVideoStatus]  = useState(null);
  const [videoUrl,     setVideoUrl]     = useState(null);
  const [showPicker,   setShowPicker]   = useState(false);
  const [chosenAvatar, setChosenAvatar] = useState(null);

  const pendingNiche   = useRef("");
  const pendingResults = useRef({});
  const logRef         = useRef(null);

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [log]);

  const addLog  = msg => setLog(l => [...l, { time: new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }), msg }]);
  const setStep = (id, s) => setStepStatuses(p => ({ ...p, [id]: s }));

  // ── GENERATE VIDEO ─────────────────────────────────────────────────────────
  const generateVideo = async (avatar) => {
    setChosenAvatar(avatar);
    setVideoStatus("pending");
    setStep(3, "running");
    const script = pendingResults.current.script;
    const spoken = script?.fullText || [script?.hook, script?.point1, script?.point2, script?.point3, script?.takeaway].filter(Boolean).join(" ");
    setShowPicker(false);

    try {
      addLog(`Generating video — avatar: ${avatar.name}…`);
      const resp = await heygenPost(heygenKey, "/v2/video/generate", {
        video_inputs: [{
          character: { type: "talking_photo", talking_photo_id: avatar.avatarId },
          voice: { type: "text", input_text: spoken, voice_id: avatar.voiceId },
          background: { type: "color", value: "#f5f5f0" },
        }],
        dimension: { width: 1080, height: 1920 },
        caption: true,
      });

      const vid = resp?.data?.video_id;
      if (!vid) throw new Error(`HeyGen returned no video_id: ${JSON.stringify(resp?.error || resp).slice(0, 200)}`);
      addLog(`Video submitted — id: ${vid} — polling…`);

      for (let i = 0; i < 40; i++) {
        await sleep(10000);
        const sr = await heygenGet(heygenKey, `/v1/video_status.get?video_id=${vid}`);
        const st = sr?.data?.status;
        setVideoStatus(st);
        addLog(`Poll ${i + 1}: ${st}`);
        if (st === "completed") {
          setVideoUrl(sr?.data?.video_url);
          setStep(3, "done");
          addLog("✓ Video ready!");
          break;
        }
        if (st === "failed") throw new Error("HeyGen video rendering failed.");
      }

    } catch (e) {
      setVideoStatus("failed");
      addLog(`✗ ${e.message}`);
    }
  };

  // After video completes, run steps 4 + 5 automatically
  useEffect(() => {
    if (videoStatus === "completed" && !pendingResults.current.schedule) {
      runScheduleAndOpt();
    }
  }, [videoStatus]);

  const runScheduleAndOpt = async () => {
    const chosen = pendingResults.current.chosen;
    const script = pendingResults.current.script;

    try {
      // Step 4
      setStep(4, "running");
      addLog("Building posting schedule…");
      const schedRaw = await callClaude(anthropicKey,
        "Return ONLY a valid JSON array. No markdown.",
        `7-day posting schedule for: "${chosen?.title}". Platforms: TikTok, Instagram Reels, YouTube Shorts, LinkedIn.
JSON: [{"day":1,"time":"HH:MM","platform":"...","caption":"under 150 chars","hashtags":["#..."],"hook":"CTA"}]`
      );
      const schedule = parseJSON(schedRaw);
      if (!schedule?.length) throw new Error(`Step 4 bad JSON: ${schedRaw.slice(0, 150)}`);
      pendingResults.current = { ...pendingResults.current, schedule };
      setResults(r => ({ ...r, schedule }));
      setStep(4, "done");
      addLog(`✓ ${schedule.length}-day schedule built`);

      // Step 5
      setStep(5, "running");
      addLog("Running optimization…");
      const optRaw = await callClaude(anthropicKey,
        "Return ONLY valid JSON. No markdown.",
        `Analyze: niche="${pendingNiche.current}", idea="${chosen?.title}", hook="${script?.hook}".
JSON: {"viralScore":8,"scoreReason":"...","strengths":["...","...","..."],"improvements":["...","...","..."],"abTests":["...","..."],"boldRec":"..."}`
      );
      const opt = parseJSON(optRaw);
      if (!opt?.viralScore) throw new Error(`Step 5 bad JSON: ${optRaw.slice(0, 150)}`);
      setResults(r => ({ ...r, opt }));
      setStep(5, "done");
      addLog(`✓ Viral score: ${opt.viralScore}/10 — done!`);
      setPhase("review");

    } catch (e) {
      addLog(`✗ ${e.message}`);
      setPhase("review");
    }
  };

  // ── PIPELINE ───────────────────────────────────────────────────────────────
  const runPipeline = async (nicheTopic, fbText = "") => {
    setError(null); setResults({}); setVideoStatus(null); setVideoUrl(null);
    setLog([]); setStepStatuses({ 1:"idle", 2:"idle", 3:"idle", 4:"idle", 5:"idle" });
    setPhase("running");

    try {
      // Step 1
      setStep(1, "running");
      addLog(`Mining idea for "${nicheTopic}"…`);
      const ideasRaw = await callClaude(anthropicKey,
        "Return ONLY raw JSON. No markdown.",
        `1 viral content idea for niche: "${nicheTopic}"${fbText ? `. Feedback: ${fbText}` : ""}.
JSON: {"ideas":[{"title":"...","angle":"...","potential":"High","reason":"..."}],"chosen":{"title":"...","angle":"...","potential":"High","reason":"..."}}`
      );
      const ideasData = parseJSON(ideasRaw);
      if (!ideasData?.chosen) throw new Error(`Step 1 bad JSON: ${ideasRaw.slice(0, 150)}`);
      pendingResults.current = { ideas: ideasData.ideas, chosen: ideasData.chosen };
      setResults({ ideas: ideasData.ideas, chosen: ideasData.chosen });
      setStep(1, "done");
      addLog(`✓ Idea: "${ideasData.chosen.title}"`);

      // Step 2
      setStep(2, "running");
      addLog("Writing script…");
      const scriptRaw = await callClaude(anthropicKey,
        "Return ONLY raw JSON. No markdown.",
        `60s influencer talking-head script for: "${ideasData.chosen.title}". Tone: energetic, direct.
JSON: {"hook":"...","point1":"...","point2":"...","point3":"...","takeaway":"...","fullText":"full monologue under 800 chars"}`
      );
      const script = parseJSON(scriptRaw);
      if (!script?.hook) throw new Error(`Step 2 bad JSON: ${scriptRaw.slice(0, 150)}`);
      pendingResults.current = { ...pendingResults.current, script };
      setResults(r => ({ ...r, script }));
      setStep(2, "done");
      addLog("✓ Script ready");

      // Step 3: pause — show review, user picks avatar
      setStep(3, "running");
      addLog("Script ready — pick an avatar to generate the video…");
      setPhase("review");

    } catch (e) {
      setError(e.message);
      addLog(`✗ ${e.message}`);
      setPhase("input");
    }
  };

  const handleReset = () => {
    setPhase("input"); setNiche(""); setResults({}); setLog([]);
    setError(null); setFeedback(""); setVideoStatus(null); setVideoUrl(null);
    setStepStatuses({ 1:"idle", 2:"idle", 3:"idle", 4:"idle", 5:"idle" });
    setChosenAvatar(null); pendingResults.current = {};
  };

  const canStart = heygenKey.trim() && niche.trim();
  const awaitingAvatar = phase === "review" && !videoStatus;

  return (
    <div style={{ fontFamily: "var(--font-sans)", minHeight: "100vh", background: "var(--color-background-tertiary)", color: "var(--color-text-primary)" }}>
      <style>{`
        @keyframes spin  { to { transform: rotate(360deg); } }
        @keyframes fadeIn{ from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        @keyframes pulse { 0%,100%{opacity:.2} 50%{opacity:1} }
      `}</style>

      {showPicker && (
        <AvatarPicker
          heygenKey={heygenKey}
          onSelect={generateVideo}
          onClose={() => setShowPicker(false)}
        />
      )}

      <div style={{ maxWidth: 780, margin: "0 auto", padding: "2.5rem 1rem" }}>

        <div style={{ marginBottom: "2rem" }}>
          <h1 style={{ fontSize: 24, fontWeight: 500, margin: "0 0 4px", letterSpacing: "-0.3px" }}>Influencer Content Pipeline</h1>
          <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: 0 }}>Idea → Script → HeyGen avatar video → Schedule → Approve</p>
        </div>

        {/* ── INPUT ──────────────────────────────────────────────────────────── */}
        {phase === "input" && (
          <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "2rem", animation: "fadeIn 0.3s ease" }}>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 6 }}>HeyGen API key</label>
              <input type="password" value={heygenKey} onChange={e => setHeygenKey(e.target.value)} placeholder="Paste HeyGen key"
                style={{ width: "100%", boxSizing: "border-box", padding: "11px 14px", fontSize: 13 }} />
              <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 5 }}>
                <a href="https://app.heygen.com/settings?nav=API" target="_blank" rel="noreferrer" style={{ color: "var(--color-text-info)" }}>app.heygen.com/settings</a> — API credits from $5
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 6 }}>Content niche</label>
              <input value={niche} onChange={e => setNiche(e.target.value)}
                onKeyDown={e => e.key === "Enter" && canStart && (pendingNiche.current = niche.trim(), runPipeline(niche.trim()))}
                placeholder="e.g. AI tools, personal finance, fitness for busy parents…"
                style={{ width: "100%", boxSizing: "border-box", padding: "11px 14px", fontSize: 14 }} />
            </div>



            <button onClick={() => { pendingNiche.current = niche.trim(); runPipeline(niche.trim()); }}
              disabled={!canStart} style={{
                padding: "11px 28px", fontSize: 14, fontWeight: 500, border: "none",
                borderRadius: "var(--border-radius-md)", cursor: canStart ? "pointer" : "not-allowed",
                background: canStart ? "var(--color-text-primary)" : "var(--color-background-secondary)",
                color: canStart ? "var(--color-background-primary)" : "var(--color-text-tertiary)",
              }}>Run full pipeline →</button>

            {error && <div style={{ marginTop: 14, padding: "10px 12px", borderRadius: "var(--border-radius-md)", background: "var(--color-background-danger)", color: "var(--color-text-danger)", fontSize: 13 }}>{error}</div>}

            <div style={{ marginTop: 24, paddingTop: 20, borderTop: "0.5px solid var(--color-border-tertiary)" }}>
              <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginBottom: 8 }}>What happens</div>
              {[
                "Claude generates a viral idea for your niche",
                "Claude writes a full talking-head script",
                "You pick a HeyGen avatar — it renders the video automatically",
                "Claude builds a 7-day posting schedule",
                "Claude scores and optimizes — you approve or request changes",
              ].map((s, i) => (
                <div key={i} style={{ display: "flex", gap: 10, padding: "4px 0", fontSize: 13, color: "var(--color-text-secondary)" }}>
                  <span style={{ color: "var(--color-text-tertiary)", fontFamily: "var(--font-mono)", minWidth: 16 }}>{i + 1}</span>
                  <span>{s}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── RUNNING ────────────────────────────────────────────────────────── */}
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
                {!log.length && <span style={{ color: "var(--color-text-tertiary)" }}>Starting…</span>}
              </div>
            </div>
          </div>
        )}

        {/* ── REVIEW / APPROVED ──────────────────────────────────────────────── */}
        {(phase === "review" || phase === "approved") && (
          <div style={{ animation: "fadeIn 0.3s ease" }}>

            {/* Banner */}
            {phase === "review" && awaitingAvatar && (
              <div style={{ padding: "14px 18px", borderRadius: "var(--border-radius-lg)", background: "var(--color-background-info)", border: "0.5px solid var(--color-border-info)", marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-info)" }}>Script ready — pick your avatar</div>
                  <div style={{ fontSize: 12, color: "var(--color-text-info)", marginTop: 2 }}>Choose a saved HeyGen avatar to generate the talking-head video.</div>
                </div>
                <button onClick={() => setShowPicker(true)} style={{ padding: "9px 18px", background: "var(--color-text-info)", color: "#fff", border: "none", borderRadius: "var(--border-radius-md)", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Pick avatar →</button>
              </div>
            )}

            {phase === "review" && !awaitingAvatar && (
              <div style={{ padding: "14px 18px", borderRadius: "var(--border-radius-lg)", background: "var(--color-background-warning)", border: "0.5px solid var(--color-border-warning)", marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-warning)" }}>Pipeline complete — review and approve</div>
                  <div style={{ fontSize: 12, color: "var(--color-text-warning)", marginTop: 2 }}>Review everything below, then approve or request changes.</div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setPhase("revising")} style={{ padding: "9px 16px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-md)", background: "var(--color-background-primary)", fontSize: 13, cursor: "pointer" }}>Request changes</button>
                  <button onClick={() => setPhase("approved")} style={{ padding: "9px 18px", background: "var(--color-text-primary)", color: "var(--color-background-primary)", border: "none", borderRadius: "var(--border-radius-md)", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Approve ✓</button>
                </div>
              </div>
            )}

            {phase === "approved" && (
              <div style={{ padding: "14px 18px", borderRadius: "var(--border-radius-lg)", background: "var(--color-background-success)", border: "0.5px solid var(--color-border-success)", marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-success)" }}>Approved! Content is ready to publish.</div>
                </div>
                <button onClick={handleReset} style={{ padding: "9px 16px", border: "0.5px solid var(--color-border-success)", borderRadius: "var(--border-radius-md)", background: "transparent", fontSize: 13, cursor: "pointer", color: "var(--color-text-success)" }}>New pipeline</button>
              </div>
            )}

            {error && <div style={{ marginBottom: 14, padding: "10px 12px", borderRadius: "var(--border-radius-md)", background: "var(--color-background-danger)", color: "var(--color-text-danger)", fontSize: 13 }}>{error}</div>}

            <IdeasSection ideas={results.ideas} chosen={results.chosen} />
            <ScriptSection script={results.script} />

            {/* Pipeline steps sidebar in review */}
            {log.length > 0 && (
              <details style={{ marginBottom: 16 }}>
                <summary style={{ fontSize: 12, color: "var(--color-text-tertiary)", cursor: "pointer", padding: "4px 0", userSelect: "none" }}>Agent log ({log.length} entries)</summary>
                <div ref={logRef} style={{ fontFamily: "var(--font-mono)", fontSize: 11, lineHeight: 1.8, maxHeight: 140, overflowY: "auto", padding: "8px 12px", background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", marginTop: 6 }}>
                  {log.map((l, i) => (
                    <div key={i} style={{ display: "flex", gap: 10 }}>
                      <span style={{ color: "var(--color-text-tertiary)", flexShrink: 0 }}>{l.time}</span>
                      <span style={{ color: l.msg.startsWith("✓") ? "var(--color-text-success)" : l.msg.startsWith("✗") ? "var(--color-text-danger)" : "var(--color-text-secondary)" }}>{l.msg}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}

            <VideoSection
              videoStatus={videoStatus}
              videoUrl={videoUrl}
              avatarName={chosenAvatar?.name}
              voiceName={null}
              onGenerate={() => setShowPicker(true)}
              canGenerate={true}
            />

            <ScheduleSection schedule={results.schedule} />
            <OptSection opt={results.opt} />

            {phase === "review" && !awaitingAvatar && (
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
                <button onClick={() => setPhase("revising")} style={{ padding: "10px 18px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-md)", background: "var(--color-background-primary)", fontSize: 13, cursor: "pointer" }}>Request changes</button>
                <button onClick={() => setPhase("approved")} style={{ padding: "10px 20px", background: "var(--color-text-primary)", color: "var(--color-background-primary)", border: "none", borderRadius: "var(--border-radius-md)", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Approve pipeline ✓</button>
              </div>
            )}
          </div>
        )}

        {/* ── REVISE ─────────────────────────────────────────────────────────── */}
        {phase === "revising" && (
          <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "1.75rem", animation: "fadeIn 0.3s ease" }}>
            <h2 style={{ fontSize: 16, fontWeight: 500, margin: "0 0 6px" }}>Request changes</h2>
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "0 0 14px" }}>Describe what to change — the pipeline re-runs with your feedback.</p>
            <textarea value={feedback} onChange={e => setFeedback(e.target.value)}
              placeholder="e.g. More casual tone, target Gen Z, focus on beginners…"
              style={{ width: "100%", boxSizing: "border-box", minHeight: 100, padding: "12px 14px", fontSize: 14, fontFamily: "var(--font-sans)", borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-secondary)", background: "transparent", color: "var(--color-text-primary)", resize: "vertical", lineHeight: 1.6, marginBottom: 14 }} />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setPhase("review")} style={{ padding: "9px 16px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-md)", background: "transparent", fontSize: 13, cursor: "pointer" }}>Cancel</button>
              <button onClick={() => { runPipeline(pendingNiche.current, feedback.trim()); setFeedback(""); }}
                disabled={!feedback.trim()} style={{
                  padding: "9px 18px", fontSize: 13, fontWeight: 500, border: "none",
                  borderRadius: "var(--border-radius-md)", cursor: feedback.trim() ? "pointer" : "not-allowed",
                  background: feedback.trim() ? "var(--color-text-primary)" : "var(--color-background-secondary)",
                  color: feedback.trim() ? "var(--color-background-primary)" : "var(--color-text-tertiary)",
                }}>Re-run pipeline →</button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
