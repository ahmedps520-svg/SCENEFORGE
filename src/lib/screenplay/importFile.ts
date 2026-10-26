import { parseFdx } from './fdx';
import { parseFountain, type ParsedScreenplay } from './fountain';

export const SCREENPLAY_ACCEPT = '.fountain,.spmd,.txt,.fdx,text/plain,application/xml';
export const SCREENPLAY_FORMATS_TEXT = 'Fountain (.fountain, .spmd), plain text (.txt) or Final Draft (.fdx), up to 10 MB';
const MAX_BYTES = 10 * 1024 * 1024;

/** Read a screenplay file into elements. Throws a user-facing message on failure. */
export async function parseScreenplayFile(file: File): Promise<ParsedScreenplay & { format: 'fountain' | 'fdx' }> {
  if (file.size > MAX_BYTES) throw new Error(`“${file.name}” is larger than 10 MB, which is far bigger than any screenplay.`);
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf')) throw new Error('PDF screenplays can’t be imported yet. Export Fountain or Final Draft (.fdx) from your writing app instead.');
  if (name.endsWith('.docx') || name.endsWith('.doc')) throw new Error('Word documents can’t be imported. Save the script as plain text or Fountain and try again.');
  const text = await file.text();
  if (name.endsWith('.fdx') || /^\s*<\?xml[\s\S]{0,200}<FinalDraft/i.test(text)) {
    return { ...parseFdx(text), format: 'fdx' };
  }
  const parsed = parseFountain(text);
  if (!parsed.elements.length) throw new Error('No screenplay content was found in this file.');
  return { ...parsed, format: 'fountain' };
}
