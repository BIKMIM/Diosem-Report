import { createContext, useContext, useEffect, useState } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { nameToEmail } from '../utils/workers';

const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [workerProfile, setWorkerProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const login = async (name, password) => {
    const email = nameToEmail(name);
    return signInWithEmailAndPassword(auth, email, password);
  };

  const register = async (name, password) => {
    const email = nameToEmail(name);
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await setDoc(doc(db, 'workers', cred.user.uid), {
      name,
      email,
      isAdmin: false,
      isActive: true,
      createdAt: serverTimestamp()
    });
    return cred;
  };

  const logout = () => signOut(auth);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        const snap = await getDoc(doc(db, 'workers', user.uid));
        setWorkerProfile(snap.exists() ? snap.data() : null);
      } else {
        setWorkerProfile(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  return (
    <AuthContext.Provider value={{ currentUser, workerProfile, login, register, logout, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
