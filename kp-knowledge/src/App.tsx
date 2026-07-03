import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthedLayout } from "./components/AuthedLayout";
import { TestsPage } from "./pages/TestsPage";
import { TakeTestPage } from "./pages/TakeTestPage";
import { MyResultsPage } from "./pages/MyResultsPage";
import { AdminPage } from "./pages/AdminPage";
import { AdminTestEditorPage } from "./pages/AdminTestEditorPage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AuthedLayout />}>
          <Route index element={<TestsPage />} />
          <Route path="tests/:testId" element={<TakeTestPage />} />
          <Route path="results" element={<MyResultsPage />} />
          <Route path="admin" element={<AdminPage />} />
          <Route path="admin/tests/:testId" element={<AdminTestEditorPage />} />
          <Route path="admin/tests/:testId/preview" element={<TakeTestPage preview />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
