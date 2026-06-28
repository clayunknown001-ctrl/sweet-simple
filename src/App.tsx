import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { lazy, Suspense } from "react";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import SafeNetGuard from "./components/SafeNetGuard";
import { AuthProvider } from "./hooks/useAuth";
import { RequireRole } from "./components/RequireRole";
import { ProUpgradeProvider } from "./components/admin/ProUpgradeModal";
import NavArrows from "./components/NavArrows";

const About = lazy(() => import("./pages/About"));
const NarimonAI = lazy(() => import("./pages/NarimonAI"));
const NarimonBrowser = lazy(() => import("./pages/NarimonBrowser"));
const Login = lazy(() => import("./pages/Login"));
const Pricing = lazy(() => import("./pages/Pricing"));
const Download = lazy(() => import("./pages/Download"));
const Placeholder = lazy(() => import("./pages/Placeholder"));
const TextAnalysis = lazy(() => import("./pages/TextAnalysis"));
const ImageAnalysis = lazy(() => import("./pages/ImageAnalysis"));
const VideoAnalysis = lazy(() => import("./pages/VideoAnalysis"));
const Api = lazy(() => import("./pages/Api"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));

const queryClient = new QueryClient();

const Loading = () => (
  <div className="min-h-screen flex items-center justify-center bg-[#050607] text-[#97A2AE]">
    Yuklanmoqda...
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <ProUpgradeProvider>
            <Suspense fallback={<Loading />}>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/about" element={<About />} />
                <Route path="/biz-haqimizda" element={<About />} />

                <Route path="/ai" element={<NarimonAI />} />
                <Route path="/ai/image" element={<ImageAnalysis />} />
                <Route path="/ai/video" element={<VideoAnalysis />} />
                <Route path="/ai/text" element={<TextAnalysis />} />
                <Route path="/ai/chat" element={<Placeholder title="AI Chat — Demo tez orada" />} />

                <Route path="/browser" element={<NarimonBrowser />} />
                <Route path="/download/:platform" element={<Download />} />

                <Route path="/login" element={<Login />} />
                <Route path="/auth" element={<Login />} />
                <Route path="/pricing" element={<Pricing />} />

                <Route path="/api" element={<Api />} />
                <Route path="/api-docs" element={<Api />} />

                {/* Legacy redirects */}
                <Route path="/text-analysis" element={<TextAnalysis />} />
                <Route path="/image-analysis" element={<ImageAnalysis />} />
                <Route path="/video-analysis" element={<VideoAnalysis />} />

                <Route
                  path="/dashboard"
                  element={
                    <RequireRole roles={["admin", "owner"]}>
                      <AdminDashboard />
                    </RequireRole>
                  }
                />
                <Route
                  path="/admin-dashboard"
                  element={
                    <RequireRole roles={["admin", "owner"]}>
                      <AdminDashboard />
                    </RequireRole>
                  }
                />

                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
            <NavArrows />
            <SafeNetGuard />
          </ProUpgradeProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
