/**
 * generateDocxFromImages.js
 *
 * Genera un archivo DOCX directamente en el navegador a partir de blobs de imágenes,
 * replicando la misma estructura que producía el backend Django (views.py / TestView).
 *
 * Usa la librería `docx` (https://docxjs.com) que corre 100% en el cliente.
 * No requiere ningún servidor.
 */

import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  ImageRun,
  TextRun,
  AlignmentType,
  WidthType,
  HeightRule,
  TableLayoutType,
  VerticalAlign,
  PageOrientation,
  ShadingType,
} from "docx";

// ─────────────────────────────────────────────
// Constantes de maquetación (equivalentes al backend)
// ─────────────────────────────────────────────
const PAGE_WIDTH_EMU = 7_560_000;   // 8.27 in × 914400 EMU/in  (A4 ancho)
const PAGE_HEIGHT_EMU = 10_692_000; // 11.69 in × 914400 EMU/in (A4 alto)

const IN = (inches) => Math.round(inches * 914400); // pulgadas → EMU
const CM = (cm) => Math.round(cm * 360000);          // centímetros → EMU
const PT = (pt) => Math.round(pt * 12700);           // puntos → EMU

const COLORS = [
  "F1F2F2", "F2F2F2", "F3F2F2",
  "DAEEF3", "DAEEF4", "B6DDE8",
  "B6DDE7", "92CDDC",
];

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/**
 * Convierte un Blob de imagen a ArrayBuffer (necesario para ImageRun).
 */
async function blobToArrayBuffer(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsArrayBuffer(blob);
  });
}

/**
 * Calcula dimensiones de la imagen en EMU respetando los márgenes de página,
 * sin escalar hacia arriba (solo scale-down si excede el máximo).
 *
 * max_width_in = 7.27 in, max_height_in = 7.27 in, dpi = 96
 */
function calcImageDimensions(naturalW, naturalH) {
  const MAX_W_PX = 7.27 * 96;
  const MAX_H_PX = 7.27 * 96;
  const scale = Math.min(MAX_W_PX / naturalW, MAX_H_PX / naturalH, 1.0);
  const finalWIn = (naturalW * scale) / 96;
  const finalHIn = (naturalH * scale) / 96;
  return {
    width: Math.round(finalWIn * 914400),
    height: Math.round(finalHIn * 914400),
  };
}

/**
 * Obtiene dimensiones naturales de una imagen desde su Blob.
 */
async function getImageNaturalSize(blob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      resolve({ w: img.naturalWidth, h: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve({ w: 200, h: 200 }); // fallback
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

// ─────────────────────────────────────────────
// Construcción de la página de portada / encabezado
// (equivale al primer bloque de views.py)
// ─────────────────────────────────────────────

function buildCoverTable() {
  const introText =
    "Dear translator, before commencing work, kindly consider the following considerations.\n\n" +
    "Images are used to facilitate the translation of the target text in this template, which is based on the original PDF. " +
    "If you come across typed text (ink) next to handwritten text (pen), just translate the handwritten text; sometimes the typed text will be added to provide context.\n\n" +
    "Mark as [Illegible] the handwritten text that you find difficult to read; try to make the separation of paragraphs localizable with some element " +
    "(hours in case they appear in the PDF, a space between paragraphs or dashes) to allow us to implement it in the final file and try to highlight in yellow the text that you consider needs a second opinion.\n\n" +
    "Finally, please note that although this file is not the TRADOS version, the translation will eventually be added to a final file, so please continue to use the \"Style Guides for Vendors\" from The Language Doctors.\n\n" +
    "Your support for the QC-PT handwritten team is greatly appreciated. If you have any feedback, please let to the Project Manager know.";

  // Fila 1 — Título principal (merged, 5.75 cm de alto)
  const row1 = new TableRow({
    height: { value: CM(5.75), rule: HeightRule.EXACT },
    children: [
      new TableCell({
        columnSpan: 3,
        verticalAlign: VerticalAlign.CENTER,
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: "MEDICAL DOCUMENT\nTRANSLATION ATTESTATION",
                bold: true,
                size: PT(18) / 635, // docx size = half-points
                font: "Arial",
                break: 1,
              }),
            ],
          }),
        ],
      }),
    ],
  });

  // Fila 2 — Texto de introducción (merged)
  const row2 = new TableRow({
    children: [
      new TableCell({
        columnSpan: 3,
        children: [
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            indent: { left: CM(1), right: CM(1) },
            children: [
              new TextRun({ text: introText, size: 20, font: "Arial" }),
            ],
          }),
        ],
      }),
    ],
  });

  // Fila 3 — Espacio (1.75 cm)
  const row3 = new TableRow({
    height: { value: CM(1.75), rule: HeightRule.EXACT },
    children: [
      new TableCell({ columnSpan: 3, children: [new Paragraph({})] }),
    ],
  });

  // Filas 4-6 — Firmas / fechas (2.2 cm)
  const sigRow = new TableRow({
    height: { value: CM(2.2), rule: HeightRule.EXACT },
    children: [
      new TableCell({
        width: { size: CM(5.24), type: WidthType.DXA },
        children: [new Paragraph({})],
      }),
      new TableCell({
        width: { size: CM(8.75), type: WidthType.DXA },
        children: [
          new Paragraph({
            children: [
              new TextRun({ text: "Signature of Certifying* Linguist", size: 12, font: "Arial" }),
            ],
          }),
        ],
      }),
      new TableCell({
        width: { size: CM(5.04), type: WidthType.DXA },
        children: [new Paragraph({})],
      }),
    ],
  });

  const nameRow = new TableRow({
    children: [
      new TableCell({ children: [new Paragraph({})] }),
      new TableCell({
        children: [
          new Paragraph({
            children: [new TextRun({ text: "Full Name of Certifying Linguist:", size: 20, font: "Arial" })],
          }),
        ],
      }),
      new TableCell({ children: [new Paragraph({})] }),
    ],
  });

  const dateRow = new TableRow({
    children: [
      new TableCell({ children: [new Paragraph({})] }),
      new TableCell({
        children: [
          new Paragraph({
            children: [new TextRun({ text: "Date:", size: 20, font: "Arial" })],
          }),
        ],
      }),
      new TableCell({ children: [new Paragraph({})] }),
    ],
  });

  // Fila 7 — Nota de certificación (1.17 cm)
  const noteRow = new TableRow({
    height: { value: CM(1.17), rule: HeightRule.EXACT },
    children: [
      new TableCell({
        columnSpan: 3,
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: "*Certifying linguist must be a second level reviewer. The original translator cannot certify.",
                size: 12,
                font: "Arial",
              }),
            ],
          }),
        ],
      }),
    ],
  });

  // Fila 8 — Logo / espacio inferior (5.75 cm)
  const logoRow = new TableRow({
    height: { value: CM(5.75), rule: HeightRule.EXACT },
    children: [
      new TableCell({ columnSpan: 3, children: [new Paragraph({})] }),
    ],
  });

  return new Table({
    layout: TableLayoutType.FIXED,
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [row1, row2, row3, sigRow, nameRow, dateRow, noteRow, logoRow],
  });
}

// ─────────────────────────────────────────────
// Construir tabla de contenido para una página PDF
// (equivale al bloque for-loop de views.py)
// ─────────────────────────────────────────────

async function buildPageContentTable(pageNumber, images) {
  // Fila de encabezado de color
  const headerCells = COLORS.map((color, i) => {
    let text = "";
    if (i === 0) text = "Page:";
    else if (i === 4) text = String(pageNumber);
    else if (i === 7) text = "Tra:";

    return new TableCell({
      shading: { type: ShadingType.CLEAR, fill: color },
      children: [
        new Paragraph({
          children: [new TextRun({ text, size: 18, font: "Arial" })],
        }),
      ],
    });
  });

  const headerRow = new TableRow({ children: headerCells });
  const rows = [headerRow];

  for (const item of images) {
    // Obtener dimensiones naturales del Blob
    const { w, h } = await getImageNaturalSize(item.blob);
    const { width: emuW, height: emuH } = calcImageDimensions(w, h);

    const imgBuffer = await blobToArrayBuffer(item.blob);

    // Fila con imagen (celdas combinadas → columnSpan 8)
    const imageRow = new TableRow({
      children: [
        new TableCell({
          columnSpan: 8,
          children: [
            new Paragraph({
              spacing: { before: 0, after: 0 },
              children: [
                new ImageRun({
                  data: imgBuffer,
                  transformation: { width: emuW / 9144, height: emuH / 9144 }, // EMU → puntos (docx usa twips, pero ImageRun acepta px via transformation)
                  type: "png",
                }),
              ],
            }),
          ],
        }),
      ],
    });

    // Fila vacía de separación (igual al backend)
    const spacerRow = new TableRow({
      children: [
        new TableCell({
          columnSpan: 8,
          children: [new Paragraph({})],
        }),
      ],
    });

    rows.push(imageRow, spacerRow);
  }

  return new Table({
    layout: TableLayoutType.FIXED,
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows,
  });
}

// ─────────────────────────────────────────────
// Función principal exportable
// ─────────────────────────────────────────────

/**
 * Genera y descarga un archivo DOCX a partir de un array de blobs de imágenes,
 * replicando la estructura del backend Django.
 *
 * @param {Array<{blob: Blob, page: number, index: number}>} imagesToRender
 * @param {string} fileName - Nombre base del archivo (sin extensión)
 */
export async function generateAndDownloadDocx(imagesToRender, fileName = "document") {
  // Agrupar imágenes por página (igual que pages = defaultdict(list) en Python)
  const pages = {};
  for (const item of imagesToRender) {
    const p = item.page;
    if (!pages[p]) pages[p] = [];
    pages[p].push(item);
  }

  const sortedPageNumbers = Object.keys(pages).map(Number).sort((a, b) => a - b);

  // ── Construir secciones del documento ──
  const docSections = [];

  // Sección 1: portada
  const coverSection = {
    properties: {
      page: {
        size: {
          width: PAGE_WIDTH_EMU,
          height: PAGE_HEIGHT_EMU,
          orientation: PageOrientation.PORTRAIT,
        },
        margin: {
          left: IN(0.5),
          right: IN(0.3),
          top: IN(0.3),
          bottom: IN(0.3),
        },
      },
    },
    children: [buildCoverTable()],
  };

  docSections.push(coverSection);

  // Secciones de contenido: una por página PDF
  for (let i = 0; i < sortedPageNumbers.length; i++) {
    const pageNumber = sortedPageNumbers[i];
    const imgs = pages[pageNumber];

    const contentTable = await buildPageContentTable(pageNumber, imgs);

    const contentSection = {
      properties: {
        page: {
          size: {
            width: PAGE_WIDTH_EMU,
            height: PAGE_HEIGHT_EMU,
            orientation: PageOrientation.PORTRAIT,
          },
          margin: {
            left: IN(0.5),
            right: IN(0.3),
            top: IN(0.3),
            bottom: IN(0.3),
          },
        },
      },
      children: [contentTable],
    };

    docSections.push(contentSection);
  }

  // ── Crear documento ──
  const doc = new Document({ sections: docSections });

  // ── Serializar a Blob y descargar ──
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${fileName}.docx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
