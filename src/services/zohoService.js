export async function recordZohoPdf({ fileName, size, mimeType, url }) {
  return { zohoRecordId: `ZHO_${Date.now()}` };
}
