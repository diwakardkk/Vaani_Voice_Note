import { Info } from "lucide-react";

type Props = {
  message?: string | null;
  tone?: "info" | "warning" | "error";
};

export default function StatusBanner({ message, tone = "info" }: Props) {
  if (!message) return null;
  const classes = {
    info: "border-gray-200 bg-gray-50 text-gray-800",
    warning: "border-yellow-200 bg-yellow-50 text-yellow-900",
    error: "border-red-200 bg-red-50 text-red-900"
  };
  return (
    <div className={`flex items-start gap-2 border px-3 py-2 text-sm ${classes[tone]}`}>
      <Info size={17} className="mt-0.5 shrink-0" />
      <p>{message}</p>
    </div>
  );
}
