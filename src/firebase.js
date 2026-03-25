import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, setPersistence, browserLocalPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";  // NEW: for role storage

const firebaseConfig = {
  apiKey: "AIzaSyCx4FoP2rrCiZpD0xRAxCY_b3C4UIqHDo8",
  authDomain: "mallmate-3e17d.firebaseapp.com",
  projectId: "mallmate-3e17d",
  storageBucket: "mallmate-3e17d.firebasestorage.app",
  messagingSenderId: "367122740095",
  appId: "1:367122740095:web:a56f06af9c6211b493604a"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence)
  .then(() => {
    console.log("Persistence set to LOCAL");
  })
  .catch((err) => {
    console.error("Persistence error:", err);
  });
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);  // NEW: Firestore instance