import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Shared Firebase project across the entire KP family
const firebaseConfig = {
  apiKey: "AIzaSyDCkr55i9b2WmqEVVrXIb5nFJLh2jYUPqA",
  authDomain: "client-health-dashboard-4826e.firebaseapp.com",
  projectId: "client-health-dashboard-4826e",
  storageBucket: "client-health-dashboard-4826e.firebasestorage.app",
  messagingSenderId: "864229666607",
  appId: "1:864229666607:web:d0b293a6eca9b6a611fbda",
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
export const storage = getStorage(firebaseApp);
export const googleProvider = new GoogleAuthProvider();

googleProvider.setCustomParameters({ prompt: "select_account" });
googleProvider.addScope("profile");
googleProvider.addScope("email");
