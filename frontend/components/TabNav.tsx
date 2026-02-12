import clsx from "clsx";

type TabNavProps = {
  activeTab: string;
  tabs: string[];
  onChange: (tab: string) => void;
};

export default function TabNav({ activeTab, tabs, onChange }: TabNavProps) {
  return (
    <div className="surface-card flex flex-wrap gap-2 rounded-2xl p-3">
      {tabs.map((tab) => (
        <button
          key={tab}
          onClick={() => onChange(tab)}
          className={clsx(
            "rounded-full px-4 py-2 text-sm font-semibold transition",
            activeTab === tab
              ? "bg-sky-900 text-white shadow-lg shadow-sky-900/25"
              : "border border-slate-200 bg-white/70 text-slate-700 hover:bg-white"
          )}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}
