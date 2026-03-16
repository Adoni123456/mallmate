import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getAuth } from "firebase/auth";
import "./Navigation.css";
import config from "../config";

const API            = config.API_URL;
const SVG_SCALE      = 0.06;
const AVG_STEP_M     = 0.75;
const ACCEL_THRESH   = 1.5;
const CALIBRATION_STEPS = 10;

const FALLBACK_NODES = {
  "NODE_TECH":   [77.8,  412.9], "NODE_FASHION":[440.9, 78.5],
  "NODE_SUPER":  [762.2, 228.9], "NODE_FOOD":   [339.3, 599.0],
  "NODE_SHOE":   [723.8, 599.0], "NODE_LIFT":   [590.3, 440.7],
  "NODE_GENTS":  [48.2,  63.6],  "NODE_LADIES": [786.8, 482.1],
  "NODE_X1":     [164.0, 165.4], "NODE_X2":     [676.0, 165.4],
  "NODE_X3":     [164.0, 512.2], "NODE_X4":     [676.0, 512.2],
  "NODE_N1":     [267.9, 165.4], "NODE_N2":     [440.9, 165.4],
  "NODE_N3":     [613.8, 165.4], "NODE_BACK":   [164.0, 78.5],
  "NODE_W1":     [164.0, 357.8], "NODE_W2":     [164.0, 550.0],
  "NODE_E1":     [676.0, 228.9], "NODE_E2":     [676.0, 376.0],
  "NODE_S1":     [247.5, 512.2], "NODE_S2":     [376.0, 512.2],
  "NODE_S3":     [564.6, 512.2], "NODE_S4":     [723.8, 512.2],
};

const PLACE_TO_NODE = {
  NODE_FOOD:   "NODE_FOOD",    NODE_SUPER:   "NODE_SUPER",
  NODE_SHOE:   "NODE_SHOE",    NODE_FASHION: "NODE_FASHION",
  NODE_TECH:   "NODE_TECH",    NODE_GENTS:   "NODE_GENTS",
  NODE_LADIES: "NODE_LADIES",  NODE_LIFT:    "NODE_LIFT",
};

const MANUAL_NODES = [
  { id: "NODE_S3",     label: "Front Entrance" },
  { id: "NODE_BACK",   label: "Back Entrance"  },
  { id: "NODE_TECH",   label: "Tech Zone"      },
  { id: "NODE_FASHION",label: "Fashion Hub"    },
  { id: "NODE_FOOD",   label: "Food Court"     },
  { id: "NODE_SHOE",   label: "Shoe World"     },
  { id: "NODE_SUPER",  label: "Super Mart"     },
  { id: "NODE_LIFT",   label: "Lift"           },
];

const NODE_LABELS = {
  NODE_TECH: "Tech Zone",    NODE_FASHION: "Fashion Hub",
  NODE_SUPER: "Super Mart",  NODE_FOOD: "Food Court",
  NODE_SHOE: "Shoe World",   NODE_LIFT: "Lift",
  NODE_GENTS: "Gents Toilet",NODE_LADIES: "Ladies Toilet",
  NODE_S3: "Front Entrance", NODE_BACK: "Back Entrance",
};

// ── Helpers ──
function svgDist(nodes, a, b) {
  const [x1, y1] = nodes[a] || [0, 0];
  const [x2, y2] = nodes[b] || [0, 0];
  return Math.hypot(x2 - x1, y2 - y1);
}
function stepsFor(nodes, a, b, stepLen) {
  return (svgDist(nodes, a, b) * SVG_SCALE) / stepLen;
}
function interpolate(nodes, path, progress) {
  if (!path || path.length < 2) return null;
  const seg  = Math.min(Math.floor(progress), path.length - 2);
  const frac = Math.min(progress - seg, 1);
  const [x1, y1] = nodes[path[seg]]     || [0, 0];
  const [x2, y2] = nodes[path[seg + 1]] || [0, 0];
  return [x1 + (x2 - x1) * frac, y1 + (y2 - y1) * frac, Math.atan2(y2 - y1, x2 - x1)];
}
function buildPathD(nodes, path, progress) {
  if (!path || path.length < 2) return { full: "", done: "" };
  let full = "", done = "";
  const seg  = Math.floor(progress);
  const frac = progress - seg;
  for (let i = 0; i < path.length - 1; i++) {
    const [x1, y1] = nodes[path[i]]     || [0, 0];
    const [x2, y2] = nodes[path[i + 1]] || [0, 0];
    if (i === 0) { full += "M " + x1 + " " + y1; done += "M " + x1 + " " + y1; }
    else          { full += " L " + x1 + " " + y1; }
    full += " L " + x2 + " " + y2;
    if (i < seg) {
      done += " L " + x2 + " " + y2;
    } else if (i === seg) {
      const ix = x1 + (x2 - x1) * Math.min(frac, 1);
      const iy = y1 + (y2 - y1) * Math.min(frac, 1);
      done += " L " + ix + " " + iy;
    }
  }
  return { full, done };
}

async function getAuthHeaders() {
  const token = await getAuth().currentUser?.getIdToken().catch(() => null);
  return token ? { Authorization: "Bearer " + token } : {};
}

// ══════════════════════════════════════════
export default function Navigation() {
  const routerLoc = useLocation();
  const navigate  = useNavigate();

  const [nodeMap,       setNodeMap]       = useState(FALLBACK_NODES);
  const [mapSvg,        setMapSvg]        = useState(null);
  const [fromNode,      setFromNode]      = useState(null);
  const [toNode,        setToNode]        = useState(null);
  const [navData,       setNavData]       = useState(null);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState(null);
  const [progress,      setProgress]      = useState(0);
  const [currentSeg,    setCurrentSeg]    = useState(0);
  const [tracking,      setTracking]      = useState(false);
  const [arrived,       setArrived]       = useState(false);
  const [calibrating,   setCalibrating]   = useState(false);
  const [calibSteps,    setCalibSteps]    = useState(0);
  const [stepLen,       setStepLen]       = useState(() => {
    const s = localStorage.getItem("mm_step_len");
    return s ? parseFloat(s) : AVG_STEP_M;
  });
  const [scanMode,      setScanMode]      = useState("idle");
  const [junctionNudge, setJunctionNudge] = useState(false);

  const qrStreamRef    = useRef(null);
  const stepsInSegRef  = useRef(0);
  const lastAccelRef   = useRef({ x: 0, y: 0, z: 0 });
  const stepBufRef     = useRef([]);
  const calibAccRef    = useRef(0);
  const videoRef       = useRef(null);
  const scannerRef     = useRef(null);
  const navDataRef     = useRef(null);
  const nodeMapRef     = useRef(FALLBACK_NODES);
  const stepLenRef     = useRef(AVG_STEP_M);
  const calibratingRef = useRef(false);

  useEffect(() => { navDataRef.current     = navData;    }, [navData]);
  useEffect(() => { nodeMapRef.current     = nodeMap;    }, [nodeMap]);
  useEffect(() => { stepLenRef.current     = stepLen;    }, [stepLen]);
  useEffect(() => { calibratingRef.current = calibrating;}, [calibrating]);

  // Load nodes + SVG
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const h = await getAuthHeaders();
      fetch(API + "/nodes", { headers: h })
        .then(r => r.json())
        .then(d => {
          if (cancelled || !d.nodes) return;
          const m = {};
          Object.entries(d.nodes).forEach(function(entry) { m[entry[0]] = [entry[1].x, entry[1].y]; });
          setNodeMap(m);
        }).catch(function() {});
      fetch(API + "/map?v=" + Date.now(), { headers: h })
        .then(r => r.text())
        .then(s => { if (!cancelled) setMapSvg(s); })
        .catch(function() {});
    })();
    return function() { cancelled = true; };
  }, []);

  // QR helpers — defined before useEffect that calls openQR
  const closeQR = useCallback(function() {
    if (qrStreamRef.current) {
      qrStreamRef.current.getTracks().forEach(function(t) { t.stop(); });
      qrStreamRef.current = null;
    }
    if (scannerRef.current) cancelAnimationFrame(scannerRef.current);
    setScanMode("idle");
    setJunctionNudge(false);
  }, []);

  const handleQRResult = useCallback(function(raw) {
    closeQR();
    let nodeId = raw.trim();
    if (raw.startsWith("MALLMATE:")) nodeId = raw.split(":")[1];
    const m = raw.match(/node=([A-Z_0-9]+)/);
    if (m) nodeId = m[1];
    if (!navDataRef.current) {
      setFromNode(nodeId);
    } else {
      const idx = navDataRef.current.path.indexOf(nodeId);
      if (idx === -1) { setError("QR not on route — re-routing..."); setFromNode(nodeId); return; }
      stepsInSegRef.current = 0;
      setCurrentSeg(idx);
      setProgress(idx);
      setError(null);
    }
  }, [closeQR]);

  const startBarcode = useCallback(function() {
    if (!("BarcodeDetector" in window)) return;
    const det = new BarcodeDetector({ formats: ["qr_code"] });
    const scan = async function() {
      if (!videoRef.current) return;
      try {
        const codes = await det.detect(videoRef.current);
        if (codes.length > 0) { handleQRResult(codes[0].rawValue); return; }
      } catch(e) {}
      scannerRef.current = requestAnimationFrame(scan);
    };
    scannerRef.current = requestAnimationFrame(scan);
  }, [handleQRResult]);

  const openQR = useCallback(async function() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      qrStreamRef.current = stream;
      setScanMode("scanning");
      setTimeout(function() {
        if (videoRef.current && qrStreamRef.current) {
          videoRef.current.srcObject = qrStreamRef.current;
          videoRef.current.play().catch(function() {});
          startBarcode();
        }
      }, 400);
    } catch(e) {
      setScanMode("manual");
    }
  }, [startBarcode]);

  // Get destination from chat
  useEffect(function() {
    const state = routerLoc.state;
    if (state && state.nodeId) {
      setToNode(PLACE_TO_NODE[state.nodeId] || state.nodeId);
      const t = setTimeout(function() { openQR(); }, 400);
      return function() { clearTimeout(t); };
    }
  }, [routerLoc.state, openQR]);

  // Fetch path
  useEffect(function() {
    if (!fromNode || !toNode || fromNode === toNode) return;
    let cancelled = false;
    (async function() {
      setLoading(true); setError(null); setNavData(null);
      setProgress(0); setCurrentSeg(0); setArrived(false);
      stepsInSegRef.current = 0;
      try {
        const h   = await getAuthHeaders();
        const res = await fetch(API + "/navigate?from_node=" + fromNode + "&to_node=" + toNode, { headers: h });
        const d   = await res.json();
        if (cancelled) return;
        if (d.error) { setError(d.error); return; }
        setNavData(d);
      } catch(e) {
        if (!cancelled) setError("Could not connect. Check your connection.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return function() { cancelled = true; };
  }, [fromNode, toNode]);

  // Motion handler (refs only — stable, no stale closures)
  const onMotion = useCallback(function(e) {
    const acc = e.accelerationIncludingGravity;
    if (!acc) return;
    const x = acc.x || 0, y = acc.y || 0, z = acc.z || 0;
    const prev  = lastAccelRef.current;
    const delta = Math.abs(x - prev.x) + Math.abs(y - prev.y) + Math.abs(z - prev.z);
    lastAccelRef.current = { x, y, z };
    stepBufRef.current.push(delta);
    if (stepBufRef.current.length > 4) stepBufRef.current.shift();
    const avg = stepBufRef.current.reduce(function(a, b) { return a + b; }, 0) / stepBufRef.current.length;
    if (avg <= ACCEL_THRESH) return;

    if (calibratingRef.current) {
      calibAccRef.current++;
      setCalibSteps(function(c) { return c + 1; });
      return;
    }

    const data = navDataRef.current;
    if (!data) return;
    stepsInSegRef.current++;

    setCurrentSeg(function(seg) {
      const path = data.path;
      if (seg >= path.length - 1) { setArrived(true); return seg; }
      const needed  = stepsFor(nodeMapRef.current, path[seg], path[seg + 1], stepLenRef.current);
      const segProg = stepsInSegRef.current / needed;
      setProgress(seg + Math.min(segProg, 1));
      const nextNode = path[seg + 1];
      if (segProg > 0.85 && data.junction_nodes && data.junction_nodes.includes(nextNode)) {
        setJunctionNudge(true);
        try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch(e) {}
      }
      if (segProg >= 1) {
        stepsInSegRef.current = 0;
        setJunctionNudge(false);
        if (seg + 1 >= path.length - 1) {
          setArrived(true);
          window.removeEventListener("devicemotion", onMotion);
          setTracking(false);
        }
        return seg + 1;
      }
      return seg;
    });
  }, []);

  const attachMotion = useCallback(function(forCalib) {
    if (typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function") {
      DeviceMotionEvent.requestPermission()
        .then(function(p) { if (p === "granted") window.addEventListener("devicemotion", onMotion); })
        .catch(function() {});
    } else {
      window.addEventListener("devicemotion", onMotion);
    }
    if (!forCalib) setTracking(true);
  }, [onMotion]);

  const detachMotion = useCallback(function() {
    window.removeEventListener("devicemotion", onMotion);
    setTracking(false);
  }, [onMotion]);

  useEffect(function() {
    return function() {
      detachMotion();
      if (qrStreamRef.current) {
        qrStreamRef.current.getTracks().forEach(function(t) { t.stop(); });
        qrStreamRef.current = null;
      }
    };
  }, [detachMotion]);

  const startCalibration = useCallback(function() {
    calibAccRef.current = 0;
    setCalibSteps(0);
    setCalibrating(true);
    attachMotion(true);
  }, [attachMotion]);

  const finishCalibration = useCallback(function() {
    const newLen = calibAccRef.current > 0
      ? Math.min(Math.max((CALIBRATION_STEPS * AVG_STEP_M) / calibAccRef.current, 0.4), 1.2)
      : AVG_STEP_M;
    setStepLen(newLen);
    localStorage.setItem("mm_step_len", String(newLen));
    setCalibrating(false);
    detachMotion();
  }, [detachMotion]);

  const path      = navData ? navData.path : [];
  const paths     = buildPathD(nodeMap, path, progress);
  const animPos   = interpolate(nodeMap, path, progress);
  const curDir    = navData && navData.directions ? navData.directions[currentSeg] : null;
  const destLabel = (routerLoc.state && routerLoc.state.label) || NODE_LABELS[toNode] || toNode || "Destination";
  const isFirst   = !localStorage.getItem("mm_step_len");

  return (
    <div className="nav-wrapper">

      <div className="nav-header">
        <button className="nav-back-btn" onClick={function() { detachMotion(); navigate(-1); }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <span className="nav-header-title">Navigation</span>
        <div style={{ width: 40 }}/>
      </div>

      {calibrating && (
        <div className="calib-overlay">
          <div className="calib-card">
            <div className="calib-icon">🚶</div>
            <h3>Calibrating step length</h3>
            <p>Walk {CALIBRATION_STEPS} steps normally, then tap Done</p>
            <div className="calib-counter">{calibSteps} / {CALIBRATION_STEPS}</div>
            <div className="calib-progress">
              <div className="calib-fill" style={{ width: ((calibSteps / CALIBRATION_STEPS) * 100) + "%" }}/>
            </div>
            <button className="calib-done-btn" onClick={finishCalibration}>Done</button>
          </div>
        </div>
      )}

      {(scanMode === "scanning" || scanMode === "manual") && (
        <div className="qr-overlay">
          <div className="qr-sheet">
            <div className="qr-sheet-header">
              <span>{junctionNudge ? "Scan Junction QR" : "Scan QR to Set Location"}</span>
              <button onClick={closeQR}>✕</button>
            </div>
            {scanMode === "scanning" && (
              <>
                <video ref={videoRef} autoPlay playsInline muted className="qr-video"/>
                <div className="qr-viewfinder">
                  <div className="qr-corner tl"/><div className="qr-corner tr"/>
                  <div className="qr-corner bl"/><div className="qr-corner br"/>
                </div>
                <p className="qr-hint">Point at QR code near shop entrance or junction</p>
                <button className="qr-manual-btn" onClick={function() { setScanMode("manual"); }}>
                  Can't scan? Select manually
                </button>
              </>
            )}
            {scanMode === "manual" && (
              <div className="manual-grid">
                <p className="manual-hint">Select your current location:</p>
                {MANUAL_NODES.map(function(n) {
                  return (
                    <button key={n.id} className="manual-node-btn"
                      onClick={function() { handleQRResult(n.id); }}>
                      {n.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {arrived && (
        <div className="arrival-overlay">
          <div className="arrival-content">
            <div className="arrival-check">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <h2 className="arrival-title">You've Arrived!</h2>
            <p className="arrival-dest">{destLabel}</p>
            <div className="arrival-actions">
              <button className="arrival-btn primary" onClick={function() {
                setArrived(false); setFromNode(null); setToNode(null);
                setNavData(null); setProgress(0); setCurrentSeg(0);
                navigate("/");
              }}>Back to Chat</button>
              <button className="arrival-btn secondary" onClick={function() {
                setArrived(false); setFromNode(null); setToNode(null);
                setNavData(null); setProgress(0); setCurrentSeg(0);
              }}>Navigate Again</button>
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="nav-loading">
          <div className="nav-spinner"/>
          <span>Calculating route...</span>
        </div>
      )}

      {error && <div className="nav-error-bar">⚠ {error}</div>}

      {!fromNode && !loading && !arrived && (
        <div className="nav-initial">
          <div className="nav-initial-icon">📍</div>
          <h3>Navigating to</h3>
          <p className="nav-initial-dest">{destLabel}</p>
          <button className="scan-start-btn" onClick={openQR}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
              <rect x="3" y="14" width="7" height="7"/>
              <line x1="14" y1="14" x2="17" y2="14"/><line x1="21" y1="14" x2="21" y2="17"/>
              <line x1="14" y1="17" x2="14" y2="21"/><line x1="17" y1="21" x2="21" y2="21"/>
            </svg>
            Scan QR at Your Location
          </button>
          {isFirst && (
            <button className="calib-link" onClick={startCalibration}>
              ⚙ Calibrate step length for better accuracy
            </button>
          )}
        </div>
      )}

      {navData && !loading && !arrived && fromNode && (
        <>
          {junctionNudge && (
            <div className="junction-nudge" onClick={function() { setJunctionNudge(false); openQR(); }}>
              <span>📡 Junction ahead — tap to scan QR and confirm position</span>
            </div>
          )}

          {curDir && (
            <div className="instruction-card">
              <div className="instruction-icon">{curDir.icon}</div>
              <div className="instruction-text">{curDir.instruction}</div>
              {!tracking
                ? <button className="start-walk-btn" onClick={function() { attachMotion(); }}>Start Walking</button>
                : <button className="pause-walk-btn" onClick={detachMotion}>Pause</button>
              }
            </div>
          )}

          <div className="nav-map-container">
            {mapSvg && (
              <div className="map-base"
                dangerouslySetInnerHTML={{ __html: mapSvg
                  .replace(/width="[^"]*"/, 'width="100%"')
                  .replace(/height="[^"]*"/, 'height="auto"')
                }}
              />
            )}
            <svg viewBox="0 0 840 678" className="map-overlay" xmlns="http://www.w3.org/2000/svg">

              {!mapSvg && <rect width="840" height="678" fill="#0d1117"/>}

              {paths.full && (
                <path d={paths.full} stroke="#2a3a4a" strokeWidth="6"
                  fill="none" strokeLinecap="round" strokeLinejoin="round"/>
              )}
              {paths.done && (
                <path d={paths.done} stroke="#1d4ed8" strokeWidth="6"
                  fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.6"/>
              )}
              {paths.full && (
                <path d={paths.full} stroke="#60a5fa" strokeWidth="4"
                  fill="none" strokeLinecap="round" strokeLinejoin="round"
                  strokeDasharray="10,8">
                  <animate attributeName="stroke-dashoffset" from="18" to="0" dur="0.9s" repeatCount="indefinite"/>
                </path>
              )}

              {toNode && nodeMap[toNode] && (
                <g>
                  <circle cx={nodeMap[toNode][0]} cy={nodeMap[toNode][1]}
                    r="16" fill="#ef4444" opacity="0.2">
                    <animate attributeName="r" values="14;22;14" dur="2s" repeatCount="indefinite"/>
                    <animate attributeName="opacity" values="0.3;0;0.3" dur="2s" repeatCount="indefinite"/>
                  </circle>
                  <circle cx={nodeMap[toNode][0]} cy={nodeMap[toNode][1]}
                    r="10" fill="#ef4444" stroke="white" strokeWidth="2.5"/>
                  <text x={nodeMap[toNode][0]} y={nodeMap[toNode][1] + 1}
                    textAnchor="middle" dominantBaseline="central"
                    fill="white" fontSize="9" fontWeight="bold">D</text>
                </g>
              )}

              {navData.junction_nodes && navData.junction_nodes.map(function(nid) {
                const pos = nodeMap[nid];
                if (!pos) return null;
                const idx = path.indexOf(nid);
                if (idx <= currentSeg) return null;
                return (
                  <g key={nid}>
                    <circle cx={pos[0]} cy={pos[1]} r="8" fill="#fbbf24" opacity="0.25"/>
                    <circle cx={pos[0]} cy={pos[1]} r="4" fill="#fbbf24" stroke="white" strokeWidth="1.5"/>
                  </g>
                );
              })}

              {animPos && (
                <g transform={"translate(" + animPos[0] + "," + animPos[1] + ")"}>
                  <circle r="22" fill="#3b82f6" opacity="0.12"/>
                  <circle r="14" fill="#1d4ed8" opacity="0.2"/>
                  <circle r="9"  fill="#3b82f6" stroke="white" strokeWidth="2.5"/>
                  <g transform={"rotate(" + ((animPos[2] * 180) / Math.PI) + ")"}>
                    <polygon points="0,-16 4,-8 -4,-8" fill="#60a5fa" opacity="0.9"/>
                  </g>
                </g>
              )}

              <g style={{ cursor: "pointer" }} onClick={openQR}>
                <rect x="8" y="642" width="136" height="28" rx="14"
                  fill="#1e293b" stroke="#334155" strokeWidth="1"/>
                <text x="76" y="656" textAnchor="middle" dominantBaseline="central"
                  fill="#94a3b8" fontSize="11">📷 Scan Checkpoint</text>
              </g>

            </svg>
          </div>
        </>
      )}

    </div>
  );
}