import { CSS } from "@dnd-kit/utilities";
import { useSortable } from "@dnd-kit/sortable";

type SortableShiftProps = {
  id: string;
  title: string;
  subtitle: string;
  disabled?: boolean;
};

export default function SortableShift({ id, title, subtitle, disabled }: SortableShiftProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-lg border bg-white p-3 text-sm ${isDragging ? "opacity-60" : "opacity-100"}`}
      {...attributes}
      {...listeners}
    >
      <p className="font-semibold">{title}</p>
      <p className="text-xs text-slate-600">{subtitle}</p>
      {disabled && <p className="mt-1 text-xs text-slate-400">Read-only</p>}
    </div>
  );
}
