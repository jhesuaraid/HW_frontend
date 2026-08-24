import React from "react";
import PDF from "@/components/pdf.jsx";

/**
 * PDF Show - Portfolio Live Showcase Route (/pdf_show)
 * Designed to showcase full PDF editing & annotation extraction features
 * preloaded with a demo document and interactive bounding boxes.
 */
export default function PDF_Show() {
    // Initial sample bounding boxes to immediately showcase annotation capabilities to employers/recruiters
    const sampleRectangles = [
        {
            page: 1,
            x: 50,
            y: 40,
            w: 510,
            h: 60,
            rotation: 0,
            pageWidth: 612,
            pageHeight: 792
        },
        {
            page: 1,
            x: 50,
            y: 110,
            w: 480,
            h: 110,
            rotation: 0,
            pageWidth: 612,
            pageHeight: 792
        },
        {
            page: 2,
            x: 50,
            y: 40,
            w: 512,
            h: 140,
            rotation: 0,
            pageWidth: 612,
            pageHeight: 792
        }
    ];

    return (
        <div className="w-full min-h-screen bg-slate-100">
            <PDF
                staticPdfUrl="/portfolio_demo.pdf"
                defaultFileName="Portfolio_Demo_Document.pdf"
                initialRectangles={sampleRectangles}
                isPortfolioMode={true}
            />
        </div>
    );
}
