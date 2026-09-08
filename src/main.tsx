import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ConvexClientProvider } from "./ConvexClientProvider";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ConvexClientProvider>
      <App />
    </ConvexClientProvider>
  </React.StrictMode>,
);
