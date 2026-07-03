import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthedLayout } from "./components/AuthedLayout";
import { TestsPage } from "./pages/TestsPage";
import { TakeTestPage } from "./pages/TakeTestPage";
import { MyResultsPage } from "./pages/MyResultsPage";
import { AdminPage } from "./pages/AdminPage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AuthedLayout />}>
          <Route index element={<TestsPage />} />
          <Route path="tests/:testId" element={<TakeTestPage />} />
          <Route path="results" element={<MyResultsPage />} />
          <Route path="admin" element={<AdminPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
