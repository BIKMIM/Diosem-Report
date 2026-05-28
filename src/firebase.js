import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDvY3_Mo4jFBtHAAPR8r4Jg9otUX9dxcno",
  authDomain: "diosem-report.firebaseapp.com",
  projectId: "diosem-report",
  storageBucket: "diosem-report.firebasestorage.app",
  messagingSenderId: "355670961848",
  appId: "1:355670961848:web:3579ce5475f78df30e4e4d"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
