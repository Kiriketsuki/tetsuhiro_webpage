// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCwgvBVKCddOMapU5lSGGgDXeRUR7n89-0",
  authDomain: "tetsuhiro-83a95.firebaseapp.com",
  projectId: "tetsuhiro-83a95",
  storageBucket: "tetsuhiro-83a95.appspot.com",
  messagingSenderId: "49716949704",
  appId: "1:49716949704:web:4d18987b1499661a23ebfd",
  measurementId: "G-H5FBF5MNP1"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
