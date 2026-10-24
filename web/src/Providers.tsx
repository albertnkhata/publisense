import { useState, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from './api';
import { ThemeProvider } from './lib/ThemeProvider';
import { ViewerProvider } from './lib/viewer';
import { ToastProvider } from './ui';

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(createQueryClient);
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <ViewerProvider>
          <ToastProvider>{children}</ToastProvider>
        </ViewerProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
