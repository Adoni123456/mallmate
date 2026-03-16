import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { signOut, getAuth, onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase";
import {
  getFirestore, collection, doc,
  getDocs, addDoc, deleteDoc,
  query, orderBy, serverTimestamp
} from "firebase/firestore";
import "./Chat.css";
import config from "../config";

const db = getFirestore();

const SendIcon    = () => <svg className="icon icon-20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2" fill="currentColor" stroke="none"/></svg>;
const MicIcon     = () => <svg className="icon icon-20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>;
const MicOffIcon  = () => <svg className="icon icon-20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6"/><path d="M17 16.95A7 7 0 015 12v-2m14 0v2a7 7 0 01-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>;
const LogoutIcon  = () => <svg className="icon icon-18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>;
const TrashIcon   = () => <svg className="icon icon-18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>;
const NavIcon     = () => <svg className="icon icon-15" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>;
const ShopIcon    = () => <svg className="icon icon-14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>;
const TagIcon     = () => <svg className="icon icon-14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>;
const PinIcon     = () => <svg className="icon icon-14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>;
const BotIcon     = () => <svg className="icon icon-28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><circle cx="8" cy="16" r="1" fill="currentColor"/><circle cx="16" cy="16" r="1" fill="currentColor"/></svg>;
const HistoryIcon = () => <svg className="icon icon-13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg"><polyline points="12 8 12 12 14 14"/><path d="M3.05 11a9 9 0 100 2"/><polyline points="1 4 1 8 5 8"/><path d="M3.05 11L1 8"/></svg>;

const todayKey = () => new Date().toISOString().slice(0, 10);

async function loadLastSession() {
  const uid = getAuth().currentUser?.uid;
  if (!uid) return [];
  try {
    const ref  = collection(db, "users", uid, "sessions", todayKey(), "messages");
    const snap = await getDocs(query(ref, orderBy("timestamp", "asc")));
    return snap.docs.map(d => ({ ...d.data(), id: d.id }));
  } catch { return []; }
}

async function saveMessage(msg) {
  const uid = getAuth().currentUser?.uid;
  if (!uid) return;
  try {
    const ref = collection(db, "users", uid, "sessions", todayKey(), "messages");
    await addDoc(ref, {
      role:      msg.role,
      content:   msg.content,
      items:     msg.items   || [],
      offers:    msg.offers  || [],
      places:    msg.places  || [],
      actions:   msg.actions || [],
      timestamp: serverTimestamp(),
    });
  } catch {}
}

async function clearHistory() {
  const uid = getAuth().currentUser?.uid;
  if (!uid) return;
  try {
    const ref  = collection(db, "users", uid, "sessions", todayKey(), "messages");
    const snap = await getDocs(ref);
    await Promise.all(snap.docs.map(d =>
      deleteDoc(doc(db, "users", uid, "sessions", todayKey(), "messages", d.id))
    ));
  } catch {}
}

export default function Chat() {
  const [messages,   setMessages]   = useState([]);
  const [input,      setInput]      = useState("");
  const [loading,    setLoading]    = useState(false);
  const [listening,  setListening]  = useState(false);
  const [histLoaded, setHistLoaded] = useState(false);
  const [voiceOk,    setVoiceOk]    = useState(false);

  const navigate       = useNavigate();
  const bottomRef      = useRef(null);
  const recognRef      = useRef(null);
  // PERMANENT FIX: store user in ref so it's always available
  // getAuth().currentUser can be null on mobile during initialization
  // onAuthStateChanged fires reliably on all devices
  const currentUserRef = useRef(null);

  // Keep ref in sync with Firebase auth — fires immediately on mount
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, user => {
      currentUserRef.current = user;
    });
    return unsub;
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    setHistLoaded(true);
    loadLastSession().then(msgs => {
      if (msgs.length > 0) setMessages(msgs);
    });
  }, []);

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    setVoiceOk(true);
    const rec          = new SR();
    rec.continuous     = false;
    rec.interimResults = true;
    rec.lang           = "en-IN";
    rec.onresult = e => {
      const t = Array.from(e.results).map(r => r[0].transcript).join("");
      setInput(t);
      if (e.results[e.results.length - 1].isFinal) {
        setListening(false);
        setTimeout(() => doSend(t), 300);
      }
    };
    rec.onerror = () => setListening(false);
    rec.onend   = () => setListening(false);
    recognRef.current = rec;
  }, []);

  const toggleVoice = () => {
    if (!recognRef.current) return;
    if (listening) { recognRef.current.stop(); setListening(false); }
    else           { setInput(""); recognRef.current.start(); setListening(true); }
  };

  const doSend = async (textOverride) => {
    const text = (textOverride ?? input).trim().slice(0, 300);
    if (!text || loading) return;
    setInput("");

    const userMsg = {
      id: Date.now(), role: "user", content: text,
      items: [], offers: [], places: [], actions: [],
    };
    setMessages(prev => [...prev, userMsg]);
    saveMessage(userMsg);
    setLoading(true);

    try {
      // Use ref — always has latest user, no timing issues on mobile
      const token = await currentUserRef.current?.getIdToken().catch(() => null);

      const res = await fetch(config.API_URL + "/chat", {
        method: "POST",
        headers: {
          "Content-Type":               "application/json",
          "ngrok-skip-browser-warning": "true",
          ...(token && { "Authorization": "Bearer " + token }),
        },
        body: JSON.stringify({ message: text }),
      });

      if (res.status === 401) {
        setMessages(prev => [...prev, {
          id: Date.now() + 1, role: "assistant",
          content: "Session expired. Please log in again.",
          items: [], offers: [], places: [], actions: [],
        }]);
        await signOut(auth);
        setLoading(false);
        return;
      }

      const data   = await res.json();
      const botMsg = {
        id:      Date.now() + 1,
        role:    "assistant",
        content: data.text || "No response",
        items:   data.items   || [],
        offers:  data.offers  || [],
        places:  data.places  || [],
        actions: data.actions || [],
      };
      setMessages(prev => [...prev, botMsg]);
      saveMessage(botMsg);

    } catch(err) {
      setMessages(prev => [...prev, {
        id: Date.now() + 1, role: "assistant",
        content: "Could not reach server. Check your connection.",
        items: [], offers: [], places: [], actions: [],
      }]);
    }
    setLoading(false);
  };

  const handleClear = async () => {
    if (!window.confirm("Clear today's chat history?")) return;
    await clearHistory();
    setMessages([]);
  };

  const handleNavigate = (nodeId, label) =>
    navigate("/navigation", { state: { nodeId, label } });

  return (
    <div className="chat-wrapper">

      <div className="chat-header">
        <div className="header-brand">
          <div className="header-logo"><ShopIcon/></div>
          <span>MallMate</span>
        </div>
        <div className="header-actions">
          {messages.length > 0 && (
            <button className="hdr-btn" onClick={handleClear} title="Clear history">
              <TrashIcon/>
            </button>
          )}
          <button className="hdr-btn" onClick={() => signOut(auth)} title="Logout">
            <LogoutIcon/>
          </button>
        </div>
      </div>

      {histLoaded && messages.length > 0 && (
        <div className="history-banner">
          <HistoryIcon/> Restored from today's session
        </div>
      )}

      <div className="chat-body">

        {messages.length === 0 && histLoaded && (
          <div className="empty-state">
            <div className="empty-bot-icon"><BotIcon/></div>
            <p className="empty-title">Hi! I'm your mall assistant.</p>
            <p className="empty-sub">Try asking something like:</p>
            <div className="empty-suggestions">
              {["Cheapest Nike shoes","Biriyani near me","Where is Tech Zone","Current offers"].map(s => (
                <button key={s} className="suggestion-btn" onClick={() => doSend(s)}>{s}</button>
              ))}
            </div>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className={"message " + msg.role}>
            <div className="bubble">
              <p className="msg-text">{msg.content}</p>

              {msg.items?.length > 0 && (
                <div className="item-list">
                  {msg.items.map((item, i) => (
                    <div key={i} className="item-card">
                      <div className="item-header">
                        <strong className="item-name">{item.name}</strong>
                        <span className={"stock-badge " + (item.in_stock ? "in" : "out")}>
                          {item.in_stock ? "In Stock" : "Out of Stock"}
                        </span>
                      </div>
                      <p className="item-price">₹{item.price.toLocaleString("en-IN")}</p>
                      <p className="item-shop"><ShopIcon/>{item.shop_name}</p>
                    </div>
                  ))}
                </div>
              )}

              {msg.offers?.length > 0 && (
                <div className="offer-list">
                  {msg.offers.map((offer, i) => (
                    <div key={i} className="offer-card">
                      <div className="offer-title"><TagIcon/><strong>{offer.title}</strong></div>
                      <p className="offer-desc">{offer.description}</p>
                      {offer.discount_percent && (
                        <span className="discount-badge">{offer.discount_percent}% OFF</span>
                      )}
                      <p className="item-shop"><ShopIcon/>{offer.shop}</p>
                    </div>
                  ))}
                </div>
              )}

              {msg.places?.length > 0 && (
                <div className="place-list">
                  {msg.places.map((place, i) => (
                    <div key={i} className="place-card">
                      <div className="place-title"><PinIcon/><strong>{place.name}</strong></div>
                      <p className="place-desc">{place.description}</p>
                    </div>
                  ))}
                </div>
              )}

              {msg.actions?.length > 0 && (
                <div className="action-buttons">
                  {msg.actions.map((action, i) => (
                    <button key={i} className="navigate-btn"
                      onClick={() => handleNavigate(action.nodeId, action.label)}>
                      <NavIcon/>{action.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="message assistant">
            <div className="bubble typing">
              <span className="dot"/><span className="dot"/><span className="dot"/>
            </div>
          </div>
        )}

        <div ref={bottomRef}/>
      </div>

      <div className="chat-input">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && doSend()}
          placeholder={listening ? "Listening..." : "Ask something..."}
          disabled={loading}
          maxLength={300}
          className={listening ? "listening" : ""}
        />
        {voiceOk && (
          <button
            className={"input-btn mic-btn" + (listening ? " listening" : "")}
            onClick={toggleVoice}
            disabled={loading}
          >
            {listening ? <MicOffIcon/> : <MicIcon/>}
          </button>
        )}
        <button
          className="input-btn send-btn"
          onClick={() => doSend()}
          disabled={loading || !input.trim()}
        >
          {loading ? <span className="spinner"/> : <SendIcon/>}
        </button>
      </div>

    </div>
  );
}