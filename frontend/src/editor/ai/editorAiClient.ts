import axios from "axios";
import { getApiBaseUrl } from "../../apiBase";

const api = axios.create({
  baseURL: getApiBaseUrl()
});

export const generateRowsWithAi = async (sheet: string, prompt: string): Promise<string> => {
  const { data } = await api.post<{ preview: string }>("/editor/ai/generate-rows", { sheet, prompt });
  return data.preview;
};

export const assistCellWithAi = async (
  sheet: string,
  row: Record<string, unknown>,
  field: string,
  instruction: string
): Promise<string> => {
  const { data } = await api.post<{ suggestion: string }>("/editor/ai/assist-cell", {
    sheet,
    row,
    field,
    instruction
  });
  return data.suggestion;
};

