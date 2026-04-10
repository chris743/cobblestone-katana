import { fetchAllPages } from "./fetchAllPages";

export async function getMaterials(): Promise<Material[]> {
  return fetchAllPages<Material>('/materials', 250);
}