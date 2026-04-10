import { fetchAllPages } from "./fetchAllPages";


export async function getProducts(): Promise<Product[]> {
  return fetchAllPages<Product>('/products', 250);
}