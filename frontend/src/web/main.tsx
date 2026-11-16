import { WEB_SESSION_BOUNDARY } from "../lib/webSessionBoundary";
import './web.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import '../index.css'
import App from './WebApp'
import { ThemeProvider } from 'next-themes'
import { queryClient } from '../lib/queryClient'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} storageKey="apollo-pdv-theme">
          <App />
        </ThemeProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)

window.addEventListener("storage", event => {
  if (event.key === WEB_SESSION_BOUNDARY) { queryClient.clear(); window.location.assign("/login"); }
});
