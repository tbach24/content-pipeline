import { useState, useRef, useEffect } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// API HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const callClaude = async (anthropicKey, system, user) => {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey,
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
  if (!data.content) throw new Error(`Claude returned no content: ${JSON.stringify(data).slice(0, 200)}`);
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

const uploadAsset = async (key, file) => {
  const form = new FormData();
  form.append("file", file);
  form.append("content_type", file.type);
  const res = await fetch("https://upload.heygen.com/v1/asset", {
    method: "POST",
    headers: { "X-Api-Key": key },
    body: form,
  });
  const data = await res.json();
  if (data.error) throw new Error(`Upload failed: ${JSON.stringify(data.error)}`);
  return data.data;
};

const parseJSON = str => { try { return JSON.parse(str); } catch { return null; } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─────────────────────────────────────────────────────────────────────────────
// AVATAR LIBRARY (localStorage)
// ─────────────────────────────────────────────────────────────────────────────

const LIB_KEY = "hg_avatar_library_v2";
const loadLib = () => { try { return JSON.parse(localStorage.getItem(LIB_KEY) || "[]"); } catch { return []; } };
const saveLib = lib => localStorage.setItem(LIB_KEY, JSON.stringify(lib));
const addToLib = (entry, setLib) => {
  const lib = loadLib();
  const updated = [{ ...entry, savedAt: new Date().toISOString() }, ...lib.filter(a => a.talkingPhotoId !== entry.talkingPhotoId)];
  saveLib(updated);
  setLib(updated);
  return updated;
};

// ─────────────────────────────────────────────────────────────────────────────
// PIPELINE STEPS CONFIG
// ─────────────────────────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, name: "Content Idea Mining",  hint: "Generating viral angles…" },
  { id: 2, name: "Script Generation",    hint: "Writing hook + 3 points + takeaway…" },
  { id: 3, name: "AI Video Generation",  hint: "Generating video with HeyGen…" },
  { id: 4, name: "Posting Schedule",     hint: "Building 7-day multi-platform plan…" },
  { id: 5, name: "Viral Optimization",   hint: "Scoring and optimizing…" },
];

// ─────────────────────────────────────────────────────────────────────────────
// SHARED UI COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

function Tag({ children, color = "gray" }) {
  const map = {
    green: ["var(--color-background-success)", "var(--color-text-success)"],
    blue:  ["var(--color-background-info)",    "var(--color-text-info)"],
    amber: ["var(--color-background-warning)", "var(--color-text-warning)"],
    red:   ["var(--color-background-danger)",  "var(--color-text-danger)"],
    gray:  ["var(--color-background-secondary)","var(--color-text-secondary)"],
  };
  const [bg, fg] = map[color] || map.gray;
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
    <Card title="Step 1 — Content ideas" accent="#1D9E75">
      <div style={{ padding: "10px 12px", borderRadius: "var(--border-radius-md)", border: "2px solid var(--color-border-info)", background: "var(--color-background-info)", marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: "var(--color-text-info)", marginBottom: 2 }}>Agent selected</div>
        <div style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-info)" }}>{chosen.title}</div>
        <div style={{ fontSize: 12, color: "var(--color-text-info)", marginTop: 2 }}>{chosen.angle} · {chosen.potential} potential</div>
      </div>
      {ideas?.filter(i => i.title !== chosen.title).slice(0, 3).map((idea, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "7px 10px", borderRadius: "var(--border-radius-md)", background: "var(--color-background-secondary)", marginBottom: 5 }}>
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
    <Card title="Step 2 — Video script" accent="#378ADD">
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
    <Card title="Step 3 — AI influencer video" accent="#BA7517">
      {!videoStatus && (
        <div style={{ textAlign: "center", padding: "1.5rem 0" }}>
          <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 14, lineHeight: 1.6 }}>
            Generate a talking-head video using your saved HeyGen avatar.
          </div>
          <button onClick={onGenerate} disabled={!canGenerate} style={{
            padding: "10px 24px",
            background: canGenerate ? "var(--color-text-primary)" : "var(--color-background-secondary)",
            color: canGenerate ? "var(--color-background-primary)" : "var(--color-text-tertiary)",
            border: "none", borderRadius: "var(--border-radius-md)", fontSize: 14, fontWeight: 500, cursor: canGenerate ? "pointer" : "not-allowed"
          }}>Generate video →</button>
        </div>
      )}
      {(videoStatus === "pending" || videoStatus === "waiting" || videoStatus === "processing") && (
        <div style={{ textAlign: "center", padding: "1.5rem 0" }}>
          <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 10 }}>
            {[0,1,2].map(i => <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--color-text-tertiary)", animation: `pulse 1s ${i*0.2}s ease-in-out infinite` }} />)}
          </div>
          <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>HeyGen is rendering your video… ({videoStatus})</div>
          {avatarName && <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginTop: 4 }}>Avatar: {avatarName}{voiceName ? ` · Voice: ${voiceName}` : ""}</div>}
          <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginTop: 4 }}>Typically 1–3 minutes. Polling every 10s…</div>
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
          Video generation failed. Check your HeyGen API key and avatar, then try again.
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
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {schedule.map(day => (
          <div key={day.day} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "9px 12px", borderRadius: "var(--border-radius-md)", background: "var(--color-background-secondary)" }}>
            <div style={{ minWidth: 36, textAlign: "center", flexShrink: 0 }}>
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
          <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 2 }}>Viral score</div>
        </div>
        <div style={{ flex: 1, height: 6, background: "var(--color-background-tertiary)", borderRadius: 3, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${(opt.viralScore || 0) * 10}%`, borderRadius: 3, background: (opt.viralScore || 0) >= 7 ? "var(--color-text-success)" : (opt.viralScore || 0) >= 5 ? "var(--color-text-warning)" : "var(--color-text-danger)" }} />
        </div>
      </div>
      <div style={{ fontSize: 13, fontStyle: "italic", color: "var(--color-text-secondary)", marginBottom: 12, lineHeight: 1.6 }}>{opt.scoreReason}</div>
      {[["Strengths", opt.strengths, "green"], ["Improvements", opt.improvements, "red"], ["A/B tests", opt.abTests, "blue"]].map(([label, items, color]) => (
        <div key={label} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
          {items?.map((item, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 4, alignItems: "flex-start" }}>
              <Tag color={color}>{i + 1}</Tag>
              <span style={{ fontSize: 12, lineHeight: 1.5 }}>{item}</span>
            </div>
          ))}
        </div>
      ))}
      {opt.boldRec && (
        <div style={{ padding: "10px 12px", borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-tertiary)" }}>
          <div style={{ fontSize: 10, fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.04em" }}>Bold recommendation</div>
          <div style={{ fontSize: 13, lineHeight: 1.6 }}>{opt.boldRec}</div>
        </div>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AVATAR SETUP SCREEN (upload new or select saved)
// ─────────────────────────────────────────────────────────────────────────────

function AvatarSetup({ heygenKey, library, setLibrary, onSelect, onClose }) {
  const [tab, setTab] = useState(library.length > 0 ? "library" : "upload");
  const [avatarName, setAvatarName] = useState("");
  const [voiceId, setVoiceId] = useState("e5a2359d1d564a3d801f6ca073d72acf");
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [training, setTraining] = useState(false);
  const [trainLog, setTrainLog] = useState([]);
  const [trainDone, setTrainDone] = useState(false);
  const [trainError, setTrainError] = useState(null);
  const fileRef = useRef(null);
  const logRef = useRef(null);

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [trainLog]);

  const addLog = msg => setTrainLog(l => [...l, msg]);

  const handleFile = (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setTrainError(null); setTrainDone(false); setTrainLog([]);
  };

  const handleTrain = async () => {
    if (!imageFile || !avatarName.trim()) return;
    setTraining(true); setTrainError(null); setTrainLog([]); setTrainDone(false);

    try {
      addLog("Uploading image to HeyGen…");
      const asset = await uploadAsset(heygenKey, imageFile);
      const imageKey = asset?.image_key || asset?.id;
      if (!imageKey) throw new Error(`No image_key returned: ${JSON.stringify(asset)}`);
      addLog(`✓ Uploaded — key: ${imageKey.slice(0, 30)}…`);

      addLog("Creating avatar group…");
      const groupResp = await heygenPost(heygenKey, "/v2/photo_avatar/avatar_group/create", {
        name: avatarName.trim(),
        image_key: imageKey,
      });
      const groupId = groupResp?.data?.id;
      if (!groupId) throw new Error(`Group creation failed: ${JSON.stringify(groupResp)}`);
      const groupImageUrl = groupResp?.data?.image_url;
      addLog(`✓ Group created — id: ${groupId}`);

      addLog("Training avatar (2–5 min)…");
      await heygenPost(heygenKey, "/v2/photo_avatar/train", { group_id: groupId });

      let talkingPhotoId = null;
      for (let i = 0; i < 60; i++) {
        await sleep(5000);
        const tr = await heygenGet(heygenKey, `/v2/photo_avatar/train/status/${groupId}`);
        const st = tr?.data?.status;
        addLog(`Training poll ${i + 1}: ${st}`);
        if (st === "success" || st === "completed") {
          const lr = await heygenGet(heygenKey, `/v2/photo_avatar/avatar_group/${groupId}`);
          talkingPhotoId = lr?.data?.avatars?.[0]?.id || lr?.data?.looks?.[0]?.id || lr?.data?.avatar_id;
          addLog(`Group data: ${JSON.stringify(lr?.data).slice(0, 200)}`);
          break;
        }
        if (st === "failed") throw new Error("Training failed.");
      }
      if (!talkingPhotoId) throw new Error("Training done but no avatar ID found — check log above.");

      const entry = { talkingPhotoId, groupId, name: avatarName.trim(), voiceId, imageUrl: groupImageUrl || imagePreview, niche: "" };
      addToLib(entry, setLibrary);
      setTrainDone(true);
      addLog(`✓ Done! Avatar ID: ${talkingPhotoId}`);

    } catch (e) {
      setTrainError(e.message);
      addLog(`✗ ${e.message}`);
    }
    setTraining(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "var(--color-background-primary)", borderRadius: "var(--border-radius-lg)", border: "0.5px solid var(--color-border-secondary)", width: "100%", maxWidth: 560, maxHeight: "88vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: "0.5px solid var(--color-border-tertiary)", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 500 }}>Avatar Setup</div>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 2 }}>Upload a photo once — reuse forever</div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", fontSize: 20, cursor: "pointer", color: "var(--color-text-secondary)", lineHeight: 1 }}>×</button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 0, borderBottom: "0.5px solid var(--color-border-tertiary)", flexShrink: 0 }}>
          {[["library", `Saved (${library.length})`], ["upload", "Upload new"]].map(([val, label]) => (
            <button key={val} onClick={() => setTab(val)} style={{
              flex: 1, padding: "11px", fontSize: 13, fontWeight: tab === val ? 500 : 400,
              border: "none", borderBottom: tab === val ? "2px solid var(--color-text-primary)" : "2px solid transparent",
              cursor: "pointer", background: "transparent",
              color: tab === val ? "var(--color-text-primary)" : "var(--color-text-secondary)",
            }}>{label}</button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>

          {/* LIBRARY TAB */}
          {tab === "library" && (
            library.length === 0 ? (
              <div style={{ textAlign: "center", padding: "2rem 0" }}>
                <div style={{ fontSize: 14, color: "var(--color-text-secondary)", marginBottom: 8 }}>No saved avatars yet</div>
                <button onClick={() => setTab("upload")} style={{ padding: "9px 20px", background: "var(--color-text-primary)", color: "var(--color-background-primary)", border: "none", borderRadius: "var(--border-radius-md)", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Upload your first avatar →</button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {library.map(av => (
                  <div key={av.talkingPhotoId} onClick={() => onSelect(av)} style={{
                    display: "flex", gap: 12, alignItems: "center", padding: "12px 14px",
                    borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-tertiary)",
                    cursor: "pointer", transition: "all 0.12s",
                    background: "var(--color-background-secondary)",
                  }}
                    onMouseEnter={e => e.currentTarget.style.border = "1.5px solid var(--color-border-info)"}
                    onMouseLeave={e => e.currentTarget.style.border = "0.5px solid var(--color-border-tertiary)"}
                  >
                    {av.imageUrl
                      ? <img src={av.imageUrl} alt={av.name} style={{ width: 52, height: 52, borderRadius: "var(--border-radius-md)", objectFit: "cover", flexShrink: 0 }} />
                      : <div style={{ width: 52, height: 52, borderRadius: "var(--border-radius-md)", background: "var(--color-background-tertiary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>◉</div>
                    }
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 3 }}>{av.name}</div>
                      <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", fontFamily: "var(--font-mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>ID: {av.talkingPhotoId}</div>
                      {av.niche && <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 2 }}>Used for: {av.niche}</div>}
                    </div>
                    <span style={{ fontSize: 12, color: "var(--color-text-info)", fontWeight: 500, flexShrink: 0 }}>Select →</span>
                  </div>
                ))}
              </div>
            )
          )}

          {/* UPLOAD TAB */}
          {tab === "upload" && (
            <div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 7 }}>Avatar name</label>
                <input value={avatarName} onChange={e => setAvatarName(e.target.value)}
                  placeholder="e.g. Maya, Alex, Coach Sarah…"
                  style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", fontSize: 13 }} />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 7 }}>Voice ID <span style={{ fontWeight: 400, color: "var(--color-text-tertiary)" }}>(HeyGen voice_id)</span></label>
                <input value={voiceId} onChange={e => setVoiceId(e.target.value)}
                  placeholder="e.g. e5a2359d1d564a3d801f6ca073d72acf"
                  style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", fontSize: 13, fontFamily: "var(--font-mono)" }} />
                <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 4 }}>
                  Find voice IDs at <a href="https://app.heygen.com/voices" target="_blank" rel="noreferrer" style={{ color: "var(--color-text-info)" }}>app.heygen.com/voices</a>
                </div>
              </div>

              {/* Drop zone */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 7 }}>Photo</label>
                <div
                  onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files?.[0]); }}
                  onDragOver={e => e.preventDefault()}
                  onClick={() => fileRef.current?.click()}
                  style={{
                    border: imageFile ? "2px solid var(--color-border-info)" : "2px dashed var(--color-border-secondary)",
                    borderRadius: "var(--border-radius-lg)", padding: "1.75rem", textAlign: "center", cursor: "pointer",
                    background: imageFile ? "var(--color-background-info)" : "var(--color-background-secondary)",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 8, transition: "all 0.15s",
                  }}>
                  {imagePreview
                    ? <><img src={imagePreview} alt="Preview" style={{ width: 80, height: 80, objectFit: "cover", borderRadius: "var(--border-radius-md)" }} /><div style={{ fontSize: 12, color: "var(--color-text-info)" }}>{imageFile.name} — click to change</div></>
                    : <><div style={{ fontSize: 28 }}>📷</div><div style={{ fontSize: 13, color: "var(--color-text-secondary)", fontWeight: 500 }}>Drop photo here or click to browse</div><div style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>JPG or PNG · Clear front-facing headshot works best</div></>
                  }
                  <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={e => handleFile(e.target.files?.[0])} style={{ display: "none" }} />
                </div>
              </div>

              <div style={{ padding: "9px 12px", borderRadius: "var(--border-radius-md)", background: "var(--color-background-secondary)", fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.7, marginBottom: 16 }}>
                <strong>Tips:</strong> Front-facing headshot · Even lighting · Simple background · No sunglasses · Single person only
              </div>

              <button onClick={handleTrain} disabled={!imageFile || !avatarName.trim() || training} style={{
                width: "100%", padding: "11px", fontSize: 14, fontWeight: 500, border: "none",
                borderRadius: "var(--border-radius-md)", cursor: imageFile && avatarName.trim() && !training ? "pointer" : "not-allowed",
                background: imageFile && avatarName.trim() && !training ? "var(--color-text-primary)" : "var(--color-background-secondary)",
                color: imageFile && avatarName.trim() && !training ? "var(--color-background-primary)" : "var(--color-text-tertiary)",
              }}>
                {training ? "Training in progress…" : "Upload & train avatar →"}
              </button>

              {trainLog.length > 0 && (
                <div ref={logRef} style={{ marginTop: 12, fontFamily: "var(--font-mono)", fontSize: 11, lineHeight: 1.9, maxHeight: 150, overflowY: "auto", padding: "10px 12px", background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)" }}>
                  {trainLog.map((l, i) => (
                    <div key={i} style={{ color: l.startsWith("✓") ? "var(--color-text-success)" : l.startsWith("✗") ? "var(--color-text-danger)" : "var(--color-text-secondary)" }}>{l}</div>
                  ))}
                </div>
              )}

              {trainDone && (
                <div style={{ marginTop: 12, padding: "11px 14px", borderRadius: "var(--border-radius-md)", background: "var(--color-background-success)", border: "0.5px solid var(--color-border-success)" }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-success)", marginBottom: 4 }}>Avatar trained and saved!</div>
                  <button onClick={() => setTab("library")} style={{ fontSize: 12, padding: "5px 12px", border: "0.5px solid var(--color-border-success)", borderRadius: "var(--border-radius-md)", background: "transparent", cursor: "pointer", color: "var(--color-text-success)" }}>View saved avatars →</button>
                </div>
              )}

              {trainError && (
                <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: "var(--border-radius-md)", background: "var(--color-background-danger)", color: "var(--color-text-danger)", fontSize: 12 }}>{trainError}</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  const [anthropicKey, setAnthropicKey]   = useState("");
  const [heygenKey,    setHeygenKey]      = useState("");
  const [niche,        setNiche]          = useState("");
  const [phase,        setPhase]          = useState("input");
  const [stepStatuses, setStepStatuses]   = useState({ 1:"idle", 2:"idle", 3:"idle", 4:"idle", 5:"idle" });
  const [results,      setResults]        = useState({});
  const [log,          setLog]            = useState([]);
  const [error,        setError]          = useState(null);
  const [feedback,     setFeedback]       = useState("");
  const [videoStatus,  setVideoStatus]    = useState(null);
  const [videoUrl,     setVideoUrl]       = useState(null);
  const [videoId,      setVideoId]        = useState(null);
  const [library,      setLibrary]        = useState(loadLib);
  const [showSetup,    setShowSetup]      = useState(false);
  const [chosenAvatar, setChosenAvatar]   = useState(null);

  const pendingNiche   = useRef("");
  const pendingResults = useRef({});
  const logRef         = useRef(null);

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [log]);

  const addLog     = msg => setLog(l => [...l, { time: new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }), msg }]);
  const setStep    = (id, s) => setStepStatuses(p => ({ ...p, [id]: s }));

  // ── VIDEO GENERATION ───────────────────────────────────────────────────────
  const generateVideo = async (avatar) => {
    if (!avatar) return;
    setChosenAvatar(avatar);
    setVideoStatus("pending");
    setStep(3, "running");
    const script  = pendingResults.current.script;
    const spoken  = script?.fullText || `${script?.hook} ${script?.point1} ${script?.point2} ${script?.point3} ${script?.takeaway}`;

    try {
      addLog(`Generating video — avatar: ${avatar.name}…`);
      const resp = await heygenPost(heygenKey, "/v2/video/generate", {
        video_inputs: [{
          character: { type: "talking_photo", talking_photo_id: avatar.talkingPhotoId },
          voice: { type: "text", input_text: spoken, voice_id: avatar.voiceId },
          background: { type: "color", value: "#f5f5f0" },
        }],
        dimension: { width: 1080, height: 1920 },
        caption: true,
      });
      const vid = resp?.data?.video_id;
      if (!vid) throw new Error(`HeyGen returned no video_id: ${JSON.stringify(resp?.error || resp)}`);
      setVideoId(vid);
      addLog(`Video submitted — id: ${vid} — polling…`);

      for (let i = 0; i < 40; i++) {
        await sleep(10000);
        const sr = await heygenGet(heygenKey, `/v1/video_status.get?video_id=${vid}`);
        const st = sr?.data?.status;
        setVideoStatus(st);
        addLog(`Video poll ${i + 1}: ${st}`);
        if (st === "completed") { setVideoUrl(sr?.data?.video_url); setStep(3, "done"); addLog("✓ Video ready!"); break; }
        if (st === "failed") throw new Error("HeyGen video rendering failed.");
      }
    } catch (e) {
      setVideoStatus("failed");
      addLog(`✗ ${e.message}`);
    }
  };

  // ── PIPELINE ───────────────────────────────────────────────────────────────
  const runPipeline = async (nicheTopic, fbText = "") => {
    setError(null); setResults({}); setVideoStatus(null); setVideoUrl(null); setVideoId(null);
    setLog([]); setStepStatuses({ 1:"idle", 2:"idle", 3:"idle", 4:"idle", 5:"idle" });
    setPhase("running");

    try {
      // Step 1
      setStep(1, "running");
      addLog(`Mining ideas for "${nicheTopic}"…`);
      const ideasRaw = await callClaude(anthropicKey,
        "Return ONLY raw JSON. No markdown. No explanation.",
        `1 viral content idea for niche: "${nicheTopic}"${fbText ? `. Feedback: ${fbText}` : ""}.
JSON: {"ideas":[{"title":"...","angle":"...","potential":"High","reason":"..."}],"chosen":{"title":"...","angle":"...","potential":"High","reason":"..."}}`
      );
      const ideasData = parseJSON(ideasRaw);
      if (!ideasData) throw new Error(`Step 1: bad JSON — got: ${ideasRaw.slice(0, 200)}`);
      pendingResults.current = { ideas: ideasData.ideas, chosen: ideasData.chosen };
      setResults({ ideas: ideasData.ideas, chosen: ideasData.chosen });
      setStep(1, "done");
      addLog(`✓ Idea: "${ideasData.chosen.title}"`);

      // Step 2
      setStep(2, "running");
      addLog("Writing script…");
      const scriptRaw = await callClaude(anthropicKey,
        "Return ONLY raw JSON. No markdown. No explanation.",
        `60s talking-head script for: "${ideasData.chosen.title}".
JSON: {"hook":"...","point1":"...","point2":"...","point3":"...","takeaway":"...","fullText":"full monologue under 800 chars"}`
      );
      const script = parseJSON(scriptRaw);
      if (!script) throw new Error(`Step 2: bad JSON — got: ${scriptRaw.slice(0, 200)}`);
      pendingResults.current = { ...pendingResults.current, script };
      setResults(r => ({ ...r, script }));
      setStep(2, "done");
      addLog("✓ Script ready");

      // Step 3: pause for avatar pick — video generates when user picks
      setStep(3, "running");
      addLog("Script done — pick your avatar to generate the video…");
      setResults(r => ({ ...r, _awaitingAvatar: true }));
      setPhase("review");
      return; // video + steps 4+5 continue after avatar pick

    } catch (e) {
      setError(e.message);
      addLog(`✗ ${e.message}`);
      setPhase("input");
    }
  };

  const continueAfterVideo = async () => {
    const chosen = pendingResults.current.chosen;
    const script = pendingResults.current.script;

    try {
      // Step 4
      setStep(4, "running");
      addLog("Building posting schedule…");
      const schedRaw = await callClaude(anthropicKey,
        "Return ONLY a valid JSON array. No markdown.",
        `7-day posting schedule for: "${chosen?.title}". Platforms: TikTok, Instagram Reels, YouTube Shorts, LinkedIn.
Return: [{"day":1,"time":"HH:MM","platform":"...","caption":"under 150 chars","hashtags":["#..."],"hook":"engagement CTA"}]`
      );
      const schedule = parseJSON(schedRaw);
      if (!schedule) throw new Error(`Step 4: bad JSON — got: ${schedRaw.slice(0, 200)}`);
      pendingResults.current = { ...pendingResults.current, schedule };
      setResults(r => ({ ...r, schedule }));
      setStep(4, "done");
      addLog(`✓ ${schedule.length}-day schedule built`);

      // Step 5
      setStep(5, "running");
      addLog("Running viral optimization…");
      const optRaw = await callClaude(anthropicKey,
        "Return ONLY valid JSON. No markdown.",
        `Analyze pipeline: niche="${pendingNiche.current}", idea="${chosen?.title}", hook="${script?.hook}".
Return: {"viralScore":<1-10>,"scoreReason":"...","strengths":["...","...","..."],"improvements":["...","...","..."],"abTests":["...","..."],"boldRec":"..."}`
      );
      const opt = parseJSON(optRaw);
      if (!opt) throw new Error(`Step 5: bad JSON — got: ${optRaw.slice(0, 200)}`);
      setResults(r => ({ ...r, opt }));
      setStep(5, "done");
      addLog(`✓ Viral score: ${opt.viralScore}/10 — complete!`);

    } catch (e) {
      setError(e.message);
      addLog(`✗ ${e.message}`);
    }
  };

  // When video completes, auto-run steps 4+5
  useEffect(() => {
    if (videoStatus === "completed" && !pendingResults.current.schedule) {
      continueAfterVideo();
    }
  }, [videoStatus]);

  const handleStart = () => {
    if (!niche.trim() || !anthropicKey.trim() || !heygenKey.trim()) return;
    pendingNiche.current = niche.trim();
    runPipeline(niche.trim());
  };

  const handleAvatarSelect = (avatar) => {
    setShowSetup(false);
    // Update the avatar's niche tag
    const updated = library.map(a => a.talkingPhotoId === avatar.talkingPhotoId ? { ...a, niche: niche.trim() } : a);
    saveLib(updated);
    setLibrary(updated);
    generateVideo(avatar);
  };

  const handleReset = () => {
    setPhase("input"); setNiche(""); setResults({}); setLog([]);
    setError(null); setFeedback(""); setVideoStatus(null); setVideoUrl(null); setVideoId(null);
    setStepStatuses({ 1:"idle", 2:"idle", 3:"idle", 4:"idle", 5:"idle" });
    setChosenAvatar(null); pendingResults.current = {};
  };

  const canStart = anthropicKey.trim() && heygenKey.trim() && niche.trim();

  return (
    <div style={{ fontFamily: "var(--font-sans)", minHeight: "100vh", background: "var(--color-background-tertiary)", color: "var(--color-text-primary)" }}>
      <style>{`
        @keyframes spin  { to { transform: rotate(360deg); } }
        @keyframes fadeIn{ from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        @keyframes pulse { 0%,100%{opacity:.2} 50%{opacity:1} }
      `}</style>

      {showSetup && (
        <AvatarSetup
          heygenKey={heygenKey}
          library={library}
          setLibrary={setLibrary}
          onSelect={handleAvatarSelect}
          onClose={() => setShowSetup(false)}
        />
      )}

      <div style={{ maxWidth: 780, margin: "0 auto", padding: "2.5rem 1rem" }}>
        <div style={{ marginBottom: "2rem" }}>
          <h1 style={{ fontSize: 24, fontWeight: 500, margin: "0 0 4px", letterSpacing: "-0.3px" }}>Influencer Content Pipeline</h1>
          <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: 0 }}>AI mines idea → writes script → your avatar speaks it → schedule → approve</p>
        </div>

        {/* INPUT */}
        {phase === "input" && (
          <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "2rem", animation: "fadeIn 0.3s ease" }}>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 7 }}>Anthropic API key</label>
              <input type="password" value={anthropicKey} onChange={e => setAnthropicKey(e.target.value)}
                placeholder="sk-ant-..."
                style={{ width: "100%", boxSizing: "border-box", padding: "11px 14px", fontSize: 13 }} />
              <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 5 }}>
                <a href="https://console.anthropic.com" target="_blank" rel="noreferrer" style={{ color: "var(--color-text-info)" }}>console.anthropic.com</a> → API Keys
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 7 }}>HeyGen API key</label>
              <input type="password" value={heygenKey} onChange={e => setHeygenKey(e.target.value)}
                placeholder="Paste your HeyGen API key"
                style={{ width: "100%", boxSizing: "border-box", padding: "11px 14px", fontSize: 13 }} />
              <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 5 }}>
                <a href="https://app.heygen.com/settings?nav=API" target="_blank" rel="noreferrer" style={{ color: "var(--color-text-info)" }}>app.heygen.com/settings</a> → API · Credits from $5
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 7 }}>Content niche</label>
              <input value={niche} onChange={e => setNiche(e.target.value)}
                onKeyDown={e => e.key === "Enter" && canStart && handleStart()}
                placeholder="e.g. AI productivity, personal finance, fitness for busy parents…"
                style={{ width: "100%", boxSizing: "border-box", padding: "11px 14px", fontSize: 14 }} />
            </div>

            {/* Avatar library preview */}
            {heygenKey.trim() && (
              <div style={{ marginBottom: 20, padding: "12px 16px", borderRadius: "var(--border-radius-md)", background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-tertiary)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>
                    Avatar library
                    <span style={{ fontWeight: 400, color: "var(--color-text-tertiary)", marginLeft: 6 }}>({library.length} saved)</span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 2 }}>
                    {library.length === 0 ? "Upload a photo to train your first avatar" : `You'll pick one when the pipeline reaches Step 3`}
                  </div>
                </div>
                <button onClick={() => setShowSetup(true)} disabled={!heygenKey.trim()} style={{
                  padding: "7px 14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-md)",
                  background: "var(--color-background-primary)", fontSize: 12, cursor: heygenKey.trim() ? "pointer" : "not-allowed", fontWeight: 500
                }}>{library.length === 0 ? "Set up avatar →" : "Manage avatars"}</button>
              </div>
            )}

            <button onClick={handleStart} disabled={!canStart} style={{
              padding: "11px 28px",
              background: canStart ? "var(--color-text-primary)" : "var(--color-background-secondary)",
              color: canStart ? "var(--color-background-primary)" : "var(--color-text-tertiary)",
              border: "none", borderRadius: "var(--border-radius-md)", fontSize: 14, fontWeight: 500, cursor: canStart ? "pointer" : "not-allowed"
            }}>Run full pipeline →</button>

            {error && <div style={{ marginTop: 14, fontSize: 13, color: "var(--color-text-danger)" }}>{error}</div>}

            <div style={{ marginTop: 24, paddingTop: 20, borderTop: "0.5px solid var(--color-border-tertiary)" }}>
              <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginBottom: 10 }}>What happens</div>
              {[
                "Claude generates a viral content idea for your niche",
                "Claude writes a full talking-head script",
                "You pick a saved avatar (or upload a new one) — HeyGen renders the video",
                "Claude builds a 7-day posting schedule across 4 platforms",
                "Claude scores and optimizes — you approve or request changes",
              ].map((s, i) => (
                <div key={i} style={{ display: "flex", gap: 10, padding: "5px 0", fontSize: 13, color: "var(--color-text-secondary)" }}>
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

        {/* REVIEW / APPROVED */}
        {(phase === "review" || phase === "approved") && (
          <div style={{ animation: "fadeIn 0.3s ease" }}>
            {phase === "review" && (
              <div style={{ padding: "14px 18px", borderRadius: "var(--border-radius-lg)", background: "var(--color-background-warning)", border: "0.5px solid var(--color-border-warning)", marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-warning)" }}>
                    {results._awaitingAvatar && !videoStatus ? "Script ready — pick your avatar to generate the video" : "Pipeline complete — your approval needed"}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--color-text-warning)", marginTop: 2 }}>
                    {results._awaitingAvatar && !videoStatus ? "Choose a saved avatar or upload a new one below." : "Review everything below, then approve or request changes."}
                  </div>
                </div>
                {(!results._awaitingAvatar || videoStatus) && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => setPhase("revising")} style={{ padding: "9px 16px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-md)", background: "var(--color-background-primary)", fontSize: 13, cursor: "pointer" }}>Request changes</button>
                    <button onClick={() => setPhase("approved")} style={{ padding: "9px 18px", background: "var(--color-text-primary)", color: "var(--color-background-primary)", border: "none", borderRadius: "var(--border-radius-md)", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Approve ✓</button>
                  </div>
                )}
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

            {error && <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: "var(--border-radius-md)", background: "var(--color-background-danger)", color: "var(--color-text-danger)", fontSize: 13 }}>{error}</div>}

            <IdeasSection ideas={results.ideas} chosen={results.chosen} />
            <ScriptSection script={results.script} />

            {/* Agent log in review (collapsed) */}
            {log.length > 0 && (
              <details style={{ marginBottom: 16 }}>
                <summary style={{ fontSize: 12, color: "var(--color-text-tertiary)", cursor: "pointer", padding: "4px 0" }}>Agent log ({log.length} entries)</summary>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, lineHeight: 1.8, maxHeight: 160, overflowY: "auto", padding: "8px 12px", background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", marginTop: 6 }}>
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
              onGenerate={() => setShowSetup(true)}
              canGenerate={true}
            />

            <ScheduleSection schedule={results.schedule} />
            <OptSection opt={results.opt} />

            {phase === "review" && (!results._awaitingAvatar || videoStatus) && (
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
                <button onClick={() => setPhase("revising")} style={{ padding: "10px 18px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-md)", background: "var(--color-background-primary)", fontSize: 13, cursor: "pointer" }}>Request changes</button>
                <button onClick={() => setPhase("approved")} style={{ padding: "10px 20px", background: "var(--color-text-primary)", color: "var(--color-background-primary)", border: "none", borderRadius: "var(--border-radius-md)", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Approve pipeline ✓</button>
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
              placeholder="e.g. More casual and funny, target Gen Z, focus on beginners…"
              style={{ width: "100%", boxSizing: "border-box", minHeight: 100, padding: "12px 14px", fontSize: 14, fontFamily: "var(--font-sans)", borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-secondary)", background: "transparent", color: "var(--color-text-primary)", resize: "vertical", lineHeight: 1.6, marginBottom: 14 }} />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setPhase("review")} style={{ padding: "9px 16px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-md)", background: "transparent", fontSize: 13, cursor: "pointer" }}>Cancel</button>
              <button onClick={() => { runPipeline(pendingNiche.current, feedback.trim()); setFeedback(""); }} disabled={!feedback.trim()} style={{
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
