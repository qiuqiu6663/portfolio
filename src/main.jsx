import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'
import './portfolio-motion.css'

// React Bits disposes its WebGL context on unmount. Avoid the development-only
// StrictMode effect replay so the exact upstream source keeps a live context.
createRoot(document.getElementById('root')).render(<App />)
