import type { LucideIcon } from "lucide-react";
import { Plus, Search } from "lucide-react";
export function ModulePage({
  title,
  description,
  icon: Icon,
  items = [],
  action,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  items?: Array<{ title: string; meta: string; status?: string }>;
  action?: string;
}) {
  return (
    <div className="page-stack">
      <section className="page-intro">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        {action && (
          <button className="primary compact">
            <Plus /> {action}
          </button>
        )}
      </section>
      <div className="search">
        <Search />
        <input
          aria-label={`${title} durchsuchen`}
          placeholder="Suchen und filtern …"
        />
      </div>
      {items.length ? (
        <div className="list">
          {items.map((item, i) => (
            <article className="list-card" key={i}>
              <div className="module-icon">
                <Icon />
              </div>
              <div>
                <h3>{item.title}</h3>
                <p>{item.meta}</p>
              </div>
              {item.status && (
                <span className="status info">{item.status}</span>
              )}
            </article>
          ))}
        </div>
      ) : (
        <section className="empty">
          <div className="empty-icon">
            <Icon />
          </div>
          <h3>Noch keine Einträge</h3>
          <p>Hier erscheinen die für Sie freigegebenen Inhalte.</p>
        </section>
      )}
    </div>
  );
}
