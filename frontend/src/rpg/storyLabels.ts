/** Labels sequential story beats as PAGE.0001 (not CH.01). */

export const formatStoryPageLabel = (page: number): string =>
  `PAGE.${Math.max(1, Math.floor(page)).toString().padStart(4, "0")}`;

/** Remove legacy CH.xx / PAGE.xx prefixes from sheet titles for clean display. */
export const stripLegacyChapterPrefix = (title: string): string =>
  title
    .replace(/^CH\.?\d+\s*/i, "")
    .replace(/^PAGE\.?\d+\s*/i, "")
    .trim();

export const formatStorySceneTitle = (page: number, rawTitle?: string): string => {
  const label = formatStoryPageLabel(page);
  const rest = rawTitle ? stripLegacyChapterPrefix(rawTitle) : "";
  return rest ? `${label} ${rest}` : label;
};
