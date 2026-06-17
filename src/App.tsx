import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import TextAnalysis from "./pages/TextAnalysis";
import ImageAnalysis from "./pages/ImageAnalysis";
import VideoAnalysis from "./pages/VideoAnalysis";
import Api from "./pages/Api";
import Extension from "./pages/Extension";
import NotFound from "./pages/NotFound";
import SafeNetGuard from "./components/SafeNetGuard";
import Auth from "./pages/Auth";
import AdminDashboard from "./pages/AdminDashboard";
import { AuthProvider } from "./hooks/useAuth";
import { RequireAuth } from "./components/RequireAuth";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route
              path="/admin-dashboard"
              element={
                <RequireAuth roles={["admin", "owner"]}>
                  <AdminDashboard />
                </RequireAuth>
              }
            />
            <Route path="/text-analysis" element={<TextAnalysis />} />
            <Route path="/image-analysis" element={<ImageAnalysis />} />
            <Route path="/video-analysis" element={<VideoAnalysis />} />
            <Route path="/api" element={<Api />} />
            <Route path="/api-docs" element={<Api />} />
            <Route
              path="/extension"
              element={
                <RequireAuth roles={["admin", "owner"]}>
                  <Extension />
                </RequireAuth>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
          <SafeNetGuard />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
