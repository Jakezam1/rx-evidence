export function chunkText(text: string): { id: string; text: string }[] {
  return text
    .split("\n\n")
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length >= 50)
    .map((chunk, index) => ({
      id: `chunk_${index}`,
      text: chunk,
    }));
}
