import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
// @ts-ignore CSS is loaded by the bundler; TypeScript may not have a CSS declaration.
import './index.css';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { AppProvider } from './context/AppContext';
import { OperationsProvider } from './context/OperationsContext';
createRoot(document.getElementById('root')!).render(<StrictMode><BrowserRouter><AuthProvider><AppProvider><OperationsProvider><App/></OperationsProvider></AppProvider></AuthProvider></BrowserRouter></StrictMode>);
