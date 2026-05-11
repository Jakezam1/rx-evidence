import { useEffect, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

export default function PDFViewer({
  file,
  highlights,
  onHighlightClick,
  selectedFindingId,
  highlightMode
}) {
  const [pdfError, setPdfError] = useState("");
  const [numPages, setNumPages] = useState(0);

  useEffect(() => {
    if (!selectedFindingId) return;
    const first = highlights.find((h) => h.findingId === selectedFindingId);
    if (!first) return;
    const node = document.getElementById(first.id);
    node?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [selectedFindingId, highlights]);

  return (
    <div className="relative h-full overflow-auto bg-white p-4">
      {!file ? (
        <div className="rounded border border-dashed border-gray-300 p-8 text-center text-gray-500">
          Upload a PDF to begin analysis.
        </div>
      ) : (
        <div className="relative mx-auto w-fit">
          {pdfError && (
            <div className="mb-3 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {pdfError}
            </div>
          )}
          <Document
            file={file}
            onLoadSuccess={(doc) => {
              setPdfError("");
              setNumPages(doc.numPages || 0);
            }}
            onLoadError={(error) => {
              setPdfError(`Failed to load PDF file. ${error?.message || "Unknown PDF error."}`);
            }}
          >
            {Array.from({ length: numPages }, (_, i) => (
              <div key={`page-${i + 1}`} className="mb-3">
                <Page pageNumber={i + 1} width={700} />
              </div>
            ))}
          </Document>
          {highlights
            .filter((h) => highlightMode || h.findingId === selectedFindingId)
            .map((h) => (
              <button
                key={h.id}
                id={h.id}
                onClick={() => onHighlightClick(h)}
                className={`absolute ${h.color} rounded-sm transition-all hover:ring-2 hover:ring-indigo-400 ${selectedFindingId === h.findingId ? "ring-2 ring-indigo-500" : ""}`}
                style={{ top: h.top, left: h.left, width: h.width, height: h.height }}
                title={h.source.text}
              />
            ))}
        </div>
      )}
    </div>
  );
}
