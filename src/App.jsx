import './output.css';
import Pdf_show from './app/pdf_show';
import MSecreto from './app/msecreto';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Pdf_show />} />
        <Route path="/pdf_show" element={<Pdf_show />} />
        <Route path="/pdf" element={<MSecreto />} />
        <Route path="*" element={<Pdf_show />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
