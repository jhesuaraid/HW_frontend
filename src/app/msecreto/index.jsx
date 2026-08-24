import React, { useState, useRef, useEffect } from "react";
import PDF from "@/components/pdf.jsx";
import { UploadCloud, FileText, ArrowLeft, RefreshCw, ShieldCheck } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * Vista Secreta (/msecreto)
 * Permite al usuario cargar cualquier archivo PDF local personalizado
 * y utilizar todas las herramientas de edición, dibujo de cajas y exportación a Word.
 */
export default function MSecreto() {
    const [pdfFile, setPdfFile] = useState(null);
    const [pdfUrl, setPdfUrl] = useState(null);
    const [fileName, setFileName] = useState("");
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef(null);

    // Limpieza de URL temporal en desmontaje
    useEffect(() => {
        return () => {
            if (pdfUrl) {
                URL.revokeObjectURL(pdfUrl);
            }
        };
    }, [pdfUrl]);

    const handleFileSelected = (file) => {
        if (!file) return;

        if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
            alert("Por favor selecciona un archivo en formato PDF válido.");
            return;
        }

        // Limpiar URL previa si existía
        if (pdfUrl) {
            URL.revokeObjectURL(pdfUrl);
        }

        const newUrl = URL.createObjectURL(file);
        const baseName = file.name.replace(/\.[^/.]+$/, "");

        setPdfFile(file);
        setPdfUrl(newUrl);
        setFileName(baseName);
    };

    const handleFileInputChange = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            handleFileSelected(file);
        }
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) {
            handleFileSelected(file);
        }
    };

    const handleReset = () => {
        if (pdfUrl) {
            URL.revokeObjectURL(pdfUrl);
        }
        setPdfFile(null);
        setPdfUrl(null);
        setFileName("");
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    return (
        <div className="w-full min-h-screen bg-slate-900 text-slate-100 flex flex-col">
            <AnimatePresence mode="wait">
                {!pdfUrl ? (
                    // Pantalla de carga inicial (Dropzone)
                    <motion.div
                        key="upload-screen"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.3 }}
                        className="flex-1 flex flex-col items-center justify-center p-6"
                    >
                        <div className="max-w-xl w-full bg-slate-800/80 border border-slate-700 rounded-2xl shadow-2xl p-8 backdrop-blur-md">
                            {/* Cabecera */}
                            <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-700">
                                <div className="flex items-center gap-3">
                                    <div className="p-2.5 bg-indigo-500/20 text-indigo-400 rounded-xl border border-indigo-500/30">
                                        <ShieldCheck className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <h1 className="text-xl font-bold text-white tracking-wide">
                                            Panel Privado (/msecreto)
                                        </h1>
                                        <p className="text-xs text-slate-400">
                                            Carga tu propio PDF para edición y extracción
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Zona de Drag & Drop */}
                            <div
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
                                onClick={() => fileInputRef.current?.click()}
                                className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center cursor-pointer transition-all ${
                                    isDragging
                                        ? "border-indigo-400 bg-indigo-500/10 scale-[1.02]"
                                        : "border-slate-600 bg-slate-900/50 hover:border-slate-500 hover:bg-slate-900/80"
                                }`}
                            >
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    onChange={handleFileInputChange}
                                    accept="application/pdf,.pdf"
                                    className="hidden"
                                />

                                <div className="w-16 h-16 rounded-full bg-indigo-600/20 flex items-center justify-center mb-4 text-indigo-400">
                                    <UploadCloud className="w-8 h-8" />
                                </div>

                                <h3 className="text-base font-semibold text-slate-200 mb-1">
                                    Arrastra y suelta tu archivo PDF aquí
                                </h3>
                                <p className="text-xs text-slate-400 mb-4">
                                    o haz clic para explorar tus archivos locales
                                </p>

                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition shadow-sm">
                                    <FileText className="w-3.5 h-3.5" />
                                    Seleccionar PDF
                                </span>
                            </div>

                            {/* Footer informativo */}
                            <div className="mt-6 text-center">
                                <p className="text-xs text-slate-500">
                                    El archivo se procesa localmente en tu navegador mediante Canvas y WebAssembly.
                                </p>
                            </div>
                        </div>
                    </motion.div>
                ) : (
                    // Pantalla del editor con el PDF cargado
                    <motion.div
                        key="editor-screen"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex-1 flex flex-col"
                    >
                        {/* Barra superior de control rápido */}
                        <div className="w-full bg-slate-900 border-b border-slate-800 px-6 py-2 flex items-center justify-between z-30">
                            <div className="flex items-center gap-3">
                                <span className="px-2 py-0.5 text-xs font-semibold bg-indigo-600 text-white rounded">
                                    MODO SECRETO
                                </span>
                                <span className="text-sm font-medium text-slate-300 truncate max-w-xs md:max-w-md">
                                    📄 {pdfFile?.name}
                                </span>
                            </div>

                            <button
                                onClick={handleReset}
                                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-lg text-xs font-medium flex items-center gap-1.5 transition"
                                title="Cargar otro documento PDF"
                            >
                                <RefreshCw className="w-3.5 h-3.5" />
                                Cambiar PDF
                            </button>
                        </div>

                        {/* Visor / Editor PDF */}
                        <div className="flex-1">
                            <PDF
                                staticPdfUrl={pdfUrl}
                                defaultFileName={fileName ? `${fileName}.pdf` : "document.pdf"}
                                initialRectangles={[]}
                                isPortfolioMode={false}
                                autoStartTour={false}
                            />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
