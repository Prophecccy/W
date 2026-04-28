import { useState, useEffect } from "react";
import { HabitGroup } from "../../types";
import { getGroups, createGroup, updateGroup, deleteGroup, reorderGroups } from "../../services/groupService";
import { LucideIcon } from "../../../../shared/components/IconPicker/LucideIcon";
import { useToast } from "../../../../shared/components/Toast/Toast";
import "./GroupManager.css";

interface GroupManagerProps {
  onClose?: () => void;
}

export function GroupManager({ onClose }: GroupManagerProps) {
  const [groups, setGroups] = useState<HabitGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const { showToast } = useToast();

  useEffect(() => {
    loadGroups();
  }, []);

  async function loadGroups() {
    setLoading(true);
    try {
      const data = await getGroups();
      setGroups(data);
    } catch (err) {
      console.error(err);
      showToast("[ FAILED TO LOAD GROUPS ]");
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      const g = await createGroup(newName.trim(), groups.length);
      setGroups([...groups, g]);
      setNewName("");
      showToast("[ GROUP CREATED ]");
    } catch (err) {
      console.error(err);
      showToast("[ FAILED TO CREATE GROUP ]");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this group? Habits within it will become ungrouped.")) return;
    try {
      await deleteGroup(id);
      setGroups(groups.filter((g) => g.id !== id));
      showToast("[ GROUP DELETED ]");
    } catch (err) {
      console.error(err);
      showToast("[ FAILED TO DELETE GROUP ]");
    }
  }

  async function saveEdit() {
    if (!editingId || !editName.trim()) {
      setEditingId(null);
      return;
    }
    try {
      await updateGroup(editingId, editName.trim());
      setGroups(groups.map((g) => (g.id === editingId ? { ...g, name: editName.trim() } : g)));
      setEditingId(null);
      showToast("[ GROUP RENAMED ]");
    } catch (err) {
      console.error(err);
      showToast("[ FAILED TO RENAME GROUP ]");
    }
  }

  async function handleMove(index: number, direction: -1 | 1) {
    if (index + direction < 0 || index + direction >= groups.length) return;
    
    const newGroups = [...groups];
    const temp = newGroups[index];
    newGroups[index] = newGroups[index + direction];
    newGroups[index + direction] = temp;
    
    // update order props
    newGroups.forEach((g, i) => g.order = i);
    setGroups(newGroups);

    try {
      await reorderGroups(newGroups);
    } catch (err) {
      console.error(err);
      showToast("[ FAILED TO REORDER ]");
      loadGroups(); // revert
    }
  }

  if (loading) return <div className="t-meta">LOADING GROUPS...</div>;

  return (
    <div className="group-manager">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 className="t-h2">[ GROUP MANAGER ]</h2>
        {onClose && (
          <button className="t-label" onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}>
            [ CLOSE ]
          </button>
        )}
      </div>
      <p className="t-body" style={{ color: "var(--text-muted)", marginBottom: 24, marginTop: 4 }}>
        Organize your habits into dashboard sections.
      </p>

      <form onSubmit={handleAdd} className="group-manager__add">
        <input
          type="text"
          className="group-manager__input t-body"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="NEW GROUP NAME..."
        />
        <button type="submit" className="group-manager__btn t-label" disabled={!newName.trim()}>
          [ ADD ]
        </button>
      </form>

      <div className="group-manager__list">
        {groups.map((g, index) => (
          <div key={g.id} className="group-manager__item">
            {editingId === g.id ? (
              <input
                type="text"
                autoFocus
                className="group-manager__input t-body"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={saveEdit}
                onKeyDown={(e) => e.key === "Enter" && saveEdit()}
              />
            ) : (
              <span className="t-body">{g.name}</span>
            )}
            
            {editingId !== g.id && (
              <div className="group-manager__actions">
                <button onClick={() => { setEditingId(g.id); setEditName(g.name); }} title="Rename">
                  <LucideIcon name="Edit2" size={16} />
                </button>
                <button onClick={() => handleMove(index, -1)} disabled={index === 0} title="Move Up">
                  <LucideIcon name="ArrowUp" size={16} />
                </button>
                <button onClick={() => handleMove(index, 1)} disabled={index === groups.length - 1} title="Move Down">
                  <LucideIcon name="ArrowDown" size={16} />
                </button>
                <button onClick={() => handleDelete(g.id)} style={{ color: "var(--strike-red)" }} title="Delete">
                  <LucideIcon name="Trash2" size={16} />
                </button>
              </div>
            )}
          </div>
        ))}
        {groups.length === 0 && (
          <div className="t-meta" style={{ textAlign: "center", padding: 24, opacity: 0.5 }}>
            NO GROUPS CREATED YET
          </div>
        )}
      </div>
    </div>
  );
}
