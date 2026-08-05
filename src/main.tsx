import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./features/auth/AuthProvider";
import { PwaUpdate } from "./components/common/PwaUpdate";
import { router } from "./app/router";
import "./styles/app.css";
import "./styles/typography.css";
import "./styles/access.css";
import "./styles/directory.css";
import "./styles/news.css";
import "./styles/notifications.css";
import "./styles/documents.css";
import "./styles/document-detail.css";
import "./styles/admin.css";
import "./styles/admin-extra.css";
import "./styles/admin-controls.css";
import "./styles/messaging.css";
import "./styles/messaging-extra.css";
import "./styles/message-actions.css";
import "./styles/shell.css";
import "./styles/settings.css";
import "./styles/preferences.css";
import "./styles/operations.css";
import "./styles/more.css";
import "./styles/pwa.css";
import "./styles/mobile-fixes.css";
import "./styles/auth-brand.css";
import "./styles/native-ready.css";
import "./styles/premium-features.css";
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
        <PwaUpdate />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
