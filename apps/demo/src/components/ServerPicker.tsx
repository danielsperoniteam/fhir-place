import type { ChangeEvent } from "react";
import { Link } from "react-router-dom";
import {
  ACTIVE_SERVER_CONFIG,
  loadServers,
  saveActiveServerId,
} from "../config.js";

/**
 * Header dropdown that lets visitors switch between configured FHIR servers.
 * The list is loaded from `loadServers()` (built-ins + custom from
 * localStorage). Switching saves the active id and reloads the page so the
 * singleton `FetchFhirClient` in `main.tsx` rebuilds with the new base URL
 * and headers.
 */
export function ServerPicker() {
  const servers = loadServers();
  const activeId = ACTIVE_SERVER_CONFIG.id;

  const onChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const next = event.target.value;
    if (next === activeId) return;
    saveActiveServerId(next);
    window.location.reload();
  };

  return (
    <div
      className="flex items-center gap-2 text-xs text-slate-500"
      data-testid="base-url"
    >
      <select
        value={activeId}
        onChange={onChange}
        className="max-w-[12rem] truncate rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
        data-testid="server-picker"
        aria-label="FHIR server"
      >
        {servers.map((server) => (
          <option key={server.id} value={server.id}>
            {server.label}
          </option>
        ))}
      </select>
      <Link
        to="/fhir-ui/settings"
        className="text-slate-600 underline hover:text-slate-900"
        data-testid="settings-link"
      >
        Settings
      </Link>
    </div>
  );
}
