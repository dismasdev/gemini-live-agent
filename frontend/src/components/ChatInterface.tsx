import { useState, useRef, useEffect, useCallback } from "react";
import {
    Mic,
    ArrowLeft,
    FileText,
    Keyboard,
    X,
    Activity,
    ArrowUpRight,
    MonitorUp,
    ImagePlus,
    PenTool,
    Bug,
    Search,
    Database,
    Radar,
    Sparkles,
    Gauge,
} from "lucide-react";
import { toast } from "sonner";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { Orb } from "@/components/ui/orb";
import { Whiteboard } from "@/components/Whiteboard";
import { IdeaDropAnimation } from "@/components/IdeaDropAnimation";

type UiScene = "focus" | "scan" | "diagnose" | "vault";

export function ChatInterface() {
    const configuredBackendOrigin = (import.meta.env.VITE_BACKEND_ORIGIN as string | undefined)?.trim();
    const [inputMode, setInputMode] = useState<"voice" | "text">("voice");
    const [textInput, setTextInput] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [showWhiteboard, setShowWhiteboard] = useState(false);
    const [savedIdeas, setSavedIdeas] = useState<string[]>([]);
    const [ideaDropTrigger, setIdeaDropTrigger] = useState(0);
    const [uiScene, setUiScene] = useState<UiScene>("focus");

    const {
        status,
        messages,
        isAgentSpeaking,
        currentTranscription,
        activities,
        latestToolCallName,
        connect,
        disconnect,
        sendText,
        sendAudio,
        sendImage,
        interruptAgent,
        toggleScreenShare,
        requestScreenCodeReview,
        isScreenSharing,
        visualShareMode,
    } = useWebSocket();

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            sendImage(file, "I am sharing an image. Please look at it and provide feedback.");
            toast.success("Image sent to Nora");
        }
        e.target.value = "";
    }, [sendImage]);

    // Wrap sendAudio to auto-interrupt agent when user speaks
    const sendAudioWithInterrupt = useCallback((pcmData: ArrayBuffer) => {
        if (isAgentSpeaking) {
            interruptAgent();
        }
        sendAudio(pcmData);
    }, [sendAudio, isAgentSpeaking, interruptAgent]);

    const { isRecording, startRecording, stopRecording } = useAudioRecorder(sendAudioWithInterrupt);

    const isConnected = status === "connected" || status === "connecting";
    const isListening = isRecording || isConnected;

    // Real date for the UI
    const now = new Date();
    const dateParts = now.toDateString().split(" ");
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }).toLowerCase().replace('am', '').replace('pm', '').trim();
    const dashboardActions = [
        "Evaluate a startup idea",
        "Check if this product exists",
        "Review this code for bugs",
        "Analyze my architecture",
    ];

    const computeAgentState = (): "thinking" | "listening" | "talking" | null => {
        if (!isConnected) return null;
        if (isAgentSpeaking) return "talking";
        if (status === "connecting" || (isListening && (!isRecording && currentTranscription))) return "thinking";
        if (isConnected || isRecording) return "listening";
        return null;
    };
    const agentState = computeAgentState();

    const loadSavedIdeas = useCallback(async () => {
        try {
            const ideasUrl = configuredBackendOrigin
                ? `${configuredBackendOrigin}/ideas?limit=12`
                : "/ideas?limit=12";
            const response = await fetch(ideasUrl);
            if (!response.ok) return;
            const data = await response.json();
            const ideas = Array.isArray(data?.ideas)
                ? data.ideas
                    .map((idea: { idea_text?: string }) => idea.idea_text?.trim())
                    .filter((ideaText: string | undefined): ideaText is string => Boolean(ideaText))
                : [];
            setSavedIdeas(ideas);
            if (ideas.length > 0) {
                setIdeaDropTrigger((prev) => prev + 1);
            }
        } catch {
            // If backend is unavailable, silently skip idea animations.
        }
    }, [configuredBackendOrigin]);

    useEffect(() => {
        if (status === "connected") {
            loadSavedIdeas();
        }
    }, [status, loadSavedIdeas]);

    useEffect(() => {
        if (latestToolCallName !== "list_saved_ideas") return;

        loadSavedIdeas().finally(() => {
            setIdeaDropTrigger((prev) => prev + 1);
        });
    }, [latestToolCallName, loadSavedIdeas]);

    useEffect(() => {
        if (!latestToolCallName) return;
        if (latestToolCallName === "google_search") {
            setUiScene("scan");
            return;
        }
        if (latestToolCallName === "analyze_code_for_bugs" || latestToolCallName === "run_python_code") {
            setUiScene("diagnose");
            return;
        }
        if (
            latestToolCallName === "store_idea_evaluation" ||
            latestToolCallName === "list_saved_ideas" ||
            latestToolCallName === "score_idea_metrics"
        ) {
            setUiScene("vault");
            return;
        }
        setUiScene("focus");
    }, [latestToolCallName]);

    useEffect(() => {
        if (isAgentSpeaking && uiScene === "focus") {
            setUiScene("scan");
        }
    }, [isAgentSpeaking, uiScene]);

    const handleMicTap = useCallback(async () => {
        if (isRecording || isConnected) {
            // If agent is speaking, interrupt it first for a clean stop
            if (isAgentSpeaking) {
                interruptAgent();
            }
            stopRecording();
            disconnect();
        } else {
            await connect();
            try {
                await startRecording();
            } catch {
                toast.error("Microphone access denied");
            }
        }
    }, [isRecording, isConnected, isAgentSpeaking, connect, disconnect, startRecording, stopRecording, interruptAgent]);

    const handleSendText = useCallback(() => {
        if (!textInput.trim()) return;
        sendText(textInput);
        setTextInput("");
        if (!isConnected) {
            connect();
        }
    }, [textInput, sendText, isConnected, connect]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendText();
            }
        },
        [handleSendText]
    );

    useEffect(() => {
        if (inputMode === "text") {
            setTimeout(() => textareaRef.current?.focus(), 100);
        }
    }, [inputMode]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, currentTranscription]);

    // View: HOME DASHBOARD (Idle)
    if (!isListening && inputMode === "voice") {
        return (
            <div className={`relative flex flex-col h-screen text-white bg-gradient-to-b from-[#070b11] via-[#090f19] to-[#05070d] font-sans selection:bg-cyan-500/30 overflow-hidden scene-shell scene-${uiScene}`}>
                <IdeaDropAnimation ideas={savedIdeas} trigger={ideaDropTrigger} />
                <div className="pointer-events-none absolute -top-20 -left-24 w-80 h-80 bg-cyan-500/15 blur-3xl rounded-full" />
                <div className="pointer-events-none absolute top-16 right-0 w-96 h-96 bg-indigo-500/10 blur-3xl rounded-full" />
                <div className="pointer-events-none absolute bottom-0 left-1/3 w-72 h-72 bg-emerald-500/10 blur-3xl rounded-full" />

                {/* Top App Bar */}
                <div className="flex justify-between items-center px-6 md:px-8 pt-8 pb-4 max-w-6xl mx-auto w-full z-10">
                    <div className="flex flex-col leading-tight">
                        <span className="text-3xl md:text-4xl font-light tracking-widest text-sky-50">{timeStr}</span>
                        <span className="text-xs text-cyan-100/50 tracking-wider font-semibold">{dateParts[1]} {dateParts[2]}</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="text-right flex flex-col items-end">
                            <span className="text-sm font-medium text-white/90">Nora Command Center</span>
                            {isConnected ? (
                                <span className="text-[10px] text-emerald-400 font-medium tracking-wider uppercase flex items-center gap-1.5 mt-0.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> Session Active
                                </span>
                            ) : (
                                <span className="text-[10px] text-cyan-200/60 font-medium tracking-wider uppercase flex items-center gap-1.5 mt-0.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-300/60"></span> Ready
                                </span>
                            )}
                        </div>
                        <div className="h-10 w-10 rounded-full bg-gradient-to-tr from-cyan-400 to-blue-500 p-[2px] shadow-[0_0_15px_rgba(34,211,238,0.3)]">
                            <div className="h-full w-full rounded-full bg-[#0a101a] overflow-hidden flex items-center justify-center">
                                <Sparkles className="w-5 h-5 text-cyan-300" />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex-1 z-10 w-full max-w-6xl mx-auto px-6 md:px-8 pb-28 overflow-y-auto hide-scrollbar">
                    <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_1fr] gap-6 pb-6">
                        <div className="rounded-3xl border border-cyan-300/20 bg-white/[0.03] backdrop-blur-xl p-6 md:p-8 shadow-[0_16px_60px_rgba(3,10,24,0.45)]">
                            <div className="flex items-center gap-2 text-cyan-200/80 text-xs uppercase tracking-[0.22em] font-semibold mb-4">
                                <Radar className="w-4 h-4" />
                                AI Operations Dashboard
                            </div>
                            <h1 className="text-3xl md:text-4xl font-semibold leading-tight text-white mb-3">
                                Build, validate, and refine ideas in one conversational workspace.
                            </h1>
                            <p className="text-sm md:text-base text-slate-200/70 max-w-2xl leading-relaxed">
                                Nora scores your ideas, checks competition with search, analyzes code bugs, and keeps everything contextual while you collaborate in real time.
                            </p>

                            <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
                                <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                                    <div className="text-cyan-300 mb-2"><Database className="w-4 h-4" /></div>
                                    <p className="text-[11px] uppercase tracking-widest text-white/50">Idea Vault</p>
                                    <p className="text-sm text-white/85 mt-1">Persist scored ideas</p>
                                </div>
                                <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                                    <div className="text-emerald-300 mb-2"><Search className="w-4 h-4" /></div>
                                    <p className="text-[11px] uppercase tracking-widest text-white/50">Competition Scan</p>
                                    <p className="text-sm text-white/85 mt-1">Google-backed checks</p>
                                </div>
                                <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                                    <div className="text-amber-300 mb-2"><Bug className="w-4 h-4" /></div>
                                    <p className="text-[11px] uppercase tracking-widest text-white/50">Code Insights</p>
                                    <p className="text-sm text-white/85 mt-1">Bug risk analysis</p>
                                </div>
                                <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                                    <div className="text-indigo-300 mb-2"><Gauge className="w-4 h-4" /></div>
                                    <p className="text-[11px] uppercase tracking-widest text-white/50">Live Session</p>
                                    <p className="text-sm text-white/85 mt-1">Voice + visual context</p>
                                </div>
                            </div>

                            <div className="mt-6 flex flex-wrap gap-2">
                                {dashboardActions.map((q, i) => (
                                    <button
                                        key={i}
                                        onClick={() => { setTextInput(q); setInputMode("text"); }}
                                        className="px-4 py-2 rounded-full text-xs md:text-sm bg-cyan-500/10 border border-cyan-400/20 text-cyan-100/80 hover:bg-cyan-400/20 hover:text-white transition-all"
                                    >
                                        {q}
                                    </button>
                                ))}
                                {savedIdeas.length > 0 && (
                                    <button
                                        onClick={() => setIdeaDropTrigger((prev) => prev + 1)}
                                        className="px-4 py-2 rounded-full text-xs md:text-sm bg-emerald-500/10 border border-emerald-400/20 text-emerald-100/80 hover:bg-emerald-400/20 hover:text-white transition-all"
                                    >
                                        Replay Saved Ideas Animation
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="rounded-3xl border border-indigo-300/20 bg-white/[0.03] backdrop-blur-xl p-6 shadow-[0_16px_60px_rgba(4,8,30,0.4)] flex flex-col items-center justify-center relative min-h-[360px]">
                            <div className="absolute top-5 left-5 text-[11px] uppercase tracking-[0.2em] text-indigo-200/70">Voice Activation</div>
                            <Orb agentState={agentState} colors={["#22d3ee", "#60a5fa"]} />
                            <button
                                className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer group"
                                onClick={handleMicTap}
                            >
                                <span className="text-cyan-100/70 text-xs mb-2 tracking-widest uppercase font-semibold">Tap to begin</span>
                                <span className="text-2xl font-light group-hover:text-cyan-200 transition-colors">Start Session</span>
                                <div className="mt-8 text-white/35 group-hover:text-white/80 transition-all group-hover:scale-110">
                                    <Mic className="w-6 h-6" />
                                </div>
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-6">
                        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                            <p className="text-[11px] uppercase tracking-widest text-cyan-200/70">Workflow</p>
                            <p className="text-sm text-white/80 mt-2 leading-relaxed">Discuss idea, evaluate metrics, run competition check, and store insights in one pass.</p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                            <p className="text-[11px] uppercase tracking-widest text-emerald-200/70">Canvas Ready</p>
                            <p className="text-sm text-white/80 mt-2 leading-relaxed">Open whiteboard to sketch architecture and get instant design feedback from the agent.</p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                            <p className="text-[11px] uppercase tracking-widest text-indigo-200/70">Cross Device</p>
                            <p className="text-sm text-white/80 mt-2 leading-relaxed">Use desktop screen sharing or mobile camera sharing for visual code walkthroughs.</p>
                        </div>
                    </div>

                    <div className="pb-8 flex flex-wrap gap-2">
                        <button onClick={() => setUiScene("focus")} className="px-3 py-1.5 rounded-full text-xs bg-white/5 border border-white/15 hover:bg-white/10 transition-colors">Focus Scene</button>
                        <button onClick={() => setUiScene("scan")} className="px-3 py-1.5 rounded-full text-xs bg-cyan-500/10 border border-cyan-300/25 hover:bg-cyan-500/20 transition-colors">Scan Scene</button>
                        <button onClick={() => setUiScene("diagnose")} className="px-3 py-1.5 rounded-full text-xs bg-amber-500/10 border border-amber-300/25 hover:bg-amber-500/20 transition-colors">Diagnose Scene</button>
                        <button onClick={() => setUiScene("vault")} className="px-3 py-1.5 rounded-full text-xs bg-emerald-500/10 border border-emerald-300/25 hover:bg-emerald-500/20 transition-colors">Vault Scene</button>
                    </div>
                </div>

                {/* Hidden File Input */}
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageSelect}
                    className="hidden"
                />

                {/* Bottom Nav */}
                <div className="absolute bottom-0 w-full bg-[#08101a]/80 backdrop-blur-xl border-t border-cyan-300/10 py-3 z-50">
                    <div className="max-w-sm mx-auto px-6 flex justify-between items-center text-white/40">
                        <button
                            onClick={() => setShowWhiteboard(true)}
                            className="p-3 rounded-xl hover:text-cyan-100 hover:bg-cyan-500/10 transition-all"
                            title="Open Whiteboard"
                        >
                            <PenTool className="w-6 h-6" />
                        </button>

                        <button
                            onClick={toggleScreenShare}
                            className={`p-3 rounded-xl transition-all ${isScreenSharing ? 'text-cyan-200 bg-cyan-500/20' : 'hover:text-cyan-100 hover:bg-cyan-500/10'}`}
                            title={isScreenSharing ? "Stop visual sharing" : "Share screen/camera"}
                        >
                            <MonitorUp className={`w-6 h-6 ${isScreenSharing ? 'animate-pulse' : ''}`} />
                        </button>

                        <button
                            onClick={handleMicTap}
                            className="relative -top-5 bg-gradient-to-tr from-cyan-500 to-blue-600 p-3.5 rounded-full text-white shadow-[0_8px_25px_rgba(34,211,238,0.35)] hover:scale-105 transition-transform"
                        >
                            <Mic className="w-5 h-5" />
                        </button>

                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="p-3 rounded-xl hover:text-cyan-100 hover:bg-cyan-500/10 transition-all"
                            title="Upload Image"
                        >
                            <ImagePlus className="w-6 h-6" />
                        </button>
                    </div>
                </div>

                {/* Whiteboard Overlay */}
                {showWhiteboard && (
                    <Whiteboard
                        onSendImage={sendImage}
                        onClose={() => setShowWhiteboard(false)}
                    />
                )}
            </div>
        );
    }

    // View: LISTENING / TEXT CHAT / ACTIVE
    return (
        <div className={`relative flex flex-col h-screen text-white bg-gradient-to-b from-[#070b11] via-[#090f19] to-[#05070d] font-sans overflow-hidden selection:bg-cyan-500/30 scene-shell scene-${uiScene}`}>
            <IdeaDropAnimation ideas={savedIdeas} trigger={ideaDropTrigger} />
            <div className="pointer-events-none absolute -top-20 right-0 w-80 h-80 bg-cyan-500/10 blur-3xl rounded-full" />
            {/* Top App Bar */}
            <div className="flex justify-between items-center px-6 pt-8 pb-4 z-20 max-w-5xl mx-auto w-full">
                <button
                    onClick={handleMicTap}
                    className="w-10 h-10 rounded-full border border-cyan-300/20 flex items-center justify-center bg-cyan-500/10 hover:bg-cyan-400/20 transition-colors"
                >
                    <ArrowLeft className="w-5 h-5 text-cyan-100/80" />
                </button>
                <div className="flex flex-col items-center">
                    <div className="text-sm font-semibold tracking-wide text-cyan-50/95 font-display">
                        {status === "connecting" ? "Establishing Connection..." : "Nora Active"}
                    </div>
                    {isAgentSpeaking && (
                        <div className="text-[10px] text-cyan-300 font-medium uppercase tracking-widest mt-1 animate-pulse">
                            Thinking
                        </div>
                    )}
                </div>
                <button className="w-10 h-10 rounded-full border border-cyan-300/20 flex items-center justify-center bg-cyan-500/10 hover:bg-cyan-400/20 transition-colors">
                    <FileText className="w-5 h-5 text-cyan-100/80" />
                </button>
            </div>

            {/* Main Area: Mixed Text and Voice mode */}
            <div className="flex-1 flex flex-col min-h-0 z-10 w-full">
                {(isListening && inputMode === "voice") ? (
                    // Full screen Orb View with Activity Log
                    <div className="flex-1 flex flex-col md:flex-row items-center justify-center relative w-full h-full min-h-[400px] max-w-6xl mx-auto px-6 gap-8">

                        {/* Empty spacer for centering on desktop if needed, or left-aligning */}
                        <div className="hidden md:block w-[300px]"></div>

                        {/* Center Orb */}
                        <div className="flex-1 flex items-center justify-center w-full">
                            <Orb agentState={agentState} colors={["#22d3ee", "#60a5fa"]} />
                        </div>

                        {/* Right Activity Log Panel */}
                        <div className="w-full md:w-[320px] h-[340px] dashboard-panel backdrop-blur-2xl rounded-2xl flex flex-col overflow-hidden self-center">
                            {/* Panel Header */}
                            <div className="px-4 py-3 border-b border-cyan-200/10 flex items-center justify-between bg-cyan-500/[0.04]">
                                <div className="flex items-center gap-2">
                                    <div className="relative flex items-center justify-center w-4 h-4">
                                        <div className="absolute inset-0 bg-cyan-500/20 rounded-full animate-ping"></div>
                                        <Activity className="w-3.5 h-3.5 text-cyan-300 relative z-10" />
                                    </div>
                                    <span className="text-[11px] font-semibold text-cyan-100/80 tracking-widest uppercase">Live Activity</span>
                                </div>
                                <span className="text-[10px] text-cyan-100/40 font-mono">MCP_LINK</span>
                            </div>

                            {/* Log Items */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-4 hide-scrollbar flex flex-col justify-end bg-gradient-to-b from-transparent to-black/30">

                                <div className="flex flex-col gap-1.5 opacity-40">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] text-cyan-100/50 font-mono uppercase">System</span>
                                        <span className="text-[9px] text-cyan-100/40 font-mono">{timeStr}</span>
                                    </div>
                                    <div className="text-[12px] text-cyan-50/70 font-mono">
                                        Connection to Gateway established
                                    </div>
                                </div>

                                {activities.map((activity) => (
                                    <div key={activity.id} className={`flex flex-col gap-1.5 ${activity.status === 'executing' ? 'animate-fade-in-up' : 'opacity-60'}`}>
                                        <div className="flex items-center justify-between">
                                            <span className={`text-[10px] font-mono uppercase ${activity.status === 'executing' ? 'text-cyan-300' : 'text-emerald-300'}`}>
                                                {activity.status === 'executing' ? 'Tool Executing' : 'Tool'}
                                            </span>
                                            <span className={`text-[9px] font-mono ${activity.status === 'executing' ? 'text-cyan-300/60 animate-pulse' : 'text-cyan-100/40'}`}>
                                                {activity.status === 'executing' ? 'Now' : activity.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }).toLowerCase().replace('am', '').replace('pm', '').trim()}
                                            </span>
                                        </div>
                                        <div className={`text-[13px] font-mono flex items-center gap-2 px-2.5 py-1.5 rounded-lg relative overflow-hidden ${activity.status === 'executing' ? 'text-cyan-200 bg-cyan-400/10 border border-cyan-300/30 shadow-[0_0_10px_rgba(34,211,238,0.15)]' : 'text-emerald-300 bg-emerald-400/10 border border-emerald-300/20'}`}>
                                            {activity.status === 'executing' && (
                                                <>
                                                    <div className="absolute bottom-0 left-0 h-[1px] bg-cyan-300 w-full animate-[progress_2s_ease-in-out_infinite]"></div>
                                                    <span className="w-1.5 h-1.5 bg-cyan-300 rounded-full animate-pulse shadow-[0_0_5px_rgba(34,211,238,0.8)]"></span>
                                                </>
                                            )}
                                            CoachMCP({activity.name})
                                        </div>
                                    </div>
                                ))}

                            </div>
                        </div>
                    </div>
                ) : (
                    // Text Chat View
                    <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-6 w-full max-w-3xl mx-auto hide-scrollbar">
                        {messages.length === 0 && !currentTranscription && (
                            <div className="text-center text-cyan-50/40 mt-10 font-light text-sm">Describe your idea or share code to begin.</div>
                        )}
                        {messages.map((msg, i) => (
                            <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                <div className={`px-5 py-3.5 max-w-[85%] rounded-[1.5rem] text-[15px] leading-relaxed relative
                       ${msg.role === 'user' ? 'bg-cyan-500/12 text-white rounded-br-sm border border-cyan-200/20 shadow-lg' : 'bg-transparent text-white/90'}
                    `}>
                                    {msg.role !== 'user' && (
                                        <div className="text-[10px] text-cyan-300 uppercase tracking-widest mb-1 font-medium flex items-center gap-1.5">
                                            <Activity className="w-3 h-3" /> Coach
                                        </div>
                                    )}
                                    {msg.content}
                                </div>
                            </div>
                        ))}

                        {/* Live Transcription / AI Thinking */}
                        {(currentTranscription || isAgentSpeaking) && (
                            <div className="flex flex-col items-start opacity-80 transition-opacity duration-300 w-full max-w-3xl mx-auto">
                                <div className="px-5 py-3 max-w-[85%] rounded-[1.5rem] rounded-bl-sm text-cyan-50/80">
                                    {currentTranscription ? (
                                        <span className="italic text-cyan-50/60">"{currentTranscription}"</span>
                                    ) : (
                                        <div className="flex gap-1.5 items-center h-6">
                                            <div className="w-1.5 h-1.5 bg-cyan-300 rounded-full animate-[thinking-dots_1.4s_infinite]"></div>
                                            <div className="w-1.5 h-1.5 bg-cyan-300 rounded-full animate-[thinking-dots_1.4s_infinite_0.2s]"></div>
                                            <div className="w-1.5 h-1.5 bg-cyan-300 rounded-full animate-[thinking-dots_1.4s_infinite_0.4s]"></div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} className="h-4 w-full" />
                    </div>
                )}
            </div>

            {/* Transcript Text over Voice Orb (Only visible in pure voice mode) */}
            {isListening && inputMode === "voice" && (messages.length > 0 || currentTranscription) && (
                <div className="px-8 pb-10 text-center z-20 w-full max-w-3xl mx-auto">
                    <p className="text-2xl font-light text-white leading-relaxed">
                        {currentTranscription ? (
                            <span className="text-cyan-200 animate-pulse">{currentTranscription}</span>
                        ) : messages.length > 0 ? (
                            <span dangerouslySetInnerHTML={{
                                __html: messages[messages.length - 1].content.replace(
                                    /algorithm|design|pattern|complexity/i,
                                    '<span class="text-cyan-300/90 font-normal">$&</span>'
                                )
                            }} />
                        ) : null}
                    </p>
                </div>
            )}

            {/* Hidden File Input (for active view) */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageSelect}
                className="hidden"
            />

            {/* Screensharing indicator */}
            {isScreenSharing && (
                <div className="absolute top-24 right-6 z-50 bg-cyan-500/20 border border-cyan-300/30 text-cyan-100 text-xs px-3 py-1.5 rounded-full flex items-center gap-2 animate-fade-in-up backdrop-blur-md">
                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                    {visualShareMode === "camera" ? "Camera Sharing Active" : "Screen Sharing Active"}
                </div>
            )}

            {/* Bottom Controls */}
            <div className="px-6 md:px-8 pb-8 pt-3 w-full flex justify-between items-center max-w-lg mx-auto z-20 relative">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-[1px] bg-gradient-to-r from-transparent via-cyan-200/20 to-transparent -translate-y-3"></div>
                {inputMode === "text" ? (
                    // Text Input Bar
                    <div className="w-full flex items-center gap-2 bg-[#0b1624]/92 backdrop-blur-xl border border-cyan-200/20 rounded-full pl-5 pr-2 py-2 shadow-[0_18px_35px_rgba(1,14,30,0.45)]">
                        <textarea
                            ref={textareaRef}
                            value={textInput}
                            onChange={(e) => setTextInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Message Coach..."
                            className="flex-1 bg-transparent border-none outline-none text-white resize-none h-[24px] max-h-[100px] py-0.5 text-[15px] placeholder:text-cyan-50/35"
                            rows={1}
                        />
                        <div className="flex items-center gap-1 border-l border-cyan-200/15 pl-2">
                            <button
                                onClick={toggleScreenShare}
                                className={`w-9 h-9 flex items-center justify-center rounded-full transition-colors ${isScreenSharing ? 'text-cyan-200 bg-cyan-500/25' : 'text-cyan-100/45 hover:text-cyan-100 hover:bg-cyan-500/10'}`}
                                title={isScreenSharing ? "Stop visual sharing" : "Share screen/camera"}
                            >
                                <MonitorUp className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => {
                                    setUiScene("diagnose");
                                    requestScreenCodeReview();
                                }}
                                className="w-9 h-9 flex items-center justify-center rounded-full text-cyan-100/45 hover:text-cyan-100 hover:bg-cyan-500/10 transition-colors"
                                title="Read currently shared code"
                            >
                                <Bug className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setShowWhiteboard(true)}
                                className="w-9 h-9 flex items-center justify-center rounded-full text-cyan-100/45 hover:text-cyan-100 hover:bg-cyan-500/10 transition-colors"
                                title="Open Whiteboard"
                            >
                                <PenTool className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="w-9 h-9 flex items-center justify-center rounded-full text-cyan-100/45 hover:text-cyan-100 hover:bg-cyan-500/10 transition-colors"
                                title="Upload Image"
                            >
                                <ImagePlus className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setInputMode("voice")}
                                className="w-9 h-9 flex items-center justify-center rounded-full text-cyan-100/45 hover:text-cyan-100 hover:bg-cyan-500/10 transition-colors"
                            >
                                <Mic className="w-4 h-4" />
                            </button>
                            <button
                                onClick={handleSendText}
                                disabled={!textInput.trim()}
                                className="w-9 h-9 flex items-center justify-center rounded-full bg-cyan-500 hover:bg-cyan-400 disabled:bg-cyan-500/20 disabled:text-white/30 text-white transition-all shadow-[0_0_15px_rgba(34,211,238,0.3)] disabled:shadow-none ml-1"
                            >
                                <ArrowUpRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                ) : (
                    // Voice Controls
                    <>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setInputMode("text")}
                                className="w-12 h-12 rounded-full bg-[#0b1624]/85 backdrop-blur-xl border border-cyan-200/20 flex items-center justify-center hover:bg-cyan-400/10 transition-colors shadow-lg"
                                title="Switch to Text"
                            >
                                <Keyboard className="w-5 h-5 text-cyan-100/60" />
                            </button>

                            <button
                                onClick={() => setShowWhiteboard(true)}
                                className="w-12 h-12 rounded-full bg-[#0b1624]/85 backdrop-blur-xl border border-cyan-200/20 flex items-center justify-center hover:bg-cyan-400/10 transition-colors shadow-lg"
                                title="Open Whiteboard"
                            >
                                <PenTool className="w-5 h-5 text-cyan-100/60" />
                            </button>
                        </div>

                        <button
                            onClick={handleMicTap}
                            className="relative flex items-center justify-center w-20 h-20 group mx-4"
                        >
                            <div className="absolute inset-0 bg-cyan-500/20 rounded-full animate-[ping_2s_cubic-bezier(0,0,0.2,1)_infinite]"></div>
                            <div className="absolute inset-2 bg-cyan-500/30 rounded-full blur-xl"></div>
                            <div className="relative w-16 h-16 bg-gradient-to-br from-cyan-400 to-blue-600 rounded-full flex items-center justify-center shadow-[0_0_32px_rgba(34,211,238,0.42)] group-hover:scale-105 transition-transform border border-cyan-200/30">
                                <Mic className="w-6 h-6 text-white" />
                            </div>
                        </button>

                        <div className="flex gap-2">
                            <button
                                onClick={toggleScreenShare}
                                className={`w-12 h-12 rounded-full backdrop-blur-xl border flex items-center justify-center transition-colors shadow-lg ${isScreenSharing ? 'bg-cyan-500/20 border-cyan-300/50 text-cyan-200' : 'bg-[#0b1624]/85 border-cyan-200/20 text-cyan-100/60 hover:bg-cyan-500/10 hover:text-cyan-100'}`}
                                title={isScreenSharing ? "Stop visual sharing" : "Share screen/camera"}
                            >
                                <MonitorUp className={`w-5 h-5 ${isScreenSharing ? 'animate-pulse' : ''}`} />
                            </button>
                            <button
                                onClick={() => {
                                    setUiScene("diagnose");
                                    requestScreenCodeReview();
                                }}
                                className="w-12 h-12 rounded-full border border-cyan-200/20 bg-[#0b1624]/85 backdrop-blur-xl flex items-center justify-center hover:bg-cyan-500/10 hover:border-cyan-100/30 transition-colors group shadow-lg"
                                title="Analyze visible shared code"
                            >
                                <Bug className="w-5 h-5 text-cyan-100/60 group-hover:text-amber-200" />
                            </button>
                            <button
                                onClick={handleMicTap}
                                className="w-12 h-12 rounded-full border border-cyan-200/20 bg-[#0b1624]/85 backdrop-blur-xl flex items-center justify-center hover:bg-cyan-500/10 hover:border-cyan-100/30 hover:text-rose-300 transition-colors group shadow-lg"
                                title="Stop Session"
                            >
                                <X className="w-5 h-5 text-cyan-100/60 group-hover:text-rose-300" />
                            </button>
                        </div>
                    </>
                )}
            </div>

            {/* Whiteboard Overlay */}
            {showWhiteboard && (
                <Whiteboard
                    onSendImage={sendImage}
                    onClose={() => setShowWhiteboard(false)}
                />
            )}
        </div>
    );
}
