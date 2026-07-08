import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthedLayout } from "./components/AuthedLayout";
import { TestsPage } from "./pages/TestsPage";
import { TakeTestPage } from "./pages/TakeTestPage";
import { MyResultsPage } from "./pages/MyResultsPage";
import { LeaderboardPage } from "./pages/LeaderboardPage";
import { StorePage } from "./pages/StorePage";
import { AsteroidsDemo } from "./components/AsteroidsDemo";

/* Admin pages pull in heavyweight admin-only libs (pdf.js, SheetJS) —
 * lazy-loading keeps them out of the bundle employees download. */
const AdminPage = lazy(() =>
  import("./pages/AdminPage").then((m) => ({ default: m.AdminPage }))
);
const AdminTestEditorPage = lazy(() =>
  import("./pages/AdminTestEditorPage").then((m) => ({ default: m.AdminTestEditorPage }))
);
const CreatePage = lazy(() =>
  import("./pages/CreatePage").then((m) => ({ default: m.CreatePage }))
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
        {import.meta.env.DEV && <Route path="/play-demo" element={<AsteroidsDemo />} />}
        <Route path="/" element={<AuthedLayout />}>
          <Route index element={<TestsPage />} />
          <Route path="tests/:testId" element={<TakeTestPage />} />
          <Route path="results" element={<MyResultsPage />} />
          <Route path="leaderboard" element={<LeaderboardPage />} />
          <Route path="store" element={<StorePage />} />
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
          <Route
            path="create"
            element={
              <Suspense fallback={<AdminLoading />}>
                <CreatePage />
              </Suspense>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
