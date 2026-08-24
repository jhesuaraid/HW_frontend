"use client";
import React, { useEffect, useRef, useState, useCallback, useLayoutEffect } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker?url";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, Save, Download, Square, ZoomIn, ZoomOut, ChevronRight, ChevronLeft, AlertCircle, Loader2, HelpCircle } from "lucide-react";
import { RotateCcw, RotateCw, Hand } from 'lucide-react';
import { driver } from "driver.js";
import "driver.js/dist/driver.css";
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

import PdfPage2 from './pdfPage2';


export default function PdfLazyViewer({
    staticPdfUrl = null,
    initialRectangles = [],
    defaultFileName = "document.pdf",
    isPortfolioMode = false,
    autoStartTour = true
}) {
    // Funcion para devolver los numeros que se tienen que colocar en la spreasheet
    function formatNumberRanges(numbers) {
        if (!numbers || !numbers.length) return "";

        const sorted = [...numbers].sort((a, b) => a - b);
        const result = [];
        let start = sorted[0];
        let end = sorted[0];

        for (let i = 1; i <= sorted.length; i++) {
            if (sorted[i] === end + 1) {
                end = sorted[i];
            } else {
                if (start === end) {
                    result.push(`${start}`);
                } else {
                    result.push(`${start}-${end}`);
                }
                start = sorted[i];
                end = sorted[i];
            }
        }

        return result.join(", ");
    }

    const proceduralScrollContainerRef = useRef(null);
    const zoomTargetPageRef = useRef(null);
    const sectionRef = useRef(null);
    const resizeTimeout = useRef(null);
    const activeObjectUrlRef = useRef(null);

    const [measuredWidth, setMeasuredWidth] = useState(null);

    const [pdf, setPdf] = useState(null);
    const [processedPages, setProcessedPages] = useState(0);
    const [maxPages, setMaxPages] = useState(0);
    const [fileName, setFileName] = useState(defaultFileName);
    const [fileFormat, setFileFormat] = useState("pdf");
    const [currentPage, setCurrentPage] = useState(1);
    const [jump, setJump] = useState("1");
    const [imagesToRender, setImagesToRender] = useState([]);

    // Loading states
    const [isLoadingPdf, setIsLoadingPdf] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [isSending, setIsSending] = useState(false);

    // Error states
    const [error, setError] = useState(null);
    const [toast, setToast] = useState(null);
    // Page dimensions PX
    const [maxPagesDimensions, setMaxPagesDimensions] = useState([]);
    const [basePageDimensions, setBasePageDimensions] = useState([]);
    // Container of pages dimensions PX
    const [maxContainerPagesDimensions, setMaxContainerPagesDimensions] = useState(1);
    const [baseContainerPageDimensions, setBaseContainerPageDimensions] = useState(1);
    // px
    const [spaceBetweenPages, setSpaceBetweenPages] = useState(32);
    const [totalSpaceBetweenPages, setTotalSpaceBetweenPages] = useState(0);

    const [pageWithNumbers, setWithNumbers] = useState([]);
    const [selectedRectIndex, setSelectedRectIndex] = useState(-1);

    //Tools
    const [selectedTool, setSelectedTool] = useState("rectangle");
    const [open, setOpen] = useState(true);

    const [rotationGlobal, setRotationGlobal] = useState(0);

    const [rectangles, setRectangles] = useState(initialRectangles);
    const [isDrawing, setIsDrawing] = useState(false);
    const [hoveredRectIndex, setHoveredRectIndex] = useState(-1);
    const startPoint = useRef({ x: 0, y: 0 });

    // Scale state
    const [scale, setScale] = useState(1);
    const [toScale, setToScale] = useState(1);
    const [toScaleString, setToScaleString] = useState("100%");

    // Debounce helpers for scale changes when user presses zoom rapidly
    const scaleChangeTimeoutRef = useRef(null);
    const pendingScaleRef = useRef(null);
    const SCALE_CHANGE_DEBOUNCE_MS = 50;

    const scheduleScaleChange = (newScale, immediate = false) => {
        zoomTargetPageRef.current = currentPage;

        if (immediate) {
            clearTimeout(scaleChangeTimeoutRef.current);
            pendingScaleRef.current = null;
            setToScale(newScale);
            setToScaleString(Math.round(newScale * 100) + "%");
            setScale(newScale);
            return;
        }

        pendingScaleRef.current = newScale;
        setToScale(newScale);
        setToScaleString(Math.round(newScale * 100) + "%");
        clearTimeout(scaleChangeTimeoutRef.current);
        scaleChangeTimeoutRef.current = setTimeout(() => {
            if (pendingScaleRef.current != null) {
                setScale(pendingScaleRef.current);
                pendingScaleRef.current = null;
            }
        }, SCALE_CHANGE_DEBOUNCE_MS);
    };

    // cleanup on unmount
    useEffect(() => {
        return () => {
            clearTimeout(scaleChangeTimeoutRef.current);
            if (activeObjectUrlRef.current) {
                URL.revokeObjectURL(activeObjectUrlRef.current);
            }
        };
    }, []);

    const [fileUrl, setFileUrl] = useState(staticPdfUrl);

    // Constants
    const MIN_SCALE = 0.5;
    const MAX_SCALE = 3.0;
    const SCALE_STEP = 0.1;
    const EXPORT_SCALE = 10;

    // Driver.js Guided Tour
    const startTour = useCallback(() => {
        const driverObj = driver({
            showProgress: true,
            animate: true,
            allowClose: true,
            nextBtnText: 'Next →',
            prevBtnText: '← Back',
            doneBtnText: 'Got it!',
            steps: [
                {
                    element: '#tour-header',
                    popover: {
                        title: 'PDF Editor Pro',
                        description: 'Welcome to PDF Editor Pro! An interactive PDF viewer and annotation extraction engine.',
                        side: 'bottom',
                        align: 'start'
                    }
                },
                {
                    element: '#tour-tools-sidebar',
                    popover: {
                        title: 'Toolbar',
                        description: 'Select tools here: Document Info, Rectangle tool to draw bounding boxes, or Hand tool to drag/move existing boxes.',
                        side: 'right',
                        align: 'start'
                    }
                },
                {
                    element: '#tour-zoom-bar',
                    popover: {
                        title: 'Navigation & Zoom',
                        description: 'Navigate between pages, jump to any page number, adjust zoom level, or rotate pages 90° clockwise / counter-clockwise.',
                        side: 'bottom',
                        align: 'center'
                    }
                },
                {
                    element: '#tour-save-btn',
                    popover: {
                        title: 'Save & Crop Selection',
                        description: 'Captures and processes high-resolution image crops of all your drawn bounding boxes.',
                        side: 'bottom',
                        align: 'end'
                    }
                },
                {
                    element: '#tour-export-btn',
                    popover: {
                        title: 'Export to Word (DOCX)',
                        description: 'Generates a Word document with all your extracted bounding box images neatly formatted.',
                        side: 'bottom',
                        align: 'end'
                    }
                },
                {
                    element: '#tour-right-panel-toggle',
                    popover: {
                        title: 'Properties Panel',
                        description: 'Toggle the right sidebar to manage rectangle layers on the active page.',
                        side: 'left',
                        align: 'center'
                    }
                }
            ]
        });

        driverObj.drive();
    }, []);

    // Auto-start presentation tour when PDF loads on page entry
    const hasTourAutoStartedRef = useRef(false);

    useEffect(() => {
        if (!pdf || isLoadingPdf || !autoStartTour || hasTourAutoStartedRef.current) return;

        hasTourAutoStartedRef.current = true;
        const timer = setTimeout(() => {
            startTour();
        }, 700);

        return () => clearTimeout(timer);
    }, [pdf, isLoadingPdf, autoStartTour, startTour]);

    // Toast notification helper
    const showToast = useCallback((message, type = 'info') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    }, []);

    // Clear error after 5 seconds
    useEffect(() => {
        if (error) {
            const timer = setTimeout(() => setError(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [error]);

    const handleKeyDown = (e) => {
        if (e.key === "Enter") {
           
            e.preventDefault();
            const pageNum = parseInt(jump, 10);
            if (isNaN(pageNum) || pageNum < 1 || pageNum > maxPages) {
                showToast(`Invalid page. Enter a number between 1 and ${maxPages}`, 'error');
                return;
            }
            proceduralScrollToSection(jump);
        }
    };

    const handleKeyDownScale = (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            const scaleValue = parseFloat(toScale) / 100;
            if (isNaN(scaleValue) || scaleValue < MIN_SCALE || scaleValue > MAX_SCALE) {
                showToast(`Invalid scale. Enter a value between ${MIN_SCALE * 100}% and ${MAX_SCALE * 100}%`, 'error');
                return;
            }
            zoomTargetPageRef.current = currentPage;
            setScale(scaleValue);
        }
    };

    // Cargar el PDF cuando cambia fileUrl
    useEffect(() => {
        if (!fileUrl) return;

        const loadPdf = async () => {
            setIsLoadingPdf(true);
            setError(null);

            try {
                const loadingTask = pdfjsLib.getDocument(fileUrl);
                const pdfDoc = await loadingTask.promise;
                const maxPages = pdfDoc.numPages;

                // El nombre del archivo ya fue establecido en handleFileChange

                setPdf(pdfDoc);
                setMaxPages(maxPages);
                setProcessedPages(0);
                const dimensions = [];

                let CONTAINER_DIMENSIONS = (spaceBetweenPages*2);
                let SPACE_BETWEEN = 0;
                // 65 son el alto de la barra de zoom, pagina, rotar. 65px
                let CURRENT_TOP = (spaceBetweenPages);

                for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
                    setProcessedPages(pageNum);
                    const page = await pdfDoc.getPage(pageNum);
                    // Capturamos dimensiones a ESCALA 1 (base)
                    const viewport = page.getViewport({ scale: 1 });
                    const maxSize = Math.max(viewport.width, viewport.height);

                    dimensions.push({
                        dimensions: maxSize,
                        top: CURRENT_TOP
                    });

                    CONTAINER_DIMENSIONS += maxSize;
                    SPACE_BETWEEN += spaceBetweenPages;
                    CURRENT_TOP += (maxSize + spaceBetweenPages);
                }
                //dimensiones iniciales del pdf en la primera carga
                setTotalSpaceBetweenPages(SPACE_BETWEEN);
                setBaseContainerPageDimensions(CONTAINER_DIMENSIONS + SPACE_BETWEEN);
                setMaxContainerPagesDimensions(CONTAINER_DIMENSIONS + SPACE_BETWEEN);
                setBasePageDimensions(dimensions);
                setMaxPagesDimensions(dimensions);

                // Inicializar visualización con el scale actual
                // No se usa porque por defgault es 1
                //const scaledDimensions = dimensions.map(d => d * scale);
                //setMaxPagesDimensions(scaledDimensions);
                
               
                setCurrentPage(1);

            } catch (err) {
                console.error('Error loading PDF:', err);
                setError('Error loading PDF. Please try another file.');
                showToast('Error loading PDF', 'error');
            } finally {
                setIsLoadingPdf(false);
            }
        };

        loadPdf();

    }, [fileUrl, showToast]);

    useEffect(() => {
        // Only update the UI strings here. Scrolling to the zoom target must happen
        // after the page tops/dimensions are recalculated for the new scale.
        setToScaleString(Math.round(scale * 100) + "%");
        setToScale(scale);
    }, [scale]);

    useEffect(() => {
        if (!isNaN(toScaleString)) {
            setToScale(toScaleString);
        }
    }, [toScaleString]);

    // Recalcular dimensiones cuando cambia el scale (SÍNCRONO y RÁPIDO)
    useEffect(() => {
        if (!basePageDimensions.length) return;

        // Simplemente multiplicamos las dimensiones base por el nuevo scale
        const newDimensions = basePageDimensions.map(page => ({
            dimensions: page.dimensions * scale,
            top: page.top * scale
        }));

        console.log("Page dimensions updated for scale:", scale, newDimensions);
        setMaxPagesDimensions(newDimensions);

        // After recomputing scaled positions, ensure we center the zoom target page
        // using the freshly computed dimensions so the position is accurate.
        const target = zoomTargetPageRef.current;
        if (!isNaN(parseInt(target, 10))) {
            const container = proceduralScrollContainerRef.current;
            const page = newDimensions[target - 1];
            if (container && page) {
                const pageCenter = page.top + page.dimensions / 2;
                const targetScrollTop = Math.max(0, Math.round(pageCenter - container.clientHeight / 2));
                // Use instant/auto for zoom centering to avoid visual drift
                container.scrollTo({ top: targetScrollTop, behavior: 'auto' });
                setJump(target);
                setCurrentPage(target);
            }
        }

    }, [scale, basePageDimensions]);

    const changueRotationMas = () => {
        setRotationGlobal((rotationGlobal) => (rotationGlobal + 90) % 360);
    }

    const changueRotationMenos = () => {
        setRotationGlobal((rotationGlobal) => (rotationGlobal - 90 + 360) % 360);
    };

    const exportRectangles = async () => {
        if (!pdf || rectangles.length === 0) {
            showToast("No rectangles to export", 'warning');
            return;
        }

        setIsExporting(true);
        setError(null);

        try {
            // Filter only valid rectangles with valid page number within [1, pdf.numPages]
            const validRectangles = rectangles.filter((r) => {
                const pageNum = Number(r?.page);
                return (
                    !isNaN(pageNum) &&
                    pageNum >= 1 &&
                    pageNum <= pdf.numPages &&
                    typeof r.x === 'number' && !isNaN(r.x) &&
                    typeof r.y === 'number' && !isNaN(r.y) &&
                    typeof r.w === 'number' && !isNaN(r.w) && r.w > 0 &&
                    typeof r.h === 'number' && !isNaN(r.h) && r.h > 0
                );
            });

            if (validRectangles.length === 0) {
                showToast("No valid rectangles to export", 'warning');
                setIsExporting(false);
                return;
            }

            const groupedByPage = validRectangles.reduce((acc, r, i) => {
                const p = Number(r.page);
                if (!acc[p]) acc[p] = [];
                acc[p].push({ ...r, index: i });
                return acc;
            }, {});

            const pagesWithRects = Object.keys(groupedByPage).map(Number).sort((a, b) => a - b);
            setWithNumbers(pagesWithRects);
            const allBlobs = [];

            for (const [pageNumStr, rects] of Object.entries(groupedByPage)) {
                const pageNum = Number(pageNumStr);
                if (isNaN(pageNum) || pageNum < 1 || pageNum > pdf.numPages) {
                    console.warn(`Skipping invalid page request for page: ${pageNumStr}`);
                    continue;
                }

                let page;
                try {
                    page = await pdf.getPage(pageNum);
                } catch (pageErr) {
                    console.error(`Invalid page request for page ${pageNum}:`, pageErr);
                    continue;
                }

                const exportEscale = EXPORT_SCALE;
                const viewport = page.getViewport({ scale: exportEscale, rotation: 0 });

                const width = viewport.width;
                const height = viewport.height;

                const maxSize = Math.max(viewport.width, viewport.height);
                const offsetX = (maxSize - viewport.width) / 2;
                const offsetY = (maxSize - viewport.height) / 2;

                const tempCanvas = document.createElement("canvas");
                tempCanvas.width = width;
                tempCanvas.height = height;
                const ctx = tempCanvas.getContext("2d");

                ctx.save();
                ctx.translate(width / 2, height / 2);
                ctx.translate(-width / 2, -height / 2);
                await page.render({ canvasContext: ctx, viewport }).promise;
                ctx.restore();

                const promises = rects.map((r) => {
                    return new Promise((resolve) => {
                        const tempCroppedCanvas = document.createElement("canvas");
                        const cropW = Math.max(1, Math.round(r.w * exportEscale));
                        const cropH = Math.max(1, Math.round(r.h * exportEscale));

                        tempCroppedCanvas.width = cropW;
                        tempCroppedCanvas.height = cropH;
                        const tempCroppedCtx = tempCroppedCanvas.getContext("2d");

                        tempCroppedCtx.drawImage(
                            tempCanvas,
                            (r.x * exportEscale) - offsetX,
                            (r.y * exportEscale) - offsetY,
                            r.w * exportEscale,
                            r.h * exportEscale,
                            0,
                            0,
                            cropW,
                            cropH
                        );

                        const rotation = r.rotation || 0;
                        const rad = (rotation * Math.PI) / 180;
                        const absW = Math.abs(cropW * Math.cos(rad)) + Math.abs(cropH * Math.sin(rad));
                        const absH = Math.abs(cropW * Math.sin(rad)) + Math.abs(cropH * Math.cos(rad));

                        const finalWidth = Math.max(1, Math.ceil(absW));
                        const finalHeight = Math.max(1, Math.ceil(absH));

                        const croppedCanvas = document.createElement("canvas");
                        croppedCanvas.width = finalWidth;
                        croppedCanvas.height = finalHeight;
                        const croppedCtx = croppedCanvas.getContext("2d");

                        croppedCtx.save();
                        croppedCtx.translate(finalWidth / 2, finalHeight / 2);
                        croppedCtx.rotate(rad);
                        croppedCtx.drawImage(
                            tempCroppedCanvas,
                            -cropW / 2,
                            -cropH / 2,
                            cropW,
                            cropH
                        );
                        croppedCtx.restore();

                        tempCroppedCanvas.width = 0;
                        tempCroppedCanvas.height = 0;

                        croppedCanvas.toBlob((blob) => {
                            croppedCanvas.width = 0;
                            croppedCanvas.height = 0;
                            resolve({
                                blob,
                                page: Number(r.page),
                                index: r.index,
                                h: finalHeight / exportEscale,
                                w: finalWidth / exportEscale,
                            });
                        }, "image/png");
                    });
                });

                const blobs = await Promise.all(promises);
                allBlobs.push(...blobs);
                tempCanvas.width = 0;
                tempCanvas.height = 0;
            }

            setImagesToRender(allBlobs);
            showToast(`${allBlobs.length} images exported successfully`, 'success');
        } catch (err) {
            console.error('Error exporting rectangles:', err);
            setError('Error exporting rectangles. Please try again.');
            showToast('Error exporting rectangles', 'error');
        } finally {
            setIsExporting(false);
        }
    };

    const sendImagesToBackend = async () => {
        setIsSending(true);
        setError(null);

        try {
            const formData = new FormData();

            imagesToRender.forEach((item, i) => {
                formData.append("images", item.blob, `page${item.page}_rect${item.index}.png`);
            });

            // Determinar host del backend de forma segura para desarrollo (localhost) y producción (HTTPS / Vercel)
            let activeHost = import.meta.env.VITE_PUBLIC_HOST || import.meta.env.VITE_API_URL;
            if (!activeHost) {
                const isLocal = typeof window !== "undefined" && 
                    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
                activeHost = isLocal ? "http://127.0.0.1:8000" : (typeof window !== "undefined" ? window.location.origin : "");
            }
            activeHost = activeHost.replace(/\/$/, "");

            const res = await fetch(`${activeHost}/test/TestView/`, {
                method: "POST",
                body: formData,
            });

            if (!res.ok) throw new Error("Error sending images");

            const blob = await res.blob();

            // Crear URL temporal
            const url = window.URL.createObjectURL(blob);

            // Crear enlace de descarga
            const a = document.createElement("a");
            a.href = url;
            a.download = `${fileName}.docx`;
            document.body.appendChild(a);
            a.click();
            a.remove();

            // Liberar URL temporal
            window.URL.revokeObjectURL(url);

            showToast('Document exported successfully', 'success');
        } catch (err) {
            console.error('Error sending images to backend:', err);
            setError('Error sending images to server. Please try again.');
            showToast('Error exporting document', 'error');
        } finally {
            setIsSending(false);
        }
    };

    // ---- FUNCIÓN PARA IR A UNA PÁGINA ----
    // Ref para contar cuántas páginas se están renderizando actualmente
    const renderingCountRef = useRef(0);

    const handlePageRenderStart = useCallback(() => {
        renderingCountRef.current += 1;
    }, []);

    const handlePageRenderFinish = useCallback(() => {
        renderingCountRef.current = Math.max(0, renderingCountRef.current - 1);
    }, []);

    const proceduralScrollToSection = (inputValue) => {
        const target = parseInt(inputValue, 10);

        if (isNaN(target) || target < 1 || target > maxPagesDimensions.length) {
            return;
        }
        const container = proceduralScrollContainerRef.current;
        if (!container) return;

        // Try to find an in-DOM marker for the page (works when the page is mounted).
        const marker = document.querySelector(`[data-pdf-marker=\"${target}\"]`);

        if (marker) {
            // Use 'auto' for immediate/direct jump (not smooth)
            marker.scrollIntoView({ behavior: "auto", block: "center" });
            setJump(target);
            setCurrentPage(target);
            return;
        }

        // Fallback: use precomputed page top/dimensions to scroll the container to the page
        const page = maxPagesDimensions[target - 1];
        if (page) {
            // center the page vertically in the container
            const pageCenter = page.top + page.dimensions / 2;
            const targetScrollTop = Math.max(0, Math.round(pageCenter - container.clientHeight / 2));
            // direct jump (no smooth animation)
            container.scrollTo({ top: targetScrollTop, behavior: 'auto' });
            setJump(target);
            setCurrentPage(target);
        }
    };

    // Measure the section width after the PDF/pages are ready and on resize (debounced)
    useEffect(() => {
        const el = sectionRef.current;
        if (!el) return;

        const measure = () => {
            // use getBoundingClientRect to get the rendered width
            const w = Math.round(el.getBoundingClientRect().width);
            setMeasuredWidth(w);
        };

        // Measure on next paint to ensure layout is ready
        requestAnimationFrame(measure);

        const onResize = () => {
            clearTimeout(resizeTimeout.current);
            resizeTimeout.current = setTimeout(() => {
                measure();
            }, 120);
        };

        window.addEventListener("resize", onResize, { passive: true });

        return () => {
            window.removeEventListener("resize", onResize);
            clearTimeout(resizeTimeout.current);
        };
    }, [pdf, maxPagesDimensions.length]);

    // ---- Deteccion de scroll para la carga procedural ----
    const currentPageRef = useRef(1);

    useEffect(() => {
        const container = proceduralScrollContainerRef.current;
        if (!container || !maxPagesDimensions.length) return;

        let ticking = false;
        const update = () => {
            const scrollTop = container.scrollTop;
            const midY = scrollTop + container.clientHeight / 2;

            const pages = maxPagesDimensions || [];
            let newCurrent = 1;

            for (let i = 0; i < pages.length; i++) {
                const page = pages[i];
                if (!page) continue;

                const pageTop = page.top || 0;
                const pageBottom = pageTop + (page.dimensions || 0);

                if (midY >= pageTop && midY < pageBottom) {
                    newCurrent = i + 1;
                    break;
                }

                if (midY < pageTop) {
                    newCurrent = Math.max(1, i);
                    break;
                }

                if (i === pages.length - 1) {
                    newCurrent = pages.length;
                }
            }

            if (currentPageRef.current !== newCurrent) {
                currentPageRef.current = newCurrent;
                setCurrentPage(newCurrent);
                setJump(newCurrent);
            }
        };

        const onScroll = () => {
            if (!ticking) {
                requestAnimationFrame(() => {
                    update();
                    ticking = false;
                });
                ticking = true;
            }
        };

        container.addEventListener("scroll", onScroll, { passive: true });
        window.addEventListener("resize", update, { passive: true });

        update();
        return () => {
            container.removeEventListener("scroll", onScroll);
            window.removeEventListener("resize", update);
        };
    }, [maxPagesDimensions]);



    return (
        <div className="min-h-screen max-h-screen flex flex-col bg-slate-100">
            {/* PDF Editor UI */}
            <div className={`min-h-screen max-h-screen flex flex-col bg-slate-100 ${!fileUrl ? 'hidden' : ''}`}>
                {/* Toast Notification */}
                <AnimatePresence>
                    {toast && (
                        <motion.div
                            initial={{ opacity: 0, y: -50 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -50 }}
                            className={`fixed top-4 right-4 z-[100] px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 ${toast.type === 'error' ? 'bg-red-500 text-white' :
                                toast.type === 'success' ? 'bg-green-500 text-white' :
                                    toast.type === 'warning' ? 'bg-yellow-500 text-white' :
                                        'bg-blue-500 text-white'
                                }`}
                        >
                            {toast.type === 'error' && <AlertCircle className="w-5 h-5" />}
                            {toast.type === 'success' && <FileText className="w-5 h-5" />}
                            <span className="font-medium">{toast.message}</span>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Error Banner */}
                {error && (
                    <div className="w-full bg-red-50 border-b border-red-200 px-6 py-3 flex items-center gap-3">
                        <AlertCircle className="w-5 h-5 text-red-600" />
                        <p className="text-red-800 text-sm flex-1">{error}</p>
                        <button
                            onClick={() => setError(null)}
                            className="text-red-600 hover:text-red-800 font-medium text-sm"
                        >
                            Close
                        </button>
                    </div>
                )}

                {/* Top Toolbar */}
                <header id="tour-header" className="w-full bg-white shadow-sm border-b border-slate-200 flex items-center justify-between px-6 py-3">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-sky-50 rounded-lg border border-sky-100">
                            <FileText className="w-6 h-6 text-sky-600" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="font-semibold text-slate-800 text-lg">PDF Editor Pro</h1>
                                {isPortfolioMode && (
                                    <span className="px-2 py-0.5 text-xs font-semibold bg-gradient-to-r from-sky-500 to-indigo-600 text-white rounded-full shadow-sm">
                                        PORTFOLIO DEMO
                                    </span>
                                )}
                            </div>
                            <p className="text-xs text-slate-500">Interactive Editor & Annotation Extractor</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            id="tour-guide-btn"
                            onClick={startTour}
                            className="px-3 py-2 rounded-lg border border-sky-200 text-sky-700 bg-sky-50 hover:bg-sky-100 text-sm font-medium transition flex items-center gap-2 shadow-sm"
                            title="Start interactive tour guide"
                        >
                            <HelpCircle className="w-4 h-4 text-sky-600" /> Tour Guide
                        </button>
                        <button
                            id="tour-save-btn"
                            className={`px-3 py-2 rounded-lg bg-sky-600 text-white text-sm font-medium flex items-center gap-2 transition ${isExporting ? 'opacity-75 cursor-wait' : 'hover:bg-sky-700 shadow-sm'
                                }`}
                            title="Save drawn rectangles"
                            onClick={exportRectangles}
                            disabled={isExporting}
                        >
                            {isExporting ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" /> Processing...
                                </>
                            ) : (
                                <>
                                    <Save className="w-4 h-4" /> Save selection
                                </>
                            )}
                        </button>
                        <button
                            id="tour-export-btn"
                            className={`px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium flex items-center gap-2 transition ${imagesToRender.length === 0 || isSending ? "opacity-50 cursor-not-allowed" : "hover:bg-emerald-700 shadow-sm"
                                }`}
                            onClick={sendImagesToBackend}
                            disabled={imagesToRender.length === 0 || isSending}
                        >
                            {isSending ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" /> Generating...
                                </>
                            ) : (
                                <>
                                    <Download className="w-4 h-4" /> Download DOCX
                                </>
                            )}
                        </button>
                    </div>
                </header>

                {/* Loading Process Overlay */}
                {isLoadingPdf && (
                    <div className="absolute inset-0 z-50 bg-white/80 backdrop-blur-sm flex items-center justify-center">
                        <div className="flex flex-col items-center gap-4 p-6 bg-white rounded-xl shadow-2xl border border-slate-200">
                            <Loader2 className="w-12 h-12 text-sky-600 animate-spin" />
                            <div className="text-center">
                                <h3 className="text-lg font-semibold text-slate-800">Processing Document</h3>
                                <p className="text-slate-600 mt-1">
                                    Analyzing page <span className="font-bold text-sky-600">{processedPages}</span> of <span className="font-bold text-slate-800">{maxPages}</span>
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Main Editor Layout */}
                <main className="flex flex-1 overflow-hidden">
                    {/* Sidebar Tools */}
                    <aside id="tour-tools-sidebar" className="w-20 bg-white border-r border-slate-200 flex flex-col items-center py-6 gap-5">
                       
                        <button onClick={() => setSelectedTool("rectangle")}
                            className={`w-12 h-12 flex items-center justify-center rounded-xl transition ${selectedTool === "rectangle" ? "bg-sky-100 border border-sky-400" : "hover:bg-slate-100"
                                }`} title="Rectangle">
                            <Square className="w-5 h-5 text-slate-700" />
                        </button>
                       
                    </aside>
                    {/* Document Viewer */}
                    <section
                        ref={sectionRef}
                        className="flex-1 flex bg-slate-50"
                        style={{ width: measuredWidth ? `${measuredWidth}px` : "100%", maxWidth: "100%" }}
                    >
                        <motion.div
                            initial={{ scale: 0.98, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ duration: 0.4 }}
                            className="relative w-[99%] h-[99%] bg-white shadow-xl rounded-2xl border border-slate-200 overflow-hidden"
                        >
                            <div id="tour-zoom-bar" className="absolute top-0 left-0 w-full bg-slate-100 border-b border-slate-200 px-4 py-2 flex items-center justify-between z-50">
                                <span className="text-sm font-medium text-slate-700">{fileName}</span>
                                <div className="flex items-center gap-4">


                                    <button className="flex items-center justify-center hover:bg-slate-100" title="Previous Page" onClick={() => proceduralScrollToSection(currentPage - 1)}>
                                        <ChevronLeft className="w-5 h-5 text-slate-700" />
                                    </button>
                                    {/*MODIFICAR xxx ya hay otra funcion el proceduralScrollToSection */}
                                    <div className="flex items-center gap-4">
                                        <input

                                            min="1"
                                            max={maxPagesDimensions.length}
                                            value={jump}
                                            onChange={(e) => setJump(e.target.value)}
                                            onKeyDown={handleKeyDown}
                                            className="w-20 sm:w-24 px-2 sm:px-3 py-1 border rounded text-sm sm:text-base"
                                            placeholder="Go to..."
                                        />
                                        <span className="text-ms text-slate-500">/ {maxPages}</span>
                                    </div>

                                    <button className="flex items-center justify-center hover:bg-slate-100" title="Next Page" onClick={() => proceduralScrollToSection(currentPage + 1)}>
                                        <ChevronRight className="w-5 h-5 text-slate-700" />
                                    </button>
                                    <button
                                        className={`w-12 h-12 flex items-center justify-center rounded-xl hover:bg-slate-100 ${scale <= MIN_SCALE ? 'opacity-50 cursor-not-allowed' : ''
                                            }`}
                                        title="Zoom Out"
                                        onClick={() => {
                                            const newScale = Math.max(MIN_SCALE, scale - SCALE_STEP);
                                            scheduleScaleChange(newScale);
                                        }}
                                        disabled={scale <= MIN_SCALE}
                                    >
                                        <ZoomOut className="w-5 h-5 text-slate-700" />
                                    </button>

                                    <div className="flex items-center gap-4">
                                        <input

                                            min="1"
                                            max={maxPagesDimensions.length}
                                            value={toScaleString}
                                            onChange={(e) => setToScaleString(e.target.value)}
                                            onKeyDown={handleKeyDownScale}
                                            className="w-20 sm:w-24 px-2 sm:px-3 py-1 border rounded text-sm sm:text-base"
                                            placeholder="Go to..."
                                        />

                                    </div>
                                    <button
                                        className={`w-12 h-12 flex items-center justify-center rounded-xl hover:bg-slate-100 ${scale >= MAX_SCALE ? 'opacity-50 cursor-not-allowed' : ''
                                            }`}
                                        title="Zoom In"
                                        onClick={() => {
                                            const newScale = Math.min(MAX_SCALE, scale + SCALE_STEP);
                                            scheduleScaleChange(newScale);
                                        }}
                                        disabled={scale >= MAX_SCALE}
                                    >
                                        <ZoomIn className="w-5 h-5 text-slate-700" />
                                    </button>
                                    <button className="flex items-center justify-center hover:bg-slate-100" title="Rotate Right" onClick={() => changueRotationMenos()}>
                                        <RotateCcw className="w-5 h-5 text-slate-700" />
                                    </button>
                                    <button className="flex items-center justify-center hover:bg-slate-100" title="Rotate Left" onClick={() => changueRotationMas()}>
                                        <RotateCw className="w-5 h-5 text-slate-700" />
                                    </button>
                                </div>

                                <span className="text-xs text-slate-500">Page {currentPage} of {maxPages}</span>
                            </div>
                            {/* CARGADOR PROCEDURAL */}
                            <div
                                ref={proceduralScrollContainerRef}
                                className="relative h-[90%] overflow-scroll mt-[65px]"
                                style={{
                                    background:
                                        "linear-gradient(to bottom, #a7d7ff 0%, #a7d7ff 50%, #a7d7ff 50%, #a7d7ff 100%)",
                                }}
                            >

                                <div className="pt-24 pb-24" style={{ height: `${maxContainerPagesDimensions*scale}px`, width: '100%' }}>
                                    {maxPagesDimensions.map((px, i) => {
                                        const index = i + 1;
                                        const isVisible = Math.abs(currentPage - index) <= 1;

                                        // If the page is not in the visible range, don't render anything
                                        if (!isVisible) return null;

                                        return (
                                            <div
                                                key={index}
                                                className="absolute w-[100%] rounded-2xl transition-all duration-300"
                                                style={{ height: `${px.dimensions}px`, marginLeft: "auto", marginRight: "auto", top: `${px.top}px` }}

                                            >
                                                <div
                                                    className=""
                                                    style={{
                                                        position: "absolute",
                                                        top: "6px",
                                                        left: 0,
                                                        width: "100%",
                                                        height: "2px",
                                                        background: "none",
                                                        pointerEvents: "none",
                                                        zIndex: 10,
                                                    }}
                                                />

                                                <PdfPage2
                                                    pdf={pdf}
                                                    pageNumber={index}
                                                    rotation={rotationGlobal}
                                                    rectangles={rectangles}
                                                    setRectangles={setRectangles}
                                                    isDrawing={isDrawing}
                                                    setIsDrawing={setIsDrawing}
                                                    startPoint={startPoint}
                                                    scale={scale}
                                                    hoveredRectIndex={hoveredRectIndex}
                                                    setHoveredRectIndex={setHoveredRectIndex}
                                                    selectedRectIndex={selectedRectIndex}
                                                    setSelectedRectIndex={setSelectedRectIndex}
                                                    selectedTool={selectedTool}
                                                    onRenderStart={handlePageRenderStart}
                                                    onRenderFinish={handlePageRenderFinish}
                                                />

                                            

                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                        </motion.div>
                    </section>

                    {/* Right Sidebar: Properties / Layers */}
                    {/* Botón flotante para mostrar/ocultar */}
                    <button
                        id="tour-right-panel-toggle"
                        onClick={() => setOpen(!open)}
                        className="absolute right-0 top-1/2 -translate-y-1/2 z-20 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-l-xl p-2 transition-all"
                    >
                        {open ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
                    </button>

                    <AnimatePresence>
                        {open && (
                            <motion.aside
                                initial={{ x: "100%" }}
                                animate={{ x: 0 }}
                                exit={{ x: "100%" }}
                                transition={{ type: "tween", duration: 0.3 }}
                                className="w-64 bg-white border-l border-slate-200 flex flex-col shadow-lg"
                            >
                                <div className="px-4 py-3 border-b border-slate-200 font-medium text-slate-700 capitalize">
                                    {selectedTool}
                                </div>

                                <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
                                    {/* 👇 contenido según herramienta seleccionada */}
                                    {(selectedTool === "rectangle" || selectedTool === "move") && (
                                        <>
                                            <label className="block text-slate-600 mb-1">Rectangles on this page</label>
                                            <ul style={{ listStyle: "none", padding: 0 }}>
                                                {rectangles
                                                    .map((r, index) => ({ ...r, index }))
                                                    .filter((r) => r.page === currentPage)
                                                    .map((r, i) => (
                                                        <li
                                                            key={r.index}
                                                            className={`flex justify-between items-center p-2 mb-2 rounded-md border ${r.index === selectedRectIndex ? "bg-cyan-50 border-cyan-400" : "border-slate-200"
                                                                } cursor-pointer`}
                                                            onClick={() => setSelectedRectIndex(r.index)}
                                                        >
                                                            <span>
                                                                #{i + 1} ({Math.round(r.x)}, {Math.round(r.y)})
                                                            </span>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setRectangles((prev) => prev.filter((_, idx) => idx !== r.index));
                                                                    if (selectedRectIndex === r.index) setSelectedRectIndex(-1);
                                                                }}
                                                                className="bg-red-500 hover:bg-red-600 text-white rounded px-2 py-1 text-xs"
                                                            >
                                                                X
                                                            </button>
                                                        </li>
                                                    ))}
                                            </ul>
                                        </>
                                    )}

                                    {selectedTool === "info" && (
                                        <>
                                            <label className="block text-slate-600 mb-1">Pages with rectangles</label>
                                            {formatNumberRanges(pageWithNumbers)}
                                        </>
                                    )}

                                    {!selectedTool && (
                                        <div className="text-center text-slate-400">
                                            Select a tool to view its properties
                                        </div>
                                    )}
                                </div>
                            </motion.aside>
                        )}
                    </AnimatePresence>

                </main>

                {/* Footer */}
                <footer className="bg-white border-t border-slate-200 py-2 text-center text-xs text-slate-500">
                    © {new Date().getFullYear()} PDF Editor Pro — Demo UI
                </footer>
            </div>
            {/* End PDF Editor UI */}
        </div>
    );
}



