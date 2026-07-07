import { Suspense } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { TOOLS } from '../tools/registry';
import { Icon } from '../shared/Icon';
import { useHelp } from '../shared/help/helpStore';
import { Tour } from '../shared/help/Tour';

/** Workspace-wide help controls: master toggle + restart tour. */
function HelpControls() {
  const { helpEnabled, setHelpEnabled, startTour } = useHelp();
  return (
    <div className="sidebar__help">
      <button
        type="button"
        className="nav__helpbtn"
        aria-pressed={helpEnabled}
        onClick={() => setHelpEnabled(!helpEnabled)}
      >
        Help: {helpEnabled ? 'On' : 'Off'}
      </button>
      {helpEnabled && (
        <button type="button" className="linkbtn" onClick={startTour}>
          Restart tour
        </button>
      )}
    </div>
  );
}

/**
 * Persistent workspace shell: a sidebar (brand, one nav item per registered
 * tool, plus Settings) that stays mounted while the routed content swaps
 * through <Outlet>. Because the layout is a parent route, moving between tools
 * never remounts the sidebar.
 */
export function AppLayout() {
  return (
    <div className="workspace">
      <aside className="sidebar">
        <NavLink to="/" end className="sidebar__brand">
          <Icon name="layout-grid" size={22} />
          <span>UCC Workspace</span>
        </NavLink>

        <nav className="sidebar__nav">
          <NavLink to="/" end className="sidebar__link">
            <Icon name="layout-grid" />
            <span>Home</span>
          </NavLink>

          {TOOLS.map((tool) => (
            <NavLink key={tool.id} to={tool.path} className="sidebar__link">
              <Icon name={tool.icon} />
              <span>{tool.name}</span>
              {/* Only "beta" is surfaced in the sidebar; "new" badges were
                  removed once the tools became established. */}
              {tool.status === 'beta' && (
                <span className="chip chip--beta">beta</span>
              )}
            </NavLink>
          ))}

          <NavLink to="/saved" className="sidebar__link">
            <Icon name="folder" />
            <span>My Saved Items</span>
          </NavLink>

          <NavLink to="/ai-log" className="sidebar__link">
            <Icon name="sparkles" />
            <span>AI Log</span>
          </NavLink>

          <NavLink
            to="/settings"
            className="sidebar__link"
            data-tour="settings-link"
          >
            <Icon name="settings" />
            <span>Settings</span>
          </NavLink>
        </nav>

        <div className="sidebar__foot">
          <HelpControls />
        </div>
      </aside>

      <main className="workspace__main">
        <Suspense
          fallback={<p className="empty">Loading…</p>}
        >
          <Outlet />
        </Suspense>
      </main>

      <Tour />
    </div>
  );
}
