import { fetchAllPages } from "./fetchAllPages";

export async function getVariants(): Promise<Variant[]> {
  return fetchAllPages<Variant>('/variants', 250);
}