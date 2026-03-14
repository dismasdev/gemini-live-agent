/**
 * Whiteboard Component — Drawing Canvas for Ideas and Architecture
 * ========================================================
 * A simple drawing canvas where users can sketch product ideas,
 * architecture diagrams, or debugging notes. The canvas content can
 * be captured and sent to Nora as an image.
 */

import { useRef, useState, useCallback, useEffect } from "react";
import { Eraser, Pen, Trash2, Send, Undo2, X, Minus, Circle } from "lucide-react";

interface WhiteboardProps {
    onSendImage: (file: File, caption: string) => void;
    onClose: () => void;
}

type Tool = "pen" | "eraser";

const COLORS = [
    "#ffffff",  // white
    "#38bdf8",  // sky blue
    "#a78bfa",  // violet
    "#34d399",  // emerald
    "#fbbf24",  // amber
    "#fb7185",  // rose
    "#f97316",  // orange
];

const LINE_WIDTHS = [2, 4, 8];

export function Whiteboard({ onSendImage, onClose }: WhiteboardProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [tool, setTool] = useState<Tool>("pen");
    const [color, setColor] = useState("#ffffff");
    const [lineWidth, setLineWidth] = useState(4);
    const [history, setHistory] = useState<ImageData[]>([]);

    const getCtx = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return null;
        return canvas.getContext("2d");
    }, []);

    // Initialize canvas
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const resizeCanvas = () => {
            const rect = canvas.parentElement?.getBoundingClientRect();
            if (!rect) return;
            const dpr = window.devicePixelRatio || 1;
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            canvas.style.width = `${rect.width}px`;
            canvas.style.height = `${rect.height}px`;

            const ctx = canvas.getContext("2d");
            if (ctx) {
                ctx.scale(dpr, dpr);
                ctx.fillStyle = "#0f0f1a";
                ctx.fillRect(0, 0, rect.width, rect.height);
                // Draw grid
                ctx.strokeStyle = "rgba(255,255,255,0.04)";
                ctx.lineWidth = 1;
                for (let x = 0; x < rect.width; x += 40) {
                    ctx.beginPath();
                    ctx.moveTo(x, 0);
                    ctx.lineTo(x, rect.height);
                    ctx.stroke();
                }
                for (let y = 0; y < rect.height; y += 40) {
                    ctx.beginPath();
                    ctx.moveTo(0, y);
                    ctx.lineTo(rect.width, y);
                    ctx.stroke();
                }
            }
        };

        resizeCanvas();
        window.addEventListener("resize", resizeCanvas);
        return () => window.removeEventListener("resize", resizeCanvas);
    }, []);

    const saveState = useCallback(() => {
        const ctx = getCtx();
        const canvas = canvasRef.current;
        if (!ctx || !canvas) return;
        const state = ctx.getImageData(0, 0, canvas.width, canvas.height);
        setHistory((prev) => [...prev.slice(-20), state]);
    }, [getCtx]);

    const getPosition = useCallback((e: React.MouseEvent | React.TouchEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        if ("touches" in e) {
            return {
                x: e.touches[0].clientX - rect.left,
                y: e.touches[0].clientY - rect.top,
            };
        }
        return {
            x: (e as React.MouseEvent).clientX - rect.left,
            y: (e as React.MouseEvent).clientY - rect.top,
        };
    }, []);

    const startDrawing = useCallback(
        (e: React.MouseEvent | React.TouchEvent) => {
            const ctx = getCtx();
            if (!ctx) return;

            saveState();
            setIsDrawing(true);

            const pos = getPosition(e);
            ctx.beginPath();
            ctx.moveTo(pos.x, pos.y);
            ctx.lineCap = "round";
            ctx.lineJoin = "round";

            if (tool === "eraser") {
                ctx.globalCompositeOperation = "destination-out";
                ctx.lineWidth = lineWidth * 4;
            } else {
                ctx.globalCompositeOperation = "source-over";
                ctx.strokeStyle = color;
                ctx.lineWidth = lineWidth;
            }
        },
        [getCtx, getPosition, saveState, tool, color, lineWidth]
    );

    const draw = useCallback(
        (e: React.MouseEvent | React.TouchEvent) => {
            if (!isDrawing) return;
            const ctx = getCtx();
            if (!ctx) return;

            const pos = getPosition(e);
            ctx.lineTo(pos.x, pos.y);
            ctx.stroke();
        },
        [isDrawing, getCtx, getPosition]
    );

    const stopDrawing = useCallback(() => {
        const ctx = getCtx();
        if (ctx) ctx.closePath();
        setIsDrawing(false);
    }, [getCtx]);

    const undo = useCallback(() => {
        if (history.length === 0) return;
        const ctx = getCtx();
        const canvas = canvasRef.current;
        if (!ctx || !canvas) return;

        const prevState = history[history.length - 1];
        ctx.putImageData(prevState, 0, 0);
        setHistory((prev) => prev.slice(0, -1));
    }, [history, getCtx]);

    const clearCanvas = useCallback(() => {
        const ctx = getCtx();
        const canvas = canvasRef.current;
        if (!ctx || !canvas) return;

        saveState();
        const rect = canvas.parentElement?.getBoundingClientRect();
        if (!rect) return;
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = "#0f0f1a";
        ctx.fillRect(0, 0, rect.width, rect.height);
        // Redraw grid
        ctx.strokeStyle = "rgba(255,255,255,0.04)";
        ctx.lineWidth = 1;
        for (let x = 0; x < rect.width; x += 40) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, rect.height);
            ctx.stroke();
        }
        for (let y = 0; y < rect.height; y += 40) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(rect.width, y);
            ctx.stroke();
        }
    }, [getCtx, saveState]);

    const sendToCoach = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.toBlob(
            (blob) => {
                if (!blob) return;
                const file = new File([blob], "whiteboard.png", { type: "image/png" });
                onSendImage(file, "Here is my whiteboard sketch for the current problem. Please review my diagram and provide feedback.");
            },
            "image/png"
        );
    }, [onSendImage]);

    return (
        <div className="fixed inset-0 z-50 bg-[#0a0a0f]/95 backdrop-blur-xl flex flex-col animate-fade-in-up">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                <div className="flex items-center gap-3">
                    <Pen className="w-5 h-5 text-violet-400" />
                    <span className="text-sm font-medium text-white/90 tracking-wide">
                        Whiteboard — Sketch your design
                    </span>
                </div>
                <button
                    onClick={onClose}
                    className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
                >
                    <X className="w-4 h-4 text-white/60" />
                </button>
            </div>

            {/* Canvas */}
            <div className="flex-1 relative overflow-hidden">
                <canvas
                    ref={canvasRef}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                    className="absolute inset-0 cursor-crosshair touch-none"
                />
            </div>

            {/* Toolbar */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-white/10 bg-[#0a0a0f]/90 backdrop-blur-xl">
                <div className="flex items-center gap-3">
                    {/* Tool selection */}
                    <button
                        onClick={() => setTool("pen")}
                        className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                            tool === "pen"
                                ? "bg-violet-500/20 text-violet-400 border border-violet-500/30"
                                : "bg-white/5 text-white/40 hover:text-white hover:bg-white/10"
                        }`}
                    >
                        <Pen className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setTool("eraser")}
                        className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                            tool === "eraser"
                                ? "bg-violet-500/20 text-violet-400 border border-violet-500/30"
                                : "bg-white/5 text-white/40 hover:text-white hover:bg-white/10"
                        }`}
                    >
                        <Eraser className="w-4 h-4" />
                    </button>

                    {/* Divider */}
                    <div className="w-px h-8 bg-white/10 mx-1" />

                    {/* Colors */}
                    {COLORS.map((c) => (
                        <button
                            key={c}
                            onClick={() => { setColor(c); setTool("pen"); }}
                            className={`w-7 h-7 rounded-full border-2 transition-all ${
                                color === c && tool === "pen"
                                    ? "border-white scale-110"
                                    : "border-transparent hover:border-white/30"
                            }`}
                            style={{ backgroundColor: c }}
                        />
                    ))}

                    {/* Divider */}
                    <div className="w-px h-8 bg-white/10 mx-1" />

                    {/* Line width */}
                    {LINE_WIDTHS.map((w) => (
                        <button
                            key={w}
                            onClick={() => setLineWidth(w)}
                            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                                lineWidth === w
                                    ? "bg-white/10 text-white"
                                    : "text-white/30 hover:text-white hover:bg-white/5"
                            }`}
                        >
                            {w === 2 ? <Minus className="w-3 h-3" /> :
                             w === 4 ? <Minus className="w-4 h-4" /> :
                             <Circle className="w-3 h-3 fill-current" />}
                        </button>
                    ))}
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={undo}
                        disabled={history.length === 0}
                        className="w-10 h-10 rounded-xl bg-white/5 text-white/40 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all"
                    >
                        <Undo2 className="w-4 h-4" />
                    </button>
                    <button
                        onClick={clearCanvas}
                        className="w-10 h-10 rounded-xl bg-white/5 text-white/40 hover:text-rose-400 hover:bg-rose-500/10 flex items-center justify-center transition-all"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>

                    {/* Divider */}
                    <div className="w-px h-8 bg-white/10 mx-1" />

                    <button
                        onClick={sendToCoach}
                        className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-violet-500 to-indigo-500 hover:from-violet-400 hover:to-indigo-400 text-white text-sm font-medium rounded-xl shadow-[0_0_20px_rgba(139,92,246,0.3)] transition-all"
                    >
                        <Send className="w-4 h-4" />
                        Analyze Canvas
                    </button>
                </div>
            </div>
        </div>
    );
}
