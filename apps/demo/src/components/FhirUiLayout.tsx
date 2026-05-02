import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  RESOURCE_LIST_CONFIG,
  TOP_RESOURCE_TYPES,
} from "../resourceListConfig.js";

/**
 * Layout shared by the FHIR UI list pages: sidebar of the top resource types
 * on the left, route content on the right. Sidebar links preserve the current
 * `?patient=<id>` so a user can flip between resource types while keeping the
 * compartment scope.
 */
export function FhirUiLayout() {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  const patientId = params.get("patient");
  const linkSuffix = patientId ? `?patient=${patientId}` : "";

  return (
    <div className="flex flex-col gap-6 md:flex-row">
      <aside
        aria-label="Resource types"
        data-testid="fhir-ui-sidebar"
        className="md:w-48 md:shrink-0"
      >
        <nav className="flex gap-1 overflow-x-auto md:flex-col md:gap-0.5">
          {TOP_RESOURCE_TYPES.map((rt) => (
            <NavLink
              key={rt}
              to={`/fhir-ui/${rt}${linkSuffix}`}
              end
              data-testid={`sidebar-link-${rt}`}
              className={({ isActive }) =>
                `whitespace-nowrap rounded px-3 py-1.5 text-sm ${
                  isActive
                    ? "bg-slate-100 font-medium text-slate-900"
                    : "text-slate-700 hover:bg-slate-50"
                }`
              }
            >
              {RESOURCE_LIST_CONFIG[rt].title}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}
