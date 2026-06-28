import { Pause, Play, Square } from "lucide-react";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { api, type Note } from "../services/api";
import { formatTimer, supportedAudioMimeType } from "../services/recorder";
import { createSpeechRecognition, type SpeechRecognitionLike } from "../services/voiceCommands";

type Props = {
  note: Note | null;
  onCreateNote: () => Promise<Note>;
  onNoteUpdated: (note: Note) => void;
  onLiveTranscript: (noteId: number, transcript: string) => void;
  onWakeCommand: (command: string) => void | Promise<void>;
  onStatus: (message: string, tone?: "info" | "warning" | "error") => void;
  confirmationPhrase?: string;
};

type MicState = "unknown" | "checking" | "prompt" | "ready" | "blocked" | "unsupported" | "insecure";

export type RecorderControls = {
  start: () => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  isRecording: () => boolean;
};

const RecorderButton = forwardRef<RecorderControls, Props>(function RecorderButton(
  { note, onCreateNote, onNoteUpdated, onLiveTranscript, onWakeCommand, onStatus, confirmationPhrase },
  ref
) {
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
  const commandModeRef = useRef(false);
  const recognitionRestartRef = useRef<number | undefined>();
  const recognitionWatchdogRef = useRef<number | undefined>();
  const lastSpeechEventRef = useRef(0);

  useImperativeHandle(ref, () => ({
    start: () => void start(),
    stop: () => void stop(),
    pause: () => pauseRecording(),
    resume: () => resumeRecording(),
    isRecording: () => recordingRef.current
  }));

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

  function httpsUrlForCurrentPage(): string {
    const url = new URL(window.location.href);
    url.protocol = "https:";
    return url.toString();
  }

  function openHttpsForMicrophone() {
    const nextUrl = httpsUrlForCurrentPage();
    onStatus("Opening the secure Wi-Fi URL. Accept the local certificate warning once, then allow mic.", "warning");
    window.location.assign(nextUrl);
  }

  function handleMicButton() {
    if (micState === "insecure" || !window.isSecureContext) {
      openHttpsForMicrophone();
      return;
    }
    void preflightMicrophone(true);
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
      if (promptUser) openHttpsForMicrophone();
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
      if (recordingRef.current) {
        onStatus("Recording is already active.");
        return;
      }
      if (!window.isSecureContext) {
        setMicState("insecure");
        openHttpsForMicrophone();
        return;
      }
      const current = note ?? (await onCreateNote());
      const startingTranscript = (current.plain_text || current.clean_transcript || current.raw_transcript || "").trim();
      noteIdRef.current = current.id;
      finalTranscriptRef.current = startingTranscript;
      awaitingWakeCommandRef.current = false;
      commandModeRef.current = false;
      clearRecognitionRestart();
      clearRecognitionWatchdog();
      setCommandMode(false);
      setLiveTranscript(startingTranscript);
      const stream = await getMicStream();
      streamRef.current = stream;
      const mimeType = supportedAudioMimeType();
      const session = await api.startAudio(current.id, mimeType || undefined, startingTranscript);
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
      onStatus(`Recording started. New speech will append to "${current.title}".`);
    } catch (error) {
      onStatus(error instanceof Error ? error.message : "Microphone permission failed", "error");
    }
  }

  function startLiveTranscript(noteId: number) {
    clearRecognitionRestart();
    clearRecognitionWatchdog();
    const recognition = createSpeechRecognition({ continuous: true, interimResults: true });
    if (!recognition) {
      onStatus("Live typing is not supported in this browser. Audio recording still works.", "warning");
      return;
    }
    recognition.onresult = (event) => {
      lastSpeechEventRef.current = Date.now();
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
    recognition.onerror = (event) => {
      if (event.error !== "no-speech" && event.error !== "aborted") {
        onStatus("Live typing paused briefly. Jojo will keep listening while recording is on.", "warning");
      }
    };
    recognition.onend = () => {
      if (recordingRef.current && !pausedRef.current && !commandModeRef.current) scheduleRecognitionRestart(noteId);
    };
    recognitionRef.current = recognition;
    try {
      lastSpeechEventRef.current = Date.now();
      recognition.start();
      scheduleRecognitionWatchdog(noteId);
    } catch {
      scheduleRecognitionRestart(noteId);
    }
  }

  function clearRecognitionRestart() {
    window.clearTimeout(recognitionRestartRef.current);
    recognitionRestartRef.current = undefined;
  }

  function clearRecognitionWatchdog() {
    window.clearTimeout(recognitionWatchdogRef.current);
    recognitionWatchdogRef.current = undefined;
  }

  function scheduleRecognitionWatchdog(noteId: number) {
    if (!recordingRef.current || pausedRef.current || commandModeRef.current) return;
    clearRecognitionWatchdog();
    recognitionWatchdogRef.current = window.setTimeout(() => {
      if (!recordingRef.current || pausedRef.current || commandModeRef.current) return;
      if (Date.now() - lastSpeechEventRef.current > 10000) {
        try {
          recognitionRef.current?.stop();
        } catch {
          scheduleRecognitionRestart(noteId);
        }
      } else {
        scheduleRecognitionWatchdog(noteId);
      }
    }, 5000);
  }

  function scheduleRecognitionRestart(noteId: number) {
    if (!recordingRef.current || pausedRef.current || commandModeRef.current) return;
    clearRecognitionRestart();
    clearRecognitionWatchdog();
    recognitionRestartRef.current = window.setTimeout(() => {
      if (recordingRef.current && !pausedRef.current && !commandModeRef.current) startLiveTranscript(noteId);
    }, 350);
  }

  async function runWakeCommand(noteId: number, command: string) {
    const cleaned = command.trim();
    if (!cleaned) return;
    commandModeRef.current = true;
    awaitingWakeCommandRef.current = false;
    clearRecognitionRestart();
    clearRecognitionWatchdog();
    setCommandMode(true);
    try {
      recognitionRef.current?.stop();
    } catch {
      // Recognition may already be stopped.
    }
    try {
      await onWakeCommand(cleaned);
    } finally {
      commandModeRef.current = false;
      setCommandMode(false);
      if (recordingRef.current && !pausedRef.current) startLiveTranscript(noteId);
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
    const wakeMatch = phrase.match(/\b(?:hey\s+)?jojo\b[:,]?\s*/i);
    const spokenConfirmation = confirmationPhrase?.trim().toLowerCase();
    const lowerPhrase = phrase.trim().toLowerCase();
    if (awaitingWakeCommandRef.current) {
      const command = phrase.trim();
      if (command) void runWakeCommand(noteId, command);
      return;
    }
    if (spokenConfirmation && (lowerPhrase.includes(spokenConfirmation) || lowerPhrase.includes("cancel"))) {
      void runWakeCommand(noteId, phrase.trim());
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
      void runWakeCommand(noteId, command);
    } else {
      awaitingWakeCommandRef.current = true;
      setCommandMode(true);
      onStatus("Jojo is listening for a command.", "info");
    }
  }

  function pause() {
    if (pausedRef.current) {
      resumeRecording();
      return;
    }
    pauseRecording();
  }

  function pauseRecording() {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (pausedRef.current) return;
    recorder.pause();
    pausedRef.current = true;
    clearRecognitionRestart();
    clearRecognitionWatchdog();
    recognitionRef.current?.stop();
    setPaused(true);
    onStatus("Recording paused.");
  }

  function resumeRecording() {
    const recorder = recorderRef.current;
    if (!recorder || !pausedRef.current) return;
    recorder.resume();
    pausedRef.current = false;
    if (noteIdRef.current) startLiveTranscript(noteIdRef.current);
    setPaused(false);
    onStatus("Recording resumed.");
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
    clearRecognitionRestart();
    clearRecognitionWatchdog();
    recognitionRef.current?.stop();
    setRecording(false);
    setPaused(false);
    onStatus("Transcribing audio...");
    try {
      const finished = await api.finishAudio(sessionId);
      const transcribed = await api.transcribe(finished.note_id);
      onNoteUpdated(transcribed.note);
      onStatus("Transcript saved. Use Decorate only when you want formatting.");
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
              <button className="btn-secondary h-14 px-4" onClick={handleMicButton}>
                {micState === "insecure" ? "Open HTTPS" : "Allow Mic"}
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
          ? `Using ${micLabel || "system default microphone"}. Say "Jojo" during recording to switch to command mode.`
          : micState === "insecure"
            ? "Chrome blocks mic on HTTP Wi-Fi pages. Click Open HTTPS, accept the local certificate once, then allow mic."
            : 'Say "Jojo" during recording to switch to command mode.'}
      </div>
      {recording && (
        <div className="mt-3 max-h-28 overflow-y-auto rounded border border-gray-200 bg-gray-50 p-3 text-sm leading-6 text-gray-800">
          {commandMode
            ? "Jojo command mode is active. Say the command now."
            : liveTranscript || "Listening... your words will appear here while you speak."}
        </div>
      )}
    </div>
  );
});

export default RecorderButton;
