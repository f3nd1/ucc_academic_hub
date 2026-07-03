import { Link } from 'react-router-dom';
import { TOOLS } from '../tools/registry';
import { Icon } from '../shared/Icon';

/**
 * Workspace home: a card per registered tool plus a placeholder "Add a tracker"
 * affordance. The grid is generated from TOOLS, so a newly registered tool
 * appears here (and in the sidebar) automatically.
 */
export function HomePage() {
  return (
    <div className="home">
      <header className="home__head">
        <h1>UCC Workspace</h1>
        <p>Self-contained trackers for planning and review. Pick one to start.</p>
      </header>

      <div className="tools-grid">
        {TOOLS.map((tool) => (
          <Link key={tool.id} to={tool.path} className="tool-card">
            <span className="tool-card__top">
              <span className="tool-card__icon">
                <Icon name={tool.icon} size={24} />
              </span>
              <span className={`chip chip--${tool.status}`}>{tool.status}</span>
            </span>
            <span className="tool-card__name">{tool.name}</span>
            <span className="tool-card__desc">{tool.description}</span>
          </Link>
        ))}

        {/* Non-functional placeholder for the next tracker (see registry.ts). */}
        <div
          className="tool-card tool-card--add"
          role="note"
          aria-disabled="true"
        >
          <span className="tool-card__icon tool-card__icon--ghost">
            <Icon name="plus" size={24} />
          </span>
          <span className="tool-card__name">Add a tracker</span>
          <span className="tool-card__desc">
            More workspace tools are on the way.
          </span>
        </div>
      </div>
    </div>
  );
}
