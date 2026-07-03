import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { BrowserRouter } from 'react-router-dom'
import AppContextProvider from './context/AppContext.jsx'
import SocketContextProvider from './context/SocketContext.jsx'
import { GoogleOAuthProvider } from '@react-oauth/google'

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID || 'dummy-client-id'}>
      <AppContextProvider>
        <SocketContextProvider>
          <App />
        </SocketContextProvider>
      </AppContextProvider>
    </GoogleOAuthProvider>
  </BrowserRouter>,
)

