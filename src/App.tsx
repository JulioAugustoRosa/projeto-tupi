import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import Index from "./pages/Index";
import TurmasPage from "./pages/TurmasPage";
import AlunosPage from "./pages/AlunosPage";
import AtividadesPage from "./pages/AtividadesPage";
import AdaptacoesPage from "./pages/AdaptacoesPage";
import RelatoriosPage from "./pages/RelatoriosPage";
import AssistentePage from "./pages/AssistentePage";
import ConfiguracoesPage from "./pages/ConfiguracoesPage";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import CadastroPage from "./pages/CadastroPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedApp({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <AppLayout>{children}</AppLayout>
    </ProtectedRoute>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Public routes */}
            <Route path="/landing" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/cadastro" element={<CadastroPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />

            {/* Protected routes */}
            <Route path="/" element={<ProtectedApp><Index /></ProtectedApp>} />
            <Route path="/turmas" element={<ProtectedApp><TurmasPage /></ProtectedApp>} />
            <Route path="/alunos" element={<ProtectedApp><AlunosPage /></ProtectedApp>} />
            <Route path="/atividades" element={<ProtectedApp><AtividadesPage /></ProtectedApp>} />
            <Route path="/adaptacoes" element={<ProtectedApp><AdaptacoesPage /></ProtectedApp>} />
            <Route path="/relatorios" element={<ProtectedApp><RelatoriosPage /></ProtectedApp>} />
            <Route path="/assistente" element={<ProtectedApp><AssistentePage /></ProtectedApp>} />
            <Route path="/configuracoes" element={<ProtectedApp><ConfiguracoesPage /></ProtectedApp>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
