import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SpecApp } from './SpecApp';
import { Showroom } from './showroom/Showroom';
import './tokens.css';
import './components.css';
import './pages.css';
import './shell.css';
import './catalog.css';
import './motion.css';

const query = new URLSearchParams(window.location.search);
const legacy = query.has('legacy') || query.has('page') || query.has('role') || ['overview', 'leads', 'detail', 'studio', 'research', 'tasks', 'catalog'].includes(window.location.hash.slice(1));
createRoot(document.getElementById('root')!).render(<StrictMode>{legacy ? <SpecApp /> : <Showroom />}</StrictMode>);
