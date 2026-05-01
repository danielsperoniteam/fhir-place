import { Link, NavLink, Route, Routes } from "react-router-dom";
import { SyntheticOnlyBanner } from "./components/SyntheticOnlyBanner.js";
import { HomePage } from "./pages/HomePage.js";
import { ConnectionsListPage } from "./pages/ConnectionsListPage.js";
import { ConnectionDetailPage } from "./pages/ConnectionDetailPage.js";
import { NewConnectionPage } from "./pages/NewConnectionPage.js";
import { PatientsPage } from "./pages/PatientsPage.js";
import { PatientPage } from "./pages/PatientPage.js";
import { ResourcePage } from "./pages/ResourcePage.js";
import { SessionPage } from "./pages/SessionPage.js";
import { AnswerPreviewPage } from "./pages/AnswerPreviewPage.js";
import { FailureGalleryPage } from "./pages/FailureGalleryPage.js";

const navItem =
  "rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900";
const navItemActive =
  "rounded-md bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-900";

export function App() {
  return (
    <div className="min-h-screen">
      <SyntheticOnlyBanner />
      <header className="border-b border-slate-200 bg-white px-6 py-3">
        <div className="flex items-center justify-between gap-4">
          <Link to="/" className="text-lg font-semibold text-slate-900">
            fhir-place{" "}
            <span className="text-sm font-normal text-slate-500">
              · agent workbench · phase a
            </span>
          </Link>
          <nav className="flex items-center gap-1">
            <NavLink
              to="/"
              end
              className={({ isActive }) => (isActive ? navItemActive : navItem)}
            >
              Home
            </NavLink>
            <NavLink
              to="/connections"
              className={({ isActive }) => (isActive ? navItemActive : navItem)}
            >
              Connections
            </NavLink>
            <NavLink
              to="/failure-gallery"
              className={({ isActive }) => (isActive ? navItemActive : navItem)}
            >
              Failure gallery
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl p-6">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/connections" element={<ConnectionsListPage />} />
          <Route path="/connections/new" element={<NewConnectionPage />} />
          <Route path="/connections/:id" element={<ConnectionDetailPage />} />
          <Route path="/connections/:cid/patients" element={<PatientsPage />} />
          <Route
            path="/connections/:cid/patients/:pid"
            element={<PatientPage />}
          />
          <Route
            path="/connections/:cid/patients/:pid/:resourceType/:resourceId"
            element={<ResourcePage />}
          />
          <Route path="/sessions/:sid" element={<SessionPage />} />
          <Route
            path="/sessions/:sid/answer-preview"
            element={<AnswerPreviewPage />}
          />
          <Route path="/answer-preview" element={<AnswerPreviewPage />} />
          <Route path="/failure-gallery" element={<FailureGalleryPage />} />
        </Routes>
      </main>
    </div>
  );
}
