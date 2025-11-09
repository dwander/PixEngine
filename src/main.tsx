import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// Strict Mode 설정 로드 (개발 모드에서만)
const isDev = import.meta.env.DEV;
let strictModeEnabled = true; // 기본값

if (isDev) {
  try {
    const stored = localStorage.getItem('dev-settings');
    if (stored) {
      const settings = JSON.parse(stored);
      strictModeEnabled = settings.state?.strictMode ?? true;
    }
  } catch (e) {
    console.warn('Failed to load dev settings:', e);
  }
}

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);

// 프로덕션 빌드에서는 항상 StrictMode 없이 렌더링
// 개발 모드에서는 설정에 따라 조건부 렌더링
if (!isDev || !strictModeEnabled) {
  root.render(<App />);
} else {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
