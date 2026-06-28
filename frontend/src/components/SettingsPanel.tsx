import { QRCodeSVG } from "qrcode.react";
import { KeyRound, ShieldAlert, X } from "lucide-react";
import { useEffect, useState } from "react";
import { api, type Settings } from "../services/api";

type Props = {
  open: boolean;
  onClose: () => void;
  onStatus: (message: string, tone?: "info" | "warning" | "error") => void;
  onSettingsSaved?: (settings: Settings) => void;
  highlightApiKey?: boolean;
};

export default function SettingsPanel({ open, onClose, onStatus, onSettingsSaved, highlightApiKey = false }: Props) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [apiKey, setApiKey] = useState("");

  useEffect(() => {
    if (!open) return;
    api.getSettings().then(setSettings).catch((error) => onStatus(error.message, "error"));
  }, [open, onStatus]);

  if (!open) return null;

  async function save(partial: Parameters<typeof api.updateSettings>[0]) {
    try {
      const updated = await api.updateSettings(partial);
      setSettings(updated);
      setApiKey("");
      onSettingsSaved?.(updated);
      onStatus("Settings saved.");
    } catch (error) {
      onStatus(error instanceof Error ? error.message : "Settings could not be saved", "error");
    }
  }

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full max-w-md border-l border-gray-200 bg-white shadow-xl">
      <div className="flex items-center justify-between border-b border-gray-200 p-5">
        <h2 className="text-lg font-semibold">Settings</h2>
        <button className="icon-btn" onClick={onClose} title="Close settings">
          <X size={18} />
        </button>
      </div>
      <div className="space-y-6 overflow-y-auto p-5">
        <div className="border border-yellow-200 bg-yellow-50 p-3 text-sm leading-6 text-yellow-950">
          <div className="mb-1 flex items-center gap-2 font-semibold">
            <ShieldAlert size={17} />
            Local network warning
          </div>
          This app is designed for private local network use only. Do not run it on public Wi-Fi or expose it to the internet.
        </div>

        <section className={highlightApiKey && !settings?.openai_api_key_set ? "settings-highlight" : ""}>
          <h3 className="mb-2 text-sm font-semibold">OpenAI API key</h3>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <KeyRound size={16} />
            {settings?.openai_api_key_set ? "API key is saved locally." : "No API key saved."}
          </div>
          <input
            className="input mt-3"
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="sk-..."
          />
          <button className="btn-primary mt-2" onClick={() => void save({ openai_api_key: apiKey })} disabled={!apiKey.trim()}>
            Save key locally
          </button>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Local access</h3>
          <div className="setting-row">
            <span>Local URL</span>
            <code>{settings?.local_url}</code>
          </div>
          <div className="setting-row">
            <span>LAN URL</span>
            <code>{settings?.network_url}</code>
          </div>
          <div className="setting-row">
            <span>HTTPS LAN URL</span>
            <code>{settings?.https_network_url}</code>
          </div>
          {settings?.network_url && (
            <div className="inline-block border border-gray-200 p-3">
              <QRCodeSVG value={settings.https_network_url || settings.network_url} size={128} />
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Privacy</h3>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>Delete audio after transcription</span>
            <input
              type="checkbox"
              checked={settings?.delete_audio_after_transcription ?? false}
              onChange={(event) => void save({ delete_audio_after_transcription: event.target.checked })}
            />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>Allow LAN access</span>
            <input
              type="checkbox"
              checked={settings?.allow_lan_access ?? true}
              onChange={(event) => void save({ allow_lan_access: event.target.checked })}
            />
          </label>
          <div className="setting-row">
            <span>Storage</span>
            <code>{settings?.storage_path}</code>
          </div>
        </section>
      </div>
    </div>
  );
}
