// firebase.js
const firebaseConfig = {
  apiKey: "AIzaSyBZqEBkUo-XqtOC8U4Sf5U6YL1v93_P3Ew",
  authDomain: "messtracker-01.firebaseapp.com",
  databaseURL: "https://messtracker-01-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "messtracker-01",
  storageBucket: "messtracker-01.firebasestorage.app",
  messagingSenderId: "486545563057",
  appId: "1:486545563057:web:e897b1768e39bea7c0f190",
  measurementId: "G-C0JZ18F66R"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
window.db = firebase.database();
