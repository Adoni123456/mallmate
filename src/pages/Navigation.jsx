import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getAuth } from "firebase/auth";
import "./Navigation.css";
import config from "../config";

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
const API                 = config.API_URL;
const SVG_SCALE           = 0.06;
const AVG_STEP_M          = 0.75;
const ACCEL_THRESH        = 0.8;
const STEP_DEBOUNCE_MS    = 250;
const CALIBRATION_STEPS   = 10;
const QR_SCAN_INTERVAL_MS = 150;
const MAX_DRIFT_ADJUST    = 0.15;
const NOISE_WINDOW_SIZE   = 20;

// ── Phase 1A: Stationary detection ──
// If the net-accel variance stays below STATIONARY_VAR_THRESH for
// STATIONARY_WINDOW_MS milliseconds, the user is standing still.
// The dot freezes until movement is detected again.
const STATIONARY_VAR_THRESH = 0.09;  // m/s² variance — below this = still
const STATIONARY_WINDOW_MS  = 1500;  // ms of stillness before freezing dot
const ACCEL_BUFFER_SIZE     = 30;    // rolling window for variance calculation

// ── Phase 1B: PDR heading gate ──
// Smooth the compass over N samples (handles sensor jitter).
// Only let a step advance the dot when the user's heading is within
// OFF_ROUTE_ANGLE_DEG of the current segment bearing.
// After OFF_ROUTE_STEPS_WARN consecutive off-angle steps, show a warning.
const HEADING_SMOOTH_SIZE  = 6;
const OFF_ROUTE_ANGLE_DEG  = 60;
const OFF_ROUTE_STEPS_WARN = 5;

// ─────────────────────────────────────────────
// Static data
// ─────────────────────────────────────────────
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
  NODE_FOOD: "NODE_FOOD", NODE_SUPER: "NODE_SUPER",
  NODE_SHOE: "NODE_SHOE", NODE_FASHION: "NODE_FASHION",
  NODE_TECH: "NODE_TECH", NODE_GENTS: "NODE_GENTS",
  NODE_LADIES: "NODE_LADIES", NODE_LIFT: "NODE_LIFT",
};

const MANUAL_NODES = [
  { id: "NODE_S3",      label: "Front Entrance" },
  { id: "NODE_BACK",    label: "Back Entrance"  },
  { id: "NODE_TECH",    label: "Tech Zone"      },
  { id: "NODE_FASHION", label: "Fashion Hub"    },
  { id: "NODE_FOOD",    label: "Food Court"     },
  { id: "NODE_SHOE",    label: "Shoe World"     },
  { id: "NODE_SUPER",   label: "Super Mart"     },
  { id: "NODE_LIFT",    label: "Lift"           },
];

const NODE_LABELS = {
  NODE_TECH: "Tech Zone",     NODE_FASHION: "Fashion Hub",
  NODE_SUPER: "Super Mart",   NODE_FOOD: "Food Court",
  NODE_SHOE: "Shoe World",    NODE_LIFT: "Lift",
  NODE_GENTS: "Gents Toilet", NODE_LADIES: "Ladies Toilet",
  NODE_S3: "Front Entrance",  NODE_BACK: "Back Entrance",
};

// ─────────────────────────────────────────────
// Pure geometry helpers
// ─────────────────────────────────────────────
function svgDist(nodes, a, b) {
  const [x1, y1] = nodes[a] || [0, 0];
  const [x2, y2] = nodes[b] || [0, 0];
  return Math.hypot(x2 - x1, y2 - y1);
}
function stepsFor(nodes, a, b, stepLen) {
  return (svgDist(nodes, a, b) * SVG_SCALE) / stepLen;
}
function smoothstep(t) {
  const c = Math.min(Math.max(t, 0), 1);
  return c * c * (3 - 2 * c);
}
function interpolate(nodes, path, progress) {
  if (!path || path.length < 2) return null;
  const seg  = Math.min(Math.floor(progress), path.length - 2);
  const frac = smoothstep(Math.min(progress - seg, 1));
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
    if (i === 0) { full += "M "+x1+" "+y1; done += "M "+x1+" "+y1; }
    else          { full += " L "+x1+" "+y1; }
    full += " L "+x2+" "+y2;
    if (i < seg)        done += " L "+x2+" "+y2;
    else if (i === seg) done += " L "+(x1+(x2-x1)*Math.min(frac,1))+" "+(y1+(y2-y1)*Math.min(frac,1));
  }
  return { full, done };
}

// ── Phase 1B helpers ──
// Returns the compass bearing (0=N, 90=E, CW) of a path segment in SVG space.
// SVG: x right, y down. math angle 0=right → compass 90 (east).
function segBearingDeg(nodes, path, seg) {
  if (!path || seg >= path.length - 1) return null;
  const [x1, y1] = nodes[path[seg]]     || [0, 0];
  const [x2, y2] = nodes[path[seg + 1]] || [0, 0];
  const mathDeg  = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
  return ((mathDeg + 90) + 360) % 360;
}
// Shortest angular difference, result in [-180, 180]
function angleDiff(a, b) {
  let d = ((a - b) % 360 + 360) % 360;
  if (d > 180) d -= 360;
  return d;
}

async function getAuthHeaders() {
  const token = await getAuth().currentUser?.getIdToken().catch(() => null);
  return {
    "ngrok-skip-browser-warning": "true",
    ...(token ? { "Authorization": "Bearer " + token } : {}),
  };
}

// ═══════════════════════════════════════════════════════════════════
export default function Navigation() {
  const routerLoc = useLocation();
  const navigate  = useNavigate();

  // ── Existing state ──
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
  const [scanStatus,    setScanStatus]    = useState("");
  const [debugSteps,    setDebugSteps]    = useState(0);

  // ── Phase 1 state (new) ──
  const [isStationary, setIsStationary] = useState(false); // dot frozen indicator
  const [offRoute,     setOffRoute]     = useState(false); // wrong-direction warning

  // ── Existing refs ──
  const adaptiveThreshRef  = useRef(ACCEL_THRESH);
  const noiseWindowRef     = useRef([]);
  const qrConfirmedSegRef  = useRef(null);
  const stepsSinceQRRef    = useRef(0);
  const qrStreamRef        = useRef(null);
  const stepsInSegRef      = useRef(0);
  const totalStepsRef      = useRef(0);
  const lastStepTimeRef    = useRef(0);
  const peakStateRef       = useRef("low");
  const calibAccRef        = useRef(0);
  const videoRef           = useRef(null);
  const scannerRef         = useRef(null);
  const lastQRScanTimeRef  = useRef(0);
  const navDataRef         = useRef(null);
  const nodeMapRef         = useRef(FALLBACK_NODES);
  const stepLenRef         = useRef(AVG_STEP_M);
  const calibratingRef     = useRef(false);
  const progressRef        = useRef(0);
  const currentSegRef      = useRef(0);

  // ── Phase 1A refs: stationary detection ──
  const accelBufferRef      = useRef([]);   // rolling net-accel buffer
  const stationaryTimerRef  = useRef(null); // setTimeout handle
  const isStationaryRef     = useRef(false);// ref mirror of isStationary state

  // ── Phase 1B refs: heading / PDR ──
  const headingBufferRef    = useRef([]);   // rolling compass readings
  const offRouteCountRef    = useRef(0);    // consecutive off-angle step count

  // Sync state → refs
  useEffect(() => { navDataRef.current      = navData;      }, [navData]);
  useEffect(() => { nodeMapRef.current      = nodeMap;      }, [nodeMap]);
  useEffect(() => { stepLenRef.current      = stepLen;      }, [stepLen]);
  useEffect(() => { calibratingRef.current  = calibrating;  }, [calibrating]);
  useEffect(() => { progressRef.current     = progress;     }, [progress]);
  useEffect(() => { currentSegRef.current   = currentSeg;   }, [currentSeg]);
  useEffect(() => { isStationaryRef.current = isStationary; }, [isStationary]);

  // Load jsQR
  useEffect(() => {
    if (!window.jsQR) {
      const s = document.createElement("script");
      s.src   = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js";
      s.async = true;
      document.head.appendChild(s);
    }
  }, []);

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
          Object.entries(d.nodes).forEach(([k, v]) => { m[k] = [v.x, v.y]; });
          setNodeMap(m);
        }).catch(() => {});
      fetch(API + "/map?v=" + Date.now(), { headers: h })
        .then(r => r.text())
        .then(s => { if (!cancelled) setMapSvg(s); })
        .catch(() => {});
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Phase 1B: DeviceOrientation — compass heading ──
  // Keeps the heading buffer warm at all times (even when not tracking)
  // so PDR is ready the moment the user taps Start Walking.
  const onOrientation = useCallback((e) => {
    // iOS gives webkitCompassHeading (0–360, CW from magnetic north).
    // Android with absolute=true gives e.alpha (also 0–360 CW from north).
    const heading = e.webkitCompassHeading != null
      ? e.webkitCompassHeading
      : (e.absolute && e.alpha != null ? e.alpha : null);
    if (heading == null) return;
    const buf = headingBufferRef.current;
    buf.push(heading);
    if (buf.length > HEADING_SMOOTH_SIZE) buf.shift();
  }, []);

  useEffect(() => {
    // For non-iOS browsers, attach immediately.
    // iOS 13+ permission is requested lazily inside attachMotion.
    if (typeof DeviceOrientationEvent === "undefined") return;
    if (typeof DeviceOrientationEvent.requestPermission === "function") return; // iOS — defer
    window.addEventListener("deviceorientation", onOrientation, true);
    return () => window.removeEventListener("deviceorientation", onOrientation, true);
  }, [onOrientation]);

  // Returns circular mean of the heading buffer (handles 359→1 wraparound).
  // Returns null if buffer is empty.
  const getSmoothedHeading = useCallback(() => {
    const buf = headingBufferRef.current;
    if (buf.length === 0) return null;
    let sinSum = 0, cosSum = 0;
    buf.forEach(h => {
      sinSum += Math.sin((h * Math.PI) / 180);
      cosSum += Math.cos((h * Math.PI) / 180);
    });
    const mean = (Math.atan2(sinSum / buf.length, cosSum / buf.length) * 180) / Math.PI;
    return (mean + 360) % 360;
  }, []);

  // ── Phase 1A: Stationary detection ──
  // Called on every motion sample with the current net-accel value.
  // Computes rolling variance; schedules/cancels the freeze timer.
  const updateStationaryState = useCallback((net) => {
    const buf = accelBufferRef.current;
    buf.push(net);
    if (buf.length > ACCEL_BUFFER_SIZE) buf.shift();
    if (buf.length < 10) return; // not enough data yet

    const mean     = buf.reduce((a, b) => a + b, 0) / buf.length;
    const variance = buf.reduce((s, v) => s + (v - mean) ** 2, 0) / buf.length;

    if (variance < STATIONARY_VAR_THRESH) {
      // Low variance → start the freeze timer if not already running
      if (!stationaryTimerRef.current) {
        stationaryTimerRef.current = setTimeout(() => {
          setIsStationary(true);
          isStationaryRef.current = true;
        }, STATIONARY_WINDOW_MS);
      }
    } else {
      // Movement detected → cancel timer and unfreeze
      if (stationaryTimerRef.current) {
        clearTimeout(stationaryTimerRef.current);
        stationaryTimerRef.current = null;
      }
      if (isStationaryRef.current) {
        setIsStationary(false);
        isStationaryRef.current = false;
      }
    }
  }, []);

  // ── QR helpers (unchanged) ──
  const closeQR = useCallback(() => {
    if (qrStreamRef.current) {
      qrStreamRef.current.getTracks().forEach(t => t.stop());
      qrStreamRef.current = null;
    }
    if (scannerRef.current) cancelAnimationFrame(scannerRef.current);
    setScanMode("idle");
    setJunctionNudge(false);
    setScanStatus("");
  }, []);

  const applyDriftCorrection = useCallback((confirmedSegIdx) => {
    const prev = qrConfirmedSegRef.current;
    if (prev === null || confirmedSegIdx <= prev) return;
    const data  = navDataRef.current;
    const nodes = nodeMapRef.current;
    const stepL = stepLenRef.current;
    if (!data || !data.path) return;
    let expectedSteps = 0;
    for (let i = prev; i < confirmedSegIdx; i++) {
      expectedSteps += stepsFor(nodes, data.path[i], data.path[i + 1], stepL);
    }
    const actualSteps  = stepsSinceQRRef.current;
    if (actualSteps < 5 || expectedSteps < 1) return;
    const ratio        = actualSteps / expectedSteps;
    const clampedRatio = Math.max(1 - MAX_DRIFT_ADJUST, Math.min(1 + MAX_DRIFT_ADJUST, ratio));
    const newStepLen   = Math.min(Math.max(stepL * clampedRatio, 0.4), 1.2);
    setStepLen(newStepLen);
    localStorage.setItem("mm_step_len", String(newStepLen));
  }, []);

  const handleQRResult = useCallback((raw) => {
    closeQR();
    let nodeId = raw.trim();
    if (raw.startsWith("MALLMATE:")) nodeId = raw.split(":")[1];
    const m = raw.match(/node=([A-Z_0-9]+)/);
    if (m) nodeId = m[1];

    if (!navDataRef.current) {
      setFromNode(nodeId);
    } else {
      const idx = navDataRef.current.path.indexOf(nodeId);
      if (idx === -1) {
        // Not on current route — silently re-route from scanned node
        setError(null);
        setFromNode(nodeId);
        return;
      }
      applyDriftCorrection(idx);
      qrConfirmedSegRef.current = idx;
      stepsSinceQRRef.current   = 0;
      stepsInSegRef.current     = 0;
      offRouteCountRef.current  = 0;
      setOffRoute(false);
      setCurrentSeg(idx);
      setProgress(idx);
      setError(null);
    }
  }, [closeQR, applyDriftCorrection]);

  const startBarcode = useCallback(() => {
    const video  = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    const ctx    = canvas.getContext("2d");
    const scanFrame = () => {
      if (!videoRef.current || !qrStreamRef.current) return;
      if (video.readyState < 2) { scannerRef.current = requestAnimationFrame(scanFrame); return; }
      const now = Date.now();
      if (now - lastQRScanTimeRef.current < QR_SCAN_INTERVAL_MS) {
        scannerRef.current = requestAnimationFrame(scanFrame); return;
      }
      lastQRScanTimeRef.current = now;
      canvas.width  = video.videoWidth  || 320;
      canvas.height = video.videoHeight || 240;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      if ("BarcodeDetector" in window) {
        const det = new BarcodeDetector({ formats: ["qr_code"] });
        det.detect(video)
          .then(codes => {
            if (codes.length > 0) { handleQRResult(codes[0].rawValue); return; }
            if (window.jsQR) { const c = window.jsQR(imgData.data, canvas.width, canvas.height); if (c?.data) { handleQRResult(c.data); return; } }
            scannerRef.current = requestAnimationFrame(scanFrame);
          })
          .catch(() => {
            if (window.jsQR) { const c = window.jsQR(imgData.data, canvas.width, canvas.height); if (c?.data) { handleQRResult(c.data); return; } }
            scannerRef.current = requestAnimationFrame(scanFrame);
          });
      } else if (window.jsQR) {
        const c = window.jsQR(imgData.data, canvas.width, canvas.height);
        if (c?.data) { handleQRResult(c.data); return; }
        scannerRef.current = requestAnimationFrame(scanFrame);
      } else {
        scannerRef.current = requestAnimationFrame(scanFrame);
      }
    };
    scannerRef.current = requestAnimationFrame(scanFrame);
  }, [handleQRResult]);

  const openQR = useCallback(async () => {
    setScanStatus("Starting camera...");
    const isSecureContext =
      location.protocol === "https:" ||
      location.hostname === "localhost" ||
      location.hostname === "127.0.0.1";
    if (!isSecureContext) {
      setScanStatus(""); setScanMode("manual");
      setError("Camera requires HTTPS. Use ngrok or deploy to HTTPS to enable QR scanning.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setScanStatus(""); setScanMode("manual");
      setError("Camera not supported on this browser. Select your location manually.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      qrStreamRef.current = stream;
      lastQRScanTimeRef.current = 0;
      setScanMode("scanning");
      setScanStatus("Scanning for QR code...");
      setError(null);
      setTimeout(() => {
        if (!videoRef.current || !qrStreamRef.current) return;
        videoRef.current.srcObject = stream;
        videoRef.current.play().then(() => startBarcode()).catch(() => startBarcode());
      }, 300);
    } catch (e) {
      setScanStatus(""); setScanMode("manual");
      if      (e.name === "NotAllowedError")  setError("Camera permission denied. Please allow camera access and try again.");
      else if (e.name === "NotFoundError")    setError("No camera found on this device.");
      else if (e.name === "NotReadableError") setError("Camera is in use by another app. Close it and try again.");
      else                                    setError("Camera unavailable (" + e.name + "). Select your location manually.");
    }
  }, [startBarcode]);

  useEffect(() => {
    const state = routerLoc.state;
    if (state?.nodeId) {
      setToNode(PLACE_TO_NODE[state.nodeId] || state.nodeId);
      const t = setTimeout(() => openQR(), 400);
      return () => clearTimeout(t);
    }
  }, [routerLoc.state, openQR]);

  useEffect(() => {
    if (!fromNode || !toNode || fromNode === toNode) return;
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null); setNavData(null);
      setProgress(0); setCurrentSeg(0); setArrived(false);
      stepsInSegRef.current     = 0;
      totalStepsRef.current     = 0;
      stepsSinceQRRef.current   = 0;
      qrConfirmedSegRef.current = null;
      setDebugSteps(0);
      // Reset all Phase 1 state for the new route
      adaptiveThreshRef.current = ACCEL_THRESH;
      noiseWindowRef.current    = [];
      accelBufferRef.current    = [];
      headingBufferRef.current  = [];
      offRouteCountRef.current  = 0;
      setIsStationary(false);
      setOffRoute(false);
      isStationaryRef.current   = false;
      if (stationaryTimerRef.current) {
        clearTimeout(stationaryTimerRef.current);
        stationaryTimerRef.current = null;
      }
      try {
        const h   = await getAuthHeaders();
        const res = await fetch(
          API + "/navigate?from_node=" + fromNode + "&to_node=" + toNode,
          { headers: h }
        );
        const d = await res.json();
        if (cancelled) return;
        if (d.error) { setError(d.error); return; }
        setNavData(d);
      } catch(e) {
        if (!cancelled) setError("Could not connect. Check your connection.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [fromNode, toNode]);

  // ── onMotion: adaptive threshold + Phase 1A stationary detection ──
  const onMotion = useCallback((e) => {
    const acc = e.accelerationIncludingGravity;
    if (!acc) return;
    const x = acc.x || 0, y = acc.y || 0, z = acc.z || 0;
    const magnitude = Math.sqrt(x * x + y * y + z * z);
    const net       = Math.abs(magnitude - 9.8);

    // Adaptive threshold update
    const win = noiseWindowRef.current;
    win.push(net);
    if (win.length > NOISE_WINDOW_SIZE) win.shift();
    if (win.length >= NOISE_WINDOW_SIZE) {
      const sorted     = [...win].sort((a, b) => a - b);
      const noiseFloor = sorted[Math.floor(NOISE_WINDOW_SIZE * 0.30)];
      adaptiveThreshRef.current = Math.max(ACCEL_THRESH, noiseFloor + 0.5);
    }

    // Phase 1A: feed net-accel into stationary detector
    updateStationaryState(net);

    const thresh = adaptiveThreshRef.current;
    const now    = Date.now();

    if (net > thresh && peakStateRef.current === "low") {
      peakStateRef.current = "high";
      if (now - lastStepTimeRef.current > STEP_DEBOUNCE_MS) {
        lastStepTimeRef.current = now;
        countStep();
      }
    } else if (net < thresh * 0.6) {
      peakStateRef.current = "low";
    }
  }, [updateStationaryState]);

  // ── countStep: Phase 1A stationary gate + Phase 1B PDR heading gate ──
  const countStep = useCallback(() => {
    if (calibratingRef.current) {
      calibAccRef.current++;
      setCalibSteps(c => c + 1);
      return;
    }

    const data = navDataRef.current;
    if (!data) return;

    // ── Phase 1A gate: ignore step if user is standing still ──
    if (isStationaryRef.current) return;

    const seg  = currentSegRef.current;
    const path = data.path;
    if (seg >= path.length - 1) { setArrived(true); return; }

    // ── Phase 1B gate: only advance if heading aligns with path ──
    // We get the smoothed compass heading and compare it to the bearing
    // of the current segment. Steps that are clearly off-direction are
    // discarded and counted toward an off-route warning.
    const bearing     = segBearingDeg(nodeMapRef.current, path, seg);
    const userHeading = getSmoothedHeading();

    if (bearing !== null && userHeading !== null) {
      const diff = Math.abs(angleDiff(userHeading, bearing));
      if (diff > OFF_ROUTE_ANGLE_DEG) {
        // Heading is off — block dot advancement, maybe warn
        offRouteCountRef.current++;
        if (offRouteCountRef.current >= OFF_ROUTE_STEPS_WARN) {
          setOffRoute(true);
          try { if (navigator.vibrate) navigator.vibrate([100, 50, 100]); } catch(_) {}
        }
        return; // don't advance dot for this step
      }
      // Heading is good — clear any warning
      offRouteCountRef.current = 0;
      setOffRoute(false);
    }

    // ── All gates passed: advance dot ──
    totalStepsRef.current++;
    stepsInSegRef.current++;
    stepsSinceQRRef.current++;
    setDebugSteps(totalStepsRef.current);

    const needed      = stepsFor(nodeMapRef.current, path[seg], path[seg + 1], stepLenRef.current);
    const segProg     = stepsInSegRef.current / needed;
    const newProg     = Math.min(seg + Math.min(segProg, 1), path.length - 1);

    setProgress(newProg);
    progressRef.current = newProg;

    if (segProg > 0.85 && data.junction_nodes?.includes(path[seg + 1])) {
      setJunctionNudge(true);
      try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch(_) {}
    }

    if (segProg >= 1) {
      stepsInSegRef.current    = 0;
      offRouteCountRef.current = 0;
      setOffRoute(false);
      setJunctionNudge(false);
      const nextSeg            = seg + 1;
      currentSegRef.current    = nextSeg;
      setCurrentSeg(nextSeg);
      const clampedProg        = Math.min(nextSeg, path.length - 1);
      setProgress(clampedProg);
      progressRef.current      = clampedProg;
      if (nextSeg >= path.length - 1) {
        setArrived(true);
        window.removeEventListener("devicemotion", onMotion);
        setTracking(false);
      }
    }
  }, [getSmoothedHeading, onMotion]);

  // ── attachMotion: request both motion + orientation permissions ──
  const attachMotion = useCallback((forCalib) => {
    peakStateRef.current      = "low";
    lastStepTimeRef.current   = 0;
    adaptiveThreshRef.current = ACCEL_THRESH;
    noiseWindowRef.current    = [];
    accelBufferRef.current    = [];

    if (typeof DeviceMotionEvent === "undefined") {
      setError("Motion sensors are not supported on this device.");
      return;
    }

    const doAttach = () => {
      window.addEventListener("devicemotion", onMotion);
      if (!forCalib) setTracking(true);

      // Also grab orientation permission on iOS 13+ at the same time
      if (typeof DeviceOrientationEvent !== "undefined" &&
          typeof DeviceOrientationEvent.requestPermission === "function") {
        DeviceOrientationEvent.requestPermission()
          .then(p => {
            if (p === "granted")
              window.addEventListener("deviceorientation", onOrientation, true);
          })
          .catch(() => {});
      }
    };

    if (typeof DeviceMotionEvent.requestPermission === "function") {
      DeviceMotionEvent.requestPermission()
        .then(p => {
          if (p === "granted") doAttach();
          else setError("Motion permission denied. Please allow motion access in iOS Settings.");
        })
        .catch(() => setError("Could not request motion permission."));
    } else {
      doAttach();
    }
  }, [onMotion, onOrientation]);

  const detachMotion = useCallback(() => {
    window.removeEventListener("devicemotion", onMotion);
    // Keep orientation listener alive so heading buffer stays warm
    setTracking(false);
    // Clear stationary timer — no point firing after user manually pauses
    if (stationaryTimerRef.current) {
      clearTimeout(stationaryTimerRef.current);
      stationaryTimerRef.current = null;
    }
    setIsStationary(false);
    isStationaryRef.current = false;
  }, [onMotion]);

  useEffect(() => {
    return () => {
      detachMotion();
      window.removeEventListener("deviceorientation", onOrientation, true);
      if (qrStreamRef.current) {
        qrStreamRef.current.getTracks().forEach(t => t.stop());
        qrStreamRef.current = null;
      }
      if (stationaryTimerRef.current) clearTimeout(stationaryTimerRef.current);
    };
  }, [detachMotion, onOrientation]);

  const startCalibration = useCallback(() => {
    calibAccRef.current = 0;
    setCalibSteps(0);
    setCalibrating(true);
    attachMotion(true);
  }, [attachMotion]);

  const finishCalibration = useCallback(() => {
    const newLen = calibAccRef.current > 0
      ? Math.min(Math.max((CALIBRATION_STEPS * AVG_STEP_M) / calibAccRef.current, 0.4), 1.2)
      : AVG_STEP_M;
    setStepLen(newLen);
    localStorage.setItem("mm_step_len", String(newLen));
    setCalibrating(false);
    detachMotion();
  }, [detachMotion]);

  // ── Derived render values ──
  const path      = navData ? navData.path : [];
  const paths     = buildPathD(nodeMap, path, progress);
  const animPos   = interpolate(nodeMap, path, progress);
  const curDir    = navData?.directions ? navData.directions[currentSeg] : null;
  const destLabel = routerLoc.state?.label || NODE_LABELS[toNode] || toNode || "Destination";
  const isFirst   = !localStorage.getItem("mm_step_len");

  // ── Render ── (UI identical to original; only header badge + dot color changed)
  return (
    <div className="nav-wrapper">

      <div className="nav-header">
        <button className="nav-back-btn" onClick={() => { detachMotion(); navigate(-1); }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <span className="nav-header-title">Navigation</span>
        {/* Header badge: green steps when moving, amber "Stationary" when frozen */}
        {tracking && (
          <span style={{ fontSize: 11, fontWeight: 700,
            color: isStationary ? "#f59e0b" : "#4ade80" }}>
            {isStationary ? "Stationary" : debugSteps + " steps"}
          </span>
        )}
        {!tracking && <div style={{ width: 40 }}/>}
      </div>

      {/* Phase 1B: off-route warning banner */}
      {offRoute && tracking && (
        <div className="nav-error-bar"
          style={{ background: "#451a03", borderColor: "#f59e0b", color: "#fde68a" }}>
          ↩ Wrong direction — turn to face the path
        </div>
      )}

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
                <p className="qr-hint">{scanStatus || "Point camera at QR code"}</p>
                <button className="qr-manual-btn" onClick={() => setScanMode("manual")}>
                  Can't scan? Select manually
                </button>
              </>
            )}
            {scanMode === "manual" && (
              <div className="manual-grid">
                <p className="manual-hint">Select your current location:</p>
                {MANUAL_NODES.map(n => (
                  <button key={n.id} className="manual-node-btn"
                    onClick={() => handleQRResult(n.id)}>
                    {n.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {arrived && (
        <div className="arrival-overlay">
          <div className="arrival-content">
            <div className="arrival-check">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="white"
                strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <h2 className="arrival-title">You've Arrived!</h2>
            <p className="arrival-dest">{destLabel}</p>
            <div className="arrival-actions">
              <button className="arrival-btn primary" onClick={() => {
                setArrived(false); setFromNode(null); setToNode(null);
                setNavData(null); setProgress(0); setCurrentSeg(0);
                navigate("/");
              }}>Back to Chat</button>
              <button className="arrival-btn secondary" onClick={() => {
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
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
            <div className="junction-nudge" onClick={() => { setJunctionNudge(false); openQR(); }}>
              <span>📡 Junction ahead — tap to scan QR and confirm position</span>
            </div>
          )}

          {curDir && (
            <div className="instruction-card">
              <div className="instruction-icon">{curDir.icon}</div>
              <div className="instruction-text">{curDir.instruction}</div>
              {!tracking
                ? <button className="start-walk-btn" onClick={() => attachMotion()}>
                    Start Walking
                  </button>
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
                  <animate attributeName="stroke-dashoffset" from="18" to="0"
                    dur="0.9s" repeatCount="indefinite"/>
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
                  <text x={nodeMap[toNode][0]} y={nodeMap[toNode][1]+1}
                    textAnchor="middle" dominantBaseline="central"
                    fill="white" fontSize="9" fontWeight="bold">D</text>
                </g>
              )}

              {navData.junction_nodes && navData.junction_nodes.map(nid => {
                const pos = nodeMap[nid];
                if (!pos) return null;
                if (path.indexOf(nid) <= currentSeg) return null;
                return (
                  <g key={nid}>
                    <circle cx={pos[0]} cy={pos[1]} r="8" fill="#fbbf24" opacity="0.25"/>
                    <circle cx={pos[0]} cy={pos[1]} r="4" fill="#fbbf24" stroke="white" strokeWidth="1.5"/>
                  </g>
                );
              })}

              {/* Position dot — turns amber + freezes when stationary */}
              {animPos && (
                <g transform={"translate("+animPos[0]+","+animPos[1]+")"}>
                  <circle r="22" fill={isStationary ? "#f59e0b" : "#3b82f6"} opacity="0.12"/>
                  <circle r="14" fill={isStationary ? "#d97706" : "#1d4ed8"} opacity="0.2"/>
                  <circle r="9"  fill={isStationary ? "#f59e0b" : "#3b82f6"} stroke="white" strokeWidth="2.5"/>
                  <g transform={"rotate("+((animPos[2]*180)/Math.PI)+")"}>
                    <polygon points="0,-16 4,-8 -4,-8"
                      fill={isStationary ? "#fbbf24" : "#60a5fa"} opacity="0.9"/>
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