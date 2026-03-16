import { useState } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";
import { Link } from "react-router-dom";
import "./Auth.css";

// FIX: friendly error messages, no Firebase internals exposed
function friendlyError(code) {
  switch (code) {
    case "auth/email-already-in-use":
      return "An account with this email already exists.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/weak-password":
      return "Password must be at least 8 characters.";
    case "auth/network-request-failed":
      return "Network error. Check your connection.";
    default:
      return "Sign up failed. Please try again.";
  }
}

// FIX: password strength validation
function validatePassword(password) {
  if (password.length < 8)
    return "Password must be at least 8 characters.";
  if (!/[0-9]/.test(password))
    return "Password must contain at least one number.";
  return null; // valid
}

function Signup() {
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");

  const handleSignup = async (e) => {
    e.preventDefault();
    setError("");

    // FIX: client-side strength check before hitting Firebase
    const pwError = validatePassword(password);
    if (pwError) {
      setError(pwError);
      return;
    }

    try {
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setError(friendlyError(err.code));
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <h2>Create account</h2>

        <form onSubmit={handleSignup}>
          <input
            type="email"
            placeholder="Email"
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password (min 8 chars, 1 number)"
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
          <button type="submit" className="primary-btn">Sign Up</button>
        </form>

        {error && <p className="error">{error}</p>}

        <p className="switch">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}

export default Signup;