import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { FortnightProvider } from './context/FortnightContext'
import './styles/globals.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <FortnightProvider>
      <App />
    </FortnightProvider>
  </React.StrictMode>,
)
