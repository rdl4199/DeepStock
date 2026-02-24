import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./Home";
import { SavedPage } from "./SavedPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/SavedPage" element={<SavedPage />} />
      </Routes>
    </BrowserRouter>
  );
}