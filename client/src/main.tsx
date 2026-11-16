import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { ThemeCustomizationProvider } from './contexts/ThemeCustomizationContext';
import '../styles/index.css';
import '../styles/split-view.css';
import '../styles/doc-panel.css';
import '../styles/chat-panel.css';
import '../styles/animations.css';
import '../styles/guide-modal.css';
import '../styles/cautious-confirm-modal.css';
import '../styles/export-dialog.css';
import '../styles/theme-customization.css';
import '../styles/mobile.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeCustomizationProvider>
      <App />
    </ThemeCustomizationProvider>
  </React.StrictMode>
);
