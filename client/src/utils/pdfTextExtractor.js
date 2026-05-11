export async function extractSectionsFromPdf(file) {
  const fallback = "Unable to extract raw section text locally; analyzing available file metadata.";
  const baseText = file?.name ? `Uploaded file: ${file.name}. ${fallback}` : fallback;

  return [
    { sectionName: "Abstract", text: baseText },
    { sectionName: "Introduction", text: baseText },
    { sectionName: "Methods", text: baseText },
    { sectionName: "Results", text: baseText },
    { sectionName: "Discussion", text: baseText }
  ];
}
