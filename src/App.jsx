import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";


import Intro        from "./pages/Intro";
import Login        from "./pages/Login";
import Signup       from "./pages/Signup";
import Chat         from "./pages/Chat";
import Navigation   from "./pages/Navigation";
import StaffLogin   from "./pages/StaffLogin";
import Admin        from "./pages/Admin";
import ShopKeeper   from "./pages/ShopKeeper";

// ── Protects customer routes — must be logged in ──────────────────
function ProtectedRoute({ children }) {
 const { user, loading } = useAuth();

  if (loading) return  <div>Checking login...</div>; // or spinner
  return user ? children : <Navigate to="/login" />;
}

// ── Protects admin route — must be superadmin ─────────────────────
function AdminRoute({ children }) {
  const { user }  = useAuth();
  const [ok,  setOk]  = useState(null);  // null=checking, true=allow, false=deny

  useEffect(() => {
    if (!user) { setOk(false); return; }
    getDoc(doc(db, "users", user.uid)).then(snap => {
      setOk(snap.exists() && snap.data()?.role === "superadmin");
    }).catch(() => setOk(false));
  }, [user]);

  if (ok === null) return null;  // still checking — render nothing briefly
  return ok ? children : <Navigate to="/staff/login" />;
}

// ── Protects shopkeeper route — must be shopkeeper ────────────────
function ShopKeeperRoute({ children }) {
  const { user }  = useAuth();
  const [ok,  setOk]  = useState(null);

  useEffect(() => {
    if (!user) { setOk(false); return; }
    getDoc(doc(db, "users", user.uid)).then(snap => {
      setOk(snap.exists() && snap.data()?.role === "shopkeeper");
    }).catch(() => setOk(false));
  }, [user]);

  if (ok === null) return null;
  return ok ? children : <Navigate to="/staff/login" />;
}

function App() {
  const { user } = useAuth();

  return (
    <Routes>
      {/* ── Public routes ── */}
      <Route path="/" element={<Intro />} />

      <Route path="/login"
        element={!user ? <Login /> : <Navigate to="/chat" />} />

      <Route path="/signup"
        element={!user ? <Signup /> : <Navigate to="/chat" />} />

      {/* ── Staff login — separate from customer login ── */}
      <Route path="/staff/login" element={<StaffLogin />} />

      {/* ── Customer routes ── */}
      <Route path="/chat"
        element={<ProtectedRoute><Chat /></ProtectedRoute>} />

      <Route path="/navigation"
        element={<ProtectedRoute><Navigation /></ProtectedRoute>} />

      {/* ── Admin route — superadmin only ── */}
      <Route path="/admin"
        element={<AdminRoute><Admin /></AdminRoute>} />

      {/* ── ShopKeeper route — shopkeeper only ── */}
      <Route path="/shopkeeper/:shopId"
        element={<ShopKeeperRoute><ShopKeeper /></ShopKeeperRoute>} />

      {/* ── Fallback ── */}
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default App;