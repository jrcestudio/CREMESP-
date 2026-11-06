import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import GestorAtas from './GestorAtas';
import PainelAtas from './Painel';

// VITE_MODO=painel publica o Painel de Atas (sistema separado, várias atas lidas com IA).
// Sem essa variável, publica o Gestor de Atas da ARP 0099/2025 (REDXCORP).
const modoPainel = (import.meta.env.VITE_MODO as string | undefined)?.trim().toLowerCase() === 'painel';
if (modoPainel) document.title = 'Painel de Atas · Cremesp';

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode>{modoPainel ? <PainelAtas /> : <GestorAtas />}</React.StrictMode>);
