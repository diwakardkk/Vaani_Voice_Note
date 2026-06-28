import { Search } from "lucide-react";

type Props = {
  value: string;
  onChange: (value: string) => void;
};

export default function SearchBar({ value, onChange }: Props) {
  return (
    <label className="relative block">
      <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={17} />
      <input
        className="input pl-9"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search notes"
      />
    </label>
  );
}
