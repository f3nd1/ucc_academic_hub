import { Suspense } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { USER_TOOLS, SYSTEM_TOOLS, type ToolDef } from '../tools/registry';
import { Icon } from '../shared/Icon';
import { useHelp } from '../shared/help/helpStore';
import { useSidebar } from '../shared/sidebarStore';
import { Tour } from '../shared/help/Tour';

/**
 * One sidebar nav item for a registered tool (status badge = beta only).
 * The label is always rendered — collapsing the rail hides it purely via CSS
 * (`.sidebar--collapsed`), so the same markup works whether the sidebar is
 * expanded, collapsed to an icon rail, or forced back to labelled on the
 * mobile layout where collapsing doesn't apply.
 */
function ToolLink({ tool }: { tool: ToolDef }) {
  return (
    <NavLink to={tool.path} className="sidebar__link" title={tool.name}>
      <Icon name={tool.icon} />
      <span>{tool.name}</span>
      {tool.status === 'beta' && <span className="chip chip--beta">beta</span>}
    </NavLink>
  );
}

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
 *
 * The sidebar can collapse to an icon-only rail (burger toggle in the
 * topbar), state persisted via SidebarProvider under
 * "ucc:workspace:sidebarCollapsed" so it survives reloads. Collapsing is a
 * CSS-only transform — every label still renders — so it can never desync
 * from what the mobile breakpoint needs visible.
 */
export function AppLayout() {
  const [collapsed, setCollapsed] = useSidebar();

  return (
    <div className={`workspace${collapsed ? ' workspace--sidebar-collapsed' : ''}`}>
      <aside className={`sidebar${collapsed ? ' sidebar--collapsed' : ''}`}>
        <div className="sidebar__topbar">
          <NavLink to="/" end className="sidebar__brand">
            <Icon name="layout-grid" size={22} />
            <span>UCC Workspace</span>
          </NavLink>
          <img
            src={`${import.meta.env.BASE_URL}ucc-logo.png`}
            alt="United Ceres College"
            className="sidebar__logo"
          />
          <button
            type="button"
            className="icon-toggle-btn"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={() => setCollapsed(!collapsed)}
          >
            <Icon name="menu-2" size={20} />
          </button>
        </div>

        <nav className="sidebar__nav">
          <NavLink to="/" end className="sidebar__link" title="Home">
            <Icon name="layout-grid" />
            <span>Home</span>
          </NavLink>

          {/* Trackers — the day-to-day tools. */}
          <p className="sidebar__group">Tools</p>
          {USER_TOOLS.map((tool) => (
            <ToolLink key={tool.id} tool={tool} />
          ))}

          {/* Things you produce and reuse across tools. */}
          <p className="sidebar__group">Workspace</p>
          <NavLink to="/saved" className="sidebar__link" title="My Saved Items">
            <Icon name="folder" />
            <span>My Saved Items</span>
          </NavLink>

          {/* Monitoring / admin / meta — not day-to-day tools. */}
          <p className="sidebar__group">System</p>
          <NavLink to="/ai-log" className="sidebar__link" title="AI Log">
            <Icon name="sparkles" />
            <span>AI Log</span>
          </NavLink>
          {SYSTEM_TOOLS.map((tool) => (
            <ToolLink key={tool.id} tool={tool} />
          ))}
          <NavLink
            to="/settings"
            className="sidebar__link"
            title="Settings"
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
