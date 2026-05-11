import { useEffect, useState } from "react";
import { pdfjs } from "react-pdf";

const categoryColor = {
  primary_outcome: "bg-emerald-300/60",
  secondary_outcome: "bg-emerald-200/60",
  methods: "bg-sky-300/60",
  population: "bg-sky-300/60",
  context: "bg-sky-200/60",
  bias: "bg-amber-300/60",
  generalizability: "bg-amber-200/60",
  safety: "bg-rose-300/60"
};

const PAGE_GAP_PX = 12;
const RENDER_WIDTH = 700;

function normalizeText(value) {
  return (value || "")
    .toLowerCase()
    .replace(/[–—−]/g, "-")
    .replace(/[^a-z0-9%<>=.\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function guessPagesFromHints(sourcePassages, totalPages) {
  const pages = [];
  sourcePassages.forEach((passage) => {
    const hint = passage?.pageHint || "";
    const match = hint.match(/(\d+)/);
    if (match) {
      const n = Number(match[1]);
      if (n >= 1 && n <= totalPages) pages.push(n);
    }
  });
  return [...new Set(pages)];
}

function tokenize(value) {
  return normalizeText(value)
    .split(" ")
    .filter(Boolean);
}

function scoreTokenOverlap(aTokens, bTokens) {
  if (!aTokens.length || !bTokens.length) return 0;
  const aSet = new Set(aTokens);
  const bSet = new Set(bTokens);
  let intersection = 0;
  aSet.forEach((t) => {
    if (bSet.has(t)) intersection += 1;
  });
  return intersection / Math.max(aSet.size, bSet.size);
}

function buildNgramCandidates(targetTokens) {
  const candidates = [];
  const maxN = Math.min(18, targetTokens.length);
  const minN = Math.min(6, targetTokens.length);
  for (let n = maxN; n >= minN; n -= 1) {
    for (let i = 0; i <= targetTokens.length - n; i += Math.max(1, Math.floor(n / 3))) {
      const gram = targetTokens.slice(i, i + n).join(" ");
      candidates.push(gram);
      if (candidates.length >= 20) return candidates;
    }
  }
  return candidates;
}

export function useHighlightSync(findings, pdfFile) {
  const [state, setState] = useState({
    findingToHighlights: {},
    highlightToFinding: {}
  });

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!pdfFile || !findings?.length) {
        setState({ findingToHighlights: {}, highlightToFinding: {} });
        return;
      }

      const fileSrc =
        typeof pdfFile === "string" ? pdfFile : URL.createObjectURL(pdfFile);

      try {
        const pdfDoc = await pdfjs.getDocument(fileSrc).promise;
        const pageCache = {};
        const pageHeights = [];

        for (let p = 1; p <= pdfDoc.numPages; p += 1) {
          const page = await pdfDoc.getPage(p);
          const viewport = page.getViewport({ scale: 1 });
          const scale = RENDER_WIDTH / viewport.width;
          const textContent = await page.getTextContent();

          const items = textContent.items.map((item) => {
            const norm = normalizeText(item.str);
            return { ...item, norm };
          });

          let joined = "";
          const ranges = [];
          items.forEach((item, idx) => {
            const start = joined.length;
            joined += `${item.norm} `;
            const end = joined.length;
            ranges.push({ idx, start, end });
          });

          pageHeights[p] = viewport.height * scale;
          pageCache[p] = {
            page,
            viewport,
            scale,
            items,
            joined,
            ranges
          };
        }

        const getPageTopOffset = (pageNumber) => {
          let top = 0;
          for (let i = 1; i < pageNumber; i += 1) {
            top += (pageHeights[i] || 0) + PAGE_GAP_PX;
          }
          return top;
        };

        const findingToHighlights = {};
        const highlightToFinding = {};

        findings.forEach((finding) => {
          const color = categoryColor[finding.category] || "bg-gray-200/60";
          const rects = [];
          const passages = finding.sourcePassages || [];
          const hintedPages = guessPagesFromHints(passages, pdfDoc.numPages);
          const pagesToSearch =
            hintedPages.length > 0
              ? hintedPages
              : Array.from({ length: pdfDoc.numPages }, (_, i) => i + 1);

          passages.forEach((source, sourceIndex) => {
            const target = normalizeText(source.text);
            if (!target) return;
            const targetTokens = tokenize(target);

            let found = null;
            for (const pageNum of pagesToSearch) {
              const pageData = pageCache[pageNum];
              const startIdx = pageData.joined.indexOf(target);
              if (startIdx >= 0) {
                found = { pageNum, startIdx, endIdx: startIdx + target.length };
                break;
              }
            }

            // Try exact partial n-gram anchoring before fuzzy matching.
            if (!found && targetTokens.length >= 6) {
              const grams = buildNgramCandidates(targetTokens);
              const candidatePages =
                pagesToSearch.length > 0
                  ? pagesToSearch
                  : Array.from({ length: pdfDoc.numPages }, (_, i) => i + 1);

              for (const pageNum of candidatePages) {
                const pageData = pageCache[pageNum];
                let matched = false;
                for (const gram of grams) {
                  const startIdx = pageData.joined.indexOf(gram);
                  if (startIdx >= 0) {
                    found = {
                      pageNum,
                      startIdx,
                      endIdx: startIdx + gram.length,
                      partial: true
                    };
                    matched = true;
                    break;
                  }
                }
                if (matched) break;
              }
            }

            // If exact matching fails (often due to line breaks/hyphenation),
            // run a fuzzy token-window match across hinted pages then all pages.
            if (!found) {
              const candidates =
                pagesToSearch.length > 0
                  ? pagesToSearch
                  : Array.from({ length: pdfDoc.numPages }, (_, i) => i + 1);
              const backupPages = Array.from({ length: pdfDoc.numPages }, (_, i) => i + 1);
              const allCandidatePages = [...new Set([...candidates, ...backupPages])];

              let best = null;
              allCandidatePages.forEach((pageNum) => {
                const pageData = pageCache[pageNum];
                const items = pageData.items.filter((it) => it.norm);
                if (!items.length) return;
                const windowSize = Math.min(
                  items.length,
                  Math.max(8, Math.round(targetTokens.length * 1.8))
                );
                for (let i = 0; i < items.length; i += 1) {
                  const slice = items.slice(i, i + windowSize);
                  const sliceTokens = tokenize(slice.map((s) => s.norm).join(" "));
                  const score = scoreTokenOverlap(targetTokens, sliceTokens);
                  if (!best || score > best.score) {
                    best = {
                      pageNum,
                      score,
                      startItem: i,
                      endItem: i + slice.length - 1
                    };
                  }
                }
              });

              if (best && best.score >= 0.32) {
                found = {
                  pageNum: best.pageNum,
                  startItem: best.startItem,
                  endItem: best.endItem,
                  fuzzy: true
                };
              }
            }

            if (!found) return;

            const pageData = pageCache[found.pageNum];
            const matchedItems = found.fuzzy
              ? pageData.items.slice(found.startItem, found.endItem + 1)
              : pageData.ranges
                  .filter((r) => !(r.end < found.startIdx || r.start > found.endIdx))
                  .map((r) => pageData.items[r.idx]);

            const pageTop = getPageTopOffset(found.pageNum);
            matchedItems.forEach((item, i) => {
              const x = item.transform[4] * pageData.scale;
              const y =
                (pageData.viewport.height - (item.transform[5] + item.height)) *
                pageData.scale;
              const width = Math.max(10, (item.width || 20) * pageData.scale);
              const height = Math.max(10, item.height * pageData.scale);
              const id = `hl-${finding.id}-${sourceIndex}-${i}`;
              const rect = {
                id,
                findingId: finding.id,
                page: found.pageNum,
                top: pageTop + y,
                left: x,
                width,
                height,
                color,
                source
              };
              rects.push(rect);
              highlightToFinding[id] = finding.id;
            });
          });

          findingToHighlights[finding.id] = rects;
        });

        if (!cancelled) setState({ findingToHighlights, highlightToFinding });
      } catch (_err) {
        if (!cancelled) setState({ findingToHighlights: {}, highlightToFinding: {} });
      } finally {
        if (typeof pdfFile !== "string") URL.revokeObjectURL(fileSrc);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [findings, pdfFile]);

  return { ...state, categoryColor };
}
