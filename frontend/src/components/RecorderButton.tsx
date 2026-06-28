import { Pause, Play, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, type Note } from "../services/api";
import { formatTimer, supportedAudioMimeType } from "../services/recorder";
import { createSpeechRecognition, type SpeechRecognitionLike } from "../services/voiceCommands";

type Props = {
  note: Note | null;
  onCreateNote: () => Promise<Note>;
  onNoteUpdated: (note: Note) => void;
  onLiveTranscript: (noteId: number, transcript: string) => void;
  onWakeCommand: (command: string) => void;
  onStatus: (message: string, tone?: "info" | "warning" | "error") => void;
};

type MicState = "unknown" | "checking" | "prompt" | "ready" | "blocked" | "unsupported" | "insecure";

export default function RecorderButton({ note, onCreateNote, onNoteUpdated, onLiveTranscript, onWakeCommand, onStatus }: Props) {
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [micState, setMicState] = useState<MicState>("unknown");
  const [micLabel, setMicLabel] = useState("");
  const [commandMode, setCommandMode] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef<string | null>(null);
  const noteIdRef = useRef<number | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finalTranscriptRef = useRef("");
  const awaitingWakeCommandRef = useRef(false);
  const recordingRef = useRef(false);
  const pausedRef = useRef(false);

  useEffect(() => {
    if (!recording || paused) return;
    const id = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(id);
  }, [recording, paused]);

  useEffect(() => {
    void checkMicrophonePermission();
    navigator.mediaDevices?.addEventListener?.("devicechange", handleDeviceChange);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", handleDeviceChange);
  }, []);

  function audioConstraints(): MediaTrackConstraints {
    return {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    };
  }

  async function handleDeviceChange() {
    await refreshActiveMicrophoneLabel();
  }

  async function refreshActiveMicrophoneLabel() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const input = devices.find((device) => device.kind === "audioinput" && device.deviceId === "default")
        || devices.find((device) => device.kind === "audioinput");
      setMicLabel(input?.label || "System default microphone");
    } catch {
      setMicLabel("System default microphone");
    }
  }

  async function checkMicrophonePermission() {
    if (!window.isSecureContext) {
      setMicState("insecure");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicState("unsupported");
      return;
    }
    try {
      if (navigator.permissions?.query) {
        const permission = await navigator.permissions.query({ name: "microphone" as PermissionName });
        if (permission.state === "granted") {
          await preflightMicrophone(false);
        } else if (permission.state === "denied") {
          setMicState("blocked");
        } else {
          setMicState("prompt");
        }
        permission.onchange = () => void checkMicrophonePermission();
      } else {
        setMicState("unknown");
      }
    } catch {
      setMicState("unknown");
    }
  }

  async function preflightMicrophone(promptUser = true) {
    if (!window.isSecureContext) {
      setMicState("insecure");
      if (promptUser) onStatus("Microphone access on Wi-Fi needs HTTPS. Open the HTTPS LAN URL, then allow mic.", "warning");
      return false;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicState("unsupported");
      return false;
    }
    try {
      setMicState("checking");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints() });
      const trackLabel = stream.getAudioTracks()[0]?.label;
      stream.getTracks().forEach((track) => track.stop());
      setMicState("ready");
      setMicLabel(trackLabel || "System default microphone");
      await refreshActiveMicrophoneLabel();
      if (promptUser) onStatus("Microphone is ready. Future recordings will connect faster.");
      return true;
    } catch {
      setMicState("blocked");
      if (promptUser) onStatus("Microphone permission was not allowed. Please allow it in the browser.", "error");
      return false;
    }
  }

  async function getMicStream() {
    if (!window.isSecureContext) {
      setMicState("insecure");
      throw new Error("Microphone requires HTTPS on Wi-Fi/LAN. Open the HTTPS local network URL, not HTTP.");
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicState("unsupported");
      throw new Error("Microphone recording is not supported in this browser.");
    }
    setMicState("checking");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints() });
    setMicState("ready");
    setMicLabel(stream.getAudioTracks()[0]?.label || "System default microphone");
    return stream;
  }

  async function start() {
    try {
      const current = note ?? (await onCreateNote());
      noteIdRef.current = current.id;
      finalTranscriptRef.current = "";
      awaitingWakeCommandRef.current = false;
      setCommandMode(false);
      setLiveTranscript("");
      const stream = await getMicStream();
      streamRef.current = stream;
      const mimeType = supportedAudioMimeType();
      const session = await api.startAudio(current.id, mimeType || undefined);
      sessionRef.current = session.session_id;
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorder.ondataavailable = async (event) => {
        if (event.data.size > 0 && sessionRef.current) {
          try {
            await api.uploadChunk(sessionRef.current, event.data);
          } catch (error) {
            onStatus(error instanceof Error ? error.message : "Audio save failed", "error");
          }
        }
      };
      recorder.start(3000);
      recorderRef.current = recorder;
      recordingRef.current = true;
      pausedRef.current = false;
      setRecording(true);
      setPaused(false);
      setSeconds(0);
      onNoteUpdated({ ...current, status: "recording" });
      startLiveTranscript(current.id);
      onStatus("Recording started. Audio chunks are being saved locally.");
    } catch (error) {
      onStatus(error instanceof Error ? error.message : "Microphone permission failed", "error");
    }
  }

  function startLiveTranscript(noteId: number) {
    const recognition = createSpeechRecognition({ continuous: true, interimResults: true });
    if (!recognition) {
      onStatus("Live typing is not supported in this browser. Audio recording still works.", "warning");
      return;
    }
    recognition.onresult = (event) => {
      let interim = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const phrase = event.results[index][0].transcript;
        if (event.results[index].isFinal) {
          handleFinalSpeechPhrase(noteId, phrase);
        } else {
          interim = `${interim} ${phrase}`.trim();
        }
      }
      const transcript = `${finalTranscriptRef.current} ${interim}`.trim();
      setLiveTranscript(transcript);
      if (transcript) onLiveTranscript(noteId, transcript);
    };
    recognition.onerror = () => {
      onStatus("Live typing stopped. The final OpenAI transcript will still run after recording.", "warning");
    };
    recognition.onend = () => {
      if (recordingRef.current && !pausedRef.current) {
        try {
          recognition.start();
        } catch {
          // Browsers throw if recognition is already active.
        }
      }
    };
    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      onStatus("Live typing could not start in this browser.", "warning");
    }
  }

  function appendTranscript(noteId: number, phrase: string) {
    const cleaned = phrase.trim();
    if (!cleaned) return;
    finalTranscriptRef.current = `${finalTranscriptRef.current} ${cleaned}`.trim();
    setLiveTranscript(finalTranscriptRef.current);
    onLiveTranscript(noteId, finalTranscriptRef.current);
  }

  function handleFinalSpeechPhrase(noteId: number, phrase: string) {
    const wakeMatch = phrase.match(/\bvaani\b[:,]?\s*/i);
    if (awaitingWakeCommandRef.current) {
      awaitingWakeCommandRef.current = false;
      setCommandMode(false);
      const command = phrase.trim();
      if (command) onWakeCommand(command);
      return;
    }
    if (!wakeMatch || wakeMatch.index === undefined) {
      appendTranscript(noteId, phrase);
      return;
    }
    const beforeWake = phrase.slice(0, wakeMatch.index).trim();
    const command = phrase.slice(wakeMatch.index + wakeMatch[0].length).trim();
    appendTranscript(noteId, beforeWake);
    if (command) {
      onWakeCommand(command);
    } else {
      awaitingWakeCommandRef.current = true;
      setCommandMode(true);
      onStatus("Vaani is listening for a command.", "info");
    }
  }

  function pause() {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (paused) {
      recorder.resume();
      pausedRef.current = false;
      try {
        recognitionRef.current?.start();
      } catch {
        // Recognition may already be active.
      }
      setPaused(false);
    } else {
      recorder.pause();
      pausedRef.current = true;
      recognitionRef.current?.stop();
      setPaused(true);
    }
  }

  async function stop() {
    const recorder = recorderRef.current;
    const sessionId = sessionRef.current;
    if (!recorder || !sessionId || !noteIdRef.current) return;
    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
      recorder.stop();
    });
    streamRef.current?.getTracks().forEach((track) => track.stop());
    recordingRef.current = false;
    pausedRef.current = false;
    recognitionRef.current?.stop();
    setRecording(false);
    setPaused(false);
    onStatus("Processing with OpenAI API...");
    try {
      const finished = await api.finishAudio(sessionId);
      const transcribed = await api.transcribe(finished.note_id);
      onNoteUpdated(transcribed.note);
      const formatted = await api.format(finished.note_id);
      onNoteUpdated(formatted.note);
      onStatus("Transcript formatted and saved.");
    } catch (error) {
      onStatus(error instanceof Error ? error.message : "Processing failed. Raw audio is still saved locally.", "error");
      if (noteIdRef.current) {
        const refreshed = await api.getNote(noteIdRef.current);
        onNoteUpdated(refreshed);
      }
    } finally {
      recorderRef.current = null;
      sessionRef.current = null;
      recognitionRef.current = null;
    }
  }

  return (
    <div className="w-full">
      <div className="flex items-center gap-3">
        {!recording ? (
          <>
            <button className="btn-record" onClick={start}>
              <Play size={24} />
              Start Voice Note
            </button>
            {micState !== "ready" && (
              <button className="btn-secondary h-14 px-4" onClick={() => void preflightMicrophone(true)}>
                Allow Mic
              </button>
            )}
          </>
        ) : (
          <>
            <button className="btn-secondary h-14 px-5" onClick={pause}>
              <Pause size={20} />
              {paused ? "Resume" : "Pause"}
            </button>
            <button className="btn-danger h-14 px-5" onClick={stop}>
              <Square size={20} />
              Stop
            </button>
            <span className="tabular-nums text-lg font-semibold">{formatTimer(seconds)}</span>
          </>
        )}
        <span className={`mic-pill ${micState === "ready" ? "border-gray-300 bg-white" : "border-yellow-200 bg-yellow-50"}`}>
          {micState === "ready"
            ? "Mic ready"
            : micState === "checking"
              ? "Checking mic"
              : micState === "blocked"
                ? "Mic blocked"
                : micState === "insecure"
                  ? "HTTPS needed"
                : micState === "unsupported"
                  ? "Mic unsupported"
                  : "Mic permission"}
        </span>
      </div>
      <div className="mt-2 text-xs text-gray-600">
        {micState === "ready"
          ? `Using ${micLabel || "system default microphone"}. Say "Vaani" during recording to switch to command mode.`
          : micState === "insecure"
            ? "Microphone is blocked on insecure Wi-Fi URLs. Use HTTPS for LAN access."
            : 'Say "Vaani" during recording to switch to command mode.'}
      </div>
      {recording && (
        <div className="mt-3 max-h-28 overflow-y-auto rounded border border-gray-200 bg-gray-50 p-3 text-sm leading-6 text-gray-800">
          {commandMode
            ? "Vaani command mode is active. Say the command now."
            : liveTranscript || "Listening... your words will appear here while you speak."}
        </div>
      )}
    </div>
  );
}
