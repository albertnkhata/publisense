import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { StoreProvider } from './context/StoreContext';
import { AppShell } from './components/AppShell';
import { AuthModal } from './components/AuthModal';
import { CreateProductModal } from './components/CreateProductModal';
import { HomePage } from './pages/HomePage';

export default function App() {
  return (
    <ThemeProvider>
      <StoreProvider>
        <BrowserRouter>
          <AppShell>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/p/:slug" element={<HomePage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AppShell>
          <AuthModal />
          <CreateProductModal />
        </BrowserRouter>
      </StoreProvider>
    </ThemeProvider>
  );
}
