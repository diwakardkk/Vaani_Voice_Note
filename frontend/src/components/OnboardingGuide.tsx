import { KeyRound, Settings, ShieldCheck } from "lucide-react";

type Props = {
  open: boolean;
  onOpenSettings: () => void;
  onDismiss: () => void;
};

export default function OnboardingGuide({ open, onOpenSettings, onDismiss }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-30 bg-black/25">
      <div className="absolute left-[232px] top-5 hidden items-center gap-3 md:flex">
        <div className="h-px w-20 bg-white" />
        <div className="rounded border border-white bg-white px-3 py-2 text-sm font-semibold text-black shadow">
          Settings
        </div>
      </div>

      <div className="absolute left-4 right-4 top-24 max-w-xl rounded border border-gray-300 bg-white p-5 shadow-xl md:left-[330px] md:right-auto">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-gray-300">
            <KeyRound size={20} />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Add your OpenAI API key</h2>
            <p className="mt-1 text-sm leading-6 text-gray-700">
              VaaniNotes works locally without login. AI transcription, decoration, and summaries need your own API key.
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="onboarding-step">
            <span className="step-number">1</span>
            <Settings size={18} />
            <p>Open Settings from the sidebar.</p>
          </div>
          <div className="onboarding-step">
            <span className="step-number">2</span>
            <KeyRound size={18} />
            <p>Paste your OpenAI API key.</p>
          </div>
          <div className="onboarding-step">
            <span className="step-number">3</span>
            <ShieldCheck size={18} />
            <p>Save it locally on this computer.</p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button className="btn-primary" onClick={onOpenSettings}>
            <Settings size={17} />
            Open Settings
          </button>
          <button className="btn-secondary" onClick={onDismiss}>
            Later
          </button>
          <span className="text-xs text-gray-600">Your key is stored locally, not committed to the project.</span>
        </div>
      </div>
    </div>
  );
}
