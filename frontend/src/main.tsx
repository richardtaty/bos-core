import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./api/AuthContext";
import { AppRoutes } from "./routes/AppRoutes";
import { BmfChatWidget } from "./components/BmfChatWidget";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        {/* Chat del asistente BMF — disponible en todas las páginas */}
        <BmfChatWidget />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
