/**
 * generateDocx.js
 *
 * Genera un archivo DOCX directamente en el navegador a partir de blobs de imagenes,
 * replicando la misma estructura que produce el backend Django (views.py / TestView).
 *
 * Usa la libreria `docx` v9 (https://docx.js.org) que corre 100% en el cliente.
 * No requiere ningun servidor.
 *
 * ─── UNIDADES de la libreria docx v9 ────────────────────────────────────────
 *  page.size / page.margin  → DXA (twips): 1 pulgada = 1440 twips
 *  TableRow height.value    → DXA (twips): 1 cm ≈ 567 twips
 *  TableCell width.size     → DXA (twips): 1 cm ≈ 567 twips
 *  TextRun size             → half-points: 1 pt = 2 half-points
 *  indent left/right        → DXA (twips): 1 cm ≈ 567 twips
 *  ImageRun transformation  → pixels directamente
 * ────────────────────────────────────────────────────────────────────────────
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
// Conversores de unidades
// ─────────────────────────────────────────────

/** Pulgadas → DXA (twips). 1 in = 1440 DXA. */
const IN = (inches) => Math.round(inches * 1440);

/** Centimetros → DXA (twips). 1 cm ≈ 567.17 twips. */
const CM = (cm) => Math.round(cm * 567.17);

/**
 * Puntos → half-points (unidad `size` de TextRun en docx JS).
 * 1 pt = 2 half-points. Equivale a Pt() de python-docx.
 *   Pt(18) → HP(18) = 36
 *   Pt(10) → HP(10) = 20
 *   Pt(6)  → HP(6)  = 12
 */
const HP = (pt) => pt * 2;

// Dimensiones de pagina A4 en DXA
const PAGE_WIDTH_DXA  = IN(8.27);   // 11908 DXA
const PAGE_HEIGHT_DXA = IN(11.69);  // 16834 DXA

// Margenes en DXA (equivale a Inches() de python-docx)
const MARGIN_LEFT   = IN(0.5);  // 720  DXA
const MARGIN_RIGHT  = IN(0.3);  // 432  DXA
const MARGIN_TOP    = IN(0.3);  // 432  DXA
const MARGIN_BOTTOM = IN(0.3);  // 432  DXA

const COLORS = [
  "F1F2F2", "F2F2F2", "F3F2F2",
  "DAEEF3", "DAEEF4", "B6DDE8",
  "B6DDE7", "92CDDC",
];

// ─────────────────────────────────────────────
// Helpers de imagen
// ─────────────────────────────────────────────

/** Convierte un Blob de imagen a ArrayBuffer (necesario para ImageRun). */
async function blobToArrayBuffer(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsArrayBuffer(blob);
  });
}

/**
 * Detecta el tipo de imagen a partir del MIME type del Blob.
 * ImageRun acepta: "png" | "jpg" | "gif" | "bmp"
 */
function getBlobImageType(blob) {
  const mime = blob.type || "";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("gif")) return "gif";
  if (mime.includes("bmp")) return "bmp";
  return "png";
}

/**
 * Calcula dimensiones finales de la imagen en pixeles para ImageRun.transformation.
 *
 * Replica prepare_image_for_word(max_width_in=7.27, max_height_in=7.27, dpi=96):
 *   scale = min(max_w_px / w, max_h_px / h, 1.0)
 *   final_w_in = (w * scale) / dpi
 *   final_h_in = (h * scale) / dpi
 *
 * ImageRun.transformation acepta pixeles directamente.
 */
function calcImageDimensions(naturalW, naturalH) {
  const DPI = 96;
  const MAX_W_PX = 7.27 * DPI; // 698 px
  const MAX_H_PX = 7.27 * DPI; // 698 px
  const scale = Math.min(MAX_W_PX / naturalW, MAX_H_PX / naturalH, 1.0);
  const finalWIn = (naturalW * scale) / DPI;
  const finalHIn = (naturalH * scale) / DPI;
  return {
    widthPx:  Math.round(finalWIn * DPI),
    heightPx: Math.round(finalHIn * DPI),
  };
}

/** Obtiene dimensiones naturales de una imagen desde su Blob. */
async function getImageNaturalSize(blob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      resolve({ w: img.naturalWidth, h: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve({ w: 200, h: 200 });
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

// ─────────────────────────────────────────────
// Tabla de portada (equivale al primer doc.add_table(rows=8, cols=3) en views.py)
// ─────────────────────────────────────────────

function buildCoverTable() {
  // Variable `text` de views.py
  const introText =
   "";

  // ── Fila 1: Titulo principal ──────────────────────────────────────────────
  // first_row.height = Cm(5.75)
  // first_cell.vertical_alignment = CENTER
  // first_p.alignment = CENTER
  // first_run = "MEDICAL DOCUMENT\nTRANSLATION ATTESTATION", bold, Pt(18), Arial
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
                text: "",
                bold: true,
                size: HP(18),
                font: "Arial",
              }),
              new TextRun({
                text: "",
                bold: true,
                size: HP(18),
                font: "Arial",
                break: 1,
              }),
            ],
          }),
        ],
      }),
    ],
  });

  // ── Fila 2: Texto introductorio ───────────────────────────────────────────
  // second_row.cells merged
  // second_p.alignment = JUSTIFY
  // second_p.paragraph_format.left_indent = Cm(1)
  // second_p.paragraph_format.right_indent = Cm(1)
  // second_run: text, Pt(10), Arial
  const row2 = new TableRow({
    children: [
      new TableCell({
        columnSpan: 3,
        children: [
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            indent: { left: CM(1), right: CM(1) },
            children: [
              new TextRun({ text: introText, size: HP(10), font: "Arial" }),
            ],
          }),
        ],
      }),
    ],
  });

  // ── Fila 3: Espacio vacio ────────────────────────────────────────────────
  // third_row.cells merged, height = Cm(1.75)
  const row3 = new TableRow({
    height: { value: CM(1.75), rule: HeightRule.EXACT },
    children: [
      new TableCell({ columnSpan: 3, children: [new Paragraph({})] }),
    ],
  });

  // ── Filas 4-6: Firma / Nombre / Fecha ────────────────────────────────────
  // fourth_row.height = Cm(2.2)
  // fourth_row.cells[0].merge(fifth_row.cells[0]).merge(sixth_row.cells[0])  → rowSpan: 3
  // fourth_row.cells[2].merge(fifth_row.cells[2]).merge(sixth_row.cells[2])  → rowSpan: 3
  // fourth_row.cells[0].width = Cm(5.24)
  // fourth_row.cells[1].width = Cm(8.75)
  // fourth_row.cells[2].width = Cm(5.04)
  // Col1/fila4: "Signature of Certifying* Linguist", Pt(6), vertical BOTTOM
  // Col1/fila5: "Full Name of Certifying Linguist:", Pt(10)
  // Col1/fila6: "Date:", Pt(10)
  const sigRow = new TableRow({
    height: { value: CM(2.2), rule: HeightRule.EXACT },
    children: [
      new TableCell({
        rowSpan: 3,
        width: { size: CM(5.24), type: WidthType.DXA },
        children: [new Paragraph({})],
      }),
      new TableCell({
        width: { size: CM(8.75), type: WidthType.DXA },
        verticalAlign: VerticalAlign.BOTTOM,
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: "",
                size: HP(6),
                font: "Arial",
              }),
            ],
          }),
        ],
      }),
      new TableCell({
        rowSpan: 3,
        width: { size: CM(5.04), type: WidthType.DXA },
        children: [new Paragraph({})],
      }),
    ],
  });

  const nameRow = new TableRow({
    children: [
      new TableCell({
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: "",
                size: HP(10),
                font: "Arial",
              }),
            ],
          }),
        ],
      }),
    ],
  });

  const dateRow = new TableRow({
    children: [
      new TableCell({
        children: [
          new Paragraph({
            children: [
              new TextRun({ text: "", size: HP(10), font: "Arial" }),
            ],
          }),
        ],
      }),
    ],
  });

  // ── Fila 7: Nota de certificacion ─────────────────────────────────────────
  // seventh_row.height = Cm(1.17), cells merged, alignment CENTER
  // "...", Pt(6), Arial
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
                text: "",
                size: HP(6),
                font: "Arial",
              }),
            ],
          }),
        ],
      }),
    ],
  });

  // ── Fila 8: Espacio inferior ──────────────────────────────────────────────
  // eighth_row.height = Cm(5.75), cells merged
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
// Tabla de contenido por pagina PDF
// Equivale al for-loop: doc.add_table(rows=1, cols=8) en views.py
// ─────────────────────────────────────────────

async function buildPageContentTable(pageNumber, images) {
  // Fila de encabezado coloreado (8 celdas con colores y textos)
  // for i, cell in enumerate(table.rows[0].cells): color + text
  const headerCells = COLORS.map((color, i) => {
    let text = "";
    if (i === 0) text = "Page:";
    else if (i === 4) text = String(pageNumber);
    else if (i === 7) text = "Tra:";

    return new TableCell({
      shading: { type: ShadingType.CLEAR, fill: color },
      children: [
        new Paragraph({
          children: [new TextRun({ text, size: HP(9), font: "Arial" })],
        }),
      ],
    });
  });

  const headerRow = new TableRow({ children: headerCells });
  const rows = [headerRow];

  // Por cada imagen: fila imagen + fila separadora vacia
  // for f in imgs:
  //   row = table.add_row().cells → merge 7 → add_picture(img_stream, width=Inches(w_in))
  //   cell_paragraph_format.space_before = Pt(0)
  //   cell_paragraph_format.space_after  = Pt(0)
  //   row = table.add_row().cells → merge 7 (vacia)
  for (const item of images) {
    const { w, h } = await getImageNaturalSize(item.blob);
    const { widthPx, heightPx } = calcImageDimensions(w, h);
    const imgBuffer = await blobToArrayBuffer(item.blob);
    const imgType   = getBlobImageType(item.blob);

    // Fila imagen (columnSpan 8 = todas las celdas combinadas)
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
                  transformation: { width: widthPx, height: heightPx },
                  type: imgType,
                }),
              ],
            }),
          ],
        }),
      ],
    });

    // Fila separadora vacia
    const spacerRow = new TableRow({
      children: [
        new TableCell({ columnSpan: 8, children: [new Paragraph({})] }),
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
// Funcion principal exportable
// ─────────────────────────────────────────────

/**
 * Genera y descarga un archivo DOCX a partir de un array de blobs de imagenes,
 * replicando la estructura del backend Django (TestView en views.py).
 *
 * @param {Array<{blob: Blob, page: number, index: number}>} imagesToRender
 * @param {string} fileName - Nombre base del archivo (sin extension)
 */
export async function generateAndDownloadDocx(imagesToRender, fileName = "document") {
  // Agrupar imagenes por pagina — equivale a pages = defaultdict(list)
  const pages = {};
  for (const item of imagesToRender) {
    const p = item.page;
    if (!pages[p]) pages[p] = [];
    pages[p].push(item);
  }

  const sortedPageNumbers = Object.keys(pages).map(Number).sort((a, b) => a - b);

  // Propiedades de pagina compartidas
  // Equivale a:
  //   section.page_width  = Inches(8.27)   → 11908 DXA
  //   section.page_height = Inches(11.69)  → 16834 DXA
  //   section.left_margin  = Inches(0.5)   → 720 DXA
  //   section.right_margin = Inches(0.3)   → 432 DXA
  //   section.top_margin   = Inches(0.3)   → 432 DXA
  //   section.bottom_margin= Inches(0.3)   → 432 DXA
  const pageProperties = {
    page: {
      size: {
        width:       PAGE_WIDTH_DXA,
        height:      PAGE_HEIGHT_DXA,
        orientation: PageOrientation.PORTRAIT,
      },
      margin: {
        left:   MARGIN_LEFT,
        right:  MARGIN_RIGHT,
        top:    MARGIN_TOP,
        bottom: MARGIN_BOTTOM,
      },
    },
  };

  const docSections = [];

  // Seccion 1: portada
  docSections.push({
    properties: pageProperties,
    children: [buildCoverTable()],
  });

  // Una seccion por pagina PDF (equivale al for-loop sobre sorted(pages.items()))
  for (let i = 0; i < sortedPageNumbers.length; i++) {
    const pageNumber = sortedPageNumbers[i];
    const imgs = pages[pageNumber];
    const contentTable = await buildPageContentTable(pageNumber, imgs);

    docSections.push({
      properties: pageProperties,
      children: [contentTable],
    });
  }

  // Crear documento y descargar
  const doc  = new Document({ sections: docSections });
  const blob = await Packer.toBlob(doc);
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `${fileName}.docx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}