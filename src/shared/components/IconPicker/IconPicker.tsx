import { useState, useMemo } from "react";
import { ICON_DATA, IconCategory } from "./iconData";
import "./IconPicker.css";

interface IconPickerProps {
  selectedIcon: string;
  onSelect: (iconName: string) => void;
}

export function IconPicker({ selectedIcon, onSelect }: IconPickerProps) {
  const [search, setSearch] = useState("");

  const categories: IconCategory[] = [
    "PRODUCTIVITY",
    "HEALTH & FITNESS",
    "TECH & DEV",
    "FINANCE",
    "HOME & LIFE",
    "MINDFULNESS",
    "CREATIVE & ART",
    "SOCIAL & COMMUNITY",
    "ACADEMIC & LEARNING",
    "NATURE & TRAVEL",
  ];

  const filteredIcons = useMemo(() => {
    if (!search) return ICON_DATA;
    const lower = search.toLowerCase();
    return ICON_DATA.filter((item) => 
      item.id.toLowerCase().includes(lower) || 
      item.tags.some(tag => tag.toLowerCase().includes(lower))
    );
  }, [search]);

  return (
    <div className="icon-picker">
      <input
        type="text"
        className="icon-picker__search t-data"
        placeholder="Search 300+ icons (e.g. 'gym', 'code', 'wallet')..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      
      <div className="icon-picker__scroll-area">
        <div className="icon-picker__grid">
          {search ? (
            // Flattened search results
            filteredIcons.length > 0 ? (
              <div className="icon-picker__category-grid">
                {filteredIcons.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`icon-picker__btn ${selectedIcon === item.id ? "icon-picker__btn--active" : ""}`}
                      onClick={() => onSelect(item.id)}
                      title={item.id}
                    >
                      <Icon size={20} strokeWidth={2.5} />
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="t-meta icon-picker__empty">No icons found for "{search}"</div>
            )
          ) : (
            // Categorized view
            categories.map(category => {
              const categoryIcons = ICON_DATA.filter(i => i.category === category);
              if (categoryIcons.length === 0) return null;
              
              return (
                <div key={category} className="icon-picker__category-container">
                  <div className="t-meta icon-picker__category-header">
                    [ {category} ]
                  </div>
                  <div className="icon-picker__category-grid">
                    {categoryIcons.map((item) => {
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className={`icon-picker__btn ${selectedIcon === item.id ? "icon-picker__btn--active" : ""}`}
                          onClick={() => onSelect(item.id)}
                          title={item.id}
                        >
                          <Icon size={20} strokeWidth={2.5} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

