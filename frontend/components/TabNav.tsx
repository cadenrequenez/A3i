import clsx from "clsx";

type TabNavProps = {
  activeTab: string;
  tabs: string[];
  onChange: (tab: string) => void;
};

export default function TabNav({ activeTab, tabs, onChange }: TabNavProps) {
  return (
    <div className="flex gap-2 border-b border-slate-200 pb-2">
      {tabs.map((tab) => (
        <button
          key={tab}
          onClick={() => onChange(tab)}
          className={clsx(
            "rounded-full px-4 py-2 text-sm font-semibold",
            activeTab === tab
              ? "bg-slate-900 text-white"
              : "bg-white text-slate-700 border border-slate-200"
          )}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}
