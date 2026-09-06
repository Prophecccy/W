import { useState, useMemo, useRef } from "react";
import {
  Search,
  X,
  BookOpen,
  Terminal,
  Target,
  Clock,
  AlertTriangle,
  BatteryCharging,
  CheckSquare,
  Monitor,
  Shield,
  Keyboard,
  ChevronRight,
  Info,
  CheckCircle2,
  AlertOctagon,
  Sparkles,
} from "lucide-react";
import { MANUAL_CHAPTERS, ManualChapter } from "../data/manualContent";
import "./ManualPage.css";

const ICON_MAP: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  Terminal,
  Target,
  Clock,
  AlertTriangle,
  BatteryCharging,
  CheckSquare,
  Monitor,
  BookOpen,
  Shield,
  Keyboard,
};

export function ManualPage() {
  const [activeChapterId, setActiveChapterId] = useState<string>("system-basics");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const contentContainerRef = useRef<HTMLDivElement>(null);

  // Filtered chapters & sections based on search query
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return null;

    const matchedChapters: { chapter: ManualChapter; matchedSectionIds: Set<string> }[] = [];

    MANUAL_CHAPTERS.forEach((chapter) => {
      const chapterTitleMatch = chapter.title.toLowerCase().includes(q) || chapter.summary.toLowerCase().includes(q);
      const keywordMatch = chapter.keywords.some(k => k.toLowerCase().includes(q));
      const matchedSectionIds = new Set<string>();

      chapter.sections.forEach((sec) => {
        const titleMatch = sec.title.toLowerCase().includes(q);
        const contentMatch = sec.content.some(p => p.toLowerCase().includes(q));
        const calloutMatch = sec.callouts?.some(c => c.title.toLowerCase().includes(q) || c.text.toLowerCase().includes(q));
        const subMatch = sec.subsections?.some(s => s.title.toLowerCase().includes(q) || s.description.toLowerCase().includes(q));

        if (titleMatch || contentMatch || calloutMatch || subMatch) {
          matchedSectionIds.add(sec.id);
        }
      });

      if (chapterTitleMatch || keywordMatch || matchedSectionIds.size > 0) {
        matchedChapters.push({ chapter, matchedSectionIds });
      }
    });

    return matchedChapters;
  }, [searchQuery]);

  const activeChapter = useMemo(() => {
    return MANUAL_CHAPTERS.find(c => c.id === activeChapterId) || MANUAL_CHAPTERS[0];
  }, [activeChapterId]);

  const handleSelectChapter = (chapterId: string, sectionId?: string) => {
    setActiveChapterId(chapterId);
    if (sectionId) {
      setTimeout(() => {
        const el = document.getElementById(`section-${sectionId}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 50);
    } else {
      if (contentContainerRef.current) {
        contentContainerRef.current.scrollTop = 0;
      }
    }
  };

  const handleClearSearch = () => {
    setSearchQuery("");
  };

  return (
    <div className="manual-page">
      {/* Left Sidebar: Chapters & Search */}
      <aside className="manual-page__sidebar">
        <div className="manual-page__search-container">
          <div className="manual-page__search-bar">
            <Search size={14} className="manual-page__search-icon" />
            <input
              type="text"
              className="manual-page__search-input t-meta"
              placeholder="SEARCH TOPICS OR SHORTCUTS..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className="manual-page__search-clear" onClick={handleClearSearch} title="Clear search">
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        <nav className="manual-page__nav">
          {searchResults ? (
            <div className="manual-page__search-results">
              <div className="manual-page__nav-header t-meta">
                [ SEARCH RESULTS: {searchResults.length} ]
              </div>
              {searchResults.length === 0 ? (
                <div className="manual-page__empty-search t-meta">
                  NO MATCHING INSTRUCTIONS FOUND.
                </div>
              ) : (
                searchResults.map(({ chapter, matchedSectionIds }) => {
                  const Icon = ICON_MAP[chapter.iconName] || BookOpen;
                  const isActive = chapter.id === activeChapterId;
                  return (
                    <div key={chapter.id} className="manual-page__result-group">
                      <button
                        className={`manual-page__chapter-btn ${isActive ? "manual-page__chapter-btn--active" : ""}`}
                        onClick={() => handleSelectChapter(chapter.id)}
                      >
                        <span className="manual-page__chapter-num t-meta">[{chapter.number}]</span>
                        <Icon size={14} className="manual-page__chapter-icon" />
                        <span className="manual-page__chapter-title t-body">{chapter.shortTitle}</span>
                      </button>

                      {matchedSectionIds.size > 0 && (
                        <div className="manual-page__matched-subsections">
                          {chapter.sections
                            .filter(s => matchedSectionIds.has(s.id))
                            .map(s => (
                              <button
                                key={s.id}
                                className="manual-page__matched-sub-btn t-meta"
                                onClick={() => handleSelectChapter(chapter.id, s.id)}
                              >
                                <ChevronRight size={10} />
                                <span>{s.title}</span>
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            <div className="manual-page__chapters-list">
              <div className="manual-page__nav-header t-meta">
                [ FIELD MANUAL MODULES ]
              </div>
              {MANUAL_CHAPTERS.map((chapter) => {
                const Icon = ICON_MAP[chapter.iconName] || BookOpen;
                const isActive = chapter.id === activeChapterId;
                return (
                  <button
                    key={chapter.id}
                    className={`manual-page__chapter-btn ${isActive ? "manual-page__chapter-btn--active" : ""}`}
                    onClick={() => handleSelectChapter(chapter.id)}
                  >
                    <span className="manual-page__chapter-num t-meta">[{chapter.number}]</span>
                    <Icon size={14} className="manual-page__chapter-icon" />
                    <span className="manual-page__chapter-title t-body">{chapter.shortTitle}</span>
                  </button>
                );
              })}
            </div>
          )}
        </nav>
      </aside>

      {/* Right Content Area: Detailed Chapter Guide */}
      <main className="manual-page__content" ref={contentContainerRef}>
        <div className="manual-page__article">
          {/* Chapter Header Banner */}
          <header className="manual-page__article-header">
            <div className="manual-page__article-meta t-meta">
              <span className="manual-page__badge">CHAPTER [{activeChapter.number}]</span>
              <span className="manual-page__separator">/</span>
              <span>TACTICAL DOCUMENTATION</span>
            </div>
            <h1 className="manual-page__article-title t-display">
              {activeChapter.title}
            </h1>
            <p className="manual-page__article-summary t-body">
              {activeChapter.summary}
            </p>

            {/* Quick-Jump Section Anchor Pills */}
            <div className="manual-page__jump-pills">
              <span className="manual-page__jump-label t-meta">SECTIONS:</span>
              {activeChapter.sections.map((sec) => (
                <button
                  key={sec.id}
                  className="manual-page__jump-pill t-meta"
                  onClick={() => {
                    const el = document.getElementById(`section-${sec.id}`);
                    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                >
                  {sec.title}
                </button>
              ))}
            </div>
          </header>

          <div className="manual-page__divider" />

          {/* Chapter Sections */}
          <div className="manual-page__sections">
            {activeChapter.sections.map((section) => (
              <section key={section.id} id={`section-${section.id}`} className="manual-section">
                <div className="manual-section__header">
                  {section.tag && (
                    <span className="manual-section__tag t-meta">
                      [ {section.tag} ]
                    </span>
                  )}
                  <h2 className="manual-section__title t-display">
                    {section.title}
                  </h2>
                </div>

                {/* Section Paragraphs */}
                <div className="manual-section__body">
                  {section.content.map((p, idx) => (
                    <p key={idx} className="manual-section__paragraph t-body">
                      {p}
                    </p>
                  ))}
                </div>

                {/* Subsections if available */}
                {section.subsections && (
                  <div className="manual-section__subsections">
                    {section.subsections.map((sub, sIdx) => (
                      <div key={sIdx} className="manual-subsection">
                        <h3 className="manual-subsection__title t-body">
                          {sub.title}
                        </h3>
                        <p className="manual-subsection__desc t-body">
                          {sub.description}
                        </p>
                        {sub.bulletPoints && (
                          <ul className="manual-subsection__bullets">
                            {sub.bulletPoints.map((bp, bIdx) => (
                              <li key={bIdx} className="manual-subsection__bullet t-body">
                                <span className="manual-subsection__bullet-dot">›</span>
                                <span>{bp}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Callout Boxes */}
                {section.callouts && (
                  <div className="manual-section__callouts">
                    {section.callouts.map((c, cIdx) => {
                      const calloutClass = `manual-callout manual-callout--${c.type}`;
                      return (
                        <div key={cIdx} className={calloutClass}>
                          <div className="manual-callout__header">
                            {c.type === "info" && <Info size={14} />}
                            {c.type === "tip" && <Sparkles size={14} />}
                            {c.type === "warning" && <AlertTriangle size={14} />}
                            {c.type === "rule" && <AlertOctagon size={14} />}
                            <span className="manual-callout__title t-meta">[ {c.title} ]</span>
                          </div>
                          <div className="manual-callout__text t-body">
                            {c.text.split("\n").map((line, lIdx) => (
                              <p key={lIdx}>{line}</p>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            ))}
          </div>

          {/* Footer Navigation */}
          <footer className="manual-page__footer">
            <div className="manual-page__footer-card">
              <CheckCircle2 size={16} className="manual-page__footer-icon" />
              <div className="manual-page__footer-content">
                <span className="manual-page__footer-title t-body">NEED FAST HELP WHILE WORKING?</span>
                <p className="manual-page__footer-desc t-meta">
                  Press <kbd className="manual-kbd">Ctrl</kbd> + <kbd className="manual-kbd">/</kbd> from anywhere in the app to return to this Field Manual, or press <kbd className="manual-kbd">Ctrl</kbd> + <kbd className="manual-kbd">K</kbd> to search commands.
                </p>
              </div>
            </div>
          </footer>
        </div>
      </main>
    </div>
  );
}
