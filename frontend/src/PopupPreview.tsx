import { createRoot } from 'react-dom/client';
import { Popup } from './ExtensionPopup';

createRoot(document.getElementById('popup-preview-root')!).render(<Popup preview />);
