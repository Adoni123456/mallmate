import { useState } from "react";
import { signInWithEmailAndPassword, signInWithRedirect, signInWithPopup} from "firebase/auth";
import { auth, googleProvider } from "../firebase";
import { Link } from "react-router-dom";
import "./Auth.css";
import { Eye, EyeOff } from "lucide-react";

// Map Firebase error codes → generic messages (FIX: no internal details leaked)
function friendlyError(code) {
  switch (code) {
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
    case "auth/invalid-email":
      return "Invalid email or password.";
    case "auth/too-many-requests":
      return "Too many attempts. Please try again later.";
    case "auth/user-disabled":
      return "This account has been disabled.";
    case "auth/network-request-failed":
      return "Network error. Check your connection.";
    default:
      return "Sign in failed. Please try again.";
  }
}

function Login() {
  const [email,        setEmail]        = useState("");
  const [password,     setPassword]     = useState("");
  const [error,        setError]        = useState("");
  const [showPassword, setShowPassword] = useState(false);
  
  useEffect(() => {
  getRedirectResult(auth)
    .then((result) => {
      if (result) {
        console.log("User logged in:", result.user);
      }
    })
    .catch((error) => {
      console.error(error);
    });
}, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      // FIX: show friendly message, not raw Firebase error
      setError(friendlyError(err.code));
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    if (isMobile) {
      // Mobile → use redirect
      await signInWithRedirect(auth, googleProvider);
    } else {
      // Desktop → use popup
      await signInWithPopup(auth, googleProvider);
    }
    } catch (err) {
      setError(friendlyError(err.code));
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <h2>Sign in</h2>

        <form onSubmit={handleLogin}>
          <input
            type="email"
            placeholder="Email"
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <div className="password-wrapper">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <span
              className="eye-icon"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </span>
          </div>

          <button type="submit" className="primary-btn">Sign In</button>
        </form>

        <button onClick={handleGoogleLogin} className="google-btn">
          <img
            src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
            alt="Google"
          />
          Continue with Google
        </button>

        {error && <p className="error">{error}</p>}

        <p className="switch">
          Don't have an account? <Link to="/signup">Sign up</Link>
        </p>
      </div>
    </div>
  );
}

export default Login;