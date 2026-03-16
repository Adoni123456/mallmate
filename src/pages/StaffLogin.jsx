// src/pages/StaffLogin.jsx
import { useState } from "react";
import { signInWithEmailAndPassword, signInWithPopup } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db, googleProvider } from "../firebase";
import { useNavigate } from "react-router-dom";
import "./StaffLogin.css";

function friendlyError(code) {
  switch (code) {
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Invalid email or password.";
    case "auth/too-many-requests":
      return "Too many attempts. Please try again later.";
    case "auth/network-request-failed":
      return "Network error. Check your connection.";
    default:
      return "Sign in failed. Please try again.";
  }
}

async function checkRoleAndRedirect(uid, navigate, setError) {
  console.log("UID being checked:", uid);

  const userDoc = await getDoc(doc(db, "users", uid));

  console.log("Document exists:", userDoc.exists());
  console.log("Document data:", userDoc.data());

  if (!userDoc.exists()) {
    await auth.signOut();
    setError("You are not registered as a staff member.");
    return;
  }

  const role    = userDoc.data()?.role;
  const shop_id = userDoc.data()?.shop_id;

  console.log("Role found:", role);

  if (role === "superadmin") {
    navigate("/admin");
  } else if (role === "shopkeeper") {
    navigate(`/shopkeeper/${shop_id}`);
  } else {
    await auth.signOut();
    setError("You are not registered as a staff member.");
  }
}

function StaffLogin() {
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      await checkRoleAndRedirect(result.user.uid, navigate, setError);
    } catch (err) {
      setError(friendlyError(err.code));
    }
    setLoading(false);
  };

  const handleGoogle = async () => {
    setError("");
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      await checkRoleAndRedirect(result.user.uid, navigate, setError);
    } catch (err) {
      setError(friendlyError(err.code));
    }
    setLoading(false);
  };

  return (
    <div className="staff-wrapper">
      <div className="staff-card">

        <div className="staff-header">
          <div className="staff-logo">🏬</div>
          <h2>MallMate Staff</h2>
          <p>Admin & Shop Keeper Portal</p>
        </div>

        <form onSubmit={handleLogin}>
          <div className="staff-field">
            <label>Email</label>
            <input
              type="email"
              placeholder="staff@mall.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="staff-field">
            <label>Password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && <div className="staff-error">{error}</div>}

          <button type="submit" className="staff-btn" disabled={loading}>
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>

        <div className="staff-divider"><span>or</span></div>

        <button className="staff-google-btn" onClick={handleGoogle} disabled={loading}>
          <img
            src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
            alt="Google"
          />
          Continue with Google
        </button>

        <p className="staff-note">This portal is for mall staff only.</p>
      </div>
    </div>
  );
}

export default StaffLogin;