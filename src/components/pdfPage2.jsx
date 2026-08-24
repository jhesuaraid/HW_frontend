"use client";
// Indicamos "use client" porque este componente usa APIs del navegador (canvas, eventos, refs).
// En Next.js 13+ esto fuerza que el archivo se ejecute en el cliente.

import { useEffect, useRef, useState } from "react";


/* =========================
   Funciones utilitarias
   ========================= */

/**
 * rotatePoint(x, y, angle, cx, cy)
 * Rota el punto (x,y) alrededor del centro (cx,cy) un ángulo en grados.
 *
 * - angle: grados (positivo = sentido horario en este código de transformación).
 * - Usamos radianes para las funciones trigonométricas.
 *
 * Fórmula:
 *  dx = x - cx
 *  dy = y - cy
 *  x' = cx + dx * cos(rad) - dy * sin(rad)
 *  y' = cy + dx * sin(rad) + dy * cos(rad)
 *
 * Esta función es usada tanto para dibujar rectángulos rotados como para
 * transformar coordenadas del mouse cuando hay rotación aplicada.
 */
const rotatePoint = (x, y, angle, cx, cy) => {
  const rad = (angle * Math.PI) / 180; // convertir a radianes
  const dx = x - cx;
  const dy = y - cy;
  return {
    x: cx + dx * Math.cos(rad) - dy * Math.sin(rad),
    y: cy + dx * Math.sin(rad) + dy * Math.cos(rad),
  };
};


/* =========================
   Componente PdfPage
   ========================= */

/**
 * Props esperadas:
 * - pdf: objeto PDF cargado por pdfjs (resultado de pdfjsLib.getDocument(...).promise)
 * - pageNumber: número de página a renderizar (1-indexed)
 * - rotation: grados de rotación aplicados a la página (0, 90, 180, 270)
 * - rectangles: array de rectángulos guardados [{ page, x, y, w, h }]
 * - setRectangles: setter para añadir/modificar rectángulos
 * - currentPage, isDrawing, setIsDrawing, startPoint: control de dibujo externo
 * - scale: zoom/escala al renderizar la página
 * - hoveredRectIndex, setHoveredRectIndex, selectedRectIndex: control de UI
 *
 * Observación: se asume que las coordenadas x,y,w,h de los rectángulos
 * están en las mismas unidades que las coordenadas del canvas (sin escalado extra).
 */
export default function PdfPage({
  pdf,
  pageNumber,
  rotation = 0,
  pageSize: externalPageSize = null,
  rectangles,
  setRectangles,
  isDrawing,
  setIsDrawing,
  startPoint,
  scale,
  hoveredRectIndex,
  selectedRectIndex,
  selectedTool = null,
  setSelectedRectIndex = () => { },
}) {
  // Referencias a los canvas:
  // - canvasRef: canvas que contiene la página renderizada (imagen).
  // - staticCanvasRef: capa encima para dibujar rectángulos "estáticos" (persistentes).
  // - dynamicCanvasRef: capa para dibujar rectángulo en progreso (mientras se arrastra).
  const canvasRef = useRef(null);
  const staticCanvasRef = useRef(null);
  const dynamicCanvasRef = useRef(null);

  // Estado local para saber si ya se renderizó la página (mostrar loading, etc.)
  const [rendered, setRendered] = useState(false);

  // isMounted se usa para evitar setState después del unmount (race conditions).
  const isMounted = useRef(false);




  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  /* ======================================
     Efecto principal: renderizar la página
     ====================================== */
  const pageSizes = useRef({});
  const renderTaskRef = useRef(null);

  useEffect(() => {
    if (!pdf) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let isCancelled = false;

    const renderPage = async () => {
      // Cancel previous rendering task if running to prevent "Canvas is already rendering" error
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          // ignore cancellation errors
        }
        renderTaskRef.current = null;
      }

      try {
        const page = await pdf.getPage(pageNumber);
        if (isCancelled) return;

        const viewport = page.getViewport({ scale: scale, rotation });

        const measured = externalPageSize || { width: viewport.width, height: viewport.height };
        pageSizes.current[pageNumber] = {
          width: measured.width,
          height: measured.height,
        };

        const maxSize = Math.max(viewport.width, viewport.height);
        canvas.width = maxSize;
        canvas.height = maxSize;

        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#a7d7ff";
        ctx.fillRect(0, 0, maxSize, maxSize);

        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = viewport.width;
        tempCanvas.height = viewport.height;
        const tempCtx = tempCanvas.getContext("2d");

        // Render page with cancellation support
        const renderTask = page.render({ canvasContext: tempCtx, viewport });
        renderTaskRef.current = renderTask;

        await renderTask.promise;
        renderTaskRef.current = null;

        if (isCancelled) {
          tempCanvas.width = 0;
          tempCanvas.height = 0;
          return;
        }

        const offsetX = (maxSize - viewport.width) / 2;
        const offsetY = (maxSize - viewport.height) / 2;

        ctx.drawImage(tempCanvas, offsetX, offsetY);

        // Free tempCanvas texture memory immediately
        tempCanvas.width = 0;
        tempCanvas.height = 0;

        if (staticCanvasRef.current && dynamicCanvasRef.current) {
          staticCanvasRef.current.width = canvas.width;
          staticCanvasRef.current.height = canvas.height;
          dynamicCanvasRef.current.width = canvas.width;
          dynamicCanvasRef.current.height = canvas.height;
          drawStaticRectangles();
        }

        if (isMounted.current) setRendered(true);
      } catch (err) {
        if (err?.name !== "RenderingCancelledException") {
          console.error("Render error on page", pageNumber, err);
        }
      }
    };

    renderPage();

    return () => {
      isCancelled = true;
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          // ignore
        }
        renderTaskRef.current = null;
      }
    };
  }, [pdf, pageNumber, rotation, scale]);

  /**
   * drawStaticRectangles()
   * Dibuja todos los rectángulos almacenados en la capa estática.
   * - Recorre `rectangles` y, si pertenecen a la página actual, los proyecta
   *   rotándolos alrededor del centro del canvas y los dibuja con distintos estilos
   *   según si están seleccionados, hover o normales.
   */
  const drawStaticRectangles = () => {
    const ctx = staticCanvasRef.current.getContext("2d");

    // Limpiamos la capa antes de redibujar
    ctx.clearRect(0, 0, staticCanvasRef.current.width, staticCanvasRef.current.height);
    ctx.save();

    // Centro del canvas: se usa como centro de rotación
    const cx = (staticCanvasRef.current.width / 2) / scale;
    const cy = (staticCanvasRef.current.height / 2) / scale;

    // Recorremos todos los rectángulos globales
    rectangles.forEach((r, index) => {
      // Solo los que pertenezcan a la página actual
      if (r.page === pageNumber) {
        // Calculamos las 4 esquinas del rectángulo y las rotamos
        const p1 = rotatePoint(r.x, r.y, rotation, cx, cy);
        const p2 = rotatePoint(r.x + r.w, r.y, rotation, cx, cy);
        const p3 = rotatePoint(r.x + r.w, r.y + r.h, rotation, cx, cy);
        const p4 = rotatePoint(r.x, r.y + r.h, rotation, cx, cy);

        // Dibujamos el polígono resultante (rectángulo posiblemente rotado)
        ctx.beginPath();
        /**
        ctx.moveTo(p1.x , p1.y );
        ctx.lineTo(p2.x , p2.y );
        ctx.lineTo(p3.x , p3.y );
        ctx.lineTo(p4.x , p4.y );
        **/
        ctx.moveTo(p1.x * scale, p1.y * scale);
        ctx.lineTo(p2.x * scale, p2.y * scale);
        ctx.lineTo(p3.x * scale, p3.y * scale);
        ctx.lineTo(p4.x * scale, p4.y * scale);

        ctx.closePath();

        // Estilos distintos si está seleccionado / hovered / normal
        if (index === selectedRectIndex) {
          ctx.strokeStyle = "green";
          ctx.lineWidth = 3;
          ctx.fillStyle = "rgba(0, 255, 0, 0.2)";
          ctx.fill(); // rellenamos el rectángulo seleccionado
        } else if (index === hoveredRectIndex) {
          ctx.strokeStyle = "blue";
          ctx.lineWidth = 3;
        } else {
          ctx.strokeStyle = "red";
          ctx.lineWidth = 2;
        }
        ctx.stroke();
      }
    });

    ctx.restore();
  };

  // Si cambian los rectángulos, hover, selección o rotación, redibujamos la capa estática.
  useEffect(() => {
    if (staticCanvasRef.current) {
      drawStaticRectangles();
    }
    // Dependencias: cuando rectangles cambia, hoveredRectIndex, selectedRectIndex, rotation o scale
  }, [rectangles, hoveredRectIndex, selectedRectIndex, rotation, scale]);

  /* ======================================
     Manejo de dibujo con rotación
     ====================================== */

  /**
   * handleMouseDown
   * Inicia el modo dibujo:
   * - marca isDrawing = true (externo)
   * - calcula la posición inicial en coordenadas transformadas (des-rotadas)
   *
   * Importante: convertimos las coordenadas del mouse (relativas al boundingClientRect)
   * y luego aplicamos rotatePoint con -rotation para "des-rotar" el punto y trabajar
   * en un sistema de coordenadas no rotado (donde x,y,w,h están guardados).
   */
  // Extended mouse down to detect clicks on existing rects and start dragging
  const handlePointerDown = (clientX, clientY, originalEvent) => {
    const rect = dynamicCanvasRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const cx = dynamicCanvasRef.current.width / 2;
    const cy = dynamicCanvasRef.current.height / 2;
    const basePoint = rotatePoint(x, y, -rotation, cx, cy);

    // If move tool active, check if click is on existing rect (topmost first)
    if (selectedTool === "move") {
      // iterate rectangles from last to first to pick topmost
      for (let i = rectangles.length - 1; i >= 0; i--) {
        const r = rectangles[i];
        if (r.page !== pageNumber) continue;
        if (pointInRect(basePoint.x / scale, basePoint.y / scale, r)) {
          // If this rect is NOT selected, select it but DO NOT start dragging.
          if (selectedRectIndex !== i) {
            setSelectedRectIndex(i);
            // prevent page scroll on touch
            if (originalEvent && originalEvent.preventDefault) originalEvent.preventDefault();
            return true;
          }

          // If it is selected, start dragging
          draggingIndexRef.current = i;
          dragOffsetRef.current = { dx: basePoint.x - r.x, dy: basePoint.y - r.y };
          // stop any draw-in-progress
          setIsDrawing(false);
          // set grabbing cursor
          if (dynamicCanvasRef.current) dynamicCanvasRef.current.style.cursor = "grabbing";
          // prevent e.g., page scrolling on touch
          if (originalEvent && originalEvent.preventDefault) originalEvent.preventDefault();
          return true;
        }
      }
    }

    // otherwise fallback to drawing behavior (existing handleMouseDown)
    // Only start drawing if the rectangle tool is active.
    if (selectedTool === "rectangle") {
      setIsDrawing(true);
      startPoint.current = basePoint;
      return false;
    }

    // If another tool (e.g., move) is active, do not start drawing.
    return false;
  };

  /**
   * handleMouseMove
   * - Si NO estamos dibujando: detecta si el mouse está sobre algún rectángulo
   *   y actualiza hoveredRectIndex.
   * - Si estamos dibujando: limpia la capa dinámica y dibuja el rectángulo provisional
   *   transformando correctamente las esquinas aplicando la rotación.
   *
   * Nota: aquí usamos requestAnimationFrame para el trazo en pantalla. Si hay muchos
   * rectángulos o eventos, puede ser costoso; se puede throttlear o usar un quadtree.
   */
  const handleMouseMove = (e) => {
    const rect = dynamicCanvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Si NO estamos en modo dibujo, solo actualizamos hovered
    // If we're currently dragging an existing rectangle, handle that
    if (draggingIndexRef.current !== null && selectedTool === "move") {
      const dragIdx = draggingIndexRef.current;
      const baseCurrent = rotatePoint(mouseX, mouseY, -rotation, dynamicCanvasRef.current.width / 2, dynamicCanvasRef.current.height / 2);
      const dx = baseCurrent.x - dragOffsetRef.current.dx;
      const dy = baseCurrent.y - dragOffsetRef.current.dy;

      // clamp to canvas bounds
      const maxW = dynamicCanvasRef.current.width;
      const maxH = dynamicCanvasRef.current.height;

      setRectangles((prev) => {
        return prev.map((r, i) => {
          if (i !== dragIdx) return r;
          const w = r.w;
          const h = r.h;
          const nx = Math.max(0, Math.min(dx, maxW - w));
          const ny = Math.max(0, Math.min(dy, maxH - h));
          return { ...r, x: nx, y: ny };
        });
      });

      return; // nothing more to draw
    }

    if (!isDrawing) {
      return; // no drawing in progress and not dragging
    }

    // Si llegamos aquí es porque isDrawing === true (estamos arrastrando para crear un rectángulo)
    const cx = dynamicCanvasRef.current.width / 2;
    const cy = dynamicCanvasRef.current.height / 2;
    // "Des-rotamos" la posición actual del mouse para calcular coordenadas del rect en sistema original
    const current = rotatePoint(mouseX, mouseY, -rotation, cx, cy);

    const ctx = dynamicCanvasRef.current.getContext("2d");
    // Limpiamos la capa dinámica para dibujar solo el rectángulo en curso
    ctx.clearRect(0, 0, dynamicCanvasRef.current.width, dynamicCanvasRef.current.height);

    // Usamos requestAnimationFrame para sincronizar el dibujo con el repaint del navegador.
    requestAnimationFrame(() => {
      ctx.save();
      ctx.strokeStyle = "green";
      ctx.lineWidth = 2;

      // Reconstruimos las 4 esquinas aplicando rotación POSITIVA para dibujarlas en pantalla
      const p1 = rotatePoint(startPoint.current.x, startPoint.current.y, rotation, cx, cy);
      const p2 = rotatePoint(current.x, startPoint.current.y, rotation, cx, cy);
      const p3 = rotatePoint(current.x, current.y, rotation, cx, cy);
      const p4 = rotatePoint(startPoint.current.x, current.y, rotation, cx, cy);

      // Dibujamos el polígono de vista previa
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.lineTo(p4.x, p4.y);
      ctx.closePath();
      ctx.stroke();

      ctx.restore();
    });
  };

  /**
   * handleMouseUp
   * - Finaliza el dibujo si corresponde.
   * - Convierte las coordenadas finales (des-rotadas) en un objeto rect {x,y,w,h}
   *   y lo añade al estado global de rectángulos con setRectangles.
   */

  const handleMouseUp = (e) => {
    const MIN_SIZE = 10;

    // If we were dragging a rectangle, finish drag
    if (draggingIndexRef.current !== null) {
      draggingIndexRef.current = null;
      // restore cursor
      if (dynamicCanvasRef.current) dynamicCanvasRef.current.style.cursor = selectedTool === "move" ? "grab" : "auto";
      // ensure dynamic layer cleared
      const ctx = dynamicCanvasRef.current.getContext("2d");
      ctx.clearRect(0, 0, dynamicCanvasRef.current.width, dynamicCanvasRef.current.height);
      return;
    }

    if (!isDrawing) return; // si no estamos dibujando, nada que hacer
    setIsDrawing(false);

    const rect = dynamicCanvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const cx = dynamicCanvasRef.current.width / 2;
    const cy = dynamicCanvasRef.current.height / 2;

    // Des-rotamos el punto final para obtener coordenadas consistentes con startPoint
    const end = rotatePoint(mouseX, mouseY, -rotation, cx, cy);
    // Obtenemos las dimensiones reales de la página actual
    const { width: pageWidth, height: pageHeight } = pageSizes.current[pageNumber] || {};

    // Creamos el rectángulo normalizando x,y para que x,y sean la esquina superior izquierda
    const newRect = {
      page: pageNumber,
      x: Math.min(startPoint.current.x, end.x) / scale,
      y: Math.min(startPoint.current.y, end.y) / scale,
      w: Math.abs(end.x - startPoint.current.x) / scale,
      h: Math.abs(end.y - startPoint.current.y) / scale,
      pageWidth,
      pageHeight,
      rotation,
    };
    // ✅ Validación de tamaño mínimo
    if (newRect.w >= MIN_SIZE && newRect.h >= MIN_SIZE) {
      setRectangles((prev) => [...prev, newRect]);
    } else {
      console.log("Rectángulo demasiado pequeño, ignorado");
    }

    // Limpiamos la capa dinámica (boleta de dibujo en progreso)
    const ctx = dynamicCanvasRef.current.getContext("2d");
    ctx.clearRect(0, 0, dynamicCanvasRef.current.width, dynamicCanvasRef.current.height);
  };

  /* ==========================
     Drag / move support refs
     ========================== */
  const draggingIndexRef = useRef(null);
  const dragOffsetRef = useRef({ dx: 0, dy: 0 });

  // helper: test point inside axis-aligned rect in base (unrotated) coords
  const pointInRect = (x, y, r) => {
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  };



  // Wrap existing mouse handlers to use pointer abstraction
  const wrappedMouseDown = (e) => handlePointerDown(e.clientX, e.clientY, e);
  const wrappedTouchStart = (e) => {
    if (!e.touches || e.touches.length === 0) return;
    const t = e.touches[0];
    // prevent scroll when interacting
    e.preventDefault();
    handlePointerDown(t.clientX, t.clientY, e);
  };

  const wrappedTouchMove = (e) => {
    if (!e.touches || e.touches.length === 0) return;
    const t = e.touches[0];
    // emulate mouse move
    handleMouseMove({ clientX: t.clientX, clientY: t.clientY });
    e.preventDefault();
  };

  const wrappedTouchEnd = (e) => {
    // emulate mouse up
    handleMouseUp(e.changedTouches ? e.changedTouches[0] : e);
  };

  // update cursor affordance when selectedTool changes
  useEffect(() => {
    if (!dynamicCanvasRef.current) return;
    dynamicCanvasRef.current.style.cursor = selectedTool === "move" ? "grab" : "auto";
  }, [selectedTool]);

  // Render del DOM: 3 canvases superpuestos (base, estático, dinámico)
  // Obtenemos las dimensiones de la página actual (si existen)
  const pageSize = pageSizes.current[pageNumber] || { width: 0, height: 0 };
  const maxSize = Math.max(pageSize.width, pageSize.height) || 800; // 800px como fallback



  return (
    <div
      id="xxx"
      data-page={pageNumber}
      style={{ position: "relative", display: "flex", justifyContent: "center", width: `100%` }}
    >
      <div style={{
        width: `${maxSize}px`,
        height: `${maxSize}px`,
        position: "relative",
        border: "1px solid #a7d7ff",
        background: "#a7d7ff",

      }}>
        {/* Canvas principal que contiene la página renderizada */}
        <canvas ref={canvasRef} style={{ position: "absolute", top: 0, left: 0 }} />

        {/* Capa estática para rectángulos persistentes */}
        <canvas ref={staticCanvasRef} style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }} />

        {/* Capa dinámica para interacción */}
        <canvas
          ref={dynamicCanvasRef}
          onMouseDown={wrappedMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onTouchStart={wrappedTouchStart}
          onTouchMove={wrappedTouchMove}
          onTouchEnd={wrappedTouchEnd}
          style={{ position: "absolute", top: 0, left: 0, pointerEvents: "auto", cursor: selectedTool === "move" ? "grab" : "auto" }}
        />

        {/* Mensaje de carga centrado con las mismas dimensiones que el canvas */}
        {!rendered && (
          <div style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",

            color: "#666",
            fontSize: "1.2rem"
          }}>
            Cargando página {pageNumber}...
          </div>
        )}
      </div>
    </div>
  );
}
