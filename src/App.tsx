import { RouterProvider } from "react-router-dom";
import { router } from "./app/routes";
import { AuthProvider } from "./features/auth/context";
import { ToastProvider } from "./shared/components/Toast/Toast";
import "./index.css"; // Ensure global styles and fonts are loaded

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;
