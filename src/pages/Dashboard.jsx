

import { signOut } from "firebase/auth";
import { auth } from "../firebase";

function Dashboard() {
  const handleLogout = async () => {
    await signOut(auth);
  };

  return (
    <div style={{ padding: "40px", color: "white", background: "#0f0f0f", height: "100vh" }}>
      <h1>Dashboard</h1>
      <button onClick={handleLogout}>Logout</button>
    </div>
  );
}

export default Dashboard;