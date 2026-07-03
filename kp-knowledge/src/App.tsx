import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthedLayout } from "./components/AuthedLayout";
import { TestsPage } from "./pages/TestsPage";
import { TakeTestPage } from "./pages/TakeTestPage";
import { MyResultsPage } from "./pages/MyResultsPage";

/* Admin pages pull in heavyweight admin-only libs (pdf.js, SheetJS) —
 * lazy-loading keeps them out of the bundle employees download. */
const AdminPage = lazy(() =>
  import("./pages/AdminPage").then((m) => ({ default: m.AdminPage }))
);
const AdminTestEditorPage = lazy(() =>
  import("./pages/AdminTestEditorPage").then((m) => ({ default: m.AdminTestEditorPage }))
);

function AdminLoading() {
  return (
    <main className="max-w-4xl mx-auto px-6 py-16 text-center text-[14px] text-kp-text-muted">
      Loading…
    </main>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AuthedLayout />}>
          <Route index element={<TestsPage />} />
          <Route path="tests/:testId" element={<TakeTestPage />} />
          <Route path="results" element={<MyResultsPage />} />
          <Route
            path="admin"
            element={
              <Suspense fallback={<AdminLoading />}>
                <AdminPage />
              </Suspense>
            }
          />
          <Route
            path="admin/tests/:testId"
            element={
              <Suspense fallback={<AdminLoading />}>
                <AdminTestEditorPage />
              </Suspense>
            }
          />
          <Route path="admin/tests/:testId/preview" element={<TakeTestPage preview />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
